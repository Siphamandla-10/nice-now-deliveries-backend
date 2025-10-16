// testMenuEndpoint.js - Test what the menu API actually returns
const axios = require('axios');

async function testMenuEndpoint() {
  const API_BASE = 'http://192.168.1.150:5000/api';
  const BOSSA_ID = '68f0e08507e3dea12222927e';
  
  console.log('🧪 TESTING MENU API ENDPOINT');
  console.log('='.repeat(80));
  console.log(`API: ${API_BASE}`);
  console.log(`Bossa ID: ${BOSSA_ID}\n`);

  try {
    console.log('📡 Calling: GET /api/restaurants/{id}/menu');
    const response = await axios.get(`${API_BASE}/restaurants/${BOSSA_ID}/menu`);
    
    console.log(`\n✅ Status: ${response.status}`);
    console.log(`📊 Response data:`, JSON.stringify(response.data, null, 2));
    
    if (response.data.menuItems) {
      console.log(`\n✅ Menu items returned: ${response.data.menuItems.length}`);
      
      if (response.data.menuItems.length > 0) {
        console.log('\n📋 Sample items:');
        response.data.menuItems.slice(0, 3).forEach((item, index) => {
          console.log(`\n${index + 1}. ${item.name}`);
          console.log(`   Price: R${item.price}`);
          console.log(`   Category: ${item.category}`);
          console.log(`   Available: ${item.isAvailable}`);
          console.log(`   Has image: ${!!item.image}`);
          if (item.image) {
            console.log(`   Image type: ${typeof item.image}`);
            if (typeof item.image === 'object') {
              console.log(`   Image URL: ${item.image.url || item.image}`);
            } else {
              console.log(`   Image: ${item.image.substring(0, 80)}...`);
            }
          }
        });
      } else {
        console.log('\n❌ API returned 0 menu items!');
        console.log('   But we know items exist in the database.');
        console.log('\n🔍 This means the API route has a bug!');
      }
    } else if (Array.isArray(response.data)) {
      console.log(`\n✅ Menu items array: ${response.data.length} items`);
      
      if (response.data.length > 0) {
        console.log('\n📋 Sample items:');
        response.data.slice(0, 3).forEach((item, index) => {
          console.log(`\n${index + 1}. ${item.name}`);
          console.log(`   Price: R${item.price}`);
        });
      }
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }
}

testMenuEndpoint();