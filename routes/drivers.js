// routes/drivers.js - Complete Fixed Version
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const { authMiddleware, driverMiddleware } = require('../middleware/auth');

const User = require('../models/User');
const Driver = require('../models/Driver');
const Order = require('../models/Order');

// Multer config for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/drivers/'),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'driver-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    file.mimetype.startsWith('image/') ? cb(null, true) : cb(new Error('Only image files allowed'), false);
  }
});

// GET driver profile
router.get('/profile', authMiddleware, driverMiddleware, async (req, res) => {
  try {
    const driver = await Driver.findOne({ user: req.user._id }).populate('user', 'name email phone userType').lean();
    if (!driver) {
      // Create driver profile if it doesn't exist
      const newDriver = new Driver({
        user: req.user._id,
        status: 'offline',
        vehicle: { type: 'car' },
        verification: { isApproved: false },
        location: { current: { type: 'Point', coordinates: [0, 0] } }
      });
      await newDriver.save();
      
      const populatedDriver = await Driver.findById(newDriver._id).populate('user', 'name email phone userType').lean();
      return res.json({ success: true, driver: populatedDriver });
    }
    res.json({ success: true, driver });
  } catch (error) {
    console.error('Get driver profile error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch driver profile', error: error.message });
  }
});

// PUT driver profile
router.put('/profile', authMiddleware, driverMiddleware, async (req, res) => {
  try {
    const driver = await Driver.findOneAndUpdate(
      { user: req.user._id },
      { ...req.body, updatedAt: new Date() },
      { new: true, upsert: true }
    ).populate('user', 'name email phone userType');
    res.json({ success: true, driver });
  } catch (error) {
    console.error('Update driver profile error:', error);
    res.status(500).json({ success: false, message: 'Failed to update driver profile', error: error.message });
  }
});

// POST driver profile image
router.post('/profile/image', authMiddleware, driverMiddleware, upload.single('profileImage'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No image file provided' });

    const imageUrl = `/uploads/drivers/${req.file.filename}`;
    const driver = await Driver.findOneAndUpdate(
      { user: req.user._id },
      { profileImageUrl: imageUrl, updatedAt: new Date() },
      { new: true, upsert: true }
    );
    res.json({ success: true, imageUrl, driver });
  } catch (error) {
    console.error('Upload profile image error:', error);
    res.status(500).json({ success: false, message: 'Failed to upload profile image', error: error.message });
  }
});

// PUT driver status
router.put('/status', authMiddleware, driverMiddleware, async (req, res) => {
  try {
    const { status } = req.body;
    
    if (!['online', 'offline', 'busy'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    let driver = await Driver.findOne({ user: req.user._id });
    if (!driver) {
      driver = new Driver({
        user: req.user._id,
        status: status,
        isAvailable: status === 'online'
      });
    } else {
      driver.status = status;
      driver.isAvailable = status === 'online';
      driver.updatedAt = new Date();
    }

    await driver.save();

    console.log(`Driver ${req.user._id} status updated to: ${status}`);

    res.json({
      success: true,
      message: 'Status updated successfully',
      status: driver.status,
      isAvailable: driver.isAvailable
    });
  } catch (error) {
    console.error('Update driver status error:', error);
    res.status(500).json({ success: false, message: 'Failed to update status', error: error.message });
  }
});

// PATCH driver status (for backward compatibility)
router.patch('/status', authMiddleware, driverMiddleware, async (req, res) => {
  try {
    const { status } = req.body;
    
    if (!['online', 'offline', 'busy'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    let driver = await Driver.findOne({ user: req.user._id });
    if (!driver) {
      driver = new Driver({
        user: req.user._id,
        status: status,
        isAvailable: status === 'online'
      });
    } else {
      driver.status = status;
      driver.isAvailable = status === 'online';
      driver.updatedAt = new Date();
    }

    await driver.save();

    res.json({
      success: true,
      message: 'Status updated successfully',
      status: driver.status,
      isAvailable: driver.isAvailable
    });
  } catch (error) {
    console.error('Update driver status error:', error);
    res.status(500).json({ success: false, message: 'Failed to update status', error: error.message });
  }
});

// PUT update driver location
router.put('/location', authMiddleware, driverMiddleware, async (req, res) => {
  try {
    const { latitude, longitude } = req.body;

    if (!latitude || !longitude) {
      return res.status(400).json({ success: false, message: 'Latitude and longitude are required' });
    }

    let driver = await Driver.findOne({ user: req.user._id });
    if (!driver) {
      driver = new Driver({
        user: req.user._id,
        location: {
          current: {
            type: 'Point',
            coordinates: [longitude, latitude]
          },
          lastUpdated: new Date()
        }
      });
    } else {
      driver.location.current.coordinates = [longitude, latitude];
      driver.location.lastUpdated = new Date();
    }

    await driver.save();

    console.log(`Driver ${req.user._id} location updated: ${latitude}, ${longitude}`);

    res.json({
      success: true,
      message: 'Location updated successfully',
      location: {
        latitude,
        longitude,
        lastUpdated: driver.location.lastUpdated
      }
    });
  } catch (error) {
    console.error('Update driver location error:', error);
    res.status(500).json({ success: false, message: 'Failed to update location', error: error.message });
  }
});

// PATCH update driver location (for backward compatibility)
router.patch('/location', authMiddleware, driverMiddleware, async (req, res) => {
  try {
    const { latitude, longitude } = req.body;

    if (!latitude || !longitude) {
      return res.status(400).json({ success: false, message: 'Latitude and longitude are required' });
    }

    let driver = await Driver.findOne({ user: req.user._id });
    if (!driver) {
      driver = new Driver({
        user: req.user._id,
        location: {
          current: {
            type: 'Point',
            coordinates: [longitude, latitude]
          },
          lastUpdated: new Date()
        }
      });
    } else {
      driver.location.current.coordinates = [longitude, latitude];
      driver.location.lastUpdated = new Date();
    }

    await driver.save();

    res.json({
      success: true,
      message: 'Location updated successfully',
      location: {
        latitude,
        longitude,
        lastUpdated: driver.location.lastUpdated
      }
    });
  } catch (error) {
    console.error('Update driver location error:', error);
    res.status(500).json({ success: false, message: 'Failed to update location', error: error.message });
  }
});

// GET available orders
router.get('/available-orders', authMiddleware, driverMiddleware, async (req, res) => {
  try {
    console.log(`Driver ${req.user._id} requesting available orders`);
    
    const availableOrders = await Order.find({
      status: { $in: ['ready', 'confirmed'] },
      driver: null
    })
    .populate('restaurant', 'name address contact')
    .populate('customer', 'name phone')
    .sort({ createdAt: -1 })
    .limit(10);

    const ordersWithEarnings = availableOrders.map(order => {
      const orderObj = order.toObject();
      orderObj.driverEarning = 20;
      orderObj.distance = 2.5;
      orderObj.estimatedPickupTime = 15;
      orderObj.estimatedDeliveryTime = 25;
      return orderObj;
    });

    console.log(`Found ${ordersWithEarnings.length} available orders`);
    res.json(ordersWithEarnings);
  } catch (error) {
    console.error('Get available orders error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch available orders', error: error.message });
  }
});

// GET nearby orders (alternative endpoint)
router.get('/nearby-orders', authMiddleware, driverMiddleware, async (req, res) => {
  try {
    console.log(`Driver ${req.user._id} requesting nearby orders`);
    
    const availableOrders = await Order.find({
      status: { $in: ['ready', 'confirmed'] },
      driver: null
    })
    .populate('restaurant', 'name address contact')
    .populate('customer', 'name phone')
    .sort({ createdAt: -1 })
    .limit(10);

    const ordersWithEarnings = availableOrders.map(order => {
      const orderObj = order.toObject();
      orderObj.driverEarning = 20;
      orderObj.distance = 2.5;
      orderObj.estimatedPickupTime = 15;
      orderObj.estimatedDeliveryTime = 25;
      return orderObj;
    });

    res.json({ orders: ordersWithEarnings });
  } catch (error) {
    console.error('Get nearby orders error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch nearby orders', error: error.message });
  }
});

// POST accept delivery order
router.post('/accept-order/:orderId', authMiddleware, driverMiddleware, async (req, res) => {
  try {
    const { orderId } = req.params;
    const driverId = req.user._id;

    console.log(`Driver ${driverId} attempting to accept order ${orderId}`);

    // Check if driver already has an active delivery
    const activeDelivery = await Order.findOne({
      driver: new mongoose.Types.ObjectId(driverId),
      status: { $in: ['accepted', 'picked_up', 'on_route', 'out_for_delivery'] }
    });

    if (activeDelivery) {
      return res.status(400).json({ success: false, message: 'You already have an active delivery' });
    }

    // Find and update the order
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    if (order.driver) {
      return res.status(400).json({ success: false, message: 'Order already assigned to another driver' });
    }

    if (!['ready', 'confirmed'].includes(order.status)) {
      return res.status(400).json({ success: false, message: 'Order is no longer available' });
    }

    // Update order with driver
    order.driver = new mongoose.Types.ObjectId(driverId);
    order.status = 'out_for_delivery';
    order.out_for_deliveryAt = new Date();
    order.driverEarning = 20;
    await order.save();

    // Populate the order for response
    await order.populate(['restaurant', 'customer']);

    // Update driver status to busy
    await Driver.findOneAndUpdate(
      { user: driverId },
      { 
        status: 'busy',
        isAvailable: false,
        currentDelivery: orderId
      },
      { upsert: true }
    );

    console.log(`Order ${orderId} accepted by driver ${driverId}`);

    res.json({
      success: true,
      message: 'Order accepted successfully',
      order: order.toObject()
    });
  } catch (error) {
    console.error('Accept order error:', error);
    res.status(500).json({ success: false, message: 'Failed to accept order', error: error.message });
  }
});

// GET active delivery
router.get('/active-delivery', authMiddleware, driverMiddleware, async (req, res) => {
  try {
    const activeDelivery = await Order.findOne({
      driver: new mongoose.Types.ObjectId(req.user._id),
      status: { $in: ['out_for_delivery', 'picked_up', 'on_route'] }
    }).populate('restaurant customer');

    if (activeDelivery) {
      console.log(`Active delivery found for driver ${req.user._id}: ${activeDelivery._id}`);
    } else {
      console.log(`No active delivery for driver ${req.user._id}`);
    }

    res.json(activeDelivery);
  } catch (error) {
    console.error('Get active delivery error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch active delivery', error: error.message });
  }
});

// GET driver earnings
router.get('/earnings', authMiddleware, driverMiddleware, async (req, res) => {
  try {
    const driverId = req.user._id;
    
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    weekStart.setHours(0, 0, 0, 0);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const calculatePeriodEarnings = async (startDate) => {
      try {
        const orders = await Order.find({
          driver: new mongoose.Types.ObjectId(driverId),
          status: { $in: ['delivered', 'completed'] },
          deliveredAt: { $gte: startDate }
        });
        
        return orders.reduce((total, order) => {
          const driverEarning = order.driverEarning || 20;
          return total + driverEarning;
        }, 0);
      } catch (error) {
        console.warn('Error calculating earnings for period:', error);
        return 0;
      }
    };

    const [todayEarnings, weekEarnings, monthEarnings, totalEarnings] = await Promise.all([
      calculatePeriodEarnings(todayStart),
      calculatePeriodEarnings(weekStart),
      calculatePeriodEarnings(monthStart),
      calculatePeriodEarnings(new Date(0))
    ]);

    const earnings = {
      today: todayEarnings,
      week: weekEarnings,
      month: monthEarnings,
      total: totalEarnings
    };

    res.json({
      success: true,
      earnings
    });
  } catch (error) {
    console.error('Get driver earnings error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch earnings', error: error.message });
  }
});

// GET driver stats
router.get('/stats', authMiddleware, driverMiddleware, async (req, res) => {
  try {
    const driverId = req.user._id;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayDeliveries = await Order.countDocuments({
      driver: new mongoose.Types.ObjectId(driverId),
      status: { $in: ['delivered', 'completed'] },
      deliveredAt: { $gte: today }
    });

    const allTimeDeliveries = await Order.countDocuments({
      driver: new mongoose.Types.ObjectId(driverId),
      status: { $in: ['delivered', 'completed'] }
    });

    // Get rating aggregation
    const ratingAggregation = await Order.aggregate([
      { 
        $match: { 
          driver: new mongoose.Types.ObjectId(driverId), 
          driverRating: { $exists: true, $ne: null, $gte: 1 } 
        } 
      },
      { 
        $group: { 
          _id: null, 
          avgRating: { $avg: '$driverRating' }, 
          totalRatings: { $sum: 1 } 
        } 
      }
    ]);

    const ratings = ratingAggregation[0] || { avgRating: 0, totalRatings: 0 };

    res.json({
      success: true,
      today: { deliveries: todayDeliveries },
      allTime: { 
        deliveries: allTimeDeliveries, 
        avgRating: ratings.avgRating || 0, 
        totalRatings: ratings.totalRatings || 0 
      }
    });
  } catch (error) {
    console.error('Get driver stats error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch driver stats', error: error.message });
  }
});

// GET driver orders
router.get('/orders', authMiddleware, driverMiddleware, async (req, res) => {
  try {
    const { status = 'all', page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;

    let query = { driver: new mongoose.Types.ObjectId(req.user._id) };
    
    if (status !== 'all') {
      if (status === 'available') {
        query = { 
          driver: null, 
          status: { $in: ['ready', 'confirmed'] } 
        };
      } else {
        query.status = status;
      }
    }

    const orders = await Order.find(query)
      .populate('restaurant customer')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(skip);

    const total = await Order.countDocuments(query);

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
    console.error('Get driver orders error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch driver orders', error: error.message });
  }
});

// PATCH update order status (for drivers)
router.patch('/orders/:orderId/status', authMiddleware, driverMiddleware, async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body;

    const validStatuses = ['picked_up', 'on_route', 'delivered', 'completed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    const order = await Order.findOne({
      _id: orderId,
      driver: req.user._id
    });

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found or not assigned to you' });
    }

    const updateData = { 
      status,
      [`${status}At`]: new Date()
    };

    // If delivered or completed, update driver status back to online
    if (['delivered', 'completed'].includes(status)) {
      await Driver.findOneAndUpdate(
        { user: req.user._id },
        { 
          status: 'online',
          isAvailable: true,
          currentDelivery: null
        }
      );
    }

    const updatedOrder = await Order.findByIdAndUpdate(
      orderId,
      updateData,
      { new: true }
    ).populate('restaurant customer');

    console.log(`Order ${orderId} status updated to ${status} by driver ${req.user._id}`);

    res.json({
      success: true,
      message: 'Order status updated successfully',
      order: updatedOrder
    });
  } catch (error) {
    console.error('Update order status error:', error);
    res.status(500).json({ success: false, message: 'Failed to update order status', error: error.message });
  }
});

// GET delivery history
router.get('/delivery-history', authMiddleware, driverMiddleware, async (req, res) => {
  try {
    const { limit = 10, page = 1 } = req.query;
    const skip = (page - 1) * limit;

    const deliveries = await Order.find({
      driver: new mongoose.Types.ObjectId(req.user._id),
      status: { $in: ['delivered', 'completed'] }
    })
    .populate('restaurant customer')
    .sort({ deliveredAt: -1 })
    .limit(parseInt(limit))
    .skip(skip);

    const total = await Order.countDocuments({
      driver: new mongoose.Types.ObjectId(req.user._id),
      status: { $in: ['delivered', 'completed'] }
    });

    res.json({
      success: true,
      deliveries,
      pagination: {
        current: parseInt(page),
        total: Math.ceil(total / limit),
        hasMore: skip + deliveries.length < total
      }
    });
  } catch (error) {
    console.error('Get delivery history error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch delivery history', error: error.message });
  }
});

// PUT update delivery status (alternative endpoint)
router.put('/delivery/:deliveryId/status', authMiddleware, driverMiddleware, async (req, res) => {
  try {
    const { deliveryId } = req.params;
    const { status, notes } = req.body;

    const validStatuses = ['picked_up', 'on_route', 'delivered', 'completed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    const updateData = { 
      status,
      [`${status}At`]: new Date()
    };

    if (notes) {
      updateData.deliveryNotes = notes;
    }

    // If completed, update driver status and clear current delivery
    if (['delivered', 'completed'].includes(status)) {
      await Driver.findOneAndUpdate(
        { user: req.user._id },
        { 
          status: 'online',
          isAvailable: true,
          currentDelivery: null,
          $inc: { 'metrics.completedDeliveries': 1 }
        }
      );
    }

    const order = await Order.findByIdAndUpdate(
      deliveryId,
      updateData,
      { new: true }
    ).populate('restaurant customer');

    if (!order) {
      return res.status(404).json({ success: false, message: 'Delivery not found' });
    }

    res.json({
      success: true,
      message: 'Delivery status updated successfully',
      order
    });
  } catch (error) {
    console.error('Update delivery status error:', error);
    res.status(500).json({ success: false, message: 'Failed to update delivery status', error: error.message });
  }
});

// PUT update delivery location
router.put('/delivery/location', authMiddleware, driverMiddleware, async (req, res) => {
  try {
    const { latitude, longitude, orderId } = req.body;

    if (!latitude || !longitude) {
      return res.status(400).json({ success: false, message: 'Latitude and longitude are required' });
    }

    // Update driver location
    await Driver.findOneAndUpdate(
      { user: req.user._id },
      {
        'location.current.coordinates': [longitude, latitude],
        'location.lastUpdated': new Date()
      }
    );

    // If orderId is provided, you can also update order-specific location tracking
    if (orderId) {
      await Order.findByIdAndUpdate(orderId, {
        'tracking.currentLocation': {
          latitude,
          longitude,
          timestamp: new Date()
        }
      });
    }

    res.json({
      success: true,
      message: 'Delivery location updated successfully',
      location: { latitude, longitude }
    });
  } catch (error) {
    console.error('Update delivery location error:', error);
    res.status(500).json({ success: false, message: 'Failed to update delivery location', error: error.message });
  }
});

// GET driver notifications endpoint - WORKING VERSION
router.get('/notifications', authMiddleware, driverMiddleware, async (req, res) => {
  try {
    console.log(`Fetching notifications for driver ${req.user._id}`);
    
    // Find orders that need drivers (available for pickup)
    const availableOrders = await Order.find({
      status: { $in: ['ready', 'confirmed'] }, // Orders ready for pickup
      driver: null, // No driver assigned yet
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } // Within last 24 hours
    })
    .populate('restaurant', 'name address contact')
    .populate('customer', 'name phone')
    .sort({ createdAt: -1 })
    .limit(5); // Limit to 5 most recent

    // Transform orders into notification format
    const notifications = availableOrders.map(order => ({
      id: order._id.toString(),
      orderId: order._id.toString(),
      type: 'order_request',
      title: 'New Delivery Request',
      message: `Order from ${order.restaurant?.name || 'Restaurant'}`,
      timestamp: order.createdAt,
      order: {
        _id: order._id,
        orderNumber: order.orderNumber || `ORD-${order._id.toString().slice(-6)}`,
        restaurant: {
          name: order.restaurant?.name || 'Unknown Restaurant',
          address: order.restaurant?.address || { street: 'Restaurant Address' }
        },
        customer: {
          name: order.customer?.name || 'Customer',
          phone: order.customer?.phone || 'N/A'
        },
        items: order.items || [],
        total: order.total || 0,
        deliveryAddress: order.deliveryAddress || { street: 'Delivery Address' },
        driverEarning: order.driverEarning || 20, // Fixed R20 per delivery
        distance: 2.5, // Mock distance
        estimatedPickupTime: 15,
        estimatedDeliveryTime: 25,
        status: order.status
      }
    }));

    console.log(`Found ${notifications.length} notifications for driver`);
    res.json(notifications);
  } catch (error) {
    console.error('Get driver notifications error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch notifications', 
      error: error.message 
    });
  }
});

// POST accept order notification
router.post('/notifications/:orderId/accept', authMiddleware, driverMiddleware, async (req, res) => {
  try {
    const { orderId } = req.params;
    const driverId = req.user._id;

    console.log(`Driver ${driverId} accepting order ${orderId} via notifications`);

    // Check if driver already has an active delivery
    const activeDelivery = await Order.findOne({
      driver: new mongoose.Types.ObjectId(driverId),
      status: { $in: ['accepted', 'picked_up', 'on_route', 'out_for_delivery'] }
    });

    if (activeDelivery) {
      return res.status(400).json({ 
        success: false, 
        message: 'You already have an active delivery' 
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
        message: 'Order already assigned to another driver' 
      });
    }

    if (!['ready', 'confirmed'].includes(order.status)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Order is no longer available for pickup' 
      });
    }

    // Update order with driver
    order.driver = new mongoose.Types.ObjectId(driverId);
    order.status = 'out_for_delivery';
    order.out_for_deliveryAt = new Date();
    order.driverEarning = 20; // Fixed R20 per delivery
    await order.save();

    // Populate the order for response
    await order.populate(['restaurant', 'customer']);

    // Update driver status to busy
    await Driver.findOneAndUpdate(
      { user: driverId },
      { 
        status: 'busy',
        isAvailable: false,
        currentDelivery: orderId
      },
      { upsert: true }
    );

    console.log(`Order ${orderId} accepted by driver ${driverId} via notifications`);

    res.json({
      success: true,
      message: 'Order accepted successfully',
      order: order.toObject()
    });
  } catch (error) {
    console.error('Accept order via notifications error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to accept order', 
      error: error.message 
    });
  }
});

module.exports = router;