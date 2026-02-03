// fixRestaurantsDirectly.js - Direct MongoDB update
require('dotenv').config();
const mongoose = require('mongoose');

async function fix() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected\n');
    
    const db = mongoose.connection.db;
    
    // Get all restaurants
    const restaurants = await db.collection('restaurants').find({}).toArray();
    
    console.log(`🍴 Found ${restaurants.length} restaurants\n`);
    
    let fixed = 0;
    
    for (const restaurant of restaurants) {
      const loc = restaurant.location;
      
      // Check if coordinates is an object (wrong format)
      if (loc && loc.coordinates && typeof loc.coordinates === 'object' && !Array.isArray(loc.coordinates)) {
        const lat = loc.coordinates.latitude;
        const lng = loc.coordinates.longitude;
        
        console.log(`🔧 Fixing ${restaurant.name}:`);
        console.log(`   Old: {lat: ${lat}, lng: ${lng}}`);
        
        let newCoords;
        if (lat === null || lng === null || lat === 0 || lng === 0) {
          // Set default Johannesburg coordinates
          const latVar = (Math.random() - 0.5) * 0.01;
          const lngVar = (Math.random() - 0.5) * 0.01;
          newCoords = [28.0473 + lngVar, -26.2041 + latVar];
          console.log(`   ✅ New: [${newCoords[0].toFixed(4)}, ${newCoords[1].toFixed(4)}] (Johannesburg)`);
        } else {
          // Convert to array format
          newCoords = [lng, lat];
          console.log(`   ✅ New: [${lng}, ${lat}]`);
        }
        
        // Direct update
        await db.collection('restaurants').updateOne(
          { _id: restaurant._id },
          { 
            $set: { 
              'location.type': 'Point',
              'location.coordinates': newCoords
            }
          }
        );
        
        fixed++;
      }
    }
    
    console.log(`\n${'='.repeat(60)}`);
    console.log(`✅ Fixed ${fixed} restaurants!`);
    console.log(`${'='.repeat(60)}\n`);
    
    // Verify one restaurant
    const kfc = await db.collection('restaurants').findOne({ name: 'KFC' });
    console.log('Verification - KFC location:');
    console.log(JSON.stringify(kfc.location, null, 2));
    
    await mongoose.connection.close();
    console.log('\n🎉 All done! Restart backend and test!\n');
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

console.log('🚀 Fixing restaurants directly...\n');
fix();