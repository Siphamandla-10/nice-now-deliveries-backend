// middleware/auth.js - COMPLETE FIXED VERSION
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Driver = require('../models/Driver');

// ============================
// JWT SECRET VALIDATION
// ============================
function validateJWTSecret() {
  if (!process.env.JWT_SECRET) {
    console.error('CRITICAL: JWT_SECRET environment variable is not defined');
    throw new Error('JWT_SECRET environment variable is required');
  }
  if (process.env.JWT_SECRET.length < 32) {
    console.warn('WARNING: JWT_SECRET should be at least 32 characters long for security');
  }
}

try { 
  validateJWTSecret(); 
} catch (error) { 
  console.error('Auth middleware initialization failed:', error.message); 
}

// ============================
// GENERAL AUTH MIDDLEWARE - MAIN EXPORT - FIXED
// ============================
async function authMiddleware(req, res, next) {
  try {
    const authHeader = req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        success: false, 
        message: 'Access denied. Invalid or missing token.' 
      });
    }

    const token = authHeader.substring(7);
    let decoded;
    try { 
      decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-here'); 
    } 
    catch (jwtError) {
      if (jwtError.name === 'TokenExpiredError') {
        return res.status(401).json({ 
          success: false, 
          message: 'Token expired' 
        });
      }
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid token' 
      });
    }

    // FIXED: Removed .populate('driverProfile') - was causing StrictPopulateError
    const user = await User.findById(decoded.id).select('-password');
    if (!user) {
      return res.status(401).json({ 
        success: false, 
        message: 'User not found' 
      });
    }
    if (!user.isActive) {
      return res.status(403).json({ 
        success: false, 
        message: 'Account inactive' 
      });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error during authentication', 
      error: error.message 
    });
  }
}

// ============================
// LOGIN ROUTE HELPER - FIXED
// ============================
async function loginUser(req, res) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email and password are required.' 
      });
    }

    // FIXED: Removed .populate('driverProfile') - was causing StrictPopulateError
    const user = await User.findOne({ email: email.trim().toLowerCase() });
    if (!user) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid email or password' 
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid email or password' 
      });
    }

    if (!user.isActive) {
      return res.status(403).json({ 
        success: false, 
        message: 'Account inactive' 
      });
    }

    const token = jwt.sign(
      { 
        id: user._id,
        userType: user.userType
      }, 
      process.env.JWT_SECRET || 'your-secret-key-here', 
      { expiresIn: '7d' }
    );
    
    res.json({ 
      success: true,
      message: "Login successful",
      token, 
      user: { 
        _id: user._id, 
        name: user.name, 
        email: user.email, 
        userType: user.userType, 
        driverProfile: user.driverProfile || null 
      } 
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error during login', 
      error: error.message 
    });
  }
}

// ============================
// REGISTER ROUTE HELPER
// ============================
async function registerUser(req, res) {
  try {
    const { name, email, phone, password, userType } = req.body;
    if (!name || !email || !password || !phone) {
      return res.status(400).json({ 
        success: false, 
        message: 'All fields are required.' 
      });
    }

    const existingUser = await User.findOne({ email: email.trim().toLowerCase() });
    if (existingUser) {
      return res.status(409).json({ 
        success: false, 
        message: 'Email already in use.' 
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.trim(),
      password: hashedPassword,
      userType: userType || 'customer',
      isActive: true
    });

    await user.save();
    
    const token = jwt.sign(
      { 
        id: user._id,
        userType: user.userType
      }, 
      process.env.JWT_SECRET || 'your-secret-key-here', 
      { expiresIn: '7d' }
    );

    // Create driver profile if user is registering as driver
    if (user.userType === 'driver') {
      try {
        const driver = new Driver({
          user: user._id,
          vehicle: { 
            type: 'car',
            info: 'Vehicle information pending'
          },
          verification: { 
            isApproved: false, 
            backgroundCheckStatus: 'pending' 
          },
          location: { 
            current: { type: 'Point', coordinates: [0, 0] } 
          }
        });
        await driver.save();
        
        user.driverProfile = driver._id;
        await user.save();
        
        console.log('Driver profile created during registration');
      } catch (driverError) {
        console.error('Error creating driver profile:', driverError);
      }
    }

    res.status(201).json({ 
      success: true,
      message: "Registration successful",
      token, 
      user: { 
        _id: user._id, 
        name: user.name, 
        email: user.email, 
        userType: user.userType,
        driverProfile: user.driverProfile || null
      } 
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error during registration', 
      error: error.message 
    });
  }
}

// ============================
// ROLE MIDDLEWARE
// ============================
const vendorMiddleware = (req, res, next) => {
  if (!req.user || req.user.userType !== 'vendor') {
    return res.status(403).json({ 
      success: false,
      message: 'Vendor access required' 
    });
  }
  next();
};

const customerMiddleware = (req, res, next) => {
  if (!req.user || req.user.userType !== 'customer') {
    return res.status(403).json({ 
      success: false,
      message: 'Customer access required' 
    });
  }
  next();
};

const driverMiddleware = (req, res, next) => {
  if (!req.user || req.user.userType !== 'driver') {
    return res.status(403).json({ 
      success: false,
      message: 'Driver access required' 
    });
  }
  next();
};

// ============================
// DRIVER-SPECIFIC MIDDLEWARE
// ============================
const authenticateDriver = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ 
        success: false, 
        message: 'Access denied. No token provided.' 
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-here');
    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid token. User not found.' 
      });
    }
    if (user.userType !== 'driver') {
      return res.status(403).json({ 
        success: false, 
        message: 'Driver account required.' 
      });
    }

    const driver = await Driver.findOne({ user: user._id });
    if (!driver) {
      try {
        const newDriver = new Driver({
          user: user._id,
          vehicle: { 
            type: 'car',
            info: 'Vehicle information pending'
          },
          verification: { 
            isApproved: false, 
            backgroundCheckStatus: 'pending' 
          },
          location: { 
            current: { type: 'Point', coordinates: [0, 0] } 
          }
        });
        await newDriver.save();
        
        user.driverProfile = newDriver._id;
        await user.save();
        
        req.user = user;
        req.driver = newDriver;
        console.log('Driver profile created automatically');
      } catch (createError) {
        console.error('Error creating driver profile:', createError);
        return res.status(404).json({ 
          success: false, 
          message: 'Driver profile not found and could not be created.' 
        });
      }
    } else {
      req.user = user;
      req.driver = driver;
    }

    next();
  } catch (error) {
    console.error('Driver authentication error:', error);
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        success: false, 
        message: 'Token expired.' 
      });
    }
    res.status(401).json({ 
      success: false, 
      message: 'Invalid token.' 
    });
  }
};

const requireApprovedDriver = (req, res, next) => {
  const { driver } = req;
  if (!driver.verification.isApproved) {
    return res.status(403).json({ 
      success: false,
      message: 'Driver account pending approval.',
      needsApproval: true
    });
  }
  if (driver.isSuspended) {
    return res.status(403).json({ 
      success: false,
      message: 'Driver account is suspended.', 
      suspendedUntil: driver.suspendedUntil 
    });
  }
  if (!driver.isActive) {
    return res.status(403).json({ 
      success: false,
      message: 'Driver account is inactive.' 
    });
  }
  next();
};

const requireOnlineDriver = (req, res, next) => {
  const { driver } = req;
  if (driver.status !== 'online') {
    return res.status(400).json({ 
      success: false,
      message: 'Driver must be online.' 
    });
  }

  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
  if (driver.location.lastUpdated < fiveMinutesAgo) {
    return res.status(400).json({ 
      success: false,
      message: 'Location update required.' 
    });
  }

  next();
};

const updateDriverActivity = async (req, res, next) => {
  try {
    if (req.driver) {
      await Driver.findByIdAndUpdate(req.driver._id, { 
        'activity.lastActive': new Date() 
      });
    }
    next();
  } catch (error) {
    console.error('Update driver activity error:', error);
    next();
  }
};

const handleDriverRegistration = async (userData, driverData) => {
  try {
    const hashedPassword = await bcrypt.hash(userData.password, 10);
    const user = new User({
      name: userData.name,
      email: userData.email.toLowerCase(),
      phone: userData.phone,
      password: hashedPassword,
      userType: 'driver',
      isActive: true
    });
    await user.save();

    const driver = new Driver({
      user: user._id,
      vehicle: { 
        info: driverData.vehicle || 'Vehicle information pending', 
        type: 'car' 
      },
      verification: { 
        licenseNumber: driverData.licenseNumber || '',
        isApproved: false, 
        backgroundCheckStatus: 'pending' 
      },
      location: { 
        current: { type: 'Point', coordinates: [0, 0] } 
      }
    });
    await driver.save();

    user.driverProfile = driver._id;
    await user.save();

    return { 
      user, 
      driver, 
      message: 'Driver registration successful. Pending approval.' 
    };
  } catch (error) {
    console.error('Driver registration error:', error);
    throw new Error(`Driver registration failed: ${error.message}`);
  }
};

// Export the main auth middleware as default, and others as named exports
module.exports = authMiddleware;
module.exports.loginUser = loginUser;
module.exports.registerUser = registerUser;
module.exports.authMiddleware = authMiddleware;
module.exports.vendorMiddleware = vendorMiddleware;
module.exports.customerMiddleware = customerMiddleware;
module.exports.driverMiddleware = driverMiddleware;
module.exports.authenticateDriver = authenticateDriver;
module.exports.requireApprovedDriver = requireApprovedDriver;
module.exports.requireOnlineDriver = requireOnlineDriver;
module.exports.updateDriverActivity = updateDriverActivity;
module.exports.handleDriverRegistration = handleDriverRegistration;