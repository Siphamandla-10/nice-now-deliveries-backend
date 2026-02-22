// backend/routes/payments.js - PAYSTACK PAYMENT INTEGRATION
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const axios = require('axios');
const Payment = require('../models/Payment');
const Order = require('../models/Order');
const User = require('../models/User');
const { authMiddleware } = require('../middleware/auth');

// Paystack Configuration
const PAYSTACK_CONFIG = {
  secretKey: process.env.PAYSTACK_SECRET_KEY || 'sk_test_your_secret_key_here',
  publicKey: process.env.PAYSTACK_PUBLIC_KEY || 'pk_test_your_public_key_here',
};

// Paystack API URL
const PAYSTACK_API_URL = 'https://api.paystack.co';

// Your app URLs (update these with your actual URLs)
const APP_URL = process.env.APP_URL || 'http://192.168.3.1:3000';
const API_URL = process.env.API_URL || 'http://192.168.3.1:5000';

// Middleware to log all payment requests
router.use((req, res, next) => {
  console.log('💳 Payment Route:', req.method, req.path);
  console.log('📋 Body:', JSON.stringify(req.body, null, 2));
  next();
});

// Helper function to verify Paystack signature
function verifyPaystackSignature(payload, signature) {
  const hash = crypto
    .createHmac('sha512', PAYSTACK_CONFIG.secretKey)
    .update(JSON.stringify(payload))
    .digest('hex');
  return hash === signature;
}

// POST /api/payments/create-paystack-payment - Initialize Paystack payment
router.post('/create-paystack-payment', authMiddleware, async (req, res) => {
  try {
    console.log('💳 POST /api/payments/create-paystack-payment');
    console.log('User ID:', req.user.id);

    const { amount, orderData } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid amount'
      });
    }

    // Get user data
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Generate unique payment reference
    const paymentReference = `PAY_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Generate order number
    const date = new Date();
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
    const randomNum = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    const orderNumber = `ORD-${dateStr}-${randomNum}`;

    // Store order data temporarily (we'll create the real order after payment confirmation)
    const tempOrderData = {
      paymentReference: paymentReference,
      userId: req.user.id,
      orderNumber: orderNumber,
      amount: amount,
      orderData: orderData,
      createdAt: new Date()
    };

    // Store in memory or database (for production, use Redis or database)
    global.pendingPayments = global.pendingPayments || {};
    global.pendingPayments[paymentReference] = tempOrderData;

    console.log('📝 Pending payment created:', paymentReference);

    // Initialize Paystack transaction
    const paystackData = {
      email: user.email,
      amount: Math.round(amount * 100), // Paystack expects amount in kobo (cents)
      currency: 'ZAR',
      reference: paymentReference,
      callback_url: `${API_URL}/api/payments/paystack-callback`,
      metadata: {
        user_id: req.user.id,
        restaurant_id: orderData.restaurantId,
        order_number: orderNumber,
        custom_fields: [
          {
            display_name: 'Restaurant',
            variable_name: 'restaurant_name',
            value: orderData.restaurantName
          },
          {
            display_name: 'Items',
            variable_name: 'items_count',
            value: orderData.items.length.toString()
          }
        ]
      }
    };

    console.log('📤 Initializing Paystack transaction...');

    // Call Paystack API to initialize transaction
    const response = await axios.post(
      `${PAYSTACK_API_URL}/transaction/initialize`,
      paystackData,
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_CONFIG.secretKey}`,
          'Content-Type': 'application/json',
        }
      }
    );

    if (response.data.status && response.data.data) {
      const { authorization_url, access_code, reference } = response.data.data;

      console.log('✅ Paystack transaction initialized');
      console.log('📍 Authorization URL:', authorization_url);

      // Return the payment URL to frontend
      res.json({
        success: true,
        paymentReference: reference,
        orderNumber: orderNumber,
        authorizationUrl: authorization_url,
        accessCode: access_code,
        message: 'Redirect to Paystack to complete payment'
      });
    } else {
      throw new Error('Failed to initialize Paystack transaction');
    }

  } catch (error) {
    console.error('❌ Error creating Paystack payment:', error.response?.data || error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to create payment',
      error: error.response?.data?.message || error.message
    });
  }
});

// GET /api/payments/paystack-callback - Handle payment callback from Paystack
router.get('/paystack-callback', async (req, res) => {
  try {
    const { reference, trxref } = req.query;
    const paymentReference = reference || trxref;

    console.log('✅ Paystack callback received');
    console.log('📋 Reference:', paymentReference);

    if (!paymentReference) {
      return res.redirect(`${APP_URL}/payment-error?error=missing_reference`);
    }

    // Verify the transaction with Paystack
    const verifyResponse = await axios.get(
      `${PAYSTACK_API_URL}/transaction/verify/${paymentReference}`,
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_CONFIG.secretKey}`,
        }
      }
    );

    const { status, data } = verifyResponse.data;

    if (status && data.status === 'success') {
      console.log('✅ Payment verified successfully');
      
      // Process the order (this will be done in webhook too, but we redirect user immediately)
      res.redirect(`${APP_URL}/payment-success?reference=${paymentReference}`);
    } else {
      console.log('❌ Payment verification failed');
      res.redirect(`${APP_URL}/payment-failed?reference=${paymentReference}`);
    }

  } catch (error) {
    console.error('❌ Error handling callback:', error.response?.data || error.message);
    res.redirect(`${APP_URL}/payment-error?error=verification_failed`);
  }
});

// POST /api/payments/paystack-webhook - Paystack Webhook for payment notifications
router.post('/paystack-webhook', express.json(), async (req, res) => {
  try {
    console.log('📨 Paystack webhook received');

    // Verify webhook signature
    const signature = req.headers['x-paystack-signature'];
    
    if (!signature) {
      console.error('❌ No signature found');
      return res.status(400).send('No signature');
    }

    const isValid = verifyPaystackSignature(req.body, signature);
    
    if (!isValid) {
      console.error('❌ Invalid signature');
      return res.status(400).send('Invalid signature');
    }

    console.log('✅ Signature verified');

    const event = req.body;
    const eventType = event.event;

    console.log('📊 Event type:', eventType);

    // Handle charge.success event
    if (eventType === 'charge.success') {
      const { reference, amount, customer, metadata, paid_at, channel } = event.data;

      console.log('💳 Payment successful');
      console.log('📋 Reference:', reference);
      console.log('💰 Amount:', amount / 100); // Convert from kobo to rands

      // Get pending order data
      global.pendingPayments = global.pendingPayments || {};
      const pendingOrder = global.pendingPayments[reference];

      if (!pendingOrder) {
        console.error('❌ Pending order not found for reference:', reference);
        return res.status(404).send('Order not found');
      }

      const { userId, orderNumber, orderData } = pendingOrder;
      const finalAmount = amount / 100; // Convert from kobo to rands

      // Get user data
      const userData = await User.findById(userId);
      const contactPhone = userData?.phone || orderData.deliveryAddress?.contactPhone || '0000000000';

      // Create the actual order
      const orderCreateData = {
        user: userId,
        restaurant: orderData.restaurant || orderData.restaurantId,
        orderNumber: orderNumber,
        
        items: orderData.items.map(item => ({
          menuItem: item.menuItem,
          name: item.name,
          price: item.price,
          quantity: item.quantity,
          specialInstructions: item.specialInstructions || '',
          subtotal: item.price * item.quantity
        })),
        
        deliveryAddress: {
          street: orderData.deliveryAddress?.street || '123 Main St',
          city: orderData.deliveryAddress?.city || 'Johannesburg',
          state: orderData.deliveryAddress?.state || 'Gauteng',
          zipCode: orderData.deliveryAddress?.zipCode || '2000',
          country: orderData.deliveryAddress?.country || 'South Africa',
          location: {
            type: 'Point',
            coordinates: [
              orderData.deliveryAddress?.coordinates?.[0] || 0,
              orderData.deliveryAddress?.coordinates?.[1] || 0
            ]
          },
          instructions: orderData.deliveryAddress?.instructions || '',
          contactPhone: contactPhone
        },
        
        pricing: {
          subtotal: orderData.subtotal || 0,
          deliveryFee: orderData.deliveryFee || 25,
          serviceFee: orderData.serviceFee || 5,
          discount: 0,
          total: orderData.total || finalAmount,
          platformCommissionRate: 20,
          platformCommission: 0,
          restaurantPayout: 0,
          driverPayout: 20,
          platformProfit: 0,
          tax: orderData.tax || 0,
          taxRate: 0
        },
        
        driverEarnings: 20,
        
        payment: {
          method: 'card',
          status: 'paid',
          transactionId: reference,
          paidAt: new Date(paid_at)
        },
        
        status: 'confirmed',
        driverStatus: 'accepted',
        
        timestamps: {
          placedAt: new Date(),
          confirmedAt: new Date(),
        },
        
        estimatedPreparationTime: 30,
        estimatedDeliveryTime: 45,
      };

      const order = new Order(orderCreateData);
      await order.save();
      console.log('✅ Order created:', order._id);

      // Create payment record
      const paymentData = {
        customer: userId,
        order: order._id,
        restaurant: order.restaurant,
        amount: {
          subtotal: order.pricing.subtotal,
          deliveryFee: order.pricing.deliveryFee || 0,
          tax: order.pricing.tax || 0,
          total: finalAmount,
          platformFee: 0,
          vendorAmount: finalAmount
        },
        currency: 'ZAR',
        paymentMethod: {
          type: 'card',
          last4: customer.authorization?.last4 || '0000',
          brand: channel || 'card',
        },
        status: 'succeeded',
        stripePaymentIntentId: reference,
        paymentTimestamps: {
          initiated: pendingOrder.createdAt,
          confirmed: new Date(paid_at)
        },
        analytics: {
          userAgent: req.headers['user-agent'] || 'unknown',
          ipAddress: customer.ip_address || req.ip || 'unknown',
          paymentSource: 'mobile_app'
        }
      };

      const paymentRecord = await Payment.create(paymentData);
      console.log('✅ Payment record created:', paymentRecord._id);

      // Clean up pending payment
      delete global.pendingPayments[reference];

      console.log('🎉 Order and payment successfully created!');
    }

    res.status(200).send('OK');

  } catch (error) {
    console.error('❌ Webhook processing error:', error);
    res.status(500).send('Error');
  }
});

// POST /api/payments/verify-payment - Manually verify a Paystack payment
router.post('/verify-payment', authMiddleware, async (req, res) => {
  try {
    const { reference } = req.body;

    if (!reference) {
      return res.status(400).json({
        success: false,
        message: 'Payment reference is required'
      });
    }

    console.log('🔍 Verifying payment:', reference);

    // Verify with Paystack
    const response = await axios.get(
      `${PAYSTACK_API_URL}/transaction/verify/${reference}`,
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_CONFIG.secretKey}`,
        }
      }
    );

    const { status, data } = response.data;

    if (status && data) {
      res.json({
        success: true,
        payment: {
          reference: data.reference,
          amount: data.amount / 100,
          status: data.status,
          paidAt: data.paid_at,
          channel: data.channel,
        }
      });
    } else {
      res.status(400).json({
        success: false,
        message: 'Payment verification failed'
      });
    }

  } catch (error) {
    console.error('❌ Verification error:', error.response?.data || error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to verify payment',
      error: error.response?.data?.message || error.message
    });
  }
});

// POST /api/payments/process - Handle cash payments (no card processing here)
router.post('/process', authMiddleware, async (req, res) => {
  try {
    console.log('💳 POST /api/payments/process');
    console.log('User ID:', req.user.id);

    const { 
      amount, 
      paymentMethod,
      orderData
    } = req.body;

    // Only handle cash payments here
    if (paymentMethod !== 'cash') {
      return res.status(400).json({
        success: false,
        message: 'Please use create-paystack-payment endpoint for card payments'
      });
    }

    // Get user data
    const userData = await User.findById(req.user.id);
    const contactPhone = userData?.phone || orderData.deliveryAddress?.contactPhone || '0000000000';

    // Create order for cash payment
    const date = new Date();
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
    const randomNum = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    const orderNumber = `ORD-${dateStr}-${randomNum}`;

    const orderCreateData = {
      user: req.user.id,
      restaurant: orderData.restaurant || orderData.restaurantId,
      orderNumber: orderNumber,
      
      items: orderData.items.map(item => ({
        menuItem: item.menuItem,
        name: item.name,
        price: item.price,
        quantity: item.quantity,
        specialInstructions: item.specialInstructions || '',
        subtotal: item.price * item.quantity
      })),
      
      deliveryAddress: {
        street: orderData.deliveryAddress?.street || '123 Main St',
        city: orderData.deliveryAddress?.city || 'Johannesburg',
        state: orderData.deliveryAddress?.state || 'Gauteng',
        zipCode: orderData.deliveryAddress?.zipCode || '2000',
        country: orderData.deliveryAddress?.country || 'South Africa',
        location: {
          type: 'Point',
          coordinates: [0, 0]
        },
        instructions: orderData.deliveryAddress?.instructions || '',
        contactPhone: contactPhone
      },
      
      pricing: {
        subtotal: orderData.subtotal || 0,
        deliveryFee: orderData.deliveryFee || 25,
        serviceFee: orderData.serviceFee || 5,
        discount: 0,
        total: orderData.total || amount,
        platformCommissionRate: 20,
        platformCommission: 0,
        restaurantPayout: 0,
        driverPayout: 20,
        platformProfit: 0,
        tax: orderData.tax || 0,
        taxRate: 0
      },
      
      driverEarnings: 20,
      
      payment: {
        method: 'cash',
        status: 'pending',
        transactionId: `CASH_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        paidAt: null
      },
      
      status: 'confirmed',
      driverStatus: 'accepted',
      
      timestamps: {
        placedAt: new Date(),
        confirmedAt: new Date(),
      },
      
      estimatedPreparationTime: 30,
      estimatedDeliveryTime: 45,
    };

    const order = new Order(orderCreateData);
    await order.save();

    // Create payment record
    const payment = await Payment.create({
      customer: req.user.id,
      order: order._id,
      restaurant: order.restaurant,
      amount: {
        subtotal: order.pricing.subtotal,
        deliveryFee: order.pricing.deliveryFee || 0,
        tax: order.pricing.tax || 0,
        total: amount || order.pricing.total,
        platformFee: 0,
        vendorAmount: amount || order.pricing.total
      },
      currency: 'ZAR',
      paymentMethod: {
        type: 'cash',
        last4: '0000',
        brand: 'cash',
      },
      status: 'pending',
      stripePaymentIntentId: `CASH_${Date.now()}`,
      paymentTimestamps: {
        initiated: new Date(),
      },
      analytics: {
        userAgent: req.headers['user-agent'] || 'unknown',
        ipAddress: req.ip || req.connection.remoteAddress,
        paymentSource: 'mobile_app'
      }
    });

    res.json({
      success: true,
      message: 'Cash order placed successfully',
      transactionId: payment.stripePaymentIntentId,
      paymentId: payment._id,
      orderId: order._id,
      orderNumber: order.orderNumber,
      payment: {
        id: payment._id,
        amount: payment.amount.total,
        status: payment.status,
        method: payment.paymentMethod.type
      },
      order: {
        id: order._id,
        orderNumber: order.orderNumber,
        status: order.status,
        total: order.pricing.total,
      }
    });

  } catch (error) {
    console.error('❌ Payment processing error:', error);
    res.status(500).json({
      success: false,
      message: 'Payment processing failed',
      error: error.message
    });
  }
});

module.exports = router;