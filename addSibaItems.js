// addSibaItems.js - Add menu items to SIBA restaurant
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const cloudinary = require('cloudinary').v2;
require('dotenv').config({ path: path.join(__dirname, '.env') });

const Restaurant = require('./models/Restaurant');
const MenuItem = require('./models/MenuItem');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

async function addSibaItems() {
  try {
    const mongoURI = process.env.MONGODB_URI || process.env.MONGO_URI;
    
    console.log('🍽️  ADDING ITEMS TO SIBA');
    console.log('='.repeat(80));
    
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(mongoURI);
    console.log('✅ Connected\n');

    // Find SIBA
    const siba = await Restaurant.findOne({ 
      name: /^SIBA$/i 
    });

    if (!siba) {
      console.log('❌ SIBA not found! Searching for any restaurant with "Siba"...\n');
      
      const allSiba = await Restaurant.find({ name: /Siba/i });
      if (allSiba.length > 0) {
        console.log('Found restaurants:');
        allSiba.forEach((r, i) => {
          console.log(`   ${i + 1}. ${r.name} (ID: ${r._id})`);
        });
      }
      return;
    }

    console.log('📊 RESTAURANT:');
    console.log(`   ID: ${siba._id}`);
    console.log(`   Name: ${siba.name}`);

    // Check existing menu
    const existingItems = await MenuItem.find({ restaurant: siba._id });
    console.log(`   Current menu items: ${existingItems.length}\n`);

    // Define menu items with exact naming
    const menuItems = [
      {
        name: 'PUMPKIN PATCH',
        description: 'Pumpkin and miso with Cremalat gorgonzola mousse, pumpkin seed crisps, pumpkin fritters with roasted pumpkin velouté',
        price: 150.00,
        category: 'Main Course',
        isAvailable: true,
        imageFileName: 'PUMPKIN-PATCH'
      },
      {
        name: 'THE DOMBOLO DANCE',
        description: 'Siba\'s traditional Xhosa steamed buns with innovative flavoured butters and chimichurri',
        price: 220.00,
        category: 'Main Course',
        isAvailable: true,
        imageFileName: 'THE-DOMBOLO-DANCE'
      },
      {
        name: 'A TOUCH OF HOME',
        description: 'Cheese stuffed boerewors balls, Creamy "bhisto" inspired sauce topped with shimeji mushrooms with Prawn Shisanyama',
        price: 250.00,
        category: 'Main Course',
        isAvailable: true,
        imageFileName: 'A-TOUCH-OF-HOME'
      },
      {
        name: 'GLOCAL IS LEKKER',
        description: 'Beef fillet with creamy samp and mushroom risotto, greens, short-rib croquette, crispy kale, truffle jus',
        price: 150.00,
        category: 'Main Course',
        isAvailable: true,
        imageFileName: 'GLOCAL-IS-LEKKER'
      }
    ];

    console.log('📋 MENU ITEMS TO ADD:');
    console.log('='.repeat(80));
    menuItems.forEach((item, index) => {
      console.log(`${index + 1}. ${item.name} - R${item.price.toFixed(2)}`);
      console.log(`   ${item.description}`);
    });

    // Path to menu images
    const menuImagesPath = path.join(__dirname, 'uploads', 'menu-items');
    
    if (!fs.existsSync(menuImagesPath)) {
      console.log('\n📂 Creating menu-items folder...');
      fs.mkdirSync(menuImagesPath, { recursive: true });
    }

    console.log(`\n📂 Looking for images in: ${menuImagesPath}`);

    // Read available images
    const files = fs.readdirSync(menuImagesPath);
    const imageFiles = files.filter(file => 
      /\.(jpg|jpeg|png|webp|gif)$/i.test(file)
    );

    console.log(`✅ Found ${imageFiles.length} total image files`);

    // Show matching images
    console.log('\n🔍 Checking for SIBA images:');
    const sibaImages = menuItems.map(item => item.imageFileName);
    sibaImages.forEach(imageName => {
      const found = imageFiles.find(f => {
        const fileWithoutExt = f.replace(/\.(jpg|jpeg|png|webp|gif)$/i, '');
        return fileWithoutExt === imageName || 
               fileWithoutExt.toLowerCase() === imageName.toLowerCase();
      });
      console.log(`   ${imageName}: ${found ? `✅ ${found}` : '❌ NOT FOUND'}`);
    });

    console.log('\n\n🔄 ADDING MENU ITEMS:');
    console.log('='.repeat(80));

    // Helper to match images
    const matchImage = (itemData, imageFiles) => {
      const targetFileName = itemData.imageFileName;
      
      // Try exact match (case-sensitive)
      for (const file of imageFiles) {
        const fileWithoutExt = file.replace(/\.(jpg|jpeg|png|webp|gif)$/i, '');
        
        if (fileWithoutExt === targetFileName) {
          return file;
        }
      }

      // Try case-insensitive match
      for (const file of imageFiles) {
        const fileWithoutExt = file.replace(/\.(jpg|jpeg|png|webp|gif)$/i, '');
        
        if (fileWithoutExt.toLowerCase() === targetFileName.toLowerCase()) {
          return file;
        }
      }

      return null;
    };

    let addedCount = 0;
    let skippedCount = 0;

    for (const itemData of menuItems) {
      console.log(`\n📦 Processing: ${itemData.name}`);

      // Check if exists
      const existing = await MenuItem.findOne({
        restaurant: siba._id,
        name: itemData.name
      });

      if (existing) {
        console.log('   ⚠️  Already exists, skipping...');
        skippedCount++;
        continue;
      }

      // Create menu item
      const newItem = {
        restaurant: siba._id,
        name: itemData.name,
        description: itemData.description,
        price: itemData.price,
        category: itemData.category,
        isAvailable: itemData.isAvailable
      };

      // Look for image
      const matchedFile = matchImage(itemData, imageFiles);

      if (matchedFile) {
        console.log(`   ✅ Matched with: ${matchedFile}`);

        const filePath = path.join(menuImagesPath, matchedFile);

        try {
          console.log('   📤 Uploading to Cloudinary...');

          const result = await cloudinary.uploader.upload(filePath, {
            folder: 'nice-now-deliveries/menu-items/siba',
            public_id: `${itemData.name.toLowerCase().replace(/[^\w]/g, '-')}-${Date.now()}`,
            overwrite: true,
            invalidate: true,
            transformation: [
              { width: 500, height: 500, crop: 'fit' },
              { quality: 'auto:good' }
            ]
          });

          console.log('   ✅ Image uploaded!');

          newItem.image = {
            filename: matchedFile,
            path: result.secure_url,
            url: result.secure_url,
            uploadedAt: new Date(),
            cloudinaryId: result.public_id
          };

        } catch (uploadError) {
          console.log('   ⚠️  Image upload failed:', uploadError.message);
        }
      } else {
        console.log(`   ⚠️  No image found`);
        console.log(`   💡 Looking for: ${itemData.imageFileName}.jpg/jpeg/png`);
      }

      // Save menu item
      const menuItem = new MenuItem(newItem);
      await menuItem.save();
      
      console.log(`   ✅ Menu item created! ID: ${menuItem._id}`);
      addedCount++;
    }

    console.log('\n\n✅ SUMMARY:');
    console.log('='.repeat(80));
    console.log(`Total items: ${menuItems.length}`);
    console.log(`✅ Added: ${addedCount}`);
    console.log(`⚠️  Skipped (already exist): ${skippedCount}`);

    // Verification
    console.log('\n\n🔍 VERIFICATION:');
    console.log('='.repeat(80));
    
    const allItems = await MenuItem.find({ restaurant: siba._id });
    console.log(`SIBA now has ${allItems.length} menu items:\n`);
    
    allItems.forEach((item, index) => {
      console.log(`${index + 1}. ${item.name} - R${item.price.toFixed(2)}`);
      console.log(`   Category: ${item.category}`);
      console.log(`   Has image: ${item.image?.url ? '✅' : '❌'}`);
      if (item.image?.url) {
        console.log(`   Image: ${item.image.url.substring(0, 60)}...`);
      }
      console.log('');
    });

    console.log('\n🎉 DONE!');
    console.log('='.repeat(80));
    console.log('✅ SIBA items added!');
    console.log('\n💡 IMPORTANT: Save your image files with these EXACT names:');
    console.log('   - PUMPKIN-PATCH.jpg (or .png, .jpeg)');
    console.log('   - THE-DOMBOLO-DANCE.jpg (or .png, .jpeg)');
    console.log('   - A-TOUCH-OF-HOME.jpg (or .png, .jpeg)');
    console.log('   - GLOCAL-IS-LEKKER.jpg (or .png, .jpeg)');
    console.log('\n   Note: Use UPPERCASE and hyphens (-) instead of spaces');
    console.log('\n✅ Menu appears in the app immediately!');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

addSibaItems();