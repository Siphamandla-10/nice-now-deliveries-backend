// testDriverEndpoint.js - Test the driver endpoints
require('dotenv').config();
const mongoose = require('mongoose');

async function test() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected\n');
    
    const db = mongoose.connection.db;
    
    // Get driver
    const driver = await db.collection('users').findOne({ 
      email: 'khumalo22@gmail.com' 
    });
    
    console.log('🚗 Driver:', driver.name);
    console.log('   ID:', driver._id.toString());
    console.log('');
    
    // Get active orders for this driver
    const orders = await db.collection('orders').find({
      driver: driver._id,
      status: { $in: ['driver_assigned', 'picked_up', 'on_the_way'] }
    }).toArray();
    
    console.log(`📦 Active orders for this driver: ${orders.length}\n`);
    
    if (orders.length > 0) {
      const firstOrder = orders[0];
      console.log('Sample order:');
      console.log('   Order ID:', firstOrder._id.toString());
      console.log('   Order Number:', firstOrder.orderNumber);
      console.log('   Status:', firstOrder.status);
      console.log('');
      
      // Check if restaurant is populated
      console.log('Restaurant reference:', firstOrder.restaurant?.toString());
      
      // Get restaurant details
      const restaurant = await db.collection('restaurants').findOne({
        _id: firstOrder.restaurant
      });
      
      console.log('Restaurant found:', restaurant?.name);
      console.log('Restaurant coords:', restaurant?.location?.coordinates);
      console.log('');
      
      console.log('Delivery address coords:', firstOrder.deliveryAddress?.coordinates);
    }
    
    await mongoose.connection.close();
    
    console.log('\n✅ Data looks good!');
    console.log('\nNow check your backend routes:');
    console.log('   1. Does GET /api/drivers/active exist?');
    console.log('   2. Does GET /api/drivers/:orderId exist?');
    console.log('   3. Check routes/drivers.js file\n');
    
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

test();