// models/MenuItem.js - Enhanced Menu items with specials support
const mongoose = require('mongoose');

const menuItemSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Menu item name is required'],
    trim: true,
    minlength: [2, 'Name must be at least 2 characters']
  },
  
  description: {
    type: String,
    required: [true, 'Description is required'],
    trim: true
  },
  
  restaurant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Restaurant',
    required: [true, 'Restaurant is required']
  },
  
  category: {
    type: String,
    required: [true, 'Category is required'],
    enum: [
      'Appetizers', 'Main Course', 'Desserts', 'Beverages', 
      'Sides', 'Salads', 'Soups', 'Pizza', 'Burgers', 
      'Sandwiches', 'Pasta', 'Seafood', 'Vegetarian', 'Specials'
    ]
  },
  
  price: {
    type: Number,
    required: [true, 'Price is required'],
    min: [0, 'Price cannot be negative']
  },
  
  image: {
    filename: String,
    path: String,
    url: String,
    uploadedAt: Date
  },
  
  isAvailable: {
    type: Boolean,
    default: true
  },
  
  isVegetarian: {
    type: Boolean,
    default: false
  },
  
  isVegan: {
    type: Boolean,
    default: false
  },
  
  isGlutenFree: {
    type: Boolean,
    default: false
  },
  
  spiceLevel: {
    type: String,
    enum: ['None', 'Mild', 'Medium', 'Hot', 'Extra Hot'],
    default: 'None'
  },
  
  preparationTime: {
    type: Number, // minutes
    default: 15
  },
  
  calories: Number,
  
  ingredients: [String],
  
  allergens: [String],
  
  addons: [{
    name: { type: String, required: true },
    price: { type: Number, required: true, min: 0 },
    category: String
  }],
  
  sizes: [{
    name: { type: String, required: true },
    price: { type: Number, required: true, min: 0 },
    description: String
  }],
  
  tags: [String],
  
  popularity: {
    type: Number,
    default: 0
  },
  
  orderCount: {
    type: Number,
    default: 0
  },
  
  // Special offers and promotions
  specialOffer: {
    isActive: { type: Boolean, default: false },
    specialName: String,
    description: String,
    originalPrice: Number, // Store original price when special is active
    specialPrice: Number,  // Discounted price
    discountType: {
      type: String,
      enum: ['percentage', 'fixed'],
      default: 'percentage'
    },
    discountValue: Number, // Percentage or fixed amount
    startDate: Date,
    endDate: Date,
    minimumOrder: { type: Number, default: 0 },
    maxRedemptions: Number, // Maximum number of times this special can be used
    currentRedemptions: { type: Number, default: 0 }, // Current usage count
    createdAt: Date,
    updatedAt: Date,
    deactivatedAt: Date
  },
  
  // Stock management
  stockManagement: {
    trackStock: { type: Boolean, default: false },
    currentStock: { type: Number, default: 0 },
    lowStockThreshold: { type: Number, default: 5 },
    isOutOfStock: { type: Boolean, default: false }
  },
  
  // SEO and display options
  featured: { type: Boolean, default: false },
  displayOrder: { type: Number, default: 0 },
  
  // Rating and reviews (summary)
  rating: {
    average: { type: Number, default: 0, min: 0, max: 5 },
    count: { type: Number, default: 0 }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for efficient queries
menuItemSchema.index({ restaurant: 1, category: 1 });
menuItemSchema.index({ restaurant: 1, isAvailable: 1 });
menuItemSchema.index({ category: 1, isAvailable: 1 });
menuItemSchema.index({ featured: 1, restaurant: 1 });
menuItemSchema.index({ 'specialOffer.isActive': 1, 'specialOffer.endDate': 1 });
menuItemSchema.index({ tags: 1 });

// Virtual: Get effective price (special price if active, otherwise regular price)
menuItemSchema.virtual('effectivePrice').get(function() {
  if (this.specialOffer && this.specialOffer.isActive) {
    const now = new Date();
    const startDate = new Date(this.specialOffer.startDate);
    const endDate = new Date(this.specialOffer.endDate);
    
    if (now >= startDate && now <= endDate) {
      return this.specialOffer.specialPrice;
    }
  }
  return this.price;
});

// Virtual: Check if item has active special
menuItemSchema.virtual('hasActiveSpecial').get(function() {
  if (!this.specialOffer || !this.specialOffer.isActive) return false;
  
  const now = new Date();
  const startDate = new Date(this.specialOffer.startDate);
  const endDate = new Date(this.specialOffer.endDate);
  
  return now >= startDate && now <= endDate;
});

// Virtual: Get discount percentage for display
menuItemSchema.virtual('discountPercentage').get(function() {
  if (!this.hasActiveSpecial) return 0;
  
  const originalPrice = this.specialOffer.originalPrice || this.price;
  const specialPrice = this.specialOffer.specialPrice;
  
  return Math.round(((originalPrice - specialPrice) / originalPrice) * 100);
});

// Virtual: Check if item is available (considering stock)
menuItemSchema.virtual('isActuallyAvailable').get(function() {
  if (!this.isAvailable) return false;
  if (this.stockManagement.trackStock) {
    return !this.stockManagement.isOutOfStock && this.stockManagement.currentStock > 0;
  }
  return true;
});

// Method: Apply special offer
menuItemSchema.methods.applySpecialOffer = function(specialData) {
  this.specialOffer = {
    isActive: true,
    specialName: specialData.specialName,
    description: specialData.description,
    originalPrice: this.price,
    specialPrice: specialData.specialPrice,
    discountType: specialData.discountType,
    discountValue: specialData.discountValue,
    startDate: specialData.startDate,
    endDate: specialData.endDate,
    minimumOrder: specialData.minimumOrder || 0,
    maxRedemptions: specialData.maxRedemptions,
    currentRedemptions: 0,
    createdAt: new Date()
  };
  
  // Add special tags
  if (!this.tags.includes('Special')) {
    this.tags.push('Special');
  }
  if (!this.tags.includes(specialData.specialName)) {
    this.tags.push(specialData.specialName);
  }
  
  return this.save();
};

// Method: Remove special offer
menuItemSchema.methods.removeSpecialOffer = function() {
  this.specialOffer.isActive = false;
  this.specialOffer.deactivatedAt = new Date();
  
  // Remove special tags
  this.tags = this.tags.filter(tag => tag !== 'Special' && tag !== this.specialOffer.specialName);
  
  return this.save();
};

// Method: Update stock
menuItemSchema.methods.updateStock = function(quantity, operation = 'subtract') {
  if (!this.stockManagement.trackStock) return this;
  
  if (operation === 'subtract') {
    this.stockManagement.currentStock = Math.max(0, this.stockManagement.currentStock - quantity);
  } else if (operation === 'add') {
    this.stockManagement.currentStock += quantity;
  } else if (operation === 'set') {
    this.stockManagement.currentStock = quantity;
  }
  
  // Update out of stock status
  this.stockManagement.isOutOfStock = this.stockManagement.currentStock === 0;
  
  // Update availability if out of stock
  if (this.stockManagement.isOutOfStock) {
    this.isAvailable = false;
  }
  
  return this.save();
};

// Method: Check if low stock
menuItemSchema.methods.isLowStock = function() {
  if (!this.stockManagement.trackStock) return false;
  return this.stockManagement.currentStock <= this.stockManagement.lowStockThreshold;
};

// Method: Increment order count
menuItemSchema.methods.incrementOrderCount = function(quantity = 1) {
  this.orderCount += quantity;
  this.popularity += quantity; // Simple popularity scoring
  
  // Update special redemptions if applicable
  if (this.hasActiveSpecial && this.specialOffer.maxRedemptions) {
    this.specialOffer.currentRedemptions += quantity;
    
    // Deactivate special if max redemptions reached
    if (this.specialOffer.currentRedemptions >= this.specialOffer.maxRedemptions) {
      this.specialOffer.isActive = false;
      this.specialOffer.deactivatedAt = new Date();
    }
  }
  
  return this.save();
};

// Static method: Find items with active specials
menuItemSchema.statics.findActiveSpecials = function(restaurantId) {
  const now = new Date();
  return this.find({
    restaurant: restaurantId,
    'specialOffer.isActive': true,
    'specialOffer.startDate': { $lte: now },
    'specialOffer.endDate': { $gte: now }
  }).sort({ 'specialOffer.createdAt': -1 });
};

// Static method: Find popular items
menuItemSchema.statics.findPopular = function(restaurantId, limit = 10) {
  return this.find({
    restaurant: restaurantId,
    isAvailable: true
  })
  .sort({ popularity: -1, orderCount: -1 })
  .limit(limit);
};

// Static method: Find items by category
menuItemSchema.statics.findByCategory = function(restaurantId, category, includeUnavailable = false) {
  const query = { restaurant: restaurantId, category };
  if (!includeUnavailable) {
    query.isAvailable = true;
  }
  return this.find(query).sort({ displayOrder: 1, name: 1 });
};

// Pre-save middleware to handle special offer expiration
menuItemSchema.pre('save', function(next) {
  // Check if special offer has expired
  if (this.specialOffer && this.specialOffer.isActive) {
    const now = new Date();
    const endDate = new Date(this.specialOffer.endDate);
    
    if (now > endDate) {
      this.specialOffer.isActive = false;
      this.specialOffer.deactivatedAt = now;
      
      // Remove special tags
      this.tags = this.tags.filter(tag => tag !== 'Special' && tag !== this.specialOffer.specialName);
    }
  }
  
  // Update category to 'Specials' if item has active special
  if (this.hasActiveSpecial && !this.tags.includes('Special')) {
    this.tags.push('Special');
  }
  
  next();
});

// Pre-find middleware to automatically populate restaurant for some queries
menuItemSchema.pre(/^find/, function(next) {
  // Auto-populate restaurant name for display purposes
  if (this.getOptions().populateRestaurant) {
    this.populate('restaurant', 'name');
  }
  next();
});

module.exports = mongoose.model('MenuItem', menuItemSchema);