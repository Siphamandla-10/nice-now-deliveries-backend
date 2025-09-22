const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  paymentId: { 
    type: String, 
    unique: true,
    // Remove required: true since we'll auto-generate it
  },
  stripePaymentIntentId: { type: String, required: true, unique: true },
  order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  restaurant: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant', required: true },
  amount: {
    subtotal: { type: Number, required: true },
    deliveryFee: { type: Number, required: true },
    tax: { type: Number, required: true },
    total: { type: Number, required: true },
    platformFee: { type: Number, default: 0 },
    vendorAmount: { type: Number, required: true }
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'succeeded', 'failed', 'cancelled', 'refunded', 'partially_refunded'],
    default: 'pending'
  },
  paymentMethod: {
    type: {
      type: String,
      enum: ['card', 'bank_transfer', 'digital_wallet', 'cash'],
      default: 'card'
    },
    last4: String,
    brand: String,
    expMonth: Number,
    expYear: Number,
    fingerprint: String,
    country: String,
    funding: String
  },
  currency: { type: String, default: 'USD', uppercase: true },
  stripeDetails: {
    clientSecret: String,
    charges: [{
      chargeId: String,
      amount: Number,
      status: String,
      created: Date,
      receiptUrl: String
    }],
    receiptEmail: String,
    receiptUrl: String
  },
  refunds: [{
    refundId: String,
    amount: Number,
    reason: {
      type: String,
      enum: ['duplicate', 'fraudulent', 'requested_by_customer', 'order_cancelled']
    },
    status: String,
    created: Date,
    receiptNumber: String
  }],
  paymentTimestamps: {
    initiated: { type: Date, default: Date.now },
    confirmed: Date,
    failed: Date,
    refunded: Date
  },
  failureReason: { 
    code: String, 
    message: String, 
    declineCode: String 
  },
  notes: String,
  metadata: { type: Map, of: String },
  analytics: { 
    userAgent: String, 
    ipAddress: String, 
    deviceType: String, 
    paymentSource: String 
  }
}, { 
  timestamps: true,
  // Add this to help with debugging
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better performance
paymentSchema.index({ order: 1 });
paymentSchema.index({ customer: 1 });
paymentSchema.index({ restaurant: 1 });
paymentSchema.index({ status: 1 });
paymentSchema.index({ stripePaymentIntentId: 1 });
paymentSchema.index({ createdAt: -1 });
paymentSchema.index({ paymentId: 1 });

// Auto-generate payment ID before saving
paymentSchema.pre('save', async function(next) {
  try {
    // Only generate paymentId if it doesn't exist
    if (!this.paymentId) {
      // Get the count of existing payments to ensure uniqueness
      const count = await this.constructor.countDocuments();
      const timestamp = Date.now();
      const paddedCount = count.toString().padStart(4, '0');
      this.paymentId = `PAY${timestamp}${paddedCount}`;
      
      console.log(`📝 Auto-generated paymentId: ${this.paymentId}`);
    }
    next();
  } catch (error) {
    console.error('💥 Error generating paymentId:', error);
    next(error);
  }
});

// Instance methods
paymentSchema.methods.canBeRefunded = function() {
  return this.status === 'succeeded' && this.refunds.length === 0;
};

paymentSchema.methods.getTotalRefunded = function() {
  return this.refunds.reduce((total, refund) => 
    refund.status === 'succeeded' ? total + refund.amount : total, 0
  );
};

paymentSchema.methods.getRemainingRefundableAmount = function() {
  return this.amount.total - this.getTotalRefunded();
};

paymentSchema.methods.addRefund = function(refundData) {
  this.refunds.push(refundData);
  const totalRefunded = this.getTotalRefunded();
  
  if (totalRefunded >= this.amount.total) {
    this.status = 'refunded';
  } else if (totalRefunded > 0) {
    this.status = 'partially_refunded';
  }
  
  this.paymentTimestamps.refunded = new Date();
};

// Static methods for analytics
paymentSchema.statics.getPaymentStats = async function(restaurantId, startDate, endDate) {
  try {
    const match = { 
      restaurant: new mongoose.Types.ObjectId(restaurantId), 
      status: 'succeeded' 
    };
    
    if (startDate && endDate) {
      match.createdAt = { $gte: new Date(startDate), $lte: new Date(endDate) };
    }
    
    const stats = await this.aggregate([
      { $match: match },
      { $group: {
          _id: null,
          totalPayments: { $sum: 1 },
          totalAmount: { $sum: '$amount.total' },
          totalVendorAmount: { $sum: '$amount.vendorAmount' },
          totalPlatformFee: { $sum: '$amount.platformFee' },
          averageOrderValue: { $avg: '$amount.total' }
      }}
    ]);
    
    return stats[0] || { 
      totalPayments: 0, 
      totalAmount: 0, 
      totalVendorAmount: 0, 
      totalPlatformFee: 0, 
      averageOrderValue: 0 
    };
  } catch (error) {
    console.error('Error getting payment stats:', error);
    throw error;
  }
};

paymentSchema.statics.getPaymentsByStatus = async function(restaurantId) {
  try {
    return await this.aggregate([
      { $match: { restaurant: new mongoose.Types.ObjectId(restaurantId) } },
      { 
        $group: { 
          _id: '$status', 
          count: { $sum: 1 }, 
          totalAmount: { $sum: '$amount.total' } 
        } 
      }
    ]);
  } catch (error) {
    console.error('Error getting payments by status:', error);
    throw error;
  }
};

// Add a method to create a payment with logging
paymentSchema.statics.createPaymentWithLogging = async function(paymentData) {
  try {
    console.log('📝 Creating payment with data:', JSON.stringify(paymentData, null, 2));
    
    const payment = new this(paymentData);
    const savedPayment = await payment.save();
    
    console.log('✅ Payment saved successfully:', savedPayment.paymentId);
    
    // Verify it was actually saved
    const verification = await this.findById(savedPayment._id);
    if (verification) {
      console.log('✅ Payment verification successful');
    } else {
      console.log('❌ Payment verification failed');
    }
    
    return savedPayment;
  } catch (error) {
    console.error('💥 Error creating payment:', error);
    throw error;
  }
};

module.exports = mongoose.model('Payment', paymentSchema);