require('dotenv').config();
const mongoose = require('mongoose');
const Restaurant = require('./models/Restaurant');

const MONGO_URI = process.env.MONGO_URI;

mongoose.connect(MONGO_URI)
  .then(async () => {
    console.log('Connected to MongoDB\n');
    
    console.log('=== UPDATING TO LOCAL URLs ===');
    
    await Restaurant.updateOne(
      { _id: '68e53d7533525704fad1a198' },
      {
        $set: {
          'image': 'http://192.168.1.116:5000/uploads/restaurants/The Hot Pot Kitchen.jpg',
          'coverImage': 'http://192.168.1.116:5000/uploads/restaurants/The Hot Pot Kitchen.jpg'
        }
      }
    );
    console.log('✓ Updated The Hot Pot Kitchen to local URL');
    
    await Restaurant.updateOne(
      { _id: '68e55c17a2961d734aa2076c' },
      {
        $set: {
          'image': 'http://192.168.1.116:5000/uploads/restaurants/SIBA- The Restaurant.jpg',
          'coverImage': 'http://192.168.1.116:5000/uploads/restaurants/SIBA- The Restaurant.jpg'
        }
      }
    );
    console.log('✓ Updated SIBA- The Restaurant to local URL');
    
    await Restaurant.updateOne(
      { _id: '68e55fd3a2961d734aa20856' },
      {
        $set: {
          'image': 'http://192.168.1.116:5000/uploads/restaurants/Pitso`s Kitchen.jpg',
          'coverImage': 'http://192.168.1.116:5000/uploads/restaurants/Pitso`s Kitchen.jpg'
        }
      }
    );
    console.log('✓ Updated Pitso`s Kitchen to local URL');
    
    console.log('\n✅ All restaurants updated with LOCAL URLs!');
    console.log('Make sure image files are in: backend/uploads/restaurants/');
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Error:', err);
    process.exit(1);
  });