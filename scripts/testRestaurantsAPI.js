// backend/scripts/testRestaurantsAPI.js
// Test the Uber Eats style API

const axios = require('axios');

// Use the network IP from your server output
const API_BASE = 'http://192.168.1.150:5000/api/restaurants';
// Alternative: const API_BASE = 'http://127.0.0.1:5000/api/restaurants';

// Test location: Johannesburg CBD
const TEST_LOCATION = {
  lat: -26.2041,
  lng: 28.0473
};

async function testAPI() {
  console.log('🧪 Testing Restaurants API (Uber Eats Style)\n');
  console.log('═══════════════════════════════════════════\n');

  try {
    console.log(`📍 Test Location: [${TEST_LOCATION.lat}, ${TEST_LOCATION.lng}]`);
    console.log(`📍 Radius: 10km`);
    console.log(`📍 Expand Locations: true\n`);

    console.log('🔄 Making API request...\n');

    const response = await axios.get(API_BASE, {
      params: {
        lat: TEST_LOCATION.lat,
        lng: TEST_LOCATION.lng,
        radius: 10,
        expandLocations: 'true'
      }
    });

    const { restaurants, total, userLocation } = response.data;

    console.log('✅ SUCCESS!\n');
    console.log('═══════════════════════════════════════════\n');
    console.log(`📊 Found ${total} restaurant locations nearby\n`);

    if (restaurants.length === 0) {
      console.log('❌ No restaurants found. Try increasing the radius.\n');
      return;
    }

    // Group restaurants by base name
    const grouped = {};
    restaurants.forEach(r => {
      const baseName = r.baseName || r.name;
      if (!grouped[baseName]) {
        grouped[baseName] = [];
      }
      grouped[baseName].push(r);
    });

    console.log('🍽️  RESTAURANTS NEAR YOU:\n');
    console.log('───────────────────────────────────────────\n');

    Object.keys(grouped).forEach((baseName, index) => {
      const locations = grouped[baseName];
      
      console.log(`${index + 1}. ${baseName.toUpperCase()} (${locations.length} location${locations.length > 1 ? 's' : ''} found)`);
      
      locations.forEach((location, locIndex) => {
        console.log(`\n   📍 Location ${locIndex + 1}:`);
        console.log(`      Name: ${location.displayName}`);
        console.log(`      Distance: ${location.distance ? location.distance + ' km' : 'Unknown'}`);
        console.log(`      Address: ${location.address?.full || 'Address not available'}`);
        
        if (location.address?.suburb) {
          console.log(`      Suburb: ${location.address.suburb}`);
        }
        if (location.address?.city) {
          console.log(`      City: ${location.address.city}`);
        }
        
        console.log(`      Coordinates: [${location.location?.coordinates?.latitude}, ${location.location?.coordinates?.longitude}]`);
        
        if (location.contact?.phone) {
          console.log(`      Phone: ${location.contact.phone}`);
        }
        if (location.openingHours) {
          console.log(`      Hours: ${location.openingHours}`);
        }
        
        console.log(`      Delivery Fee: R${location.deliveryFee || 0}`);
        console.log(`      Estimated Time: ${location.estimatedDeliveryTime || 'N/A'}`);
        console.log(`      Rating: ⭐ ${location.rating || 'N/A'}/5`);
        console.log(`      OSM ID: ${location.osmId}`);
      });
      
      console.log('\n───────────────────────────────────────────\n');
    });

    console.log('📈 SUMMARY:\n');
    console.log(`   Total unique restaurants: ${Object.keys(grouped).length}`);
    console.log(`   Total locations: ${restaurants.length}`);
    console.log(`   Average locations per restaurant: ${(restaurants.length / Object.keys(grouped).length).toFixed(1)}`);
    
    // Show closest restaurant
    const closest = restaurants
      .filter(r => r.distance !== null)
      .sort((a, b) => a.distance - b.distance)[0];
    
    if (closest) {
      console.log(`\n   🎯 Closest: ${closest.displayName} (${closest.distance} km)`);
    }

    // Show furthest restaurant
    const furthest = restaurants
      .filter(r => r.distance !== null)
      .sort((a, b) => b.distance - a.distance)[0];
    
    if (furthest) {
      console.log(`   🎯 Furthest: ${furthest.displayName} (${furthest.distance} km)`);
    }

  } catch (error) {
    console.error('❌ ERROR:', error.message);
    
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Message:', error.response.data?.message);
    } else if (error.code === 'ECONNREFUSED') {
      console.error('\n   ⚠️  Make sure your backend server is running!');
      console.error('   Run: npm start or node server.js\n');
    }
  }
}

// Test specific restaurant locations
async function testSpecificRestaurant(restaurantName) {
  console.log(`\n🔍 Testing specific restaurant: ${restaurantName}\n`);
  
  try {
    const response = await axios.get(`${API_BASE}/${restaurantName}/locations`, {
      params: {
        lat: TEST_LOCATION.lat,
        lng: TEST_LOCATION.lng,
        radius: 15
      }
    });

    const { locations, total } = response.data;
    
    console.log(`✅ Found ${total} ${restaurantName} locations:\n`);
    
    locations.forEach((loc, index) => {
      console.log(`${index + 1}. ${loc.name}`);
      console.log(`   📍 ${loc.address.full}`);
      console.log(`   📏 ${loc.distance} km away`);
      console.log(`   🕒 ${loc.openingHours || 'Hours not available'}\n`);
    });

  } catch (error) {
    console.error('❌ Error:', error.response?.data?.message || error.message);
  }
}

// Run tests
console.log('Starting in 2 seconds...\n');

setTimeout(async () => {
  await testAPI();
  
  // Uncomment to test specific restaurant
  // await testSpecificRestaurant('KFC');
  
  console.log('\n✅ Test complete!\n');
}, 2000);