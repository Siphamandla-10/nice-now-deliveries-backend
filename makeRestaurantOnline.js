// makeRestaurantOnline.js - Make a restaurant online/active
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const Restaurant = require('./models/Restaurant');

async function makeRestaurantOnline() {
  try {
    const mongoURI = process.env.MONGODB_URI || process.env.MONGO_URI;
    
    console.log('🔥 MAKING RESTAURANT ONLINE');
    console.log('='.repeat(80));
    
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(mongoURI);
    console.log('✅ Connected\n');

    // Find Copper Deli
    const copperDeli = await Restaurant.findOne({ 
      name: /Copper.*Deli/i 
    });

    if (!copperDeli) {
      console.log('❌ Copper Deli not found!');
      console.log('\n📋 Available restaurants:');
      const allRestaurants = await Restaurant.find({}, 'name isActive status');
      allRestaurants.forEach(r => {
        console.log(`   - ${r.name} (Active: ${r.isActive}, Status: ${r.status})`);
      });
      return;
    }

    console.log('📊 CURRENT STATUS:');
    console.log('='.repeat(80));
    console.log(`Restaurant: ${copperDeli.name}`);
    console.log(`ID: ${copperDeli._id}`);
    console.log(`\nCurrent Status:`);
    console.log(`   isActive: ${copperDeli.isActive}`);
    console.log(`   status: ${copperDeli.status}`);

    console.log('\n\n🔄 Setting restaurant to ONLINE...');
    
    // Update to make it online
    copperDeli.isActive = true;
    copperDeli.status = 'active';
    
    await copperDeli.save();
    
    console.log('✅ Restaurant updated successfully!');

    // Verification
    console.log('\n\n✅ VERIFICATION:');
    console.log('='.repeat(80));
    
    const updated = await Restaurant.findById(copperDeli._id);
    
    console.log(`Restaurant: ${updated.name}`);
    console.log(`\nNew Status:`);
    console.log(`   isActive: ${updated.isActive} ✅`);
    console.log(`   status: ${updated.status} ✅`);

    console.log('\n\n🎉 DONE!');
    console.log('='.repeat(80));
    console.log(`✅ ${updated.name} is now ONLINE!`);
    console.log('💡 The restaurant will appear in the app immediately!');
    console.log('🍽️  Users can now see and order from this restaurant!');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

makeRestaurantOnline();