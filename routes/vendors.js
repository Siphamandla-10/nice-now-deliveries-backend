// routes/vendors.js - COMPLETE VERSION WITH CLOUDINARY - FIXED
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

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Configure Cloudinary Storage for Multer
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'manu-items',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [{ width: 800, height: 800, crop: 'limit' }]
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

// Delete file from Cloudinary
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
  console.log('Vendors test route hit successfully');
  res.json({
    success: true,
    message: 'Vendors route is working!',
    timestamp: new Date().toISOString()
  });
});

// ===== ROOT ROUTE - GET ALL VENDORS =====
router.get('/', async (req, res) => {
  try {
    console.log('Fetching all vendors/restaurants');
    
    const restaurants = await Restaurant.find({ status: 'active' })
      .populate('owner', 'name email phone')
      .select('name description cuisine deliveryFee minimumOrder rating images contact address')
      .sort({ rating: -1 })
      .limit(50);
    
    res.json({
      success: true,
      count: restaurants.length,
      vendors: restaurants
    });
  } catch (error) {
    console.error('Get vendors error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch vendors',
      error: error.message
    });
  }
});

// ===== RESTAURANT MANAGEMENT =====

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

router.post('/restaurant', authMiddleware, vendorMiddleware, async (req, res) => {
  try {
    console.log('Creating restaurant for vendor:', req.user._id);
    
    const existingRestaurant = await Restaurant.findOne({ owner: req.user._id });
    
    if (existingRestaurant) {
      return res.json({
        success: true,
        message: 'Restaurant already exists',
        restaurant: existingRestaurant
      });
    }
    
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

router.put('/restaurant', authMiddleware, vendorMiddleware, async (req, res) => {
  try {
    console.log('Updating restaurant for vendor:', req.user._id);
    
    const restaurant = await Restaurant.findOne({ owner: req.user._id });
    
    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: 'Restaurant not found'
      });
    }
    
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

router.post('/restaurant/image', authMiddleware, vendorMiddleware, upload.single('image'), async (req, res) => {
  try {
    console.log('Uploading restaurant image to Cloudinary');
    
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No image file provided'
      });
    }
    
    const { imageType } = req.body;
    
    if (!imageType || !['profile', 'cover'].includes(imageType)) {
      await deleteFile(req.file.filename);
      return res.status(400).json({
        success: false,
        message: 'Invalid image type. Must be "profile" or "cover"'
      });
    }
    
    const restaurant = await Restaurant.findOne({ owner: req.user._id });
    
    if (!restaurant) {
      await deleteFile(req.file.filename);
      return res.status(404).json({
        success: false,
        message: 'Restaurant not found'
      });
    }
    
    const imageUrl = req.file.path;
    const publicId = req.file.filename;
    
    if (imageType === 'profile') {
      if (restaurant.images?.profileImage?.publicId) {
        await deleteFile(restaurant.images.profileImage.publicId);
      }
      
      restaurant.images = restaurant.images || {};
      restaurant.images.profileImage = {
        publicId: publicId,
        url: imageUrl,
        uploadedAt: new Date()
      };
    } else if (imageType === 'cover') {
      if (restaurant.images?.coverImage?.publicId) {
        await deleteFile(restaurant.images.coverImage.publicId);
      }
      
      restaurant.images = restaurant.images || {};
      restaurant.images.coverImage = {
        publicId: publicId,
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
    if (req.file?.filename) await deleteFile(req.file.filename);
    res.status(500).json({
      success: false,
      message: 'Failed to upload image',
      error: error.message
    });
  }
});

// ===== ORDER MANAGEMENT =====

router.get('/orders', authMiddleware, vendorMiddleware, async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const restaurant = await Restaurant.findOne({ owner: userId });
    
    if (!restaurant) {
      return res.json({
        success: true,
        orders: [],
        pagination: { current: 1, total: 0, totalOrders: 0 }
      });
    }

    const { page = 1, limit = 20, status } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    let query = { restaurant: restaurant._id };
    if (status && status !== 'all') {
      query.status = status.toLowerCase();
    }

    const orders = await Order.find(query)
      .populate('customer', 'name email phone')
      .populate('restaurant', 'name address phone')
      .populate('driver', 'name phone email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Order.countDocuments(query);

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

router.patch('/orders/:id/status', authMiddleware, vendorMiddleware, async (req, res) => {
  try {
    const { status } = req.body;
    const orderId = req.params.id;

    if (!status) {
      return res.status(400).json({ success: false, message: 'Status is required' });
    }

    if (!mongoose.isValidObjectId(orderId)) {
      return res.status(400).json({ success: false, message: 'Invalid order ID format' });
    }

    const validStatuses = ['pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'cancelled'];
    
    if (!validStatuses.includes(status.toLowerCase())) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Valid statuses: ${validStatuses.join(', ')}`
      });
    }

    const order = await Order.findById(orderId);
    
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const userId = req.user._id || req.user.id;
    const restaurant = await Restaurant.findOne({ _id: order.restaurant, owner: userId });

    if (!restaurant) {
      return res.status(403).json({
        success: false,
        message: 'You can only update orders for your restaurant'
      });
    }

    order.status = status.toLowerCase();
    await order.save();

    res.json({
      success: true,
      message: 'Order status updated successfully',
      order: order
    });

  } catch (error) {
    console.error('Order status update error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update order status',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

router.post('/orders/:orderId/request-driver', authMiddleware, vendorMiddleware, async (req, res) => {
  try {
    const { orderId } = req.params;
    const order = await Order.findById(orderId);
    
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    
    const restaurant = await Restaurant.findOne({ _id: order.restaurant, owner: req.user._id });
    
    if (!restaurant) {
      return res.status(403).json({ success: false, message: 'Not authorized for this order' });
    }
    
    if (order.driver) {
      return res.status(400).json({ success: false, message: 'Driver already assigned to this order' });
    }
    
    order.status = 'ready';
    await order.save();
    
    res.json({
      success: true,
      message: 'Order is now available for drivers',
      order
    });
    
  } catch (error) {
    console.error('Request driver error:', error);
    res.status(500).json({ success: false, message: 'Error requesting driver', error: error.message });
  }
});

// ===== MENU MANAGEMENT =====

router.get('/menu', authMiddleware, vendorMiddleware, async (req, res) => {
  try {
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
    res.status(500).json({ success: false, message: 'Error fetching menu items', error: error.message });
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
    let restaurant = await Restaurant.findOne({ owner: req.user._id });
    
    if (!restaurant) {
      if (req.file?.filename) await deleteFile(req.file.filename);
      return res.status(400).json({ success: false, message: 'Please create your restaurant profile first' });
    }
    
    const { name, description, price, category } = req.body;
    
    if (!name || !price) {
      if (req.file?.filename) await deleteFile(req.file.filename);
      return res.status(400).json({ success: false, message: 'Name and price are required' });
    }
    
    const parsedPrice = parseFloat(price);
    if (isNaN(parsedPrice) || parsedPrice <= 0) {
      if (req.file?.filename) await deleteFile(req.file.filename);
      return res.status(400).json({ success: false, message: 'Price must be a valid positive number' });
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
        publicId: req.file.filename,
        url: req.file.path,
        uploadedAt: new Date()
      };
    }
    
    const menuItem = new MenuItem(menuItemData);
    await menuItem.save();
    
    res.status(201).json({
      success: true,
      message: 'Menu item created successfully',
      menuItem: menuItem
    });
    
  } catch (error) {
    console.error('Create menu item error:', error);
    if (req.file?.filename) await deleteFile(req.file.filename);
    res.status(500).json({ success: false, message: 'Error creating menu item', error: error.message });
  }
});

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
      if (req.file?.filename) await deleteFile(req.file.filename);
      return res.status(404).json({ success: false, message: 'Menu item not found' });
    }
    
    if (menuItem.restaurant.owner.toString() !== req.user._id.toString()) {
      if (req.file?.filename) await deleteFile(req.file.filename);
      return res.status(403).json({ success: false, message: 'Not authorized to update this menu item' });
    }
    
    const oldPublicId = menuItem.image?.publicId;
    
    const updateFields = ['name', 'description', 'price', 'category', 'isAvailable', 
      'isVegetarian', 'isVegan', 'isGlutenFree', 'spiceLevel', 'preparationTime'];
    
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
      if (oldPublicId) await deleteFile(oldPublicId);
      menuItem.image = {
        publicId: req.file.filename,
        url: req.file.path,
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
    if (req.file?.filename) await deleteFile(req.file.filename);
    res.status(500).json({ success: false, message: 'Error updating menu item', error: error.message });
  }
});

router.delete('/menu/:id', authMiddleware, vendorMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const menuItem = await MenuItem.findById(id).populate('restaurant');
    
    if (!menuItem) {
      return res.status(404).json({ success: false, message: 'Menu item not found' });
    }
    
    if (menuItem.restaurant.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized to delete this menu item' });
    }

    if (menuItem.image?.publicId) {
      await deleteFile(menuItem.image.publicId);
    }
    
    await MenuItem.findByIdAndDelete(id);
    
    res.json({ success: true, message: 'Menu item deleted successfully' });
    
  } catch (error) {
    console.error('Delete menu item error:', error);
    res.status(500).json({ success: false, message: 'Error deleting menu item', error: error.message });
  }
});

router.patch('/menu/:id/availability', authMiddleware, vendorMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { isAvailable } = req.body;
    
    const menuItem = await MenuItem.findById(id).populate('restaurant');
    
    if (!menuItem) {
      return res.status(404).json({ success: false, message: 'Menu item not found' });
    }
    
    if (menuItem.restaurant.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }
    
    menuItem.isAvailable = isAvailable;
    await menuItem.save();
    
    res.json({ success: true, message: 'Availability updated', menuItem });
    
  } catch (error) {
    console.error('Toggle availability error:', error);
    res.status(500).json({ success: false, message: 'Error updating availability', error: error.message });
  }
});

// Error handling middleware
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ success: false, message: 'File too large. Maximum size is 5MB.' });
    }
  }
  
  if (error.message === 'Only image files are allowed!') {
    return res.status(400).json({ success: false, message: 'Only image files are allowed!' });
  }
  
  console.error('Vendor route error:', error);
  res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
});

module.exports = router;