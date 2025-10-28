const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const Restaurant = require('../models/Restaurant');
const MenuItem = require('../models/MenuItem');
const { auth, isDriver, isVendor, isAdmin } = require('../middleware/auth');

// ==========================================
// CREATE ORDER
// ==========================================
router.post('/create', auth, async (req, res) => {
  try {
    const { restaurantId, items, deliveryAddress } = req.body;

    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant) return res.status(404).json({ error: 'Restaurant not found' });

    let subtotal = 0;
    const detailedItems = [];

    for (const item of items) {
      const menuItem = await MenuItem.findById(item.itemId);
      if (!menuItem) return res.status(404).json({ error: `Menu item not found: ${item.itemId}` });

      const totalPrice = menuItem.price * item.quantity;
      subtotal += totalPrice;
      detailedItems.push({
        menuItem: menuItem._id,
        name: menuItem.name,
        quantity: item.quantity,
        price: menuItem.price,
        totalPrice,
      });
    }

    const deliveryFee = 20;
    const total = subtotal + deliveryFee;

    const newOrder = new Order({
      user: req.user.id,
      restaurant: restaurant._id,
      vendor: restaurant.owner,
      items: detailedItems,
      deliveryAddress,
      subtotal,
      deliveryFee,
      total,
      status: 'Pending',
      paymentStatus: 'Unpaid',
    });

    await newOrder.save();
    res.status(201).json({ success: true, message: 'Order created successfully', order: newOrder });
  } catch (error) {
    console.error('❌ Error creating order:', error);
    res.status(500).json({ error: 'Failed to create order', details: error.message });
  }
});

// ==========================================
// GET ALL ORDERS (ADMIN)
// ==========================================
router.get('/', auth, isAdmin, async (req, res) => {
  try {
    const orders = await Order.find()
      .populate('user', 'name email phone')
      .populate('restaurant', 'name')
      .populate('driver', 'name phone')
      .sort({ createdAt: -1 });

    res.json({ success: true, count: orders.length, orders });
  } catch (error) {
    console.error('❌ Error fetching all orders:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// ==========================================
// GET MY ORDERS (USER)
// ==========================================
router.get('/my-orders', auth, async (req, res) => {
  try {
    const orders = await Order.find({ user: req.user.id })
      .populate('restaurant', 'name')
      .populate('driver', 'name phone')
      .sort({ createdAt: -1 });

    res.json({ success: true, count: orders.length, orders });
  } catch (error) {
    console.error('❌ Error fetching my orders:', error);
    res.status(500).json({ error: 'Failed to fetch your orders' });
  }
});

// ==========================================
// GET VENDOR ORDERS
// ==========================================
router.get('/vendor-orders', auth, isVendor, async (req, res) => {
  try {
    const restaurant = await Restaurant.findOne({ owner: req.user.id });
    if (!restaurant) return res.json({ success: true, count: 0, orders: [], message: 'No restaurant found for this vendor' });

    const orders = await Order.find({ restaurant: restaurant._id })
      .populate('user', 'name email phone')
      .populate('restaurant', 'name')
      .populate('driver', 'name phone')
      .sort({ createdAt: -1 });

    res.json({ success: true, count: orders.length, orders });
  } catch (error) {
    console.error('❌ Error fetching vendor orders:', error);
    res.status(500).json({ error: 'Failed to fetch vendor orders', details: error.message });
  }
});

// ==========================================
// VENDOR REQUEST DRIVER
// ==========================================
router.post('/:id/request-driver', auth, isVendor, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    // Ensure the vendor owns the restaurant for this order
    const restaurant = await Restaurant.findOne({ _id: order.restaurant, owner: req.user.id });
    if (!restaurant) return res.status(403).json({ error: 'Unauthorized to request driver for this order' });

    // Update order status to awaiting driver
    order.status = 'Awaiting Driver';
    await order.save();

    res.json({ success: true, message: 'Driver requested successfully', order });
  } catch (error) {
    console.error('❌ Error requesting driver:', error);
    res.status(500).json({ error: 'Failed to request driver', details: error.message });
  }
});

// ==========================================
// GET DRIVER ORDERS
// ==========================================
router.get('/driver-orders', auth, isDriver, async (req, res) => {
  try {
    const orders = await Order.find({ driver: req.user.id })
      .populate('restaurant', 'name')
      .populate('user', 'name phone')
      .sort({ createdAt: -1 });

    res.json({ success: true, count: orders.length, orders });
  } catch (error) {
    console.error('❌ Error fetching driver orders:', error);
    res.status(500).json({ error: 'Failed to fetch driver orders' });
  }
});

// ==========================================
// GET SINGLE ORDER DETAILS
// ==========================================
router.get('/:id', auth, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('user', 'name email phone')
      .populate('restaurant', 'name address contact')
      .populate('driver', 'name phone')
      .populate('items.menuItem', 'name description price');

    if (!order) return res.status(404).json({ error: 'Order not found' });

    const isAuthorized =
      req.user.userType === 'admin' ||
      order.user.toString() === req.user.id ||
      (order.driver && order.driver._id.toString() === req.user.id) ||
      (order.vendor && order.vendor.toString() === req.user.id);

    if (!isAuthorized) return res.status(403).json({ error: 'Unauthorized to view this order' });

    res.json({ success: true, order });
  } catch (error) {
    console.error('❌ Error fetching order details:', error);
    res.status(500).json({ error: 'Failed to fetch order details' });
  }
});

// ==========================================
// UPDATE ORDER STATUS (Vendor or Admin)
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

    order.status = status;
    await order.save();
    res.json({ success: true, message: 'Order status updated', order });
  } catch (error) {
    console.error('❌ Error updating order status:', error);
    res.status(500).json({ error: 'Failed to update order status' });
  }
});

// ==========================================
// DRIVER ACCEPTS ORDER
// ==========================================
router.put('/:id/assign', auth, isDriver, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.driver) return res.status(400).json({ error: 'Order already assigned' });

    order.driver = req.user.id;
    order.status = 'Accepted';
    await order.save();

    res.json({ success: true, message: 'Order assigned to driver', order });
  } catch (error) {
    console.error('❌ Error assigning driver:', error);
    res.status(500).json({ error: 'Failed to assign driver' });
  }
});

// ==========================================
// DRIVER UPDATES ORDER STATUS
// ==========================================
router.put('/:id/driver-status', auth, isDriver, async (req, res) => {
  try {
    const { status } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    if (!order.driver || order.driver.toString() !== req.user.id)
      return res.status(403).json({ error: 'Unauthorized to update this order' });

    order.status = status;
    await order.save();

    res.json({ success: true, message: 'Order status updated by driver', order });
  } catch (error) {
    console.error('❌ Error updating driver order status:', error);
    res.status(500).json({ error: 'Failed to update driver order status' });
  }
});

module.exports = router;


