// test-calculation-consistency.js - WORKING VERSION
// Usage: node test-calculation-consistency.js

require('dotenv').config();
const mongoose = require('mongoose');

// Check for either MONGO_URI or MONGODB_URI
const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;

if (!mongoUri) {
  console.error('❌ ERROR: Neither MONGO_URI nor MONGODB_URI found in .env file');
  console.error('Make sure your .env file exists and contains one of these variables');
  process.exit(1);
}

console.log('📡 Connecting to MongoDB Atlas...');
console.log('Using:', mongoUri.includes('mongodb+srv') ? 'MongoDB Atlas (Cloud)' : 'Local MongoDB');

// Connect to MongoDB
mongoose.connect(mongoUri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 30000,
  socketTimeoutMS: 45000,
}).then(() => {
  console.log('✅ Connected to MongoDB\n');
  runTests();
}).catch(err => {
  console.error('❌ MongoDB connection failed:', err.message);
  console.error('\nTroubleshooting:');
  console.error('1. Check your .env file has MONGO_URI or MONGODB_URI');
  console.error('2. Verify your MongoDB Atlas cluster is running');
  console.error('3. Check your IP is whitelisted in MongoDB Atlas');
  console.error('4. Verify your password is correct (special chars need encoding)');
  process.exit(1);
});

// Load models
const Order = require('./models/Order');
// Try to load MenuItem but don't fail if it doesn't exist
let MenuItem;
try {
  MenuItem = require('./models/MenuItem');
} catch (err) {
  console.log('⚠️  MenuItem model not loaded (not critical for this test)');
}

// ===== ORIGINAL BUGGY CALCULATION =====
const calculateOrderTotalsOLD = (order) => {
  let calculatedSubtotal = 0;
  if (order.items && Array.isArray(order.items)) {
    calculatedSubtotal = order.items.reduce((sum, item) => {
      const itemPrice = item.price || 0;
      const itemQuantity = item.quantity || 1;
      return sum + (itemPrice * itemQuantity);
    }, 0);
  }

  const deliveryFee = order.pricing?.deliveryFee || order.deliveryFee || 0;
  const serviceFee = order.pricing?.serviceFee || order.serviceFee || 0;
  const tax = order.pricing?.tax || order.tax || 0;
  const discount = order.pricing?.discount || order.discount || 0;
  const subtotal = order.pricing?.subtotal || calculatedSubtotal;

  const total = subtotal + deliveryFee + serviceFee + tax - discount;

  return {
    subtotal: parseFloat(subtotal.toFixed(2)),
    deliveryFee: parseFloat(deliveryFee.toFixed(2)),
    serviceFee: parseFloat(serviceFee.toFixed(2)),
    tax: parseFloat(tax.toFixed(2)),
    discount: parseFloat(discount.toFixed(2)),
    total: parseFloat(total.toFixed(2))
  };
};

// ===== NEW FIXED CALCULATION =====
const calculateOrderTotalsNEW = (order) => {
  if (order.pricing && typeof order.pricing === 'object') {
    const subtotalCents = Math.round((order.pricing.subtotal || 0) * 100);
    const deliveryFeeCents = Math.round((order.pricing.deliveryFee || 0) * 100);
    const serviceFeeCents = Math.round((order.pricing.serviceFee || 0) * 100);
    const taxCents = Math.round((order.pricing.tax || 0) * 100);
    const discountCents = Math.round((order.pricing.discount || 0) * 100);
    
    const totalCents = subtotalCents + deliveryFeeCents + serviceFeeCents + taxCents - discountCents;
    
    return {
      subtotal: subtotalCents / 100,
      deliveryFee: deliveryFeeCents / 100,
      serviceFee: serviceFeeCents / 100,
      tax: taxCents / 100,
      discount: discountCents / 100,
      total: totalCents / 100
    };
  }
  
  let calculatedSubtotal = 0;
  if (order.items && Array.isArray(order.items)) {
    calculatedSubtotal = order.items.reduce((sum, item) => {
      const itemPrice = item.price || 0;
      const itemQuantity = item.quantity || 1;
      return sum + (itemPrice * itemQuantity);
    }, 0);
  }
  
  const deliveryFeeCents = Math.round((order.deliveryFee || 0) * 100);
  const serviceFeeCents = Math.round((order.serviceFee || 0) * 100);
  const taxCents = Math.round((order.tax || 0) * 100);
  const discountCents = Math.round((order.discount || 0) * 100);
  const subtotalCents = Math.round(calculatedSubtotal * 100);
  
  const totalCents = subtotalCents + deliveryFeeCents + serviceFeeCents + taxCents - discountCents;
  
  return {
    subtotal: subtotalCents / 100,
    deliveryFee: deliveryFeeCents / 100,
    serviceFee: serviceFeeCents / 100,
    tax: taxCents / 100,
    discount: discountCents / 100,
    total: totalCents / 100
  };
};

// ===== TEST RUNNER =====
async function runTests() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║        ORDER CALCULATION CONSISTENCY TEST                      ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  try {
    console.log('📦 Fetching orders from database...');
    
    // Fetch orders WITHOUT populate to avoid MenuItem schema issues
    const orders = await Order.find({ 
      status: { $in: ['confirmed', 'preparing', 'ready', 'driver_assigned', 'picked_up', 'on_the_way', 'delivered'] }
    })
    .lean()
    .limit(50);

    console.log(`✅ Found ${orders.length} orders to test\n`);

    if (orders.length === 0) {
      console.log('⚠️  No orders found in database with confirmed/active status.');
      console.log('    Checking all orders...\n');
      
      const anyOrders = await Order.countDocuments({});
      console.log(`    Total orders in database: ${anyOrders}`);
      
      if (anyOrders > 0) {
        const statuses = await Order.aggregate([
          { $group: { _id: '$status', count: { $sum: 1 } } }
        ]);
        console.log('\n    Order statuses:');
        statuses.forEach(s => console.log(`      - ${s._id}: ${s.count}`));
        
        console.log('\n    💡 Tip: Test will run on confirmed/completed orders.');
        console.log('           Place orders and change their status to see results.');
      } else {
        console.log('\n    💡 Tip: No orders exist yet. Place some orders in your app first!');
      }
      
      console.log('\n');
      mongoose.connection.close();
      process.exit(0);
    }

    let discrepanciesFound = 0;
    let totalDiscrepancyAmount = 0;
    let ordersWithoutPricing = 0;
    const issues = [];

    for (let i = 0; i < orders.length; i++) {
      const order = orders[i];
      
      console.log(`\n─────────────────────────────────────────────────────────────`);
      console.log(`Test ${i + 1}/${orders.length}: Order ${order._id}`);
      console.log(`Status: ${order.status}`);
      console.log(`Order Number: ${order.orderNumber || 'N/A'}`);
      console.log(`Created: ${new Date(order.createdAt).toLocaleString()}`);
      
      // Check if pricing object exists
      const hasPricing = order.pricing && typeof order.pricing === 'object';
      
      if (!hasPricing) {
        console.log(`⚠️  WARNING: No pricing object stored for this order`);
        ordersWithoutPricing++;
      }
      
      const oldCalc = calculateOrderTotalsOLD(order);
      const newCalc = calculateOrderTotalsNEW(order);
      
      const totalDiff = Math.abs(oldCalc.total - newCalc.total);
      const subtotalDiff = Math.abs(oldCalc.subtotal - newCalc.subtotal);
      
      console.log(`\n📊 CALCULATION COMPARISON:`);
      console.log(`┌─────────────────┬──────────────┬──────────────┬──────────────┐`);
      console.log(`│ Component       │ OLD Method   │ NEW Method   │ Difference   │`);
      console.log(`├─────────────────┼──────────────┼──────────────┼──────────────┤`);
      console.log(`│ Subtotal        │ R${oldCalc.subtotal.toFixed(2).padStart(9)} │ R${newCalc.subtotal.toFixed(2).padStart(9)} │ R${subtotalDiff.toFixed(2).padStart(9)} │`);
      console.log(`│ Delivery Fee    │ R${oldCalc.deliveryFee.toFixed(2).padStart(9)} │ R${newCalc.deliveryFee.toFixed(2).padStart(9)} │ R${Math.abs(oldCalc.deliveryFee - newCalc.deliveryFee).toFixed(2).padStart(9)} │`);
      console.log(`│ Service Fee     │ R${oldCalc.serviceFee.toFixed(2).padStart(9)} │ R${newCalc.serviceFee.toFixed(2).padStart(9)} │ R${Math.abs(oldCalc.serviceFee - newCalc.serviceFee).toFixed(2).padStart(9)} │`);
      console.log(`│ Tax             │ R${oldCalc.tax.toFixed(2).padStart(9)} │ R${newCalc.tax.toFixed(2).padStart(9)} │ R${Math.abs(oldCalc.tax - newCalc.tax).toFixed(2).padStart(9)} │`);
      console.log(`│ Discount        │ R${oldCalc.discount.toFixed(2).padStart(9)} │ R${newCalc.discount.toFixed(2).padStart(9)} │ R${Math.abs(oldCalc.discount - newCalc.discount).toFixed(2).padStart(9)} │`);
      console.log(`├─────────────────┼──────────────┼──────────────┼──────────────┤`);
      console.log(`│ TOTAL           │ R${oldCalc.total.toFixed(2).padStart(9)} │ R${newCalc.total.toFixed(2).padStart(9)} │ R${totalDiff.toFixed(2).padStart(9)} │`);
      console.log(`└─────────────────┴──────────────┴──────────────┴──────────────┘`);
      
      if (totalDiff > 0.01) {
        console.log(`\n❌ DISCREPANCY DETECTED! Total differs by R${totalDiff.toFixed(2)}`);
        discrepanciesFound++;
        totalDiscrepancyAmount += totalDiff;
        
        const diagnosis = [];
        
        if (subtotalDiff > 0.01) {
          diagnosis.push(`Subtotal mismatch (R${subtotalDiff.toFixed(2)})`);
          
          if (order.items && order.items.length > 0) {
            console.log(`\n   🔍 Item breakdown:`);
            let recalculated = 0;
            order.items.forEach((item, idx) => {
              const itemTotal = (item.price || 0) * (item.quantity || 1);
              recalculated += itemTotal;
              console.log(`      ${idx + 1}. ${item.name || 'Unknown item'}: R${(item.price || 0).toFixed(2)} x ${item.quantity || 1} = R${itemTotal.toFixed(2)}`);
            });
            console.log(`      ─────────────────────────────────────`);
            console.log(`      Calculated from items: R${recalculated.toFixed(2)}`);
            console.log(`      Stored in pricing:     R${order.pricing?.subtotal?.toFixed(2) || 'not stored'}`);
            
            if (Math.abs(recalculated - (order.pricing?.subtotal || 0)) > 0.01) {
              diagnosis.push('Items total ≠ stored subtotal');
            }
          }
        }
        
        if (!hasPricing) {
          diagnosis.push('No pricing object stored');
          console.log(`\n   ⚠️  This order has no pricing.subtotal stored`);
          console.log(`      This means it was created before pricing was being saved`);
        }
        
        // Check for floating point issues
        const floatError = totalDiff < 0.10;
        if (floatError) {
          diagnosis.push('Floating point rounding error');
          console.log(`\n   💡 This is a small floating-point rounding error (< R0.10)`);
        }
        
        issues.push({
          orderId: order._id,
          orderNumber: order.orderNumber,
          difference: totalDiff,
          diagnosis: diagnosis,
          hasPricing: hasPricing
        });
      } else {
        console.log(`\n✅ OK - Calculations match!`);
      }
    }

    // Summary
    console.log(`\n\n╔════════════════════════════════════════════════════════════════╗`);
    console.log(`║                        TEST SUMMARY                            ║`);
    console.log(`╚════════════════════════════════════════════════════════════════╝\n`);
    
    console.log(`Total orders tested:           ${orders.length}`);
    console.log(`Discrepancies found:           ${discrepanciesFound}`);
    console.log(`Orders without pricing stored: ${ordersWithoutPricing}`);
    
    if (discrepanciesFound > 0) {
      console.log(`\n❌ PROBLEM CONFIRMED!`);
      console.log(`   ${discrepanciesFound} orders have calculation discrepancies`);
      console.log(`   Total amount difference: R${totalDiscrepancyAmount.toFixed(2)}`);
      console.log(`   Average difference per order: R${(totalDiscrepancyAmount / discrepanciesFound).toFixed(2)}`);
      
      // Categorize issues
      const smallErrors = issues.filter(i => i.difference < 0.10).length;
      const mediumErrors = issues.filter(i => i.difference >= 0.10 && i.difference < 5).length;
      const largeErrors = issues.filter(i => i.difference >= 5).length;
      
      console.log(`\n   Breakdown by size:`);
      console.log(`   - Small (< R0.10):  ${smallErrors} orders (likely floating-point errors)`);
      console.log(`   - Medium (R0.10-5): ${mediumErrors} orders (likely tax/fee recalculation)`);
      console.log(`   - Large (> R5):     ${largeErrors} orders (likely price changes)`);
      
      console.log(`\n📋 AFFECTED ORDERS:\n`);
      issues.slice(0, 10).forEach((issue, idx) => {
        console.log(`   ${idx + 1}. Order ${issue.orderNumber || issue.orderId}`);
        console.log(`      Difference: R${issue.difference.toFixed(2)}`);
        console.log(`      Has pricing stored: ${issue.hasPricing ? 'Yes' : 'No'}`);
        console.log(`      Issues: ${issue.diagnosis.join(', ')}`);
      });
      
      if (issues.length > 10) {
        console.log(`\n   ... and ${issues.length - 10} more orders with discrepancies`);
      }
      
      console.log(`\n🔧 RECOMMENDED ACTIONS:\n`);
      console.log(`   1. ⚠️  CRITICAL: Replace routes/vendors.js with the fixed version`);
      console.log(`   2. Update the calculateOrderTotals function to use stored pricing`);
      console.log(`   3. Restart your backend server`);
      console.log(`   4. For future orders: Ensure payment endpoint stores complete pricing`);
      
      if (ordersWithoutPricing > 0) {
        console.log(`\n   📝 Note: ${ordersWithoutPricing} orders don't have pricing stored.`);
        console.log(`      These orders were likely created before the pricing feature was added.`);
        console.log(`      The fix will prevent this for all future orders.`);
      }
      
    } else {
      console.log(`\n✅ ALL TESTS PASSED!`);
      console.log(`   All order calculations are consistent`);
      console.log(`   No discrepancies detected`);
      
      if (ordersWithoutPricing > 0) {
        console.log(`\n   ℹ️  Note: ${ordersWithoutPricing} orders don't have stored pricing,`);
        console.log(`      but they're calculating consistently, which is good!`);
      }
      
      console.log(`\n   This means either:`);
      console.log(`   - The fix is already applied, OR`);
      console.log(`   - Your orders all have consistent pricing, OR`);
      console.log(`   - No menu prices have changed since orders were placed`);
      console.log(`\n   To be safe, still apply the fix to prevent future issues!`);
    }

    console.log(`\n`);

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('Stack trace:', error.stack);
  } finally {
    mongoose.connection.close();
    console.log('🔌 Disconnected from MongoDB');
  }
}