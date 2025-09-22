// models/Order.js - COMPLETE FIXED VERSION
const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  // Order identification
  orderNumber: {
    type: String,
    required: true,
    unique: true
  },

  // Customer information
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  // Restaurant information
  restaurant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Restaurant',
    required: true
  },

  // Vendor (restaurant owner)
  vendor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  // Driver information
  driver: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },

  // Order items
  items: [{
    name: {
      type: String,
      required: true
    },
    menuItem: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MenuItem'
    },
    quantity: {
      type: Number,
      required: true,
      min: 1
    },
    price: {
      type: Number,
      required: true,
      min: 0
    },
    itemTotal: {
      type: Number,
      min: 0
    },
    specialInstructions: String
  }],

  // Pricing
  subtotal: {
    type: Number,
    required: true,
    min: 0
  },
  deliveryFee: {
    type: Number,
    required: true,
    min: 0,
    default: 2.99
  },
  tax: {
    type: Number,
    default: 0,
    min: 0
  },
  total: {
    type: Number,
    required: true,
    min: 0
  },

  // Driver earnings
  driverEarning: {
    type: Number,
    default: 20,
    min: 0
  },

  // Order status - FIXED TO MATCH FRONTEND
  status: {
    type: String,
    enum: [
      'pending',
      'confirmed',
      'preparing',
      'ready',
      'out_for_delivery',
      'delivered',
      'completed',
      'cancelled'
    ],
    default: 'pending'
  },

  // Payment information
  paymentMethod: {
    type: String,
    enum: ['card', 'cash', 'digital_wallet'],
    default: 'card'
  },

  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'failed', 'refunded'],
    default: 'pending'
  },

  // Delivery information
  deliveryAddress: {
    street: String,
    city: String,
    state: String,
    zipCode: String,
    coordinates: {
      latitude: Number,
      longitude: Number
    }
  },

  // Contact information
  customerPhone: String,
  customerName: String,

  // Special instructions and notes
  notes: String,
  specialInstructions: String,
  deliveryNotes: String,

  // Timestamps for different status changes
  placedAt: {
    type: Date,
    default: Date.now
  },
  pendingAt: {
    type: Date,
    default: Date.now
  },
  confirmedAt: Date,
  preparingAt: Date,
  readyAt: Date,
  out_for_deliveryAt: Date,
  deliveredAt: Date,
  completedAt: Date,
  cancelledAt: Date,

  // Estimated times
  estimatedPickupTime: {
    type: Number,
    default: 15
  },
  estimatedDeliveryTime: {
    type: Number,
    default: 30
  },

  // Rating and feedback
  customerRating: {
    type: Number,
    min: 1,
    max: 5
  },
  driverRating: {
    type: Number,
    min: 1,
    max: 5
  },
  feedback: String,

  // Distance tracking
  distance: Number,

  // Cancellation info
  cancellationReason: String,
  cancelledBy: {
    type: String,
    enum: ['customer', 'restaurant', 'driver', 'admin']
  }

}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better query performance
orderSchema.index({ customer: 1, status: 1 });
orderSchema.index({ restaurant: 1, status: 1 });
orderSchema.index({ driver: 1, status: 1 });
orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index({ orderNumber: 1 }, { unique: true });

// Pre-save middleware to generate order number
orderSchema.pre('save', function(next) {
  if (this.isNew && !this.orderNumber) {
    const date = new Date();
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
    const randomNum = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    this.orderNumber = `ORD-${dateStr}-${randomNum}`;
  }
  next();
});

module.exports = mongoose.model('Order', orderSchema);