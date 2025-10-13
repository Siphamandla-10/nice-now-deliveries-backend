// backend/bulkUploadLocalFiles.js
// Uploads ALL files from uploads/restaurants/ to Cloudinary and updates matching restaurants
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const cloudinary = require('cloudinary').v2;

require('dotenv').config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const Restaurant = require('./models/Restaurant');

/**
 * Upload file to Cloudinary
 */
const uploadToCloudinary = async (filePath, folder, publicId) => {
  try {
    const result = await cloudinary.uploader.upload(filePath, {
      folder: folder,
      public_id: publicId,
      resource_type: 'auto',
      transformation: [
        { width: 1200, height: 800, crop: 'limit', quality: 'auto:good' },
        { fetch_format: 'auto' }
      ],
      eager: [
        { width: 800, height: 600, crop: 'fill', quality: 'auto:good' },
        { width: 400, height: 300, crop: 'fill', quality: 'auto:eco' },
        { width: 150, height: 150, crop: 'fill', quality: 'auto:low' }
      ],
      eager_async: false,
    });

    return {
      url: result.secure_url,
      publicId: result.public_id,
      filename: path.basename(filePath),
      path: result.secure_url,
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Find restaurant by matching filename
 */
const findRestaurantByFilename = async (filename, restaurants) => {
  // Try to extract restaurant name from filename
  // Examples: "The Hot Pot Kitchen_cover.jpg", "SIBA-The_profile.png"
  
  const cleanFilename = filename
    .replace(/\.(jpg|jpeg|png|webp|gif)$/i, '')  // Remove extension
    .replace(/_(cover|profile|logo)$/i, '')       // Remove suffix
    .trim();

  console.log(`   Looking for restaurant matching: "${cleanFilename}"`);

  // Try exact match first
  let match = restaurants.find(r => 
    r.name.toLowerCase() === cleanFilename.toLowerCase()
  );

  if (match) {
    console.log(`   ✅ Exact match found: ${match.name}`);
    return match;
  }

  // Try partial match
  match = restaurants.find(r => 
    r.name.toLowerCase().includes(cleanFilename.toLowerCase()) ||
    cleanFilename.toLowerCase().includes(r.name.toLowerCase())
  );

  if (match) {
    console.log(`   ✅ Partial match found: ${match.name}`);
    return match;
  }

  // Try fuzzy match (remove special characters)
  const fuzzyClean = (str) => str.toLowerCase().replace(/[^a-z0-9]/g, '');
  const cleanSearch = fuzzyClean(cleanFilename);
  
  match = restaurants.find(r => {
    const cleanName = fuzzyClean(r.name);
    return cleanName.includes(cleanSearch) || cleanSearch.includes(cleanName);
  });

  if (match) {
    console.log(`   ✅ Fuzzy match found: ${match.name}`);
    return match;
  }

  console.log(`   ⚠️  No match found`);
  return null;
};

/**
 * Determine if file is cover or profile image
 */
const getImageType = (filename) => {
  const lower = filename.toLowerCase();
  if (lower.includes('cover') || lower.includes('banner')) return 'cover';
  if (lower.includes('profile') || lower.includes('logo')) return 'profile';
  
  // Default: use as cover if no indicator
  return 'cover';
};

/**
 * Main bulk upload function
 */
const bulkUploadLocalFiles = async () => {
  try {
    console.log('🚀 Bulk Upload Local Files to Cloudinary');
    console.log('='.repeat(60));

    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    const uploadsDir = path.join(__dirname, 'uploads', 'restaurants');
    
    if (!fs.existsSync(uploadsDir)) {
      console.error('❌ ERROR: uploads/restaurants/ directory not found!');
      console.error(`   Expected: ${uploadsDir}`);
      process.exit(1);
    }

    // Get all files
    const files = fs.readdirSync(uploadsDir).filter(file => {
      const ext = path.extname(file).toLowerCase();
      return ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext);
    });

    console.log(`📸 Found ${files.length} image files in uploads/restaurants/\n`);

    if (files.length === 0) {
      console.log('⚠️  No image files found!');
      await mongoose.disconnect();
      process.exit(0);
    }

    // Get all restaurants
    const restaurants = await Restaurant.find({});
    console.log(`🏪 Found ${restaurants.length} restaurants in database\n`);

    let successCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    const uploadedFiles = [];
    const failedFiles = [];

    // Process each file
    for (let i = 0; i < files.length; i++) {
      const filename = files[i];
      const filePath = path.join(uploadsDir, filename);

      console.log('─'.repeat(60));
      console.log(`📁 [${i + 1}/${files.length}] Processing: ${filename}`);

      try {
        // Find matching restaurant
        const restaurant = await findRestaurantByFilename(filename, restaurants);

        if (!restaurant) {
          console.log(`   ⚠️  Skipping - no matching restaurant found\n`);
          skippedCount++;
          continue;
        }

        // Determine image type
        const imageType = getImageType(filename);
        console.log(`   📷 Image type: ${imageType}`);

        // Check if already on Cloudinary
        const currentURL = imageType === 'cover' 
          ? (restaurant.images?.coverImage?.url || restaurant.coverImage)
          : (restaurant.images?.profileImage?.url || restaurant.image);

        if (currentURL && currentURL.includes('cloudinary.com')) {
          console.log(`   ✅ Already on Cloudinary: ${currentURL.substring(0, 50)}...`);
          console.log(`   Skipping upload\n`);
          skippedCount++;
          continue;
        }

        // Upload to Cloudinary
        console.log(`   📤 Uploading to Cloudinary...`);
        
        const folder = imageType === 'cover' 
          ? 'nice-now-deliveries/restaurants/covers'
          : 'nice-now-deliveries/restaurants/profiles';
        
        const publicId = `restaurant_${restaurant._id}_${imageType}_${Date.now()}`;

        const cloudinaryResult = await uploadToCloudinary(filePath, folder, publicId);

        console.log(`   ✅ Uploaded successfully`);
        console.log(`   URL: ${cloudinaryResult.url.substring(0, 70)}...`);

        // Update restaurant
        if (imageType === 'cover') {
          await restaurant.updateCoverImage({
            filename: cloudinaryResult.filename,
            path: cloudinaryResult.path,
            url: cloudinaryResult.url
          });
          console.log(`   💾 Updated cover image for: ${restaurant.name}`);
        } else {
          await restaurant.updateProfileImage({
            filename: cloudinaryResult.filename,
            path: cloudinaryResult.path,
            url: cloudinaryResult.url
          });
          console.log(`   💾 Updated profile image for: ${restaurant.name}`);
        }

        uploadedFiles.push({
          file: filename,
          restaurant: restaurant.name,
          type: imageType,
          url: cloudinaryResult.url
        });

        successCount++;
        console.log('');

      } catch (error) {
        console.error(`   ❌ Error: ${error.message}\n`);
        failedFiles.push({ file: filename, error: error.message });
        errorCount++;
      }
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 BULK UPLOAD SUMMARY');
    console.log('='.repeat(60));
    console.log(`✅ Successfully uploaded: ${successCount}`);
    console.log(`⏭️  Skipped: ${skippedCount}`);
    console.log(`❌ Errors: ${errorCount}`);
    console.log(`📁 Total files: ${files.length}`);

    if (uploadedFiles.length > 0) {
      console.log('\n✅ SUCCESSFULLY UPLOADED:');
      uploadedFiles.forEach(item => {
        console.log(`   • ${item.file} → ${item.restaurant} (${item.type})`);
      });
    }

    if (failedFiles.length > 0) {
      console.log('\n❌ FAILED UPLOADS:');
      failedFiles.forEach(item => {
        console.log(`   • ${item.file}: ${item.error}`);
      });
    }

    console.log('\n✨ Bulk upload complete!');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('\n❌ BULK UPLOAD FAILED:', error);
    console.error('Stack trace:', error.stack);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
    process.exit(0);
  }
};

// Run
console.log('\n🎬 Starting bulk upload...\n');
bulkUploadLocalFiles();