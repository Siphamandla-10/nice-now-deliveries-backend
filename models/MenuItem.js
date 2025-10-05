// models/MenuItem.js - Enhanced with Cloudinary support
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
  
  // Enhanced image structure with Cloudinary support
  images: {
    mainImage: {
      filename: { type: String, default: '' },
      path: { type: String, default: '' },
      url: { type: String, default: '' },
      cloudinaryId: { type: String, default: '' }, // ← NEW: Store Cloudinary public_id
      uploadedAt: { type: Date }
    },
    gallery: [{
      filename: { type: String, required: true },
      path: { type: String, required: true },
      url: { type: String, required: true },
      cloudinaryId: { type: String, default: '' }, // ← NEW: Store Cloudinary public_id
      caption: { type: String, default: '' },
      uploadedAt: { type: Date, default: Date.now }
    }]
  },
  
  // Legacy image field for backward compatibility
  image: {
    filename: String,
    path: String,
    url: String,
    cloudinaryId: String, // ← NEW: Cloudinary public_id
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
    originalPrice: Number,
    specialPrice: Number,
    discountType: {
      type: String,
      enum: ['percentage', 'fixed'],
      default: 'percentage'
    },
    discountValue: Number,
    startDate: Date,
    endDate: Date,
    minimumOrder: { type: Number, default: 0 },
    maxRedemptions: Number,
    currentRedemptions: { type: Number, default: 0 },
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

// Virtual: Get main image URL
menuItemSchema.virtual('mainImageUrl').get(function () {
  if (this.images?.mainImage?.url) {
    return this.images.mainImage.url;
  }
  // Fallback to legacy image field
  if (this.image?.url) {
    return this.image.url;
  }
  return '/images/default-food.png';
});

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

// Method: Update main image with Cloudinary support
menuItemSchema.methods.updateMainImage = function (imageData) {
  if (!this.images) {
    this.images = {};
  }
  
  this.images.mainImage = {
    filename: imageData.filename || '',
    path: imageData.path || '',
    url: imageData.url,
    cloudinaryId: imageData.cloudinaryId || imageData.publicId || '', // Support both field names
    uploadedAt: new Date()
  };
  
  // Update legacy field for backward compatibility
  this.image = {
    filename: imageData.filename || '',
    path: imageData.path || '',
    url: imageData.url,
    cloudinaryId: imageData.cloudinaryId || imageData.publicId || '',
    uploadedAt: new Date()
  };
  
  return this.save();
};

// Method: Add image to gallery
menuItemSchema.methods.addToGallery = function (imageData) {
  if (!this.images) {
    this.images = { gallery: [] };
  }
  if (!this.images.gallery) {
    this.images.gallery = [];
  }
  
  this.images.gallery.push({
    filename: imageData.filename || '',
    path: imageData.path || '',
    url: imageData.url,
    cloudinaryId: imageData.cloudinaryId || imageData.publicId || '',
    caption: imageData.caption || '',
    uploadedAt: new Date()
  });
  
  return this.save();
};

// Method: Remove image from gallery (with Cloudinary cleanup)
menuItemSchema.methods.removeFromGallery = async function (imageId) {
  if (!this.images?.gallery) return this;
  
  // Find the image to get its cloudinaryId before removing
  const imageToRemove = this.images.gallery.find(
    img => img._id.toString() === imageId.toString()
  );
  
  if (imageToRemove && imageToRemove.cloudinaryId) {
    // Delete from Cloudinary
    try {
      const { deleteImage } = require('../config/cloudinary');
      await deleteImage(imageToRemove.cloudinaryId);
    } catch (error) {
      console.error('Error deleting image from Cloudinary:', error);
      // Continue with database removal even if Cloudinary deletion fails
    }
  }
  
  this.images.gallery = this.images.gallery.filter(
    img => img._id.toString() !== imageId.toString()
  );
  
  return this.save();
};

// Method: Delete main image from Cloudinary
menuItemSchema.methods.deleteMainImage = async function () {
  const cloudinaryId = this.images?.mainImage?.cloudinaryId || this.image?.cloudinaryId;
  
  if (cloudinaryId) {
    try {
      const { deleteImage } = require('../config/cloudinary');
      await deleteImage(cloudinaryId);
    } catch (error) {
      console.error('Error deleting main image from Cloudinary:', error);
    }
  }
  
  // Clear image data
  if (this.images?.mainImage) {
    this.images.mainImage = {
      filename: '',
      path: '',
      url: '',
      cloudinaryId: '',
      uploadedAt: null
    };
  }
  
  this.image = {
    filename: '',
    path: '',
    url: '',
    cloudinaryId: '',
    uploadedAt: null
  };
  
  return this.save();
};

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
  this.popularity += quantity;
  
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

// Pre-remove middleware to cleanup Cloudinary images
menuItemSchema.pre('remove', async function(next) {
  try {
    const { deleteImage } = require('../config/cloudinary');
    
    // Delete main image
    if (this.images?.mainImage?.cloudinaryId) {
      await deleteImage(this.images.mainImage.cloudinaryId);
    }
    
    // Delete gallery images
    if (this.images?.gallery?.length > 0) {
      for (const img of this.images.gallery) {
        if (img.cloudinaryId) {
          await deleteImage(img.cloudinaryId);
        }
      }
    }
    
    next();
  } catch (error) {
    console.error('Error cleaning up Cloudinary images:', error);
    next(); // Continue even if cleanup fails
  }
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