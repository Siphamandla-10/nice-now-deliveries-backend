// routes/orders.js - Enhanced with Customer & Items Display
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { authMiddleware } = require('../middleware/auth');
const Order = require('../models/Order');
const Restaurant = require('../models/Restaurant');

// Test route
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

// GET /api/orders/my-orders - Get user's orders with full customer and items info
router.get('/my-orders', authMiddleware, async (req, res) => {
  console.log('=== GET MY ORDERS DEBUG ===');
  console.log('Request received for /my-orders');
  
  try {
    console.log('User info:', {
      id: req.user._id || req.user.id,
      name: req.user.name,
      email: req.user.email,
      userType: req.user.userType
    });

    const { page = 1, limit = 20, status } = req.query;
    const skip = (page - 1) * limit;
    
    const userId = req.user._id || req.user.id;
    const query = { customer: userId };
    
    if (status) {
      query.status = status;
    }
    
    console.log('Database query:', JSON.stringify(query, null, 2));

    // Fetch orders with FULL customer and items information
    const orders = await Order.find(query)
      .populate({
        path: 'restaurant',
        select: 'name address phone image coverImage'
      })
      .populate({
        path: 'customer',
        select: 'name email phone profilePicture addresses'
      })
      .populate({
        path: 'driver',
        select: 'name phone'
      })
      .populate({
        path: 'items.menuItem',
        select: 'name description price image category'
      })
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(skip);

    console.log('Query executed successfully');
    console.log('Found orders:', orders.length);
    
    // Enhance the orders with formatted data
    const enhancedOrders = orders.map(order => {
      const orderObj = order.toObject();
      
      // Format customer info
      orderObj.customerInfo = {
        id: orderObj.customer._id,
        name: orderObj.customer.name,
        email: orderObj.customer.email,
        phone: orderObj.customer.phone,
        profilePicture: orderObj.customer.profilePicture?.url || null
      };
      
      // Format items with details
      orderObj.itemsDetails = orderObj.items.map(item => ({
        name: item.name,
        quantity: item.quantity,
        price: item.price,
        itemTotal: item.itemTotal || (item.price * item.quantity),
        specialInstructions: item.specialInstructions || null,
        menuItemDetails: item.menuItem ? {
          id: item.menuItem._id,
          name: item.menuItem.name,
          description: item.menuItem.description,
          category: item.menuItem.category,
          image: item.menuItem.image?.url || null
        } : null
      }));
      
      // Add order summary
      orderObj.orderSummary = {
        itemCount: orderObj.items.length,
        totalItems: orderObj.items.reduce((sum, item) => sum + item.quantity, 0),
        subtotal: orderObj.subtotal,
        deliveryFee: orderObj.deliveryFee,
        tax: orderObj.tax,
        total: orderObj.total
      };
      
      return orderObj;
    });

    const total = await Order.countDocuments(query);

    const response = {
      success: true,
      orders: enhancedOrders,
      pagination: {
        current: parseInt(page),
        total: Math.ceil(total / limit),
        hasMore: skip + orders.length < total
      }
    };

    console.log('Sending response with', enhancedOrders.length, 'orders');
    console.log('==========================');
    
    res.json(response);

  } catch (error) {
    console.error('GET MY ORDERS ERROR:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch orders',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// GET /api/orders - Get all orders (for vendors and drivers) WITH CUSTOMER & ITEMS
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
      } catch (error) {
        query.vendor = req.user._id;
      }
    } else if (req.user.userType === 'customer') {
      query.customer = req.user._id;
    } else if (req.user.userType === 'driver') {
      query.driver = req.user._id;
    }

    if (status && status !== 'all') {
      query.status = status;
    }

    console.log('Query:', JSON.stringify(query, null, 2));

    // Fetch with FULL population
    const orders = await Order.find(query)
      .populate({
        path: 'restaurant',
        select: 'name address phone image coverImage cuisine'
      })
      .populate({
        path: 'customer',
        select: 'name email phone profilePicture'
      })
      .populate({
        path: 'driver',
        select: 'name email phone'
      })
      .populate({
        path: 'items.menuItem',
        select: 'name description price image category'
      })
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(skip);

    // Enhance orders with formatted customer and items data
    const enhancedOrders = orders.map(order => {
      const orderObj = order.toObject();
      
      // Customer details
      if (orderObj.customer) {
        orderObj.customerDetails = {
          id: orderObj.customer._id,
          name: orderObj.customer.name,
          email: orderObj.customer.email,
          phone: orderObj.customer.phone || orderObj.customerPhone,
          profilePicture: orderObj.customer.profilePicture?.url || null
        };
      }
      
      // Items with full details
      orderObj.itemsList = orderObj.items.map(item => ({
        itemId: item._id,
        name: item.name,
        quantity: item.quantity,
        unitPrice: item.price,
        totalPrice: item.itemTotal || (item.price * item.quantity),
        specialInstructions: item.specialInstructions,
        menuItem: item.menuItem ? {
          id: item.menuItem._id,
          name: item.menuItem.name,
          description: item.menuItem.description,
          category: item.menuItem.category,
          image: item.menuItem.image?.url || null
        } : null
      }));
      
      // Order totals
      orderObj.totals = {
        itemCount: orderObj.items.length,
        totalQuantity: orderObj.items.reduce((sum, item) => sum + item.quantity, 0),
        subtotal: orderObj.subtotal,
        deliveryFee: orderObj.deliveryFee,
        tax: orderObj.tax,
        grandTotal: orderObj.total
      };
      
      return orderObj;
    });

    const total = await Order.countDocuments(query);

    console.log('Found', enhancedOrders.length, 'orders with customer & items');

    res.json({
      success: true,
      orders: enhancedOrders,
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

// POST /api/orders - Create new order
router.post('/', authMiddleware, async (req, res) => {
  console.log('=== ORDER CREATION DEBUG ===');
  
  try {
    const { restaurantId, items, deliveryAddress, paymentMethod, notes } = req.body;
    
    if (!restaurantId || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Restaurant ID and items are required'
      });
    }

    if (req.user.userType !== 'customer') {
      return res.status(403).json({
        success: false,
        message: 'Only customers can create orders'
      });
    }

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
      restaurant = {
        _id: restaurantId,
        name: req.body.restaurantName || 'Restaurant',
        owner: req.body.vendor || restaurantId,
        deliveryFee: 2.99
      };
    }

    const subtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const deliveryFee = restaurant.deliveryFee || 2.99;
    const tax = Math.round(subtotal * 0.10 * 100) / 100;
    const total = subtotal + deliveryFee + tax;

    const orderData = {
      orderNumber: generateOrderNumber(),
      customer: req.user._id || req.user.id,
      customerName: req.user.name,
      customerPhone: req.user.phone,
      restaurant: restaurantId,
      vendor: restaurant.owner,
      
      items: items.map(item => ({
        name: item.name,
        menuItem: item.menuItemId,
        quantity: item.quantity,
        price: item.price,
        itemTotal: item.price * item.quantity,
        specialInstructions: item.specialInstructions || ''
      })),
      
      subtotal: subtotal,
      deliveryFee: deliveryFee,
      tax: tax,
      total: total,
      
      deliveryAddress: {
        street: deliveryAddress?.street || 'Default Street',
        city: deliveryAddress?.city || 'Default City', 
        state: deliveryAddress?.state || 'Default State',
        zipCode: deliveryAddress?.zipCode || '00000',
        coordinates: {
          latitude: deliveryAddress?.coordinates?.latitude || -26.2041,
          longitude: deliveryAddress?.coordinates?.longitude || 28.0473
        }
      },
      
      paymentMethod: paymentMethod || 'card',
      paymentStatus: 'pending',
      notes: notes || '',
      specialInstructions: req.body.specialInstructions || '',
      status: 'pending'
    };

    const order = new Order(orderData);
    const savedOrder = await order.save();

    // Populate with customer and items details
    const populatedOrder = await Order.findById(savedOrder._id)
      .populate('customer', 'name email phone profilePicture')
      .populate('restaurant', 'name address phone')
      .populate('items.menuItem', 'name description price image category');

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

// GET /api/orders/:id - Get order by ID WITH FULL DETAILS
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    console.log('Getting order by ID:', req.params.id);
    
    const order = await Order.findById(req.params.id)
      .populate({
        path: 'restaurant',
        select: 'name address phone image coverImage cuisine'
      })
      .populate({
        path: 'customer',
        select: 'name email phone profilePicture addresses'
      })
      .populate({
        path: 'driver',
        select: 'name phone'
      })
      .populate({
        path: 'items.menuItem',
        select: 'name description price image category'
      });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Check access permissions
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

    // Enhance order with formatted data
    const orderObj = order.toObject();
    
    orderObj.customerInfo = {
      id: orderObj.customer._id,
      name: orderObj.customer.name,
      email: orderObj.customer.email,
      phone: orderObj.customer.phone,
      profilePicture: orderObj.customer.profilePicture?.url || null
    };
    
    orderObj.itemsDetails = orderObj.items.map(item => ({
      name: item.name,
      quantity: item.quantity,
      unitPrice: item.price,
      totalPrice: item.itemTotal || (item.price * item.quantity),
      specialInstructions: item.specialInstructions,
      menuItem: item.menuItem ? {
        id: item.menuItem._id,
        name: item.menuItem.name,
        description: item.menuItem.description,
        category: item.menuItem.category,
        image: item.menuItem.image?.url || null
      } : null
    }));
    
    console.log('Order found with customer:', orderObj.customerInfo.name);
    console.log('Total items:', orderObj.items.length);
    
    res.json({
      success: true,
      order: orderObj
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

    const validStatuses = ['pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status'
      });
    }

    const order = await Order.findById(orderId)
      .populate('customer', 'name email phone')
      .populate('items.menuItem', 'name price');
      
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    order.status = status;
    order[`${status}At`] = new Date();
    await order.save();

    console.log('Order status updated for customer:', order.customer.name);

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

// POST /api/orders/:orderId/request-driver
router.post('/:orderId/request-driver', authMiddleware, async (req, res) => {
  try {
    const { orderId } = req.params;
    
    const order = await Order.findById(orderId)
      .populate('customer', 'name phone')
      .populate('items.menuItem', 'name');
      
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    
    let restaurant;
    try {
      restaurant = await Restaurant.findOne({ 
        _id: order.restaurant, 
        owner: req.user._id 
      });
    } catch (error) {
      if (order.vendor && order.vendor.toString() === req.user._id.toString()) {
        restaurant = { _id: order.restaurant };
      }
    }
    
    if (!restaurant && req.user.userType !== 'vendor') {
      return res.status(403).json({ 
        success: false, 
        message: 'You can only request drivers for your restaurant orders' 
      });
    }
    
    if (!['pending', 'confirmed', 'preparing', 'ready'].includes(order.status)) {
      return res.status(400).json({
        success: false,
        message: 'Order must be confirmed or preparing to request a driver'
      });
    }
    
    order.status = 'ready';
    order.driverRequested = true;
    order.driverRequestedAt = new Date();
    await order.save();
    
    console.log('Driver requested for order from customer:', order.customer.name);
    
    res.json({
      success: true,
      message: 'Driver requested successfully',
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

// Debug route to check all orders
router.get('/debug/all', authMiddleware, async (req, res) => {
  try {
    const allOrders = await Order.find({})
      .populate('customer', 'name email phone')
      .populate('items.menuItem', 'name price')
      .select('_id customer orderNumber status total items createdAt');
    
    const ordersWithDetails = allOrders.map(order => ({
      id: order._id,
      orderNumber: order.orderNumber,
      status: order.status,
      total: order.total,
      customer: {
        id: order.customer._id,
        name: order.customer.name,
        email: order.customer.email,
        phone: order.customer.phone
      },
      items: order.items.map(item => ({
        name: item.name,
        quantity: item.quantity,
        price: item.price
      })),
      itemCount: order.items.length,
      createdAt: order.createdAt
    }));
    
    res.json({
      success: true,
      totalOrders: allOrders.length,
      orders: ordersWithDetails,
      currentUserId: req.user._id || req.user.id
    });
  } catch (error) {
    console.error('Debug route error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;