const mongoose = require('mongoose');
require('dotenv').config();

const fixRestaurant = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB\n');

    // Update the "Deliver Now Store" restaurant
    const result = await mongoose.connection.db.collection('restaurants').updateOne(
      { _id: new mongoose.Types.ObjectId('6929b734761ec5fc0dcd1656') },
      { 
        $set: { 
          owner: new mongoose.Types.ObjectId('68c867bd69a704433e2b56f3'),
          isActive: true,
          status: 'active',
          lastVerified: new Date()
        } 
      }
    );

    console.log('✅ Restaurant updated:', result.modifiedCount, 'document(s)');

    // Verify the update
    const restaurant = await mongoose.connection.db.collection('restaurants').findOne(
      { _id: new mongoose.Types.ObjectId('6929b734761ec5fc0dcd1656') }
    );

    console.log('\n📋 Restaurant Details:');
    console.log('   Name:', restaurant.name);
    console.log('   Owner:', restaurant.owner);
    console.log('   isActive:', restaurant.isActive);
    console.log('   status:', restaurant.status);
    console.log('   Email:', restaurant.contact?.email);

    // Double check vendor can find it
    const vendorCheck = await mongoose.connection.db.collection('restaurants').findOne(
      { owner: new mongoose.Types.ObjectId('68c867bd69a704433e2b56f3') }
    );

    console.log('\n🔍 Vendor Restaurant Check:');
    if (vendorCheck) {
      console.log('   ✅ Vendor can now access restaurant:', vendorCheck.name);
    } else {
      console.log('   ❌ Still not found for vendor');
    }

    await mongoose.connection.close();
  } catch (error) {
    console.error('❌ Error:', error);
  }
};

fixRestaurant();