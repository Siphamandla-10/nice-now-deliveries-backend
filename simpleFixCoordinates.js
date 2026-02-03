// simpleFixCoordinates.js - Final version
require('dotenv').config();
const mongoose = require('mongoose');
const Order = require('./models/Order');
const Restaurant = require('./models/Restaurant');

// Default coordinates for different cities in South Africa
const defaultCoordinates = {
  'Johannesburg': [28.0473, -26.2041],
  'Pretoria': [28.1881, -25.7479],
  'Cape Town': [18.4241, -33.9249],
  'Durban': [31.0218, -29.8587],
  'default': [28.0473, -26.2041] // Johannesburg
};

async function fixCoordinates() {
  try {
    // Your connection string
    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
    
    if (!mongoUri) {
      console.error('❌ No MongoDB URI found in .env file!');
      console.error('   Make sure your .env file has MONGO_URI');
      process.exit(1);
    }
    
    console.log('🔄 Connecting to MongoDB...');
    console.log('   Database:', mongoUri.includes('food-delivery') ? 'food-delivery' : 'unknown');
    
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB\n');
    
    // Find orders with missing coordinates
    const orders = await Order.find({
      $or: [
        { 'deliveryAddress.coordinates': [0, 0] },
        { 'deliveryAddress.coordinates.0': 0 }
      ]
    }).populate('restaurant', 'name');
    
    console.log(`📦 Found ${orders.length} orders to fix\n`);
    
    if (orders.length === 0) {
      console.log('✅ All orders already have valid coordinates!');
      await mongoose.connection.close();
      process.exit(0);
    }
    
    let fixed = 0;
    
    for (let i = 0; i < orders.length; i++) {
      const order = orders[i];
      
      try {
        const city = order.deliveryAddress.city || 'default';
        
        // Get coordinates based on city
        let coords = defaultCoordinates[city] || defaultCoordinates['default'];
        
        // Add slight variation so not all orders are at exact same spot
        const latVariation = (Math.random() - 0.5) * 0.02; // ±0.01 degrees
        const lngVariation = (Math.random() - 0.5) * 0.02;
        
        const lng = coords[0] + lngVariation;
        const lat = coords[1] + latVariation;
        
        order.deliveryAddress.coordinates = [lng, lat];
        order.deliveryAddress.location = {
          type: 'Point',
          coordinates: [lng, lat]
        };
        
        await order.save();
        
        console.log(`✅ [${i + 1}/${orders.length}] ${order.orderNumber} - ${order.restaurant?.name || 'Restaurant'} - ${city}: (${lat.toFixed(4)}, ${lng.toFixed(4)})`);
        fixed++;
        
      } catch (error) {
        console.error(`❌ [${i + 1}/${orders.length}] Error:`, error.message);
      }
    }
    
    console.log(`\n${'='.repeat(60)}`);
    console.log('📊 SUMMARY:');
    console.log(`   ✅ Fixed: ${fixed} orders`);
    console.log(`   📍 All coordinates set to Johannesburg area`);
    console.log(`   🗺️  Ready for map tracking!`);
    console.log(`${'='.repeat(60)}\n`);
    
    await mongoose.connection.close();
    console.log('✅ MongoDB connection closed');
    console.log('\n🎉 Done! Now restart your backend and test the tracking screen!\n');
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ Fatal error:', error.message);
    try {
      await mongoose.connection.close();
    } catch (e) {}
    process.exit(1);
  }
}

console.log('🚀 Starting quick coordinate fix...\n');
fixCoordinates();