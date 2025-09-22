// routes/restaurants.js - COMPLETE FIXED VERSION WITH MENU ROUTE
const express = require('express');
const Restaurant = require('../models/Restaurant');
const MenuItem = require('../models/MenuItem');
const { authMiddleware } = require('../middleware/auth');
const router = express.Router();

// Get all restaurants
router.get('/', async (req, res) => {
  try {
    console.log('=== GET /restaurants API CALL ===');
    console.log('Query params received:', req.query);
    
    const { 
      search, 
      cuisine, 
      featured, 
      includeInactive, 
      limit = 1000,
      page = 1,
      sortBy = 'rating'
    } = req.query;
    
    let query = {};
    
    if (includeInactive !== 'true' && includeInactive !== true) {
      query.isActive = true;
      console.log('Filtering to ACTIVE restaurants only');
    } else {
      console.log('Including ALL restaurants (active AND inactive)');
    }
   
    if (search && search.trim()) {
      query.$or = [
        { name: { $regex: search.trim(), $options: 'i' } },
        { cuisine: { $regex: search.trim(), $options: 'i' } },
        { description: { $regex: search.trim(), $options: 'i' } }
      ];
    }
   
    if (cuisine && cuisine.trim()) {
      query.cuisine = { $regex: cuisine.trim(), $options: 'i' };
    }
   
    if (featured === 'true' || featured === true) {
      query.isFeatured = true;
    }
    
    console.log('Final MongoDB query:', JSON.stringify(query, null, 2));
    
    const limitNum = Math.min(parseInt(limit) || 1000, 1000);
    const pageNum = Math.max(parseInt(page) || 1, 1);
    const skip = (pageNum - 1) * limitNum;
    
    let sortObject = {};
    switch (sortBy) {
      case 'rating':
        sortObject = { rating: -1, totalOrders: -1, name: 1 };
        break;
      case 'name':
        sortObject = { name: 1 };
        break;
      default:
        sortObject = { rating: -1, totalOrders: -1, name: 1 };
    }
    
    const restaurants = await Restaurant.find(query)
      .populate('owner', 'name email phone userType')
      .sort(sortObject)
      .limit(limitNum)
      .skip(skip)
      .lean();
    
    console.log(`Successfully retrieved ${restaurants.length} restaurants`);
    res.json(restaurants);
    
  } catch (error) {
    console.error('ERROR in GET /restaurants:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error fetching restaurants',
      error: error.message
    });
  }
});

// Get restaurant menu - THIS IS THE KEY ROUTE YOU NEED
router.get('/:id/menu', async (req, res) => {
  try {
    const restaurantId = req.params.id;
    console.log('Getting menu for restaurant ID:', restaurantId);
    
    // Verify restaurant exists
    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant) {
      return res.status(404).json({ 
        success: false,
        message: 'Restaurant not found' 
      });
    }
    
    // Fetch menu items from your menuitems collection using your MenuItem model
    const menuItems = await MenuItem.find({
      restaurant: restaurantId,
      isAvailable: true
    })
    .sort({ category: 1, displayOrder: 1, name: 1 })
    .lean();
    
    console.log(`Found ${menuItems.length} menu items for restaurant: ${restaurant.name}`);
    
    if (menuItems.length > 0) {
      console.log('Sample menu items:', menuItems.slice(0, 3).map(item => 
        `${item.name} - $${item.price} (${item.category})`
      ));
    } else {
      console.log('No menu items found for this restaurant');
    }
    
    // Return menu items array directly (your MenuScreen expects this format)
    res.json(menuItems);
    
  } catch (error) {
    console.error('Error fetching restaurant menu:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error fetching restaurant menu',
      error: error.message 
    });
  }
});

// Debug endpoint to check your menuitems collection
router.get('/debug/menu-items', async (req, res) => {
  try {
    console.log('=== MENU ITEMS DEBUG ENDPOINT ===');
    
    const totalMenuItems = await MenuItem.countDocuments({});
    const availableMenuItems = await MenuItem.countDocuments({ isAvailable: true });
    const unavailableMenuItems = await MenuItem.countDocuments({ isAvailable: false });
    
    // Get sample menu items with restaurant info
    const sampleMenuItems = await MenuItem.find({})
      .populate('restaurant', 'name')
      .limit(20)
      .lean();
    
    // Group menu items by restaurant
    const menuItemsByRestaurant = await MenuItem.aggregate([
      {
        $group: {
          _id: "$restaurant",
          count: { $sum: 1 },
          items: { $push: { 
            name: "$name", 
            price: "$price", 
            category: "$category", 
            isAvailable: "$isAvailable" 
          }}
        }
      },
      {
        $lookup: {
          from: 'restaurants',
          localField: '_id',
          foreignField: '_id',
          as: 'restaurantInfo'
        }
      }
    ]);
    
    const debugData = {
      success: true,
      timestamp: new Date().toISOString(),
      menuItemCounts: {
        total: totalMenuItems,
        available: availableMenuItems,
        unavailable: unavailableMenuItems
      },
      sampleMenuItems: sampleMenuItems.map(item => ({
        name: item.name,
        price: item.price,
        category: item.category || 'No category',
        restaurant: item.restaurant?.name || 'Unknown Restaurant',
        restaurantId: item.restaurant?._id || 'No restaurant ID',
        isAvailable: item.isAvailable
      })),
      menuItemsByRestaurant: menuItemsByRestaurant.map(group => ({
        restaurantName: group.restaurantInfo[0]?.name || 'Unknown Restaurant',
        restaurantId: group._id,
        menuItemCount: group.count,
        availableItems: group.items.filter(item => item.isAvailable).length,
        totalItems: group.items.length,
        sampleItems: group.items.slice(0, 3)
      })),
      collectionStatus: totalMenuItems > 0 ? 'Has menu items' : 'Empty menuitems collection'
    };
    
    console.log('Menu items debug summary:');
    console.log(`Total: ${totalMenuItems}, Available: ${availableMenuItems}`);
    console.log(`Restaurants with menus: ${menuItemsByRestaurant.length}`);
    
    res.json(debugData);
    
  } catch (error) {
    console.error('Menu items debug error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Debug endpoint failed',
      error: error.message
    });
  }
});

// Get vendor's restaurant
router.get('/my-restaurant', authMiddleware, async (req, res) => {
  try {
    console.log('Getting restaurant for user:', req.user._id);
    
    const restaurant = await Restaurant.findOne({ owner: req.user._id })
      .populate('owner', 'name email phone userType');
    
    if (!restaurant) {
      return res.status(404).json({ 
        success: false,
        message: 'Restaurant not found' 
      });
    }
    
    const menuItemsCount = await MenuItem.countDocuments({
      restaurant: restaurant._id
    });
    
    const restaurantData = {
      ...restaurant.toObject(),
      menuItemsCount
    };
    
    res.json({
      success: true,
      restaurant: restaurantData
    });
  } catch (error) {
    console.error('Error fetching restaurant:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error fetching restaurant' 
    });
  }
});

// Update vendor's restaurant
router.put('/my-restaurant', authMiddleware, async (req, res) => {
  try {
    console.log('Updating restaurant for user:', req.user._id);
    console.log('Update data:', req.body);
    
    let restaurant = await Restaurant.findOne({ owner: req.user._id });
    
    if (!restaurant) {
      if (req.user.userType === 'vendor') {
        restaurant = new Restaurant({
          owner: req.user._id,
          name: req.body.name || `${req.user.name}'s Restaurant`,
          description: req.body.description || 'Delicious food served fresh daily',
          status: req.body.status || 'active',
          isActive: req.body.isActive !== undefined ? req.body.isActive : true,
          cuisine: req.body.cuisine || 'Mixed',
          deliveryFee: req.body.deliveryFee || 2.99,
          minimumOrder: req.body.minimumOrder || 0,
          address: {
            street: req.body.address?.street || 'Address not set',
            city: req.body.address?.city || 'Johannesburg',
            state: req.body.address?.state || 'Gauteng',
            zipCode: req.body.address?.zipCode || '2000',
            coordinates: {
              latitude: req.body.address?.coordinates?.latitude || -26.2041,
              longitude: req.body.address?.coordinates?.longitude || 28.0473
            }
          },
          contact: {
            phone: req.user.phone || '+27-11-000-0000',
            email: req.user.email || ''
          }
        });
        
        await restaurant.save();
        console.log('New restaurant created');
      } else {
        return res.status(404).json({ 
          success: false,
          message: 'Restaurant not found' 
        });
      }
    }
    
    const allowedUpdates = [
      'name', 'description', 'cuisine', 'deliveryTime', 'deliveryFee', 
      'minimumOrder', 'address', 'contact', 'hours', 'tags', 'isActive', 'status'
    ];
    
    // Ensure contact.phone is preserved or set
    if (req.body.contact && !req.body.contact.phone) {
      req.body.contact.phone = restaurant.contact?.phone || req.user.phone || '+27-11-000-0000';
    }
    
    allowedUpdates.forEach(field => {
      if (req.body[field] !== undefined) {
        if (typeof req.body[field] === 'object' && !Array.isArray(req.body[field])) {
          restaurant[field] = { ...restaurant[field]?.toObject?.() || {}, ...req.body[field] };
        } else {
          restaurant[field] = req.body[field];
        }
      }
    });
    
    // Final check: Ensure phone is set before saving
    if (!restaurant.contact?.phone) {
      restaurant.contact = restaurant.contact || {};
      restaurant.contact.phone = req.user.phone || '+27-11-000-0000';
    }
    
    await restaurant.save();
    console.log('Restaurant updated successfully');
    
    const updatedRestaurant = await Restaurant.findById(restaurant._id)
      .populate('owner', 'name email phone userType');
    
    res.json({
      success: true,
      message: 'Restaurant updated successfully',
      restaurant: updatedRestaurant
    });
    
  } catch (error) {
    console.error('Error updating restaurant:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error updating restaurant details',
      error: error.message 
    });
  }
});

// Delete restaurant
router.delete('/my-restaurant', authMiddleware, async (req, res) => {
  try {
    const restaurant = await Restaurant.findOne({ owner: req.user._id });
    
    if (!restaurant) {
      return res.status(404).json({ 
        success: false,
        message: 'Restaurant not found' 
      });
    }
    
    await Restaurant.findByIdAndDelete(restaurant._id);
    
    res.json({
      success: true,
      message: 'Restaurant deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting restaurant:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error deleting restaurant',
      error: error.message 
    });
  }
});

// Get restaurant by ID with menu items
router.get('/:id', async (req, res) => {
  try {
    console.log('Getting restaurant details for ID:', req.params.id);
    
    const restaurant = await Restaurant.findById(req.params.id)
      .populate('owner', 'name email phone userType');
   
    if (!restaurant) {
      return res.status(404).json({ 
        success: false,
        message: 'Restaurant not found' 
      });
    }
   
    const menuItems = await MenuItem.find({
      restaurant: restaurant._id,
      isAvailable: true
    }).sort({ category: 1, name: 1 });
   
    console.log(`Found ${menuItems.length} menu items for ${restaurant.name}`);
    
    res.json({ 
      success: true,
      restaurant: restaurant.toObject(), 
      menuItems 
    });
  } catch (error) {
    console.error('Error fetching restaurant:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error fetching restaurant' 
    });
  }
});

// Create new restaurant
router.post('/', authMiddleware, async (req, res) => {
  try {
    console.log('Creating new restaurant for user:', req.user._id);
    
    const restaurantData = {
      ...req.body,
      owner: req.user._id,
      status: req.body.status || 'active',
      isActive: req.body.isActive !== undefined ? req.body.isActive : true
    };
    
    if (!restaurantData.contact?.phone) {
      restaurantData.contact = restaurantData.contact || {};
      restaurantData.contact.phone = req.user.phone || '+27-11-000-0000';
    }
    
    if (!restaurantData.address) {
      restaurantData.address = {
        street: 'Address to be updated',
        city: 'Johannesburg',
        state: 'Gauteng',
        zipCode: '2000',
        coordinates: { latitude: -26.2041, longitude: 28.0473 }
      };
    }
    
    const restaurant = new Restaurant(restaurantData);
    await restaurant.save();
    
    const populatedRestaurant = await Restaurant.findById(restaurant._id)
      .populate('owner', 'name email phone userType');
    
    res.status(201).json({
      success: true,
      message: 'Restaurant created successfully',
      restaurant: populatedRestaurant
    });
    
  } catch (error) {
    console.error('Error creating restaurant:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error creating restaurant',
      error: error.message 
    });
  }
});

module.exports = router;