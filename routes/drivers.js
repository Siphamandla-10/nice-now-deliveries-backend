const express = require('express');
const router = express.Router();
const Driver = require('../models/Driver');
const Order = require('../models/Order');
const { auth, isDriver, isAdmin } = require('../middleware/auth');

// ==========================================
// IMPORTANT: SPECIFIC ROUTES MUST COME FIRST
// BEFORE ANY /:id OR /:param ROUTES
// ==========================================

// ==========================================
// GET DRIVER STATS
// ==========================================
router.get('/stats', auth, isDriver, async (req, res) => {
  try {
    console.log('\n========== 📊 DRIVER STATS REQUEST ==========');
    console.log('Driver ID:', req.user.id);

    const driverId = req.user.id;

    const completedOrders = await Order.find({
      driver: driverId,
      status: 'delivered'
    }).lean();

    const activeOrders = await Order.find({
      driver: driverId,
      status: { $in: ['driver_assigned', 'picked_up', 'on_the_way'] }
    }).lean();

    const totalEarnings = completedOrders.reduce((sum, order) => {
      return sum + (order.driverEarnings || order.pricing?.driverPayout || 0);
    }, 0);

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayOrders = completedOrders.filter(order => 
      new Date(order.timestamps?.deliveredAt || order.createdAt) >= todayStart
    );

    const todayEarnings = todayOrders.reduce((sum, order) => {
      return sum + (order.driverEarnings || order.pricing?.driverPayout || 0);
    }, 0);

    const stats = {
      totalDeliveries: completedOrders.length,
      activeDeliveries: activeOrders.length,
      totalEarnings: parseFloat(totalEarnings.toFixed(2)),
      todayDeliveries: todayOrders.length,
      todayEarnings: parseFloat(todayEarnings.toFixed(2)),
      averageRating: 4.5
    };

    console.log('✅ Stats calculated:', stats);
    console.log('=========================================\n');

    res.json({ success: true, stats });
  } catch (error) {
    console.error('❌ Error fetching driver stats:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch driver stats' });
  }
});

// ==========================================
// GET AVAILABLE ORDERS FOR DRIVER
// ==========================================
router.get('/available-orders', auth, isDriver, async (req, res) => {
  try {
    console.log('\n========== 🚗 AVAILABLE ORDERS (via /drivers) ==========');
    console.log('Driver ID:', req.user.id);

    const availableOrders = await Order.find({
      status: 'ready',
      driver: null
    })
      .populate('restaurant', 'name address contact')
      .populate('user', 'name phone')
      .lean()
      .sort({ createdAt: -1 })
      .limit(20);

    console.log('📦 Available orders found:', availableOrders.length);

    const transformedOrders = availableOrders.map(order => ({
      ...order,
      total: order.pricing?.total || order.total || 0,
      subtotal: order.pricing?.subtotal || order.subtotal || 0,
      deliveryFee: order.pricing?.deliveryFee || order.deliveryFee || 0,
      serviceFee: order.pricing?.serviceFee || order.serviceFee || 0,
      driverEarnings: order.driverEarnings || order.pricing?.driverPayout || 20
    }));

    if (transformedOrders.length > 0) {
      console.log('✅ First available order:');
      console.log('   Restaurant:', transformedOrders[0].restaurant?.name);
      console.log('   Total:', transformedOrders[0].total);
    }
    console.log('=========================================\n');

    res.json({ 
      success: true, 
      count: transformedOrders.length, 
      orders: transformedOrders 
    });
  } catch (error) {
    console.error('❌ Error fetching available orders:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch available orders', 
      details: error.message 
    });
  }
});

// ==========================================
// GET ACTIVE DELIVERIES FOR DRIVER
// ==========================================
router.get('/active-deliveries', auth, isDriver, async (req, res) => {
  try {
    console.log('\n========== 🚗 ACTIVE DELIVERIES ==========');
    console.log('Driver ID:', req.user.id);

    const activeOrders = await Order.find({
      driver: req.user.id,
      status: { $in: ['driver_assigned', 'picked_up', 'on_the_way'] }
    })
      .populate('restaurant', 'name address contact')
      .populate('user', 'name phone')
      .lean()
      .sort({ createdAt: -1 });

    console.log('📦 Active deliveries found:', activeOrders.length);

    const transformedOrders = activeOrders.map(order => ({
      ...order,
      total: order.pricing?.total || order.total || 0,
      subtotal: order.pricing?.subtotal || order.subtotal || 0,
      deliveryFee: order.pricing?.deliveryFee || order.deliveryFee || 0,
      serviceFee: order.pricing?.serviceFee || order.serviceFee || 0,
      driverEarnings: order.driverEarnings || order.pricing?.driverPayout || 0
    }));

    console.log('=========================================\n');

    res.json({ 
      success: true, 
      count: transformedOrders.length, 
      orders: transformedOrders 
    });
  } catch (error) {
    console.error('❌ Error fetching active deliveries:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch active deliveries' 
    });
  }
});

// ==========================================
// GET COMPLETED DELIVERIES FOR DRIVER
// ==========================================
router.get('/completed-deliveries', auth, isDriver, async (req, res) => {
  try {
    console.log('\n========== ✅ COMPLETED DELIVERIES ==========');
    console.log('Driver ID:', req.user.id);

    const completedOrders = await Order.find({
      driver: req.user.id,
      status: 'delivered'
    })
      .populate('restaurant', 'name')
      .populate('user', 'name')
      .lean()
      .sort({ 'timestamps.deliveredAt': -1 })
      .limit(50);

    console.log('📦 Completed deliveries found:', completedOrders.length);

    const transformedOrders = completedOrders.map(order => ({
      ...order,
      total: order.pricing?.total || order.total || 0,
      subtotal: order.pricing?.subtotal || order.subtotal || 0,
      deliveryFee: order.pricing?.deliveryFee || order.deliveryFee || 0,
      serviceFee: order.pricing?.serviceFee || order.serviceFee || 0,
      driverEarnings: order.driverEarnings || order.pricing?.driverPayout || 0
    }));

    console.log('=========================================\n');

    res.json({ 
      success: true, 
      count: transformedOrders.length, 
      orders: transformedOrders 
    });
  } catch (error) {
    console.error('❌ Error fetching completed deliveries:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch completed deliveries' 
    });
  }
});

// ==========================================
// GET ALL DRIVERS (ADMIN)
// ==========================================
router.get('/', auth, isAdmin, async (req, res) => {
  try {
    const drivers = await Driver.find()
      .populate('user', 'name email phone')
      .sort({ createdAt: -1 });
    res.json({ success: true, count: drivers.length, drivers });
  } catch (error) {
    console.error('Error fetching drivers:', error);
    res.status(500).json({ error: 'Failed to fetch drivers' });
  }
});

// ==========================================
// GET DRIVER PROFILE
// ==========================================
router.get('/profile', auth, isDriver, async (req, res) => {
  try {
    const driver = await Driver.findOne({ user: req.user.id })
      .populate('user', 'name email phone');
    
    if (!driver) {
      return res.status(404).json({ error: 'Driver profile not found' });
    }
    
    res.json({ success: true, driver });
  } catch (error) {
    console.error('Error fetching driver profile:', error);
    res.status(500).json({ error: 'Failed to fetch driver profile' });
  }
});

// ==========================================
// UPDATE DRIVER PROFILE
// ==========================================
router.put('/profile', auth, isDriver, async (req, res) => {
  try {
    const { vehicleType, vehicleNumber, licenseNumber, isAvailable } = req.body;
    
    const driver = await Driver.findOne({ user: req.user.id });
    
    if (!driver) {
      return res.status(404).json({ error: 'Driver profile not found' });
    }
    
    if (vehicleType) driver.vehicleType = vehicleType;
    if (vehicleNumber) driver.vehicleNumber = vehicleNumber;
    if (licenseNumber) driver.licenseNumber = licenseNumber;
    if (typeof isAvailable === 'boolean') driver.isAvailable = isAvailable;
    
    await driver.save();
    
    res.json({ success: true, message: 'Profile updated', driver });
  } catch (error) {
    console.error('Error updating driver profile:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// ==========================================
// TOGGLE DRIVER AVAILABILITY
// ==========================================
router.post('/toggle-availability', auth, isDriver, async (req, res) => {
  try {
    const driver = await Driver.findOne({ user: req.user.id });
    
    if (!driver) {
      return res.status(404).json({ error: 'Driver profile not found' });
    }
    
    driver.isAvailable = !driver.isAvailable;
    await driver.save();
    
    res.json({ 
      success: true, 
      message: `Driver is now ${driver.isAvailable ? 'available' : 'unavailable'}`,
      isAvailable: driver.isAvailable
    });
  } catch (error) {
    console.error('Error toggling availability:', error);
    res.status(500).json({ error: 'Failed to toggle availability' });
  }
});

// ==========================================
// ACCEPT ORDER (ASSIGN DRIVER)
// ==========================================
router.post('/accept-order/:orderId', auth, isDriver, async (req, res) => {
  try {
    const { orderId } = req.params;
    
    console.log(`\n========== 🚗 DRIVER ACCEPTING ORDER ==========`);
    console.log('Order ID:', orderId);
    console.log('Driver ID:', req.user.id);
    
    const order = await Order.findById(orderId).lean();
    
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    if (order.driver) {
      return res.status(400).json({ error: 'Order already assigned to another driver' });
    }
    
    if (order.status !== 'ready') {
      return res.status(400).json({ error: 'Order is not ready for pickup' });
    }
    
    // Update order with driver assignment
    await Order.updateOne(
      { _id: orderId },
      { 
        $set: { 
          driver: req.user.id,
          status: 'driver_assigned',
          driverStatus: 'accepted',
          'timestamps.assignedAt': new Date()
        } 
      },
      { runValidators: false }
    );
    
    const updatedOrder = await Order.findById(orderId)
      .populate('restaurant', 'name address contact')
      .populate('user', 'name phone')
      .lean();
    
    const transformedOrder = {
      ...updatedOrder,
      total: updatedOrder.pricing?.total || updatedOrder.total || 0,
      subtotal: updatedOrder.pricing?.subtotal || updatedOrder.subtotal || 0,
      deliveryFee: updatedOrder.pricing?.deliveryFee || updatedOrder.deliveryFee || 0,
      driverEarnings: updatedOrder.driverEarnings || updatedOrder.pricing?.driverPayout || 0
    };
    
    console.log('✅ Order accepted by driver');
    console.log('=========================================\n');
    
    res.json({ 
      success: true, 
      message: 'Order accepted successfully', 
      order: transformedOrder 
    });
  } catch (error) {
    console.error('❌ Error accepting order:', error);
    res.status(500).json({ error: 'Failed to accept order', details: error.message });
  }
});

// ==========================================
// UPDATE DELIVERY STATUS
// ==========================================
router.put('/update-status/:orderId', auth, isDriver, async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body;
    
    console.log(`\n========== 🚗 UPDATING DELIVERY STATUS ==========`);
    console.log('Order ID:', orderId);
    console.log('New Status:', status);
    console.log('Driver ID:', req.user.id);
    
    const order = await Order.findById(orderId).lean();
    
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    if (!order.driver || order.driver.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized to update this order' });
    }
    
    const validStatuses = ['picked_up', 'on_the_way', 'delivered'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    
    const timestampField = 
      status === 'picked_up' ? 'pickedUpAt' :
      status === 'on_the_way' ? 'onTheWayAt' :
      status === 'delivered' ? 'deliveredAt' : null;
    
    const updateData = { status: status };
    if (timestampField) {
      updateData[`timestamps.${timestampField}`] = new Date();
    }
    
    await Order.updateOne(
      { _id: orderId },
      { $set: updateData },
      { runValidators: false }
    );
    
    const updatedOrder = await Order.findById(orderId)
      .populate('restaurant', 'name')
      .populate('user', 'name phone')
      .lean();
    
    const transformedOrder = {
      ...updatedOrder,
      total: updatedOrder.pricing?.total || updatedOrder.total || 0,
      subtotal: updatedOrder.pricing?.subtotal || updatedOrder.subtotal || 0,
      deliveryFee: updatedOrder.pricing?.deliveryFee || updatedOrder.deliveryFee || 0,
      driverEarnings: updatedOrder.driverEarnings || updatedOrder.pricing?.driverPayout || 0
    };
    
    console.log(`✅ Order status updated to: ${status}`);
    console.log('=========================================\n');
    
    res.json({ 
      success: true, 
      message: `Order status updated to ${status}`, 
      order: transformedOrder 
    });
  } catch (error) {
    console.error('❌ Error updating delivery status:', error);
    res.status(500).json({ error: 'Failed to update status', details: error.message });
  }
});

// ==========================================
// GET SPECIFIC ORDER DETAILS (DRIVER)
// ==========================================
router.get('/:id', auth, isDriver, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('restaurant', 'name address contact')
      .populate('user', 'name phone')
      .lean();
    
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    if (order.driver && order.driver.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized to view this order' });
    }
    
    const transformedOrder = {
      ...order,
      total: order.pricing?.total || order.total || 0,
      subtotal: order.pricing?.subtotal || order.subtotal || 0,
      deliveryFee: order.pricing?.deliveryFee || order.deliveryFee || 0,
      driverEarnings: order.driverEarnings || order.pricing?.driverPayout || 0
    };
    
    res.json({ success: true, order: transformedOrder });
  } catch (error) {
    console.error('❌ Error fetching order details:', error);
    res.status(500).json({ error: 'Failed to fetch order details' });
  }
});

module.exports = router;