// checkDriverAssignments.js - Fixed without Driver model
require('dotenv').config();
const mongoose = require('mongoose');
const Order = require('./models/Order');
const User = require('./models/User');

async function check() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected\n');
    
    // Find the logged-in driver
    const driver = await User.findOne({ email: 'khumalo22@gmail.com' });
    console.log('🚗 Logged in driver:');
    console.log(`   Name: ${driver?.name}`);
    console.log(`   ID: ${driver?._id}`);
    console.log('');
    
    // Find active orders (no populate)
    const activeOrders = await Order.find({
      status: { $in: ['driver_assigned', 'picked_up', 'on_the_way'] }
    }).lean();
    
    console.log(`📦 Active orders: ${activeOrders.length}\n`);
    
    activeOrders.forEach((order, i) => {
      const driverId = order.driver?.toString();
      const matches = driverId === driver?._id?.toString();
      
      console.log(`${i + 1}. ${order.orderNumber}`);
      console.log(`   Status: ${order.status}`);
      console.log(`   Driver ID: ${driverId || 'UNASSIGNED'}`);
      console.log(`   Matches logged-in driver: ${matches ? '✅ YES' : '❌ NO'}`);
      console.log('');
    });
    
    // Count matches
    const matchingOrders = activeOrders.filter(o => 
      o.driver?.toString() === driver?._id?.toString()
    );
    
    console.log(`\n📊 Summary:`);
    console.log(`   Total active orders: ${activeOrders.length}`);
    console.log(`   Orders for ${driver?.name}: ${matchingOrders.length}`);
    
    if (matchingOrders.length === 0) {
      console.log('\n⚠️  PROBLEM FOUND: No orders assigned to this driver!');
      console.log(`   All orders need to be assigned to: ${driver.name} (${driver._id})`);
      console.log('\n🔧 Fixing now...\n');
      
      // Fix by assigning orders to the logged-in driver
      for (const order of activeOrders) {
        await Order.updateOne(
          { _id: order._id },
          { $set: { driver: driver._id } }
        );
        console.log(`   ✅ Assigned ${order.orderNumber} to ${driver.name}`);
      }
      
      console.log('\n✅ All orders now assigned to the logged-in driver!');
      console.log('   Restart your app and test again! 🚀\n');
    } else {
      console.log('\n✅ Driver assignments look good!');
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