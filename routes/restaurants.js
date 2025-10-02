// routes/restaurants.js - Customer-facing restaurant routes
const express = require('express');
const router = express.Router();
const Restaurant = require('../models/Restaurant');
const MenuItem = require('../models/MenuItem');
const { authMiddleware } = require('../middleware/auth');

// GET /api/restaurants - Get all active restaurants
router.get('/', async (req, res) => {
  try {
    console.log('Fetching all restaurants');
    console.log('Query params:', req.query);
    
    const { lat, lng, radius = 50 } = req.query;
    
    let query = {
      isActive: true,
      status: 'active'
    };
    
    // If location provided, add geospatial query
    if (lat && lng) {
      const latitude = parseFloat(lat);
      const longitude = parseFloat(lng);
      const radiusInKm = parseFloat(radius);
      
      console.log('Location query:', { latitude, longitude, radiusInKm });
      
      query['address.coordinates'] = {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [longitude, latitude]
          },
          $maxDistance: radiusInKm * 1000 // Convert km to meters
        }
      };
    }
    
    const restaurants = await Restaurant.find(query)
      .select('-__v')
      .sort({ isFeatured: -1, rating: -1 })
      .limit(50);
    
    console.log(`Found ${restaurants.length} restaurants`);
    
    res.json({
      success: true,
      restaurants: restaurants
    });
    
  } catch (error) {
    console.error('Get restaurants error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch restaurants',
      error: error.message
    });
  }
});

// GET /api/restaurants/:id - Get restaurant details
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log('Fetching restaurant details:', id);
    
    const restaurant = await Restaurant.findById(id);
    
    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: 'Restaurant not found'
      });
    }
    
    res.json({
      success: true,
      restaurant: restaurant
    });
    
  } catch (error) {
    console.error('Get restaurant details error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch restaurant details',
      error: error.message
    });
  }
});

// GET /api/restaurants/:id/menu - Get restaurant menu
router.get('/:id/menu', async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log('Fetching menu for restaurant:', id);
    
    const restaurant = await Restaurant.findById(id);
    
    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: 'Restaurant not found'
      });
    }
    
    const menuItems = await MenuItem.find({
      restaurant: id,
      isAvailable: true
    })
      .select('-__v')
      .sort({ category: 1, name: 1 });
    
    console.log(`Found ${menuItems.length} menu items`);
    
    res.json({
      success: true,
      menuItems: menuItems,
      restaurant: {
        _id: restaurant._id,
        name: restaurant.name
      }
    });
    
  } catch (error) {
    console.error('Get restaurant menu error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch menu',
      error: error.message
    });
  }
});

module.exports = router;