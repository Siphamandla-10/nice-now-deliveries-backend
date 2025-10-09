const mongoose = require('mongoose');

const Order = require('./models/Order');
const Restaurant = require('./models/Restaurant');

async function testVendorOrders() {
  try {
    // Your actual MongoDB connection
    await mongoose.connect('mongodb+srv://sphakhumalo610:Aphiwe%402018@cluster0.cxs0hbt.mongodb.net/food-delivery?retryWrites=true&w=majority&appName=Cluster0');
    console.log('Connected to MongoDB\n');

    // KFC Vendor ID
    const vendorId = '68c862a069a704433e2b5468';
    
    console.log('=== CHECKING VENDOR ORDERS ===');
    console.log('Vendor ID:', vendorId);
    
    // Find restaurant
    const restaurant = await Restaurant.findOne({ owner: vendorId });
    console.log('\nRestaurant:', restaurant ? {
      _id: restaurant._id.toString(),
      name: restaurant.name,
      owner: restaurant.owner.toString()
    } : 'NOT FOUND');
    
    // Total orders
    const total = await Order.countDocuments({});
    console.log('\nTotal orders in DB:', total);
    
    if (restaurant) {
      // Check different matching approaches
      const byRestaurant = await Order.countDocuments({ restaurant: restaurant._id });
      const byVendor = await Order.countDocuments({ vendor: vendorId });
      
      console.log('\n=== MATCHING RESULTS ===');
      console.log('Orders matching restaurant ID:', byRestaurant);
      console.log('Orders matching vendor ID:', byVendor);
      
      // Get all unique restaurant IDs
      const allRestaurantIds = await Order.distinct('restaurant');
      console.log('\n=== ALL RESTAURANT IDs IN ORDERS ===');
      allRestaurantIds.forEach(id => {
        const match = id && id.toString() === restaurant._id.toString();
        console.log(`  ${id}${match ? ' ← YOUR RESTAURANT MATCH!' : ''}`);
      });
      
      // Get all unique vendor IDs
      const allVendorIds = await Order.distinct('vendor');
      console.log('\n=== ALL VENDOR IDs IN ORDERS ===');
      allVendorIds.forEach(id => {
        if (id) {
          const match = id.toString() === vendorId;
          console.log(`  ${id}${match ? ' ← YOUR VENDOR ID MATCH!' : ''}`);
        } else {
          console.log('  null (no vendor set)');
        }
      });
      
      // Get sample orders
      const samples = await Order.find({}).limit(5).sort({ createdAt: -1 });
      console.log('\n=== SAMPLE ORDERS (Most Recent) ===');
      samples.forEach((order, i) => {
        console.log(`\nOrder ${i + 1}:`);
        console.log('  Order Number:', order.orderNumber);
        console.log('  Restaurant ID:', order.restaurant?.toString());
        console.log('  Vendor ID:', order.vendor?.toString() || 'NOT SET');
        console.log('  Status:', order.status);
        console.log('  Total:', order.total);
        console.log('  Created:', order.createdAt);
        
        const restMatch = order.restaurant && order.restaurant.toString() === restaurant._id.toString();
        const vendMatch = order.vendor && order.vendor.toString() === vendorId;
        console.log('  Restaurant Match:', restMatch ? '✓ YES' : '✗ NO');
        console.log('  Vendor Match:', vendMatch ? '✓ YES' : '✗ NO');
      });
    }
    
    console.log('\n=== END ANALYSIS ===\n');
    
    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
  }
}

testVendorOrders();