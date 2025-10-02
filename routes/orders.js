// routes/orders.js - Complete Enhanced Version with Test Route
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { authMiddleware } = require('../middleware/auth');
const Order = require('../models/Order');
const Restaurant = require('../models/Restaurant'); // Add this if you have it

// Test route to verify enhanced routes are loaded
router.get('/test-debug', (req, res) => {
  console.log('ENHANCED ROUTES LOADED SUCCESSFULLY');
  res.json({ message: 'Enhanced debug routes are working!', timestamp: new Date() });
});

// Generate order number
const generateOrderNumber = () => {
  const date = new Date();
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
  const randomNum = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `ORD-${dateStr}-${randomNum}`;
};

// GET /api/orders/my-orders - Get user's orders (WITH COMPREHENSIVE DEBUG LOGGING)
router.get('/my-orders', authMiddleware, async (req, res) => {
  console.log('=== GET MY ORDERS DEBUG ===');
  console.log('Request received for /my-orders');
  
  try {
    // Log user info
    console.log('User info:', {
      id: req.user._id || req.user.id,
      name: req.user.name,
      email: req.user.email,
      userType: req.user.userType
    });

    const { page = 1, limit = 20, status } = req.query;
    const skip = (page - 1) * limit;
    
    console.log('Query params:', { page, limit, status, skip });

    // Build query
    const userId = req.user._id || req.user.id;
    const query = { customer: userId };
    
    if (status) {
      query.status = status;
    }
    
    console.log('Database query:', JSON.stringify(query, null, 2));
    console.log('Looking for orders with customer ID:', userId);

    // First, check if any orders exist at all
    const totalOrdersInDB = await Order.countDocuments({});
    console.log('Total orders in database:', totalOrdersInDB);
    
    // Check orders for this specific user
    const userOrderCount = await Order.countDocuments(query);
    console.log('Orders for this customer:', userOrderCount);

    // If no orders for user, let's see what customer IDs exist
    if (userOrderCount === 0) {
      console.log('No orders found for this customer');
      
      // Check what customer IDs exist in the database
      const existingCustomerIds = await Order.distinct('customer');
      console.log('Existing customer IDs in orders:', existingCustomerIds);
      
      // Check if any orders have this user ID as string vs ObjectId
      const userIdString = userId.toString();
      const alternativeQuery = { customer: userIdString };
      const altCount = await Order.countDocuments(alternativeQuery);
      console.log('Alternative query result (string ID):', altCount);
      
      // Try to find orders with ObjectId conversion
      try {
        const objectIdQuery = { customer: new mongoose.Types.ObjectId(userId) };
        const objectIdCount = await Order.countDocuments(objectIdQuery);
        console.log('ObjectId query result:', objectIdCount);
      } catch (objIdError) {
        console.log('ObjectId conversion failed:', objIdError.message);
      }
    }

    // Fetch the orders
    console.log('Executing main query...');
    const orders = await Order.find(query)
      .populate('restaurant', 'name address phone')
      .populate('customer', 'name email phone')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(skip);

    console.log('Query executed successfully');
    console.log('Found orders:', orders.length);
    
    if (orders.length > 0) {
      console.log('Sample order:', {
        id: orders[0]._id,
        orderNumber: orders[0].orderNumber,
        status: orders[0].status,
        total: orders[0].total,
        restaurant: orders[0].restaurant?.name,
        createdAt: orders[0].createdAt,
        customer: orders[0].customer
      });
    }

    const total = await Order.countDocuments(query);
    console.log('Total matching orders:', total);

    const response = {
      success: true,
      orders,
      pagination: {
        current: parseInt(page),
        total: Math.ceil(total / limit),
        hasMore: skip + orders.length < total
      }
    };

    console.log('Sending response with', orders.length, 'orders');
    console.log('==========================');
    
    res.json(response);

  } catch (error) {
    console.error('GET MY ORDERS ERROR:', error);
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    console.log('==========================');
    
    res.status(500).json({
      success: false,
      message: 'Failed to fetch orders',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// POST /api/orders - Create new order
router.post('/', authMiddleware, async (req, res) => {
  console.log('=== ORDER CREATION DEBUG ===');
  console.log('Order creation attempt started');
  console.log('User from middleware:', {
    id: req.user._id || req.user.id,
    name: req.user.name,
    email: req.user.email,
    userType: req.user.userType
  });
  console.log('Order data received:', JSON.stringify(req.body, null, 2));
  console.log('============================');

  try {
    const { restaurantId, items, deliveryAddress, paymentMethod, notes } = req.body;
    
    // Validate required fields
    if (!restaurantId || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Restaurant ID and items are required'
      });
    }

    // Ensure user is customer
    if (req.user.userType !== 'customer') {
      return res.status(403).json({
        success: false,
        message: 'Only customers can create orders'
      });
    }

    console.log('User is customer, creating order...');

    // Get restaurant info (if Restaurant model exists)
    let restaurant;
    try {
      restaurant = await Restaurant.findById(restaurantId);
      if (!restaurant) {
        return res.status(404).json({
          success: false,
          message: 'Restaurant not found'
        });
      }
    } catch (error) {
      console.warn('Restaurant model not found, using basic data');
      // Create mock restaurant data
      restaurant = {
        _id: restaurantId,
        name: req.body.restaurantName || 'Restaurant',
        owner: req.body.vendor || restaurantId
      };
    }

    // Calculate totals
    const subtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const deliveryFee = restaurant.deliveryFee || 2.99;
    const tax = Math.round(subtotal * 0.10 * 100) / 100; // 10% tax
    const total = subtotal + deliveryFee + tax;

    // Prepare order data
    const orderData = {
      orderNumber: generateOrderNumber(),
      customer: req.user._id || req.user.id,
      restaurant: restaurantId,
      vendor: restaurant.owner,
      
      // Fix items structure
      items: items.map(item => ({
        name: item.name, // Make sure name is included
        menuItem: item.menuItemId,
        quantity: item.quantity,
        price: item.price,
        itemTotal: item.price * item.quantity
      })),
      
      subtotal: subtotal,
      deliveryFee: deliveryFee,
      tax: tax,
      total: total,
      
      // Fix delivery address with default coordinates
      deliveryAddress: {
        street: deliveryAddress?.street || 'Default Street',
        city: deliveryAddress?.city || 'Default City', 
        state: deliveryAddress?.state || 'Default State',
        zipCode: deliveryAddress?.zipCode || '00000',
        coordinates: {
          latitude: deliveryAddress?.coordinates?.latitude || -26.2041, // Johannesburg default
          longitude: deliveryAddress?.coordinates?.longitude || 28.0473
        }
      },
      
      // Fix payment method
      payment: {
        method: paymentMethod || 'card',
        status: 'pending'
      },
      
      customerPhone: req.user.phone,
      notes: notes || '',
      specialInstructions: req.body.specialInstructions || '',
      status: 'pending',
      paymentStatus: 'pending'
    };

    console.log('Final order data:', JSON.stringify(orderData, null, 2));
    console.log('Order model created, attempting to save...');

    // Create and save order
    const order = new Order(orderData);
    const savedOrder = await order.save();

    console.log('Order saved successfully:', savedOrder._id);

    // Populate the order for response
    const populatedOrder = await Order.findById(savedOrder._id)
      .populate('customer', 'name email phone')
      .populate('restaurant', 'name address phone');

    res.status(201).json({
      success: true,
      message: 'Order created successfully',
      order: populatedOrder
    });

  } catch (error) {
    console.error('Order creation error:', error);
    
    if (error.name === 'ValidationError') {
      const errors = Object.keys(error.errors).map(key => ({
        field: key,
        message: error.errors[key].message
      }));
      
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: errors
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Error creating order',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// GET /api/orders/:id - Get order by ID
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    console.log('Getting order by ID:', req.params.id);
    
    const order = await Order.findById(req.params.id)
      .populate('restaurant', 'name address phone')
      .populate('customer', 'name email phone')
      .populate('driver', 'name phone');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Check if user owns this order or is the driver/restaurant
    const userId = req.user._id || req.user.id;
    const canAccess = order.customer._id.toString() === userId.toString() ||
                     order.driver?._id.toString() === userId.toString() ||
                     req.user.userType === 'vendor';

    if (!canAccess) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    console.log('Order found and access granted');
    
    res.json({
      success: true,
      order
    });
  } catch (error) {
    console.error('Get order error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch order'
    });
  }
});

// PATCH /api/orders/:id/status - Update order status
router.patch('/:id/status', authMiddleware, async (req, res) => {
  try {
    const { status } = req.body;
    const orderId = req.params.id;

    console.log('Updating order status:', orderId, 'to', status);

    const validStatuses = ['pending', 'confirmed', 'accepted', 'picked_up', 'on_route', 'delivered', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status'
      });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Update status with timestamp
    order.status = status;
    order[`${status}At`] = new Date();

    await order.save();

    console.log('Order status updated successfully');

    res.json({
      success: true,
      message: 'Order status updated',
      order
    });
  } catch (error) {
    console.error('Update order status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update order status'
    });
  }
});

// POST /api/orders/:orderId/request-driver - Request driver for order
router.post('/:orderId/request-driver', authMiddleware, async (req, res) => {
  try {
    const { orderId } = req.params;
    console.log('Vendor requesting driver for order:', orderId);
    
    // Find the order
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    
    // Verify the vendor owns this order's restaurant
    let restaurant;
    try {
      restaurant = await Restaurant.findOne({ 
        _id: order.restaurant, 
        owner: req.user._id 
      });
    } catch (error) {
      console.log('Restaurant model not found, checking vendor field');
      // If no Restaurant model, check vendor field directly
      if (order.vendor && order.vendor.toString() === req.user._id.toString()) {
        restaurant = { _id: order.restaurant }; // Mock restaurant object
      }
    }
    
    if (!restaurant && req.user.userType !== 'vendor') {
      return res.status(403).json({ 
        success: false, 
        message: 'You can only request drivers for your restaurant orders' 
      });
    }
    
    // Check if order is in correct status
    if (!['pending', 'confirmed', 'preparing', 'ready'].includes(order.status)) {
      return res.status(400).json({
        success: false,
        message: 'Order must be confirmed or preparing to request a driver'
      });
    }
    
    // Update order status to ready (so drivers can see it)
    order.status = 'ready';
    order.driverRequested = true;
    order.driverRequestedAt = new Date();
    await order.save();
    
    console.log('Driver requested for order', orderId, '- marked as ready');
    
    res.json({
      success: true,
      message: 'Driver requested successfully. Order is now available for drivers to accept.',
      order: order
    });
    
  } catch (error) {
    console.error('Request driver error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to request driver', 
      error: error.message 
    });
  }
});

// GET /api/orders - Get all orders (for vendors and drivers)
router.get('/', authMiddleware, async (req, res) => {
  try {
    console.log('Getting all orders for user type:', req.user.userType);
    
    const { status, page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;

    let query = {};
    
    // Filter by user role
    if (req.user.userType === 'vendor') {
      try {
        const restaurants = await Restaurant.find({ owner: req.user._id }).select('_id');
        query.restaurant = { $in: restaurants.map(r => r._id) };
        console.log('Vendor query - restaurants:', restaurants.length);
      } catch (error) {
        // If no Restaurant model, use vendor field
        query.vendor = req.user._id;
        console.log('Using vendor field fallback');
      }
    } else if (req.user.userType === 'customer') {
      query.customer = req.user._id;
    } else if (req.user.userType === 'driver') {
      query.driver = req.user._id;
    }

    if (status && status !== 'all') {
      query.status = status;
    }

    console.log('Final query:', JSON.stringify(query, null, 2));

    const orders = await Order.find(query)
      .populate('restaurant', 'name address phone')
      .populate('customer', 'name email phone')
      .populate('driver', 'name email phone')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(skip);

    const total = await Order.countDocuments(query);

    console.log('Found', orders.length, 'orders out of', total, 'total');

    res.json({
      success: true,
      orders,
      pagination: {
        current: parseInt(page),
        total: Math.ceil(total / limit),
        hasMore: skip + orders.length < total
      }
    });
  } catch (error) {
    console.error('Get orders error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch orders', 
      error: error.message 
    });
  }
});

// Additional debug route to check all orders in database
router.get('/debug/all', authMiddleware, async (req, res) => {
  try {
    console.log('DEBUG: Getting all orders in database');
    
    const allOrders = await Order.find({}).select('_id customer orderNumber status total createdAt');
    
    console.log('Total orders in DB:', allOrders.length);
    
    const ordersByCustomer = {};
    allOrders.forEach(order => {
      const customerId = order.customer.toString();
      if (!ordersByCustomer[customerId]) {
        ordersByCustomer[customerId] = [];
      }
      ordersByCustomer[customerId].push({
        id: order._id,
        orderNumber: order.orderNumber,
        status: order.status,
        total: order.total
      });
    });
    
    res.json({
      success: true,
      totalOrders: allOrders.length,
      ordersByCustomer: ordersByCustomer,
      currentUserId: req.user._id || req.user.id
    });
  } catch (error) {
    console.error('Debug route error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;