// showMcDonaldsImageURLs.js - Show actual Cloudinary URLs
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const Restaurant = require('./models/Restaurant');
const MenuItem = require('./models/MenuItem');

async function showMcDonaldsImageURLs() {
  try {
    const mongoURI = process.env.MONGODB_URI || process.env.MONGO_URI;
    
    console.log('🔍 SHOWING MCDONALDS IMAGE URLS');
    console.log('='.repeat(80));
    
    await mongoose.connect(mongoURI);
    console.log('✅ Connected to MongoDB\n');

    const mcdonalds = await Restaurant.findOne({ name: /McDonald/i });
    
    if (!mcdonalds) {
      console.log('❌ McDonald\'s not found!');
      return;
    }

    const menuItems = await MenuItem.find({ restaurant: mcdonalds._id });

    console.log(`📋 MCDONALDS MENU - FULL IMAGE DETAILS\n`);
    
    menuItems.forEach((item, index) => {
      console.log(`${index + 1}. ${item.name} - R${item.price.toFixed(2)}`);
      console.log(`   ID: ${item._id}`);
      
      if (item.image) {
        console.log(`   📸 Image Object:`);
        console.log(`      filename: "${item.image.filename || 'NULL'}"`);
        console.log(`      url: "${item.image.url || 'NULL'}"`);
        console.log(`      path: "${item.image.path || 'NULL'}"`);
        console.log(`      cloudinaryId: "${item.image.cloudinaryId || 'NULL'}"`);
        console.log(`      uploadedAt: ${item.image.uploadedAt || 'NULL'}`);
      } else {
        console.log(`   ❌ NO IMAGE OBJECT`);
      }
      console.log('');
    });

    // Check Chicken Nuggets specifically
    console.log('\n🍗 CHICKEN NUGGETS DETAILED CHECK:');
    console.log('='.repeat(80));
    
    const nuggets = menuItems.find(item => item.name.toLowerCase().includes('nugget'));
    
    if (nuggets) {
      console.log(`Name: ${nuggets.name}`);
      console.log(`\nFull Image Object:`);
      console.log(JSON.stringify(nuggets.image, null, 2));
      
      console.log(`\n\n💡 COPY THIS URL AND PASTE IN BROWSER:`);
      console.log(nuggets.image?.url || 'NO URL');
      
      console.log(`\n\n🔍 WHAT YOU SHOULD SEE:`);
      console.log(`   If database is correct, the URL above should show CHICKEN NUGGETS`);
      console.log(`   If it shows PIZZA, then Cloudinary upload failed`);
    }

    // Check crispy chicken (McChicken)
    console.log('\n\n🍗 MCCHICKEN DETAILED CHECK:');
    console.log('='.repeat(80));
    
    const mcchicken = menuItems.find(item => item.name.toLowerCase().includes('mcchicken'));
    
    if (mcchicken) {
      console.log(`Name: ${mcchicken.name}`);
      console.log(`\nFull Image Object:`);
      console.log(JSON.stringify(mcchicken.image, null, 2));
      
      console.log(`\n\n💡 COPY THIS URL AND PASTE IN BROWSER:`);
      console.log(mcchicken.image?.url || 'NO URL');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

showMcDonaldsImageURLs();