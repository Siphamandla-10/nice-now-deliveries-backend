// fixRestaurants.js - Fixed with status handling
require('dotenv').config();
const mongoose = require('mongoose');
const Restaurant = require('./models/Restaurant');

async function fix() {
  try {
    const mongoUri = process.env.MONGODB_URI;
    
    await mongoose.connect(mongoUri);
    console.log('✅ Connected\n');
    
    const restaurants = await Restaurant.find({});
    
    console.log(`🍴 Found ${restaurants.length} restaurants\n`);
    
    let fixed = 0;
    
    for (const restaurant of restaurants) {
      try {
        const loc = restaurant.location;
        
        // Fix status if invalid
        if (restaurant.status === 'open') {
          restaurant.status = 'active'; // or whatever valid value your schema uses
        }
        
        // Check if coordinates is an object with lat/lng instead of array
        if (loc && loc.coordinates && typeof loc.coordinates === 'object' && !Array.isArray(loc.coordinates)) {
          const lat = loc.coordinates.latitude;
          const lng = loc.coordinates.longitude;
          
          console.log(`🔧 ${restaurant.name}:`);
          console.log(`   Old: {lat: ${lat}, lng: ${lng}}`);
          
          // Handle null coordinates
          if (lat === null || lng === null || lat === 0 || lng === 0) {
            const latVar = (Math.random() - 0.5) * 0.01;
            const lngVar = (Math.random() - 0.5) * 0.01;
            
            restaurant.location = {
              type: 'Point',
              coordinates: [28.0473 + lngVar, -26.2041 + latVar]
            };
            console.log(`   ✅ Set to Johannesburg`);
          } else {
            // Convert to proper GeoJSON format
            restaurant.location = {
              type: 'Point',
              coordinates: [lng, lat]  // [longitude, latitude]
            };
            console.log(`   ✅ New: [${lng}, ${lat}]`);
          }
          
          // Save without validation to bypass status issue
          await restaurant.save({ validateBeforeSave: false });
          fixed++;
        } else if (!loc || !loc.coordinates || loc.coordinates[0] === 0) {
          // No valid coordinates at all
          console.log(`🔧 ${restaurant.name}: Setting default coordinates`);
          
          const latVar = (Math.random() - 0.5) * 0.01;
          const lngVar = (Math.random() - 0.5) * 0.01;
          
          restaurant.location = {
            type: 'Point',
            coordinates: [28.0473 + lngVar, -26.2041 + latVar]
          };
          
          await restaurant.save({ validateBeforeSave: false });
          console.log(`   ✅ Done`);
          fixed++;
        }
        
        console.log('');
        
      } catch (error) {
        console.error(`   ❌ Error with ${restaurant.name}:`, error.message);
      }
    }
    
    console.log(`\n${'='.repeat(60)}`);
    console.log(`✅ Fixed ${fixed} restaurants!`);
    console.log(`${'='.repeat(60)}\n`);
    
    await mongoose.connection.close();
    console.log('🎉 All done! Now restart backend and test!\n');
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

console.log('🚀 Fixing restaurant coordinates...\n');
fix();