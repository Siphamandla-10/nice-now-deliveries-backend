// routes/users.js - User profile management routes
const express = require('express');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Restaurant = require('../models/Restaurant');
const { authMiddleware } = require('../middleware/auth');
const router = express.Router();

// Get current user profile
router.get('/profile', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select('-password')
      .populate('restaurant', 'name status isActive')
      .populate('driverProfile');
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    res.json(user);
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ message: 'Error fetching profile' });
  }
});

// Update user profile
router.put('/profile', authMiddleware, async (req, res) => {
  try {
    const { name, email, phone } = req.body;
    
    // Validate input
    if (!name || !email) {
      return res.status(400).json({ message: 'Name and email are required' });
    }
    
    // Check if email is already taken by another user
    if (email !== req.user.email) {
      const existingUser = await User.findOne({ 
        email: email.toLowerCase(),
        _id: { $ne: req.user._id }
      });
      
      if (existingUser) {
        return res.status(409).json({ message: 'Email already in use' });
      }
    }
    
    // Update user
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
    
    res.json(updatedUser);
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ message: 'Error updating profile' });
  }
});

// Change password
router.put('/change-password', authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Current and new passwords are required' });
    }
    
    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'New password must be at least 6 characters' });
    }
    
    // Get user with password
    const user = await User.findById(req.user._id);
    
    // Verify current password
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }
    
    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    // Update password
    await User.findByIdAndUpdate(req.user._id, {
      password: hashedPassword,
      updatedAt: new Date()
    });
    
    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ message: 'Error changing password' });
  }
});

// Update last activity
router.put('/activity', authMiddleware, async (req, res) => {
  try {
    const { lastActive, platform } = req.body;
    
    await User.findByIdAndUpdate(req.user._id, {
      lastActive: lastActive || new Date(),
      platform: platform || 'unknown',
      updatedAt: new Date()
    });
    
    res.json({ message: 'Activity updated' });
  } catch (error) {
    console.error('Update activity error:', error);
    res.status(500).json({ message: 'Error updating activity' });
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
    
    res.json(user.notificationPreferences || defaultPreferences);
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ message: 'Error fetching notification preferences' });
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
    
    res.json({ message: 'Notification preferences updated', preferences });
  } catch (error) {
    console.error('Update notifications error:', error);
    res.status(500).json({ message: 'Error updating notification preferences' });
  }
});

// Deactivate account
router.put('/deactivate', authMiddleware, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user._id, {
      isActive: false,
      deactivatedAt: new Date(),
      updatedAt: new Date()
    });
    
    // If vendor, also deactivate restaurant
    if (req.user.userType === 'vendor' && req.user.restaurant) {
      await Restaurant.findByIdAndUpdate(req.user.restaurant, {
        isActive: false,
        status: 'inactive',
        updatedAt: new Date()
      });
    }
    
    res.json({ message: 'Account deactivated successfully' });
  } catch (error) {
    console.error('Deactivate account error:', error);
    res.status(500).json({ message: 'Error deactivating account' });
  }
});

// Delete account (soft delete)
router.delete('/account', authMiddleware, async (req, res) => {
  try {
    const { password } = req.body;
    
    if (!password) {
      return res.status(400).json({ message: 'Password confirmation required' });
    }
    
    // Verify password
    const user = await User.findById(req.user._id);
    const isMatch = await bcrypt.compare(password, user.password);
    
    if (!isMatch) {
      return res.status(400).json({ message: 'Incorrect password' });
    }
    
    // Soft delete user
    await User.findByIdAndUpdate(req.user._id, {
      isActive: false,
      isDeleted: true,
      deletedAt: new Date(),
      email: `deleted_${Date.now()}_${user.email}`, // Prevent email conflicts
      updatedAt: new Date()
    });
    
    // If vendor, also soft delete restaurant
    if (req.user.userType === 'vendor' && req.user.restaurant) {
      await Restaurant.findByIdAndUpdate(req.user.restaurant, {
        isActive: false,
        status: 'deleted',
        updatedAt: new Date()
      });
    }
    
    res.json({ success: true, message: 'Account deleted successfully' });
  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({ message: 'Error deleting account' });
  }
});

// Debug endpoint to check current user
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
    res.status(500).json({ message: 'Error getting user debug info' });
  }
});

// Get user statistics (for vendors)
router.get('/stats', authMiddleware, async (req, res) => {
  try {
    if (req.user.userType !== 'vendor') {
      return res.status(403).json({ message: 'Only vendors can access stats' });
    }
    
    const Order = require('../models/Order');
    const MenuItem = require('../models/MenuItem');
    
    // Get date range
    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    
    // Get order statistics
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
    
    // Get revenue statistics
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
    res.status(500).json({ message: 'Error fetching user statistics' });
  }
});

module.exports = router;