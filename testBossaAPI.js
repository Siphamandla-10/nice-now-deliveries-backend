// testBossaAPI.js - Test if Bossa appears in restaurants API
const axios = require('axios');

const API_BASE = 'http://192.168.1.150:5000/api';

async function testBossaAPI() {
  try {
    console.log('🧪 TESTING BOSSA IN API');
    console.log('='.repeat(80));
    console.log(`📡 API Base: ${API_BASE}\n`);

    // Test 1: Get all restaurants
    console.log('📋 Test 1: GET /api/restaurants');
    console.log('-'.repeat(80));
    
    const response = await axios.get(`${API_BASE}/restaurants`, {
      params: {
        expandLocations: 'false'
      }
    });

    console.log(`✅ Status: ${response.status}`);
    console.log(`📊 Total restaurants returned: ${response.data.restaurants?.length || 0}\n`);

    // Find Bossa
    const bossa = response.data.restaurants?.find(r => 
      r.name === 'Bossa' || r.displayName === 'Bossa'
    );

    if (!bossa) {
      console.log('❌ BOSSA NOT FOUND IN API RESPONSE!');
      console.log('\n📋 Restaurants returned:');
      response.data.restaurants?.forEach((r, i) => {
        console.log(`   ${i + 1}. ${r.name || r.displayName} (${r.address?.city || 'Unknown'})`);
      });
      
      console.log('\n🔧 Possible issues:');
      console.log('   1. Backend not restarted - Run: node server.js');
      console.log('   2. Database query filtering out Bossa');
      console.log('   3. isActive or status not set correctly');
      
    } else {
      console.log('✅ BOSSA FOUND IN API!\n');
      console.log('📊 Bossa Details:');
      console.log(`   ID: ${bossa._id || bossa.id}`);
      console.log(`   Name: ${bossa.name}`);
      console.log(`   Display Name: ${bossa.displayName || 'N/A'}`);
      console.log(`   City: ${bossa.address?.city || 'N/A'}`);
      console.log(`   Status: ${bossa.status || 'N/A'}`);
      console.log(`   Active: ${bossa.isActive}`);
      console.log(`   Available: ${bossa.available}`);
      console.log(`   Image: ${bossa.image ? bossa.image.substring(0, 60) + '...' : 'NO IMAGE'}`);
      console.log(`   Cover Image: ${bossa.images?.coverImage?.url ? bossa.images.coverImage.url.substring(0, 60) + '...' : 'NO IMAGE'}`);
    }

    // Test 2: Get Bossa menu
    if (bossa) {
      console.log('\n📋 Test 2: GET /api/restaurants/:id/menu');
      console.log('-'.repeat(80));
      
      const menuResponse = await axios.get(`${API_BASE}/restaurants/${bossa._id}/menu`);
      
      console.log(`✅ Status: ${menuResponse.status}`);
      console.log(`📊 Menu items: ${menuResponse.data.menu?.length || 0}\n`);
      
      if (menuResponse.data.menu?.length > 0) {
        console.log('✅ MENU ITEMS FOUND:');
        menuResponse.data.menu.forEach((item, i) => {
          console.log(`   ${i + 1}. ${item.name} - R${item.price}`);
          console.log(`      Image: ${item.image?.url ? '✅ ' + item.image.url.substring(0, 50) + '...' : '❌ No image'}`);
        });
      } else {
        console.log('❌ NO MENU ITEMS RETURNED');
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log('🔍 SUMMARY:');
    console.log('='.repeat(80));
    
    if (bossa && bossa.image) {
      console.log('✅ Bossa is in API with image');
      console.log('✅ Everything should work in the app');
      console.log('\n💡 If you still can\'t see it:');
      console.log('   1. Clear app cache and reload');
      console.log('   2. Check app console logs for errors');
      console.log('   3. Make sure you\'re scrolling through the list');
    } else if (bossa && !bossa.image) {
      console.log('⚠️  Bossa is in API but NO IMAGE');
      console.log('💡 Run: node uploadBossaImageFixed.js');
    } else {
      console.log('❌ Bossa NOT in API response');
      console.log('💡 Check backend logs and restart server');
    }

  } catch (error) {
    console.error('❌ Error testing API:', error.message);
    if (error.response) {
      console.error(`   Status: ${error.response.status}`);
      console.error(`   Message: ${error.response.data?.message || 'Unknown'}`);
    } else {
      console.error('   Make sure backend is running: node server.js');
    }
  }
}

testBossaAPI();