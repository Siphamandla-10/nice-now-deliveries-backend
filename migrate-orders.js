require('dotenv').config();
const mongoose = require('mongoose');
const uri = process.env.MONGO_URI;

mongoose.connect(uri).then(async () => {
  const Order = require('./models/Order');
  const orders = await Order.find({});
  
  console.log('Found', orders.length, 'orders to recalculate\n');
  
  let fixed = 0;
  let skipped = 0;
  
  for (const order of orders) {
    try {
      if (!order.pricing || !order.pricing.subtotal) {
        console.log('⚠️  Skipping', order.orderNumber, '- missing subtotal');
        skipped++;
        continue;
      }
      
      const oldTotal = order.pricing.total;
      const oldProfit = order.pricing.platformProfit;
      
      const subtotal = order.pricing.subtotal || 0;
      const deliveryFee = order.pricing.deliveryFee || 25;
      const serviceFee = order.pricing.serviceFee || 5;
      const discount = order.pricing.discount || 0;
      const commissionRate = order.pricing.platformCommissionRate || 20;
      const driverPayout = order.pricing.driverPayout || 20;
      
      const total = subtotal + deliveryFee + serviceFee - discount;
      const commission = subtotal * (commissionRate / 100);
      const restaurantPayout = subtotal - commission;
      const platformProfit = commission + serviceFee + (deliveryFee - driverPayout);
      
      await Order.updateOne(
        { _id: order._id },
        {
          $set: {
            'pricing.total': total,
            'pricing.platformCommission': commission,
            'pricing.restaurantPayout': restaurantPayout,
            'pricing.platformProfit': platformProfit
          }
        }
      );
      
      fixed++;
      console.log(fixed + '.', order.orderNumber);
      console.log('   Old: Total=' + (oldTotal || 0).toFixed(2), 'Profit=' + (oldProfit || 0).toFixed(2));
      console.log('   New: Total=' + total.toFixed(2), 'Profit=' + platformProfit.toFixed(2));
      console.log('');
      
    } catch (err) {
      console.log('❌ Error on', order.orderNumber, ':', err.message);
      skipped++;
    }
  }
  
  console.log('\n✅ Successfully recalculated', fixed, 'orders!');
  console.log('⚠️  Skipped', skipped, 'orders');
  process.exit();
});
