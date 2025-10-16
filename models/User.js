// models/User.js - COMPLETE FIXED VERSION with proper GeoJSON

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    minlength: [2, 'Name must be at least 2 characters'],
    maxlength: [100, 'Name cannot exceed 100 characters']
  },

  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email']
  },

  phone: {
    type: String,
    required: [true, 'Phone number is required'],
    trim: true
  },

  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters']
  },

  userType: {
    type: String,
    enum: ['customer', 'vendor', 'driver', 'admin'],
    default: 'customer',
    required: true
  },

  // FIXED: Proper GeoJSON location format
  // MongoDB requires coordinates as [longitude, latitude] array, NOT an object
  location: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number],  // CORRECT: Array format [lng, lat]
      default: [0, 0],  // CORRECT: Default valid coordinates
      validate: {
        validator: function(coords) {
          // Ensure we have exactly 2 coordinates
          return Array.isArray(coords) && coords.length === 2;
        },
        message: 'Coordinates must be an array of [longitude, latitude]'
      }
    }
  },

  // Alternative helper fields for easier access (not indexed for geo queries)
  latitude: {
    type: Number,
    default: null
  },

  longitude: {
    type: Number,
    default: null
  },

  // City/region tracking
  city: {
    type: String,
    default: null
  },

  region: {
    type: String,
    default: null
  },

  country: {
    type: String,
    default: 'South Africa'
  },

  lastLocationUpdate: {
    type: Date,
    default: null
  },

  // Current address (from reverse geocoding)
  currentAddress: {
    street: String,
    streetNumber: String,
    district: String,
    city: String,
    region: String,
    postalCode: String,
    country: { type: String, default: 'South Africa' },
    formattedAddress: String,
    coordinates: {
      latitude: Number,
      longitude: Number
    },
    lastUpdated: Date
  },

  // Saved delivery addresses
  addresses: [{
    label: {
      type: String,
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
    deliveryInstructions: String,
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],

  // Verification
  isVerified: {
    type: Boolean,
    default: false
  },

  isActive: {
    type: Boolean,
    default: true
  },

  // User preferences
  preferences: {
    notifications: {
      orderUpdates: { type: Boolean, default: true },
      promotions: { type: Boolean, default: true },
      newRestaurants: { type: Boolean, default: false }
    },
    cuisine: [String],
    dietaryRestrictions: [String]
  },

  // Phone verification
  phoneVerification: {
    code: String,
    expiresAt: Date,
    attempts: { type: Number, default: 0 },
    verified: { type: Boolean, default: false },
    verifiedAt: Date
  },

  // Account activity tracking
  accountActivity: {
    loginAttempts: { type: Number, default: 0 },
    failedLoginAttempts: [{
      timestamp: Date,
      ipAddress: String
    }],
    lastPasswordChange: { type: Date, default: Date.now }
  },

  // Terms and agreements
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
      enum: ['web', 'mobile', 'api'],
      default: 'mobile'
    },
    lastLoginAt: Date,
    lastLoginIp: String,
    deviceInfo: String
  },

  // Login history
  loginHistory: [{
    timestamp: { type: Date, default: Date.now },
    ipAddress: String,
    device: String,
    location: String
  }]

}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// CRITICAL: Index for geospatial queries
// MongoDB 2dsphere index requires coordinates in [lng, lat] array format
userSchema.index({ location: '2dsphere' });
userSchema.index({ email: 1 });
userSchema.index({ phone: 1 });
userSchema.index({ userType: 1 });
userSchema.index({ city: 1, isActive: 1 });

// Virtual for full name
userSchema.virtual('fullName').get(function() {
  return this.name;
});

// PRE-SAVE MIDDLEWARE: Hash password if modified
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) {
    return next();
  }
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// PRE-SAVE MIDDLEWARE: Sync location formats
userSchema.pre('save', function(next) {
  // If latitude/longitude helper fields are set, sync to GeoJSON coordinates
  if (this.latitude != null && this.longitude != null) {
    this.location.coordinates = [this.longitude, this.latitude];
  }
  // If GeoJSON coordinates are set, sync to helper fields
  else if (this.location && this.location.coordinates && 
           this.location.coordinates.length === 2 &&
           this.location.coordinates[0] !== 0 && 
           this.location.coordinates[1] !== 0) {
    this.longitude = this.location.coordinates[0];
    this.latitude = this.location.coordinates[1];
  }
  
  next();
});

// METHOD: Compare password
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// METHOD: Update location with proper GeoJSON format
userSchema.methods.updateLocation = function(latitude, longitude, addressData = {}) {
  // Store in GeoJSON format [longitude, latitude]
  this.location.coordinates = [longitude, latitude];
  this.latitude = latitude;
  this.longitude = longitude;
  this.lastLocationUpdate = new Date();
  
  if (addressData.city) this.city = addressData.city;
  if (addressData.region) this.region = addressData.region;
  if (addressData.country) this.country = addressData.country;
  
  if (Object.keys(addressData).length > 0) {
    this.currentAddress = {
      ...addressData,
      coordinates: { latitude, longitude },
      lastUpdated: new Date()
    };
  }
  
  return this.save();
};

// METHOD: Add delivery address
userSchema.methods.addAddress = function(addressData) {
  if (addressData.isDefault) {
    this.addresses.forEach(addr => addr.isDefault = false);
  }
  
  if (this.addresses.length === 0) {
    addressData.isDefault = true;
  }
  
  this.addresses.push(addressData);
  return this.save();
};

// METHOD: Get default address
userSchema.methods.getDefaultAddress = function() {
  return this.addresses.find(addr => addr.isDefault) || this.addresses[0];
};

// STATIC: Find users near a location
userSchema.statics.findNearby = function(longitude, latitude, maxDistanceKm = 10) {
  const maxDistanceMeters = maxDistanceKm * 1000;
  
  return this.find({
    location: {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: [longitude, latitude]
        },
        $maxDistance: maxDistanceMeters
      }
    },
    isActive: true
  });
};

// STATIC: Find by email
userSchema.statics.findByEmail = function(email) {
  return this.findOne({ email: email.toLowerCase() });
};

module.exports = mongoose.model('User', userSchema);