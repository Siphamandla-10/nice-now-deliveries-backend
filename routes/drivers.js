const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const Driver = require('../models/Driver');
const Order = require('../models/Order');

const driverMiddleware = (req, res, next) => {
  if (req.user.userType !== 'driver') {
    return res.status(403).json({ success: false, message: 'Access denied: Drivers only' });
  }
  next();
};

// Get driver profile
router.get('/profile', authMiddleware, driverMiddleware, async (req, res) => {
  try {
    const driver = await Driver.findOne({ user: req.user._id }).populate('user', 'name email phone');
    
    if (!driver) {
      return res.status(404).json({ success: false, message: 'Driver profile not found' });
    }
    
    res.json({ success: true, driver });
  } catch (error) {
    console.error('Get driver profile error:', error);
    res.status(500).json({ success: false, message: 'Error fetching profile', error: error.message });
  }
});

// Update driver status
router.put('/status', authMiddleware, driverMiddleware, async (req, res) => {
  try {
    const { status } = req.body;
    
    console.log('Updating driver status for user:', req.user._id, 'to:', status);
    
    if (!['online', 'offline', 'busy', 'break'].includes(status)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid status. Must be: online, offline, busy, or break' 
      });
    }
    
    let driver = await Driver.findOne({ user: req.user._id });
    
    if (!driver) {
      console.log('Driver profile not found. Creating new profile...');
      driver = new Driver({
        user: req.user._id,
        status: status,
        isAvailable: status === 'online',
        isActive: true,
        vehicle: { 
          type: 'car', 
          make: 'Unknown',
          model: 'Unknown', 
          licensePlate: 'Not Set' 
        },
        location: {
          current: {
            type: 'Point',
            coordinates: [28.0473, -26.2041]
          }
        }
      });
      await driver.save();
      console.log('Driver profile created successfully');
    } else {
      driver.status = status;
      driver.isAvailable = status === 'online';
      await driver.save();
      console.log('Driver status updated successfully');
    }
    
    res.json({ 
      success: true, 
      message: 'Status updated successfully',
      driver: {
        _id: driver._id,
        status: driver.status,
        isAvailable: driver.isAvailable
      }
    });
  } catch (error) {
    console.error('Update driver status error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error updating status', 
      error: error.message 
    });
  }
});

// Update driver location
router.put('/location', authMiddleware, driverMiddleware, async (req, res) => {
  try {
    const { latitude, longitude } = req.body;
    
    console.log('Updating location:', { latitude, longitude });
    
    if (!latitude || !longitude) {
      return res.status(400).json({ 
        success: false, 
        message: 'Latitude and longitude are required' 
      });
    }
    
    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    
    if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid coordinates' 
      });
    }
    
    const driver = await Driver.findOne({ user: req.user._id });
    
    if (!driver) {
      return res.status(404).json({ 
        success: false, 
        message: 'Driver profile not found' 
      });
    }
    
    driver.location.current.coordinates = [lng, lat];
    driver.location.lastUpdated = new Date();
    await driver.save();
    
    console.log('Location updated successfully');
    
    res.json({ 
      success: true, 
      message: 'Location updated successfully',
      location: {
        latitude: lat,
        longitude: lng
      }
    });
  } catch (error) {
    console.error('Update driver location error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error updating location', 
      error: error.message 
    });
  }
});

// Get available orders
router.get('/available-orders', authMiddleware, driverMiddleware, async (req, res) => {
  try {
    const { lat, lng, radius = 10 } = req.query;
    
    console.log('Fetching available orders:', { lat, lng, radius });
    
    let query = {
      status: 'ready',
      $or: [
        { driver: { $exists: false } },
        { driver: null }
      ]
    };
    
    if (lat && lng) {
      const latitude = parseFloat(lat);
      const longitude = parseFloat(lng);
      const radiusKm = parseFloat(radius);
      
      if (!isNaN(latitude) && !isNaN(longitude) && !isNaN(radiusKm)) {
        query['deliveryAddress.coordinates'] = {
          $near: {
            $geometry: {
              type: 'Point',
              coordinates: [longitude, latitude]
            },
            $maxDistance: radiusKm * 1000
          }
        };
      }
    }
    
    const orders = await Order.find(query)
      .populate('restaurant', 'name address phone')
      .populate('customer', 'name phone')
      .sort({ createdAt: -1 })
      .limit(20);
    
    console.log(`Found ${orders.length} available orders`);
    
    res.json({ success: true, orders });
  } catch (error) {
    console.error('Get available orders error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching orders', 
      error: error.message 
    });
  }
});

// Accept order - FIXED: Changed status from 'accepted' to 'confirmed'
router.post('/accept-order/:orderId', authMiddleware, driverMiddleware, async (req, res) => {
  try {
    const { orderId } = req.params;
    
    console.log('Driver accepting order:', orderId);
    
    const driver = await Driver.findOne({ user: req.user._id });
    if (!driver) {
      return res.status(404).json({ 
        success: false, 
        message: 'Driver profile not found' 
      });
    }
    
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ 
        success: false, 
        message: 'Order not found' 
      });
    }
    
    if (order.driver) {
      return res.status(400).json({ 
        success: false, 
        message: 'Order already assigned to another driver' 
      });
    }
    
    // Update order - FIXED: Use 'confirmed' instead of 'accepted'
    order.driver = driver._id;
    order.status = 'confirmed'; // Changed from 'accepted' to match Order model enum
    order.confirmedAt = new Date();
    await order.save();
    
    console.log('Order status set to confirmed');
    
    // Update driver status
    driver.status = 'busy';
    driver.isAvailable = false;
    driver.currentDelivery = order._id;
    await driver.save();
    
    console.log('Driver status updated to busy');
    
    const populatedOrder = await Order.findById(orderId)
      .populate('restaurant', 'name address phone')
      .populate('customer', 'name phone address');
    
    console.log('Order accepted successfully');
    
    res.json({ 
      success: true, 
      message: 'Order accepted successfully', 
      order: populatedOrder 
    });
  } catch (error) {
    console.error('Accept order error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error accepting order', 
      error: error.message 
    });
  }
});

// Get driver orders
router.get('/orders', authMiddleware, driverMiddleware, async (req, res) => {
  try {
    const { status = 'all', page = 1, limit = 20 } = req.query;
    
    const driver = await Driver.findOne({ user: req.user._id });
    if (!driver) {
      return res.json({ success: true, orders: [] });
    }
    
    let query = { driver: driver._id };
    
    if (status !== 'all') {
      query.status = status;
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const orders = await Order.find(query)
      .populate('restaurant', 'name address phone')
      .populate('customer', 'name phone')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    const total = await Order.countDocuments(query);
    
    res.json({ 
      success: true, 
      orders,
      pagination: {
        current: parseInt(page),
        total: Math.ceil(total / parseInt(limit)),
        totalOrders: total
      }
    });
  } catch (error) {
    console.error('Get driver orders error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching orders', 
      error: error.message 
    });
  }
});

// Update order status - FIXED: Updated valid statuses
router.patch('/orders/:orderId/status', authMiddleware, driverMiddleware, async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body;
    
    console.log('Updating order status:', { orderId, status });
    
    if (!status) {
      return res.status(400).json({ 
        success: false, 
        message: 'Status is required' 
      });
    }
    
    // Updated valid statuses to match Order model enum
    const validStatuses = ['confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ 
        success: false, 
        message: `Invalid status. Must be one of: ${validStatuses.join(', ')}` 
      });
    }
    
    const driver = await Driver.findOne({ user: req.user._id });
    if (!driver) {
      return res.status(404).json({ 
        success: false, 
        message: 'Driver profile not found' 
      });
    }
    
    const order = await Order.findOne({ 
      _id: orderId, 
      driver: driver._id 
    });
    
    if (!order) {
      return res.status(404).json({ 
        success: false, 
        message: 'Order not found or not assigned to you' 
      });
    }
    
    // Update order status
    order.status = status;
    
    // Set appropriate timestamp based on status
    if (status === 'confirmed') order.confirmedAt = new Date();
    if (status === 'preparing') order.preparingAt = new Date();
    if (status === 'ready') order.readyAt = new Date();
    if (status === 'out_for_delivery') order.out_for_deliveryAt = new Date();
    if (status === 'delivered') order.deliveredAt = new Date();
    
    await order.save();
    
    // Update driver status based on order status
    if (status === 'delivered') {
      driver.status = 'online';
      driver.isAvailable = true;
      driver.currentDelivery = null;
      driver.metrics.completedDeliveries += 1;
      driver.metrics.totalDeliveries += 1;
      driver.metrics.totalEarnings += (order.driverEarning || 20);
      await driver.save();
    }
    
    console.log('Order status updated successfully to:', status);
    
    res.json({ 
      success: true, 
      message: 'Order status updated successfully',
      order 
    });
  } catch (error) {
    console.error('Update order status error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error updating order status', 
      error: error.message 
    });
  }
});

// Get driver notifications
router.get('/notifications', authMiddleware, driverMiddleware, async (req, res) => {
  try {
    console.log('Fetching notifications for driver:', req.user._id);
    
    const orders = await Order.find({
      status: 'ready',
      $or: [
        { driver: { $exists: false } },
        { driver: null }
      ]
    })
    .populate('restaurant', 'name address')
    .populate('customer', 'name phone')
    .sort({ createdAt: -1 })
    .limit(10);
    
    const notifications = orders.map(order => ({
      _id: order._id,
      orderId: order._id,
      type: 'new_order',
      message: `New delivery request from ${order.restaurant?.name || 'Restaurant'}`,
      order: order,
      timestamp: order.createdAt,
      read: false
    }));
    
    console.log(`Returning ${notifications.length} notifications`);
    
    res.json({ success: true, notifications });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching notifications', 
      error: error.message 
    });
  }
});

// Get driver stats
router.get('/stats', authMiddleware, driverMiddleware, async (req, res) => {
  try {
    const driver = await Driver.findOne({ user: req.user._id });
    
    if (!driver) {
      return res.json({
        success: true,
        today: { deliveries: 0 },
        allTime: { deliveries: 0, avgRating: 0, acceptanceRate: 0 }
      });
    }
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayDeliveries = await Order.countDocuments({
      driver: driver._id,
      status: 'delivered',
      deliveredAt: { $gte: today }
    });
    
    res.json({
      success: true,
      today: { deliveries: todayDeliveries },
      allTime: { 
        deliveries: driver.metrics.completedDeliveries || 0,
        avgRating: driver.metrics.averageRating || 0,
        acceptanceRate: 85
      }
    });
  } catch (error) {
    console.error('Get driver stats error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching stats', 
      error: error.message 
    });
  }
});

// Get driver earnings
router.get('/earnings', authMiddleware, driverMiddleware, async (req, res) => {
  try {
    const driver = await Driver.findOne({ user: req.user._id });
    
    if (!driver) {
      return res.json({
        success: true,
        earnings: { today: 0, week: 0, total: 0 }
      });
    }
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    weekAgo.setHours(0, 0, 0, 0);
    
    const todayOrders = await Order.find({
      driver: driver._id,
      status: 'delivered',
      deliveredAt: { $gte: today }
    }).select('driverEarning');
    
    const weekOrders = await Order.find({
      driver: driver._id,
      status: 'delivered',
      deliveredAt: { $gte: weekAgo }
    }).select('driverEarning');
    
    const todayEarnings = todayOrders.reduce((sum, o) => sum + (o.driverEarning || 0), 0);
    const weekEarnings = weekOrders.reduce((sum, o) => sum + (o.driverEarning || 0), 0);
    
    res.json({
      success: true,
      earnings: {
        today: todayEarnings,
        week: weekEarnings,
        total: driver.metrics.totalEarnings || 0
      }
    });
  } catch (error) {
    console.error('Get driver earnings error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching earnings', 
      error: error.message 
    });
  }
});

// Get active delivery - FIXED: Updated status query to match Order model enum
router.get('/active-delivery', authMiddleware, driverMiddleware, async (req, res) => {
  try {
    const driver = await Driver.findOne({ user: req.user._id });
    
    if (!driver) {
      return res.json({ success: true, delivery: null });
    }
    
    // Updated to use valid Order model statuses
    const activeOrder = await Order.findOne({
      driver: driver._id,
      status: { $in: ['confirmed', 'preparing', 'ready', 'out_for_delivery'] }
    })
    .populate('restaurant', 'name address phone')
    .populate('customer', 'name phone address');
    
    res.json({ success: true, delivery: activeOrder });
  } catch (error) {
    console.error('Get active delivery error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching active delivery', 
      error: error.message 
    });
  }
});

module.exports = router;