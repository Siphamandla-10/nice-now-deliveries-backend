// uploadLifeStyleJunctionImages.js - Upload Life Style Junction restaurant images
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const cloudinary = require('cloudinary').v2;
require('dotenv').config({ path: path.join(__dirname, '.env') });

const Restaurant = require('./models/Restaurant');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

async function uploadLifeStyleJunctionImages() {
  try {
    const mongoURI = process.env.MONGODB_URI || process.env.MONGO_URI;
    
    console.log('🏪 UPLOADING LIFE STYLE JUNCTION IMAGES');
    console.log('='.repeat(80));
    
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(mongoURI);
    console.log('✅ Connected\n');

    // Find Life Style Junction restaurant
    const lifeStyle = await Restaurant.findOne({ 
      name: /Life.*Style.*Junction/i 
    });

    if (!lifeStyle) {
      console.log('❌ Life Style Junction restaurant not found!');
      console.log('\n💡 Creating Life Style Junction restaurant...');
      
      // You can create it here or return
      console.log('Please create the restaurant first or check the exact name in the database.');
      return;
    }

    console.log('📊 FOUND RESTAURANT:');
    console.log(`   ID: ${lifeStyle._id}`);
    console.log(`   Name: ${lifeStyle.name}`);
    console.log(`   Current Profile Image: ${lifeStyle.images?.profileImage?.url || 'None'}`);
    console.log(`   Current Cover Image: ${lifeStyle.images?.coverImage?.url || 'None'}`);

    // Path to the image file
    const uploadsPath = path.join(__dirname, 'uploads', 'restaurants');
    
    console.log('\n📂 Looking for images in:', uploadsPath);

    if (!fs.existsSync(uploadsPath)) {
      console.log('❌ Uploads folder not found!');
      console.log('💡 Creating folder...');
      fs.mkdirSync(uploadsPath, { recursive: true });
    }

    // Look for Life Style Junction image files
    const possibleNames = [
      'life-style-junction.jpg',
      'life-style-junction.png',
      'lifestyle-junction.jpg',
      'lifestyle-junction.png',
      'Life Style Junction.jpg',
      'Life Style Junction.png',
      'LifeStyleJunction.jpg',
      'LifeStyleJunction.png'
    ];

    let imageFile = null;
    for (const name of possibleNames) {
      const filePath = path.join(uploadsPath, name);
      if (fs.existsSync(filePath)) {
        imageFile = filePath;
        console.log(`✅ Found image: ${name}`);
        break;
      }
    }

    if (!imageFile) {
      console.log('\n⚠️  No Life Style Junction image found!');
      console.log('💡 Please add an image file to: backend/uploads/restaurants/');
      console.log('   Supported names:');
      possibleNames.forEach(name => console.log(`   - ${name}`));
      console.log('\n📝 Or specify the file path:');
      console.log('   Example: life-style-junction.jpg');
      return;
    }

    // Upload to Cloudinary
    console.log('\n📤 UPLOADING TO CLOUDINARY:');
    console.log('='.repeat(80));

    try {
      // Upload profile image
      console.log('📤 Uploading profile image...');
      const profileResult = await cloudinary.uploader.upload(imageFile, {
        folder: 'nice-now-deliveries/restaurants/profiles',
        public_id: `restaurant_${lifeStyle._id}_profile_${Date.now()}`,
        overwrite: true,
        invalidate: true,
        transformation: [
          { width: 800, height: 800, crop: 'fill', gravity: 'center' },
          { quality: 'auto:good' }
        ]
      });

      console.log('✅ Profile image uploaded!');
      console.log(`   URL: ${profileResult.secure_url}`);

      // Upload cover image
      console.log('\n📤 Uploading cover image...');
      const coverResult = await cloudinary.uploader.upload(imageFile, {
        folder: 'nice-now-deliveries/restaurants/covers',
        public_id: `restaurant_${lifeStyle._id}_cover_${Date.now()}`,
        overwrite: true,
        invalidate: true,
        transformation: [
          { width: 1200, height: 600, crop: 'fill', gravity: 'center' },
          { quality: 'auto:good' }
        ]
      });

      console.log('✅ Cover image uploaded!');
      console.log(`   URL: ${coverResult.secure_url}`);

      // Update restaurant in database with Wimpy's structure
      console.log('\n💾 UPDATING RESTAURANT IN DATABASE:');
      console.log('='.repeat(80));

      lifeStyle.images = {
        profileImage: {
          filename: path.basename(imageFile),
          path: profileResult.secure_url,
          url: profileResult.secure_url,
          uploadedAt: new Date(),
          publicId: profileResult.public_id
        },
        coverImage: {
          filename: path.basename(imageFile),
          path: coverResult.secure_url,
          url: coverResult.secure_url,
          uploadedAt: new Date(),
          publicId: coverResult.public_id
        },
        gallery: []
      };

      // Also set legacy fields for compatibility
      lifeStyle.image = profileResult.secure_url;
      lifeStyle.coverImage = coverResult.secure_url;

      // Make sure restaurant is active
      lifeStyle.isActive = true;
      lifeStyle.status = 'active';

      await lifeStyle.save();

      console.log('✅ Restaurant updated successfully!');

      // Final verification
      console.log('\n\n✅ FINAL VERIFICATION:');
      console.log('='.repeat(80));
      
      const updated = await Restaurant.findById(lifeStyle._id);
      
      console.log('Life Style Junction:');
      console.log(`   ID: ${updated._id}`);
      console.log(`   Name: ${updated.name}`);
      console.log(`   Status: ${updated.status}`);
      console.log(`   Active: ${updated.isActive ? '✅' : '❌'}`);
      console.log(`   Profile Image: ${updated.images?.profileImage?.url}`);
      console.log(`   Cover Image: ${updated.images?.coverImage?.url}`);
      console.log(`   Legacy Image: ${updated.image}`);
      console.log(`   Legacy Cover: ${updated.coverImage}`);

      console.log('\n\n🎉 SUCCESS!');
      console.log('='.repeat(80));
      console.log('✅ Life Style Junction images uploaded!');
      console.log('✅ Restaurant is active and ready!');
      console.log('\n💡 Next steps:');
      console.log('   1. Images will appear in the app immediately');
      console.log('   2. No need to restart backend or rebuild app');
      console.log('   3. Just refresh the restaurant list in the app');

    } catch (uploadError) {
      console.error('❌ Cloudinary upload failed:', uploadError.message);
      console.error(uploadError);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

uploadLifeStyleJunctionImages();