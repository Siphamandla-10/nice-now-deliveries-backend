// findAndFixBossaMenuItems.js - Find and fix Bossa's menu items
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const Restaurant = require('./models/Restaurant');
const MenuItem = require('./models/MenuItem');

async function findAndFixMenuItems() {
  try {
    const mongoURI = process.env.MONGODB_URI || process.env.MONGO_URI;
    
    console.log('🔍 FINDING BOSSA\'S LOST MENU ITEMS');
    console.log('='.repeat(80));
    
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(mongoURI);
    console.log('✅ Connected\n');

    // Get current Bossa (the one the app uses)
    const currentBossa = await Restaurant.findOne({ name: 'Bossa' });
    
    console.log('📊 CURRENT BOSSA:');
    console.log(`   ID: ${currentBossa._id}`);
    console.log(`   Owner: ${currentBossa.owner}`);
    console.log(`   Created: ${currentBossa.createdAt}`);

    // Search for menu items that might belong to Bossa
    console.log('\n\n🔍 SEARCHING FOR BOSSA MENU ITEMS...');
    console.log('='.repeat(80));
    
    // Search by item names we know exist (from the earlier checkBossaStatus output)
    const bossaItemNames = [
      'Meerendal Pinotage Rosé',
      'Meerendal Sauvignon Blanc',
      'Meerendal Shiraz',
      'Beef Curry'
    ];

    const foundItems = [];
    
    for (const itemName of bossaItemNames) {
      const items = await MenuItem.find({ name: new RegExp(itemName, 'i') });
      if (items.length > 0) {
        foundItems.push(...items);
        console.log(`\n✅ Found ${items.length} item(s) matching "${itemName}":`);
        items.forEach(item => {
          console.log(`   - ${item.name}`);
          console.log(`     ID: ${item._id}`);
          console.log(`     Restaurant: ${item.restaurant}`);
          console.log(`     Price: R${item.price}`);
        });
      }
    }

    if (foundItems.length === 0) {
      console.log('\n❌ No Bossa menu items found by name search!');
      console.log('   The menu items might have been deleted or never created.');
      console.log('\n💡 You need to create new menu items for Bossa.');
      return;
    }

    // Check if these items are pointing to a different restaurant ID
    console.log('\n\n🔍 CHECKING RESTAURANT IDs:');
    console.log('='.repeat(80));
    
    const wrongRestaurantId = foundItems[0].restaurant.toString();
    console.log(`Current Bossa ID: ${currentBossa._id}`);
    console.log(`Menu items point to: ${wrongRestaurantId}`);
    console.log(`Match: ${wrongRestaurantId === currentBossa._id.toString() ? '✅' : '❌'}`);

    if (wrongRestaurantId !== currentBossa._id.toString()) {
      console.log('\n⚠️  PROBLEM FOUND!');
      console.log(`   Menu items are linked to OLD Bossa: ${wrongRestaurantId}`);
      console.log(`   But app is loading NEW Bossa: ${currentBossa._id}`);
      
      // Check if the old restaurant still exists
      const oldBossa = await Restaurant.findById(wrongRestaurantId);
      if (oldBossa) {
        console.log(`\n   Old Bossa still exists: ${oldBossa.name}`);
      } else {
        console.log(`\n   Old Bossa was deleted!`);
      }

      console.log('\n🔧 FIXING: Updating menu items to point to current Bossa...');
      console.log('='.repeat(80));

      let updateCount = 0;
      for (const item of foundItems) {
        item.restaurant = currentBossa._id;
        await item.save();
        updateCount++;
        console.log(`✅ Updated: ${item.name}`);
      }

      console.log(`\n✅ Updated ${updateCount} menu items!`);

      // Verify
      console.log('\n\n✅ VERIFICATION:');
      console.log('='.repeat(80));
      const verifyItems = await MenuItem.find({ restaurant: currentBossa._id });
      console.log(`Bossa now has ${verifyItems.length} menu items`);
      
      if (verifyItems.length > 0) {
        console.log('\nMenu items:');
        verifyItems.forEach((item, index) => {
          console.log(`${index + 1}. ${item.name} - R${item.price}`);
        });
      }

    } else {
      console.log('\n✅ Menu items are already linked to the correct Bossa!');
      console.log('   The issue might be elsewhere.');
    }

    // Also check for Koekies
    console.log('\n\n🔍 CHECKING KOEKIES...');
    console.log('='.repeat(80));
    
    const koekies = await Restaurant.findOne({ name: /Koekies/i });
    if (koekies) {
      const koekiesItems = await MenuItem.find({ restaurant: koekies._id });
      console.log(`Koekies ID: ${koekies._id}`);
      console.log(`Koekies menu items: ${koekiesItems.length}`);
      
      if (koekiesItems.length === 0) {
        console.log('\n❌ Koekies has no menu items');
        console.log('💡 You need to create menu items for Koekies in the vendor dashboard');
      }
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

findAndFixMenuItems();