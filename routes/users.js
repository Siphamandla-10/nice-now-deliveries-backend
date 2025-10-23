// routes/users.js - FIXED with correct middleware import
const express = require('express');
const router = express.Router();
const User = require('../models/User');

// ✅ FIXED: Import from '../middleware/auth' instead of '../middleware/authMiddleware'
const { authMiddleware } = require('../middleware/auth');

// Alternatively, you can use this syntax:
// const authMiddleware = require('../middleware/auth');

// You can also create an alias 'protect' if you prefer:
const protect = authMiddleware;

// ========================================
// GET USER PROFILE - FIXED
// ========================================
router.get('/profile', protect, async (req, res) => {
  try {
    console.log('📱 Fetching profile for user:', req.user._id);

    // ✅ FIXED: No .populate('restaurant') - just get the user
    const user = await User.findById(req.user._id).select('-password');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    console.log('✅ Profile fetched successfully:', user.email);

    res.status(200).json({
      success: true,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        userType: user.userType,
        isVerified: user.isVerified,
        isActive: user.isActive,
        
        // Location data
        location: user.location,
        latitude: user.latitude,
        longitude: user.longitude,
        city: user.city,
        region: user.region,
        country: user.country,
        lastLocationUpdate: user.lastLocationUpdate,
        
        // Address data
        currentAddress: user.currentAddress,
        addresses: user.addresses,
        
        // Preferences
        preferences: user.preferences,
        
        // Metadata
        metadata: user.metadata,
        
        // Timestamps
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      }
    });

  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user profile',
      error: error.message
    });
  }
});

// ========================================
// UPDATE USER PROFILE
// ========================================
router.put('/profile', protect, async (req, res) => {
  try {
    console.log('📝 Updating profile for user:', req.user._id);

    const { name, phone, preferences } = req.body;

    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Update allowed fields
    if (name) user.name = name;
    if (phone) user.phone = phone;
    if (preferences) {
      user.preferences = {
        ...user.preferences,
        ...preferences
      };
    }

    await user.save();

    console.log('✅ Profile updated successfully');

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        userType: user.userType,
        preferences: user.preferences,
        updatedAt: user.updatedAt
      }
    });

  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update profile',
      error: error.message
    });
  }
});

// ========================================
// UPDATE USER LOCATION
// ========================================
router.put('/location', protect, async (req, res) => {
  try {
    console.log('📍 Updating location for user:', req.user._id);

    const { latitude, longitude, city, region, country, ...addressData } = req.body;

    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        message: 'Latitude and longitude are required'
      });
    }

    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Update location using the User model method
    await user.updateLocation(latitude, longitude, {
      city,
      region,
      country,
      ...addressData
    });

    console.log('✅ Location updated successfully');

    res.status(200).json({
      success: true,
      message: 'Location updated successfully',
      user: {
        _id: user._id,
        location: user.location,
        latitude: user.latitude,
        longitude: user.longitude,
        city: user.city,
        region: user.region,
        currentAddress: user.currentAddress
      }
    });

  } catch (error) {
    console.error('Update location error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update location',
      error: error.message
    });
  }
});

// ========================================
// UPDATE CURRENT ADDRESS
// ========================================
router.put('/current-address', protect, async (req, res) => {
  try {
    console.log('📍 Updating current address for user:', req.user._id);

    const addressData = req.body;

    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    user.currentAddress = {
      ...user.currentAddress,
      ...addressData,
      lastUpdated: new Date()
    };

    await user.save();

    console.log('✅ Current address updated');

    res.status(200).json({
      success: true,
      message: 'Current address updated successfully',
      currentAddress: user.currentAddress
    });

  } catch (error) {
    console.error('Update current address error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update current address',
      error: error.message
    });
  }
});

// ========================================
// GET USER ADDRESSES
// ========================================
router.get('/addresses', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      addresses: user.addresses || []
    });

  } catch (error) {
    console.error('Get addresses error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch addresses',
      error: error.message
    });
  }
});

// ========================================
// ADD DELIVERY ADDRESS
// ========================================
router.post('/addresses', protect, async (req, res) => {
  try {
    console.log('📍 Adding delivery address for user:', req.user._id);

    const addressData = req.body;

    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    await user.addAddress(addressData);

    console.log('✅ Address added successfully');

    res.status(201).json({
      success: true,
      message: 'Address added successfully',
      addresses: user.addresses
    });

  } catch (error) {
    console.error('Add address error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add address',
      error: error.message
    });
  }
});

// ========================================
// UPDATE DELIVERY ADDRESS
// ========================================
router.put('/addresses/:addressId', protect, async (req, res) => {
  try {
    console.log('📍 Updating address:', req.params.addressId);

    const { addressId } = req.params;
    const updateData = req.body;

    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const address = user.addresses.id(addressId);

    if (!address) {
      return res.status(404).json({
        success: false,
        message: 'Address not found'
      });
    }

    // Update address fields
    Object.keys(updateData).forEach(key => {
      address[key] = updateData[key];
    });

    await user.save();

    console.log('✅ Address updated successfully');

    res.status(200).json({
      success: true,
      message: 'Address updated successfully',
      addresses: user.addresses
    });

  } catch (error) {
    console.error('Update address error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update address',
      error: error.message
    });
  }
});

// ========================================
// DELETE DELIVERY ADDRESS
// ========================================
router.delete('/addresses/:addressId', protect, async (req, res) => {
  try {
    console.log('🗑️ Deleting address:', req.params.addressId);

    const { addressId } = req.params;

    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Use Mongoose's pull method to remove the address
    user.addresses.pull(addressId);
    await user.save();

    console.log('✅ Address deleted successfully');

    res.status(200).json({
      success: true,
      message: 'Address deleted successfully',
      addresses: user.addresses
    });

  } catch (error) {
    console.error('Delete address error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete address',
      error: error.message
    });
  }
});

// ========================================
// SET DEFAULT ADDRESS
// ========================================
router.put('/addresses/:addressId/default', protect, async (req, res) => {
  try {
    console.log('⭐ Setting default address:', req.params.addressId);

    const { addressId } = req.params;

    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Set all addresses to non-default
    user.addresses.forEach(addr => {
      addr.isDefault = false;
    });

    // Set the specified address as default
    const address = user.addresses.id(addressId);

    if (!address) {
      return res.status(404).json({
        success: false,
        message: 'Address not found'
      });
    }

    address.isDefault = true;
    await user.save();

    console.log('✅ Default address set');

    res.status(200).json({
      success: true,
      message: 'Default address set successfully',
      addresses: user.addresses
    });

  } catch (error) {
    console.error('Set default address error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to set default address',
      error: error.message
    });
  }
});

// ========================================
// UPLOAD PROFILE IMAGE
// ========================================
router.post('/profile/image', protect, async (req, res) => {
  try {
    console.log('📸 Uploading profile image for user:', req.user._id);

    // This route should use multer middleware for file upload
    // Add your image upload logic here
    
    res.status(501).json({
      success: false,
      message: 'Profile image upload not implemented yet'
    });

  } catch (error) {
    console.error('Upload profile image error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload profile image',
      error: error.message
    });
  }
});

// ========================================
// GET USER FAVORITES
// ========================================
router.get('/favorites', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate('favorites');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      favorites: user.favorites || []
    });

  } catch (error) {
    console.error('Get favorites error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch favorites',
      error: error.message
    });
  }
});

// ========================================
// ADD FAVORITE RESTAURANT
// ========================================
router.post('/favorites', protect, async (req, res) => {
  try {
    const { restaurantId } = req.body;

    if (!restaurantId) {
      return res.status(400).json({
        success: false,
        message: 'Restaurant ID is required'
      });
    }

    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Add to favorites if not already there
    if (!user.favorites) {
      user.favorites = [];
    }

    if (!user.favorites.includes(restaurantId)) {
      user.favorites.push(restaurantId);
      await user.save();
    }

    res.status(200).json({
      success: true,
      message: 'Restaurant added to favorites',
      favorites: user.favorites
    });

  } catch (error) {
    console.error('Add favorite error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add favorite',
      error: error.message
    });
  }
});

// ========================================
// REMOVE FAVORITE RESTAURANT
// ========================================
router.delete('/favorites/:restaurantId', protect, async (req, res) => {
  try {
    const { restaurantId } = req.params;

    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (user.favorites) {
      user.favorites = user.favorites.filter(
        fav => fav.toString() !== restaurantId
      );
      await user.save();
    }

    res.status(200).json({
      success: true,
      message: 'Restaurant removed from favorites',
      favorites: user.favorites || []
    });

  } catch (error) {
    console.error('Remove favorite error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove favorite',
      error: error.message
    });
  }
});

module.exports = router;