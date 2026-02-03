const mongoose = require('mongoose');
require('dotenv').config();

const switchOwner = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB\n');

    // Update restaurant owner from delivernow@gmail.com to nice@niceglobe.com
    const result = await mongoose.connection.db.collection('restaurants').updateOne(
      { _id: new mongoose.Types.ObjectId('6929b734761ec5fc0dcd1656') },
      { 
        $set: { 
          owner: new mongoose.Types.ObjectId('6929b72f761ec5fc0dcd1654') // nice@niceglobe.com
        } 
      }
    );

    console.log('✅ Restaurant owner updated');
    console.log('   Now owned by: nice@niceglobe.com (ID: 6929b72f761ec5fc0dcd1654)');

    await mongoose.connection.close();
  } catch (error) {
    console.error('❌ Error:', error);
  }
};

switchOwner();