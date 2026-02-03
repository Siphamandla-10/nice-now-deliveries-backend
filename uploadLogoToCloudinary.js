// uploadBossaMenuImages.js - Upload menu item images to Cloudinary
const mongoose = require('mongoose');
const cloudinary = require('cloudinary').v2;
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const Restaurant = require('./models/Restaurant');
const MenuItem = require('./models/MenuItem');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

async function uploadBossaMenuImages() {
  try {
    const mongoURI = process.env.MONGODB_URI || process.env.MONGO_URI;
    
    console.log('📸 BOSSA MENU IMAGES UPLOAD');
    console.log('='.repeat(80));
    
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(mongoURI);
    console.log('✅ Connected\n');

    console.log('🔍 Finding Bossa restaurant...');
    const bossa = await Restaurant.findOne({ name: 'Bossa' });

    if (!bossa) {
      console.log('❌ Bossa restaurant not found!');
      await mongoose.disconnect();
      return;
    }

    console.log('✅ Found Bossa');
    console.log(`   ID: ${bossa._id}\n`);

    // Get all Bossa menu items
    const menuItems = await MenuItem.find({ restaurant: bossa._id });
    
    if (menuItems.length === 0) {
      console.log('❌ No menu items found for Bossa!');
      console.log('💡 Run: node addBossaMenu.js first');
      await mongoose.disconnect();
      return;
    }

    console.log(`📋 Found ${menuItems.length} menu items\n`);

    // Check for images folder
    const menuImagesDir = path.join(__dirname, 'Uploads', 'menu-items', 'bossa');
    
    console.log('📂 Looking for images in:');
    console.log(`   ${menuImagesDir}\n`);

    if (!fs.existsSync(menuImagesDir)) {
      console.log('❌ Menu images folder not found!');
      console.log('\n💡 To upload menu item images:');
      console.log('   1. Create folder: backend/Uploads/menu-items/bossa/');
      console.log('   2. Place your menu item images there');
      console.log('   3. Name them:');
      console.log('      - beef-curry.jpg');
      console.log('      - wine-sauvignon-blanc.jpg');
      console.log('      - wine-pinotage-rose.jpg');
      console.log('      - wine-shiraz.jpg');
      console.log('   4. Run this script again\n');
      
      console.log('📝 Creating folder structure...');
      fs.mkdirSync(menuImagesDir, { recursive: true });
      console.log('✅ Folder created: ' + menuImagesDir);
      console.log('\n💡 Now add your images to this folder and run the script again!');
      
      await mongoose.disconnect();
      return;
    }

    // List available images
    const availableImages = fs.readdirSync(menuImagesDir);
    
    if (availableImages.length === 0) {
      console.log('📭 Folder is empty!');
      console.log('\n💡 Add menu item images to:');
      console.log(`   ${menuImagesDir}`);
      await mongoose.disconnect();
      return;
    }

    console.log(`📸 Found ${availableImages.length} image(s):\n`);
    availableImages.forEach((img, i) => {
      console.log(`   ${i + 1}. ${img}`);
    });
    console.log();

    // Upload images and update menu items
    let uploadedCount = 0;
    let skippedCount = 0;

    for (const item of menuItems) {
      console.log(`\n📝 Processing: ${item.name}`);
      
      if (item.image?.url) {
        console.log('   ⏭️  Already has image, skipping...');
        skippedCount++;
        continue;
      }

      // Try to find matching image - IMPROVED MATCHING
      // Create slug first (needed for upload public_id)
      const itemNameSlug = item.name.toLowerCase()
        .replace(/[()]/g, '')
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '');
      
      let matchingImage = null;
      
      // For wines, use generic wine images for all sizes
      if (item.name.toLowerCase().includes('sauvignon blanc')) {
        matchingImage = availableImages.find(img => 
          img.toLowerCase().includes('sauvignon')
        );
      } else if (item.name.toLowerCase().includes('shiraz')) {
        matchingImage = availableImages.find(img => 
          img.toLowerCase().includes('shiraz')
        );
      } else if (item.name.toLowerCase().includes('pinotage') || item.name.toLowerCase().includes('rosé')) {
        matchingImage = availableImages.find(img => 
          img.toLowerCase().includes('pinotage') || 
          img.toLowerCase().includes('rose')
        );
      } else {
        // For non-wine items, try slug matching
        matchingImage = availableImages.find(img => {
          const imgName = img.toLowerCase().replace(/\.[^.]+$/, '');
          return imgName.includes(itemNameSlug.substring(0, 15)) || 
                 itemNameSlug.includes(imgName);
        });
      }

      if (!matchingImage) {
        console.log(`   ⚠️  No matching image found`);
        console.log(`   💡 Expected: ${itemNameSlug}.jpg/png`);
        skippedCount++;
        continue;
      }

      const imagePath = path.join(menuImagesDir, matchingImage);
      console.log(`   ✅ Found image: ${matchingImage}`);
      console.log(`   📤 Uploading to Cloudinary...`);

      try {
        const uploadResult = await cloudinary.uploader.upload(imagePath, {
          folder: 'nice-now-deliveries/menu-items/bossa',  // FIXED: Matches your Cloudinary structure
          public_id: `${itemNameSlug}-${Date.now()}`,
          resource_type: 'image',
          transformation: [
            { width: 600, height: 600, crop: 'fill' },
            { quality: 'auto' },
            { fetch_format: 'auto' }
          ]
        });

        // Update menu item
        item.image = {
          url: uploadResult.secure_url,
          publicId: uploadResult.public_id,
          filename: matchingImage,
          uploadedAt: new Date()
        };

        await item.save();
        
        console.log(`   ✅ Uploaded: ${uploadResult.secure_url.substring(0, 60)}...`);
        console.log(`   💾 Database updated`);
        uploadedCount++;

      } catch (uploadError) {
        console.log(`   ❌ Upload failed: ${uploadError.message}`);
        skippedCount++;
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log('🎉 IMAGE UPLOAD COMPLETE!');
    console.log('='.repeat(80));
    console.log(`✅ Uploaded: ${uploadedCount} images`);
    console.log(`⏭️  Skipped: ${skippedCount} items`);
    console.log('\n💡 Menu items with images will now display beautifully in the app!');
    console.log('='.repeat(80));

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

uploadBossaMenuImages();