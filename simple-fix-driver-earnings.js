// simple-fix-driver-earnings.js - Simple and robust fix for driver earnings
require('dotenv').config();
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/food-delivery';

console.log('🔧 Simple Driver Earnings Fix');
console.log('═'.repeat(60));

async function main() {
  try {
    // Connect to MongoDB
    console.log('\n📡 Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected!\n');
    
    // Get database and collections
    const db = mongoose.connection.db;
    const orders = db.collection('orders');
    const drivers = db.collection('drivers');
    
    console.log('📊 Step 1: Checking orders...\n');
    
    // Count orders
    const totalOrders = await orders.countDocuments();
    const ordersWithoutEarnings = await orders.countDocuments({
      $or: [
        { driverEarnings: { $exists: false } },
        { driverEarnings: 0 }
      ]
    });
    
    console.log(`   Total orders: ${totalOrders}`);
    console.log(`   Orders needing fix: ${ordersWithoutEarnings}\n`);
    
    if (ordersWithoutEarnings === 0) {
      console.log('✅ All orders already have driverEarnings set!');
      console.log('   Nothing to fix.\n');
      return;
    }
    
    console.log('🔧 Step 2: Fixing orders...\n');
    
    // Fix: Set driverEarnings = pricing.driverPayout for all orders
    const result = await orders.updateMany(
      {},  // Update ALL orders
      [
        {
          $set: {
            driverEarnings: {
              $ifNull: [
                '$driverEarnings',
                { $ifNull: ['$pricing.driverPayout', 20] }
              ]
            }
          }
        }
      ]
    );
    
    console.log(`✅ Updated ${result.modifiedCount} orders\n`);
    
    console.log('👥 Step 3: Updating driver metrics...\n');
    
    // Get all drivers
    const allDrivers = await drivers.find({}).toArray();
    
    for (const driver of allDrivers) {
      // Calculate total earnings for this driver
      const driverOrders = await orders.aggregate([
        {
          $match: {
            driver: driver._id,
            status: { $in: ['delivered', 'completed'] }
          }
        },
        {
          $group: {
            _id: null,
            totalEarnings: { $sum: '$driverEarnings' },
            count: { $sum: 1 }
          }
        }
      ]).toArray();
      
      const stats = driverOrders[0] || { totalEarnings: 0, count: 0 };
      
      // Update driver
      await drivers.updateOne(
        { _id: driver._id },
        {
          $set: {
            'metrics.totalEarnings': stats.totalEarnings,
            'metrics.completedDeliveries': stats.count,
            'metrics.totalDeliveries': stats.count
          }
        }
      );
      
      const driverName = driver.name || driver.user?.name || 'Driver';
      console.log(`   ✅ ${driverName}: ${stats.count} deliveries, R${stats.totalEarnings.toFixed(2)}`);
    }
    
    console.log('\n📊 Step 4: Verification...\n');
    
    // Check final state
    const finalCheck = await orders.aggregate([
      {
        $facet: {
          withEarnings: [
            { $match: { driverEarnings: { $gt: 0 } } },
            { $count: 'count' }
          ],
          withDriver: [
            { $match: { driver: { $ne: null } } },
            { $count: 'count' }
          ],
          totalEarnings: [
            { $group: { _id: null, total: { $sum: '$driverEarnings' } } }
          ]
        }
      }
    ]).toArray();
    
    const stats = finalCheck[0];
    const withEarnings = stats.withEarnings[0]?.count || 0;
    const withDriver = stats.withDriver[0]?.count || 0;
    const totalEarnings = stats.totalEarnings[0]?.total || 0;
    
    console.log(`   Orders with earnings > 0: ${withEarnings}`);
    console.log(`   Orders with driver: ${withDriver}`);
    console.log(`   Total earnings in DB: R${totalEarnings.toFixed(2)}`);
    
    // Sample check
    const sampleOrder = await orders.findOne(
      { driver: { $ne: null } },
      { projection: { orderNumber: 1, driverEarnings: 1, 'pricing.driverPayout': 1 } }
    );
    
    if (sampleOrder) {
      console.log('\n   Sample order:');
      console.log(`   - Order: ${sampleOrder.orderNumber || sampleOrder._id}`);
      console.log(`   - Driver Payout: R${(sampleOrder.pricing?.driverPayout || 0).toFixed(2)}`);
      console.log(`   - Driver Earnings: R${(sampleOrder.driverEarnings || 0).toFixed(2)}`);
    }
    
    console.log('\n' + '═'.repeat(60));
    console.log('\n✅ SUCCESS!\n');
    console.log('Next steps:');
    console.log('1. Restart your backend server');
    console.log('2. Test the driver earnings screen');
    console.log('3. Earnings should now show correctly (not R0.00)\n');
    console.log('═'.repeat(60));
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error('\nStack trace:', error.stack);
    process.exit(1);
  } finally {
    // Close connection
    await mongoose.connection.close();
    console.log('\n🔌 Disconnected from MongoDB\n');
  }
}

// Run
main();