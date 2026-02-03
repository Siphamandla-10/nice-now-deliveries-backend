// checkDeliverNowImages.js - Check current images in database
const mongoose = require('mongoose');
require('dotenv').config();

const Restaurant = require('./models/Restaurant');

async function checkImages() {
  try {
    const mongoURI = process.env.MONGODB_URI || process.env.MONGO_URI;
    
    console.log('🔍 CHECKING DELIVER NOW STORE IMAGES');
    console.log('='.repeat(80));
    
    await mongoose.connect(mongoURI);
    console.log('✅ Connected to MongoDB\n');

    // Find Deliver Now Store
    const deliverNow = await Restaurant.findOne({ name: /Deliver Now Store/i });

    if (!deliverNow) {
      console.log('❌ Deliver Now Store not found!');
      await mongoose.disconnect();
      return;
    }

    console.log('📋 CURRENT DATABASE VALUES:');
    console.log('─'.repeat(80));
    console.log(`Restaurant ID: ${deliverNow._id}`);
    console.log(`Name: ${deliverNow.name}`);
    console.log('');
    console.log('Profile Image (image field):');
    console.log(`  ${deliverNow.image || 'NULL/EMPTY'}`);
    console.log('');
    console.log('Cover Image (coverImage field):');
    console.log(`  ${deliverNow.coverImage || 'NULL/EMPTY'}`);
    console.log('');
    
    // Check all image-related fields
    console.log('📸 ALL IMAGE FIELDS IN DOCUMENT:');
    console.log('─'.repeat(80));
    const imageFields = ['image', 'coverImage', 'logo', 'banner', 'thumbnail', 'profileImage'];
    imageFields.forEach(field => {
      if (deliverNow[field]) {
        console.log(`${field}: ${deliverNow[field]}`);
      }
    });
    console.log('');
    
    // Show full document
    console.log('📄 FULL DOCUMENT (RAW):');
    console.log('─'.repeat(80));
    console.log(JSON.stringify(deliverNow.toObject(), null, 2));
    console.log('');
    console.log('='.repeat(80));

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB\n');
  }
}

checkImages();