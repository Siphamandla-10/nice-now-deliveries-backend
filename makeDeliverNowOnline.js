// makeDeliverNowOnline.js - Make Deliver Now Store online and available
const mongoose = require('mongoose');
require('dotenv').config();

const Restaurant = require('./models/Restaurant');

async function makeDeliverNowOnline() {
  try {
    const mongoURI = process.env.MONGODB_URI || process.env.MONGO_URI;
    
    console.log('🟢 MAKING DELIVER NOW STORE ONLINE');
    console.log('='.repeat(80));
    
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(mongoURI);
    console.log('✅ Connected\n');

    console.log('🔍 Finding Deliver Now Store...');
    const deliverNow = await Restaurant.findOne({ name: /Deliver Now Store/i });

    if (!deliverNow) {
      console.log('❌ Deliver Now Store not found!');
      await mongoose.disconnect();
      return;
    }

    console.log('✅ Found Deliver Now Store');
    console.log(`   ID: ${deliverNow._id}`);
    console.log(`   Name: ${deliverNow.name}\n`);

    // Show current status
    console.log('📊 CURRENT STATUS:');
    console.log('─'.repeat(80));
    console.log(`Status: ${deliverNow.status || 'unknown'}`);
    console.log(`Is Active: ${deliverNow.isActive}`);
    console.log(`Featured: ${deliverNow.featured || deliverNow.isFeatured || false}`);
    console.log(`Delivery Fee: R${deliverNow.deliveryFee || 0}`);
    console.log(`Minimum Order: R${deliverNow.minimumOrder || 0}`);
    console.log('');

    // Update to online and available
    console.log('🔧 Updating status...');
    
    deliverNow.status = 'open';           // Set status to 'open'
    deliverNow.isActive = true;           // Make it active
    deliverNow.featured = true;           // Make it featured (optional)
    deliverNow.isFeatured = true;         // Backup featured field
    
    // Ensure delivery settings are reasonable
    if (!deliverNow.deliveryFee || deliverNow.deliveryFee < 0) {
      deliverNow.deliveryFee = 20;        // Default R20 delivery fee
    }
    if (!deliverNow.minimumOrder || deliverNow.minimumOrder < 0) {
      deliverNow.minimumOrder = 50;       // Default R50 minimum order
    }

    deliverNow.updatedAt = new Date();
    
    await deliverNow.save({ validateBeforeSave: false });
    console.log('✅ Status updated!\n');

    // Show new status
    console.log('='.repeat(80));
    console.log('🎉 DELIVER NOW STORE IS NOW ONLINE!');
    console.log('='.repeat(80));
    console.log('\n📊 NEW STATUS:');
    console.log('─'.repeat(80));
    console.log(`✅ Status: ${deliverNow.status}`);
    console.log(`✅ Is Active: ${deliverNow.isActive}`);
    console.log(`✅ Featured: ${deliverNow.featured || deliverNow.isFeatured}`);
    console.log(`✅ Delivery Fee: R${deliverNow.deliveryFee}`);
    console.log(`✅ Minimum Order: R${deliverNow.minimumOrder}`);
    console.log('');
    console.log('='.repeat(80));
    console.log('📱 NEXT STEPS:');
    console.log('='.repeat(80));
    console.log('1. ⚠️  RESTART YOUR BACKEND SERVER:');
    console.log('   - Press Ctrl+C to stop');
    console.log('   - Run: node server.js\n');
    console.log('2. 🌐 REFRESH YOUR APP:');
    console.log('   - Web: Ctrl + Shift + R');
    console.log('   - Mobile: Force close and reopen\n');
    console.log('3. ✅ Deliver Now Store should now appear as:');
    console.log('   - Online/Open');
    console.log('   - Available for orders');
    console.log('   - Featured (if your app shows featured restaurants)\n');
    console.log('='.repeat(80));

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB\n');
  }
}

makeDeliverNowOnline();