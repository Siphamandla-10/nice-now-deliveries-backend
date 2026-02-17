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

// 🔥 KEY FIX: Helper to safely extract URL from req.file
// multer-storage-cloudinary changed where it puts the URL across versions:
// v1.x → req.file.path
// v2.x → req.file.path AND req.file.secure_url
// Always check both to be safe
const getUploadedImageUrl = (file) => {
  if (!file) return null;
  // secure_url is the most reliable (set by Cloudinary SDK directly)
  return file.secure_url || file.path || null;
};

const getUploadedPublicId = (file) => {
  if (!file) return null;
  // filename holds the public_id in multer-storage-cloudinary
  return file.filename || file.public_id || null;
};

// Storage for restaurant/menu images
const menuImageStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => ({
    folder: 'nice-now-deliveries/menu-items',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
    resource_type: 'image',
    transformation: [
      { width: 800, height: 800, crop: 'limit' },
      { quality: 'auto', fetch_format: 'auto' }
    ]
  })
});

// Storage for user profile images
const profileImageStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => ({
    folder: 'nice-now-deliveries/profiles',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    resource_type: 'image',
    transformation: [
      { width: 400, height: 400, crop: 'fill', gravity: 'face' },
      { quality: 'auto', fetch_format: 'auto' }
    ]
  })
});

// Storage for restaurant logos
const restaurantLogoStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => ({
    folder: 'nice-now-deliveries/restaurants',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],  // removed svg - causes issues
    resource_type: 'image',
    transformation: [
      { width: 500, height: 500, crop: 'limit' },
      { quality: 'auto', fetch_format: 'auto' }
    ]
  })
});

// Create multer instances
const uploadMenuImage = multer({ 
  storage: menuImageStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

const uploadProfileImage = multer({ 
  storage: profileImageStorage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

const uploadRestaurantLogo = multer({ 
  storage: restaurantLogoStorage,
  limits: { fileSize: 3 * 1024 * 1024 }, // 3MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
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
  if (!url || typeof url !== 'string') return null;
  
  // Handles: https://res.cloudinary.com/cloud/image/upload/v123/folder/filename.jpg
  const withVersion = url.match(/\/v\d+\/(.+)\.\w+$/);
  if (withVersion?.[1]) return withVersion[1];
  
  // Handles: https://res.cloudinary.com/cloud/image/upload/folder/filename.jpg
  const withoutVersion = url.match(/\/upload\/(.+)\.\w+$/);
  if (withoutVersion?.[1]) return withoutVersion[1];
  
  return null;
};

module.exports = {
  cloudinary,
  uploadMenuImage,
  uploadProfileImage,
  uploadRestaurantLogo,
  deleteImage,
  getPublicIdFromUrl,
  getUploadedImageUrl,   // ✅ Export these helpers
  getUploadedPublicId,   //    so routes can use them safely
};