const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const Payment = require('../models/Payment');
const Order = require('../models/Order');
const { authMiddleware } = require('../middleware/auth');
const router = express.Router();

// -----------------------------
// Create Payment Intent
// -----------------------------
router.post('/create-payment-intent', authMiddleware, async (req, res) => {
  try {
    console.log('📝 Creating payment intent for user:', req.user._id);
    const { orderId, paymentMethodType = 'card' } = req.body;
    const user = req.user;

    if (user.userType !== 'customer') {
      console.log('❌ Access denied: User is not a customer');
      return res.status(403).json({ message: 'Only customers can make payments' });
    }

    const order = await Order.findById(orderId)
      .populate('restaurant')
      .populate('customer', 'name email');

    if (!order) {
      console.log('❌ Order not found:', orderId);
      return res.status(404).json({ message: 'Order not found' });
    }

    if (order.customer._id.toString() !== user._id.toString()) {
      console.log('❌ Authorization failed: Order does not belong to user');
      return res.status(403).json({ message: 'Not authorized for this order' });
    }

    if (!order.total || order.total <= 0) {
      console.log('❌ Invalid order total:', order.total);
      return res.status(400).json({ message: 'Invalid order total' });
    }

    console.log('✅ Order validation passed. Order total:', order.total);

    const existingPayment = await Payment.findOne({ order: orderId });
    console.log('🔍 Existing payment found:', existingPayment ? 'Yes' : 'No');

    const platformFee = Math.round(order.subtotal * 0.03 * 100) / 100;
    const vendorAmount = order.total - platformFee;

    console.log('💰 Payment amounts calculated:', {
      total: order.total,
      platformFee,
      vendorAmount
    });

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(order.total * 100),
      currency: 'usd',
      payment_method_types: [paymentMethodType],
      metadata: { 
        orderId: order._id.toString(), 
        customerId: user._id.toString(), 
        restaurantId: order.restaurant._id.toString(), 
        orderNumber: order.orderNumber 
      },
      description: `Payment for order ${order.orderNumber} from ${order.restaurant.name}`,
      receipt_email: order.customer.email
    });

    console.log('✅ Stripe PaymentIntent created:', paymentIntent.id);

    const paymentData = {
      stripePaymentIntentId: paymentIntent.id,
      order: order._id,
      customer: user._id,
      restaurant: order.restaurant._id,
      amount: { 
        subtotal: order.subtotal, 
        deliveryFee: order.deliveryFee, 
        tax: order.tax, 
        total: order.total, 
        platformFee, 
        vendorAmount 
      },
      currency: 'usd',
      status: 'pending',
      stripeDetails: { 
        clientSecret: paymentIntent.client_secret,
        receiptEmail: order.customer.email
      },
      analytics: { 
        userAgent: req.headers['user-agent'], 
        ipAddress: req.ip, 
        paymentSource: 'mobile_app' 
      }
    };

    console.log('📋 Payment data prepared:', JSON.stringify(paymentData, null, 2));

    let payment;
    if (existingPayment && existingPayment.status === 'pending') {
      console.log('🔄 Updating existing payment record');
      payment = await Payment.findByIdAndUpdate(existingPayment._id, paymentData, { new: true });
      console.log('✅ Payment record updated:', payment.paymentId);
    } else {
      console.log('📝 Creating new payment record using enhanced method');
      payment = await Payment.createPaymentWithLogging(paymentData);
    }

    // Update order status
    order.paymentStatus = 'pending';
    await order.save();
    console.log('✅ Order payment status updated to pending');

    res.json({ 
      clientSecret: paymentIntent.client_secret, 
      paymentIntentId: paymentIntent.id, 
      paymentId: payment.paymentId, 
      amount: order.total 
    });

  } catch (error) {
    console.error('💥 Error in create-payment-intent:', error);
    console.error('Stack trace:', error.stack);
    
    res.status(500).json({ 
      message: 'Error creating payment intent', 
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error' 
    });
  }
});

// -----------------------------
// Confirm Payment
// -----------------------------
router.post('/confirm-payment', authMiddleware, async (req, res) => {
  try {
    console.log('🔄 Confirming payment for user:', req.user._id);
    const { paymentIntentId } = req.body;
    const user = req.user;

    console.log('🔍 Retrieving Stripe PaymentIntent:', paymentIntentId);
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    
    if (!paymentIntent) {
      console.log('❌ Payment intent not found in Stripe');
      return res.status(404).json({ message: 'Payment intent not found' });
    }

    console.log('📊 Stripe PaymentIntent status:', paymentIntent.status);

    const payment = await Payment.findOne({ stripePaymentIntentId: paymentIntentId })
      .populate('order')
      .populate('customer', 'name email')
      .populate('restaurant', 'name owner');

    if (!payment) {
      console.log('❌ Payment record not found in database');
      return res.status(404).json({ message: 'Payment record not found' });
    }

    console.log('✅ Payment record found:', payment.paymentId);

    if (payment.customer._id.toString() !== user._id.toString()) {
      console.log('❌ Authorization failed: Payment does not belong to user');
      return res.status(403).json({ message: 'Not authorized for this payment' });
    }

    if (paymentIntent.status === 'succeeded') {
      console.log('✅ Payment succeeded, updating records');
      
      payment.status = 'succeeded';
      payment.paymentTimestamps.confirmed = new Date();

      const charge = paymentIntent.charges?.data?.[0];
      if (charge?.payment_method_details?.card) {
        const card = charge.payment_method_details.card;
        payment.paymentMethod = { 
          type: 'card', 
          last4: card.last4, 
          brand: card.brand, 
          expMonth: card.exp_month, 
          expYear: card.exp_year, 
          fingerprint: card.fingerprint, 
          country: card.country, 
          funding: card.funding 
        };
        console.log('💳 Card details saved:', card.brand, 'ending in', card.last4);
      }

      if (charge) {
        payment.stripeDetails.charges = [{
          chargeId: charge.id,
          amount: charge.amount / 100,
          status: charge.status,
          created: new Date(charge.created * 1000),
          receiptUrl: charge.receipt_url
        }];
        payment.stripeDetails.receiptUrl = charge.receipt_url;
        console.log('🧾 Charge details saved:', charge.id);
      }

      if (payment.order) {
        payment.order.paymentStatus = 'paid';
        await payment.order.save();
        console.log('✅ Order status updated to paid');
      }

    } else if (paymentIntent.status === 'requires_payment_method' || paymentIntent.status === 'canceled') {
      console.log('❌ Payment failed or cancelled');
      payment.status = 'failed';
      payment.paymentTimestamps.failed = new Date();
      
      if (paymentIntent.last_payment_error) {
        payment.failureReason = { 
          code: paymentIntent.last_payment_error.code, 
          message: paymentIntent.last_payment_error.message, 
          declineCode: paymentIntent.last_payment_error.decline_code 
        };
        console.log('📝 Failure reason recorded:', paymentIntent.last_payment_error.message);
      }
    }

    await payment.save();
    console.log('✅ Payment record updated and saved');

    // Verify the payment was saved with the correct status
    const updatedPayment = await Payment.findById(payment._id);
    console.log('🔍 Final payment status in database:', updatedPayment.status);

    res.json({ 
      success: true, 
      payment: { 
        id: payment.paymentId, 
        status: payment.status, 
        amount: payment.amount.total, 
        orderId: payment.order._id 
      } 
    });

  } catch (error) {
    console.error('💥 Error in confirm-payment:', error);
    console.error('Stack trace:', error.stack);
    
    res.status(500).json({ 
      message: 'Error confirming payment', 
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error' 
    });
  }
});

// -----------------------------
// Debug Route - Get Payment Details
// -----------------------------
router.get('/payment/:paymentId', authMiddleware, async (req, res) => {
  try {
    const { paymentId } = req.params;
    
    // Try to find by paymentId or stripePaymentIntentId
    let payment = await Payment.findOne({ 
      $or: [
        { paymentId },
        { stripePaymentIntentId: paymentId }
      ]
    }).populate('order').populate('customer', 'name email').populate('restaurant', 'name');

    if (!payment) {
      return res.status(404).json({ message: 'Payment not found' });
    }

    res.json(payment);
  } catch (error) {
    console.error('Error fetching payment:', error);
    res.status(500).json({ message: 'Error fetching payment details' });
  }
});

// -----------------------------
// Debug Route - List All Payments for User
// -----------------------------
router.get('/payments', authMiddleware, async (req, res) => {
  try {
    const payments = await Payment.find({ customer: req.user._id })
      .populate('order', 'orderNumber total')
      .populate('restaurant', 'name')
      .sort({ createdAt: -1 })
      .limit(20);

    res.json(payments);
  } catch (error) {
    console.error('Error fetching payments:', error);
    res.status(500).json({ message: 'Error fetching payments' });
  }
});

// Debug middleware for payment routes
router.use((req, res, next) => {
  console.log(`💳 Payment Route: ${req.method} ${req.path}`);
  console.log(`📋 Body:`, JSON.stringify(req.body, null, 2));
  next();
});

module.exports = router;