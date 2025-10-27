// diagnostic-check-v2.js - Better diagnostic that won't fail on validation
const mongoose = require('mongoose');
require('dotenv').config();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/food-delivery')
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => console.error('❌ MongoDB Error:', err));

const Order = require('./models/Order');

async function checkOrderModel() {
  console.log('\n🔍 DIAGNOSTIC CHECK: Order Model v2\n');
  console.log('═'.repeat(80));
  
  // Check 1: Pre-save middleware
  console.log('\n1️⃣ Checking pre-save middleware...');
  const schema = Order.schema;
  const preSaveHooks = schema.s?.hooks?._pres?.get('save') || [];
  console.log(`   Found ${preSaveHooks.length} pre-save hook(s)`);
  
  if (preSaveHooks.length === 0) {
    console.log('   ❌ NO PRE-SAVE MIDDLEWARE FOUND!');
    console.log('   This is the problem - calculations are not being done automatically.');
  } else {
    console.log('   ✅ Pre-save middleware exists');
  }
  
  // Check 2: Test with manual save (bypass validation initially)
  console.log('\n2️⃣ Testing calculation with R100 order...');
  
  const testOrder = new Order({
    user: new mongoose.Types.ObjectId(),
    restaurant: new mongoose.Types.ObjectId(),
    items: [{
      menuItem: new mongoose.Types.ObjectId(),
      name: 'Test Item',
      price: 50,
      quantity: 2,
      subtotal: 100
    }],
    deliveryAddress: {
      street: 'Test Street',
      city: 'Test City',
      state: 'Test State',
      zipCode: '12345',
      contactPhone: '0123456789'
    },
    pricing: {
      subtotal: 100,
      deliveryFee: 25,
      serviceFee: 5,
      discount: 0,
      total: 0, // Set to 0 initially
      platformCommissionRate: 20,
      driverPayout: 20,
      platformCommission: 0,
      restaurantPayout: 0,
      platformProfit: 0
    },
    payment: {
      method: 'cash'
    },
    cancellation: {
      cancelledBy: null // Fix enum issue
    }
  });
  
  // Manually trigger the calculations that should happen in pre-save
  console.log('\n   Manually calculating (simulating pre-save)...');
  
  const subtotal = 100;
  const deliveryFee = 25;
  const serviceFee = 5;
  const discount = 0;
  const commissionRate = 20;
  const driverPayout = 20;
  
  // Manual calculation
  const total = subtotal + deliveryFee + serviceFee - discount;
  const commission = subtotal * (commissionRate / 100);
  const restaurantPayout = subtotal - commission;
  const platformProfit = commission + serviceFee + (deliveryFee - driverPayout);
  
  console.log('\n📊 Expected Values (if pre-save worked):');
  console.log('   Customer Total:        R', total.toFixed(2), ' (expected: R130.00)');
  console.log('   Platform Commission:   R', commission.toFixed(2), ' (expected: R20.00)');
  console.log('   Restaurant Payout:     R', restaurantPayout.toFixed(2), ' (expected: R80.00)');
  console.log('   Driver Payout:         R', driverPayout.toFixed(2), ' (expected: R20.00)');
  console.log('   Platform Profit:       R', platformProfit.toFixed(2), ' (expected: R30.00)');
  
  console.log('\n📊 Actual Values in Test Order:');
  console.log('   Customer Total:        R', testOrder.pricing.total.toFixed(2));
  console.log('   Platform Commission:   R', testOrder.pricing.platformCommission.toFixed(2));
  console.log('   Restaurant Payout:     R', testOrder.pricing.restaurantPayout.toFixed(2));
  console.log('   Driver Payout:         R', testOrder.pricing.driverPayout.toFixed(2));
  console.log('   Platform Profit:       R', testOrder.pricing.platformProfit.toFixed(2));
  
  const preSaveWorks = testOrder.pricing.total !== 0;
  
  console.log('\n✅ Pre-save Status:');
  if (preSaveWorks) {
    console.log('   ✅ Pre-save middleware is WORKING - calculations were done automatically');
  } else {
    console.log('   ❌ Pre-save middleware is NOT WORKING - all values are 0');
    console.log('   ⚠️  This means your Order.js is missing the calculation logic');
  }
  
  // Check 3: Check the actual Order.js file
  console.log('\n3️⃣ Checking Order.js file content...');
  const fs = require('fs');
  const path = require('path');
  
  try {
    const orderFilePath = path.join(__dirname, 'models', 'Order.js');
    const fileContent = fs.readFileSync(orderFilePath, 'utf8');
    
    // Check for key indicators
    const hasPreSave = fileContent.includes('orderSchema.pre(\'save\'');
    const hasCorrectFormula = fileContent.includes('(deliveryFee - driverPayout)');
    const hasOldFormula = fileContent.includes('deliveryFee - this.pricing.driverPayout');
    const fileSize = fs.statSync(orderFilePath).size;
    
    console.log('   File path:', orderFilePath);
    console.log('   File size:', fileSize, 'bytes');
    console.log('   Has pre-save hook:', hasPreSave ? '✅' : '❌');
    console.log('   Has correct formula:', hasCorrectFormula ? '✅' : '❌');
    console.log('   Has old formula:', hasOldFormula ? '⚠️ YES (needs fixing)' : '✅ No');
    
    if (!hasPreSave) {
      console.log('\n   ❌ CRITICAL: No pre-save middleware found in file!');
      console.log('   Your Order.js is completely missing the calculation logic.');
    } else if (hasOldFormula) {
      console.log('\n   ⚠️  WARNING: Old incorrect formula detected!');
      console.log('   Need to update to the corrected formula.');
    } else if (hasCorrectFormula) {
      console.log('\n   ✅ SUCCESS: Corrected formula is in place!');
    }
    
  } catch (error) {
    console.log('   ❌ Could not read Order.js file:', error.message);
  }
  
  // Check 4: Check recent orders in database
  console.log('\n4️⃣ Checking recent orders in database...');
  
  try {
    const recentOrders = await Order.find({})
      .sort({ createdAt: -1 })
      .limit(5)
      .select('orderNumber pricing status createdAt');
    
    console.log(`   Found ${recentOrders.length} recent orders:\n`);
    
    let allZero = true;
    let someZero = false;
    
    recentOrders.forEach((order, i) => {
      const isZero = order.pricing.total === 0 || order.pricing.platformProfit === 0;
      if (!isZero) allZero = false;
      if (isZero) someZero = true;
      
      console.log(`   ${i + 1}. ${order.orderNumber} (${order.status})`);
      console.log(`      Total: R${order.pricing.total.toFixed(2)} ${order.pricing.total === 0 ? '❌' : '✅'}`);
      console.log(`      Platform Profit: R${order.pricing.platformProfit.toFixed(2)} ${order.pricing.platformProfit === 0 ? '❌' : '✅'}`);
      console.log(`      Created: ${order.createdAt.toLocaleString()}\n`);
    });
    
    if (allZero) {
      console.log('   ❌ ALL orders have R0.00 values - pre-save is definitely not working');
    } else if (someZero) {
      console.log('   ⚠️  SOME orders have R0.00 values - pre-save might be inconsistent');
    } else {
      console.log('   ✅ All recent orders have proper values');
    }
    
  } catch (error) {
    console.log('   ⚠️  Could not fetch orders:', error.message);
  }
  
  // Final diagnosis
  console.log('\n' + '═'.repeat(80));
  console.log('\n🏁 FINAL DIAGNOSIS:\n');
  
  if (preSaveHooks.length === 0) {
    console.log('❌ PROBLEM IDENTIFIED: No pre-save middleware in your Order model!');
    console.log('\n📋 SOLUTION:');
    console.log('   1. Your current models/Order.js is MISSING the calculation logic');
    console.log('   2. Replace it with the corrected Order.js file provided');
    console.log('   3. The corrected file has ~14KB and includes pre-save middleware');
    console.log('\n💡 ACTION REQUIRED:');
    console.log('   Stop server → Replace models/Order.js → Restart server');
  } else if (!preSaveWorks) {
    console.log('⚠️  Pre-save middleware exists but is not calculating correctly');
    console.log('\n📋 SOLUTION:');
    console.log('   The calculation formula in pre-save is likely wrong');
    console.log('   Replace models/Order.js with the corrected version');
  } else {
    console.log('✅ Pre-save middleware is working correctly!');
    console.log('   The fix has been successfully applied.');
  }
  
  console.log('\n' + '═'.repeat(80));
  
  mongoose.connection.close();
  process.exit(preSaveHooks.length > 0 && preSaveWorks ? 0 : 1);
}

checkOrderModel().catch(err => {
  console.error('❌ Fatal Error:', err);
  mongoose.connection.close();
  process.exit(1);
});