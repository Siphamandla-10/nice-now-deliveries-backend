// fixAllMcDonaldsMenu.js - Fix all McDonald's menu items with correct images
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

async function fixAllMcDonaldsMenu() {
  try {
    const mongoURI = process.env.MONGODB_URI || process.env.MONGO_URI;
    
    console.log('🔧 FIXING ALL MCDONALDS MENU IMAGES');
    console.log('='.repeat(80));
    
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(mongoURI);
    console.log('✅ Connected\n');

    // Find McDonald's
    const mcdonalds = await Restaurant.findOne({ name: /McDonald/i });

    if (!mcdonalds) {
      console.log('❌ McDonald\'s not found!');
      return;
    }

    console.log('📊 MCDONALDS RESTAURANT:');
    console.log(`   ID: ${mcdonalds._id}`);
    console.log(`   Name: ${mcdonalds.name}\n`);

    // Get all menu items
    const menuItems = await MenuItem.find({ restaurant: mcdonalds._id });
    console.log(`📋 Total menu items: ${menuItems.length}\n`);

    // Get available image files
    const menuImagesPath = path.join(__dirname, 'uploads', 'menu-items');
    
    if (!fs.existsSync(menuImagesPath)) {
      console.log('❌ Menu images folder not found!');
      console.log(`   Expected: ${menuImagesPath}`);
      return;
    }

    const files = fs.readdirSync(menuImagesPath);
    const imageFiles = files.filter(file => 
      /\.(jpg|jpeg|png|webp|gif)$/i.test(file)
    );

    console.log('📂 AVAILABLE IMAGE FILES:');
    console.log(`   Path: ${menuImagesPath}`);
    console.log(`   Found ${imageFiles.length} total images\n`);

    // Show McDonald's related images
    const mcdonaldsImages = imageFiles.filter(f => {
      const lower = f.toLowerCase();
      return (
        lower.includes('big mac') ||
        lower.includes('mcchicken') ||
        lower.includes('quarter pounder') ||
        lower.includes('cheeseburger') ||
        lower.includes('mcroyale') ||
        lower.includes('happy meal') ||
        lower.includes('chicken nuggets') ||
        lower.includes('mcflurry') ||
        lower.includes('egg mcmuffin') ||
        lower.includes('mccafe') ||
        lower.includes('cappuccino') ||
        lower.includes('spicy') ||
        lower.includes('grand chicken')
      );
    });

    console.log(`🔍 McDonald's-related images found (${mcdonaldsImages.length}):`);
    mcdonaldsImages.forEach((file, i) => {
      console.log(`   ${i + 1}. ${file}`);
    });

    // Enhanced image matching logic for McDonald's items
    const matchImage = (itemName, imageFiles) => {
      // Normalize item name for matching
      const normalized = itemName
        .toLowerCase()
        .replace(/[&\(\)]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      // Special mappings for McDonald's items
      const specialMatches = {
        'big mac meal': ['big mac', 'bigmac'],
        'mcchicken meal': ['mcchicken', 'mc chicken'],
        'quarter pounder w/cheese': ['quarter pounder', 'quarterpounder'],
        'double cheeseburger': ['double cheeseburger', 'cheeseburger'],
        'mcroyale meal': ['mcroyale', 'mc royale'],
        'happy meal': ['happy meal', 'happymeal'],
        'chicken nuggets': ['chicken nuggets'],
        'spicy mcchicken deluxe': ['spicy mcchicken', 'mcchicken spicy'],
        'mcflurry': ['mcflurry'],
        'egg mcmuffin': ['egg mcmuffin', 'mcmuffin'],
        'mccafe cappuccino': ['mccafe cappuccino', 'cappuccino'],
        'grand chicken special': ['grand chicken']
      };

      // Try exact match first
      for (const file of imageFiles) {
        const fileNameOnly = file.replace(/\.(jpg|jpeg|png|webp|gif)$/i, '').toLowerCase();
        
        if (fileNameOnly === normalized.replace(/\s/g, '-') || 
            fileNameOnly === normalized.replace(/\s/g, ' ')) {
          return file;
        }
      }

      // Try special matches
      const itemLower = itemName.toLowerCase();
      
      for (const [pattern, matches] of Object.entries(specialMatches)) {
        if (itemLower.includes(pattern) || pattern.includes(itemLower)) {
          for (const match of matches) {
            const found = imageFiles.find(f => {
              const fn = f.replace(/\.(jpg|jpeg|png|webp|gif)$/i, '').toLowerCase();
              return fn.includes(match.toLowerCase()) || match.toLowerCase().includes(fn);
            });
            if (found) return found;
          }
        }
      }

      // Try keyword matching
      const keywords = itemName.toLowerCase()
        .replace(/[&\(\)]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 2 && w !== 'meal' && w !== 'with');
      
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

    console.log('\n\n🔄 PROCESSING ALL ITEMS:');
    console.log('='.repeat(80));

    let updatedCount = 0;
    let skippedCount = 0;
    let unchangedCount = 0;

    for (const item of menuItems) {
      console.log(`\n📦 ${item.name} (R${item.price.toFixed(2)})`);
      console.log(`   ID: ${item._id}`);
      console.log(`   Current image: ${item.image?.filename || 'None'}`);

      const matchedFile = matchImage(item.name, imageFiles);

      if (!matchedFile) {
        console.log('   ⚠️  No matching image found');
        skippedCount++;
        continue;
      }

      // Check if already using correct image
      if (item.image?.filename === matchedFile) {
        console.log(`   ✅ Already using correct image: ${matchedFile}`);
        unchangedCount++;
        continue;
      }

      console.log(`   🔄 Will update to: ${matchedFile}`);

      const filePath = path.join(menuImagesPath, matchedFile);

      try {
        console.log('   📤 Uploading to Cloudinary...');

        const result = await cloudinary.uploader.upload(filePath, {
          folder: 'nice-now-deliveries/menu-items/mcdonalds',
          public_id: `${item.name.toLowerCase().replace(/[^\w]/g, '-')}-${Date.now()}`,
          overwrite: true,
          invalidate: true,
          transformation: [
            { width: 500, height: 500, crop: 'fit' },
            { quality: 'auto:good' }
          ]
        });

        console.log('   ✅ Image uploaded!');

        // Update the menu item
        item.image = {
          filename: matchedFile,
          path: result.secure_url,
          url: result.secure_url,
          uploadedAt: new Date(),
          cloudinaryId: result.public_id
        };

        await item.save();
        console.log('   ✅ Database updated!');
        updatedCount++;

      } catch (uploadError) {
        console.log('   ❌ Upload failed:', uploadError.message);
        skippedCount++;
      }
    }

    console.log('\n\n✅ SUMMARY:');
    console.log('='.repeat(80));
    console.log(`Total items: ${menuItems.length}`);
    console.log(`✅ Updated with new images: ${updatedCount}`);
    console.log(`➡️  Already correct: ${unchangedCount}`);
    console.log(`❌ Skipped (no match/failed): ${skippedCount}`);

    // Final verification
    console.log('\n\n🔍 FINAL VERIFICATION:');
    console.log('='.repeat(80));

    const finalItems = await MenuItem.find({ restaurant: mcdonalds._id });
    
    console.log(`\nMcDonald's menu (${finalItems.length} items):\n`);
    
    finalItems.forEach((item, index) => {
      console.log(`${index + 1}. ${item.name} - R${item.price.toFixed(2)}`);
      console.log(`   Image: ${item.image?.filename || 'NO IMAGE'}`);
      console.log(`   Has valid URL: ${item.image?.url ? '✅' : '❌'}`);
      console.log('');
    });

    console.log('\n🎉 DONE!');
    console.log('='.repeat(80));
    console.log('✅ McDonald\'s menu images updated!');
    
    console.log('\n💡 Next steps:');
    console.log('   1. Restart your backend server');
    console.log('   2. Clear app cache');
    console.log('   3. Refresh the app to see all corrected images');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

fixAllMcDonaldsMenu();