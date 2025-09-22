// middleware/upload.js - Complete upload middleware with image processing
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

// Ensure upload directories exist
const uploadDirs = ['uploads', 'uploads/restaurants', 'uploads/menu-items', 'uploads/drivers'];
uploadDirs.forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Configure multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let uploadPath = 'uploads/';
    
    // Determine upload path based on route
    if (req.route.path.includes('restaurants')) {
      uploadPath += 'restaurants/';
    } else if (req.route.path.includes('menu')) {
      uploadPath += 'menu-items/';
    } else if (req.route.path.includes('drivers')) {
      uploadPath += 'drivers/';
    }
    
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    // Generate unique filename
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const extension = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + extension);
  }
});

// File filter function
const fileFilter = (req, file, cb) => {
  // Check if file is an image
  if (file.mimetype.startsWith('image/')) {
    // Allow common image formats
    const allowedFormats = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (allowedFormats.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file format. Only JPEG, PNG, and WebP are allowed.'), false);
    }
  } else {
    cb(new Error('Only image files are allowed'), false);
  }
};

// Create multer instance
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 5 * 1024 * 1024, // 5MB default
    files: 10 // Maximum 10 files
  }
});

// Image processing middleware
const processImage = async (req, res, next) => {
  if (!req.file && !req.files) {
    return next();
  }

  try {
    const processFile = async (file) => {
      const inputPath = file.path;
      const outputPath = file.path.replace(/\.[^/.]+$/, '_processed.jpg');
      
      // Process image with Sharp
      await sharp(inputPath)
        .resize(800, 600, {
          fit: 'inside',
          withoutEnlargement: true
        })
        .jpeg({ quality: 85 })
        .toFile(outputPath);
      
      // Replace original file with processed file
      fs.unlinkSync(inputPath);
      fs.renameSync(outputPath, inputPath);
    };

    if (req.file) {
      await processFile(req.file);
    }

    if (req.files) {
      if (Array.isArray(req.files)) {
        for (const file of req.files) {
          await processFile(file);
        }
      } else {
        // Handle named fields
        for (const fieldName in req.files) {
          const files = req.files[fieldName];
          if (Array.isArray(files)) {
            for (const file of files) {
              await processFile(file);
            }
          } else {
            await processFile(files);
          }
        }
      }
    }

    next();
  } catch (error) {
    console.error('Image processing error:', error);
    next(error);
  }
};

// Upload configurations for different use cases
const uploadConfigs = {
  // Single image upload
  single: (fieldName = 'image') => upload.single(fieldName),
  
  // Multiple images upload
  multiple: (fieldName = 'images', maxCount = 5) => upload.array(fieldName, maxCount),
  
  // Restaurant images (profile + cover)
  restaurantProfile: upload.fields([
    { name: 'restaurantImage', maxCount: 1 },
    { name: 'coverImage', maxCount: 1 }
  ]),
  
  // Restaurant single image
  restaurantImage: upload.single('image'),
  
  // Cover image
  coverImage: upload.single('coverImage'),
  
  // Multiple images for gallery
  multipleImages: upload.array('images', 10),
  
  // Menu item image
  menuItemImage: upload.single('image'),
  
  // Driver documents
  driverDocuments: upload.fields([
    { name: 'driverLicense', maxCount: 1 },
    { name: 'vehicleRegistration', maxCount: 1 },
    { name: 'insurance', maxCount: 1 },
    { name: 'profilePhoto', maxCount: 1 }
  ])
};

// Error handling middleware
const handleUploadError = (error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    switch (error.code) {
      case 'LIMIT_FILE_SIZE':
        return res.status(400).json({
          success: false,
          message: 'File too large. Maximum size is 5MB.'
        });
      case 'LIMIT_FILE_COUNT':
        return res.status(400).json({
          success: false,
          message: 'Too many files. Maximum is 10 files.'
        });
      case 'LIMIT_UNEXPECTED_FILE':
        return res.status(400).json({
          success: false,
          message: 'Unexpected file field.'
        });
      default:
        return res.status(400).json({
          success: false,
          message: error.message
        });
    }
  } else if (error) {
    return res.status(400).json({
      success: false,
      message: error.message || 'File upload error'
    });
  }
  next();
};

// Utility function to clean up old files
const cleanupOldFiles = (filePaths) => {
  if (!Array.isArray(filePaths)) {
    filePaths = [filePaths];
  }
  
  filePaths.forEach(filePath => {
    if (filePath && fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (error) {
        console.error('Error deleting file:', filePath, error);
      }
    }
  });
};

// Utility function to get file URL
const getFileUrl = (filename, folder = '') => {
  const baseUrl = process.env.BASE_URL || 'http://localhost:5000';
  const folderPath = folder ? `${folder}/` : '';
  return `${baseUrl}/uploads/${folderPath}${filename}`;
};

// Middleware to validate image dimensions
const validateImageDimensions = (minWidth = 100, minHeight = 100, maxWidth = 2000, maxHeight = 2000) => {
  return async (req, res, next) => {
    if (!req.file && !req.files) {
      return next();
    }

    try {
      const checkDimensions = async (file) => {
        const metadata = await sharp(file.path).metadata();
        const { width, height } = metadata;
        
        if (width < minWidth || height < minHeight) {
          throw new Error(`Image dimensions too small. Minimum: ${minWidth}x${minHeight}px`);
        }
        
        if (width > maxWidth || height > maxHeight) {
          throw new Error(`Image dimensions too large. Maximum: ${maxWidth}x${maxHeight}px`);
        }
      };

      if (req.file) {
        await checkDimensions(req.file);
      }

      if (req.files) {
        const files = Array.isArray(req.files) ? req.files : Object.values(req.files).flat();
        for (const file of files) {
          await checkDimensions(file);
        }
      }

      next();
    } catch (error) {
      // Clean up uploaded files
      if (req.file) cleanupOldFiles([req.file.path]);
      if (req.files) {
        const files = Array.isArray(req.files) ? req.files : Object.values(req.files).flat();
        cleanupOldFiles(files.map(f => f.path));
      }
      
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  };
};

// Export everything
module.exports = {
  upload: upload.single('image'), // Default single upload
  uploadConfigs,
  processImage,
  handleUploadError,
  cleanupOldFiles,
  getFileUrl,
  validateImageDimensions,
  
  // Individual upload methods for backward compatibility
  single: upload.single.bind(upload),
  array: upload.array.bind(upload),
  fields: upload.fields.bind(upload),
  none: upload.none.bind(upload),
  any: upload.any.bind(upload)
};