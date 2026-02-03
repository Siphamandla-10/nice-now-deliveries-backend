const mongoose = require('mongoose');
require('dotenv').config();

const activateRestaurant = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    const result = await mongoose.connection.db.collection('restaurants').updateOne(
      { name: 'Deliver Now Restaurant' },
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
    
    const restaurant = await mongoose.connection.db.collection('restaurants').findOne(
      { owner: new mongoose.Types.ObjectId('68c867bd69a704433e2b56f3') }
    );
    
    console.log('Restaurant status:', {
      name: restaurant?.name,
      isActive: restaurant?.isActive,
      status: restaurant?.status
    });

    await mongoose.connection.close();
  } catch (error) {
    console.error('Error:', error);
  }
};

activateRestaurant();