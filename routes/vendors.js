// routes/vendors.js - COMPLETE FIXED VERSION
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

// ===== DEBUG ROUTES =====
router.get('/test', (req, res) => {
  console.log('Vendors test route hit successfully');
  res.json({
    success: true,
    message: 'Vendors route is working!',
    timestamp: new Date().toISOString()
  });
});

// ===== ORDER MANAGEMENT ROUTES =====

// GET /api/vendors/orders - Get orders for vendor's restaurant
router.get('/orders', authMiddleware, vendorMiddleware, async (req, res) => {
  try {
    console.log('=== VENDOR ORDERS FETCH ===');
    console.log('User ID:', req.user._id || req.user.id);
    console.log('User Type:', req.user.userType);
    console.log('Query params:', req.query);

    const userId = req.user._id || req.user.id;
    
    // Find the vendor's restaurant
    const restaurant = await Restaurant.findOne({ owner: userId });
    console.log('Found restaurant:', restaurant ? restaurant.name : 'None');

    let orders = [];

    if (restaurant) {
      // Find orders by restaurant ID
      orders = await Order.find({ 
        restaurant: restaurant._id 
      })
      .populate('customer', 'name email phone')
      .populate('restaurant', 'name address phone')
      .populate('driver', 'name phone')
      .sort({ createdAt: -1 });
      
      console.log(`Found ${orders.length} orders by restaurant ID`);
    }

    // Apply filters and pagination
    const { page = 1, limit = 20, status } = req.query;
    const skip = (page - 1) * limit;

    let filteredOrders = orders;
    if (status && status !== 'all') {
      filteredOrders = orders.filter(order => 
        order.status?.toLowerCase() === status.toLowerCase()
      );
    }

    const paginatedOrders = filteredOrders.slice(skip, skip + parseInt(limit));

    console.log(`Returning ${paginatedOrders.length} orders`);

    res.json({
      success: true,
      orders: paginatedOrders,
      pagination: {
        current: parseInt(page),
        total: Math.ceil(filteredOrders.length / limit),
        totalOrders: filteredOrders.length
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

// PATCH /api/vendors/orders/:id/status - Update order status - COMPLETELY FIXED
router.patch('/orders/:id/status', authMiddleware, vendorMiddleware, async (req, res) => {
  try {
    console.log('=== ORDER STATUS UPDATE ===');
    console.log('Order ID:', req.params.id);
    console.log('New Status:', req.body.status);
    console.log('User ID:', req.user._id || req.user.id);

    const { status } = req.body;
    const orderId = req.params.id;

    // Validate inputs
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

    // Validate status value
    const validStatuses = ['pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'cancelled'];
    if (!validStatuses.includes(status.toLowerCase())) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Valid statuses are: ${validStatuses.join(', ')}`
      });
    }

    // Find the order
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

    // Verify ownership - check if user owns the restaurant
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

    // Update the order status - SIMPLE DIRECT UPDATE
    const updatedOrder = await Order.findByIdAndUpdate(
      orderId,
      { 
        status: status.toLowerCase(),
        [`${status.toLowerCase()}At`]: new Date(),
        updatedAt: new Date()
      },
      { 
        new: true,
        runValidators: true 
      }
    );

    if (!updatedOrder) {
      return res.status(500).json({
        success: false,
        message: 'Failed to update order status'
      });
    }

    console.log(`✅ Order ${orderId} status updated to ${status}`);

    res.json({
      success: true,
      message: 'Order status updated successfully',
      order: updatedOrder
    });

  } catch (error) {
    console.error('❌ Order status update error:', error);
    
    // Handle specific MongoDB errors
    if (error.name === 'ValidationError') {
      console.error('Validation error details:', error.errors);
      return res.status(400).json({
        success: false,
        message: 'Validation error: ' + error.message,
        details: error.errors
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

// ===== MENU MANAGEMENT ROUTES =====

// Get vendor's menu items
router.get('/menu', authMiddleware, vendorMiddleware, async (req, res) => {
  try {
    console.log('Getting menu for user:', req.user._id);
    
    let restaurant = await Restaurant.findOne({ owner: req.user._id });
    
    if (!restaurant) {
      restaurant = new Restaurant({
        owner: req.user._id,
        name: `${req.user.name}'s Restaurant`,
        description: "Delicious food served fresh daily",
        status: 'pending_approval',
        isActive: false,
        cuisine: 'Mixed',
        deliveryFee: 2.99,
        minimumOrder: 0,
        address: {
          street: 'Address not set',
          city: 'City',
          state: 'State',
          zipCode: '00000',
          coordinates: { latitude: 0, longitude: 0 }
        },
        contact: {
          phone: req.user.phone || '000-000-0000',
          email: req.user.email || ''
        }
      });
      
      await restaurant.save();
      console.log('Created new restaurant for vendor');
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

// Create menu item
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
      restaurant = new Restaurant({
        owner: req.user._id,
        name: `${req.user.name}'s Restaurant`,
        description: "Delicious food served fresh daily",
        status: 'pending_approval',
        isActive: false,
        cuisine: 'Mixed',
        deliveryFee: 2.99,
        minimumOrder: 0,
        address: {
          street: 'Address not set',
          city: 'City', 
          state: 'State',
          zipCode: '00000',
          coordinates: { latitude: 0, longitude: 0 }
        },
        contact: {
          phone: req.user.phone || '000-000-0000',
          email: req.user.email || ''
        }
      });
      
      await restaurant.save();
      console.log('Created restaurant');
    }
    
    const { name, description, price, category } = req.body;
    
    if (!name || !price) {
      if (req.file) deleteFile(req.file.path);
      return res.status(400).json({
        success: false,
        message: 'Name and price are required fields'
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
    
    console.log('Menu item created successfully:', menuItem._id);
    
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

// Update menu item
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
    
    const updateFields = ['name', 'description', 'price', 'category', 'isAvailable', 'isVegetarian', 'isVegan', 'isGlutenFree', 'spiceLevel', 'preparationTime'];
    
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

// Delete menu item
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