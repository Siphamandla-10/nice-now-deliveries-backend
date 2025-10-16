// resizeWineBottleImages.js - Resize wine bottle images to show full bottles
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

async function resizeWineImages() {
  try {
    const mongoURI = process.env.MONGODB_URI || process.env.MONGO_URI;
    
    console.log('🍷 RESIZING WINE BOTTLE IMAGES');
    console.log('='.repeat(80));
    
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(mongoURI);
    console.log('✅ Connected\n');

    // Get Bossa restaurant
    const bossa = await Restaurant.findOne({ name: 'Bossa' });

    // Get the specific wine items that need resizing
    const wineItems = await MenuItem.find({
      restaurant: bossa._id,
      name: {
        $in: [
          'Meerendal Shiraz (750ml)',
          'Meerendal Shiraz (250ml)',
          'Meerendal Pinotage Rosé (250ml)'
        ]
      }
    });

    console.log('📊 Found wine items to resize:');
    wineItems.forEach((item, index) => {
      console.log(`${index + 1}. ${item.name}`);
    });

    const menuItemsPath = path.join(__dirname, 'uploads', 'menu-items');

    console.log('\n\n🔄 RESIZING AND RE-UPLOADING:');
    console.log('='.repeat(80));

    for (const item of wineItems) {
      console.log(`\n📦 Processing: ${item.name}`);

      // Find the matching local file
      const possibleFiles = [
        `${item.name}.png`,
        `${item.name}.jpg`,
        `${item.name}.jpeg`
      ];

      let localFile = null;
      for (const fileName of possibleFiles) {
        const filePath = path.join(menuItemsPath, fileName);
        if (fs.existsSync(filePath)) {
          localFile = filePath;
          break;
        }
      }

      if (!localFile) {
        console.log('   ⚠️  Local file not found, skipping...');
        continue;
      }

      console.log(`   ✅ Found local file: ${path.basename(localFile)}`);

      try {
        // Upload with Cloudinary transformations to show full bottle
        console.log('   📤 Uploading with resize transformation...');
        
        const result = await cloudinary.uploader.upload(localFile, {
          folder: 'nice-now-deliveries/menu-items/bossa',
          public_id: `${item.name.toLowerCase().replace(/[^\w]/g, '-')}-${Date.now()}`,
          overwrite: true,
          invalidate: true,
          transformation: [
            {
              width: 300,
              height: 300,
              crop: 'fit',  // Fit the entire image within bounds
              background: 'white'
            },
            {
              quality: 'auto:good'
            }
          ]
        });

        console.log('   ✅ Uploaded successfully!');
        console.log(`   📍 URL: ${result.secure_url}`);

        // Update menu item
        item.image = {
          filename: path.basename(localFile),
          path: result.secure_url,
          url: result.secure_url,
          uploadedAt: new Date(),
          cloudinaryId: result.public_id
        };

        await item.save();
        console.log('   ✅ Menu item updated!');

      } catch (uploadError) {
        console.log('   ❌ Upload failed:', uploadError.message);
      }
    }

    // Final verification
    console.log('\n\n✅ VERIFICATION:');
    console.log('='.repeat(80));
    
    const updatedWines = await MenuItem.find({
      restaurant: bossa._id,
      name: {
        $in: [
          'Meerendal Shiraz (750ml)',
          'Meerendal Shiraz (250ml)',
          'Meerendal Pinotage Rosé (250ml)'
        ]
      }
    });

    updatedWines.forEach((item, index) => {
      console.log(`\n${index + 1}. ${item.name}`);
      console.log(`   Image URL: ${item.image?.url || 'No image'}`);
    });

    console.log('\n\n🎉 DONE!');
    console.log('='.repeat(80));
    console.log('The wine bottle images have been resized to show full bottles!');
    console.log('💡 Next steps:');
    console.log('   1. Restart backend: node server.js');
    console.log('   2. Clear app cache');
    console.log('   3. Test in app - bottles should now be fully visible');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

resizeWineImages();