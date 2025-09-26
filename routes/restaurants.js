// routes/restaurants.js - COMPLETE VERSION WITH MENU IMAGE SUPPORT
const express = require('express');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { authMiddleware, vendorMiddleware } = require('../middleware/auth');
const Restaurant = require('../models/Restaurant');
const MenuItem = require('../models/MenuItem');

const router = express.Router();

// Helper function to get models directly from mongoose
const getModels = () => {
  try {
    return {
      Restaurant: mongoose.model('Restaurant'),
      MenuItem: mongoose.model('MenuItem')
    };
  } catch (error) {
    console.error('Error getting models:', error.message);
    return null;
  }
};

// Helper function to delete files
const deleteFile = (filePath) => {
  if (filePath && fs.existsSync(filePath)) {
    fs.unlink(filePath, (err) => {
      if (err) console.error('Error deleting file:', err);
    });
  }
};

// ===========================================
// HELPER FUNCTIONS
// ===========================================

function findMatchingImage(restaurantName, files) {
  const name = restaurantName.toLowerCase();
  
  for (const file of files) {
    const filename = file.toLowerCase();
    
    if (name.includes('kfc') && filename.includes('kfc')) return file;
    if (name.includes('mcdonald') && filename.includes('mcdonald')) return file;
    if (name.includes('nando') && filename.includes('nando')) return file;
    if (name.includes('burger king') && filename.includes('burger-king')) return file;
    if (name.includes('chicken licken') && filename.includes('chicken')) return file;
    if (name.includes('debonairs') && filename.includes('debonair')) return file;
    if (name.includes('romans pizza') && filename.includes('romans')) return file;
    if (name.includes('steers') && filename.includes('steers')) return file;
    if (name.includes('spur') && filename.includes('spur')) return file;
    if (name.includes('fishaways') && filename.includes('fishaway')) return file;
    if (name.includes('ocean basket') && filename.includes('ocean')) return file;
    if (name.includes('wimpy') && filename.includes('wimpy')) return file;
    if (name.includes('mathebula') && filename.includes('mathebula')) return file;
    if (name.includes('deliver now') && filename.includes('deliver')) return file;
    
    const cleanName = name.replace(/manager's|restaurant/g, '').trim();
    if (filename.includes(cleanName)) return file;
  }
  
  return null;
}

function findMatchingMenuImage(itemName, category, files) {
  const name = itemName.toLowerCase();
  const cat = category ? category.toLowerCase() : '';
  
  console.log(`Looking for match: "${itemName}" (${category})`);
  
  for (const file of files) {
    const filename = file.toLowerCase();
    
    // Specific food item mappings
    if (name.includes('big mac') && filename.includes('big-mac')) return file;
    if (name.includes('whopper') && filename.includes('whopper')) return file;
    if (name.includes('quarter pounder') && filename.includes('quarter')) return file;
    if (name.includes('mcchicken') && filename.includes('mcchicken')) return file;
    if (name.includes('cheeseburger') && filename.includes('cheese')) return file;
    if (name.includes('nuggets') && filename.includes('nugget')) return file;
    if (name.includes('fries') && filename.includes('fries')) return file;
    if (name.includes('mcflurry') && filename.includes('mcflurry')) return file;
    if (name.includes('shake') && filename.includes('shake')) return file;
    if (name.includes('cappuccino') && filename.includes('cappuccino')) return file;
    if (name.includes('pizza') && filename.includes('pizza')) return file;
    if (name.includes('burger') && filename.includes('burger')) return file;
    if (name.includes('chicken') && filename.includes('chicken')) return file;
    if (name.includes('beef') && filename.includes('beef')) return file;
    if (name.includes('fish') && filename.includes('fish')) return file;
    if (name.includes('pasta') && filename.includes('pasta')) return file;
    if (name.includes('salad') && filename.includes('salad')) return file;
    if (name.includes('soup') && filename.includes('soup')) return file;
    if (name.includes('dessert') && filename.includes('dessert')) return file;
    if (name.includes('ice cream') && filename.includes('ice-cream')) return file;
    
    // Category-based matching
    if (cat === 'appetizers' && filename.includes('appetizer')) return file;
    if (cat === 'main course' && filename.includes('main')) return file;
    if (cat === 'burgers' && filename.includes('burger')) return file;
    if (cat === 'pizza' && filename.includes('pizza')) return file;
    if (cat === 'desserts' && filename.includes('dessert')) return file;
    if (cat === 'beverages' && filename.includes('drink')) return file;
    if (cat === 'pasta' && filename.includes('pasta')) return file;
    if (cat === 'seafood' && filename.includes('seafood')) return file;
    if (cat === 'sides' && filename.includes('side')) return file;
    
    // Generic name matching (remove common words)
    const cleanName = name.replace(/\b(delicious|tasty|fresh|special|classic|premium)\b/g, '').trim();
    if (cleanName && filename.includes(cleanName)) return file;
  }
  
  console.log(`❌ No match found for: ${itemName}`);
  return null;
}

// ===========================================
// RESTAURANT ROUTES
// ===========================================

// Working route that uses direct database access for restaurants
router.get('/admin/direct-bulk-update', async (req, res) => {
  try {
    console.log('Direct bulk update started...');
    
    // Use mongoose connection directly
    const db = mongoose.connection.db;
    const restaurantsCollection = db.collection('restaurants');
    
    // Get restaurants directly from MongoDB
    const restaurants = await restaurantsCollection.find({}).toArray();
    console.log(`Found ${restaurants.length} restaurants in database`);
    
    // Get image files
    const uploadsDir = 'uploads/restaurants';
    
    if (!fs.existsSync(uploadsDir)) {
      return res.status(404).json({
        success: false,
        message: 'Uploads directory not found'
      });
    }
    
    const files = fs.readdirSync(uploadsDir).filter(file => 
      file.toLowerCase().match(/\.(png|jpg|jpeg|webp)$/)
    );
    console.log(`Found ${files.length} image files`);
    
    if (files.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No image files found'
      });
    }
    
    let updateCount = 0;
    const updates = [];
    
    for (const restaurant of restaurants) {
      try {
        // Find matching image
        const matchingFile = findMatchingImage(restaurant.name, files);
        
        if (matchingFile) {
          const imageUrl = `http://192.168.0.26:5000/uploads/restaurants/${matchingFile}`;
          
          // Update directly in MongoDB
          await restaurantsCollection.updateOne(
            { _id: restaurant._id },
            { 
              $set: { 
                image: imageUrl,
                coverImage: imageUrl,
                // Ensure required fields exist
                'contact.phone': restaurant.contact?.phone || '+27110000000',
                'address.street': restaurant.address?.street || 'Address not set',
                'address.city': restaurant.address?.city || 'Johannesburg',
                'address.state': restaurant.address?.state || 'Gauteng',
                'address.zipCode': restaurant.address?.zipCode || '2000',
                'address.coordinates.latitude': restaurant.address?.coordinates?.latitude || -26.2041,
                'address.coordinates.longitude': restaurant.address?.coordinates?.longitude || 28.0473,
                name: restaurant.name || 'Restaurant Name',
                description: restaurant.description || 'Delicious food served daily',
                cuisine: restaurant.cuisine || 'Mixed'
              }
            }
          );
          
          updateCount++;
          updates.push({
            restaurantName: restaurant.name,
            filename: matchingFile,
            imageUrl
          });
          
          console.log(`✅ Updated: ${restaurant.name} -> ${matchingFile}`);
        } else {
          console.log(`❌ No match found for: ${restaurant.name}`);
        }
      } catch (updateError) {
        console.error(`Error updating ${restaurant.name}:`, updateError.message);
      }
    }
    
    res.json({
      success: true,
      message: `Direct update completed. Updated ${updateCount} restaurants.`,
      totalRestaurants: restaurants.length,
      totalFiles: files.length,
      updatedCount: updateCount,
      updates,
      availableFiles: files
    });
    
  } catch (error) {
    console.error('Direct bulk update error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// ===========================================
// MENU IMAGE ROUTES
// ===========================================

// Bulk menu image assignment route
router.get('/admin/menu-bulk-update-images', async (req, res) => {
  try {
    console.log('Menu bulk image update started...');
    
    // Use mongoose connection directly
    const db = mongoose.connection.db;
    const menuItemsCollection = db.collection('menuitems');
    
    // Get menu items directly from MongoDB
    const menuItems = await menuItemsCollection.find({}).toArray();
    console.log(`Found ${menuItems.length} menu items in database`);
    
    if (menuItems.length === 0) {
      return res.json({
        success: false,
        message: 'No menu items found in database',
        suggestion: 'Add some menu items first through the vendor interface'
      });
    }
    
    // Get menu image files
    const menuUploadsDir = 'uploads/menu-items';
    
    if (!fs.existsSync(menuUploadsDir)) {
      fs.mkdirSync(menuUploadsDir, { recursive: true });
      console.log('Created menu uploads directory');
    }
    
    const files = fs.readdirSync(menuUploadsDir).filter(file => 
      file.toLowerCase().match(/\.(png|jpg|jpeg|webp|gif)$/)
    );
    console.log(`Found ${files.length} menu image files`);
    
    if (files.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No menu image files found. Please add images to uploads/menu-items/ directory',
        directory: menuUploadsDir,
        supportedFormats: ['jpg', 'jpeg', 'png', 'webp', 'gif']
      });
    }
    
    console.log('Available image files:', files);
    
    let updateCount = 0;
    let skippedCount = 0;
    const updates = [];
    const skipped = [];
    
    for (const menuItem of menuItems) {
      try {
        // Skip if already has image (optional - remove to force update)
        if (menuItem.images?.mainImage?.url || menuItem.image?.url) {
          console.log(`⏭️ Skipping ${menuItem.name} - already has image`);
          skippedCount++;
          skipped.push({
            name: menuItem.name,
            reason: 'Already has image',
            existingUrl: menuItem.images?.mainImage?.url || menuItem.image?.url
          });
          continue;
        }
        
        // Find matching image
        const matchingFile = findMatchingMenuImage(menuItem.name, menuItem.category, files);
        
        if (matchingFile) {
          const baseUrl = process.env.BASE_URL || 'http://192.168.0.26:5000';
          const imageUrl = `${baseUrl}/uploads/menu-items/${matchingFile}`;
          
          // Update directly in MongoDB with enhanced image structure
          const updateResult = await menuItemsCollection.updateOne(
            { _id: menuItem._id },
            { 
              $set: { 
                // Enhanced image structure
                'images.mainImage.filename': matchingFile,
                'images.mainImage.path': `uploads/menu-items/${matchingFile}`,
                'images.mainImage.url': imageUrl,
                'images.mainImage.uploadedAt': new Date(),
                
                // Legacy image field for backward compatibility
                'image.filename': matchingFile,
                'image.path': `uploads/menu-items/${matchingFile}`,
                'image.url': imageUrl,
                'image.uploadedAt': new Date(),
                
                // Update timestamp
                updatedAt: new Date()
              }
            }
          );
          
          if (updateResult.modifiedCount > 0) {
            updateCount++;
            updates.push({
              menuItemName: menuItem.name,
              category: menuItem.category,
              restaurant: menuItem.restaurant,
              filename: matchingFile,
              imageUrl
            });
            
            console.log(`✅ Updated: ${menuItem.name} (${menuItem.category}) -> ${matchingFile}`);
          }
        } else {
          skippedCount++;
          skipped.push({
            name: menuItem.name,
            category: menuItem.category,
            reason: 'No matching image found'
          });
        }
      } catch (updateError) {
        console.error(`Error updating ${menuItem.name}:`, updateError.message);
        skippedCount++;
        skipped.push({
          name: menuItem.name,
          reason: updateError.message
        });
      }
    }
    
    console.log('=== MENU BULK UPDATE COMPLETED ===');
    console.log(`Updated: ${updateCount}, Skipped: ${skippedCount}`);
    
    res.json({
      success: true,
      message: `Menu bulk image update completed. Updated ${updateCount} menu items, skipped ${skippedCount}.`,
      summary: {
        totalMenuItems: menuItems.length,
        totalFiles: files.length,
        updatedCount: updateCount,
        skippedCount: skippedCount
      },
      details: {
        updates: updates,
        skipped: skipped
      },
      availableFiles: files,
      recommendations: [
        updateCount === 0 ? 'No images were assigned. Check that image filenames match menu item names.' : null,
        files.length < menuItems.length ? 'Add more image files to cover all menu items.' : null,
        'Use descriptive filenames like: big-mac.jpg, chicken-nuggets.png, pizza.jpg'
      ].filter(Boolean)
    });
    
  } catch (error) {
    console.error('Menu bulk image update error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to update menu images',
      error: error.message 
    });
  }
});

// Force update route (updates even items with existing images)
router.get('/admin/menu-force-update-images', async (req, res) => {
  try {
    console.log('Menu force image update started...');
    
    const db = mongoose.connection.db;
    const menuItemsCollection = db.collection('menuitems');
    
    const menuItems = await menuItemsCollection.find({}).toArray();
    console.log(`Found ${menuItems.length} menu items for force update`);
    
    const menuUploadsDir = 'uploads/menu-items';
    const files = fs.readdirSync(menuUploadsDir).filter(file => 
      file.toLowerCase().match(/\.(png|jpg|jpeg|webp|gif)$/)
    );
    
    let updateCount = 0;
    const updates = [];
    
    for (const menuItem of menuItems) {
      const matchingFile = findMatchingMenuImage(menuItem.name, menuItem.category, files);
      
      if (matchingFile) {
        const baseUrl = process.env.BASE_URL || 'http://192.168.0.26:5000';
        const imageUrl = `${baseUrl}/uploads/menu-items/${matchingFile}`;
        
        await menuItemsCollection.updateOne(
          { _id: menuItem._id },
          { 
            $set: { 
              'images.mainImage.filename': matchingFile,
              'images.mainImage.path': `uploads/menu-items/${matchingFile}`,
              'images.mainImage.url': imageUrl,
              'images.mainImage.uploadedAt': new Date(),
              'image.filename': matchingFile,
              'image.path': `uploads/menu-items/${matchingFile}`,
              'image.url': imageUrl,
              'image.uploadedAt': new Date(),
              updatedAt: new Date()
            }
          }
        );
        
        updateCount++;
        updates.push({
          menuItemName: menuItem.name,
          filename: matchingFile,
          imageUrl
        });
        
        console.log(`🔄 Force updated: ${menuItem.name} -> ${matchingFile}`);
      }
    }
    
    res.json({
      success: true,
      message: `Force updated ${updateCount} menu items with images`,
      totalItems: menuItems.length,
      updatedCount: updateCount,
      updates: updates
    });
    
  } catch (error) {
    console.error('Menu force update error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// ===========================================
// DEBUG ROUTES
// ===========================================

// Direct database check for restaurant images
router.get('/debug/direct-check-images', async (req, res) => {
  try {
    const db = mongoose.connection.db;
    const restaurantsCollection = db.collection('restaurants');
    
    const restaurants = await restaurantsCollection.find({}).limit(15).toArray();
    const imageInfo = restaurants.map(r => ({
      name: r.name,
      image: r.image || 'none',
      coverImage: r.coverImage || 'none',
      hasImage: !!(r.image || r.coverImage)
    }));
    
    res.json({ 
      total: restaurants.length,
      restaurants: imageInfo,
      baseUrl: 'http://192.168.0.26:5000'
    });
  } catch (error) {
    console.error('Direct check images error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Debug route to check menu item images
router.get('/debug/menu-images', async (req, res) => {
  try {
    const db = mongoose.connection.db;
    const menuItemsCollection = db.collection('menuitems');
    
    const menuItems = await menuItemsCollection.find({}).limit(50).toArray();
    const imageInfo = menuItems.map(item => ({
      id: item._id,
      name: item.name,
      category: item.category,
      restaurant: item.restaurant,
      hasEnhancedImage: !!(item.images?.mainImage?.url),
      hasLegacyImage: !!(item.image?.url),
      enhancedImageUrl: item.images?.mainImage?.url || null,
      legacyImageUrl: item.image?.url || null
    }));
    
    const withEnhanced = imageInfo.filter(item => item.hasEnhancedImage).length;
    const withLegacy = imageInfo.filter(item => item.hasLegacyImage).length;
    const withAnyImage = imageInfo.filter(item => item.hasEnhancedImage || item.hasLegacyImage).length;
    
    // Check available image files
    const menuUploadsDir = 'uploads/menu-items';
    let availableFiles = [];
    try {
      if (fs.existsSync(menuUploadsDir)) {
        availableFiles = fs.readdirSync(menuUploadsDir).filter(file => 
          file.toLowerCase().match(/\.(png|jpg|jpeg|webp|gif)$/)
        );
      }
    } catch (err) {
      console.error('Error reading menu uploads directory:', err);
    }
    
    res.json({
      success: true,
      summary: {
        totalItems: menuItems.length,
        withEnhancedImages: withEnhanced,
        withLegacyImages: withLegacy,
        withAnyImage: withAnyImage,
        withoutImages: menuItems.length - withAnyImage,
        availableImageFiles: availableFiles.length
      },
      availableFiles: availableFiles,
      menuItems: imageInfo,
      baseUrl: process.env.BASE_URL || 'http://192.168.0.26:5000'
    });
    
  } catch (error) {
    console.error('Menu images debug error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// ===========================================
// MAIN RESTAURANT ROUTES
// ===========================================

// Get all restaurants
router.get('/', async (req, res) => {
  try {
    console.log('=== GET /restaurants API CALL ===');
    
    const models = getModels();
    if (!models) {
      // Fallback to direct database access
      const db = mongoose.connection.db;
      const restaurantsCollection = db.collection('restaurants');
      
      const { includeInactive = false } = req.query;
      let query = {};
      if (includeInactive !== 'true' && includeInactive !== true) {
        query.isActive = true;
      }
      
      const restaurants = await restaurantsCollection.find(query).toArray();
      console.log(`Successfully retrieved ${restaurants.length} restaurants via direct access`);
      return res.json(restaurants);
    }
    
    const { Restaurant } = models;
    
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

// Get restaurant menu
router.get('/:id/menu', async (req, res) => {
  try {
    const restaurantId = req.params.id;
    console.log('Getting menu for restaurant ID:', restaurantId);
    
    const models = getModels();
    if (!models) {
      return res.status(500).json({ 
        success: false,
        error: 'Models not available' 
      });
    }
    
    const { Restaurant, MenuItem } = models;
    
    // Verify restaurant exists
    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant) {
      return res.status(404).json({ 
        success: false,
        message: 'Restaurant not found' 
      });
    }
    
    // Fetch menu items
    const menuItems = await MenuItem.find({
      restaurant: restaurantId,
      isAvailable: true
    })
    .sort({ category: 1, displayOrder: 1, name: 1 })
    .lean();
    
    console.log(`Found ${menuItems.length} menu items for restaurant: ${restaurant.name}`);
    
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

// Get restaurant by ID
router.get('/:id', async (req, res) => {
  try {
    console.log('Getting restaurant details for ID:', req.params.id);
    
    const models = getModels();
    if (!models) {
      return res.status(500).json({ 
        success: false,
        error: 'Models not available' 
      });
    }
    
    const { Restaurant, MenuItem } = models;
    
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

// Test route to verify models are working
router.get('/test/models', async (req, res) => {
  try {
    const models = getModels();
    if (!models) {
      return res.json({ 
        success: false,
        message: 'Models not available',
        availableModels: Object.keys(mongoose.models),
        suggestion: 'Use /admin/direct-bulk-update for image assignment'
      });
    }
    
    const { Restaurant, MenuItem } = models;
    
    const restaurantCount = await Restaurant.countDocuments();
    const menuItemCount = await MenuItem.countDocuments();
    
    res.json({
      success: true,
      message: 'Models are working',
      counts: {
        restaurants: restaurantCount,
        menuItems: menuItemCount
      },
      availableModels: Object.keys(mongoose.models)
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: error.message,
      availableModels: Object.keys(mongoose.models)
    });
  }
});

module.exports = router;