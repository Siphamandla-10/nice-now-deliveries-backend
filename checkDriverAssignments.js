// checkDriverAssignments.js - Direct MongoDB query
require('dotenv').config();
const mongoose = require('mongoose');

async function check() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected\n');
    
    // Get database
    const db = mongoose.connection.db;
    
    // Find the logged-in driver
    const driver = await db.collection('users').findOne({ 
      email: 'khumalo22@gmail.com' 
    });
    
    console.log('🚗 Logged in driver:');
    console.log(`   Name: ${driver?.name}`);
    console.log(`   ID: ${driver?._id}`);
    console.log('');
    
    // Find active orders using direct query
    const activeOrders = await db.collection('orders').find({
      status: { $in: ['driver_assigned', 'picked_up', 'on_the_way'] }
    }).toArray();
    
    console.log(`📦 Active orders: ${activeOrders.length}\n`);
    
    if (activeOrders.length === 0) {
      console.log('⚠️  No active orders found!');
      await mongoose.connection.close();
      process.exit(0);
    }
    
    let matchCount = 0;
    
    for (let i = 0; i < activeOrders.length; i++) {
      const order = activeOrders[i];
      const driverId = order.driver?.toString();
      const matches = driverId === driver?._id?.toString();
      
      console.log(`${i + 1}. ${order.orderNumber}`);
      console.log(`   Status: ${order.status}`);
      console.log(`   Driver ID: ${driverId || 'UNASSIGNED'}`);
      console.log(`   Matches: ${matches ? '✅ YES' : '❌ NO'}`);
      console.log('');
      
      if (matches) matchCount++;
    }
    
    console.log(`\n📊 Summary:`);
    console.log(`   Total active orders: ${activeOrders.length}`);
    console.log(`   Orders for ${driver?.name}: ${matchCount}`);
    
    if (matchCount === 0) {
      console.log('\n⚠️  PROBLEM: No orders assigned to logged-in driver!');
      console.log('\n🔧 Assigning all orders to driver...\n');
      
      // Fix by assigning orders to the logged-in driver
      const result = await db.collection('orders').updateMany(
        { status: { $in: ['driver_assigned', 'picked_up', 'on_the_way'] } },
        { $set: { driver: driver._id } }
      );
      
      console.log(`✅ Updated ${result.modifiedCount} orders!`);
      console.log('\n🎉 Done! Restart your app and test again!\n');
    } else {
      console.log('\n✅ Assignments look good!');
    }
    
    await mongoose.connection.close();
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

console.log('🔍 Checking driver assignments...\n');
check();