// fixActiveDeliveries.js - Fix both orders and restaurants
require('dotenv').config();
const mongoose = require('mongoose');
const Order = require('./models/Order');
const Restaurant = require('./models/Restaurant');

const defaultCoordinates = {
  'Johannesburg': [28.0473, -26.2041],
  'default': [28.0473, -26.2041]
};

async function fix() {
  try {
    const mongoUri = process.env.MONGODB_URI;
    
    console.log('🔄 Connecting...');
    await mongoose.connect(mongoUri);
    console.log('✅ Connected\n');
    
    // Fix restaurants first
    console.log('🍴 Fixing restaurants...\n');
    const restaurants = await Restaurant.find({
      $or: [
        { 'location.coordinates': [0, 0] },
        { 'location.coordinates.0': 0 }
      ]
    });
    
    console.log(`Found ${restaurants.length} restaurants to fix`);
    
    for (const restaurant of restaurants) {
      const latVar = (Math.random() - 0.5) * 0.01;
      const lngVar = (Math.random() - 0.5) * 0.01;
      
      restaurant.location = {
        type: 'Point',
        coordinates: [28.0473 + lngVar, -26.2041 + latVar]
      };
      
      await restaurant.save();
      console.log(`   ✅ ${restaurant.name}: [${restaurant.location.coordinates[0].toFixed(4)}, ${restaurant.location.coordinates[1].toFixed(4)}]`);
    }
    
    // Fix orders
    console.log('\n📦 Fixing orders...\n');
    const orders = await Order.find({
      $or: [
        { 'deliveryAddress.coordinates': [0, 0] },
        { 'deliveryAddress.coordinates.0': 0 }
      ]
    }).populate('restaurant', 'name');
    
    console.log(`Found ${orders.length} orders to fix`);
    
    for (const order of orders) {
      const latVar = (Math.random() - 0.5) * 0.02;
      const lngVar = (Math.random() - 0.5) * 0.02;
      
      const lng = 28.0473 + lngVar;
      const lat = -26.2041 + latVar;
      
      order.deliveryAddress.coordinates = [lng, lat];
      order.deliveryAddress.location = {
        type: 'Point',
        coordinates: [lng, lat]
      };
      
      await order.save();
      console.log(`   ✅ ${order.orderNumber} - ${order.restaurant?.name}: [${lng.toFixed(4)}, ${lat.toFixed(4)}]`);
    }
    
    console.log(`\n${'='.repeat(60)}`);
    console.log('✅ ALL FIXED!');
    console.log(`   - Restaurants: ${restaurants.length}`);
    console.log(`   - Orders: ${orders.length}`);
    console.log(`${'='.repeat(60)}\n`);
    
    await mongoose.connection.close();
    console.log('🎉 Done! Restart your backend and test the tracking screen!\n');
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    try { await mongoose.connection.close(); } catch (e) {}
    process.exit(1);
  }
}

console.log('🚀 Fixing all coordinates...\n');
fix();