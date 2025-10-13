// backend/migrateFromURLsToCloudinary.js
// Migrates images from URLs (including local server URLs) to Cloudinary
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const cloudinary = require('cloudinary').v2;
const https = require('https');
const http = require('http');

require('dotenv').config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const Restaurant = require('./models/Restaurant');

/**
 * Check if URL is a local development URL
 */
const isLocalURL = (url) => {
  if (!url) return false;
  return url.includes('localhost') || 
         url.includes('127.0.0.1') || 
         url.includes('192.168.') || 
         url.includes('10.0.') ||
         url.includes('172.16.');
};

/**
 * Check if URL is already on Cloudinary
 */
const isCloudinaryURL = (url) => {
  if (!url) return false;
  return url.includes('cloudinary.com');
};

/**
 * Download file from URL to temp location
 */
const downloadFile = (url, filepath) => {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(filepath);
    
    protocol.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: ${response.statusCode}`));
        return;
      }
      
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve(filepath);
      });
    }).on('error', (err) => {
      fs.unlink(filepath, () => {}); // Delete incomplete file
      reject(err);
    });
  });
};

/**
 * Upload to Cloudinary from URL or local file
 */
const uploadToCloudinary = async (source, folder, publicId, isURL = false) => {
  try {
    let uploadSource = source;
    let tempFile = null;

    // If it's a URL, download it first
    if (isURL) {
      console.log(`      Downloading from URL...`);
      const tempDir = path.join(__dirname, 'temp');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      tempFile = path.join(tempDir, `temp_${Date.now()}_${path.basename(source)}`);
      
      try {
        await downloadFile(source, tempFile);
        uploadSource = tempFile;
        console.log(`      ✅ Downloaded successfully`);
      } catch (downloadError) {
        console.log(`      ❌ Download failed: ${downloadError.message}`);
        throw downloadError;
      }
    }

    console.log(`      Uploading to Cloudinary...`);
    const result = await cloudinary.uploader.upload(uploadSource, {
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

    // Clean up temp file
    if (tempFile && fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }

    return {
      url: result.secure_url,
      publicId: result.public_id,
      filename: path.basename(source),
      path: result.secure_url,
    };
  } catch (error) {
    console.error(`      ❌ Upload error:`, error.message);
    throw error;
  }
};

/**
 * Find local file from URL path
 */
const findLocalFileFromURL = (url, uploadsDir) => {
  try {
    // Extract path from URL: http://192.168.1.116:5000/uploads/restaurants/image.jpg
    const urlPath = new URL(url).pathname;
    
    // Remove leading slashes and 'uploads/'
    let relativePath = urlPath.replace(/^\/+/, '').replace(/^uploads\//, '');
    
    const possiblePaths = [
      path.join(uploadsDir, relativePath),
      path.join(uploadsDir, 'restaurants', path.basename(relativePath)),
      path.join(uploadsDir, path.basename(relativePath))
    ];

    for (const fullPath of possiblePaths) {
      if (fs.existsSync(fullPath)) {
        console.log(`      ✅ Found local file: ${fullPath}`);
        return fullPath;
      }
    }
    
    return null;
  } catch (error) {
    return null;
  }
};

/**
 * Main migration function
 */
const migrateFromURLs = async () => {
  try {
    console.log('🚀 Migrating Images from URLs to Cloudinary');
    console.log('='.repeat(60));

    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    const uploadsDir = path.join(__dirname, 'uploads');
    const restaurants = await Restaurant.find({});
    
    console.log(`📊 Found ${restaurants.length} restaurants to check\n`);

    let successCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (let i = 0; i < restaurants.length; i++) {
      const restaurant = restaurants[i];
      
      console.log('─'.repeat(60));
      console.log(`🏪 [${i + 1}/${restaurants.length}] ${restaurant.name}`);

      let hasUpdates = false;

      // ===== PROFILE IMAGE =====
      console.log('\n   📷 Profile Image:');
      const profileURL = 
        restaurant.images?.profileImage?.url ||
        restaurant.images?.profileImage?.path ||
        restaurant.image;

      if (profileURL) {
        console.log(`      Current: ${profileURL.substring(0, 60)}...`);
        
        if (isCloudinaryURL(profileURL)) {
          console.log(`      ✅ Already on Cloudinary, skipping`);
          skippedCount++;
        } else if (isLocalURL(profileURL)) {
          console.log(`      🔄 Local URL detected, migrating...`);
          
          // Try to find local file first
          const localFile = findLocalFileFromURL(profileURL, uploadsDir);
          
          try {
            let cloudinaryResult;
            
            if (localFile) {
              console.log(`      Using local file instead of downloading`);
              cloudinaryResult = await uploadToCloudinary(
                localFile,
                'nice-now-deliveries/restaurants/profiles',
                `restaurant_${restaurant._id}_profile_${Date.now()}`,
                false
              );
            } else {
              cloudinaryResult = await uploadToCloudinary(
                profileURL,
                'nice-now-deliveries/restaurants/profiles',
                `restaurant_${restaurant._id}_profile_${Date.now()}`,
                true
              );
            }

            await restaurant.updateProfileImage({
              filename: cloudinaryResult.filename,
              path: cloudinaryResult.path,
              url: cloudinaryResult.url
            });

            console.log(`      ✅ Migrated to: ${cloudinaryResult.url.substring(0, 60)}...`);
            hasUpdates = true;
          } catch (error) {
            console.log(`      ❌ Failed: ${error.message}`);
            errorCount++;
          }
        } else {
          console.log(`      ℹ️  Remote URL (not local), skipping`);
          skippedCount++;
        }
      } else {
        console.log(`      ℹ️  No profile image`);
      }

      // ===== COVER IMAGE =====
      console.log('\n   🖼️  Cover Image:');
      const coverURL = 
        restaurant.images?.coverImage?.url ||
        restaurant.images?.coverImage?.path ||
        restaurant.coverImage;

      if (coverURL) {
        console.log(`      Current: ${coverURL.substring(0, 60)}...`);
        
        if (isCloudinaryURL(coverURL)) {
          console.log(`      ✅ Already on Cloudinary, skipping`);
          skippedCount++;
        } else if (isLocalURL(coverURL)) {
          console.log(`      🔄 Local URL detected, migrating...`);
          
          const localFile = findLocalFileFromURL(coverURL, uploadsDir);
          
          try {
            let cloudinaryResult;
            
            if (localFile) {
              console.log(`      Using local file instead of downloading`);
              cloudinaryResult = await uploadToCloudinary(
                localFile,
                'nice-now-deliveries/restaurants/covers',
                `restaurant_${restaurant._id}_cover_${Date.now()}`,
                false
              );
            } else {
              cloudinaryResult = await uploadToCloudinary(
                coverURL,
                'nice-now-deliveries/restaurants/covers',
                `restaurant_${restaurant._id}_cover_${Date.now()}`,
                true
              );
            }

            await restaurant.updateCoverImage({
              filename: cloudinaryResult.filename,
              path: cloudinaryResult.path,
              url: cloudinaryResult.url
            });

            console.log(`      ✅ Migrated to: ${cloudinaryResult.url.substring(0, 60)}...`);
            hasUpdates = true;
          } catch (error) {
            console.log(`      ❌ Failed: ${error.message}`);
            errorCount++;
          }
        } else {
          console.log(`      ℹ️  Remote URL (not local), skipping`);
          skippedCount++;
        }
      } else {
        console.log(`      ℹ️  No cover image`);
      }

      if (hasUpdates) {
        successCount++;
        console.log(`\n   💾 Restaurant updated`);
      }
      
      console.log('');
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 MIGRATION SUMMARY');
    console.log('='.repeat(60));
    console.log(`✅ Successfully migrated: ${successCount}`);
    console.log(`⏭️  Skipped: ${skippedCount}`);
    console.log(`❌ Errors: ${errorCount}`);
    console.log('\n✨ Migration complete!');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('\n❌ MIGRATION FAILED:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
    process.exit(0);
  }
};

// Run
console.log('\n🎬 Starting URL migration...\n');
migrateFromURLs();