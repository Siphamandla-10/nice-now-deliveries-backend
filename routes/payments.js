// backend/routes/payments.js - PAYFAST HOSTED PAYMENT PAGE (WITH REDIRECT)
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const Payment = require('../models/Payment');
const Order = require('../models/Order');
const User = require('../models/User');
const { authMiddleware } = require('../middleware/auth');

// Payfast Configuration
const PAYFAST_CONFIG = {
  merchantId: process.env.PAYFAST_MERCHANT_ID || '33561729',
  merchantKey: process.env.PAYFAST_MERCHANT_KEY || 'xcafevj36gf1h',
  passphrase: process.env.PAYFAST_PASSPHRASE || 'MySecurePass2024_',
  sandbox: process.env.NODE_ENV !== 'production',
};

// Payfast URLs
const PAYFAST_URL = PAYFAST_CONFIG.sandbox 
  ? 'https://sandbox.payfast.co.za/eng/process'
  : 'https://www.payfast.co.za/eng/process';

// Your app URLs (update these with your actual URLs)
const APP_URL = process.env.APP_URL || 'http://192.168.3.1:3000';
const API_URL = process.env.API_URL || 'http://192.168.3.1:5000';

// Middleware to log all payment requests
router.use((req, res, next) => {
  console.log('💳 Payment Route:', req.method, req.path);
  console.log('📋 Body:', JSON.stringify(req.body, null, 2));
  next();
});

// Helper function to generate Payfast signature
function generateSignature(data, passphrase = null) {
  let pfOutput = "";
  for (let key in data) {
    if (data.hasOwnProperty(key)) {
      if (data[key] !== "") {
        pfOutput += `${key}=${encodeURIComponent(data[key].toString().trim()).replace(/%20/g, "+")}&`;
      }
    }
  }
  
  let getString = pfOutput.slice(0, -1);
  
  if (passphrase !== null) {
    getString += `&passphrase=${encodeURIComponent(passphrase.trim()).replace(/%20/g, "+")}`;
  }
  
  return crypto.createHash("md5").update(getString).digest("hex");
}

// POST /api/payments/create-payfast-payment - Create payment and get redirect URL
router.post('/create-payfast-payment', authMiddleware, async (req, res) => {
  try {
    console.log('💳 POST /api/payments/create-payfast-payment');
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

    // Generate unique payment ID
    const paymentId = `PAY${Date.now()}${Math.random().toString(36).substr(2, 9)}`;

    // Create pending order first (will be confirmed after payment)
    const date = new Date();
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
    const randomNum = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    const orderNumber = `ORD-${dateStr}-${randomNum}`;

    const contactPhone = user?.phone || orderData.deliveryAddress?.contactPhone || '0000000000';

    // Store order data temporarily (we'll create the real order after payment confirmation)
    const tempOrderData = {
      paymentId: paymentId,
      userId: req.user.id,
      orderNumber: orderNumber,
      amount: amount,
      orderData: orderData,
      createdAt: new Date()
    };

    // Store in memory or database (for production, use Redis or database)
    global.pendingPayments = global.pendingPayments || {};
    global.pendingPayments[paymentId] = tempOrderData;

    console.log('📝 Pending payment created:', paymentId);

    // Prepare Payfast payment data
    const payfastData = {
      // Merchant details
      merchant_id: PAYFAST_CONFIG.merchantId,
      merchant_key: PAYFAST_CONFIG.merchantKey,
      
      // Buyer details
      name_first: user.name?.split(' ')[0] || 'Customer',
      name_last: user.name?.split(' ').slice(1).join(' ') || '',
      email_address: user.email,
      cell_number: contactPhone,
      
      // Transaction details
      m_payment_id: paymentId,
      amount: amount.toFixed(2),
      item_name: `Order from ${orderData.restaurantName}`,
      item_description: `${orderData.items.length} items from ${orderData.restaurantName}`,
      
      // URLs - These handle the redirect flow
      return_url: `${API_URL}/api/payments/payfast-return`,
      cancel_url: `${API_URL}/api/payments/payfast-cancel`,
      notify_url: `${API_URL}/api/payments/payfast-notify`,
      
      // Custom fields (to identify the order later)
      custom_str1: req.user.id,
      custom_str2: orderData.restaurantId,
      custom_str3: paymentId,
    };

    // Generate signature
    const signature = generateSignature(payfastData, PAYFAST_CONFIG.passphrase);
    payfastData.signature = signature;

    console.log('✅ Payfast payment data prepared');
    console.log('📍 Redirect URL:', PAYFAST_URL);

    // Return the payment URL and data to frontend
    res.json({
      success: true,
      paymentId: paymentId,
      orderNumber: orderNumber,
      payfastUrl: PAYFAST_URL,
      payfastData: payfastData,
      message: 'Redirect to Payfast to complete payment'
    });

  } catch (error) {
    console.error('❌ Error creating Payfast payment:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create payment',
      error: error.message
    });
  }
});

// GET /api/payments/payfast-return - Handle successful payment return
router.get('/payfast-return', async (req, res) => {
  try {
    console.log('✅ Payfast return - Payment successful');
    console.log('Query params:', req.query);

    // Redirect to app with success
    res.redirect(`${APP_URL}/payment-success?status=success`);

  } catch (error) {
    console.error('❌ Error handling return:', error);
    res.redirect(`${APP_URL}/payment-success?status=error`);
  }
});

// GET /api/payments/payfast-cancel - Handle cancelled payment
router.get('/payfast-cancel', async (req, res) => {
  try {
    console.log('❌ Payfast cancel - Payment cancelled');
    console.log('Query params:', req.query);

    // Redirect to app with cancel
    res.redirect(`${APP_URL}/payment-cancelled?status=cancelled`);

  } catch (error) {
    console.error('❌ Error handling cancel:', error);
    res.redirect(`${APP_URL}/payment-cancelled?status=error`);
  }
});

// POST /api/payments/payfast-notify - Payfast ITN (Instant Transaction Notification)
router.post('/payfast-notify', express.urlencoded({ extended: true }), async (req, res) => {
  try {
    console.log('📨 Payfast ITN received:', req.body);

    const payfastData = req.body;

    // Verify signature
    const signature = payfastData.signature;
    delete payfastData.signature;
    
    const calculatedSignature = generateSignature(payfastData, PAYFAST_CONFIG.passphrase);
    
    if (signature !== calculatedSignature) {
      console.error('❌ Invalid signature');
      return res.status(400).send('Invalid signature');
    }

    console.log('✅ Signature verified');

    // Get payment details
    const paymentId = payfastData.m_payment_id;
    const paymentStatus = payfastData.payment_status;
    const customStr1 = payfastData.custom_str1; // userId
    const customStr2 = payfastData.custom_str2; // restaurantId
    const customStr3 = payfastData.custom_str3; // paymentId

    console.log('💳 Payment ID:', paymentId);
    console.log('📊 Payment Status:', paymentStatus);

    if (paymentStatus === 'COMPLETE') {
      console.log('✅ Payment successful - Creating order...');

      // Get pending order data
      global.pendingPayments = global.pendingPayments || {};
      const pendingOrder = global.pendingPayments[paymentId];

      if (!pendingOrder) {
        console.error('❌ Pending order not found for payment:', paymentId);
        return res.status(404).send('Order not found');
      }

      const { userId, orderNumber, amount, orderData } = pendingOrder;

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
          specialInstructions: '',
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
          instructions: '',
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
          method: 'card',
          status: 'paid',
          transactionId: payfastData.pf_payment_id || paymentId,
          paidAt: new Date()
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
          total: amount || order.pricing.total,
          platformFee: 0,
          vendorAmount: amount || order.pricing.total
        },
        currency: 'ZAR',
        paymentMethod: {
          type: 'card',
          last4: payfastData.billing_card_number?.slice(-4) || '0000',
          brand: 'payfast',
        },
        status: 'succeeded',
        stripePaymentIntentId: payfastData.pf_payment_id || paymentId,
        paymentTimestamps: {
          initiated: pendingOrder.createdAt,
          confirmed: new Date()
        },
        analytics: {
          userAgent: req.headers['user-agent'] || 'unknown',
          ipAddress: req.ip || req.connection.remoteAddress,
          paymentSource: 'mobile_app'
        }
      };

      const payment = await Payment.create(paymentData);
      console.log('✅ Payment record created:', payment._id);

      // Clean up pending payment
      delete global.pendingPayments[paymentId];

      console.log('🎉 Order and payment successfully created!');
    } else {
      console.log('❌ Payment failed or cancelled');
    }

    res.status(200).send('OK');

  } catch (error) {
    console.error('❌ ITN processing error:', error);
    res.status(500).send('Error');
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
        message: 'Please use create-payfast-payment endpoint for card payments'
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
        specialInstructions: '',
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
        instructions: '',
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