// models/Driver.js - Complete Fixed Driver Model
const mongoose = require('mongoose');

const driverSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  
  status: {
    type: String,
    enum: ['offline', 'online', 'busy', 'on_delivery', 'break'],
    default: 'offline'
  },
  
  isActive: {
    type: Boolean,
    default: true
  },
  
  isAvailable: {
    type: Boolean,
    default: false
  },
  
  vehicle: {
    type: {
      type: String,
      enum: ['car', 'motorcycle', 'bicycle', 'scooter'],
      default: 'car'
    },
    make: String,
    model: String,
    year: Number,
    color: String,
    licensePlate: String,
    info: String
  },
  
  verification: {
    isApproved: {
      type: Boolean,
      default: false
    },
    backgroundCheckStatus: {
      type: String,
      enum: ['pending', 'passed', 'failed'],
      default: 'pending'
    },
    licenseNumber: String,
    licenseExpiry: Date,
    documents: {
      driverLicense: {
        filename: String,
        path: String,
        url: String,
        verified: { type: Boolean, default: false },
        uploadedAt: Date
      },
      vehicleRegistration: {
        filename: String,
        path: String,
        url: String,
        verified: { type: Boolean, default: false },
        uploadedAt: Date
      },
      insurance: {
        filename: String,
        path: String,
        url: String,
        verified: { type: Boolean, default: false },
        uploadedAt: Date,
        expiryDate: Date
      }
    }
  },
  
  location: {
    current: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point'
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        default: [28.0473, -26.2041] // Johannesburg coordinates [lng, lat]
      }
    },
    lastUpdated: {
      type: Date,
      default: Date.now
    }
  },
  
  currentDelivery: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    default: null
  },
  
  metrics: {
    totalDeliveries: { type: Number, default: 0 },
    completedDeliveries: { type: Number, default: 0 },
    cancelledDeliveries: { type: Number, default: 0 },
    averageRating: { type: Number, default: 0 },
    totalEarnings: { type: Number, default: 0 },
    totalRatings: { type: Number, default: 0 }
  },
  
  emergencyContact: {
    name: String,
    relationship: String,
    phone: String
  },
  
  preferences: {
    maxDeliveryDistance: { type: Number, default: 10 }, // kilometers
    workingHours: {
      start: { type: String, default: '08:00' },
      end: { type: String, default: '20:00' }
    }
  },
  
  banking: {
    accountNumber: String,
    routingNumber: String,
    bankName: String
  },

  // Profile image
  profileImageUrl: {
    type: String,
    default: null
  }

}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better performance
driverSchema.index({ user: 1 });
driverSchema.index({ status: 1, isActive: 1 });
driverSchema.index({ 'location.current': '2dsphere' });
driverSchema.index({ 'verification.isApproved': 1 });
driverSchema.index({ isAvailable: 1, status: 1 });

// Virtual for full name from user
driverSchema.virtual('fullName').get(function() {
  return this.user?.name || 'Driver';
});

// Methods
driverSchema.methods.updateLocation = function(longitude, latitude) {
  this.location.current.coordinates = [longitude, latitude];
  this.location.lastUpdated = new Date();
  return this.save();
};

driverSchema.methods.setStatus = function(status) {
  this.status = status;
  this.isAvailable = status === 'online';
  return this.save();
};

driverSchema.methods.goOnline = function() {
  this.status = 'online';
  this.isAvailable = true;
  return this.save();
};

driverSchema.methods.goOffline = function() {
  this.status = 'offline';
  this.isAvailable = false;
  return this.save();
};

driverSchema.methods.setBusy = function() {
  this.status = 'busy';
  this.isAvailable = false;
  return this.save();
};

// Pre-save middleware
driverSchema.pre('save', function(next) {
  // Ensure coordinates are valid
  if (this.location && this.location.current && this.location.current.coordinates) {
    const [lng, lat] = this.location.current.coordinates;
    if (isNaN(lng) || isNaN(lat)) {
      this.location.current.coordinates = [28.0473, -26.2041]; // Default to Johannesburg
    }
  }
  
  // Update availability based on status
  if (this.isModified('status')) {
    this.isAvailable = this.status === 'online';
  }
  
  next();
});

// Static methods
driverSchema.statics.findOnlineDrivers = function() {
  return this.find({ 
    status: 'online', 
    isAvailable: true,
    isActive: true 
  }).populate('user', 'name email phone');
};

driverSchema.statics.findNearbyDrivers = function(longitude, latitude, radiusKm = 10) {
  return this.find({
    status: 'online',
    isAvailable: true,
    isActive: true,
    'location.current': {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: [longitude, latitude]
        },
        $maxDistance: radiusKm * 1000 // Convert km to meters
      }
    }
  }).populate('user', 'name email phone');
};

module.exports = mongoose.model('Driver', driverSchema);