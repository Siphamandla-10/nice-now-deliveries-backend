require('dotenv').config();
const mongoose = require('mongoose');
const Restaurant = require('./models/Restaurant');

const activate = async () => {
  try {
    // ✅ Use MONGO_URI instead of MONGODB_URI
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    const result = await Restaurant.updateMany(
      {},
      { $set: { isActive: true, status: 'open' } }
    );

    console.log(`✅ Activated ${result.modifiedCount} restaurants`);
    
    const total = await Restaurant.countDocuments();
    const active = await Restaurant.countDocuments({ isActive: true });
    
    console.log(`📊 Total restaurants: ${total}`);
    console.log(`📊 Active restaurants: ${active}`);

    mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
};

activate();