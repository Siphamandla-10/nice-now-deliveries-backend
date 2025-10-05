// backend/routes/auth.js - WITH DETAILED LOGGING
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Restaurant = require('../models/Restaurant');
const Driver = require('../models/Driver');
const { authMiddleware } = require('../middleware/auth');
const router = express.Router();

// ========================
// Helper function for JWT
// ========================
const generateToken = (user) => {
  return jwt.sign(
    { id: user._id, userType: user.userType },
    process.env.JWT_SECRET || 'your-fallback-secret',
    { expiresIn: '7d' }
  );
};

// ========================
// REGISTER NEW USER
// ========================
router.post('/register', async (req, res) => {
  console.log('========================================');
  console.log('REGISTRATION REQUEST RECEIVED');
  console.log('Time:', new Date().toISOString());
  console.log('Body:', JSON.stringify(req.body, null, 2));
  console.log('========================================');
  
  try {
    const { name, email, phone, password, userType, restaurantData, driverData } = req.body;

    console.log('Step 1: Extracted data from request');

    // Validation
    if (!name || !email || !phone || !password || !userType) {
      console.log('Validation failed: Missing required fields');
      return res.status(400).json({ 
        success: false, 
        message: 'All fields are required' 
      });
    }

    console.log('Step 2: Basic validation passed');

    const validUserTypes = ['customer', 'vendor', 'driver', 'admin'];
    if (!validUserTypes.includes(userType)) {
      console.log('Validation failed: Invalid user type');
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid user type' 
      });
    }

    console.log('Step 3: User type validation passed');

    // Check existing user
    console.log('Step 4: Checking for existing user...');
    const existingUser = await User.findOne({
      $or: [{ email: email.toLowerCase() }, { phone }]
    });

    if (existingUser) {
      console.log('User already exists');
      const field = existingUser.email === email.toLowerCase() ? 'email' : 'phone';
      return res.status(409).json({ 
        success: false, 
        message: `This ${field} is already registered` 
      });
    }

    console.log('Step 5: No existing user found, proceeding...');

    // Create user
    console.log('Step 6: Creating user...');
    const user = new User({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      phone: phone.trim(),
      password,
      userType,
      isActive: true,
      isVerified: false
    });

    console.log('Step 7: Saving user to database...');
    await user.save();
    console.log('User created successfully:', user._id);

    // Handle vendor-specific setup
    if (userType === 'vendor' && restaurantData) {
      try {
        console.log('Step 8: Creating restaurant for vendor...');
        
        const restaurantPayload = {
          owner: user._id,
          name: restaurantData.name || `${name}'s Restaurant`,
          description: restaurantData.description || 'Welcome to our restaurant',
          cuisine: restaurantData.cuisine || 'Various',
          contact: {
            phone: restaurantData.contact?.phone || phone,
            email: restaurantData.contact?.email || email
          },
          address: {
            street: restaurantData.address?.street || 'Address not set',
            city: restaurantData.address?.city || 'City',
            state: restaurantData.address?.state || 'State',
            zipCode: restaurantData.address?.zipCode || '0000',
            location: {
              type: 'Point',
              coordinates: [
                restaurantData.address?.coordinates?.longitude || 0,
                restaurantData.address?.coordinates?.latitude || 0
              ]
            }
          },
          deliveryFee: restaurantData.deliveryFee || 2.99,
          minimumOrder: restaurantData.minimumOrder || 0,
          isActive: false,
          status: 'pending_approval'
        };

        console.log('Restaurant payload:', JSON.stringify(restaurantPayload, null, 2));

        const restaurant = new Restaurant(restaurantPayload);
        await restaurant.save();
        
        console.log('Restaurant created successfully:', restaurant._id);
      } catch (restaurantError) {
        console.error('Restaurant creation error:', restaurantError);
      }
    }

    // Handle driver-specific setup
    if (userType === 'driver' && driverData) {
      try {
        console.log('Step 9: Creating driver profile...');
        const driver = new Driver({
          user: user._id,
          vehicle: driverData.vehicle || 'Not specified',
          licenseNumber: driverData.licenseNumber || 'Not specified',
          status: 'offline',
          isAvailable: false,
          isApproved: false
        });

        await driver.save();
        console.log('Driver profile created successfully:', driver._id);
      } catch (driverError) {
        console.error('Driver creation error:', driverError);
      }
    }

    // Generate token
    console.log('Step 10: Generating JWT token...');
    const token = generateToken(user);

    console.log('Step 11: Sending response...');
    res.status(201).json({
      success: true,
      message: 'Registration successful',
      token,
      user: user.toJSON()
    });

    console.log('Registration completed successfully!');
    console.log('========================================');

  } catch (error) {
    console.error('REGISTRATION ERROR:', error);
    console.error('Error stack:', error.stack);

    if (error.code === 11000) {
      const field = Object.keys(error.keyValue)[0];
      return res.status(409).json({
        success: false,
        message: `${field} already registered`
      });
    }

    res.status(500).json({ 
      success: false, 
      message: 'Registration failed', 
      error: error.message 
    });
  }
});

// ========================
// LOGIN USER
// ========================
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    console.log('Login attempt for:', email);

    if (!email || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email and password are required' 
      });
    }

    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid email or password' 
      });
    }

    if (user.isAccountLocked && user.isAccountLocked()) {
      return res.status(423).json({ 
        success: false, 
        message: 'Account temporarily locked. Please try again later.' 
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      if (user.recordFailedLogin) {
        user.recordFailedLogin(req.ip);
        await user.save();
      }
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid email or password' 
      });
    }

    if (!user.isActive) {
      return res.status(403).json({ 
        success: false, 
        message: 'Account is inactive. Please contact support.' 
      });
    }

    const token = generateToken(user);
    
    if (user.recordSuccessfulLogin) {
      user.recordSuccessfulLogin(req.ip, req.get('User-Agent'));
      await user.save();
    }

    console.log('Login successful for:', user.email);

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: user.toJSON()
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Login failed', 
      error: error.message 
    });
  }
});

router.post('/logout', authMiddleware, (req, res) => {
  res.json({ success: true, message: 'Logged out successfully' });
});

router.get('/verify', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    res.json({ success: true, user: user.toJSON() });
  } catch (error) {
    console.error('Token verification error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Token verification failed' 
    });
  }
});

router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email is required' 
      });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    
    if (!user) {
      return res.json({ 
        success: true, 
        message: 'If an account exists, a reset link has been sent' 
      });
    }

    const resetToken = jwt.sign(
      { id: user._id }, 
      process.env.JWT_SECRET || 'secret', 
      { expiresIn: '1h' }
    );
    
    user.passwordReset = { 
      token: resetToken, 
      expiresAt: new Date(Date.now() + 3600000) 
    };
    
    await user.save();

    console.log(`Password reset token for ${email}: ${resetToken}`);

    res.json({ 
      success: true, 
      message: 'Password reset link sent', 
      resetToken
    });
    
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Password reset request failed' 
    });
  }
});

router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    
    if (!token || !newPassword) {
      return res.status(400).json({ 
        success: false, 
        message: 'Token and new password required' 
      });
    }
    
    if (newPassword.length < 6) {
      return res.status(400).json({ 
        success: false, 
        message: 'Password must be at least 6 characters' 
      });
    }

    let decoded;
    try { 
      decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret'); 
    } catch { 
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid or expired reset token' 
      }); 
    }

    const user = await User.findById(decoded.id);
    
    if (!user || !user.passwordReset?.token || user.passwordReset.token !== token) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid or expired reset token' 
      });
    }
    
    if (user.passwordReset.expiresAt < new Date()) {
      return res.status(400).json({ 
        success: false, 
        message: 'Reset token expired' 
      });
    }

    user.password = newPassword;
    user.passwordReset = undefined;
    await user.save();

    res.json({ success: true, message: 'Password reset successfully' });
    
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Password reset failed' 
    });
  }
});

router.post('/change-password', authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ 
        success: false, 
        message: 'Current and new password required' 
      });
    }
    
    if (newPassword.length < 6) {
      return res.status(400).json({ 
        success: false, 
        message: 'New password must be at least 6 characters' 
      });
    }

    const user = await User.findById(req.user.id);
    const isMatch = await user.comparePassword(currentPassword);
    
    if (!isMatch) {
      return res.status(400).json({ 
        success: false, 
        message: 'Current password is incorrect' 
      });
    }

    user.password = newPassword;
    await user.save();

    res.json({ success: true, message: 'Password changed successfully' });
    
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Password change failed' 
    });
  }
});

module.exports = router;