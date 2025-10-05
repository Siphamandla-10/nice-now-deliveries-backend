// config/cloudinary.js
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Storage for restaurant/menu images
const menuImageStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'nice-now-deliveries/menu-items',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
    transformation: [
      { width: 800, height: 800, crop: 'limit' },
      { quality: 'auto' }
    ]
  }
});

// Storage for user profile images
const profileImageStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'nice-now-deliveries/profiles',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [
      { width: 400, height: 400, crop: 'fill', gravity: 'face' },
      { quality: 'auto' }
    ]
  }
});

// Storage for restaurant logos
const restaurantLogoStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'nice-now-deliveries/restaurants',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'svg'],
    transformation: [
      { width: 500, height: 500, crop: 'limit' },
      { quality: 'auto' }
    ]
  }
});

// Create multer instances
const uploadMenuImage = multer({ 
  storage: menuImageStorage,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

const uploadProfileImage = multer({ 
  storage: profileImageStorage,
  limits: { fileSize: 2 * 1024 * 1024 } // 2MB limit
});

const uploadRestaurantLogo = multer({ 
  storage: restaurantLogoStorage,
  limits: { fileSize: 3 * 1024 * 1024 } // 3MB limit
});

// Helper function to delete image from Cloudinary
const deleteImage = async (publicId) => {
  try {
    if (!publicId) return null;
    const result = await cloudinary.uploader.destroy(publicId);
    return result;
  } catch (error) {
    console.error('Error deleting image from Cloudinary:', error);
    throw error;
  }
};

// Helper function to extract public_id from Cloudinary URL
const getPublicIdFromUrl = (url) => {
  if (!url) return null;
  
  // Extract public_id from Cloudinary URL
  // Example: https://res.cloudinary.com/demo/image/upload/v1312461204/sample.jpg
  // Returns: sample
  const matches = url.match(/\/v\d+\/(.+)\.\w+$/);
  if (matches && matches[1]) {
    return matches[1];
  }
  
  // Alternative format without version
  const altMatches = url.match(/\/upload\/(.+)\.\w+$/);
  if (altMatches && altMatches[1]) {
    return altMatches[1];
  }
  
  return null;
};

module.exports = {
  cloudinary,
  uploadMenuImage,
  uploadProfileImage,
  uploadRestaurantLogo,
  deleteImage,
  getPublicIdFromUrl
};