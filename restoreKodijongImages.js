// restoreKodijongImages.js - Restore KODIJONG's original Cloudinary images
const mongoose = require('mongoose');
require('dotenv').config();
const Restaurant = require('./models/Restaurant');

async function restoreKodijongImages() {
  try {
    const mongoURI = process.env.MONGODB_URI || process.env.MONGO_URI;
    
    console.log('🔄 RESTORING KODIJONG CLOUDINARY IMAGES');
    console.log('='.repeat(80));
    
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(mongoURI);
    console.log('✅ Connected\n');

    console.log('🔍 Finding KODIJONG restaurant...');
    const kodijong = await Restaurant.findOne({ name: /KODIJONG/i });
    
    if (!kodijong) {
      console.log('❌ KODIJONG restaurant not found!');
      await mongoose.disconnect();
      return;
    }

    console.log('✅ Found KODIJONG restaurant');
    console.log(`   ID: ${kodijong._id}`);
    console.log(`   Name: ${kodijong.name}\n`);

    console.log('🔧 Restoring Cloudinary images...\n');

    // Restore the original Cloudinary URLs
    const coverImageUrl = 'https://res.cloudinary.com/dsls9rm5j/image/upload/v1771395925/restaurants/restaurants/restaurant_1771395925027_nvoh0n5ev.jpg';
    const profileImageUrl = 'https://res.cloudinary.com/dsls9rm5j/image/upload/v1771397278/restaurants/restaurants/restaurant_1771397277597_u9jgmhfj7.jpg';

    // Initialize images object if needed
    if (!kodijong.images) {
      kodijong.images = {};
    }

    // Set cover image
    kodijong.images.coverImage = {
      url: coverImageUrl,
      path: coverImageUrl,
      publicId: 'restaurant_1771395925027_nvoh0n5ev',
    };
    kodijong.coverImage = coverImageUrl;

    // Set profile image
    kodijong.images.profileImage = {
      url: profileImageUrl,
      path: profileImageUrl,
      publicId: 'restaurant_1771397277597_u9jgmhfj7',
    };
    kodijong.image = profileImageUrl;

    kodijong.updatedAt = new Date();
    
    await kodijong.save({ validateBeforeSave: false });
    console.log('✅ Images restored!\n');

    // Show restored status
    console.log('='.repeat(80));
    console.log('🎉 KODIJONG CLOUDINARY IMAGES RESTORED!');
    console.log('='.repeat(80));
    console.log('\n📊 RESTORED IMAGES:');
    console.log('─'.repeat(80));
    console.log(`✅ Cover Image: ${kodijong.images.coverImage.url}`);
    console.log(`✅ Profile Image: ${kodijong.images.profileImage.url}`);
    console.log('');

    console.log('='.repeat(80));
    console.log('📱 NEXT STEPS:');
    console.log('='.repeat(80));
    console.log('1. 🌐 REFRESH YOUR APP:');
    console.log('   - Mobile: Pull down to refresh or force close and reopen\n');
    console.log('2. ✅ KODIJONG should now show both:');
    console.log('   - Cover image (banner at top)');
    console.log('   - Profile image (on restaurant cards)\n');
    console.log('='.repeat(80));

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB\n');
  }
}

restoreKodijongImages();