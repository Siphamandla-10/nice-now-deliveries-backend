// updateWimpyCoffeeImage.js - Add image to existing Wimpy Coffee item
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const cloudinary = require('cloudinary').v2;
require('dotenv').config({ path: path.join(__dirname, '.env') });

const Restaurant = require('./models/Restaurant');
const MenuItem = require('./models/MenuItem');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

async function updateWimpyCoffeeImage() {
  try {
    const mongoURI = process.env.MONGODB_URI || process.env.MONGO_URI;
    
    console.log('☕ UPDATING WIMPY COFFEE IMAGE');
    console.log('='.repeat(80));
    
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(mongoURI);
    console.log('✅ Connected\n');

    // Find Wimpy
    const wimpy = await Restaurant.findOne({ 
      name: /Wimpy/i 
    });

    if (!wimpy) {
      console.log('❌ Wimpy not found!');
      return;
    }

    console.log('📊 RESTAURANT:');
    console.log(`   ID: ${wimpy._id}`);
    console.log(`   Name: ${wimpy.name}\n`);

    // Find Wimpy Coffee
    const wimpyCoffee = await MenuItem.findOne({
      restaurant: wimpy._id,
      name: /Wimpy Coffee/i
    });

    if (!wimpyCoffee) {
      console.log('❌ Wimpy Coffee not found in menu!');
      return;
    }

    console.log('☕ FOUND WIMPY COFFEE:');
    console.log(`   Name: ${wimpyCoffee.name}`);
    console.log(`   ID: ${wimpyCoffee._id}`);
    console.log(`   Price: R${wimpyCoffee.price.toFixed(2)}`);
    console.log(`   Category: ${wimpyCoffee.category}`);
    console.log(`   Current image: ${wimpyCoffee.image?.url || 'NONE'}\n`);

    // Path to menu images
    const menuImagesPath = path.join(__dirname, 'uploads', 'menu-items');
    
    if (!fs.existsSync(menuImagesPath)) {
      console.log('❌ Menu images folder not found!');
      console.log(`   Expected: ${menuImagesPath}`);
      return;
    }

    console.log(`📂 Looking for images in: ${menuImagesPath}`);

    // Read available images
    const files = fs.readdirSync(menuImagesPath);
    const imageFiles = files.filter(file => 
      /\.(jpg|jpeg|png|webp|gif)$/i.test(file)
    );

    console.log(`✅ Found ${imageFiles.length} total image files`);

    // Look for wimpy coffee image - flexible matching
    const possibleNames = [
      'wimpy-coffee',
      'wimpy coffee',
      'wimpycoffee',
      'wimpy_coffee'
    ];
    
    let matchedFile = null;

    for (const name of possibleNames) {
      const found = imageFiles.find(f => {
        const fileNameOnly = f.replace(/\.(jpg|jpeg|png|webp|gif)$/i, '').toLowerCase();
        return fileNameOnly === name.toLowerCase();
      });
      if (found) {
        matchedFile = found;
        break;
      }
    }

    console.log(`\n🔍 Checking for Wimpy Coffee image:`);
    console.log(`   ${matchedFile ? `✅ Found: ${matchedFile}` : '❌ NOT FOUND'}`);

    if (!matchedFile) {
      console.log('\n❌ Image file not found!');
      console.log('💡 Add one of these files to uploads/menu-items/:');
      console.log('   - wimpy-coffee.jpg (or .jpeg, .png)');
      console.log('   - wimpy coffee.jpg (or .jpeg, .png)');
      console.log('   - wimpycoffee.jpg (or .jpeg, .png)');
      console.log('\nAvailable files in folder:');
      imageFiles.slice(0, 10).forEach(f => console.log(`   - ${f}`));
      if (imageFiles.length > 10) {
        console.log(`   ... and ${imageFiles.length - 10} more`);
      }
      return;
    }

    console.log('\n\n🔄 UPLOADING IMAGE:');
    console.log('='.repeat(80));

    const filePath = path.join(menuImagesPath, matchedFile);

    try {
      console.log('📤 Uploading to Cloudinary...');

      const result = await cloudinary.uploader.upload(filePath, {
        folder: 'nice-now-deliveries/menu-items/wimpy',
        public_id: `wimpy-coffee-${Date.now()}`,
        overwrite: true,
        invalidate: true,
        transformation: [
          { width: 500, height: 500, crop: 'fit' },
          { quality: 'auto:good' }
        ]
      });

      console.log('✅ Image uploaded to Cloudinary!');
      console.log(`   URL: ${result.secure_url}\n`);

      // Update the menu item
      wimpyCoffee.image = {
        filename: matchedFile,
        path: result.secure_url,
        url: result.secure_url,
        uploadedAt: new Date(),
        cloudinaryId: result.public_id
      };

      await wimpyCoffee.save();
      console.log('✅ Database updated!\n');

    } catch (uploadError) {
      console.log('❌ Image upload failed:', uploadError.message);
      console.error(uploadError);
      return;
    }

    // Verification
    console.log('\n🔍 VERIFICATION:');
    console.log('='.repeat(80));
    
    const updatedCoffee = await MenuItem.findById(wimpyCoffee._id);

    console.log('☕ UPDATED WIMPY COFFEE:');
    console.log(`   Name: ${updatedCoffee.name}`);
    console.log(`   Price: R${updatedCoffee.price.toFixed(2)}`);
    console.log(`   Category: ${updatedCoffee.category}`);
    console.log(`   Has image: ${updatedCoffee.image?.url ? '✅' : '❌'}`);
    if (updatedCoffee.image?.url) {
      console.log(`   Image filename: ${updatedCoffee.image.filename}`);
      console.log(`   Image URL: ${updatedCoffee.image.url}`);
    }

    console.log('\n\n🎉 SUCCESS!');
    console.log('='.repeat(80));
    console.log('✅ Wimpy Coffee image added!');
    console.log('✅ Uploaded to Cloudinary!');
    console.log('✅ Database updated!');
    console.log('\n💡 Next steps:');
    console.log('   1. Restart backend server');
    console.log('   2. Refresh/reinstall app');
    console.log('   3. Wimpy Coffee should now show with image!');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

updateWimpyCoffeeImage();