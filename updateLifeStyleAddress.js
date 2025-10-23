// updateLifeStyleAddress.js - Update Life Style Junction address
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const Restaurant = require('./models/Restaurant');

async function updateLifeStyleAddress() {
  try {
    const mongoURI = process.env.MONGODB_URI || process.env.MONGO_URI;
    
    console.log('📍 UPDATING LIFE STYLE JUNCTION ADDRESS');
    console.log('='.repeat(80));
    
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(mongoURI);
    console.log('✅ Connected\n');

    // Find Life Style Junction
    const lifeStyle = await Restaurant.findOne({ 
      name: /Life.*Style.*Junction/i 
    });

    if (!lifeStyle) {
      console.log('❌ Life Style Junction not found!');
      return;
    }

    console.log('📊 CURRENT ADDRESS:');
    console.log('='.repeat(80));
    console.log(`Restaurant: ${lifeStyle.name}`);
    console.log(`ID: ${lifeStyle._id}`);
    console.log('\nCurrent Address:');
    if (lifeStyle.address) {
      console.log(`   Street: ${lifeStyle.address.street || 'Not set'}`);
      console.log(`   City: ${lifeStyle.address.city || 'Not set'}`);
      console.log(`   State: ${lifeStyle.address.state || 'Not set'}`);
      console.log(`   Zip Code: ${lifeStyle.address.zipCode || 'Not set'}`);
      console.log(`   Country: ${lifeStyle.address.country || 'Not set'}`);
    } else {
      console.log('   No address set');
    }

    // New address details
    const newAddress = {
      street: '711 Pretoria Main Rd, Wynberg',
      city: 'Sandton',
      state: 'Gauteng',
      zipCode: '2063',
      country: 'South Africa',
      region: 'Gauteng',
      location: {
        type: 'Point',
        coordinates: [28.0473, -26.1076] // Approximate coordinates for Wynberg, Sandton
      }
    };

    console.log('\n\n📝 NEW ADDRESS:');
    console.log('='.repeat(80));
    console.log(`   Street: ${newAddress.street}`);
    console.log(`   City: ${newAddress.city}`);
    console.log(`   State: ${newAddress.state}`);
    console.log(`   Zip Code: ${newAddress.zipCode}`);
    console.log(`   Country: ${newAddress.country}`);

    console.log('\n🔄 Updating address...');

    // Update the address
    lifeStyle.address = newAddress;

    // Also update location field at restaurant root level
    lifeStyle.location = {
      type: 'Point',
      coordinates: [28.0473, -26.1076]
    };

    await lifeStyle.save();

    console.log('✅ Address updated successfully!');

    // Verification
    console.log('\n\n✅ VERIFICATION:');
    console.log('='.repeat(80));
    
    const updated = await Restaurant.findById(lifeStyle._id);
    
    console.log(`Restaurant: ${updated.name}`);
    console.log('\nUpdated Address:');
    console.log(`   Street: ${updated.address.street}`);
    console.log(`   City: ${updated.address.city}`);
    console.log(`   State: ${updated.address.state}`);
    console.log(`   Zip Code: ${updated.address.zipCode}`);
    console.log(`   Country: ${updated.address.country}`);
    console.log(`   Coordinates: [${updated.location.coordinates[0]}, ${updated.location.coordinates[1]}]`);

    console.log('\n\n🎉 DONE!');
    console.log('='.repeat(80));
    console.log('✅ Life Style Junction address updated!');
    console.log('💡 The new address will appear in the app immediately!');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

updateLifeStyleAddress();