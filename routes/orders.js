const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const { auth } = require('../middleware/auth');

// ==========================================
// GET CUSTOMER ORDERS
// ==========================================
router.get('/', auth, async (req, res) => {
  try {
    console.log('\n========== 📦 CUSTOMER ORDERS REQUEST ==========');
    console.log('Customer ID:', req.user.id);
    console.log('User Type:', req.user.userType);
    
    const { page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;

    // ✅ FIXED: Use 'user' instead of 'customer' to match Order model
    const orders = await Order.find({ user: req.user.id })
      .populate('restaurant', 'name image coverImage displayName')
      .populate('items.menuItem', 'name price image')
      .populate('driver', 'name phone')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await Order.countDocuments({ user: req.user.id });

    console.log('📦 Orders found:', orders.length);
    console.log('📊 Total orders:', total);
    
    // Transform orders to ensure consistent pricing structure
    const transformedOrders = orders.map(order => ({
      ...order,
      id: order._id,
      total: order.pricing?.total || order.total || 0,
      subtotal: order.pricing?.subtotal || order.subtotal || 0,
      deliveryFee: order.pricing?.deliveryFee || order.deliveryFee || 0,
      tax: order.pricing?.tax || order.tax || 0,
      serviceFee: order.pricing?.serviceFee || order.serviceFee || 0
    }));

    if (transformedOrders.length > 0) {
      console.log('✅ Sample order:');
      console.log('   Order Number:', transformedOrders[0].orderNumber);
      console.log('   Status:', transformedOrders[0].status);
      console.log('   Total:', transformedOrders[0].total);
    }
    console.log('===============================================\n');

    res.json({
      success: true,
      orders: transformedOrders,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('❌ Error fetching customer orders:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch orders',
      error: error.message
    });
  }
});

// ==========================================
// GET SINGLE ORDER BY ID
// ==========================================
router.get('/:id', auth, async (req, res) => {
  try {
    console.log('\n========== 📦 GET SINGLE ORDER ==========');
    console.log('Order ID:', req.params.id);
    console.log('Customer ID:', req.user.id);
    
    const order = await Order.findOne({ 
      _id: req.params.id,
      user: req.user.id // ✅ FIXED: Use 'user' instead of 'customer'
    })
      .populate('restaurant', 'name image coverImage displayName address contact')
      .populate('items.menuItem', 'name price image description')
      .populate('driver', 'name phone vehicle')
      .lean();

    if (!order) {
      console.log('❌ Order not found');
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Transform order
    const transformedOrder = {
      ...order,
      id: order._id,
      total: order.pricing?.total || order.total || 0,
      subtotal: order.pricing?.subtotal || order.subtotal || 0,
      deliveryFee: order.pricing?.deliveryFee || order.deliveryFee || 0,
      tax: order.pricing?.tax || order.tax || 0,
      serviceFee: order.pricing?.serviceFee || order.serviceFee || 0
    };

    console.log('✅ Order found:', transformedOrder.orderNumber);
    console.log('=========================================\n');

    res.json({
      success: true,
      order: transformedOrder
    });
  } catch (error) {
    console.error('❌ Error fetching order:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch order',
      error: error.message
    });
  }
});

// ==========================================
// CANCEL ORDER
// ==========================================
router.patch('/:id/cancel', auth, async (req, res) => {
  try {
    console.log('\n========== ❌ CANCEL ORDER ==========');
    console.log('Order ID:', req.params.id);
    console.log('Customer ID:', req.user.id);
    
    const order = await Order.findOne({
      _id: req.params.id,
      user: req.user.id // ✅ FIXED: Use 'user' instead of 'customer'
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Check if order can be cancelled
    const cancellableStatuses = ['pending', 'confirmed'];
    if (!cancellableStatuses.includes(order.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot cancel order with status: ${order.status}`
      });
    }

    order.status = 'cancelled';
    if (order.timestamps) {
      order.timestamps.cancelledAt = new Date();
    }
    await order.save();

    console.log('✅ Order cancelled:', order.orderNumber);
    console.log('====================================\n');

    res.json({
      success: true,
      message: 'Order cancelled successfully',
      order
    });
  } catch (error) {
    console.error('❌ Error cancelling order:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel order',
      error: error.message
    });
  }
});

module.exports = router;