// uploadBossaImageFixed.js - Upload Bossa.png to Cloudinary
const mongoose = require('mongoose');
const cloudinary = require('cloudinary').v2;
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const Restaurant = require('./models/Restaurant');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

async function uploadBossaImage() {
  try {
    const mongoURI = process.env.MONGODB_URI || process.env.MONGO_URI;
    
    console.log('🍽️  BOSSA IMAGE UPLOAD');
    console.log('='.repeat(80));
    
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(mongoURI);
    console.log('✅ Connected\n');

    console.log('🔍 Finding Bossa restaurant...');
    const bossa = await Restaurant.findOne({ name: 'Bossa' });

    if (!bossa) {
      console.log('❌ Bossa restaurant not found!');
      console.log('💡 Please run: node activateBossa.js first');
      await mongoose.disconnect();
      return;
    }

    console.log('✅ Found Bossa restaurant');
    console.log(`   ID: ${bossa._id}`);
    console.log(`   Location: ${bossa.address?.city}, ${bossa.address?.state}\n`);

    // Direct path to Bossa.png in backend/Uploads/restaurants
    const bossaImagePath = path.join(__dirname, 'Uploads', 'restaurants', 'Bossa.png');
    
    console.log('📂 Looking for image at:');
    console.log(`   ${bossaImagePath}\n`);

    if (!fs.existsSync(bossaImagePath)) {
      console.log('❌ Bossa.png not found!');
      console.log('\n💡 Expected location:');
      console.log(`   ${bossaImagePath}`);
      console.log('\n📋 Files in Uploads/restaurants:');
      
      const uploadDir = path.join(__dirname, 'Uploads', 'restaurants');
      if (fs.existsSync(uploadDir)) {
        const files = fs.readdirSync(uploadDir);
        files.forEach(file => console.log(`   - ${file}`));
      }
      
      await mongoose.disconnect();
      return;
    }

    console.log('✅ Found Bossa.png!');
    const stats = fs.statSync(bossaImagePath);
    console.log(`   Size: ${(stats.size / 1024).toFixed(2)} KB\n`);
    
    console.log('📤 Uploading image to Cloudinary...');

    const uploadResult = await cloudinary.uploader.upload(bossaImagePath, {
      folder: 'restaurants/bossa',
      public_id: `bossa-nigel-${Date.now()}`,
      transformation: [
        { width: 800, height: 600, crop: 'fill' },
        { quality: 'auto' },
        { fetch_format: 'auto' }
      ]
    });

    console.log('✅ Image uploaded to Cloudinary!\n');
    console.log('📸 Image Details:');
    console.log(`   URL: ${uploadResult.secure_url}`);
    console.log(`   Public ID: ${uploadResult.public_id}`);
    console.log(`   Format: ${uploadResult.format}`);
    console.log(`   Size: ${(uploadResult.bytes / 1024).toFixed(2)} KB\n`);

    console.log('💾 Updating restaurant in database...');
    
    // Update restaurant with new image
    bossa.images = {
      coverImage: {
        url: uploadResult.secure_url,
        publicId: uploadResult.public_id,
        filename: `${uploadResult.public_id}.${uploadResult.format}`,
        path: uploadResult.secure_url,
        uploadedAt: new Date()
      },
      profileImage: {
        url: uploadResult.secure_url,
        publicId: uploadResult.public_id,
        filename: `${uploadResult.public_id}.${uploadResult.format}`,
        path: uploadResult.secure_url,
        uploadedAt: new Date()
      },
      gallery: []
    };

    // Update legacy fields
    bossa.coverImage = uploadResult.secure_url;
    bossa.image = uploadResult.secure_url;

    await bossa.save();

    console.log('✅ Database updated!\n');
    console.log('='.repeat(80));
    console.log('🎉 SUCCESS!');
    console.log('='.repeat(80));
    console.log('Bossa now has the correct restaurant image!');
    console.log('\n📱 Image URL:');
    console.log(uploadResult.secure_url);
    console.log('\n🍽️  Restaurant Details:');
    console.log(`   Name: ${bossa.name}`);
    console.log(`   Location: ${bossa.address?.city}, ${bossa.address?.state}`);
    console.log(`   Status: ${bossa.status}`);
    console.log(`   Active: ${bossa.isActive ? '✅' : '❌'}`);
    console.log(`   Featured: ${bossa.isFeatured ? '✅' : '❌'}`);
    console.log('\n💡 Next step: Run node activateBossa.js to activate the restaurant!');
    console.log('='.repeat(80));

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.http_code === 401) {
      console.error('\n💡 Cloudinary credentials issue. Check your .env file:');
      console.error('   CLOUDINARY_CLOUD_NAME');
      console.error('   CLOUDINARY_API_KEY');
      console.error('   CLOUDINARY_API_SECRET');
    }
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

uploadBossaImage();