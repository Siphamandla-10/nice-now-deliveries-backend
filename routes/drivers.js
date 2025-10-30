const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const Restaurant = require('../models/Restaurant');
const MenuItem = require('../models/MenuItem');
const { auth, isDriver, isVendor, isAdmin } = require('../middleware/auth');

// ==========================================
// CREATE ORDER - FIXED
// ==========================================
router.post('/create', auth, async (req, res) => {
  try {
    const { restaurantId, items, deliveryAddress } = req.body;

    console.log('📦 Creating order for restaurant:', restaurantId);
    console.log('📦 Items:', items);

    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant) return res.status(404).json({ error: 'Restaurant not found' });

    let subtotal = 0;
    const detailedItems = [];

    for (const item of items) {
      const menuItem = await MenuItem.findById(item.itemId);
      if (!menuItem) return res.status(404).json({ error: `Menu item not found: ${item.itemId}` });

      const itemSubtotal = menuItem.price * item.quantity;
      subtotal += itemSubtotal;
      detailedItems.push({
        menuItem: menuItem._id,
        name: menuItem.name,
        quantity: item.quantity,
        price: menuItem.price,
        specialInstructions: item.specialInstructions || '',
        subtotal: itemSubtotal,
      });
    }

    const deliveryFee = 25;
    const serviceFee = 5;
    const total = subtotal + deliveryFee + serviceFee;

    console.log('💰 Order calculation:', { subtotal, deliveryFee, serviceFee, total });

    // Prepare delivery address
    const formattedAddress = typeof deliveryAddress === 'string' 
      ? {
          street: deliveryAddress,
          city: 'Johannesburg',
          state: 'Gauteng',
          zipCode: '2000',
          country: 'South Africa',
          contactPhone: req.user.phone || '0000000000'
        }
      : {
          street: deliveryAddress.street || 'Address not provided',
          city: deliveryAddress.city || 'Johannesburg',
          state: deliveryAddress.state || 'Gauteng',
          zipCode: deliveryAddress.zipCode || '2000',
          country: deliveryAddress.country || 'South Africa',
          contactPhone: deliveryAddress.contactPhone || req.user.phone || '0000000000',
          instructions: deliveryAddress.instructions || ''
        };

    const newOrder = new Order({
      user: req.user.id,
      restaurant: restaurant._id,
      items: detailedItems,
      deliveryAddress: formattedAddress,
      // ✅ FIXED: Use pricing object structure
      pricing: {
        subtotal: subtotal,
        deliveryFee: deliveryFee,
        serviceFee: serviceFee,
        discount: 0,
        total: total,
        platformCommissionRate: 20,
        driverPayout: 20
      },
      status: 'pending',
      payment: {
        method: 'cash',
        status: 'pending'
      }
    });

    await newOrder.save();
    
    console.log('✅ Order saved successfully');
    console.log('💰 Order pricing:', newOrder.pricing);
    console.log('💰 Order total:', newOrder.pricing.total);
    
    // Transform for response
    const orderResponse = newOrder.toObject();
    orderResponse.total = newOrder.pricing.total;
    orderResponse.subtotal = newOrder.pricing.subtotal;
    orderResponse.deliveryFee = newOrder.pricing.deliveryFee;
    
    res.status(201).json({ 
      success: true, 
      message: 'Order created successfully', 
      order: orderResponse
    });
  } catch (error) {
    console.error('❌ Error creating order:', error);
    res.status(500).json({ error: 'Failed to create order', details: error.message });
  }
});

// ==========================================
// DEBUG TEST ROUTE
// ==========================================
router.get('/debug-test', auth, async (req, res) => {
  try {
    console.log('\n========== 🔍 DEBUG TEST STARTING ==========');
    
    const allOrders = await Order.find().limit(3).lean();
    console.log('📊 Total orders in DB:', await Order.countDocuments());
    console.log('📋 Sample orders found:', allOrders.length);
    
    if (allOrders.length > 0) {
      const firstOrder = allOrders[0];
      console.log('\n========== FIRST ORDER ==========');
      console.log('Order ID:', firstOrder._id);
      console.log('Has pricing object:', !!firstOrder.pricing);
      console.log('Pricing.total:', firstOrder.pricing?.total);
      console.log('Pricing.subtotal:', firstOrder.pricing?.subtotal);
      console.log('Pricing.deliveryFee:', firstOrder.pricing?.deliveryFee);
      console.log('Status:', firstOrder.status);
      console.log('\nFull pricing object:', JSON.stringify(firstOrder.pricing, null, 2));
    }
    
    res.json({
      success: true,
      debug: {
        totalOrders: await Order.countDocuments(),
        firstOrderPricing: allOrders[0]?.pricing || null,
        sampleOrder: allOrders[0] || null
      }
    });
    
  } catch (error) {
    console.error('❌ Debug test error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// GET ALL ORDERS (ADMIN) - FIXED
// ==========================================
router.get('/', auth, isAdmin, async (req, res) => {
  try {
    const orders = await Order.find()
      .populate('user', 'name email phone')
      .populate('restaurant', 'name')
      .populate('driver', 'name phone')
      .lean()
      .sort({ createdAt: -1 });

    // Transform orders to include flat price fields
    const transformedOrders = orders.map(order => ({
      ...order,
      total: order.pricing?.total || 0,
      subtotal: order.pricing?.subtotal || 0,
      deliveryFee: order.pricing?.deliveryFee || 0,
      serviceFee: order.pricing?.serviceFee || 0
    }));

    res.json({ success: true, count: transformedOrders.length, orders: transformedOrders });
  } catch (error) {
    console.error('❌ Error fetching all orders:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// ==========================================
// GET MY ORDERS (USER) - FIXED
// ==========================================
router.get('/my-orders', auth, async (req, res) => {
  try {
    const orders = await Order.find({ user: req.user.id })
      .populate('restaurant', 'name')
      .populate('driver', 'name phone')
      .lean()
      .sort({ createdAt: -1 });

    const transformedOrders = orders.map(order => ({
      ...order,
      total: order.pricing?.total || 0,
      subtotal: order.pricing?.subtotal || 0,
      deliveryFee: order.pricing?.deliveryFee || 0,
      serviceFee: order.pricing?.serviceFee || 0
    }));

    res.json({ success: true, count: transformedOrders.length, orders: transformedOrders });
  } catch (error) {
    console.error('❌ Error fetching my orders:', error);
    res.status(500).json({ error: 'Failed to fetch your orders' });
  }
});

// ==========================================
// GET VENDOR ORDERS - FIXED
// ==========================================
router.get('/vendor-orders', auth, isVendor, async (req, res) => {
  try {
    const restaurant = await Restaurant.findOne({ owner: req.user.id });
    if (!restaurant) {
      return res.json({ 
        success: true, 
        count: 0, 
        orders: [], 
        message: 'No restaurant found for this vendor' 
      });
    }

    const orders = await Order.find({ restaurant: restaurant._id })
      .populate('user', 'name email phone')
      .populate('restaurant', 'name')
      .populate('driver', 'name phone')
      .lean()
      .sort({ createdAt: -1 });

    const transformedOrders = orders.map(order => ({
      ...order,
      total: order.pricing?.total || 0,
      subtotal: order.pricing?.subtotal || 0,
      deliveryFee: order.pricing?.deliveryFee || 0,
      serviceFee: order.pricing?.serviceFee || 0
    }));

    console.log('Vendor orders fetched:', transformedOrders.length);
    if (transformedOrders.length > 0) {
      console.log('First order total:', transformedOrders[0].total);
    }

    res.json({ success: true, count: transformedOrders.length, orders: transformedOrders });
  } catch (error) {
    console.error('❌ Error fetching vendor orders:', error);
    res.status(500).json({ error: 'Failed to fetch vendor orders', details: error.message });
  }
});

// ==========================================
// VENDOR REQUEST DRIVER - FIXED
// ==========================================
router.post('/:id/request-driver', auth, isVendor, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const restaurant = await Restaurant.findOne({ _id: order.restaurant, owner: req.user.id });
    if (!restaurant) return res.status(403).json({ error: 'Unauthorized to request driver for this order' });

    order.status = 'ready';
    await order.save();

    res.json({ success: true, message: 'Driver requested successfully', order });
  } catch (error) {
    console.error('❌ Error requesting driver:', error);
    res.status(500).json({ error: 'Failed to request driver', details: error.message });
  }
});

// ==========================================
// GET DRIVER ORDERS - FIXED
// ==========================================
router.get('/driver-orders', auth, isDriver, async (req, res) => {
  try {
    const orders = await Order.find({ driver: req.user.id })
      .populate('restaurant', 'name')
      .populate('user', 'name phone')
      .lean()
      .sort({ createdAt: -1 });

    const transformedOrders = orders.map(order => ({
      ...order,
      total: order.pricing?.total || 0,
      subtotal: order.pricing?.subtotal || 0,
      deliveryFee: order.pricing?.deliveryFee || 0,
      serviceFee: order.pricing?.serviceFee || 0,
      driverEarnings: order.driverEarnings || order.pricing?.driverPayout || 0
    }));

    res.json({ success: true, count: transformedOrders.length, orders: transformedOrders });
  } catch (error) {
    console.error('❌ Error fetching driver orders:', error);
    res.status(500).json({ error: 'Failed to fetch driver orders' });
  }
});

// ==========================================
// GET SINGLE ORDER DETAILS - FIXED
// ==========================================
router.get('/:id', auth, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('user', 'name email phone')
      .populate('restaurant', 'name address contact')
      .populate('driver', 'name phone')
      .populate('items.menuItem', 'name description price')
      .lean();

    if (!order) return res.status(404).json({ error: 'Order not found' });

    const isAuthorized =
      req.user.userType === 'admin' ||
      order.user._id.toString() === req.user.id ||
      (order.driver && order.driver._id.toString() === req.user.id);

    if (!isAuthorized) {
      return res.status(403).json({ error: 'Unauthorized to view this order' });
    }

    // Transform order
    const transformedOrder = {
      ...order,
      total: order.pricing?.total || 0,
      subtotal: order.pricing?.subtotal || 0,
      deliveryFee: order.pricing?.deliveryFee || 0,
      serviceFee: order.pricing?.serviceFee || 0
    };

    console.log('Order details - total:', transformedOrder.total);

    res.json({ success: true, order: transformedOrder });
  } catch (error) {
    console.error('❌ Error fetching order details:', error);
    res.status(500).json({ error: 'Failed to fetch order details' });
  }
});

// ==========================================
// UPDATE ORDER STATUS (Vendor or Admin) - FIXED
// ==========================================
router.put('/:id/status', auth, async (req, res) => {
  try {
    const { status } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    if (req.user.userType === 'vendor') {
      const restaurant = await Restaurant.findOne({ _id: order.restaurant, owner: req.user.id });
      if (!restaurant) return res.status(403).json({ error: 'Unauthorized to update this order' });
    }

    await order.updateStatus(status);
    
    // Transform response
    const orderResponse = order.toObject();
    orderResponse.total = order.pricing.total;
    orderResponse.subtotal = order.pricing.subtotal;
    orderResponse.deliveryFee = order.pricing.deliveryFee;
    
    res.json({ success: true, message: 'Order status updated', order: orderResponse });
  } catch (error) {
    console.error('❌ Error updating order status:', error);
    res.status(500).json({ error: 'Failed to update order status' });
  }
});

// ==========================================
// DRIVER ACCEPTS ORDER - FIXED
// ==========================================
router.put('/:id/assign', auth, isDriver, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.driver) return res.status(400).json({ error: 'Order already assigned' });

    await order.assignDriver(req.user.id);

    // Transform response
    const orderResponse = order.toObject();
    orderResponse.total = order.pricing.total;
    orderResponse.subtotal = order.pricing.subtotal;
    orderResponse.deliveryFee = order.pricing.deliveryFee;
    orderResponse.driverEarnings = order.driverEarnings;

    res.json({ success: true, message: 'Order assigned to driver', order: orderResponse });
  } catch (error) {
    console.error('❌ Error assigning driver:', error);
    res.status(500).json({ error: 'Failed to assign driver' });
  }
});

// ==========================================
// DRIVER UPDATES ORDER STATUS - FIXED
// ==========================================
router.put('/:id/driver-status', auth, isDriver, async (req, res) => {
  try {
    const { status } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    if (!order.driver || order.driver.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized to update this order' });
    }

    await order.updateStatus(status);

    // Transform response
    const orderResponse = order.toObject();
    orderResponse.total = order.pricing.total;
    orderResponse.subtotal = order.pricing.subtotal;
    orderResponse.deliveryFee = order.pricing.deliveryFee;
    orderResponse.driverEarnings = order.driverEarnings;

    res.json({ success: true, message: 'Order status updated by driver', order: orderResponse });
  } catch (error) {
    console.error('❌ Error updating driver order status:', error);
    res.status(500).json({ error: 'Failed to update driver order status' });
  }
});

module.exports = router;