// check-migration.js - Check if migration worked
require('dotenv').config();
const mongoose = require('mongoose');
const Order = require('./models/Order');
const Restaurant = require('./models/Restaurant');

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/food-delivery';

async function checkMigration() {
  try {
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Find KFC vendor
    const vendorId = '68c862a069a704433e2b5468';
    console.log(`🔍 Checking orders for vendor: ${vendorId}\n`);

    // Get KFC restaurant
    const restaurant = await Restaurant.findOne({ owner: vendorId });
    console.log(`🏪 Restaurant: ${restaurant?.name} (${restaurant?._id})\n`);

    // Check all orders
    const totalOrders = await Order.countDocuments();
    console.log(`📦 Total orders in database: ${totalOrders}`);

    // Orders with vendor field
    const ordersWithVendor = await Order.find({ vendor: { $exists: true, $ne: null } });
    console.log(`✅ Orders WITH vendor field: ${ordersWithVendor.length}`);

    // Orders for this specific vendor
    const vendorOrders = await Order.find({ vendor: vendorId });
    console.log(`👤 Orders for vendor ${vendorId}: ${vendorOrders.length}`);

    // Orders for KFC restaurant
    const restaurantOrders = await Order.find({ restaurant: restaurant._id });
    console.log(`🏪 Orders for restaurant ${restaurant._id}: ${restaurantOrders.length}`);

    // Combined query (what the app uses)
    const combinedOrders = await Order.find({
      $or: [
        { vendor: vendorId },
        { restaurant: restaurant._id }
      ]
    });
    console.log(`🔄 Combined query results: ${combinedOrders.length}\n`);

    // Show sample orders
    console.log('📋 Sample orders:');
    const sampleOrders = await Order.find({ restaurant: restaurant._id })
      .limit(5)
      .select('orderNumber vendor restaurant status createdAt');
    
    sampleOrders.forEach((order, i) => {
      console.log(`\n${i + 1}. Order: ${order.orderNumber}`);
      console.log(`   Restaurant: ${order.restaurant}`);
      console.log(`   Vendor: ${order.vendor || 'NOT SET'}`);
      console.log(`   Status: ${order.status}`);
      console.log(`   Date: ${order.createdAt}`);
    });

    await mongoose.disconnect();
    console.log('\n✅ Check complete - Disconnected from MongoDB');

  } catch (error) {
    console.error('❌ Check failed:', error);
    process.exit(1);
  }
}

checkMigration();