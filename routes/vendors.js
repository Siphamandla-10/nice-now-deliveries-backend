// routes/vendors.js - COMPLETE VERSION
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const MenuItem = require('../models/MenuItem');
const Restaurant = require('../models/Restaurant');
const Order = require('../models/Order');
const { authMiddleware, vendorMiddleware } = require('../middleware/auth');

// Create uploads directory
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    const uniqueName = Date.now() + '-' + file.originalname;
    cb(null, uniqueName);
  }
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed!'), false);
  }
};

const upload = multer({ 
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }
});

const deleteFile = (filePath) => {
  if (filePath && fs.existsSync(filePath)) {
    fs.unlink(filePath, (err) => {
      if (err) console.error('Error deleting file:', err);
    });
  }
};

// ===== TEST ROUTE =====
router.get('/test', (req, res) => {
  console.log('Vendors test route hit successfully');
  res.json({
    success: true,
    message: 'Vendors route is working!',
    timestamp: new Date().toISOString()
  });
});

// ===== RESTAURANT MANAGEMENT =====

// GET /api/vendors/restaurant - Get vendor's restaurant
router.get('/restaurant', authMiddleware, vendorMiddleware, async (req, res) => {
  try {
    console.log('Fetching restaurant for vendor:', req.user._id);
    
    const restaurant = await Restaurant.findOne({ owner: req.user._id });
    
    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: 'Restaurant not found. Please create your restaurant profile.'
      });
    }
    
    res.json({
      success: true,
      restaurant: restaurant
    });
    
  } catch (error) {
    console.error('Get restaurant error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch restaurant',
      error: error.message
    });
  }
});

// POST /api/vendors/restaurant - Create vendor's restaurant
router.post('/restaurant', authMiddleware, vendorMiddleware, async (req, res) => {
  try {
    console.log('Creating restaurant for vendor:', req.user._id);
    console.log('Restaurant data:', req.body);
    
    // Check if restaurant already exists
    const existingRestaurant = await Restaurant.findOne({ owner: req.user._id });
    
    if (existingRestaurant) {
      return res.json({
        success: true,
        message: 'Restaurant already exists',
        restaurant: existingRestaurant
      });
    }
    
    // Create new restaurant
    const restaurantData = {
      owner: req.user._id,
      name: req.body.name || `${req.user.name}'s Restaurant`,
      description: req.body.description || 'Welcome to our restaurant',
      cuisine: req.body.cuisine || 'Various',
      deliveryFee: req.body.deliveryFee || 2.99,
      minimumOrder: req.body.minimumOrder || 0,
      isActive: req.body.isActive || false,
      status: req.body.status || 'active',
      contact: req.body.contact || {
        phone: req.user.phone || '',
        email: req.user.email || ''
      },
      address: req.body.address || {
        street: 'Address not set',
        city: 'City',
        state: 'State',
        zipCode: '0000',
        coordinates: {
          latitude: 0,
          longitude: 0
        }
      }
    };
    
    const restaurant = new Restaurant(restaurantData);
    await restaurant.save();
    
    console.log('Restaurant created successfully:', restaurant._id);
    
    res.status(201).json({
      success: true,
      message: 'Restaurant created successfully',
      restaurant: restaurant
    });
    
  } catch (error) {
    console.error('Create restaurant error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create restaurant',
      error: error.message
    });
  }
});

// PUT /api/vendors/restaurant - Update vendor's restaurant
router.put('/restaurant', authMiddleware, vendorMiddleware, async (req, res) => {
  try {
    console.log('Updating restaurant for vendor:', req.user._id);
    console.log('Update data:', req.body);
    
    const restaurant = await Restaurant.findOne({ owner: req.user._id });
    
    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: 'Restaurant not found'
      });
    }
    
    // Update allowed fields
    const allowedFields = [
      'name', 'description', 'cuisine', 'deliveryFee', 'minimumOrder',
      'contact', 'address', 'hours', 'isActive', 'status'
    ];
    
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        restaurant[field] = req.body[field];
      }
    });
    
    await restaurant.save();
    
    console.log('Restaurant updated successfully');
    
    res.json({
      success: true,
      message: 'Restaurant updated successfully',
      restaurant: restaurant
    });
    
  } catch (error) {
    console.error('Update restaurant error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update restaurant',
      error: error.message
    });
  }
});

// POST /api/vendors/restaurant/image - Upload restaurant image
router.post('/restaurant/image', authMiddleware, vendorMiddleware, upload.single('image'), async (req, res) => {
  try {
    console.log('Uploading restaurant image');
    
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No image file provided'
      });
    }
    
    const { imageType } = req.body;
    
    if (!imageType || !['profile', 'cover'].includes(imageType)) {
      deleteFile(req.file.path);
      return res.status(400).json({
        success: false,
        message: 'Invalid image type. Must be "profile" or "cover"'
      });
    }
    
    const restaurant = await Restaurant.findOne({ owner: req.user._id });
    
    if (!restaurant) {
      deleteFile(req.file.path);
      return res.status(404).json({
        success: false,
        message: 'Restaurant not found'
      });
    }
    
    const imageUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
    
    if (imageType === 'profile') {
      if (restaurant.images?.profileImage?.path) {
        deleteFile(restaurant.images.profileImage.path);
      }
      
      restaurant.images = restaurant.images || {};
      restaurant.images.profileImage = {
        filename: req.file.filename,
        path: req.file.path,
        url: imageUrl,
        uploadedAt: new Date()
      };
    } else if (imageType === 'cover') {
      if (restaurant.images?.coverImage?.path) {
        deleteFile(restaurant.images.coverImage.path);
      }
      
      restaurant.images = restaurant.images || {};
      restaurant.images.coverImage = {
        filename: req.file.filename,
        path: req.file.path,
        url: imageUrl,
        uploadedAt: new Date()
      };
    }
    
    await restaurant.save();
    
    res.json({
      success: true,
      message: 'Image uploaded successfully',
      imageUrl: imageUrl
    });
    
  } catch (error) {
    console.error('Upload restaurant image error:', error);
    if (req.file) deleteFile(req.file.path);
    res.status(500).json({
      success: false,
      message: 'Failed to upload image',
      error: error.message
    });
  }
});

// ===== ORDER MANAGEMENT =====

// GET /api/vendors/orders - Get orders for vendor's restaurant
router.get('/orders', authMiddleware, vendorMiddleware, async (req, res) => {
  try {
    console.log('=== VENDOR ORDERS FETCH ===');
    console.log('User ID:', req.user._id);
    console.log('Query params:', req.query);

    const userId = req.user._id || req.user.id;
    
    const restaurant = await Restaurant.findOne({ owner: userId });
    
    if (!restaurant) {
      console.log('No restaurant found for vendor');
      return res.json({
        success: true,
        orders: [],
        pagination: {
          current: 1,
          total: 0,
          totalOrders: 0
        }
      });
    }

    console.log('Found restaurant:', restaurant.name);

    const { page = 1, limit = 20, status } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    let query = { restaurant: restaurant._id };
    
    if (status && status !== 'all') {
      query.status = status.toLowerCase();
    }

    const orders = await Order.find(query)
      .populate('customer', 'name email phone')
      .populate('restaurant', 'name address phone')
      .populate({
        path: 'driver',
        populate: { path: 'user', select: 'name phone' }
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Order.countDocuments(query);

    console.log(`Returning ${orders.length} orders out of ${total} total`);

    res.json({
      success: true,
      orders: orders,
      pagination: {
        current: parseInt(page),
        total: Math.ceil(total / parseInt(limit)),
        totalOrders: total
      }
    });

  } catch (error) {
    console.error('Vendor orders fetch error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch vendor orders',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// PATCH /api/vendors/orders/:id/status - Update order status
router.patch('/orders/:id/status', authMiddleware, vendorMiddleware, async (req, res) => {
  try {
    console.log('=== ORDER STATUS UPDATE ===');
    console.log('Order ID:', req.params.id);
    console.log('New Status:', req.body.status);
    console.log('User ID:', req.user._id);

    const { status } = req.body;
    const orderId = req.params.id;

    if (!status) {
      return res.status(400).json({
        success: false,
        message: 'Status is required'
      });
    }

    if (!mongoose.isValidObjectId(orderId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid order ID format'
      });
    }

    const validStatuses = [
      'pending', 
      'confirmed', 
      'preparing', 
      'ready', 
      'out_for_delivery', 
      'delivered', 
      'cancelled'
    ];
    
    if (!validStatuses.includes(status.toLowerCase())) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Valid statuses: ${validStatuses.join(', ')}`
      });
    }

    const order = await Order.findById(orderId);
    
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    console.log('Found order:', {
      id: order._id,
      currentStatus: order.status,
      restaurant: order.restaurant
    });

    const userId = req.user._id || req.user.id;
    const restaurant = await Restaurant.findOne({ 
      _id: order.restaurant, 
      owner: userId 
    });

    if (!restaurant) {
      return res.status(403).json({
        success: false,
        message: 'You can only update orders for your restaurant'
      });
    }

    console.log('Ownership verified. Updating status...');

    order.status = status.toLowerCase();
    await order.save();

    console.log(`✅ Order ${orderId} status updated to ${status}`);

    res.json({
      success: true,
      message: 'Order status updated successfully',
      order: order
    });

  } catch (error) {
    console.error('❌ Order status update error:', error);
    
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Validation error: ' + error.message
      });
    }
    
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid order ID format'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to update order status',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// POST /api/vendors/orders/:orderId/request-driver - Request driver for order
router.post('/orders/:orderId/request-driver', authMiddleware, vendorMiddleware, async (req, res) => {
  try {
    const { orderId } = req.params;
    
    console.log('Requesting driver for order:', orderId);
    
    const order = await Order.findById(orderId);
    
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }
    
    const restaurant = await Restaurant.findOne({ 
      _id: order.restaurant, 
      owner: req.user._id 
    });
    
    if (!restaurant) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized for this order'
      });
    }
    
    if (order.driver) {
      return res.status(400).json({
        success: false,
        message: 'Driver already assigned to this order'
      });
    }
    
    order.status = 'ready';
    await order.save();
    
    console.log('Order marked as ready for driver pickup');
    
    res.json({
      success: true,
      message: 'Order is now available for drivers',
      order
    });
    
  } catch (error) {
    console.error('Request driver error:', error);
    res.status(500).json({
      success: false,
      message: 'Error requesting driver',
      error: error.message
    });
  }
});

// ===== MENU MANAGEMENT =====

// GET /api/vendors/menu - Get vendor's menu items
router.get('/menu', authMiddleware, vendorMiddleware, async (req, res) => {
  try {
    console.log('Getting menu for user:', req.user._id);
    
    let restaurant = await Restaurant.findOne({ owner: req.user._id });
    
    if (!restaurant) {
      return res.json({
        success: true,
        menuItems: [],
        restaurant: null,
        message: 'Please create your restaurant profile first'
      });
    }
    
    const menuItems = await MenuItem.find({ restaurant: restaurant._id })
      .sort({ category: 1, name: 1 });
    
    res.json({
      success: true,
      menuItems: menuItems || [],
      restaurant: {
        _id: restaurant._id,
        name: restaurant.name,
        description: restaurant.description
      }
    });
    
  } catch (error) {
    console.error('Get menu error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching menu items',
      error: error.message
    });
  }
});

// POST /api/vendors/menu - Create menu item
router.post('/menu', authMiddleware, vendorMiddleware, (req, res, next) => {
  const contentType = req.get('Content-Type') || '';
  if (contentType.includes('multipart/form-data')) {
    upload.single('image')(req, res, next);
  } else {
    next();
  }
}, async (req, res) => {
  try {
    console.log('=== MENU ITEM CREATION ===');
    console.log('User:', req.user._id);
    console.log('Body:', req.body);
    console.log('File:', req.file);
    
    let restaurant = await Restaurant.findOne({ owner: req.user._id });
    
    if (!restaurant) {
      if (req.file) deleteFile(req.file.path);
      return res.status(400).json({
        success: false,
        message: 'Please create your restaurant profile first'
      });
    }
    
    const { name, description, price, category } = req.body;
    
    if (!name || !price) {
      if (req.file) deleteFile(req.file.path);
      return res.status(400).json({
        success: false,
        message: 'Name and price are required'
      });
    }
    
    const parsedPrice = parseFloat(price);
    if (isNaN(parsedPrice) || parsedPrice <= 0) {
      if (req.file) deleteFile(req.file.path);
      return res.status(400).json({
        success: false,
        message: 'Price must be a valid positive number'
      });
    }
    
    const menuItemData = {
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
      preparationTime: parseInt(req.body.preparationTime) || 15
    };

    if (req.file) {
      menuItemData.image = {
        filename: req.file.filename,
        path: req.file.path,
        url: `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`,
        uploadedAt: new Date()
      };
    }
    
    const menuItem = new MenuItem(menuItemData);
    await menuItem.save();
    
    console.log('Menu item created:', menuItem._id);
    
    res.status(201).json({
      success: true,
      message: 'Menu item created successfully',
      menuItem: menuItem
    });
    
  } catch (error) {
    console.error('Create menu item error:', error);
    if (req.file) deleteFile(req.file.path);
    res.status(500).json({
      success: false,
      message: 'Error creating menu item',
      error: error.message
    });
  }
});

// PUT /api/vendors/menu/:id - Update menu item
router.put('/menu/:id', authMiddleware, vendorMiddleware, (req, res, next) => {
  const contentType = req.get('Content-Type') || '';
  if (contentType.includes('multipart/form-data')) {
    upload.single('image')(req, res, next);
  } else {
    next();
  }
}, async (req, res) => {
  try {
    const { id } = req.params;
    
    const menuItem = await MenuItem.findById(id).populate('restaurant');
    
    if (!menuItem) {
      if (req.file) deleteFile(req.file.path);
      return res.status(404).json({
        success: false,
        message: 'Menu item not found'
      });
    }
    
    if (menuItem.restaurant.owner.toString() !== req.user._id.toString()) {
      if (req.file) deleteFile(req.file.path);
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this menu item'
      });
    }
    
    const oldImagePath = menuItem.image?.path;
    
    const updateFields = [
      'name', 'description', 'price', 'category', 'isAvailable', 
      'isVegetarian', 'isVegan', 'isGlutenFree', 'spiceLevel', 'preparationTime'
    ];
    
    updateFields.forEach(field => {
      if (req.body[field] !== undefined) {
        if (field === 'price') {
          const parsedPrice = parseFloat(req.body[field]);
          if (!isNaN(parsedPrice) && parsedPrice > 0) {
            menuItem[field] = parsedPrice;
          }
        } else if (field === 'preparationTime') {
          const parsedTime = parseInt(req.body[field]);
          if (!isNaN(parsedTime) && parsedTime > 0) {
            menuItem[field] = parsedTime;
          }
        } else if (field.startsWith('is')) {
          menuItem[field] = req.body[field] === true || req.body[field] === 'true';
        } else {
          menuItem[field] = req.body[field];
        }
      }
    });

    if (req.file) {
      if (oldImagePath) deleteFile(oldImagePath);
      menuItem.image = {
        filename: req.file.filename,
        path: req.file.path,
        url: `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`,
        uploadedAt: new Date()
      };
    }
    
    await menuItem.save();
    
    res.json({
      success: true,
      message: 'Menu item updated successfully',
      menuItem: menuItem
    });
    
  } catch (error) {
    console.error('Update menu item error:', error);
    if (req.file) deleteFile(req.file.path);
    res.status(500).json({
      success: false,
      message: 'Error updating menu item',
      error: error.message
    });
  }
});

// DELETE /api/vendors/menu/:id - Delete menu item
router.delete('/menu/:id', authMiddleware, vendorMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    
    const menuItem = await MenuItem.findById(id).populate('restaurant');
    
    if (!menuItem) {
      return res.status(404).json({
        success: false,
        message: 'Menu item not found'
      });
    }
    
    if (menuItem.restaurant.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this menu item'
      });
    }

    if (menuItem.image && menuItem.image.path) {
      deleteFile(menuItem.image.path);
    }
    
    await MenuItem.findByIdAndDelete(id);
    
    res.json({
      success: true,
      message: 'Menu item deleted successfully'
    });
    
  } catch (error) {
    console.error('Delete menu item error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting menu item',
      error: error.message
    });
  }
});

// PATCH /api/vendors/menu/:id/availability - Toggle menu item availability
router.patch('/menu/:id/availability', authMiddleware, vendorMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { isAvailable } = req.body;
    
    const menuItem = await MenuItem.findById(id).populate('restaurant');
    
    if (!menuItem) {
      return res.status(404).json({
        success: false,
        message: 'Menu item not found'
      });
    }
    
    if (menuItem.restaurant.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized'
      });
    }
    
    menuItem.isAvailable = isAvailable;
    await menuItem.save();
    
    res.json({
      success: true,
      message: 'Availability updated',
      menuItem
    });
    
  } catch (error) {
    console.error('Toggle availability error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating availability',
      error: error.message
    });
  }
});

// Error handling middleware
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File too large. Maximum size is 5MB.'
      });
    }
  }
  
  if (error.message === 'Only image files are allowed!') {
    return res.status(400).json({
      success: false,
      message: 'Only image files are allowed!'
    });
  }
  
  console.error('Vendor route error:', error);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: error.message
  });
});

module.exports = router;