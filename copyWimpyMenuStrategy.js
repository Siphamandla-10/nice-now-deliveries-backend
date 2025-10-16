// copyWimpyMenuStrategy.js - Analyze Wimpy's menu structure and apply to Bossa and Koekies
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const Restaurant = require('./models/Restaurant');
const MenuItem = require('./models/MenuItem');

async function analyzeMenuStrategy() {
  try {
    const mongoURI = process.env.MONGODB_URI || process.env.MONGO_URI;
    
    console.log('🍽️  ANALYZING WIMPY\'S MENU STRATEGY');
    console.log('='.repeat(80));
    
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(mongoURI);
    console.log('✅ Connected\n');

    // Get restaurants
    const wimpy = await Restaurant.findOne({ name: /Wimpy/i });
    const bossa = await Restaurant.findOne({ name: 'Bossa' });
    const koekies = await Restaurant.findOne({ name: /Koekies/i });

    if (!wimpy) {
      console.log('❌ Wimpy not found!');
      return;
    }

    if (!bossa) {
      console.log('❌ Bossa not found!');
      return;
    }

    if (!koekies) {
      console.log('❌ Koekies not found!');
      return;
    }

    // Get menu items for each restaurant
    const wimpyMenu = await MenuItem.find({ restaurant: wimpy._id }).limit(5);
    const bossaMenu = await MenuItem.find({ restaurant: bossa._id });
    const koekiesMenu = await MenuItem.find({ restaurant: koekies._id });

    console.log('📊 RESTAURANT IDS:');
    console.log('='.repeat(80));
    console.log(`Wimpy ID: ${wimpy._id}`);
    console.log(`Bossa ID: ${bossa._id}`);
    console.log(`Koekies ID: ${koekies._id}`);

    console.log('\n\n📊 MENU ITEM COUNTS:');
    console.log('='.repeat(80));
    console.log(`Wimpy: ${wimpyMenu.length > 0 ? wimpyMenu.length + '+ items' : '0 items'}`);
    console.log(`Bossa: ${bossaMenu.length} items`);
    console.log(`Koekies: ${koekiesMenu.length} items`);

    if (wimpyMenu.length > 0) {
      console.log('\n\n📋 WIMPY\'S MENU STRUCTURE (Sample Items):');
      console.log('='.repeat(80));
      
      wimpyMenu.forEach((item, index) => {
        console.log(`\n${index + 1}. ${item.name}`);
        console.log(`   Restaurant field: ${item.restaurant}`);
        console.log(`   Restaurant type: ${typeof item.restaurant}`);
        console.log(`   Category: ${item.category || 'N/A'}`);
        console.log(`   Price: R${item.price}`);
        console.log(`   Available: ${item.isAvailable ? '✅' : '❌'}`);
        console.log(`   Image: ${item.image ? '✅' : '❌'}`);
        if (item.image) {
          console.log(`   Image URL: ${item.image}`);
        }
        console.log(`   Created: ${item.createdAt}`);
      });
    } else {
      console.log('\n❌ Wimpy has NO menu items!');
      console.log('Let\'s check another working restaurant...');
      
      // Try KFC instead
      const kfc = await Restaurant.findOne({ name: 'KFC', isActive: true });
      if (kfc) {
        const kfcMenu = await MenuItem.find({ restaurant: kfc._id }).limit(5);
        console.log(`\nKFC ID: ${kfc._id}`);
        console.log(`KFC Menu Items: ${kfcMenu.length}`);
        
        if (kfcMenu.length > 0) {
          console.log('\n\n📋 KFC\'S MENU STRUCTURE (Sample Items):');
          console.log('='.repeat(80));
          
          kfcMenu.forEach((item, index) => {
            console.log(`\n${index + 1}. ${item.name}`);
            console.log(`   Restaurant field: ${item.restaurant}`);
            console.log(`   Restaurant type: ${typeof item.restaurant}`);
            console.log(`   Category: ${item.category || 'N/A'}`);
            console.log(`   Price: R${item.price}`);
            console.log(`   Available: ${item.isAvailable ? '✅' : '❌'}`);
            console.log(`   Image: ${item.image ? '✅' : '❌'}`);
            if (item.image) {
              console.log(`   Image URL: ${item.image}`);
            }
          });
        }
      }
    }

    if (bossaMenu.length > 0) {
      console.log('\n\n📋 BOSSA\'S CURRENT MENU:');
      console.log('='.repeat(80));
      console.log(`Found ${bossaMenu.length} items`);
      
      bossaMenu.slice(0, 3).forEach((item, index) => {
        console.log(`\n${index + 1}. ${item.name}`);
        console.log(`   Restaurant field: ${item.restaurant}`);
        console.log(`   Category: ${item.category || 'N/A'}`);
        console.log(`   Price: R${item.price}`);
        console.log(`   Available: ${item.isAvailable ? '✅' : '❌'}`);
      });

      // Check if Bossa's menu items are pointing to the correct restaurant ID
      const wrongRestaurantItems = bossaMenu.filter(item => 
        item.restaurant.toString() !== bossa._id.toString()
      );

      if (wrongRestaurantItems.length > 0) {
        console.log(`\n⚠️  WARNING: ${wrongRestaurantItems.length} menu items have WRONG restaurant ID!`);
        console.log(`   Expected: ${bossa._id}`);
        console.log(`   Found: ${wrongRestaurantItems[0].restaurant}`);
        console.log('\n💡 We need to fix the restaurant field on these items!');
      } else {
        console.log('\n✅ All Bossa menu items have correct restaurant ID');
      }
    } else {
      console.log('\n\n❌ BOSSA HAS NO MENU ITEMS!');
      console.log('   This is why the menu appears empty in the app.');
    }

    if (koekiesMenu.length > 0) {
      console.log('\n\n📋 KOEKIES\' CURRENT MENU:');
      console.log('='.repeat(80));
      console.log(`Found ${koekiesMenu.length} items`);
      
      koekiesMenu.slice(0, 3).forEach((item, index) => {
        console.log(`\n${index + 1}. ${item.name}`);
        console.log(`   Restaurant field: ${item.restaurant}`);
        console.log(`   Category: ${item.category || 'N/A'}`);
        console.log(`   Price: R${item.price}`);
        console.log(`   Available: ${item.isAvailable ? '✅' : '❌'}`);
      });
    } else {
      console.log('\n\n❌ KOEKIES HAS NO MENU ITEMS!');
      console.log('   This is why the menu appears empty in the app.');
    }

    console.log('\n\n🔍 DIAGNOSIS:');
    console.log('='.repeat(80));
    
    if (bossaMenu.length === 0) {
      console.log('❌ Bossa has 0 menu items in the database');
      console.log('💡 Solution: Add menu items to the MenuItem collection with restaurant: ' + bossa._id);
    } else {
      const wrongItems = bossaMenu.filter(item => 
        item.restaurant.toString() !== bossa._id.toString()
      );
      
      if (wrongItems.length > 0) {
        console.log(`❌ Bossa has ${wrongItems.length} menu items pointing to WRONG restaurant ID`);
        console.log('💡 Solution: Update the restaurant field on these items');
      } else {
        console.log('✅ Bossa menu items are correctly linked');
      }
    }

    if (koekiesMenu.length === 0) {
      console.log('\n❌ Koekies has 0 menu items in the database');
      console.log('💡 Solution: Add menu items to the MenuItem collection with restaurant: ' + koekies._id);
    }

    console.log('\n\n💡 RECOMMENDED ACTIONS:');
    console.log('='.repeat(80));
    
    if (bossaMenu.length === 0) {
      console.log('1. For Bossa:');
      console.log('   - Create menu items in the vendor dashboard at: http://192.168.1.150:5000');
      console.log('   - OR use a script to bulk import menu items');
      console.log(`   - All items MUST have restaurant: "${bossa._id}"`);
    }
    
    if (koekiesMenu.length === 0) {
      console.log('\n2. For Koekies:');
      console.log('   - Create menu items in the vendor dashboard');
      console.log('   - OR use a script to bulk import menu items');
      console.log(`   - All items MUST have restaurant: "${koekies._id}"`);
    }

    // Check for orphaned menu items
    console.log('\n\n🔍 CHECKING FOR ORPHANED MENU ITEMS:');
    console.log('='.repeat(80));
    
    const allMenuItems = await MenuItem.find({}).limit(10);
    console.log(`Total menu items in database: ${await MenuItem.countDocuments()}`);
    
    if (allMenuItems.length > 0) {
      console.log('\nSample menu items with restaurant IDs:');
      allMenuItems.forEach((item, index) => {
        console.log(`${index + 1}. ${item.name} -> Restaurant: ${item.restaurant}`);
      });
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

analyzeMenuStrategy();