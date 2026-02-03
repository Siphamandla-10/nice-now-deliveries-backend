// fixNicedeliveriesCoords.js
const mongoose = require('mongoose');
const Order = require('./models/Order');
const Restaurant = require('./models/Restaurant');

const defaultCoordinates = {
  'Johannesburg': [28.0473, -26.2041],
  'Pretoria': [28.1881, -25.7479],
  'Cape Town': [18.4241, -33.9249],
  'Durban': [31.0218, -29.8587],
  'default': [28.0473, -26.2041]
};

async function fixCoordinates() {
  try {
    // Use the nicedeliveries database
    const mongoUri = 'mongodb+srv://sphakhumalo610:Aphiwe%402018@cluster0.cxs0hbt.mongodb.net/nicedeliveries?retryWrites=true&w=majority&appName=Cluster0';
    
    console.log('🔄 Connecting to MongoDB (nicedeliveries database)...');
    await mongoose.connect(mongoUri);
    console.log('✅ Connected\n');
    
    const orders = await Order.find({
      $or: [
        { 'deliveryAddress.coordinates': [0, 0] },
        { 'deliveryAddress.coordinates.0': 0 }
      ]
    }).populate('restaurant', 'name');
    
    console.log(`📦 Found ${orders.length} orders to fix\n`);
    
    if (orders.length === 0) {
      console.log('✅ All orders have valid coordinates!');
      await mongoose.connection.close();
      process.exit(0);
    }
    
    let fixed = 0;
    
    for (let i = 0; i < orders.length; i++) {
      const order = orders[i];
      
      try {
        const city = order.deliveryAddress.city || 'default';
        let coords = defaultCoordinates[city] || defaultCoordinates['default'];
        
        const latVariation = (Math.random() - 0.5) * 0.02;
        const lngVariation = (Math.random() - 0.5) * 0.02;
        
        const lng = coords[0] + lngVariation;
        const lat = coords[1] + latVariation;
        
        order.deliveryAddress.coordinates = [lng, lat];
        order.deliveryAddress.location = {
          type: 'Point',
          coordinates: [lng, lat]
        };
        
        await order.save();
        
        console.log(`✅ [${i + 1}/${orders.length}] ${order.orderNumber} - ${order.restaurant?.name || 'Restaurant'}: (${lat.toFixed(4)}, ${lng.toFixed(4)})`);
        fixed++;
        
      } catch (error) {
        console.error(`❌ [${i + 1}/${orders.length}] Error:`, error.message);
      }
    }
    
    console.log(`\n${'='.repeat(60)}`);
    console.log(`✅ Fixed: ${fixed} orders`);
    console.log(`${'='.repeat(60)}\n`);
    
    await mongoose.connection.close();
    console.log('✅ Done!\n');
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    try { await mongoose.connection.close(); } catch (e) {}
    process.exit(1);
  }
}

console.log('🚀 Fixing nicedeliveries database...\n');
fixCoordinates();