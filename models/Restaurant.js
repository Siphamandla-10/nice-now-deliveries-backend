// models/Restaurant.js - Fixed with proper GeoJSON structure, Cloudinary support, and Auto-Discovery
const mongoose = require('mongoose');

const restaurantSchema = new mongoose.Schema({
  // UPDATED: Owner is now optional for auto-discovered restaurants
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false,  // Changed from true to support auto-discovery
    default: null,
    sparse: true  // Only enforce uniqueness when owner exists
  },
  
  // NEW: Track source of restaurant data
  source: {
    type: String,
    enum: ['manual', 'vendor_signup', 'openstreetmap', 'google_places'],
    default: 'manual'
  },
  
  // NEW: External IDs for discovered restaurants
  osmId: {
    type: String,
    default: null,
    sparse: true,
    index: true
  },
  
  placeId: {
    type: String,
    default: null,
    sparse: true,
    index: true
  },
  
  // NEW: Discovery metadata
  discoveredAt: {
    type: Date,
    default: null
  },
  
  lastVerified: {
    type: Date,
    default: null
  },
  
  name: {
    type: String,
    required: [true, 'Restaurant name is required'],
    trim: true,
    minlength: [2, 'Restaurant name must be at least 2 characters'],
    maxlength: [100, 'Restaurant name cannot exceed 100 characters']
  },
  
  description: {
    type: String,
    default: 'Welcome to our restaurant',
    trim: true
  },
  
  cuisine: {
    type: String,
    default: 'Various',
    trim: true
  },
  
  // Status and availability
  isActive: {
    type: Boolean,
    default: false
  },
  
  status: {
    type: String,
    enum: ['pending_approval', 'active', 'inactive', 'suspended'],
    default: 'pending_approval'
  },
  
  isFeatured: {
    type: Boolean,
    default: false
  },
  
  // Pricing
  deliveryFee: {
    type: Number,
    default: 20,
    min: 0
  },
  
  minimumOrder: {
    type: Number,
    default: 0,
    min: 0
  },
  
  // Ratings
  rating: {
    type: Number,
    default: 0,
    min: 0,
    max: 5
  },
  
  totalRatings: {
    type: Number,
    default: 0,
    min: 0
  },
  
  // Contact information
  contact: {
    phone: {
      type: String,
      default: ''
    },
    email: {
      type: String,
      default: ''
    },
    website: {
      type: String,
      default: ''
    }
  },
  
  // Address with proper GeoJSON format
  address: {
    street: {
      type: String,
      default: 'Address not set',
      trim: true
    },
    city: {
      type: String,
      default: 'City',
      trim: true
    },
    state: {
      type: String,
      default: 'State',
      trim: true
    },
    region: {
      type: String,
      default: '',
      trim: true
    },
    zipCode: {
      type: String,
      default: '0000',
      trim: true
    },
    country: {
      type: String,
      default: 'South Africa',
      trim: true
    },
    // GeoJSON format for geospatial queries (MongoDB 2dsphere)
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point'
      },
      coordinates: {
        type: [Number],
        default: [0, 0] // [longitude, latitude]
      }
    }
  },
  
  // NEW: Alternative location format for compatibility with discovery
  // This supports the latitude/longitude object format
  location: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      latitude: { type: Number, default: null },
      longitude: { type: Number, default: null }
    }
  },
  
  // Images - Updated structure with Cloudinary support
  images: {
    profileImage: {
      filename: { type: String, default: '' },
      path: { type: String, default: '' },
      url: { type: String, default: '' },
      publicId: { type: String, default: '' },
      uploadedAt: { type: Date }
    },
    coverImage: {
      filename: { type: String, default: '' },
      path: { type: String, default: '' },
      url: { type: String, default: '' },
      publicId: { type: String, default: '' },
      uploadedAt: { type: Date }
    },
    gallery: [{
      filename: { type: String, required: true },
      path: { type: String, required: true },
      url: { type: String, required: true },
      publicId: { type: String, default: '' },
      caption: { type: String, default: '' },
      uploadedAt: { type: Date, default: Date.now }
    }]
  },
  
  // Legacy fields for backward compatibility
  image: { type: String, default: '' },
  coverImage: { type: String, default: '' },
  
  // Operating hours
  hours: {
    monday: { 
      open: { type: String, default: '09:00' }, 
      close: { type: String, default: '22:00' }, 
      closed: { type: Boolean, default: false } 
    },
    tuesday: { 
      open: { type: String, default: '09:00' }, 
      close: { type: String, default: '22:00' }, 
      closed: { type: Boolean, default: false } 
    },
    wednesday: { 
      open: { type: String, default: '09:00' }, 
      close: { type: String, default: '22:00' }, 
      closed: { type: Boolean, default: false } 
    },
    thursday: { 
      open: { type: String, default: '09:00' }, 
      close: { type: String, default: '22:00' }, 
      closed: { type: Boolean, default: false } 
    },
    friday: { 
      open: { type: String, default: '09:00' }, 
      close: { type: String, default: '23:00' }, 
      closed: { type: Boolean, default: false } 
    },
    saturday: { 
      open: { type: String, default: '09:00' }, 
      close: { type: String, default: '23:00' }, 
      closed: { type: Boolean, default: false } 
    },
    sunday: { 
      open: { type: String, default: '10:00' }, 
      close: { type: String, default: '21:00' }, 
      closed: { type: Boolean, default: false } 
    }
  },
  
  // Tags and categorization
  tags: {
    type: [String],
    validate: [arr => arr.length <= 10, 'Max 10 tags allowed'],
    default: []
  },
  
  // Business metrics
  totalOrders: {
    type: Number,
    default: 0
  },
  
  revenue: {
    type: Number,
    default: 0
  },

  // Specials tracking
  specials: [{
    specialName: { type: String, required: true },
    description: String,
    menuItems: [{ type: mongoose.Schema.Types.ObjectId, ref: 'MenuItem' }],
    discountType: { type: String, enum: ['percentage', 'fixed'], default: 'percentage' },
    discountValue: { type: Number, required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    isActive: { type: Boolean, default: true },
    totalRedemptions: { type: Number, default: 0 },
    maxRedemptions: Number,
    createdAt: { type: Date, default: Date.now }
  }]
  
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes - Updated for GeoJSON and discovery
restaurantSchema.index({ owner: 1 });
restaurantSchema.index({ isActive: 1, status: 1 });
restaurantSchema.index({ cuisine: 1, isActive: 1 });
restaurantSchema.index({ 'address.location': '2dsphere' });
restaurantSchema.index({ 'location.coordinates.latitude': 1, 'location.coordinates.longitude': 1 });
restaurantSchema.index({ source: 1 });
restaurantSchema.index({ osmId: 1 });
restaurantSchema.index({ placeId: 1 });
restaurantSchema.index({ name: 'text', description: 'text' });

// Virtual: full address
restaurantSchema.virtual('fullAddress').get(function () {
  return `${this.address.street}, ${this.address.city}, ${this.address.state} ${this.address.zipCode}`;
});

// Virtual: Get profile image URL
restaurantSchema.virtual('profileImageUrl').get(function () {
  if (this.images?.profileImage?.url) {
    return this.images.profileImage.url;
  }
  return this.image || '/images/default-restaurant.png';
});

// Virtual: Get cover image URL
restaurantSchema.virtual('coverImageUrl').get(function () {
  if (this.images?.coverImage?.url) {
    return this.images.coverImage.url;
  }
  return this.coverImage || '/images/default-cover.png';
});

// Pre-save middleware
restaurantSchema.pre('save', function(next) {
  // Auto-generate description if not provided
  if (!this.description || this.description === 'Welcome to our restaurant') {
    if (this.name && this.cuisine) {
      this.description = `${this.name} - ${this.cuisine} restaurant`;
      if (this.address?.city) {
        this.description += ` in ${this.address.city}`;
      }
    }
  }
  
  // Sync location formats (keep both for compatibility)
  if (this.location?.coordinates?.latitude && this.location?.coordinates?.longitude) {
    // Sync to address.location (GeoJSON [lng, lat] format)
    if (!this.address.location) {
      this.address.location = {
        type: 'Point',
        coordinates: [0, 0]
      };
    }
    this.address.location.coordinates = [
      this.location.coordinates.longitude,
      this.location.coordinates.latitude
    ];
  } else if (this.address?.location?.coordinates?.length === 2) {
    // Sync from address.location to location
    if (!this.location) {
      this.location = {
        type: 'Point',
        coordinates: {}
      };
    }
    this.location.coordinates.longitude = this.address.location.coordinates[0];
    this.location.coordinates.latitude = this.address.location.coordinates[1];
  }
  
  next();
});

// Method: check if restaurant is open now
restaurantSchema.methods.isOpenNow = function () {
  if (!this.isActive || this.status !== 'active') return false;

  const now = new Date();
  const day = now.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const dayHours = this.hours[day];
  if (!dayHours || dayHours.closed) return false;

  const [openHour, openMinute] = dayHours.open.split(':').map(Number);
  const [closeHour, closeMinute] = dayHours.close.split(':').map(Number);

  const openMinutes = openHour * 60 + openMinute;
  const closeMinutes = closeHour * 60 + closeMinute;

  return currentMinutes >= openMinutes && currentMinutes <= closeMinutes;
};

// Method: Add special offer
restaurantSchema.methods.addSpecial = function(specialData) {
  this.specials.push({
    specialName: specialData.specialName,
    description: specialData.description,
    menuItems: specialData.menuItems,
    discountType: specialData.discountType,
    discountValue: specialData.discountValue,
    startDate: specialData.startDate,
    endDate: specialData.endDate,
    isActive: specialData.isActive !== undefined ? specialData.isActive : true,
    maxRedemptions: specialData.maxRedemptions,
    createdAt: new Date()
  });
  
  return this.save();
};

// Method: Get active specials
restaurantSchema.methods.getActiveSpecials = function() {
  const now = new Date();
  return this.specials.filter(special => 
    special.isActive && 
    special.startDate <= now && 
    special.endDate >= now
  );
};

// Method: Add image to gallery
restaurantSchema.methods.addToGallery = function (imageData) {
  if (!this.images) {
    this.images = { gallery: [] };
  }
  if (!this.images.gallery) {
    this.images.gallery = [];
  }
  
  this.images.gallery.push({
    filename: imageData.filename,
    path: imageData.path,
    url: imageData.url,
    publicId: imageData.publicId || '',
    caption: imageData.caption || '',
    uploadedAt: new Date()
  });
  
  return this.save();
};

// Method: Remove image from gallery
restaurantSchema.methods.removeFromGallery = function (imageId) {
  if (!this.images?.gallery) return Promise.resolve(this);
  
  this.images.gallery = this.images.gallery.filter(
    img => img._id.toString() !== imageId.toString()
  );
  
  return this.save();
};

// Method: Update profile image
restaurantSchema.methods.updateProfileImage = function (imageData) {
  if (!this.images) {
    this.images = {};
  }
  
  this.images.profileImage = {
    filename: imageData.filename,
    path: imageData.path,
    url: imageData.url,
    publicId: imageData.publicId || '',
    uploadedAt: new Date()
  };
  
  // Update legacy field for backward compatibility
  this.image = imageData.url;
  
  return this.save();
};

// Method: Update cover image
restaurantSchema.methods.updateCoverImage = function (imageData) {
  if (!this.images) {
    this.images = {};
  }
  
  this.images.coverImage = {
    filename: imageData.filename,
    path: imageData.path,
    url: imageData.url,
    publicId: imageData.publicId || '',
    uploadedAt: new Date()
  };
  
  // Update legacy field for backward compatibility
  this.coverImage = imageData.url;
  
  return this.save();
};

// Method: Get API response with proper image structure
// This ensures Cloudinary images are properly returned in API responses
restaurantSchema.methods.toAPIResponse = function() {
  const obj = this.toObject();
  
  // Ensure images object exists with proper structure
  if (!obj.images) {
    obj.images = {
      profileImage: {},
      coverImage: {},
      gallery: []
    };
  }
  
  // Populate images.coverImage if it's empty but legacy coverImage field exists
  if ((!obj.images.coverImage?.url || obj.images.coverImage.url === '') && obj.coverImage) {
    obj.images.coverImage = {
      url: obj.coverImage,
      path: obj.coverImage,
      filename: obj.coverImage.split('/').pop(),
      uploadedAt: obj.images.coverImage?.uploadedAt || obj.updatedAt
    };
  }
  
  // Populate images.profileImage if it's empty but legacy image field exists  
  if ((!obj.images.profileImage?.url || obj.images.profileImage.url === '') && obj.image) {
    obj.images.profileImage = {
      url: obj.image,
      path: obj.image,
      filename: obj.image.split('/').pop(),
      uploadedAt: obj.images.profileImage?.uploadedAt || obj.updatedAt
    };
  }
  
  return obj;
};

// Static method: Find nearby restaurants
restaurantSchema.statics.findNearby = function(latitude, longitude, radiusKm = 10) {
  return this.find({
    isActive: true,
    'location.coordinates.latitude': {
      $gte: latitude - (radiusKm / 111),
      $lte: latitude + (radiusKm / 111)
    },
    'location.coordinates.longitude': {
      $gte: longitude - (radiusKm / (111 * Math.cos(latitude * Math.PI / 180))),
      $lte: longitude + (radiusKm / (111 * Math.cos(latitude * Math.PI / 180)))
    }
  });
};

// Static method: Find by owner
restaurantSchema.statics.findByOwner = function(ownerId) {
  return this.findOne({ owner: ownerId });
};

// Static method: Find discovered restaurants
restaurantSchema.statics.findDiscovered = function(source = 'openstreetmap') {
  return this.find({ source, status: 'pending_approval' });
};

// Static method: Find restaurants needing approval
restaurantSchema.statics.findPendingApproval = function() {
  return this.find({ status: 'pending_approval' });
};

module.exports = mongoose.model('Restaurant', restaurantSchema);