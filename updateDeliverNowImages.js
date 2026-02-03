// updateDeliverNowImages.js - Update Deliver Now Store images on Cloudinary
const mongoose = require('mongoose');
const cloudinary = require('cloudinary').v2;
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const Restaurant = require('./models/Restaurant');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

async function updateDeliverNowImages() {
  try {
    const mongoURI = process.env.MONGODB_URI || process.env.MONGO_URI;
    
    console.log('🏪 UPDATING DELIVER NOW STORE IMAGES');
    console.log('='.repeat(80));
    
    // Connect to MongoDB
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(mongoURI);
    console.log('✅ Connected\n');

    // Find Deliver Now Store
    console.log('🔍 Finding Deliver Now Store...');
    const deliverNow = await Restaurant.findOne({ name: /Deliver Now Store/i });

    if (!deliverNow) {
      console.log('❌ Deliver Now Store not found!');
      await mongoose.disconnect();
      return;
    }

    console.log('✅ Found Deliver Now Store');
    console.log(`   ID: ${deliverNow._id}`);
    console.log(`   Name: ${deliverNow.name}\n`);

    // Define images to upload
    const images = [
      {
        field: 'image',
        fileName: 'deliver-now-logo.jpg',
        description: 'Profile Image'
      },
      {
        field: 'coverImage',
        fileName: 'deliver-now-cover.jpg',
        description: 'Cover Image'
      }
    ];

    // Process each image
    for (const img of images) {
      console.log(`\n📝 Processing: ${img.description}`);
      console.log('─'.repeat(80));

      // Find image file
      const possiblePaths = [
        path.join(__dirname, 'Uploads', img.fileName),
        path.join(__dirname, 'Uploads', 'restaurants', img.fileName),
        path.join(__dirname, img.fileName),
      ];

      let imagePath = null;
      for (const testPath of possiblePaths) {
        if (fs.existsSync(testPath)) {
          imagePath = testPath;
          break;
        }
      }

      if (!imagePath) {
        console.log(`⚠️  Image file "${img.fileName}" not found!`);
        console.log(`   Place it in: ${path.join(__dirname, 'Uploads', img.fileName)}\n`);
        continue;
      }

      console.log(`✅ Found: ${imagePath}`);

      // Delete old image from Cloudinary
      const oldImageUrl = deliverNow[img.field];
      if (oldImageUrl && oldImageUrl.includes('cloudinary')) {
        console.log('🗑️  Deleting old image...');
        try {
          const urlParts = oldImageUrl.split('/');
          const filename = urlParts[urlParts.length - 1].split('.')[0];
          const folder = urlParts[urlParts.length - 2];
          const publicId = `${folder}/${filename}`;
          
          await cloudinary.uploader.destroy(publicId, { invalidate: true });
          console.log('   ✅ Old image deleted');
        } catch (err) {
          console.log(`   ⚠️  Could not delete: ${err.message}`);
        }
      }

      // Upload new image
      console.log('📤 Uploading to Cloudinary...');
      try {
        const result = await cloudinary.uploader.upload(imagePath, {
          folder: 'restaurants',
          public_id: `delivernow_${img.field}_${Date.now()}`,
          transformation: [
            { width: 1200, height: 800, crop: 'limit' },
            { quality: 'auto' },
            { fetch_format: 'auto' }
          ],
          invalidate: true,
          overwrite: true
        });

        console.log('✅ Uploaded successfully!');
        console.log(`   URL: ${result.secure_url}`);

        // Update database
        deliverNow[img.field] = result.secure_url;
        
      } catch (err) {
        console.error(`❌ Upload failed: ${err.message}`);
      }
    }

    // Save to database
    console.log('\n💾 Saving to database...');
    await deliverNow.save({ validateBeforeSave: false });
    console.log('✅ Database updated!\n');

    // Final summary
    console.log('='.repeat(80));
    console.log('🎉 UPDATE COMPLETE!');
    console.log('='.repeat(80));
    console.log(`\n✅ Profile Image: ${deliverNow.image}`);
    console.log(`✅ Cover Image: ${deliverNow.coverImage}\n`);
    console.log('📱 Restart your app to see changes!');
    console.log('='.repeat(80));

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB\n');
  }
}

// Run the update
updateDeliverNowImages();