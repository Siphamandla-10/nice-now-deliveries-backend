// models/User.js - FIXED VERSION
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  // Basic user information
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    minlength: [2, 'Name must be at least 2 characters'],
    maxlength: [50, 'Name cannot exceed 50 characters']
  },
  
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/, 'Please enter a valid email']
  },
  
  phone: {
    type: String,
    required: [true, 'Phone number is required'],
    unique: true,
    trim: true,
    minlength: [10, 'Phone number must be at least 10 digits']
  },
  
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters']
  },
  
  userType: {
    type: String,
    enum: {
      values: ['customer', 'vendor', 'driver', 'admin'],
      message: 'User type must be customer, vendor, driver, or admin'
    },
    required: [true, 'User type is required']
  },
  
  // Profile information
  profilePicture: {
    url: String,
    publicId: String
  },
  
  // Account status
  isVerified: {
    type: Boolean,
    default: false
  },
  
  isActive: {
    type: Boolean,
    default: true
  },
  
  fcmToken: {
    type: String,
    index: true
  },
  
  // Customer-specific fields
  addresses: [{
    label: {
      type: String,
      enum: ['Home', 'Work', 'Other'],
      default: 'Home'
    },
    street: String,
    city: String,
    state: String,
    zipCode: String,
    coordinates: {
      latitude: Number,
      longitude: Number
    },
    isDefault: {
      type: Boolean,
      default: false
    },
    deliveryInstructions: String
  }],
  
  preferences: {
    cuisine: [String],
    dietaryRestrictions: [String],
    notifications: {
      orderUpdates: { type: Boolean, default: true },
      promotions: { type: Boolean, default: true },
      newRestaurants: { type: Boolean, default: false }
    }
  },
  
  // Vendor-specific fields
  restaurant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Restaurant'
  },
  
  // Driver-specific reference
  driverProfile: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Driver'
  },
  
  // Security and verification
  emailVerification: {
    token: String,
    expiresAt: Date,
    verifiedAt: Date
  },
  
  phoneVerification: {
    code: String,
    expiresAt: Date,
    verifiedAt: Date,
    attempts: { type: Number, default: 0 }
  },
  
  passwordReset: {
    token: String,
    expiresAt: Date,
    usedAt: Date
  },
  
  // Login tracking
  loginHistory: [{
    timestamp: { type: Date, default: Date.now },
    ipAddress: String,
    userAgent: String,
    location: String
  }],
  
  lastLogin: {
    timestamp: Date,
    ipAddress: String,
    device: String
  },
  
  // Account activity
  accountActivity: {
    lastPasswordChange: Date,
    loginAttempts: { type: Number, default: 0 },
    lockedUntil: Date,
    failedLoginAttempts: [{ 
      timestamp: { type: Date, default: Date.now },
      ipAddress: String 
    }]
  },
  
  // Terms and privacy
  agreements: {
    termsOfService: {
      accepted: { type: Boolean, default: false },
      acceptedAt: Date,
      version: String
    },
    privacyPolicy: {
      accepted: { type: Boolean, default: false },
      acceptedAt: Date,
      version: String
    }
  },
  
  // Metadata
  metadata: {
    registrationSource: {
      type: String,
      enum: ['web', 'mobile', 'admin'],
      default: 'mobile'
    },
    referralCode: String,
    referredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance
userSchema.index({ email: 1 });
userSchema.index({ phone: 1 });
userSchema.index({ userType: 1, isActive: 1 });
userSchema.index({ fcmToken: 1 });
userSchema.index({ createdAt: -1 });

// Pre-save middleware
userSchema.pre('save', async function(next) {
  try {
    // Hash password if modified
    if (this.isModified('password')) {
      const salt = await bcrypt.genSalt(10);
      this.password = await bcrypt.hash(this.password, salt);
      this.accountActivity.lastPasswordChange = new Date();
    }
    
    // Ensure only one default address
    if (this.addresses && this.addresses.length > 0) {
      const defaultAddresses = this.addresses.filter(addr => addr.isDefault);
      if (defaultAddresses.length > 1) {
        this.addresses.forEach((addr, index) => {
          if (index > 0 && addr.isDefault) {
            addr.isDefault = false;
          }
        });
      } else if (defaultAddresses.length === 0 && this.addresses.length === 1) {
        this.addresses[0].isDefault = true;
      }
    }
    
    next();
  } catch (error) {
    next(error);
  }
});

// Instance methods
userSchema.methods.comparePassword = async function(candidatePassword) {
  try {
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    throw new Error('Password comparison failed');
  }
};

// FIXED: toJSON method with proper error handling
userSchema.methods.toJSON = function() {
  try {
    const userObject = this.toObject();
    
    // Remove sensitive fields
    delete userObject.password;
    delete userObject.emailVerification;
    delete userObject.phoneVerification;
    delete userObject.passwordReset;
    delete userObject.__v;
    
    // Safely handle nested objects
    if (userObject.accountActivity) {
      delete userObject.accountActivity.failedLoginAttempts;
    }
    
    // FIXED: Safely handle restaurant field
    if (userObject.restaurant && typeof userObject.restaurant === 'object') {
      // Ensure restaurant object exists and has required properties
      const restaurantObj = userObject.restaurant;
      userObject.restaurant = {
        _id: restaurantObj._id,
        name: restaurantObj.name || 'Restaurant Name',
        status: restaurantObj.status || 'pending_approval',
        isActive: restaurantObj.isActive !== undefined ? restaurantObj.isActive : false,
        profileImageUrl: restaurantObj.profileImageUrl || '/images/default-restaurant.png',
        coverImageUrl: restaurantObj.coverImageUrl || '/images/default-cover.png',
        fullAddress: restaurantObj.fullAddress || 'Address not set',
        id: restaurantObj._id
      };
    }
    
    return userObject;
  } catch (error) {
    console.error('Error in User toJSON:', error);
    // Return basic user object if transformation fails
    const basicUser = {
      _id: this._id,
      name: this.name,
      email: this.email,
      phone: this.phone,
      userType: this.userType,
      isActive: this.isActive,
      isVerified: this.isVerified,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
    
    // Add restaurant reference if exists
    if (this.restaurant) {
      basicUser.restaurant = {
        _id: this.restaurant,
        name: 'Restaurant',
        status: 'pending_approval',
        isActive: false
      };
    }
    
    return basicUser;
  }
};

// Account security methods
userSchema.methods.isAccountLocked = function() {
  return this.accountActivity.lockedUntil && this.accountActivity.lockedUntil > Date.now();
};

userSchema.methods.lockAccount = function() {
  this.accountActivity.lockedUntil = Date.now() + (30 * 60 * 1000); // 30 minutes
  this.accountActivity.loginAttempts = 0;
};

userSchema.methods.recordFailedLogin = function(ipAddress) {
  this.accountActivity.loginAttempts += 1;
  this.accountActivity.failedLoginAttempts.push({
    timestamp: new Date(),
    ipAddress: ipAddress
  });
  
  if (this.accountActivity.loginAttempts >= 5) {
    this.lockAccount();
  }
};

userSchema.methods.recordSuccessfulLogin = function(ipAddress, userAgent) {
  this.lastLogin = {
    timestamp: new Date(),
    ipAddress: ipAddress,
    device: userAgent
  };
  
  this.loginHistory.push({
    timestamp: new Date(),
    ipAddress: ipAddress,
    userAgent: userAgent
  });
  
  // Keep only last 10 login records
  if (this.loginHistory.length > 10) {
    this.loginHistory = this.loginHistory.slice(-10);
  }
  
  // Reset failed login attempts
  this.accountActivity.loginAttempts = 0;
  this.accountActivity.lockedUntil = undefined;
};

// Address management methods
userSchema.methods.getDefaultAddress = function() {
  return this.addresses.find(addr => addr.isDefault) || this.addresses[0] || null;
};

userSchema.methods.addAddress = function(addressData) {
  const isFirstAddress = this.addresses.length === 0;
  const shouldBeDefault = addressData.isDefault || isFirstAddress;
  
  if (shouldBeDefault) {
    this.addresses.forEach(addr => {
      addr.isDefault = false;
    });
  }
  
  const newAddress = {
    ...addressData,
    isDefault: shouldBeDefault
  };
  
  this.addresses.push(newAddress);
  return newAddress;
};

// Static methods
userSchema.statics.findByEmail = function(email) {
  return this.findOne({ email: email.toLowerCase() });
};

userSchema.statics.findByPhone = function(phone) {
  return this.findOne({ phone: phone });
};

userSchema.statics.findActiveUsers = function(userType = null) {
  const query = { isActive: true };
  if (userType) {
    query.userType = userType;
  }
  return this.find(query);
};

module.exports = mongoose.model('User', userSchema);