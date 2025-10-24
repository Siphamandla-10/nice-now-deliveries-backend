// routes/drivers.js - FIXED VERSION - Complete Driver Routes for Dashboard
const express = require('express');
const router = express.Router();
const Driver = require('../models/Driver');
const Order = require('../models/Order');

// Import auth middleware - make sure this exists in your project
// If you don't have this, create it or adjust the path
let protect;
try {
  const authMiddleware = require('../middleware/auth');
  protect = authMiddleware.protect || authMiddleware.default || authMiddleware;
} catch (error) {
  console.error('⚠️  Could not load auth middleware:', error.message);
  // Fallback protect middleware if auth.js doesn't exist
  protect = async (req, res, next) => {
    try {
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) {
        return res.status(401).json({
          success: false,
          message: 'No authorization token provided'
        });
      }
      
      const jwt = require('jsonwebtoken');
      const User = require('../models/User');
      
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
      const user = await User.findById(decoded.userId || decoded.id).select('-password');
      
      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'User not found'
        });
      }
      
      req.user = user;
      next();
    } catch (error) {
      console.error('Auth error:', error);
      res.status(401).json({
        success: false,
        message: 'Invalid or expired token'
      });
    }
  };
}

// Middleware to check if user is a driver
const isDriver = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    if (req.user.role !== 'driver' && req.user.userType !== 'driver') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Driver role required.'
      });
    }

    // Get driver profile
    const driver = await Driver.findOne({ user: req.user._id });
    
    if (!driver) {
      return res.status(404).json({
        success: false,
        message: 'Driver profile not found'
      });
    }

    req.driver = driver;
    next();
  } catch (error) {
    console.error('isDriver middleware error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error in driver verification'
    });
  }
};

// ========== ROUTES ==========

// @route   GET /api/drivers/stats
// @desc    Get driver dashboard statistics
// @access  Private (Driver only)
router.get('/stats', protect, isDriver, async (req, res) => {
  try {
    const driver = req.driver;

    // Get available orders count (orders looking for drivers)
    const availableOrdersCount = await Order.countDocuments({
      status: { $in: ['confirmed', 'pending'] },
      driver: null,
      isActive: true
    });

    // Get active deliveries count (orders assigned to this driver)
    const activeDeliveriesCount = await Order.countDocuments({
      driver: driver._id,
      status: { $in: ['assigned', 'picked_up', 'on_the_way'] }
    });

    // Get completed deliveries today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const completedToday = await Order.countDocuments({
      driver: driver._id,
      status: 'delivered',
      updatedAt: { $gte: today }
    });

    // Calculate today's earnings
    const todayEarnings = await Order.aggregate([
      {
        $match: {
          driver: driver._id,
          status: 'delivered',
          updatedAt: { $gte: today }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: { $ifNull: ['$deliveryFee', 0] } }
        }
      }
    ]);

    const earnings = todayEarnings.length > 0 ? todayEarnings[0].total : 0;

    res.json({
      success: true,
      stats: {
        availableOrders: availableOrdersCount,
        activeDeliveries: activeDeliveriesCount,
        completedToday,
        earnings: Number(earnings).toFixed(2)
      }
    });
  } catch (error) {
    console.error('Error getting driver stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get driver statistics'
    });
  }
});

// @route   GET /api/drivers/available-orders
// @desc    Get available orders for drivers to accept
// @access  Private (Driver only)
router.get('/available-orders', protect, isDriver, async (req, res) => {
  try {
    const driver = req.driver;

    // Find orders that need a driver
    const orders = await Order.find({
      status: { $in: ['confirmed', 'pending'] },
      driver: null,
      isActive: true
    })
      .populate('restaurant', 'name address location')
      .populate('customer', 'name phone')
      .populate('user', 'name phone email')
      .sort({ createdAt: -1 })
      .limit(20);

    // Filter orders within driver's working radius if location is available
    let filteredOrders = orders;
    
    if (driver.location && driver.location.current && driver.location.current.coordinates) {
      const maxDistance = driver.preferences?.maxDeliveryDistance || 10; // km
      
      filteredOrders = orders.filter(order => {
        if (!order.restaurant?.location?.coordinates) return true;
        
        // Calculate distance (simple approximation)
        const driverCoords = driver.location.current.coordinates;
        const restaurantCoords = order.restaurant.location.coordinates;
        
        const distance = calculateDistance(
          driverCoords[1], driverCoords[0],
          restaurantCoords[1], restaurantCoords[0]
        );
        
        return distance <= maxDistance;
      });
    }

    res.json({
      success: true,
      orders: filteredOrders,
      count: filteredOrders.length
    });
  } catch (error) {
    console.error('Error getting available orders:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get available orders',
      error: error.message
    });
  }
});

// @route   GET /api/drivers/active-deliveries
// @desc    Get driver's active deliveries
// @access  Private (Driver only)
router.get('/active-deliveries', protect, isDriver, async (req, res) => {
  try {
    const driver = req.driver;

    const deliveries = await Order.find({
      driver: driver._id,
      status: { $in: ['assigned', 'picked_up', 'on_the_way'] }
    })
      .populate('restaurant', 'name address phone')
      .populate('customer', 'name phone')
      .populate('user', 'name phone email')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      deliveries,
      count: deliveries.length
    });
  } catch (error) {
    console.error('Error getting active deliveries:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get active deliveries',
      error: error.message
    });
  }
});

// @route   POST /api/drivers/accept-order
// @desc    Accept an available order
// @access  Private (Driver only)
router.post('/accept-order', protect, isDriver, async (req, res) => {
  try {
    const { orderId } = req.body;
    const driver = req.driver;

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: 'Order ID is required'
      });
    }

    // Check if driver is available
    if (!driver.isAvailable || driver.status !== 'online') {
      return res.status(400).json({
        success: false,
        message: 'You must be online and available to accept orders'
      });
    }

    // Check if driver already has an active delivery
    const activeDelivery = await Order.findOne({
      driver: driver._id,
      status: { $in: ['assigned', 'picked_up', 'on_the_way'] }
    });

    if (activeDelivery) {
      return res.status(400).json({
        success: false,
        message: 'Please complete your current delivery before accepting a new order'
      });
    }

    // Find and update the order
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
        message: 'This order has already been accepted by another driver'
      });
    }

    if (!['confirmed', 'pending'].includes(order.status)) {
      return res.status(400).json({
        success: false,
        message: 'This order is not available for pickup'
      });
    }

    // Assign order to driver
    order.driver = driver._id;
    order.status = 'assigned';
    order.assignedAt = new Date();
    await order.save();

    // Update driver status
    driver.status = 'busy';
    driver.isAvailable = false;
    driver.currentDelivery = order._id;
    await driver.save();

    // Populate order details
    await order.populate([
      { path: 'restaurant', select: 'name address phone location' },
      { path: 'customer', select: 'name phone' },
      { path: 'user', select: 'name phone email' }
    ]);

    res.json({
      success: true,
      message: 'Order accepted successfully',
      order
    });
  } catch (error) {
    console.error('Error accepting order:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to accept order',
      error: error.message
    });
  }
});

// @route   GET /api/drivers/deliveries/:id
// @desc    Get delivery details
// @access  Private (Driver only)
router.get('/deliveries/:id', protect, isDriver, async (req, res) => {
  try {
    const delivery = await Order.findById(req.params.id)
      .populate('restaurant', 'name address phone location')
      .populate('customer', 'name phone')
      .populate('user', 'name phone email')
      .populate('driver', 'user vehicle');

    if (!delivery) {
      return res.status(404).json({
        success: false,
        message: 'Delivery not found'
      });
    }

    // Ensure this delivery belongs to the requesting driver
    if (delivery.driver._id.toString() !== req.driver._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    res.json({
      success: true,
      delivery
    });
  } catch (error) {
    console.error('Error getting delivery details:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get delivery details',
      error: error.message
    });
  }
});

// @route   PUT /api/drivers/deliveries/:id/status
// @desc    Update delivery status
// @access  Private (Driver only)
router.put('/deliveries/:id/status', protect, isDriver, async (req, res) => {
  try {
    const { status, location } = req.body;
    const driver = req.driver;

    const validStatuses = ['picked_up', 'on_the_way', 'delivered'];
    
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status'
      });
    }

    const delivery = await Order.findById(req.params.id);

    if (!delivery) {
      return res.status(404).json({
        success: false,
        message: 'Delivery not found'
      });
    }

    if (delivery.driver.toString() !== driver._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Update order status
    delivery.status = status;
    
    if (status === 'picked_up') {
      delivery.pickedUpAt = new Date();
    } else if (status === 'delivered') {
      delivery.deliveredAt = new Date();
      
      // Update driver stats
      driver.metrics = driver.metrics || {};
      driver.metrics.totalDeliveries = (driver.metrics.totalDeliveries || 0) + 1;
      driver.metrics.completedDeliveries = (driver.metrics.completedDeliveries || 0) + 1;
      driver.metrics.totalEarnings = (driver.metrics.totalEarnings || 0) + (delivery.deliveryFee || 0);
      driver.currentDelivery = null;
      driver.status = 'online';
      driver.isAvailable = true;
      await driver.save();
    }

    await delivery.save();

    // Update driver location if provided
    if (location && location.latitude && location.longitude) {
      if (typeof driver.updateLocation === 'function') {
        await driver.updateLocation(location.longitude, location.latitude);
      } else {
        driver.location = driver.location || {};
        driver.location.current = driver.location.current || {};
        driver.location.current.coordinates = [location.longitude, location.latitude];
        driver.location.lastUpdated = new Date();
        await driver.save();
      }
    }

    await delivery.populate([
      { path: 'restaurant', select: 'name address phone' },
      { path: 'customer', select: 'name phone' },
      { path: 'user', select: 'name phone email' }
    ]);

    res.json({
      success: true,
      message: 'Delivery status updated',
      delivery
    });
  } catch (error) {
    console.error('Error updating delivery status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update delivery status',
      error: error.message
    });
  }
});

// @route   PUT /api/drivers/location
// @desc    Update driver location
// @access  Private (Driver only)
router.put('/location', protect, isDriver, async (req, res) => {
  try {
    const { latitude, longitude } = req.body;
    const driver = req.driver;

    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        message: 'Latitude and longitude are required'
      });
    }

    // Update location
    if (typeof driver.updateLocation === 'function') {
      await driver.updateLocation(longitude, latitude);
    } else {
      driver.location = driver.location || {};
      driver.location.current = driver.location.current || {};
      driver.location.current.coordinates = [longitude, latitude];
      driver.location.lastUpdated = new Date();
      await driver.save();
    }

    res.json({
      success: true,
      message: 'Location updated',
      location: {
        latitude,
        longitude,
        updatedAt: driver.location.lastUpdated
      }
    });
  } catch (error) {
    console.error('Error updating location:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update location',
      error: error.message
    });
  }
});

// @route   PUT /api/drivers/status
// @desc    Update driver status (online/offline/break)
// @access  Private (Driver only)
router.put('/status', protect, isDriver, async (req, res) => {
  try {
    const { status } = req.body;
    const driver = req.driver;

    const validStatuses = ['online', 'offline', 'break'];
    
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status'
      });
    }

    // Don't allow going offline if there's an active delivery
    if (status === 'offline' && driver.currentDelivery) {
      return res.status(400).json({
        success: false,
        message: 'Please complete your current delivery before going offline'
      });
    }

    // Update status
    if (typeof driver.setStatus === 'function') {
      await driver.setStatus(status);
    } else {
      driver.status = status;
      driver.isAvailable = status === 'online';
      await driver.save();
    }

    res.json({
      success: true,
      message: 'Status updated',
      status: driver.status,
      isAvailable: driver.isAvailable
    });
  } catch (error) {
    console.error('Error updating status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update status',
      error: error.message
    });
  }
});

// @route   GET /api/drivers/profile
// @desc    Get driver profile
// @access  Private (Driver only)
router.get('/profile', protect, isDriver, async (req, res) => {
  try {
    const driver = await Driver.findOne({ user: req.user._id })
      .populate('user', 'name email phone profileImage');

    res.json({
      success: true,
      driver
    });
  } catch (error) {
    console.error('Error getting driver profile:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get driver profile',
      error: error.message
    });
  }
});

// @route   GET /api/drivers/earnings
// @desc    Get driver earnings
// @access  Private (Driver only)
router.get('/earnings', protect, isDriver, async (req, res) => {
  try {
    const driver = req.driver;
    const { startDate, endDate } = req.query;

    const matchQuery = {
      driver: driver._id,
      status: 'delivered'
    };

    if (startDate || endDate) {
      matchQuery.deliveredAt = {};
      if (startDate) matchQuery.deliveredAt.$gte = new Date(startDate);
      if (endDate) matchQuery.deliveredAt.$lte = new Date(endDate);
    }

    const earnings = await Order.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: null,
          totalEarnings: { $sum: { $ifNull: ['$deliveryFee', 0] } },
          totalOrders: { $sum: 1 },
          averageEarning: { $avg: { $ifNull: ['$deliveryFee', 0] } }
        }
      }
    ]);

    res.json({
      success: true,
      earnings: earnings.length > 0 ? earnings[0] : {
        totalEarnings: 0,
        totalOrders: 0,
        averageEarning: 0
      }
    });
  } catch (error) {
    console.error('Error getting earnings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get earnings',
      error: error.message
    });
  }
});

// Helper function to calculate distance between two points
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

function toRadians(degrees) {
  return degrees * (Math.PI / 180);
}

// Export router
module.exports = router;