// models/Order.js - COMPLETE FIX with driverEarnings field + Location Tracking
const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  // User and Restaurant References
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
  restaurant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Restaurant',
    required: true,
    index: true
  },
  
  driver: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Driver',
    default: null
  },
  
  // Order Items
  items: [{
    menuItem: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MenuItem',
      required: true
    },
    name: {
      type: String,
      required: true
    },
    price: {
      type: Number,
      required: true,
      min: 0
    },
    quantity: {
      type: Number,
      required: true,
      min: 1
    },
    specialInstructions: {
      type: String,
      default: ''
    },
    subtotal: {
      type: Number,
      required: true
    }
  }],
  
  // Delivery Address
  deliveryAddress: {
    street: {
      type: String,
      required: true
    },
    city: {
      type: String,
      required: true
    },
    state: {
      type: String,
      required: true
    },
    zipCode: {
      type: String,
      required: true
    },
    country: {
      type: String,
      default: 'South Africa'
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      default: [0, 0]
    },
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point'
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        default: [0, 0]
      }
    },
    instructions: {
      type: String,
      default: ''
    },
    contactPhone: {
      type: String,
      required: true
    }
  },
  
  // Pricing Breakdown - FIXED FINANCIAL MODEL
  pricing: {
    // Customer-facing prices
    subtotal: {
      type: Number,
      default: 0,
      min: 0
    },
    deliveryFee: {
      type: Number,
      required: true,
      default: 25,
      min: 0
    },
    serviceFee: {
      type: Number,
      required: true,
      default: 5,
      min: 0
    },
    discount: {
      type: Number,
      default: 0,
      min: 0
    },
    total: {
      type: Number,
      default: 0,
      min: 0
    },
    
    // Platform financials (backend calculations)
    platformCommissionRate: {
      type: Number,
      default: 20, // 20% commission
      min: 0,
      max: 100
    },
    platformCommission: {
      type: Number,
      default: 0,
      min: 0
    },
    restaurantPayout: {
      type: Number,
      default: 0,
      min: 0
    },
    driverPayout: {
      type: Number,
      default: 20,
      min: 0
    },
    platformProfit: {
      type: Number,
      default: 0
    },
    
    // Tax (optional)
    tax: {
      type: Number,
      default: 0,
      min: 0
    },
    taxRate: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    }
  },
  
  // CRITICAL FIX: Add driverEarnings field at root level
  // This is what the frontend reads for driver earnings display
  driverEarnings: {
    type: Number,
    default: 0,
    min: 0
  },
  
  // Driver Location Tracking History
  driverLocationHistory: [{
    coordinates: {
      type: [Number], // [longitude, latitude]
      required: true
    },
    heading: {
      type: Number,
      default: 0
    },
    timestamp: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Order Status
  status: {
    type: String,
    enum: [
      'pending',           // Order placed, awaiting restaurant confirmation
      'confirmed',         // Restaurant confirmed
      'preparing',         // Food is being prepared
      'ready',            // Food ready for pickup
      'driver_assigned',  // Driver assigned
      'picked_up',        // Driver picked up food
      'on_the_way',       // Driver delivering
      'delivered',        // Order delivered
      'completed',        // Same as delivered (alias)
      'cancelled',        // Order cancelled
      'refunded'          // Order refunded
    ],
    default: 'pending',
    index: true
  },
  
  // Driver-specific status (for driver app)
  driverStatus: {
    type: String,
    enum: ['accepted', 'picked_up', 'on_the_way', 'delivered'],
    default: 'accepted'
  },
  
  // Payment Information
  payment: {
    method: {
      type: String,
      enum: ['cash', 'card', 'wallet', 'yoco'],
      required: true
    },
    status: {
      type: String,
      enum: ['pending', 'paid', 'failed', 'refunded'],
      default: 'pending'
    },
    transactionId: {
      type: String,
      default: null
    },
    paidAt: {
      type: Date,
      default: null
    }
  },
  
  // Timestamps for tracking
  timestamps: {
    placedAt: {
      type: Date,
      default: Date.now
    },
    confirmedAt: {
      type: Date,
      default: null
    },
    preparingAt: {
      type: Date,
      default: null
    },
    readyAt: {
      type: Date,
      default: null
    },
    pickedUpAt: {
      type: Date,
      default: null
    },
    deliveredAt: {
      type: Date,
      default: null
    },
    completedAt: {
      type: Date,
      default: null
    },
    cancelledAt: {
      type: Date,
      default: null
    }
  },
  
  // Estimated times
  estimatedPreparationTime: {
    type: Number, // minutes
    default: 30
  },
  
  estimatedDeliveryTime: {
    type: Number, // minutes
    default: 45
  },
  
  // Special instructions
  specialInstructions: {
    type: String,
    default: ''
  },
  
  // Ratings and Reviews
  rating: {
    food: {
      type: Number,
      min: 0,
      max: 5,
      default: null
    },
    delivery: {
      type: Number,
      min: 0,
      max: 5,
      default: null
    },
    overall: {
      type: Number,
      min: 0,
      max: 5,
      default: null
    },
    review: {
      type: String,
      default: ''
    },
    reviewedAt: {
      type: Date,
      default: null
    }
  },
  
  // Cancellation
  cancellation: {
    reason: {
      type: String,
      default: null
    },
    cancelledBy: {
      type: String,
      enum: ['user', 'restaurant', 'driver', 'admin'],
      default: undefined
    },
    refundAmount: {
      type: Number,
      default: 0
    }
  },
  
  // Order Number (for display)
  orderNumber: {
    type: String,
    unique: true,
    index: true
  }
  
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance
orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ restaurant: 1, status: 1 });
orderSchema.index({ driver: 1, status: 1 });
orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index({ orderNumber: 1 });

// Virtual: Get order age in minutes
orderSchema.virtual('ageInMinutes').get(function() {
  return Math.floor((Date.now() - this.timestamps.placedAt) / 60000);
});

// Virtual: Check if order is active
orderSchema.virtual('isActive').get(function() {
  return ['pending', 'confirmed', 'preparing', 'ready', 'driver_assigned', 'picked_up', 'on_the_way'].includes(this.status);
});

// PRE-SAVE MIDDLEWARE - FIXED CALCULATION LOGIC + DRIVER EARNINGS
orderSchema.pre('save', function(next) {
  // Only calculate on new orders or when pricing changes
  if (this.isNew || this.isModified('pricing.subtotal') || this.isModified('pricing.deliveryFee') || this.isModified('pricing.serviceFee') || this.isModified('pricing.driverPayout')) {
    
    const subtotal = this.pricing.subtotal || 0;
    const deliveryFee = this.pricing.deliveryFee || 0;
    const serviceFee = this.pricing.serviceFee || 0;
    const discount = this.pricing.discount || 0;
    const commissionRate = this.pricing.platformCommissionRate || 20;
    const driverPayout = this.pricing.driverPayout || 20;
    
    console.log('💰 Calculating order financials:', {
      subtotal,
      deliveryFee,
      serviceFee,
      discount,
      commissionRate,
      driverPayout
    });
    
    // STEP 1: Calculate customer total (what customer pays)
    this.pricing.total = subtotal + deliveryFee + serviceFee - discount;
    
    // STEP 2: Calculate tax if applicable
    if (this.pricing.taxRate > 0) {
      this.pricing.tax = this.pricing.total * (this.pricing.taxRate / 100);
      this.pricing.total += this.pricing.tax;
    }
    
    // STEP 3: Calculate platform commission (percentage of SUBTOTAL only)
    this.pricing.platformCommission = subtotal * (commissionRate / 100);
    
    // STEP 4: Calculate restaurant payout (subtotal minus commission)
    this.pricing.restaurantPayout = subtotal - this.pricing.platformCommission;
    
    // STEP 5: Calculate platform profit
    // Platform keeps: commission + service fee + (delivery fee - driver payout)
    this.pricing.platformProfit = 
      this.pricing.platformCommission +  // Commission from food
      serviceFee +                        // Service fee
      (deliveryFee - driverPayout);      // Delivery fee minus what we pay driver
    
    // STEP 6: CRITICAL FIX - Set driverEarnings field
    // This is what the frontend/driver app reads
    this.driverEarnings = this.pricing.driverPayout;
    
    console.log('✅ Financial breakdown calculated:', {
      customerTotal: this.pricing.total,
      restaurantGets: this.pricing.restaurantPayout,
      driverGets: this.pricing.driverPayout,
      driverEarnings: this.driverEarnings, // This should match driverPayout
      platformGets: this.pricing.platformProfit,
      platformCommission: this.pricing.platformCommission
    });
    
    // VALIDATION: Ensure no negative values
    if (this.pricing.platformProfit < 0) {
      console.warn('⚠️ Warning: Platform profit is negative. Adjust driver payout or fees.');
    }
  }
  
  // Sync completed status
  if (this.status === 'delivered' && !this.timestamps.completedAt) {
    this.timestamps.completedAt = this.timestamps.deliveredAt || new Date();
  }
  
  // Generate order number if new
  if (this.isNew && !this.orderNumber) {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const random = Math.floor(Math.random() * 10000);
    this.orderNumber = `ORD-${year}${month}${day}-${random}`;
  }
  
  next();
});

// METHOD: Update order status with timestamp
orderSchema.methods.updateStatus = async function(newStatus) {
  this.status = newStatus;
  
  // Also update driverStatus if applicable
  const driverStatusMap = {
    'driver_assigned': 'accepted',
    'picked_up': 'picked_up',
    'on_the_way': 'on_the_way',
    'delivered': 'delivered',
    'completed': 'delivered'
  };
  
  if (driverStatusMap[newStatus]) {
    this.driverStatus = driverStatusMap[newStatus];
  }
  
  // Update corresponding timestamp
  const timestampMap = {
    'confirmed': 'confirmedAt',
    'preparing': 'preparingAt',
    'ready': 'readyAt',
    'picked_up': 'pickedUpAt',
    'delivered': 'deliveredAt',
    'completed': 'completedAt',
    'cancelled': 'cancelledAt'
  };
  
  if (timestampMap[newStatus]) {
    this.timestamps[timestampMap[newStatus]] = new Date();
  }
  
  return this.save();
};

// METHOD: Add driver location point
orderSchema.methods.addDriverLocation = function(latitude, longitude, heading = 0) {
  if (!this.driverLocationHistory) {
    this.driverLocationHistory = [];
  }
  
  this.driverLocationHistory.push({
    coordinates: [longitude, latitude],
    heading: heading,
    timestamp: new Date()
  });
  
  // Keep only last 100 location points to avoid bloat
  if (this.driverLocationHistory.length > 100) {
    this.driverLocationHistory = this.driverLocationHistory.slice(-100);
  }
  
  return this;
};

// METHOD: Get latest driver location
orderSchema.methods.getLatestDriverLocation = function() {
  if (!this.driverLocationHistory || this.driverLocationHistory.length === 0) {
    return null;
  }
  
  return this.driverLocationHistory[this.driverLocationHistory.length - 1];
};

// METHOD: Assign driver
orderSchema.methods.assignDriver = async function(driverId) {
  this.driver = driverId;
  this.status = 'driver_assigned';
  this.driverStatus = 'accepted';
  return this.save();
};

// METHOD: Add rating
orderSchema.methods.addRating = async function(ratingData) {
  this.rating = {
    food: ratingData.food,
    delivery: ratingData.delivery,
    overall: (ratingData.food + ratingData.delivery) / 2,
    review: ratingData.review || '',
    reviewedAt: new Date()
  };
  return this.save();
};

// METHOD: Cancel order
orderSchema.methods.cancelOrder = async function(reason, cancelledBy, refundAmount = 0) {
  this.status = 'cancelled';
  this.timestamps.cancelledAt = new Date();
  this.cancellation = {
    reason,
    cancelledBy,
    refundAmount
  };
  return this.save();
};

// METHOD: Get financial breakdown (CORRECTED)
orderSchema.methods.getFinancialBreakdown = function() {
  return {
    orderNumber: this.orderNumber,
    
    // What customer paid
    customerPaid: this.pricing.total,
    
    // Itemized breakdown
    breakdown: {
      subtotal: this.pricing.subtotal,
      deliveryFee: this.pricing.deliveryFee,
      serviceFee: this.pricing.serviceFee,
      discount: this.pricing.discount,
      tax: this.pricing.tax,
      total: this.pricing.total
    },
    
    // Who gets what
    distribution: {
      restaurantGets: this.pricing.restaurantPayout,
      driverGets: this.pricing.driverPayout,
      platformGets: this.pricing.platformProfit
    },
    
    // Platform revenue breakdown
    platformRevenue: {
      commission: this.pricing.platformCommission,
      serviceFee: this.pricing.serviceFee,
      deliveryFeeSurplus: this.pricing.deliveryFee - this.pricing.driverPayout,
      totalPlatformProfit: this.pricing.platformProfit
    },
    
    // Driver info
    driverInfo: {
      earnings: this.driverEarnings,
      payout: this.pricing.driverPayout
    },
    
    // Verification (money in = money out)
    verification: {
      moneyIn: this.pricing.total,
      moneyOut: this.pricing.restaurantPayout + this.pricing.driverPayout + this.pricing.platformProfit,
      difference: this.pricing.total - (this.pricing.restaurantPayout + this.pricing.driverPayout + this.pricing.platformProfit),
      isBalanced: Math.abs(this.pricing.total - (this.pricing.restaurantPayout + this.pricing.driverPayout + this.pricing.platformProfit)) < 0.01
    }
  };
};

// STATIC: Find active orders for user
orderSchema.statics.findActiveForUser = function(userId) {
  return this.find({
    user: userId,
    status: { $in: ['pending', 'confirmed', 'preparing', 'ready', 'driver_assigned', 'picked_up', 'on_the_way'] }
  }).populate('restaurant').populate('driver').sort({ createdAt: -1 });
};

// STATIC: Find orders for restaurant
orderSchema.statics.findForRestaurant = function(restaurantId, status = null) {
  const query = { restaurant: restaurantId };
  if (status) query.status = status;
  return this.find(query)
    .populate('user', 'name email phone')
    .populate('driver', 'name phone')
    .sort({ createdAt: -1 });
};

// STATIC: Find orders for driver
orderSchema.statics.findForDriver = function(driverId, status = null) {
  const query = { driver: driverId };
  if (status) query.status = status;
  return this.find(query)
    .populate('restaurant', 'name address contact location')
    .populate('user', 'name phone')
    .sort({ createdAt: -1 });
};

// STATIC: Get platform statistics
orderSchema.statics.getPlatformStats = async function(startDate, endDate) {
  const match = {
    status: { $in: ['delivered', 'completed'] },
    'timestamps.deliveredAt': {
      $gte: startDate,
      $lte: endDate
    }
  };
  
  const stats = await this.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        totalOrders: { $sum: 1 },
        totalRevenue: { $sum: '$pricing.total' },
        totalCommission: { $sum: '$pricing.platformCommission' },
        totalServiceFees: { $sum: '$pricing.serviceFee' },
        totalDeliveryFees: { $sum: '$pricing.deliveryFee' },
        totalDriverPayouts: { $sum: '$pricing.driverPayout' },
        totalDriverEarnings: { $sum: '$driverEarnings' },
        totalPlatformProfit: { $sum: '$pricing.platformProfit' },
        totalRestaurantPayouts: { $sum: '$pricing.restaurantPayout' }
      }
    }
  ]);
  
  return stats[0] || null;
};

module.exports = mongoose.model('Order', orderSchema);