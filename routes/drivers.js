// routes/drivers.js - UPDATED with proper driverEarnings support
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Driver = require('../models/Driver');
const Order = require('../models/Order');
const User = require('../models/User');

// Helper function to get driver earnings
// UPDATED to prioritize the driverEarnings field from database
const getDriverEarnings = (order) => {
  // Priority order for driver earnings:
  // 1. driverEarnings field (set by pre-save middleware)
  // 2. pricing.driverPayout
  // 3. pricing.deliveryFee
  // 4. Default to R20
  return order.driverEarnings || 
         order.pricing?.driverPayout || 
         order.pricing?.deliveryFee ||
         order.deliveryFee || 
         order.price?.deliveryFee || 
         20; // Default minimum
};

// Helper function to format order data for driver
// UPDATED to always show delivery fee in active deliveries
const formatOrderForDriver = (order) => {
  if (!order) return null;
  
  // Get driver earnings using updated function
  const driverEarnings = getDriverEarnings(order);
  const deliveryFee = order.pricing?.deliveryFee || 25;
  
  return {
    _id: order._id,
    id: order._id, // Alias for compatibility
    orderNumber: order.orderNumber || order._id.toString().slice(-6),
    status: order.status,
    driverStatus: order.driverStatus || 'accepted',
    
    // Customer Information (from user field)
    customer: order.user ? {
      id: order.user._id,
      name: order.user.name || 'Customer',
      phone: order.user.phone || 'N/A',
      profileImage: order.user.profileImage?.url || order.user.profilePicture?.url || 
                    order.user.profileImage || order.user.profilePicture || null
    } : {
      id: order.customer?._id,
      name: order.customer?.name || 'Customer',
      phone: order.customer?.phone || 'N/A',
      profileImage: order.customer?.profileImage || null
    },
    customerName: order.user?.name || order.customer?.name || 'Customer',
    customerPhone: order.user?.phone || order.customer?.phone || 'N/A',
    
    // Restaurant Information
    restaurant: order.restaurant ? {
      id: order.restaurant._id,
      name: order.restaurant.name || 'Restaurant',
      phone: order.restaurant.phone || 'N/A',
      address: order.restaurant.address?.street || order.restaurant.address?.fullAddress || 'N/A',
      coordinates: order.restaurant.address?.coordinates || null
    } : null,
    restaurantName: order.restaurant?.name || 'Restaurant',
    
    // Delivery Location
    deliveryAddress: order.deliveryAddress ? {
      street: order.deliveryAddress.street || 'N/A',
      city: order.deliveryAddress.city || '',
      postalCode: order.deliveryAddress.postalCode || order.deliveryAddress.zipCode || '',
      fullAddress: order.deliveryAddress.fullAddress || order.deliveryAddress.street || 'N/A',
      coordinates: order.deliveryAddress.coordinates || null,
      notes: order.deliveryAddress.notes || order.deliveryAddress.instructions || ''
    } : {
      street: order.address?.street || 'N/A',
      city: order.address?.city || '',
      postalCode: order.address?.postalCode || '',
      fullAddress: order.address?.street || 'N/A',
      coordinates: order.address?.coordinates || null,
      notes: ''
    },
    address: order.deliveryAddress || order.address || {}, // Alias
    
    // Financial Information - CRITICAL: Always visible in active deliveries
    deliveryFee: deliveryFee,
    driverEarnings: driverEarnings,
    driverEarning: driverEarnings, // Singular alias
    earnings: driverEarnings, // Short alias
    
    // Also nest in price object for compatibility
    price: {
      deliveryFee: deliveryFee,
      driverEarnings: driverEarnings,
      total: order.pricing?.total || order.price?.total || 0,
      subtotal: order.pricing?.subtotal || order.price?.subtotal || 0
    },
    
    // Order Items (just count for driver)
    itemCount: order.items?.length || 0,
    items: order.items || [], // Include for detailed view
    
    // Timestamps
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    acceptedAt: order.acceptedAt || order.timestamps?.confirmedAt,
    pickedUpAt: order.pickedUpAt || order.timestamps?.pickedUpAt,
    deliveredAt: order.deliveredAt || order.timestamps?.deliveredAt || order.completedAt,
    completedAt: order.completedAt || order.timestamps?.completedAt,
    estimatedDeliveryTime: order.estimatedDeliveryTime || '30-45 min',
    
    // Special Instructions
    specialInstructions: order.specialInstructions || '',
    deliveryNotes: order.deliveryNotes || order.deliveryAddress?.instructions || '',
    
    // Payment info
    payment: order.payment || { method: 'cash' },
    
    // Additional timestamps
    timestamps: order.timestamps || {}
  };
};

// ========== ROUTES ==========

// GET /api/drivers/stats
router.get('/stats', auth, async (req, res) => {
  try {
    const driver = await Driver.findOne({ user: req.user.id });
    
    if (!driver) {
      return res.status(404).json({ error: 'Driver profile not found' });
    }

    res.json({
      totalDeliveries: driver.metrics?.totalDeliveries || 0,
      completedDeliveries: driver.metrics?.completedDeliveries || 0,
      cancelledDeliveries: driver.metrics?.cancelledDeliveries || 0,
      totalEarnings: driver.metrics?.totalEarnings || 0,
      averageRating: driver.metrics?.averageRating || 0,
      status: driver.status,
      isAvailable: driver.isAvailable
    });
  } catch (error) {
    console.error('Get driver stats error:', error);
    res.status(500).json({ error: 'Failed to get driver statistics' });
  }
});

// GET /api/drivers/profile
router.get('/profile', auth, async (req, res) => {
  try {
    const driver = await Driver.findOne({ user: req.user.id })
      .populate('user', 'name email phone profileImage');
    
    if (!driver) {
      return res.status(404).json({ error: 'Driver profile not found' });
    }

    res.json({ driver });
  } catch (error) {
    console.error('Get driver profile error:', error);
    res.status(500).json({ error: 'Failed to get driver profile' });
  }
});

// GET /api/drivers/available-orders - Get available orders
router.get('/available-orders', auth, async (req, res) => {
  try {
    const driver = await Driver.findOne({ user: req.user.id });
    
    if (!driver) {
      return res.status(404).json({ error: 'Driver profile not found' });
    }

    console.log('📦 Getting available orders for driver:', driver._id);

    // Find orders ready for pickup without a driver
    const availableOrders = await Order.find({
      status: 'ready',
      driver: null
    })
    .populate('restaurant', 'name address phone')
    .populate('user', 'name phone profileImage profilePicture')
    .sort({ createdAt: -1 })
    .limit(20)
    .lean();

    console.log(`✅ Found ${availableOrders.length} available orders`);

    // Format orders - now shows correct driverEarnings
    const formattedOrders = availableOrders.map(order => formatOrderForDriver(order));

    res.json(formattedOrders);
  } catch (error) {
    console.error('Get available orders error:', error);
    res.status(500).json({ error: 'Failed to get available orders' });
  }
});

// GET /api/drivers/active-deliveries - Get driver's active deliveries
router.get('/active-deliveries', auth, async (req, res) => {
  try {
    const driver = await Driver.findOne({ user: req.user.id });
    
    if (!driver) {
      return res.status(404).json({ error: 'Driver profile not found' });
    }

    console.log('📦 Getting active deliveries for driver:', driver._id);

    // Find active deliveries assigned to this driver
    const activeDeliveries = await Order.find({
      driver: driver._id,
      status: { $in: ['confirmed', 'preparing', 'ready', 'accepted', 'picked_up', 'on_the_way', 'out_for_delivery'] }
    })
    .populate('restaurant', 'name address phone')
    .populate('user', 'name phone profileImage profilePicture')
    .sort({ createdAt: -1 })
    .lean();

    console.log(`✅ Found ${activeDeliveries.length} active deliveries`);

    // Format with delivery fee - now properly shows driverEarnings
    const formattedDeliveries = activeDeliveries.map(order => formatOrderForDriver(order));

    res.json(formattedDeliveries);
  } catch (error) {
    console.error('Get active deliveries error:', error);
    res.status(500).json({ error: 'Failed to get active deliveries' });
  }
});

// GET /api/drivers/earnings
router.get('/earnings', auth, async (req, res) => {
  try {
    const driver = await Driver.findOne({ user: req.user.id });
    
    if (!driver) {
      return res.status(404).json({ error: 'Driver profile not found' });
    }

    const completedOrders = await Order.find({
      driver: driver._id,
      status: { $in: ['delivered', 'completed'] }
    }).lean();

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    let todayEarnings = 0;
    let weekEarnings = 0;
    let monthEarnings = 0;
    let totalEarnings = 0;

    completedOrders.forEach(order => {
      // Use updated function to get earnings
      const earnings = getDriverEarnings(order);
      const completedDate = new Date(order.deliveredAt || order.completedAt || order.updatedAt);
      
      totalEarnings += earnings;
      
      if (completedDate >= todayStart) {
        todayEarnings += earnings;
      }
      if (completedDate >= weekStart) {
        weekEarnings += earnings;
      }
      if (completedDate >= monthStart) {
        monthEarnings += earnings;
      }
    });

    res.json({
      totalEarnings,
      todayEarnings,
      weekEarnings,
      monthEarnings,
      completedDeliveries: completedOrders.length,
      todayDeliveries: completedOrders.filter(o => new Date(o.deliveredAt || o.completedAt) >= todayStart).length,
      weekDeliveries: completedOrders.filter(o => new Date(o.deliveredAt || o.completedAt) >= weekStart).length,
      monthDeliveries: completedOrders.filter(o => new Date(o.deliveredAt || o.completedAt) >= monthStart).length,
      averagePerDelivery: completedOrders.length > 0 ? totalEarnings / completedOrders.length : 0,
      pendingPayouts: totalEarnings
    });
  } catch (error) {
    console.error('Get earnings error:', error);
    res.status(500).json({ error: 'Failed to get earnings' });
  }
});

// GET /api/drivers/deliveries/history
router.get('/deliveries/history', auth, async (req, res) => {
  try {
    console.log('📦 Getting delivery history for driver:', req.user.id);
    
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const driver = await Driver.findOne({ user: req.user.id });
    
    if (!driver) {
      return res.status(404).json({ error: 'Driver profile not found' });
    }

    const deliveries = await Order.find({
      driver: driver._id,
      status: { $in: ['delivered', 'completed'] }
    })
    .populate('restaurant', 'name address phone')
    .populate('user', 'name phone profileImage profilePicture')
    .sort({ deliveredAt: -1, completedAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

    const total = await Order.countDocuments({
      driver: driver._id,
      status: { $in: ['delivered', 'completed'] }
    });

    console.log(`✅ Found ${deliveries.length} completed deliveries (page ${page})`);

    // Format deliveries - now shows correct driverEarnings
    const formattedDeliveries = deliveries.map(order => formatOrderForDriver(order));

    res.json({
      deliveries: formattedDeliveries,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('❌ Get delivery history error:', error);
    res.status(500).json({ 
      error: 'Failed to get delivery history',
      details: error.message 
    });
  }
});

// POST /api/drivers/deliveries/:orderId/accept - Accept an order
router.post('/deliveries/:orderId/accept', auth, async (req, res) => {
  try {
    const { orderId } = req.params;
    
    console.log('📦 Driver accepting order:', orderId);
    
    const driver = await Driver.findOne({ user: req.user.id });
    
    if (!driver) {
      return res.status(404).json({ error: 'Driver profile not found' });
    }

    if (!driver.isAvailable) {
      return res.status(400).json({ error: 'Driver is not available' });
    }

    const order = await Order.findById(orderId);
    
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (order.driver) {
      return res.status(400).json({ error: 'Order already assigned to a driver' });
    }

    // Get earnings (will use driverEarnings from database)
    const driverEarnings = getDriverEarnings(order);

    order.driver = driver._id;
    order.status = 'confirmed';
    order.driverStatus = 'accepted';
    order.acceptedAt = new Date();
    
    // Ensure driverEarnings is set
    if (!order.driverEarnings) {
      order.driverEarnings = driverEarnings;
    }
    
    await order.save();

    driver.status = 'busy';
    driver.isAvailable = false;
    driver.currentDelivery = order._id;
    await driver.save();

    const populatedOrder = await Order.findById(orderId)
      .populate('restaurant', 'name address phone')
      .populate('user', 'name phone profileImage profilePicture')
      .lean();

    // Format response
    const formattedOrder = formatOrderForDriver(populatedOrder);

    res.json({ 
      success: true,
      order: formattedOrder,
      message: 'Order accepted successfully',
      deliveryFee: formattedOrder.deliveryFee,
      driverEarnings: formattedOrder.driverEarnings
    });
  } catch (error) {
    console.error('❌ Accept order error:', error);
    res.status(500).json({ error: 'Failed to accept order', details: error.message });
  }
});

// POST /api/drivers/orders/:orderId/accept - Alternative accept endpoint
router.post('/orders/:orderId/accept', auth, async (req, res) => {
  try {
    const { orderId } = req.params;
    
    console.log('📦 Driver accepting order (alt route):', orderId);
    
    const driver = await Driver.findOne({ user: req.user.id });
    
    if (!driver) {
      return res.status(404).json({ error: 'Driver profile not found' });
    }

    if (!driver.isAvailable) {
      return res.status(400).json({ error: 'Driver is not available' });
    }

    const order = await Order.findById(orderId);
    
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (order.driver && order.driver.toString() !== driver._id.toString()) {
      return res.status(400).json({ error: 'Order already assigned to another driver' });
    }

    const driverEarnings = getDriverEarnings(order);

    order.driver = driver._id;
    order.status = 'confirmed';
    order.driverStatus = 'accepted';
    order.acceptedAt = new Date();
    
    if (!order.driverEarnings) {
      order.driverEarnings = driverEarnings;
    }
    
    await order.save();

    driver.status = 'busy';
    driver.isAvailable = false;
    driver.currentDelivery = order._id;
    await driver.save();

    const populatedOrder = await Order.findById(orderId)
      .populate('restaurant', 'name address phone')
      .populate('user', 'name phone profileImage profilePicture')
      .lean();

    const formattedOrder = formatOrderForDriver(populatedOrder);

    res.json({ 
      success: true,
      order: formattedOrder,
      message: 'Order accepted successfully',
      deliveryFee: formattedOrder.deliveryFee,
      driverEarnings: formattedOrder.driverEarnings
    });
  } catch (error) {
    console.error('❌ Accept order error:', error);
    res.status(500).json({ error: 'Failed to accept order' });
  }
});

// PUT /api/drivers/orders/:orderId/status - Update order status
router.put('/orders/:orderId/status', auth, async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body;
    
    console.log(`📦 Updating order ${orderId} status to:`, status);
    
    const driver = await Driver.findOne({ user: req.user.id });
    
    if (!driver) {
      return res.status(404).json({ error: 'Driver profile not found' });
    }

    const order = await Order.findById(orderId);
    
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (!order.driver || order.driver.toString() !== driver._id.toString()) {
      return res.status(403).json({ error: 'Not authorized to update this order' });
    }

    // Update order status
    order.status = status;
    order.driverStatus = status;
    
    if (status === 'picked_up') {
      order.pickedUpAt = new Date();
      if (order.timestamps) order.timestamps.pickedUpAt = new Date();
    } else if (status === 'on_the_way' || status === 'out_for_delivery') {
      order.onTheWayAt = new Date();
      order.status = 'out_for_delivery';
    } else if (status === 'delivered' || status === 'completed') {
      order.deliveredAt = new Date();
      order.completedAt = new Date();
      order.status = 'delivered';
      if (order.timestamps) {
        order.timestamps.deliveredAt = new Date();
        order.timestamps.completedAt = new Date();
      }
      
      const driverEarnings = getDriverEarnings(order);
      
      // Update driver metrics
      if (!driver.metrics) driver.metrics = {};
      driver.metrics.completedDeliveries = (driver.metrics.completedDeliveries || 0) + 1;
      driver.metrics.totalDeliveries = (driver.metrics.totalDeliveries || 0) + 1;
      driver.metrics.totalEarnings = (driver.metrics.totalEarnings || 0) + driverEarnings;
      driver.currentDelivery = null;
      driver.status = 'online';
      driver.isAvailable = true;
      
      await driver.save();
      console.log('✅ Order completed, driver metrics updated');
      console.log(`💰 Driver earned: R${driverEarnings.toFixed(2)}`);
    }
    
    await order.save();

    const populatedOrder = await Order.findById(orderId)
      .populate('restaurant', 'name address phone')
      .populate('user', 'name phone profileImage profilePicture')
      .lean();

    const formattedOrder = formatOrderForDriver(populatedOrder);

    res.json({ 
      success: true,
      order: formattedOrder,
      message: `Order marked as ${status}`
    });
  } catch (error) {
    console.error('❌ Update order status error:', error);
    res.status(500).json({ error: 'Failed to update order status' });
  }
});

// PUT /api/drivers/status
router.put('/status', auth, async (req, res) => {
  try {
    const { status, isAvailable } = req.body;
    
    const driver = await Driver.findOne({ user: req.user.id });
    
    if (!driver) {
      return res.status(404).json({ error: 'Driver profile not found' });
    }

    if (status) {
      driver.status = status;
    }
    
    if (typeof isAvailable === 'boolean') {
      driver.isAvailable = isAvailable;
    }

    await driver.save();

    res.json({ 
      success: true,
      driver: {
        status: driver.status,
        isAvailable: driver.isAvailable
      }
    });
  } catch (error) {
    console.error('Update driver status error:', error);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

// PUT /api/drivers/location
router.put('/location', auth, async (req, res) => {
  try {
    const { latitude, longitude } = req.body;
    
    if (!latitude || !longitude) {
      return res.status(400).json({ error: 'Latitude and longitude required' });
    }

    const driver = await Driver.findOne({ user: req.user.id });
    
    if (!driver) {
      return res.status(404).json({ error: 'Driver profile not found' });
    }

    await driver.updateLocation(longitude, latitude);

    res.json({ 
      success: true,
      location: driver.location.current.coordinates
    });
  } catch (error) {
    console.error('Update location error:', error);
    res.status(500).json({ error: 'Failed to update location' });
  }
});

// GET /api/drivers/deliveries/:id - Get specific delivery details
router.get('/deliveries/:id', auth, async (req, res) => {
  try {
    console.log('Getting delivery details for:', req.params.id);
    
    const driver = await Driver.findOne({ user: req.user.id });
    
    if (!driver) {
      return res.status(404).json({ error: 'Driver profile not found' });
    }

    const delivery = await Order.findOne({
      _id: req.params.id,
      driver: driver._id
    })
    .populate('restaurant', 'name address phone')
    .populate('user', 'name phone profileImage profilePicture')
    .lean();

    if (!delivery) {
      return res.status(404).json({ error: 'Delivery not found' });
    }

    const formattedDelivery = formatOrderForDriver(delivery);

    res.json(formattedDelivery);
  } catch (error) {
    console.error('Error getting delivery details:', error);
    res.status(500).json({ error: 'Failed to get delivery details' });
  }
});

module.exports = router;