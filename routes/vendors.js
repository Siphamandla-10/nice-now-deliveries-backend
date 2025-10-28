// routes/vendors.js - FULL UPDATED VERSION WITH VENDOR ORDER VIEW
const express = require('express');
const router = express.Router();
const multer = require('multer');
const mongoose = require('mongoose');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const MenuItem = require('../models/MenuItem');
const Restaurant = require('../models/Restaurant');
const Order = require('../models/Order');
const { authMiddleware, vendorMiddleware } = require('../middleware/auth');

// ===== CLOUDINARY CONFIG =====
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'menu-items',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [{ width: 800, height: 800, crop: 'limit' }]
  }
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) cb(null, true);
  else cb(new Error('Only image files allowed'), false);
};

const upload = multer({ storage, fileFilter, limits: { fileSize: 5 * 1024 * 1024 } });

const deleteFile = async (publicId) => {
  if (publicId) {
    try {
      await cloudinary.uploader.destroy(publicId);
      console.log('Deleted image from Cloudinary:', publicId);
    } catch (err) {
      console.error('Error deleting from Cloudinary:', err);
    }
  }
};

// ===== TEST ROUTE =====
router.get('/test', (req, res) => {
  res.json({ success: true, message: 'Vendors route working!' });
});

// ===== GET ALL VENDORS =====
router.get('/', async (req, res) => {
  try {
    const restaurants = await Restaurant.find({ status: 'active' })
      .populate('owner', 'name email phone')
      .select('name description cuisine deliveryFee minimumOrder rating images contact address')
      .sort({ rating: -1 })
      .limit(50);

    res.json({ success: true, count: restaurants.length, vendors: restaurants });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch vendors', error: error.message });
  }
});

// ===== RESTAURANT MANAGEMENT =====
router.get('/restaurant', authMiddleware, vendorMiddleware, async (req, res) => {
  try {
    const restaurant = await Restaurant.findOne({ owner: req.user._id });
    if (!restaurant) return res.status(404).json({ success: false, message: 'Restaurant not found' });
    res.json({ success: true, restaurant });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch restaurant', error: error.message });
  }
});

router.post('/restaurant', authMiddleware, vendorMiddleware, async (req, res) => {
  try {
    const existing = await Restaurant.findOne({ owner: req.user._id });
    if (existing) return res.json({ success: true, message: 'Restaurant exists', restaurant: existing });

    const restaurant = new Restaurant({
      owner: req.user._id,
      name: req.body.name || `${req.user.name}'s Restaurant`,
      description: req.body.description || 'Welcome to our restaurant',
      cuisine: req.body.cuisine || 'Various',
      deliveryFee: req.body.deliveryFee || 2.99,
      minimumOrder: req.body.minimumOrder || 0,
      isActive: req.body.isActive || false,
      status: req.body.status || 'active',
      contact: req.body.contact || { phone: req.user.phone, email: req.user.email },
      address: req.body.address || { street: 'Address not set', city: 'City', state: 'State', zipCode: '0000', coordinates: { latitude: 0, longitude: 0 } }
    });
    await restaurant.save();
    res.status(201).json({ success: true, message: 'Restaurant created', restaurant });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to create restaurant', error: error.message });
  }
});

router.put('/restaurant', authMiddleware, vendorMiddleware, async (req, res) => {
  try {
    const restaurant = await Restaurant.findOne({ owner: req.user._id });
    if (!restaurant) return res.status(404).json({ success: false, message: 'Restaurant not found' });

    const fields = ['name', 'description', 'cuisine', 'deliveryFee', 'minimumOrder', 'isActive', 'status', 'contact', 'address', 'images'];
    fields.forEach(f => { if (req.body[f] !== undefined) restaurant[f] = req.body[f]; });

    await restaurant.save();
    res.json({ success: true, message: 'Restaurant updated', restaurant });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update restaurant', error: error.message });
  }
});

// ===== VENDOR ORDERS =====
router.get('/orders', authMiddleware, vendorMiddleware, async (req, res) => {
  try {
    const vendorId = req.user._id;
    const restaurant = await Restaurant.findOne({ owner: vendorId });
    if (!restaurant) return res.json({ success: true, orders: [], message: 'Create your restaurant first' });

    const activeStatuses = ['pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery'];

    const orders = await Order.find({ restaurant: restaurant._id, status: { $in: activeStatuses } })
      .populate('user', 'name email phone')
      .populate('driver', 'name phone')
      .populate('restaurant', 'name')
      .sort({ createdAt: -1 })
      .limit(50);

    res.json({ success: true, orders, restaurant: { _id: restaurant._id, name: restaurant.name } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch orders', error: error.message });
  }
});

// ===== UPDATE ORDER STATUS =====
router.put('/orders/:orderId/status', authMiddleware, vendorMiddleware, async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body;
    const vendorId = req.user._id;

    const validStatuses = ['pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'cancelled'];
    if (!validStatuses.includes(status)) return res.status(400).json({ success: false, message: 'Invalid status' });

    const restaurant = await Restaurant.findOne({ owner: vendorId });
    if (!restaurant) return res.status(404).json({ success: false, message: 'Restaurant not found' });

    const order = await Order.findOne({ _id: orderId, restaurant: restaurant._id });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found or not yours' });

    const oldStatus = order.status;
    order.status = status;
    await order.save();

    res.json({ success: true, message: `Order status updated to ${status}`, order: { _id: order._id, orderNumber: order.orderNumber, previousStatus: oldStatus, status: order.status } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update status', error: error.message });
  }
});

// ===== MENU MANAGEMENT =====
router.get('/menu', authMiddleware, vendorMiddleware, async (req, res) => {
  try {
    const restaurant = await Restaurant.findOne({ owner: req.user._id });
    if (!restaurant) return res.json({ success: true, menuItems: [], restaurant: null, message: 'Create your restaurant first' });

    const menuItems = await MenuItem.find({ restaurant: restaurant._id }).sort({ category: 1, name: 1 });
    res.json({ success: true, menuItems, restaurant: { _id: restaurant._id, name: restaurant.name, description: restaurant.description } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching menu', error: error.message });
  }
});

router.post('/menu', authMiddleware, vendorMiddleware, (req, res, next) => {
  const contentType = req.get('Content-Type') || '';
  if (contentType.includes('multipart/form-data')) upload.single('image')(req, res, next);
  else next();
}, async (req, res) => {
  try {
    const restaurant = await Restaurant.findOne({ owner: req.user._id });
    if (!restaurant) { if (req.file?.filename) await deleteFile(req.file.filename); return res.status(400).json({ success: false, message: 'Create restaurant first' }); }

    const { name, description, price, category } = req.body;
    if (!name || !price) { if (req.file?.filename) await deleteFile(req.file.filename); return res.status(400).json({ success: false, message: 'Name & price required' }); }

    const parsedPrice = parseFloat(price);
    if (isNaN(parsedPrice) || parsedPrice <= 0) { if (req.file?.filename) await deleteFile(req.file.filename); return res.status(400).json({ success: false, message: 'Price must be positive number' }); }

    const menuItem = new MenuItem({
      name: name.trim(),
      description: description?.trim() || '',
      price: parsedPrice,
      category: category?.trim() || 'General',
      restaurant: restaurant._id,
      isAvailable: req.body.isAvailable !== false && req.body.isAvailable !== 'false',
      isVegetarian: req.body.isVegetarian === true || req.body.isVegetarian === 'true',
      isVegan: req.body.isVegan === true || req.body.isVegan === 'true',
      isGlutenFree: req.body.isGlutenFree === true || req.body.isGlutenFree === 'true',
      spiceLevel: req.body.spiceLevel || 'None',
      preparationTime: parseInt(req.body.preparationTime) || 15,
      image: req.file?.path || '',
      imagePublicId: req.file?.filename || ''
    });

    await menuItem.save();
    res.status(201).json({ success: true, message: 'Menu item created', menuItem });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to create menu item', error: error.message });
  }
});

module.exports = router;
