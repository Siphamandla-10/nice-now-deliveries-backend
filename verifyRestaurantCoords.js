// verifyRestaurantCoords.js
require('dotenv').config();
const mongoose = require('mongoose');

async function verify() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    
    const db = mongoose.connection.db;
    const kfc = await db.collection('restaurants').findOne({ name: 'KFC' });
    
    console.log('KFC location:', JSON.stringify(kfc.location, null, 2));
    
    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

verify();