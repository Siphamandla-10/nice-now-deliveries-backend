// scripts/migrateOrders.js
const mongoose = require('mongoose');
const Order = require('../models/Order');
require('dotenv').config();

async function migrateOrders() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    const orders = await Order.find({}).lean();
    console.log(`📦 Found ${orders.length} orders to migrate`);

    let updated = 0;
    let skipped = 0;

    for (const order of orders) {
      const needsUpdate = 
        !order.payment?.method ||
        !order.deliveryAddress?.contactPhone ||
        !order.pricing ||
        order.items?.some(item => !item.subtotal);

      if (needsUpdate) {
        const updateData = {};

        // Fix payment if missing
        if (!order.payment?.method) {
          updateData['payment.method'] = 'cash';
          updateData['payment.status'] = order.payment?.status || 'pending';
        }

        // Fix deliveryAddress if missing contactPhone
        if (!order.deliveryAddress?.contactPhone) {
          updateData['deliveryAddress.contactPhone'] = order.user?.phone || '0000000000';
        }

        // Fix pricing if missing
        if (!order.pricing) {
          updateData['pricing'] = {
            subtotal: order.subtotal || 0,
            deliveryFee: order.deliveryFee || 25,
            serviceFee: order.serviceFee || 5,
            discount: 0,
            total: order.total || 0,
            platformCommissionRate: 20,
            driverPayout: 20
          };
        }

        // Fix items subtotal if missing
        if (order.items) {
          const fixedItems = order.items.map(item => ({
            ...item,
            subtotal: item.subtotal || (item.price * item.quantity)
          }));
          updateData['items'] = fixedItems;
        }

        await Order.updateOne(
          { _id: order._id },
          { $set: updateData },
          { runValidators: false }
        );

        updated++;
        if (updated % 10 === 0) {
          console.log(`✅ Updated ${updated} orders...`);
        }
      } else {
        skipped++;
      }
    }

    console.log('\n✅ Migration complete!');
    console.log(`   Updated: ${updated} orders`);
    console.log(`   Skipped: ${skipped} orders (already valid)`);

    await mongoose.connection.close();
  } catch (error) {
    console.error('❌ Migration error:', error);
    process.exit(1);
  }
}

migrateOrders();