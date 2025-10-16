// uploadLocalMenuImages.js - Upload local menu item images to Cloudinary
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const cloudinary = require('cloudinary').v2;
require('dotenv').config({ path: path.join(__dirname, '.env') });

const MenuItem = require('./models/MenuItem');
const Restaurant = require('./models/Restaurant');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

async function uploadLocalMenuImages() {
  try {
    const mongoURI = process.env.MONGODB_URI || process.env.MONGO_URI;
    
    console.log('📤 UPLOADING LOCAL MENU IMAGES TO CLOUDINARY');
    console.log('='.repeat(80));
    
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(mongoURI);
    console.log('✅ Connected\n');

    // Path to local menu-items folder
    const menuItemsPath = path.join(__dirname, 'uploads', 'menu-items');
    
    console.log('📂 Checking local folder:', menuItemsPath);
    
    if (!fs.existsSync(menuItemsPath)) {
      console.log('❌ Folder not found!');
      console.log('💡 Make sure the folder exists: backend/uploads/menu-items');
      return;
    }

    // Read all files in the folder
    const files = fs.readdirSync(menuItemsPath);
    const imageFiles = files.filter(file => 
      /\.(jpg|jpeg|png|webp|gif)$/i.test(file)
    );

    console.log(`✅ Found ${imageFiles.length} image files:\n`);
    imageFiles.forEach((file, index) => {
      console.log(`${index + 1}. ${file}`);
    });

    if (imageFiles.length === 0) {
      console.log('\n❌ No image files found!');
      console.log('💡 Add image files to: backend/uploads/menu-items/');
      return;
    }

    // Get Bossa restaurant and menu items
    const bossa = await Restaurant.findOne({ name: 'Bossa' });
    const bossaMenuItems = await MenuItem.find({ restaurant: bossa._id });

    console.log(`\n\n📊 BOSSA MENU ITEMS (${bossaMenuItems.length}):`);
    console.log('='.repeat(80));
    bossaMenuItems.forEach((item, index) => {
      console.log(`${index + 1}. ${item.name}`);
    });

    console.log('\n\n🔗 MATCHING IMAGES TO MENU ITEMS:');
    console.log('='.repeat(80));

    // Create a mapping helper
    const matchImage = (itemName, imageFiles) => {
      const itemSlug = itemName.toLowerCase()
        .replace(/[^\w\s]/g, '')
        .replace(/\s+/g, '-');

      // Try exact match first
      for (const file of imageFiles) {
        const fileSlug = file.toLowerCase()
          .replace(/\.(jpg|jpeg|png|webp|gif)$/i, '')
          .replace(/[^\w\s]/g, '')
          .replace(/\s+/g, '-');

        if (fileSlug === itemSlug || fileSlug.includes(itemSlug) || itemSlug.includes(fileSlug)) {
          return file;
        }
      }

      // Try keyword matching
      const keywords = itemName.toLowerCase().split(/\s+/);
      for (const file of imageFiles) {
        const fileLower = file.toLowerCase();
        if (keywords.some(keyword => keyword.length > 3 && fileLower.includes(keyword))) {
          return file;
        }
      }

      return null;
    };

    // Upload and update each menu item
    let uploadedCount = 0;
    let skippedCount = 0;

    for (const menuItem of bossaMenuItems) {
      console.log(`\n📦 Processing: ${menuItem.name}`);
      
      const matchedFile = matchImage(menuItem.name, imageFiles);
      
      if (matchedFile) {
        console.log(`   ✅ Matched with: ${matchedFile}`);
        
        const filePath = path.join(menuItemsPath, matchedFile);
        
        try {
          // Upload to Cloudinary
          console.log('   📤 Uploading to Cloudinary...');
          
          const result = await cloudinary.uploader.upload(filePath, {
            folder: 'nice-now-deliveries/menu-items/bossa',
            public_id: `${menuItem.name.toLowerCase().replace(/[^\w]/g, '-')}-${Date.now()}`,
            overwrite: true,
            invalidate: true
          });

          console.log('   ✅ Uploaded successfully!');
          console.log(`   📍 URL: ${result.secure_url}`);

          // Update menu item with new image (using Wimpy's structure)
          menuItem.image = {
            filename: matchedFile,
            path: result.secure_url,
            url: result.secure_url,
            uploadedAt: new Date(),
            cloudinaryId: result.public_id
          };

          await menuItem.save();
          console.log('   ✅ Menu item updated!');
          uploadedCount++;

        } catch (uploadError) {
          console.log('   ❌ Upload failed:', uploadError.message);
        }

      } else {
        console.log('   ⚠️  No matching image file found');
        console.log('   💡 You can manually match this later');
        skippedCount++;
      }
    }

    console.log('\n\n✅ SUMMARY:');
    console.log('='.repeat(80));
    console.log(`Total menu items: ${bossaMenuItems.length}`);
    console.log(`✅ Uploaded and updated: ${uploadedCount}`);
    console.log(`⚠️  Skipped (no match): ${skippedCount}`);

    if (skippedCount > 0) {
      console.log('\n💡 TIP: For skipped items, rename the image files to match menu item names');
      console.log('   For example:');
      console.log('   - "Beef Curry" → beef-curry.jpg');
      console.log('   - "Meerendal Shiraz (250ml)" → meerendal-shiraz-250ml.jpg');
    }

    // Final verification
    console.log('\n\n🔍 VERIFICATION:');
    console.log('='.repeat(80));
    const updatedItems = await MenuItem.find({ restaurant: bossa._id });
    
    updatedItems.forEach((item, index) => {
      console.log(`\n${index + 1}. ${item.name}`);
      console.log(`   Has image: ${!!item.image ? '✅' : '❌'}`);
      if (item.image && item.image.url) {
        console.log(`   Image URL: ${item.image.url.substring(0, 70)}...`);
      }
    });

    console.log('\n\n🎉 DONE!');
    console.log('='.repeat(80));
    console.log('💡 Next steps:');
    console.log('   1. Restart backend: node server.js');
    console.log('   2. Test in app');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

uploadLocalMenuImages();