// backend/routes/auth.js - Complete Fixed Authentication Routes
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
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
  try {
    const { name, email, phone, password, userType } = req.body;

    if (!name || !email || !phone || !password || !userType) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }

    const validUserTypes = ['customer', 'vendor', 'driver', 'admin'];
    if (!validUserTypes.includes(userType)) {
      return res.status(400).json({ success: false, message: 'Invalid user type' });
    }

    const existingUser = await User.findOne({
      $or: [{ email: email.toLowerCase() }, { phone }]
    });

    if (existingUser) {
      const field = existingUser.email === email.toLowerCase() ? 'email' : 'phone';
      return res.status(409).json({ success: false, message: `${field} already exists` });
    }

    const user = new User({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      phone: phone.trim(),
      password, // hashed via pre-save
      userType,
      isActive: true,
      isVerified: false
    });

    await user.save();

    const token = generateToken(user);

    res.status(201).json({
      success: true,
      message: 'Registration successful',
      token,
      user: user.toJSON()
    });
  } catch (error) {
    console.error('Registration error:', error);

    if (error.code === 11000) {
      const field = Object.keys(error.keyValue)[0];
      return res.status(409).json({
        success: false,
        message: `${field} already registered`
      });
    }

    res.status(500).json({ success: false, message: 'Registration failed', error: error.message });
  }
});

// ========================
// LOGIN USER
// ========================
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    // Check account lock
    if (user.isAccountLocked && user.isAccountLocked()) {
      return res.status(423).json({ success: false, message: 'Account temporarily locked' });
    }

    // Compare password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      user.recordFailedLogin(req.ip);
      await user.save();
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    if (!user.isActive) {
      return res.status(403).json({ success: false, message: 'Account inactive' });
    }

    const token = generateToken(user);
    user.recordSuccessfulLogin(req.ip, req.get('User-Agent'));
    await user.save();

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: user.toJSON()
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Login failed', error: error.message });
  }
});

// ========================
// LOGOUT USER
// ========================
router.post('/logout', authMiddleware, (req, res) => {
  res.json({ success: true, message: 'Logged out successfully' });
});

// ========================
// VERIFY TOKEN
// ========================
router.get('/verify', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    res.json({ success: true, user: user.toJSON() });
  } catch (error) {
    console.error('Token verification error:', error);
    res.status(500).json({ success: false, message: 'Token verification failed' });
  }
});

// ========================
// FORGOT PASSWORD
// ========================
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: 'Email is required' });

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.json({ success: true, message: 'If an account exists, a reset link has been sent' });

    const resetToken = jwt.sign({ id: user._id }, process.env.JWT_SECRET || 'secret', { expiresIn: '1h' });
    user.passwordReset = { token: resetToken, expiresAt: new Date(Date.now() + 3600000) };
    await user.save();

    console.log(`Password reset token for ${email}: ${resetToken}`);

    res.json({ success: true, message: 'Password reset link sent', resetToken });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ success: false, message: 'Password reset request failed' });
  }
});

// ========================
// RESET PASSWORD
// ========================
router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) return res.status(400).json({ success: false, message: 'Token and new password required' });
    if (newPassword.length < 6) return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });

    let decoded;
    try { decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret'); } 
    catch { return res.status(400).json({ success: false, message: 'Invalid or expired reset token' }); }

    const user = await User.findById(decoded.id);
    if (!user || !user.passwordReset?.token || user.passwordReset.token !== token) {
      return res.status(400).json({ success: false, message: 'Invalid or expired reset token' });
    }
    if (user.passwordReset.expiresAt < new Date()) return res.status(400).json({ success: false, message: 'Reset token expired' });

    user.password = newPassword;
    user.passwordReset = undefined;
    await user.save();

    res.json({ success: true, message: 'Password reset successfully' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ success: false, message: 'Password reset failed' });
  }
});

// ========================
// CHANGE PASSWORD (AUTHENTICATED)
// ========================
router.post('/change-password', authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ success: false, message: 'Current and new password required' });
    if (newPassword.length < 6) return res.status(400).json({ success: false, message: 'New password must be at least 6 characters' });

    const user = await User.findById(req.user.id);
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) return res.status(400).json({ success: false, message: 'Current password is incorrect' });

    user.password = newPassword;
    await user.save();

    res.json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ success: false, message: 'Password change failed' });
  }
});

module.exports = router;
