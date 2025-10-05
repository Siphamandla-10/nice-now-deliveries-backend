// migrate-to-cloudinary.js
require('dotenv').config();
const mongoose = require('mongoose');
const cloudinary = require('cloudinary').v2;
const path = require('path');
const fs = require('fs');

const MONGO_URI = process.env.MONGO_URI;

// Old IPs that might be in your database
const OLD_IPS = [
  '192.168.1.114',
  '192.168.0.126',
  '192.168.0.26',
  '192.168.1.116'
];

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

async function migrateImages() {
  try {
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    const db = mongoose.connection.db;

    // Verify Cloudinary configuration
    console.log('☁️  Verifying Cloudinary configuration...');
    console.log('   Cloud Name:', process.env.CLOUDINARY_CLOUD_NAME);
    console.log('   API Key:', process.env.CLOUDINARY_API_KEY ? 'Set ✓' : 'Not Set ✗');
    console.log('   API Secret:', process.env.CLOUDINARY_API_SECRET ? 'Set ✓' : 'Not Set ✗');
    console.log('✅ Configuration loaded successfully\n');

    // Migrate Menu Items
    console.log('📸 Starting Menu Item Image Migration...\n');
    const menuItems = await db.collection('menuitems').find({}).toArray();
    console.log(`Found ${menuItems.length} menu items\n`);
    
    let successCount = 0;
    let failCount = 0;
    let skippedCount = 0;

    for (const item of menuItems) {
      try {
        let imageUrl = null;
        let localImagePath = null;

        // Check different possible image field structures
        if (item.image && item.image.url) {
          imageUrl = item.image.url;
        } else if (item.images && item.images.mainImage && item.images.mainImage.url) {
          imageUrl = item.images.mainImage.url;
        } else if (item.mainImageUrl) {
          imageUrl = item.mainImageUrl;
        }

        if (!imageUrl) {
          console.log(`⏭️  Skipping "${item.name}" - No image found`);
          skippedCount++;
          continue;
        }

        // Check if already on Cloudinary
        if (imageUrl.includes('cloudinary.com')) {
          console.log(`✓ "${item.name}" - Already on Cloudinary`);
          skippedCount++;
          continue;
        }

        // Check if it's a local IP-based URL
        const hasOldIP = OLD_IPS.some(ip => imageUrl.includes(ip));
        if (!hasOldIP && !imageUrl.includes('/uploads/')) {
          console.log(`⏭️  Skipping "${item.name}" - Not a local image`);
          skippedCount++;
          continue;
        }

        // Extract local file path
        if (imageUrl.includes('/uploads/')) {
          const urlPath = imageUrl.split('/uploads/')[1];
          localImagePath = path.join(__dirname, 'uploads', urlPath);
        }

        if (!localImagePath || !fs.existsSync(localImagePath)) {
          console.log(`❌ "${item.name}" - Local file not found: ${localImagePath || 'unknown'}`);
          failCount++;
          continue;
        }

        // Upload to Cloudinary
        console.log(`⬆️  Uploading "${item.name}"...`);
        const result = await cloudinary.uploader.upload(localImagePath, {
          folder: 'nice-now-deliveries/menu-items',
          public_id: `menu-${item._id}`,
          transformation: [
            { width: 800, height: 800, crop: 'limit' },
            { quality: 'auto' }
          ]
        });

        // Update database with new Cloudinary URL
        await db.collection('menuitems').updateOne(
          { _id: item._id },
          {
            $set: {
              'image.url': result.secure_url,
              'image.cloudinaryId': result.public_id,
              'images.mainImage.url': result.secure_url,
              'images.mainImage.cloudinaryId': result.public_id,
              'mainImageUrl': result.secure_url,
              'cloudinaryId': result.public_id,
              'updatedAt': new Date()
            }
          }
        );

        console.log(`✅ "${item.name}" - Migrated successfully`);
        console.log(`   📍 URL: ${result.secure_url}\n`);
        successCount++;

      } catch (error) {
        console.error(`❌ Error migrating "${item.name}":`, error.message);
        failCount++;
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('📊 MENU ITEMS MIGRATION SUMMARY');
    console.log('='.repeat(60));
    console.log(`✅ Successfully migrated: ${successCount}`);
    console.log(`⏭️  Skipped (already done/no image): ${skippedCount}`);
    console.log(`❌ Failed: ${failCount}`);
    console.log(`📝 Total processed: ${menuItems.length}`);
    console.log('='.repeat(60) + '\n');

    // Migrate Restaurant Logos
    console.log('🏪 Starting Restaurant Logo Migration...\n');
    const restaurants = await db.collection('restaurants').find({}).toArray();
    console.log(`Found ${restaurants.length} restaurants\n`);
    
    let restSuccessCount = 0;
    let restFailCount = 0;
    let restSkippedCount = 0;

    for (const restaurant of restaurants) {
      try {
        let logoUrl = restaurant.logo || restaurant.logoUrl;

        if (!logoUrl) {
          console.log(`⏭️  Skipping "${restaurant.name}" - No logo found`);
          restSkippedCount++;
          continue;
        }

        if (logoUrl.includes('cloudinary.com')) {
          console.log(`✓ "${restaurant.name}" - Already on Cloudinary`);
          restSkippedCount++;
          continue;
        }

        // Check if it's a local IP-based URL
        const hasOldIP = OLD_IPS.some(ip => logoUrl.includes(ip));
        if (!hasOldIP && !logoUrl.includes('/uploads/')) {
          console.log(`⏭️  Skipping "${restaurant.name}" - Not a local image`);
          restSkippedCount++;
          continue;
        }

        // Extract local file path
        let localLogoPath = null;
        if (logoUrl.includes('/uploads/')) {
          const urlPath = logoUrl.split('/uploads/')[1];
          localLogoPath = path.join(__dirname, 'uploads', urlPath);
        }

        if (!localLogoPath || !fs.existsSync(localLogoPath)) {
          console.log(`❌ "${restaurant.name}" - Local file not found`);
          restFailCount++;
          continue;
        }

        // Upload to Cloudinary
        console.log(`⬆️  Uploading "${restaurant.name}" logo...`);
        const result = await cloudinary.uploader.upload(localLogoPath, {
          folder: 'nice-now-deliveries/restaurants',
          public_id: `restaurant-${restaurant._id}`,
          transformation: [
            { width: 500, height: 500, crop: 'limit' },
            { quality: 'auto' }
          ]
        });

        // Update database
        await db.collection('restaurants').updateOne(
          { _id: restaurant._id },
          {
            $set: {
              logo: result.secure_url,
              logoUrl: result.secure_url,
              cloudinaryId: result.public_id,
              updatedAt: new Date()
            }
          }
        );

        console.log(`✅ "${restaurant.name}" - Logo migrated successfully`);
        console.log(`   📍 URL: ${result.secure_url}\n`);
        restSuccessCount++;

      } catch (error) {
        console.error(`❌ Error migrating "${restaurant.name}":`, error.message);
        restFailCount++;
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('📊 RESTAURANT LOGOS MIGRATION SUMMARY');
    console.log('='.repeat(60));
    console.log(`✅ Successfully migrated: ${restSuccessCount}`);
    console.log(`⏭️  Skipped (already done/no logo): ${restSkippedCount}`);
    console.log(`❌ Failed: ${restFailCount}`);
    console.log(`📝 Total processed: ${restaurants.length}`);
    console.log('='.repeat(60) + '\n');

    // Final Summary
    console.log('\n' + '='.repeat(60));
    console.log('🎉 MIGRATION COMPLETED!');
    console.log('='.repeat(60));
    console.log(`Total images migrated: ${successCount + restSuccessCount}`);
    console.log(`Total skipped: ${skippedCount + restSkippedCount}`);
    console.log(`Total failed: ${failCount + restFailCount}`);
    console.log('='.repeat(60));
    
    if (successCount + restSuccessCount > 0) {
      console.log('\n✨ Your images are now on Cloudinary!');
      console.log('💡 You can view them at: https://cloudinary.com/console');
      console.log('💡 You can now safely delete local images from /uploads folder');
    }

    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
    console.log('✅ Migration process complete!\n');

  } catch (error) {
    console.error('\n❌ Migration Error:', error);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

// Run migration
console.log('\n' + '='.repeat(60));
console.log('🚀 CLOUDINARY MIGRATION TOOL');
console.log('='.repeat(60));
console.log('This will migrate your local images to Cloudinary\n');

migrateImages();