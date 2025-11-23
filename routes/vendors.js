// routes/vendors.js - COMPLETE FIXED VERSION WITH DRIVER POPULATION AND CORRECT CALCULATIONS
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

// ===== HELPER: CALCULATE ORDER TOTALS =====
const calculateOrderTotals = (order) => {
  // Calculate subtotal from items
  let calculatedSubtotal = 0;
  if (order.items && Array.isArray(order.items)) {
    calculatedSubtotal = order.items.reduce((sum, item) => {
      const itemPrice = item.price || 0;
      const itemQuantity = item.quantity || 1;
      return sum + (itemPrice * itemQuantity);
    }, 0);
  }

  // Get fees from pricing or fallback to order level
  const deliveryFee = order.pricing?.deliveryFee || order.deliveryFee || 0;
  const serviceFee = order.pricing?.serviceFee || order.serviceFee || 0;
  const tax = order.pricing?.tax || order.tax || 0;
  const discount = order.pricing?.discount || order.discount || 0;

  // Use pricing.subtotal if available, otherwise use calculated
  const subtotal = order.pricing?.subtotal || calculatedSubtotal;

  // Calculate total
  const total = subtotal + deliveryFee + serviceFee + tax - discount;

  return {
    subtotal: parseFloat(subtotal.toFixed(2)),
    deliveryFee: parseFloat(deliveryFee.toFixed(2)),
    serviceFee: parseFloat(serviceFee.toFixed(2)),
    tax: parseFloat(tax.toFixed(2)),
    discount: parseFloat(discount.toFixed(2)),
    total: parseFloat(total.toFixed(2))
  };
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
      deliveryFee: req.body.deliveryFee || 20,
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

// ===== VENDOR ORDERS - WITH DRIVER POPULATION AND CORRECT CALCULATIONS =====
router.get('/orders', authMiddleware, vendorMiddleware, async (req, res) => {
  try {
    const vendorId = req.user._id;
    console.log('\n========== VENDOR ORDERS REQUEST ==========');
    console.log('Vendor ID:', vendorId);
    
    const restaurant = await Restaurant.findOne({ owner: vendorId });
    if (!restaurant) {
      console.log('❌ No restaurant found');
      return res.json({ success: true, orders: [], message: 'Create your restaurant first' });
    }

    console.log('✅ Restaurant found:', restaurant.name);

    const { status } = req.query;
    const query = { restaurant: restaurant._id };
    
    // If status filter is provided, use it; otherwise show active orders
    if (status) {
      query.status = status;
    } else {
      // Default: show active orders (not delivered or cancelled)
      query.status = { $in: ['pending', 'confirmed', 'preparing', 'ready', 'driver_assigned', 'picked_up', 'on_the_way'] };
    }

    const orders = await Order.find(query)
      .populate('user', 'name email phone')
      .populate('driver', 'name phone vehicleType vehicleNumber') // ✅ POPULATE DRIVER
      .populate('restaurant', 'name')
      .populate('items.menuItem', 'name price')
      .lean()
      .sort({ createdAt: -1 })
      .limit(50);

    console.log('📦 Orders found:', orders.length);
    
    // ✅ Transform orders with correct calculations and driver info
    const transformedOrders = orders.map(order => {
      const calculations = calculateOrderTotals(order);
      
      const transformed = {
        ...order,
        // Correct calculated totals
        subtotal: calculations.subtotal,
        deliveryFee: calculations.deliveryFee,
        serviceFee: calculations.serviceFee,
        tax: calculations.tax,
        discount: calculations.discount,
        total: calculations.total,
        // Customer info
        customerName: order.user?.name || 'Unknown',
        customerPhone: order.user?.phone || 'N/A',
        customerEmail: order.user?.email || 'N/A',
        // Driver info (if assigned)
        driverName: order.driver?.name || null,
        driverPhone: order.driver?.phone || null,
        driverVehicle: order.driver?.vehicleType || null,
        driverVehicleNumber: order.driver?.vehicleNumber || null,
        hasDriver: !!order.driver,
        // Keep original objects too
        pricing: order.pricing,
        driver: order.driver,
        user: order.user
      };
      
      return transformed;
    });

    if (transformedOrders.length > 0) {
      console.log('✅ First order transformed:');
      console.log('   ID:', transformedOrders[0]._id);
      console.log('   Status:', transformedOrders[0].status);
      console.log('   Subtotal:', transformedOrders[0].subtotal);
      console.log('   Delivery Fee:', transformedOrders[0].deliveryFee);
      console.log('   Service Fee:', transformedOrders[0].serviceFee);
      console.log('   Total:', transformedOrders[0].total);
      console.log('   Driver:', transformedOrders[0].driverName || 'Not assigned');
    }
    console.log('==========================================\n');

    res.json({ 
      success: true, 
      count: transformedOrders.length,
      orders: transformedOrders, 
      restaurant: { _id: restaurant._id, name: restaurant.name } 
    });
  } catch (error) {
    console.error('❌ Error fetching vendor orders:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch orders', error: error.message });
  }
});

// ===== GET SINGLE ORDER BY ID =====
router.get('/orders/:orderId', authMiddleware, vendorMiddleware, async (req, res) => {
  try {
    const { orderId } = req.params;
    const vendorId = req.user._id;

    console.log('\n========== GET SINGLE VENDOR ORDER ==========');
    console.log('Order ID:', orderId);
    console.log('Vendor ID:', vendorId);

    const restaurant = await Restaurant.findOne({ owner: vendorId });
    if (!restaurant) {
      return res.status(404).json({ success: false, message: 'Restaurant not found' });
    }

    const order = await Order.findOne({ _id: orderId, restaurant: restaurant._id })
      .populate('user', 'name email phone')
      .populate('driver', 'name phone vehicleType vehicleNumber')
      .populate('restaurant', 'name address contact')
      .populate('items.menuItem', 'name price image')
      .lean();

    if (!order) {
      console.log('❌ Order not found');
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const calculations = calculateOrderTotals(order);

    const transformedOrder = {
      ...order,
      subtotal: calculations.subtotal,
      deliveryFee: calculations.deliveryFee,
      serviceFee: calculations.serviceFee,
      tax: calculations.tax,
      discount: calculations.discount,
      total: calculations.total,
      customerName: order.user?.name || 'Unknown',
      customerPhone: order.user?.phone || 'N/A',
      customerEmail: order.user?.email || 'N/A',
      driverName: order.driver?.name || null,
      driverPhone: order.driver?.phone || null,
      driverVehicle: order.driver?.vehicleType || null,
      hasDriver: !!order.driver
    };

    console.log('✅ Order found:', order.orderNumber);
    console.log('   Total:', transformedOrder.total);
    console.log('   Driver:', transformedOrder.driverName || 'Not assigned');
    console.log('==========================================\n');

    res.json({ success: true, order: transformedOrder });
  } catch (error) {
    console.error('❌ Error fetching order:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch order', error: error.message });
  }
});

// ===== UPDATE ORDER STATUS - PUT (EXISTING) =====
router.put('/orders/:orderId/status', authMiddleware, vendorMiddleware, async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body;
    const vendorId = req.user._id;

    console.log(`\n📝 PUT - Updating order ${orderId} to status: ${status}`);

    const validStatuses = ['pending', 'confirmed', 'preparing', 'ready', 'driver_assigned', 'picked_up', 'on_the_way', 'delivered', 'cancelled'];
    if (!validStatuses.includes(status)) {
      console.log('❌ Invalid status:', status);
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    const restaurant = await Restaurant.findOne({ owner: vendorId });
    if (!restaurant) {
      console.log('❌ Restaurant not found for vendor');
      return res.status(404).json({ success: false, message: 'Restaurant not found' });
    }

    const order = await Order.findOne({ _id: orderId, restaurant: restaurant._id }).lean();
    if (!order) {
      console.log('❌ Order not found');
      return res.status(404).json({ success: false, message: 'Order not found or not yours' });
    }

    const oldStatus = order.status;
    console.log(`   Old status: ${oldStatus}`);

    const timestampField = 
      status === 'confirmed' ? 'confirmedAt' :
      status === 'preparing' ? 'preparingAt' :
      status === 'ready' ? 'readyAt' :
      status === 'driver_assigned' ? 'assignedAt' :
      status === 'picked_up' ? 'pickedUpAt' :
      status === 'on_the_way' ? 'onTheWayAt' :
      status === 'delivered' ? 'deliveredAt' :
      status === 'cancelled' ? 'cancelledAt' : null;

    const updateData = { status: status };
    if (timestampField) {
      updateData[`timestamps.${timestampField}`] = new Date();
    }

    await Order.updateOne(
      { _id: orderId },
      { $set: updateData },
      { runValidators: false }
    );

    console.log(`✅ Order ${orderId} status updated from ${oldStatus} to ${status}`);

    const updatedOrder = await Order.findById(orderId)
      .populate('user', 'name email phone')
      .populate('driver', 'name phone vehicleType vehicleNumber')
      .populate('restaurant', 'name')
      .lean();

    const calculations = calculateOrderTotals(updatedOrder);

    const orderResponse = {
      ...updatedOrder,
      subtotal: calculations.subtotal,
      deliveryFee: calculations.deliveryFee,
      serviceFee: calculations.serviceFee,
      tax: calculations.tax,
      discount: calculations.discount,
      total: calculations.total,
      customerName: updatedOrder.user?.name || 'Unknown',
      customerPhone: updatedOrder.user?.phone || 'N/A',
      driverName: updatedOrder.driver?.name || null,
      driverPhone: updatedOrder.driver?.phone || null,
      hasDriver: !!updatedOrder.driver
    };

    res.json({ 
      success: true, 
      message: `Order status updated to ${status}`, 
      order: orderResponse
    });
  } catch (error) {
    console.error('❌ Error updating order status:', error);
    res.status(500).json({ success: false, message: 'Failed to update status', error: error.message });
  }
});

// ===== UPDATE ORDER STATUS - PATCH (NEW - CRITICAL FIX) =====
router.patch('/orders/:orderId/status', authMiddleware, vendorMiddleware, async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body;
    const vendorId = req.user._id;

    console.log(`\n📝 PATCH - Updating order ${orderId} to status: ${status}`);

    const validStatuses = ['pending', 'confirmed', 'preparing', 'ready', 'driver_assigned', 'picked_up', 'on_the_way', 'delivered', 'cancelled'];
    if (!validStatuses.includes(status)) {
      console.log('❌ Invalid status:', status);
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    const restaurant = await Restaurant.findOne({ owner: vendorId });
    if (!restaurant) {
      console.log('❌ Restaurant not found for vendor');
      return res.status(404).json({ success: false, message: 'Restaurant not found' });
    }

    const order = await Order.findOne({ _id: orderId, restaurant: restaurant._id }).lean();
    if (!order) {
      console.log('❌ Order not found');
      return res.status(404).json({ success: false, message: 'Order not found or not yours' });
    }

    const oldStatus = order.status;
    console.log(`   Old status: ${oldStatus}`);

    const timestampField = 
      status === 'confirmed' ? 'confirmedAt' :
      status === 'preparing' ? 'preparingAt' :
      status === 'ready' ? 'readyAt' :
      status === 'driver_assigned' ? 'assignedAt' :
      status === 'picked_up' ? 'pickedUpAt' :
      status === 'on_the_way' ? 'onTheWayAt' :
      status === 'delivered' ? 'deliveredAt' :
      status === 'cancelled' ? 'cancelledAt' : null;

    const updateData = { status: status };
    if (timestampField) {
      updateData[`timestamps.${timestampField}`] = new Date();
      console.log(`   Setting timestamp: timestamps.${timestampField}`);
    }

    // Update driver status if applicable
    if (status === 'driver_assigned') updateData.driverStatus = 'accepted';
    if (status === 'picked_up') updateData.driverStatus = 'picked_up';
    if (status === 'on_the_way') updateData.driverStatus = 'on_the_way';
    if (status === 'delivered') updateData.driverStatus = 'delivered';

    console.log('   Update data:', updateData);

    await Order.updateOne(
      { _id: orderId },
      { $set: updateData },
      { runValidators: false }
    );

    console.log(`✅ Order ${orderId} status updated from ${oldStatus} to ${status}`);

    const updatedOrder = await Order.findById(orderId)
      .populate('user', 'name email phone')
      .populate('restaurant', 'name')
      .populate('driver', 'name phone vehicleType vehicleNumber')
      .lean();

    const calculations = calculateOrderTotals(updatedOrder);

    const orderResponse = {
      ...updatedOrder,
      subtotal: calculations.subtotal,
      deliveryFee: calculations.deliveryFee,
      serviceFee: calculations.serviceFee,
      tax: calculations.tax,
      discount: calculations.discount,
      total: calculations.total,
      customerName: updatedOrder.user?.name || 'Unknown',
      customerPhone: updatedOrder.user?.phone || 'N/A',
      driverName: updatedOrder.driver?.name || null,
      driverPhone: updatedOrder.driver?.phone || null,
      driverVehicle: updatedOrder.driver?.vehicleType || null,
      hasDriver: !!updatedOrder.driver
    };

    res.json({ 
      success: true, 
      message: `Order status updated to ${status}`, 
      order: orderResponse
    });
  } catch (error) {
    console.error('❌ Error updating order status (PATCH):', error);
    res.status(500).json({ success: false, message: 'Failed to update status', error: error.message });
  }
});

// ===== MENU MANAGEMENT =====
router.get('/menu', authMiddleware, vendorMiddleware, async (req, res) => {
  try {
    const restaurant = await Restaurant.findOne({ owner: req.user._id });
    if (!restaurant) {
      return res.json({ 
        success: true, 
        menuItems: [], 
        restaurant: null, 
        message: 'Create your restaurant first' 
      });
    }

    const menuItems = await MenuItem.find({ restaurant: restaurant._id })
      .sort({ category: 1, name: 1 });
      
    res.json({ 
      success: true, 
      menuItems, 
      restaurant: { 
        _id: restaurant._id, 
        name: restaurant.name, 
        description: restaurant.description 
      } 
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching menu', error: error.message });
  }
});

router.post('/menu', authMiddleware, vendorMiddleware, (req, res, next) => {
  const contentType = req.get('Content-Type') || '';
  if (contentType.includes('multipart/form-data')) {
    upload.single('image')(req, res, next);
  } else {
    next();
  }
}, async (req, res) => {
  try {
    const restaurant = await Restaurant.findOne({ owner: req.user._id });
    if (!restaurant) {
      if (req.file?.filename) await deleteFile(req.file.filename);
      return res.status(400).json({ success: false, message: 'Create restaurant first' });
    }

    const { name, description, price, category } = req.body;
    if (!name || !price) {
      if (req.file?.filename) await deleteFile(req.file.filename);
      return res.status(400).json({ success: false, message: 'Name & price required' });
    }

    const parsedPrice = parseFloat(price);
    if (isNaN(parsedPrice) || parsedPrice <= 0) {
      if (req.file?.filename) await deleteFile(req.file.filename);
      return res.status(400).json({ success: false, message: 'Price must be positive number' });
    }

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

// ===== VENDOR STATS =====
router.get('/stats', authMiddleware, vendorMiddleware, async (req, res) => {
  try {
    const restaurant = await Restaurant.findOne({ owner: req.user._id });
    if (!restaurant) {
      return res.json({ 
        success: true, 
        stats: {
          totalOrders: 0,
          pendingOrders: 0,
          completedOrders: 0,
          revenue: 0,
          todayOrders: 0,
          todayRevenue: 0
        }
      });
    }

    const totalOrders = await Order.countDocuments({ restaurant: restaurant._id });
    const pendingOrders = await Order.countDocuments({ 
      restaurant: restaurant._id, 
      status: { $in: ['pending', 'confirmed', 'preparing', 'ready'] } 
    });
    const completedOrders = await Order.countDocuments({ 
      restaurant: restaurant._id, 
      status: 'delivered' 
    });

    const completedOrdersList = await Order.find({ 
      restaurant: restaurant._id, 
      status: 'delivered' 
    }).lean();

    const revenue = completedOrdersList.reduce((sum, order) => {
      const orderCalc = calculateOrderTotals(order);
      return sum + orderCalc.total;
    }, 0);

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayOrders = await Order.countDocuments({
      restaurant: restaurant._id,
      createdAt: { $gte: todayStart }
    });

    const todayOrdersList = await Order.find({
      restaurant: restaurant._id,
      status: 'delivered',
      'timestamps.deliveredAt': { $gte: todayStart }
    }).lean();

    const todayRevenue = todayOrdersList.reduce((sum, order) => {
      const orderCalc = calculateOrderTotals(order);
      return sum + orderCalc.total;
    }, 0);

    res.json({
      success: true,
      stats: {
        totalOrders,
        pendingOrders,
        completedOrders,
        revenue: parseFloat(revenue.toFixed(2)),
        todayOrders,
        todayRevenue: parseFloat(todayRevenue.toFixed(2))
      }
    });
  } catch (error) {
    console.error('Error fetching vendor stats:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch stats', error: error.message });
  }
});

module.exports = router;