// checkActiveDeliveries.js - Fixed
require('dotenv').config();
const mongoose = require('mongoose');
const Order = require('./models/Order');
const Restaurant = require('./models/Restaurant');

async function check() {
  try {
    const mongoUri = process.env.MONGODB_URI;
    
    console.log('🔄 Connecting to food-delivery database...');
    await mongoose.connect(mongoUri);
    console.log('✅ Connected\n');
    
    const activeDeliveries = await Order.find({
      status: { $in: ['driver_assigned', 'picked_up', 'on_the_way'] }
    }).populate('restaurant', 'name location');
    
    console.log(`📦 Active deliveries: ${activeDeliveries.length}\n`);
    
    if (activeDeliveries.length === 0) {
      console.log('⚠️  No active deliveries found.');
      console.log('   Try accepting an order in the driver app first.\n');
    } else {
      console.log('Active delivery details:\n');
      activeDeliveries.forEach((order, i) => {
        const coords = order.deliveryAddress?.coordinates || [0, 0];
        const restaurantCoords = order.restaurant?.location?.coordinates || [0, 0];
        
        console.log(`${i + 1}. Order ${order.orderNumber}`);
        console.log(`   Restaurant: ${order.restaurant?.name || 'N/A'}`);
        console.log(`   Restaurant coords: [${restaurantCoords[0]?.toFixed(4) || 0}, ${restaurantCoords[1]?.toFixed(4) || 0}]`);
        console.log(`   Status: ${order.status}`);
        console.log(`   Delivery coords: [${coords[0]?.toFixed(4) || 0}, ${coords[1]?.toFixed(4) || 0}]`);
        console.log(`   Has valid delivery coords: ${coords[0] !== 0 && coords[1] !== 0 ? '✅ YES' : '❌ NO'}`);
        console.log(`   Has valid restaurant coords: ${restaurantCoords[0] !== 0 && restaurantCoords[1] !== 0 ? '✅ YES' : '❌ NO'}`);
        console.log('');
      });
    }
    
    await mongoose.connection.close();
    console.log('✅ Check complete!\n');
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

check();