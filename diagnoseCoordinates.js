// diagnoseCoordinates.js - See actual coordinate values
require('dotenv').config();
const mongoose = require('mongoose');
const Order = require('./models/Order');
const Restaurant = require('./models/Restaurant');

async function diagnose() {
  try {
    const mongoUri = process.env.MONGODB_URI;
    
    await mongoose.connect(mongoUri);
    console.log('✅ Connected\n');
    
    // Get one order to inspect
    const order = await Order.findOne({ 
      status: 'driver_assigned' 
    }).populate('restaurant');
    
    if (order) {
      console.log('📦 Sample Order:', order.orderNumber);
      console.log('\nDelivery Address Coordinates:');
      console.log('   Raw value:', JSON.stringify(order.deliveryAddress.coordinates));
      console.log('   Type:', typeof order.deliveryAddress.coordinates);
      console.log('   Is Array:', Array.isArray(order.deliveryAddress.coordinates));
      console.log('   [0] =', order.deliveryAddress.coordinates[0]);
      console.log('   [1] =', order.deliveryAddress.coordinates[1]);
      
      if (order.restaurant) {
        console.log('\nRestaurant Location:');
        console.log('   Raw value:', JSON.stringify(order.restaurant.location));
        console.log('   Coordinates:', order.restaurant.location?.coordinates);
      }
      
      console.log('\n🔧 Now fixing...\n');
      
      // Fix this specific order
      const latVar = (Math.random() - 0.5) * 0.02;
      const lngVar = (Math.random() - 0.5) * 0.02;
      
      order.deliveryAddress.coordinates = [28.0473 + lngVar, -26.2041 + latVar];
      order.deliveryAddress.location = {
        type: 'Point',
        coordinates: [28.0473 + lngVar, -26.2041 + latVar]
      };
      
      await order.save();
      console.log('✅ Fixed order:', order.orderNumber);
      console.log('   New coords:', order.deliveryAddress.coordinates);
      
      // Fix restaurant if needed
      if (order.restaurant && order.restaurant.location?.coordinates) {
        const coords = order.restaurant.location.coordinates;
        if (coords[0] === 0 || coords[1] === 0) {
          const restaurant = await Restaurant.findById(order.restaurant._id);
          restaurant.location = {
            type: 'Point',
            coordinates: [28.0473 + (Math.random() - 0.5) * 0.01, -26.2041 + (Math.random() - 0.5) * 0.01]
          };
          await restaurant.save();
          console.log('✅ Fixed restaurant:', restaurant.name);
        }
      }
    }
    
    // Now fix ALL orders
    console.log('\n📦 Fixing ALL orders...\n');
    
    const allOrders = await Order.find({
      status: { $in: ['driver_assigned', 'picked_up', 'on_the_way'] }
    });
    
    let fixed = 0;
    for (const o of allOrders) {
      const coords = o.deliveryAddress?.coordinates;
      if (!coords || coords[0] === 0 || coords[1] === 0 || Math.abs(coords[0]) < 0.001 || Math.abs(coords[1]) < 0.001) {
        const latVar = (Math.random() - 0.5) * 0.02;
        const lngVar = (Math.random() - 0.5) * 0.02;
        
        o.deliveryAddress.coordinates = [28.0473 + lngVar, -26.2041 + latVar];
        o.deliveryAddress.location = {
          type: 'Point',
          coordinates: [28.0473 + lngVar, -26.2041 + latVar]
        };
        
        await o.save();
        console.log(`   ✅ Fixed: ${o.orderNumber}`);
        fixed++;
      }
    }
    
    console.log(`\n✅ Fixed ${fixed} orders!\n`);
    
    await mongoose.connection.close();
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

diagnose();