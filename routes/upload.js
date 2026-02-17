// routes/upload.js
const express = require('express');
const router = express.Router();
const { 
  uploadMenuImage, 
  uploadProfileImage, 
  uploadRestaurantLogo,
  deleteImage,
  getPublicIdFromUrl,
  getUploadedImageUrl,   // ✅ Use the safe helpers
  getUploadedPublicId,
} = require('../config/cloudinary');

// 🔥 Shared error handler for multer errors
const handleUploadError = (err, req, res, next) => {
  if (err?.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ message: 'File too large' });
  }
  if (err?.message) {
    return res.status(400).json({ message: err.message });
  }
  next(err);
};

// ✅ Shared response builder - consistent shape every time
const buildImageResponse = (file) => {
  const url = getUploadedImageUrl(file);
  const publicId = getUploadedPublicId(file);

  if (!url) {
    throw new Error(
      `Cloudinary did not return a URL. req.file was: ${JSON.stringify(file)}`
    );
  }

  return {
    url,          // Always a full https://res.cloudinary.com/... URL
    publicId,     // The Cloudinary public_id for deletion later
    cloudinaryId: publicId,  // kept for backward compat
  };
};

// Upload menu item image
router.post('/menu-image', (req, res, next) => {
  uploadMenuImage.single('image')(req, res, (err) => {
    if (err) return handleUploadError(err, req, res, next);

    try {
      if (!req.file) {
        return res.status(400).json({ message: 'No image file provided' });
      }

      // 🔍 Log exactly what Cloudinary returned (remove in production)
      console.log('📦 Menu image upload - req.file:', {
        fieldname: req.file.fieldname,
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        filename: req.file.filename,       // public_id
        path: req.file.path,               // URL (v1.x)
        secure_url: req.file.secure_url,   // URL (v2.x)
      });

      const image = buildImageResponse(req.file);

      res.json({
        message: 'Menu image uploaded successfully',
        image,
      });
    } catch (error) {
      console.error('Menu image upload error:', error);
      res.status(500).json({ 
        message: 'Failed to upload menu image',
        error: error.message,
      });
    }
  });
});

// Upload profile image
router.post('/profile-image', (req, res, next) => {
  uploadProfileImage.single('image')(req, res, (err) => {
    if (err) return handleUploadError(err, req, res, next);

    try {
      if (!req.file) {
        return res.status(400).json({ message: 'No image file provided' });
      }

      console.log('📦 Profile image upload - req.file:', {
        filename: req.file.filename,
        path: req.file.path,
        secure_url: req.file.secure_url,
      });

      const image = buildImageResponse(req.file);

      res.json({
        message: 'Profile image uploaded successfully',
        image,
      });
    } catch (error) {
      console.error('Profile image upload error:', error);
      res.status(500).json({ 
        message: 'Failed to upload profile image',
        error: error.message,
      });
    }
  });
});

// Upload restaurant logo
router.post('/restaurant-logo', (req, res, next) => {
  uploadRestaurantLogo.single('image')(req, res, (err) => {
    if (err) return handleUploadError(err, req, res, next);

    try {
      if (!req.file) {
        return res.status(400).json({ message: 'No image file provided' });
      }

      console.log('📦 Restaurant logo upload - req.file:', {
        filename: req.file.filename,
        path: req.file.path,
        secure_url: req.file.secure_url,
      });

      const image = buildImageResponse(req.file);

      res.json({
        message: 'Restaurant logo uploaded successfully',
        image,
      });
    } catch (error) {
      console.error('Restaurant logo upload error:', error);
      res.status(500).json({ 
        message: 'Failed to upload restaurant logo',
        error: error.message,
      });
    }
  });
});

// Delete image by public_id
router.delete('/image/:publicId', async (req, res) => {
  try {
    const { publicId } = req.params;
    
    if (!publicId) {
      return res.status(400).json({ message: 'Public ID is required' });
    }

    // public_id may contain slashes (e.g. "nice-now-deliveries/menu-items/abc123")
    // so decode it in case it was URL-encoded
    const decodedPublicId = decodeURIComponent(publicId);
    const result = await deleteImage(decodedPublicId);
    
    if (result?.result === 'ok') {
      res.json({ message: 'Image deleted successfully', result });
    } else {
      res.status(404).json({ message: 'Image not found or already deleted', result });
    }
  } catch (error) {
    console.error('Image deletion error:', error);
    res.status(500).json({ 
      message: 'Failed to delete image',
      error: error.message,
    });
  }
});

// Delete image by URL
router.delete('/image-by-url', async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ message: 'Image URL is required' });
    }

    const publicId = getPublicIdFromUrl(url);
    
    if (!publicId) {
      return res.status(400).json({ message: 'Could not extract public_id from URL' });
    }

    const result = await deleteImage(publicId);
    
    if (result?.result === 'ok') {
      res.json({ message: 'Image deleted successfully', result });
    } else {
      res.status(404).json({ message: 'Image not found or already deleted', result });
    }
  } catch (error) {
    console.error('Image deletion error:', error);
    res.status(500).json({ 
      message: 'Failed to delete image',
      error: error.message,
    });
  }
});

module.exports = router;