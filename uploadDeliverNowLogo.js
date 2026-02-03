// uploadDeliverNowLogo.js - Upload Deliver Now logo to Cloudinary
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

async function uploadDeliverNowLogo() {
  try {
    const mongoURI = process.env.MONGODB_URI || process.env.MONGO_URI;
    
    console.log('📸 DELIVER NOW LOGO UPLOAD');
    console.log('='.repeat(80));
    
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(mongoURI);
    console.log('✅ Connected\n');

    console.log('🔍 Finding Deliver Now Store...');
    const deliverNow = await Restaurant.findOne({ name: /Deliver Now Store/i });

    if (!deliverNow) {
      console.log('❌ Deliver Now Store not found!');
      await mongoose.disconnect();
      return;
    }

    console.log('✅ Found Deliver Now Store');
    console.log(`   ID: ${deliverNow._id}`);
    console.log(`   Current Profile Image: ${deliverNow.image || 'None'}\n`);

    // Check for logo file in multiple locations
    const possiblePaths = [
      path.join(__dirname, 'Uploads', 'deliver-now-logo.jpg'),
      path.join(__dirname, 'Uploads', 'restaurants', 'deliver-now-logo.jpg'),
      path.join(__dirname, 'deliver-now-logo.jpg'),
      path.join(__dirname, 'Uploads', 'deliver-now-logo.png'),
      path.join(__dirname, 'Uploads', 'restaurants', 'deliver-now-logo.png'),
    ];

    console.log('📂 Looking for logo in:');
    possiblePaths.forEach(p => console.log(`   - ${p}`));
    console.log();

    let logoPath = null;
    for (const testPath of possiblePaths) {
      if (fs.existsSync(testPath)) {
        logoPath = testPath;
        break;
      }
    }

    if (!logoPath) {
      console.log('❌ Logo file not found!');
      console.log('\n💡 To upload the logo:');
      console.log('   1. Place your logo in one of these locations:');
      console.log(`      - ${path.join(__dirname, 'Uploads', 'deliver-now-logo.jpg')}`);
      console.log(`      - ${path.join(__dirname, 'Uploads', 'restaurants', 'deliver-now-logo.jpg')}`);
      console.log('   2. Supported formats: .jpg, .jpeg, .png, .webp');
      console.log('   3. Run this script again\n');
      await mongoose.disconnect();
      return;
    }

    console.log(`✅ Found logo: ${logoPath}`);
    const stats = fs.statSync(logoPath);
    console.log(`   Size: ${(stats.size / 1024).toFixed(2)} KB\n`);

    // Delete old image from Cloudinary if exists
    const oldImageUrl = deliverNow.image;
    if (oldImageUrl && oldImageUrl.includes('cloudinary')) {
      console.log('🗑️  Deleting old image from Cloudinary...');
      try {
        const urlParts = oldImageUrl.split('/');
        const filename = urlParts[urlParts.length - 1].split('.')[0].split('?')[0];
        const folder = urlParts[urlParts.length - 2];
        const publicId = `${folder}/${filename}`;
        
        const deleteResult = await cloudinary.uploader.destroy(publicId, {
          invalidate: true
        });
        console.log(`   Result: ${deleteResult.result}\n`);
      } catch (deleteError) {
        console.log(`   ⚠️  Could not delete old image: ${deleteError.message}\n`);
      }
    }

    // Upload new logo to Cloudinary
    console.log('📤 Uploading logo to Cloudinary...');
    const timestamp = Date.now();

    try {
      const uploadResult = await cloudinary.uploader.upload(logoPath, {
        folder: 'nice-now-deliveries/restaurants',
        public_id: `delivernow-logo-${timestamp}`,
        resource_type: 'image',
        transformation: [
          { width: 800, height: 800, crop: 'limit' },
          { quality: 'auto:best' },
          { fetch_format: 'auto' }
        ],
        invalidate: true,
        overwrite: true
      });

      console.log('✅ Logo uploaded successfully!\n');
      console.log('─'.repeat(80));
      console.log('📸 CLOUDINARY IMAGE DETAILS');
      console.log('─'.repeat(80));
      console.log(`URL: ${uploadResult.secure_url}`);
      console.log(`Public ID: ${uploadResult.public_id}`);
      console.log(`Size: ${uploadResult.width}x${uploadResult.height}`);
      console.log(`Format: ${uploadResult.format}`);
      console.log(`File Size: ${(uploadResult.bytes / 1024).toFixed(2)} KB\n`);

      // Update database - ALL image fields
      console.log('💾 Updating database...');
      deliverNow.image = uploadResult.secure_url;
      deliverNow.profileImageUrl = uploadResult.secure_url;
      
      // Update nested images object if it exists
      if (deliverNow.images) {
        deliverNow.images.profileImage = {
          url: uploadResult.secure_url,
          publicId: uploadResult.public_id,
          filename: path.basename(logoPath),
          uploadedAt: new Date()
        };
      }

      deliverNow.updatedAt = new Date();
      await deliverNow.save({ validateBeforeSave: false });
      
      console.log('✅ Database updated!\n');

      // Show final result
      console.log('='.repeat(80));
      console.log('🎉 DELIVER NOW LOGO UPLOADED SUCCESSFULLY!');
      console.log('='.repeat(80));
      console.log('\n🏪 Restaurant: Deliver Now Store');
      console.log(`   ID: ${deliverNow._id}`);
      console.log(`\n📸 New Logo URL:`);
      console.log(`   ${deliverNow.image}`);
      console.log('\n' + '='.repeat(80));
      console.log('📱 NEXT STEPS:');
      console.log('='.repeat(80));
      console.log('1. ⚠️  RESTART YOUR BACKEND SERVER:');
      console.log('   - Press Ctrl+C to stop');
      console.log('   - Run: node server.js\n');
      console.log('2. 🌐 FOR WEB APP:');
      console.log('   - Hard refresh: Ctrl + Shift + R\n');
      console.log('3. 📱 FOR MOBILE APP:');
      console.log('   - Force close the app');
      console.log('   - Reopen and pull down to refresh\n');
      console.log('✅ New logo will appear everywhere!');
      console.log('='.repeat(80));

    } catch (uploadError) {
      console.error('❌ Cloudinary upload failed:', uploadError.message);
      if (uploadError.http_code) {
        console.error(`   HTTP Code: ${uploadError.http_code}`);
      }
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB\n');
  }
}

uploadDeliverNowLogo();