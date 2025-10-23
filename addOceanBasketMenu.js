// addOceanBasketMenu.js - Add menu items to Ocean Basket
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

async function addOceanBasketMenu() {
  try {
    const mongoURI = process.env.MONGODB_URI || process.env.MONGO_URI;
    
    console.log('🌊 ADDING OCEAN BASKET MENU ITEMS');
    console.log('='.repeat(80));
    
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(mongoURI);
    console.log('✅ Connected\n');

    // Find Ocean Basket
    const oceanBasket = await Restaurant.findOne({ 
      name: /Ocean Basket/i 
    });

    if (!oceanBasket) {
      console.log('❌ Ocean Basket not found!');
      console.log('💡 Make sure Ocean Basket restaurant exists in the database');
      return;
    }

    console.log('📊 RESTAURANT:');
    console.log(`   ID: ${oceanBasket._id}`);
    console.log(`   Name: ${oceanBasket.name}`);

    // Check existing menu
    const existingItems = await MenuItem.find({ restaurant: oceanBasket._id });
    console.log(`   Current menu items: ${existingItems.length}\n`);

    // Define menu items
    const menuItems = [
      {
        name: 'Calamari Meal',
        description: 'Tender calamari strips, lightly fried and served with chips and rice',
        price: 129.90,
        category: 'Main Course',
        isAvailable: true,
        imageFileName: 'calamari-meal'
      },
      {
        name: 'Fish & Calamari Combo',
        description: 'Perfect combo of grilled fish and calamari with sides',
        price: 149.90,
        category: 'Main Course',
        isAvailable: true,
        imageFileName: 'fish-calamari-combo'
      },
      {
        name: 'Fried Prawns',
        description: 'Succulent prawns, lightly fried to golden perfection',
        price: 169.90,
        category: 'Main Course',
        isAvailable: true,
        imageFileName: 'fried-prawns'
      },
      {
        name: 'Grilled Salmon',
        description: 'Fresh Atlantic salmon fillet, perfectly grilled',
        price: 189.90,
        category: 'Main Course',
        isAvailable: true,
        imageFileName: 'grilled-salmon'
      },
      {
        name: 'Hake and Chips',
        description: 'Classic fish and chips with crispy hake fillet',
        price: 99.90,
        category: 'Main Course',
        isAvailable: true,
        imageFileName: 'hake-and-chip'
      },
      {
        name: 'Lobster Tail',
        description: 'Premium lobster tail, grilled to perfection',
        price: 349.90,
        category: 'Main Course',
        isAvailable: true,
        imageFileName: 'lobster-tail'
      },
      {
        name: 'Seafood Platter for 2',
        description: 'Generous seafood platter perfect for sharing with prawns, calamari, mussels, and fish',
        price: 399.90,
        category: 'Main Course',
        isAvailable: true,
        imageFileName: 'seafood-platter-for-2'
      },
      {
        name: 'Seafood Curry',
        description: 'Rich and aromatic seafood curry with mixed seafood',
        price: 159.90,
        category: 'Main Course',
        isAvailable: true,
        imageFileName: 'seafood-curry'
      },
      {
        name: 'Sushi Platter',
        description: 'Assorted fresh sushi selection with soy sauce and wasabi',
        price: 179.90,
        category: 'Main Course',
        isAvailable: true,
        imageFileName: 'sushi-platter'
      },
      {
        name: 'Fish Wrap',
        description: 'Grilled fish wrapped in a soft tortilla with fresh salad',
        price: 79.90,
        category: 'Sandwiches',
        isAvailable: true,
        imageFileName: 'fish-wrap'
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
    console.log('\n🔍 Checking for Ocean Basket images:');
    const oceanBasketImages = menuItems.map(item => item.imageFileName);
    oceanBasketImages.forEach(imageName => {
      const found = imageFiles.find(f => 
        f.replace(/\.(jpg|jpeg|png|webp|gif)$/i, '').toLowerCase() === imageName.toLowerCase()
      );
      console.log(`   ${imageName}: ${found ? `✅ ${found}` : '❌ NOT FOUND'}`);
    });

    console.log('\n\n🔄 ADDING MENU ITEMS:');
    console.log('='.repeat(80));

    // Helper to match images - flexible matching
    const matchImage = (itemData, imageFiles) => {
      const targetFileName = itemData.imageFileName.toLowerCase();
      
      // Try exact match with any extension
      for (const file of imageFiles) {
        const fileWithoutExt = file.replace(/\.(jpg|jpeg|png|webp|gif)$/i, '').toLowerCase();
        
        if (fileWithoutExt === targetFileName) {
          return file;
        }
      }

      // Try partial matches
      const keywords = targetFileName.split('-').filter(w => w.length > 2);
      
      for (const file of imageFiles) {
        const fileNameOnly = file.replace(/\.(jpg|jpeg|png|webp|gif)$/i, '').toLowerCase();
        
        const matchCount = keywords.filter(keyword => 
          fileNameOnly.includes(keyword)
        ).length;

        if (matchCount >= Math.min(2, keywords.length)) {
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
        restaurant: oceanBasket._id,
        name: itemData.name
      });

      if (existing) {
        console.log('   ⚠️  Already exists, skipping...');
        skippedCount++;
        continue;
      }

      // Create menu item
      const newItem = {
        restaurant: oceanBasket._id,
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
            folder: 'nice-now-deliveries/menu-items/ocean-basket',
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
        console.log(`   💡 Looking for: ${itemData.imageFileName}.jpg/png`);
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
    
    const allItems = await MenuItem.find({ restaurant: oceanBasket._id });
    console.log(`Ocean Basket now has ${allItems.length} menu items:\n`);
    
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
    console.log('✅ Ocean Basket menu items added!');
    console.log('\n💡 Expected image files in: backend/uploads/menu-items/');
    console.log('   - calamari-meal.jpg (or .png)');
    console.log('   - fish-calamari-combo.jpg (or .png)');
    console.log('   - fried-prawns.jpg (or .png)');
    console.log('   - grilled-salmon.jpg (or .png)');
    console.log('   - hake-and-chip.jpg (or .png)');
    console.log('   - lobster-tail.jpg (or .png)');
    console.log('   - seafood-platter-for-2.jpg (or .png)');
    console.log('   - seafood-curry.jpg (or .png)');
    console.log('   - sushi-platter.jpg (or .png)');
    console.log('   - fish-wrap.jpg (or .png)');
    console.log('\n✅ Menu appears in the app immediately!');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

addOceanBasketMenu();