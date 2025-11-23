// addCopperDeliMenu.js - Add menu items to Copper Deli
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

async function addCopperDeliMenu() {
  try {
    const mongoURI = process.env.MONGODB_URI || process.env.MONGO_URI;
    
    console.log('🍽️  ADDING COPPER DELI MENU ITEMS');
    console.log('='.repeat(80));
    
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(mongoURI);
    console.log('✅ Connected\n');

    // Find Copper Deli
    console.log('🔍 Finding Copper Deli restaurant...');
    const copperDeli = await Restaurant.findOne({ name: /Copper.*Deli/i });

    if (!copperDeli) {
      console.log('❌ Copper Deli restaurant not found!');
      await mongoose.disconnect();
      return;
    }

    console.log('✅ Found Copper Deli');
    console.log(`   ID: ${copperDeli._id}`);
    console.log(`   Name: ${copperDeli.name}\n`);

    // Menu items to add
    const menuItems = [
      {
        name: 'Chill Cheese Bacon',
        price: 135,
        imageName: 'chill-cheese-bacon',
        description: 'Delicious burger with cheese and bacon',
        category: 'Burgers'
      },
      {
        name: 'Philly Style',
        price: 110,
        imageName: 'Philly-Style',
        description: 'Classic Philly style sandwich',
        category: 'Sandwiches'
      }
    ];

    console.log('📋 Menu items to add:');
    menuItems.forEach(item => {
      console.log(`   - ${item.name} - R${item.price}`);
    });
    console.log('');

    // Process each menu item
    for (const itemData of menuItems) {
      console.log('\n' + '─'.repeat(80));
      console.log(`📝 Processing: ${itemData.name}`);
      console.log('─'.repeat(80));

      // Check if item already exists
      const existingItem = await MenuItem.findOne({
        restaurant: copperDeli._id,
        name: itemData.name
      });

      if (existingItem) {
        console.log(`⚠️  "${itemData.name}" already exists! Skipping...`);
        continue;
      }

      // Look for image file
      const possibleImagePaths = [
        path.join(__dirname, 'Uploads', 'menu-items', `${itemData.imageName}.jpg`),
        path.join(__dirname, 'Uploads', 'menu-items', `${itemData.imageName}.jpeg`),
        path.join(__dirname, 'Uploads', 'menu-items', `${itemData.imageName}.png`),
        path.join(__dirname, 'Uploads', 'menu-items', `${itemData.imageName}.webp`),
      ];

      let imagePath = null;
      for (const testPath of possibleImagePaths) {
        if (fs.existsSync(testPath)) {
          imagePath = testPath;
          break;
        }
      }

      let imageData = null;

      if (imagePath) {
        console.log(`✅ Found image: ${path.basename(imagePath)}`);
        const stats = fs.statSync(imagePath);
        console.log(`   Size: ${(stats.size / 1024).toFixed(2)} KB`);
        
        console.log('📤 Uploading to Cloudinary...');

        try {
          const uploadResult = await cloudinary.uploader.upload(imagePath, {
            folder: 'menu-items/copper-deli',
            public_id: `${itemData.imageName.toLowerCase()}-${Date.now()}`,
            transformation: [
              { width: 600, height: 600, crop: 'fill' },
              { quality: 'auto' },
              { fetch_format: 'auto' }
            ]
          });

          console.log('✅ Image uploaded to Cloudinary!');
          console.log(`   URL: ${uploadResult.secure_url}`);

          imageData = {
            url: uploadResult.secure_url,
            path: uploadResult.secure_url,
            filename: `${uploadResult.public_id}.${uploadResult.format}`,
            cloudinaryId: uploadResult.public_id,
            uploadedAt: new Date()
          };
        } catch (uploadError) {
          console.error('❌ Cloudinary upload failed:', uploadError.message);
        }
      } else {
        console.log(`⚠️  No image found for ${itemData.name}`);
        console.log('   Expected locations:');
        possibleImagePaths.forEach(p => console.log(`   - ${p}`));
        console.log('   📝 Creating menu item WITHOUT image (you can add it later)');
      }

      // Create menu item
      console.log('💾 Creating menu item in database...');

      const newMenuItem = new MenuItem({
        name: itemData.name,
        description: itemData.description,
        price: itemData.price,
        category: itemData.category,
        restaurant: copperDeli._id,
        image: imageData,
        available: true,
        preparationTime: 15
      });

      await newMenuItem.save();

      console.log(`✅ "${itemData.name}" added successfully!`);
      if (imageData) {
        console.log(`   📸 Image: ${imageData.url}`);
      }
    }

    // Show final menu
    console.log('\n\n' + '='.repeat(80));
    console.log('🎉 COPPER DELI MENU UPDATED!');
    console.log('='.repeat(80));

    const allItems = await MenuItem.find({ restaurant: copperDeli._id });
    
    console.log(`\n📋 Complete Menu (${allItems.length} items):\n`);
    
    allItems.forEach((item, index) => {
      console.log(`${index + 1}. ${item.name} - R${item.price.toFixed(2)}`);
      if (item.image?.url) {
        console.log(`   📸 ${item.image.url}`);
      } else {
        console.log(`   ⚠️  No image`);
      }
      console.log('');
    });

    console.log('='.repeat(80));
    console.log('✅ Menu items are now available in the app!');
    console.log('🍽️  Users can now order from Copper Deli!');
    console.log('='.repeat(80));

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

addCopperDeliMenu();