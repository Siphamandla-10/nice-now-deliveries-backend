// backend/routes/payments.js - COMPLETE FIXED VERSION
const express = require('express');
const router = express.Router();
const Payment = require('../models/Payment');
const Order = require('../models/Order');
const { authMiddleware } = require('../middleware/auth');

// Middleware to log all payment requests
router.use((req, res, next) => {
  console.log('💳 Payment Route:', req.method, req.path);
  console.log('📋 Body:', JSON.stringify(req.body, null, 2));
  next();
});

// POST /api/payments/process - Main payment processing endpoint
router.post('/process', authMiddleware, async (req, res) => {
  try {
    console.log('💳 POST /api/payments/process');
    console.log('User ID:', req.user.id);
    console.log('Request body:', req.body);

    const { 
      orderId, 
      amount, 
      paymentMethod,
      orderData
    } = req.body;

    // Map payment method to match Order model enum
    const validPaymentMethods = {
      'card': 'card',
      'cash': 'cash',
      'wallet': 'digital_wallet',
      'digital_wallet': 'digital_wallet'
    };
    const mappedPaymentMethod = validPaymentMethods[paymentMethod] || 'cash';
    console.log('💳 Payment method mapping:', paymentMethod, '→', mappedPaymentMethod);

    let finalOrderId = orderId;
    let order = null;

    // Step 1: Create or load the order
    if (!finalOrderId && orderData) {
      console.log('📝 Creating new order...');
      
      // Generate orderNumber explicitly (since model has required: true)
      const date = new Date();
      const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
      const randomNum = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
      const orderNumber = `ORD-${dateStr}-${randomNum}`;
      console.log('📋 Generated order number:', orderNumber);
      
      // Prepare order data
      const orderCreateData = {
        customer: req.user.id,
        restaurant: orderData.restaurant || orderData.restaurantId,
        orderNumber: orderNumber,
        items: orderData.items.map(item => ({
          menuItem: item.menuItem,
          quantity: item.quantity,
          price: item.price,
          name: item.name,
          itemTotal: item.price * item.quantity
        })),
        deliveryAddress: orderData.deliveryAddress,
        subtotal: orderData.subtotal || amount,
        deliveryFee: orderData.deliveryFee || 0,
        tax: orderData.tax || 0,
        total: orderData.total || amount,
        paymentMethod: mappedPaymentMethod,
        status: 'pending',
        paymentStatus: 'pending'
      };

      console.log('📦 Creating order with data:', JSON.stringify(orderCreateData, null, 2));

      // Create new order
      order = new Order(orderCreateData);
      await order.save();
      finalOrderId = order._id;
      
      console.log('✅ Order created:', finalOrderId);
      console.log('   Order Number:', order.orderNumber);
      console.log('   Restaurant:', order.restaurant);
      console.log('   Total:', order.total);
    } else if (finalOrderId) {
      console.log('📖 Loading existing order:', finalOrderId);
      
      // Load existing order
      order = await Order.findById(finalOrderId);
      if (!order) {
        console.log('❌ Order not found!');
        return res.status(404).json({
          success: false,
          message: 'Order not found'
        });
      }
      
      console.log('✅ Order loaded:', finalOrderId);
    } else {
      console.log('❌ No order ID or order data provided!');
      return res.status(400).json({
        success: false,
        message: 'Either orderId or orderData must be provided'
      });
    }

    // Step 2: Create the payment with BOTH order and restaurant
    console.log('💰 Creating payment record...');
    console.log('   Order ID:', finalOrderId);
    console.log('   Restaurant ID:', order.restaurant);
    console.log('   Customer ID:', req.user.id);

    const paymentData = {
      customer: req.user.id,
      order: finalOrderId,
      restaurant: order.restaurant,
      amount: {
        subtotal: order.subtotal,
        deliveryFee: order.deliveryFee || 0,
        tax: order.tax || 0,
        total: amount || order.total,
        platformFee: 0,
        vendorAmount: amount || order.total
      },
      currency: 'ZAR',
      paymentMethod: {
        type: mappedPaymentMethod,
        last4: paymentMethod === 'card' ? '0000' : undefined
      },
      status: 'succeeded',
      stripePaymentIntentId: `PAY_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      paymentTimestamps: {
        initiated: new Date(),
        confirmed: new Date()
      },
      analytics: {
        userAgent: req.headers['user-agent'] || 'unknown',
        ipAddress: req.ip || req.connection.remoteAddress,
        paymentSource: 'mobile_app'
      }
    };

    console.log('💳 Payment data prepared:', JSON.stringify(paymentData, null, 2));

    // Create the payment
    const payment = await Payment.create(paymentData);

    console.log('✅ Payment created successfully!');
    console.log('   Payment ID:', payment._id);
    console.log('   Transaction ID:', payment.stripePaymentIntentId);

    // Step 3: Update order with payment info
    order.payment = payment._id;
    order.paymentStatus = 'paid';
    order.status = 'confirmed';
    await order.save();

    console.log('✅ Order updated with payment info');

    // Step 4: Send success response
    res.json({
      success: true,
      message: 'Payment processed successfully',
      transactionId: payment.stripePaymentIntentId,
      paymentId: payment._id,
      orderId: finalOrderId,
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
        total: order.total
      }
    });

  } catch (error) {
    console.error('❌ Payment processing error:', error);
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    
    if (error.errors) {
      console.error('Validation errors:', error.errors);
    }
    
    res.status(500).json({
      success: false,
      message: 'Payment processing failed',
      error: error.message
    });
  }
});

// GET /api/payments/methods - Get saved payment methods
router.get('/methods', authMiddleware, async (req, res) => {
  try {
    console.log('💳 GET /api/payments/methods');
    console.log('User:', req.user.id);

    // For now, return empty array
    const methods = [];

    res.json({
      success: true,
      methods
    });

  } catch (error) {
    console.error('❌ Error fetching payment methods:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch payment methods'
    });
  }
});

module.exports = router;