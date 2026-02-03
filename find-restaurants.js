const mongoose = require('mongoose');
require('dotenv').config();

const findRestaurants = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB\n');

    // Find all restaurants
    const allRestaurants = await mongoose.connection.db.collection('restaurants').find({}).toArray();
    
    console.log(`📊 Total restaurants found: ${allRestaurants.length}\n`);
    
    if (allRestaurants.length === 0) {
      console.log('❌ No restaurants found in database!');
    } else {
      console.log('🏪 All Restaurants:');
      allRestaurants.forEach((r, index) => {
        console.log(`\n${index + 1}. Restaurant:`);
        console.log(`   _id: ${r._id}`);
        console.log(`   name: ${r.name}`);
        console.log(`   owner: ${r.owner}`);
        console.log(`   isActive: ${r.isActive}`);
        console.log(`   status: ${r.status}`);
        console.log(`   email: ${r.contact?.email || 'N/A'}`);
      });
    }

    // Check for vendor's restaurant
    console.log('\n\n🔍 Checking for vendor restaurant...');
    const vendorRestaurant = await mongoose.connection.db.collection('restaurants').findOne(
      { owner: new mongoose.Types.ObjectId('68c867bd69a704433e2b56f3') }
    );
    
    if (vendorRestaurant) {
      console.log('✅ Found vendor restaurant:', vendorRestaurant.name);
    } else {
      console.log('❌ No restaurant found for vendor ID: 68c867bd69a704433e2b56f3');
      console.log('\n📝 Looking for restaurants with similar owner...');
      
      // Try to find by string
      const byString = await mongoose.connection.db.collection('restaurants').findOne(
        { owner: '68c867bd69a704433e2b56f3' }
      );
      
      if (byString) {
        console.log('⚠️ Found restaurant with owner as STRING (should be ObjectId)');
        console.log('   Restaurant name:', byString.name);
      }
    }

    await mongoose.connection.close();
  } catch (error) {
    console.error('Error:', error);
  }
};

findRestaurants();