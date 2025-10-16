// routes/users.js - COMPLETE WITH FIXED LOCATION ENDPOINTS

const express = require('express');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Restaurant = require('../models/Restaurant');
const { authMiddleware } = require('../middleware/auth');
const router = express.Router();

// ========== PROFILE ENDPOINTS ==========

// Get current user profile
router.get('/profile', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select('-password')
      .populate('restaurant', 'name status isActive')
      .populate('driverProfile');
    
    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: 'User not found' 
      });
    }
    
    res.json({
      success: true,
      user: user
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error fetching profile' 
    });
  }
});

// Update user profile
router.put('/profile', authMiddleware, async (req, res) => {
  try {
    const { name, email, phone } = req.body;
    
    if (!name || !email) {
      return res.status(400).json({ 
        success: false,
        message: 'Name and email are required' 
      });
    }
    
    // Check if email is being changed and if it's already in use
    if (email !== req.user.email) {
      const existingUser = await User.findOne({ 
        email: email.toLowerCase(),
        _id: { $ne: req.user._id }
      });
      
      if (existingUser) {
        return res.status(409).json({ 
          success: false,
          message: 'Email already in use' 
        });
      }
    }
    
    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        phone: phone?.trim(),
        updatedAt: new Date()
      },
      { new: true, runValidators: true }
    ).select('-password').populate('restaurant', 'name status isActive');
    
    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: updatedUser
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error updating profile' 
    });
  }
});

// ========== LOCATION ENDPOINTS (FIXED) ==========

// PUT /api/users/location - Update user location with proper GeoJSON format
router.put('/location', authMiddleware, async (req, res) => {
  try {
    const { 
      latitude, 
      longitude, 
      city, 
      region, 
      country,
      street,
      streetNumber,
      district,
      postalCode,
      formattedAddress
    } = req.body;
    
    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        message: 'Latitude and longitude are required'
      });
    }
    
    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    
    if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return res.status(400).json({
        success: false,
        message: 'Invalid latitude or longitude values'
      });
    }
    
    // Optional: Validate South Africa bounds (remove if you want global support)
    if (lat < -35 || lat > -22 || lng < 16 || lng > 33) {
      console.warn('⚠️ Location outside South Africa:', { lat, lng });
      // Don't reject, just warn
    }
    
    const user = await User.findById(req.user._id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // CRITICAL FIX: Update location in proper GeoJSON format
    // MongoDB GeoJSON requires: [longitude, latitude]
    user.location = {
      type: 'Point',
      coordinates: [lng, lat]  // CORRECT ORDER: [longitude, latitude]
    };
    
    // Also update helper fields for easier access
    user.latitude = lat;
    user.longitude = lng;
    user.lastLocationUpdate = new Date();
    
    // Update address if provided (from reverse geocoding)
    if (street || city) {
      user.currentAddress = {
        street: street || user.currentAddress?.street || '',
        streetNumber: streetNumber || user.currentAddress?.streetNumber || '',
        district: district || user.currentAddress?.district || '',
        city: city || user.currentAddress?.city || '',
        region: region || user.currentAddress?.region || '',
        postalCode: postalCode || user.currentAddress?.postalCode || '',
        country: country || 'South Africa',
        formattedAddress: formattedAddress || `${street || ''}, ${city || ''}`.trim(),
        coordinates: {
          latitude: lat,
          longitude: lng
        },
        lastUpdated: new Date()
      };
    }
    
    // Update city, region for quick queries
    if (city) user.city = city;
    if (region) user.region = region;
    if (country) user.country = country;
    
    await user.save();
    
    console.log(`✅ Updated location for ${user.email} to [${lng}, ${lat}] (lng, lat) in ${city || 'Unknown City'}`);
    
    res.json({
      success: true,
      message: 'Location and address updated successfully',
      location: {
        latitude: lat,
        longitude: lng,
        city: user.city,
        region: user.region,
        country: user.country,
        lastUpdate: user.lastLocationUpdate
      },
      currentAddress: user.currentAddress
    });
    
  } catch (error) {
    console.error('❌ Update location error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update location',
      error: error.message
    });
  }
});

// PUT /api/users/current-address - Manually update current address
router.put('/current-address', authMiddleware, async (req, res) => {
  try {
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
    
    if (addressData.city) user.city = addressData.city;
    if (addressData.region) user.region = addressData.region;
    if (addressData.country) user.country = addressData.country;
    
    await user.save();
    
    res.json({
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

// GET /api/users/addresses - Get all delivery addresses
router.get('/addresses', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('addresses');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    res.json({
      success: true,
      addresses: user.addresses || []
    });
    
  } catch (error) {
    console.error('Get addresses error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get addresses',
      error: error.message
    });
  }
});

// POST /api/users/addresses - Add delivery address
router.post('/addresses', authMiddleware, async (req, res) => {
  try {
    const { 
      label, 
      street, 
      city, 
      state, 
      zipCode, 
      latitude, 
      longitude, 
      isDefault, 
      deliveryInstructions 
    } = req.body;
    
    if (!street || !city) {
      return res.status(400).json({
        success: false,
        message: 'Street and city are required'
      });
    }
    
    const user = await User.findById(req.user._id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // If this is set as default, unset all others
    if (isDefault) {
      user.addresses.forEach(addr => {
        addr.isDefault = false;
      });
    }
    
    const newAddress = {
      label: label || 'Home',
      street,
      city,
      state: state || '',
      zipCode: zipCode || '',
      coordinates: {
        latitude: latitude || null,
        longitude: longitude || null
      },
      isDefault: isDefault || user.addresses.length === 0,
      deliveryInstructions: deliveryInstructions || ''
    };
    
    user.addresses.push(newAddress);
    await user.save();
    
    res.json({
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

// PUT /api/users/addresses/:addressId - Update delivery address
router.put('/addresses/:addressId', authMiddleware, async (req, res) => {
  try {
    const { addressId } = req.params;
    const updateData = req.body;
    
    const user = await User.findById(req.user._id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    const addressIndex = user.addresses.findIndex(
      addr => addr._id.toString() === addressId
    );
    
    if (addressIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Address not found'
      });
    }
    
    // If setting as default, unset all others
    if (updateData.isDefault) {
      user.addresses.forEach((addr, idx) => {
        addr.isDefault = idx === addressIndex;
      });
    }
    
    // Update the address
    Object.assign(user.addresses[addressIndex], updateData);
    await user.save();
    
    res.json({
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

// DELETE /api/users/addresses/:addressId - Delete delivery address
router.delete('/addresses/:addressId', authMiddleware, async (req, res) => {
  try {
    const { addressId } = req.params;
    
    const user = await User.findById(req.user._id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    const addressIndex = user.addresses.findIndex(
      addr => addr._id.toString() === addressId
    );
    
    if (addressIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Address not found'
      });
    }
    
    const wasDefault = user.addresses[addressIndex].isDefault;
    user.addresses.splice(addressIndex, 1);
    
    // If deleted address was default, make first address default
    if (wasDefault && user.addresses.length > 0) {
      user.addresses[0].isDefault = true;
    }
    
    await user.save();
    
    res.json({
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

// ========== PASSWORD & SECURITY ==========

// Change password
router.put('/change-password', authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ 
        success: false,
        message: 'Current and new passwords are required' 
      });
    }
    
    if (newPassword.length < 6) {
      return res.status(400).json({ 
        success: false,
        message: 'New password must be at least 6 characters' 
      });
    }
    
    const user = await User.findById(req.user._id);
    
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ 
        success: false,
        message: 'Current password is incorrect' 
      });
    }
    
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    await User.findByIdAndUpdate(req.user._id, {
      password: hashedPassword,
      'accountActivity.lastPasswordChange': new Date(),
      updatedAt: new Date()
    });
    
    res.json({ 
      success: true,
      message: 'Password changed successfully' 
    });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error changing password' 
    });
  }
});

// ========== ACTIVITY & PREFERENCES ==========

// Update last activity
router.put('/activity', authMiddleware, async (req, res) => {
  try {
    const { lastActive, platform } = req.body;
    
    await User.findByIdAndUpdate(req.user._id, {
      lastActive: lastActive || new Date(),
      platform: platform || 'unknown',
      updatedAt: new Date()
    });
    
    res.json({ 
      success: true,
      message: 'Activity updated' 
    });
  } catch (error) {
    console.error('Update activity error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error updating activity' 
    });
  }
});

// Get notification preferences
router.get('/notifications', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select('notificationPreferences')
      .lean();
    
    const defaultPreferences = {
      orderUpdates: true,
      promotions: true,
      newFeatures: false,
      weeklyReports: true,
      email: true,
      push: true,
      sms: false
    };
    
    res.json({
      success: true,
      preferences: user.notificationPreferences || defaultPreferences
    });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error fetching notification preferences' 
    });
  }
});

// Update notification preferences
router.put('/notifications', authMiddleware, async (req, res) => {
  try {
    const preferences = req.body;
    
    await User.findByIdAndUpdate(req.user._id, {
      notificationPreferences: preferences,
      updatedAt: new Date()
    });
    
    res.json({ 
      success: true,
      message: 'Notification preferences updated', 
      preferences 
    });
  } catch (error) {
    console.error('Update notifications error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error updating notification preferences' 
    });
  }
});

// ========== ACCOUNT MANAGEMENT ==========

// Deactivate account
router.put('/deactivate', authMiddleware, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user._id, {
      isActive: false,
      deactivatedAt: new Date(),
      updatedAt: new Date()
    });
    
    // If vendor, deactivate restaurant too
    if (req.user.userType === 'vendor' && req.user.restaurant) {
      await Restaurant.findByIdAndUpdate(req.user.restaurant, {
        isActive: false,
        status: 'inactive',
        updatedAt: new Date()
      });
    }
    
    res.json({ 
      success: true,
      message: 'Account deactivated successfully' 
    });
  } catch (error) {
    console.error('Deactivate account error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error deactivating account' 
    });
  }
});

// Delete account (soft delete)
router.delete('/account', authMiddleware, async (req, res) => {
  try {
    const { password } = req.body;
    
    if (!password) {
      return res.status(400).json({ 
        success: false,
        message: 'Password confirmation required' 
      });
    }
    
    const user = await User.findById(req.user._id);
    const isMatch = await bcrypt.compare(password, user.password);
    
    if (!isMatch) {
      return res.status(400).json({ 
        success: false,
        message: 'Incorrect password' 
      });
    }
    
    await User.findByIdAndUpdate(req.user._id, {
      isActive: false,
      isDeleted: true,
      deletedAt: new Date(),
      email: `deleted_${Date.now()}_${user.email}`,
      updatedAt: new Date()
    });
    
    // If vendor, mark restaurant as deleted
    if (req.user.userType === 'vendor' && req.user.restaurant) {
      await Restaurant.findByIdAndUpdate(req.user.restaurant, {
        isActive: false,
        status: 'deleted',
        updatedAt: new Date()
      });
    }
    
    res.json({ 
      success: true, 
      message: 'Account deleted successfully' 
    });
  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error deleting account' 
    });
  }
});

// ========== STATISTICS (FOR VENDORS) ==========

// Get user statistics
router.get('/stats', authMiddleware, async (req, res) => {
  try {
    if (req.user.userType !== 'vendor') {
      return res.status(403).json({ 
        success: false,
        message: 'Only vendors can access stats' 
      });
    }
    
    const Order = require('../models/Order');
    const MenuItem = require('../models/MenuItem');
    
    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    
    const [
      todayOrders,
      monthOrders,
      totalOrders,
      menuItemsCount
    ] = await Promise.all([
      Order.countDocuments({
        restaurant: req.user.restaurant,
        createdAt: { $gte: todayStart }
      }),
      Order.countDocuments({
        restaurant: req.user.restaurant,
        createdAt: { $gte: monthStart }
      }),
      Order.countDocuments({
        restaurant: req.user.restaurant
      }),
      MenuItem.countDocuments({
        restaurant: req.user.restaurant
      })
    ]);
    
    const revenueStats = await Order.aggregate([
      {
        $match: {
          restaurant: req.user.restaurant,
          status: 'delivered',
          paymentStatus: 'paid'
        }
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$total' },
          todayRevenue: {
            $sum: {
              $cond: [
                { $gte: ['$createdAt', todayStart] },
                '$total',
                0
              ]
            }
          },
          monthRevenue: {
            $sum: {
              $cond: [
                { $gte: ['$createdAt', monthStart] },
                '$total',
                0
              ]
            }
          }
        }
      }
    ]);
    
    const revenue = revenueStats[0] || {
      totalRevenue: 0,
      todayRevenue: 0,
      monthRevenue: 0
    };
    
    res.json({
      success: true,
      orders: {
        today: todayOrders,
        month: monthOrders,
        total: totalOrders
      },
      revenue: {
        today: revenue.todayRevenue,
        month: revenue.monthRevenue,
        total: revenue.totalRevenue
      },
      menuItems: menuItemsCount,
      generatedAt: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Get user stats error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error fetching user statistics' 
    });
  }
});

// ========== DEBUG & UTILITY ==========

// Debug endpoint - Get current user info
router.get('/debug-me', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select('-password')
      .populate('restaurant')
      .populate('driverProfile');
    
    res.json({
      success: true,
      user: user,
      tokenUser: req.user,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Debug user error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error getting user debug info' 
    });
  }
});

module.exports = router;