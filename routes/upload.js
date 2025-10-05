// routes/upload.js
const express = require('express');
const router = express.Router();
const { 
  uploadMenuImage, 
  uploadProfileImage, 
  uploadRestaurantLogo,
  deleteImage,
  getPublicIdFromUrl
} = require('../config/cloudinary');

// Upload menu item image
router.post('/menu-image', uploadMenuImage.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No image file provided' });
    }

    res.json({
      message: 'Menu image uploaded successfully',
      image: {
        url: req.file.path,
        publicId: req.file.filename,
        cloudinaryId: req.file.filename
      }
    });
  } catch (error) {
    console.error('Menu image upload error:', error);
    res.status(500).json({ 
      message: 'Failed to upload menu image',
      error: error.message 
    });
  }
});

// Upload profile image
router.post('/profile-image', uploadProfileImage.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No image file provided' });
    }

    res.json({
      message: 'Profile image uploaded successfully',
      image: {
        url: req.file.path,
        publicId: req.file.filename,
        cloudinaryId: req.file.filename
      }
    });
  } catch (error) {
    console.error('Profile image upload error:', error);
    res.status(500).json({ 
      message: 'Failed to upload profile image',
      error: error.message 
    });
  }
});

// Upload restaurant logo
router.post('/restaurant-logo', uploadRestaurantLogo.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No image file provided' });
    }

    res.json({
      message: 'Restaurant logo uploaded successfully',
      image: {
        url: req.file.path,
        publicId: req.file.filename,
        cloudinaryId: req.file.filename
      }
    });
  } catch (error) {
    console.error('Restaurant logo upload error:', error);
    res.status(500).json({ 
      message: 'Failed to upload restaurant logo',
      error: error.message 
    });
  }
});

// Delete image by public_id
router.delete('/image/:publicId', async (req, res) => {
  try {
    const { publicId } = req.params;
    
    if (!publicId) {
      return res.status(400).json({ message: 'Public ID is required' });
    }

    const result = await deleteImage(publicId);
    
    if (result.result === 'ok') {
      res.json({ 
        message: 'Image deleted successfully',
        result 
      });
    } else {
      res.status(404).json({ 
        message: 'Image not found or already deleted',
        result 
      });
    }
  } catch (error) {
    console.error('Image deletion error:', error);
    res.status(500).json({ 
      message: 'Failed to delete image',
      error: error.message 
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
      return res.status(400).json({ message: 'Invalid Cloudinary URL' });
    }

    const result = await deleteImage(publicId);
    
    if (result.result === 'ok') {
      res.json({ 
        message: 'Image deleted successfully',
        result 
      });
    } else {
      res.status(404).json({ 
        message: 'Image not found or already deleted',
        result 
      });
    }
  } catch (error) {
    console.error('Image deletion error:', error);
    res.status(500).json({ 
      message: 'Failed to delete image',
      error: error.message 
    });
  }
});

module.exports = router;
