// uploadKoekiesImage.js - Upload image for Koekies & Kassies
require('dotenv').config();
const mongoose = require('mongoose');
const cloudinary = require('cloudinary').v2;
const Restaurant = require('./models/Restaurant');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

async function uploadKoekiesImage() {
  try {
    console.log('🍪 KOEKIES & KASSIES IMAGE UPLOAD\n');
    
    // Cookie/bakery themed image from Unsplash (royalty-free)
    // You can replace this with your own image URL
    const imageUrl = 'https://images.unsplash.com/photo-1558961363-fa8fdf82db35?w=1200&q=80';
    // Alternative cookie images:
    // 'https://images.unsplash.com/photo-1499636136210-6f4ee915583e?w=1200&q=80' // Colorful cookies
    // 'https://images.unsplash.com/photo-1486427944299-d1955d23e34d?w=1200&q=80' // Cookie shop
    
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected\n');
    
    console.log('🔍 Finding Koekies & Kassies restaurant...');
    const koekies = await Restaurant.findOne({ name: /Koekies.*Kassies/i });
    
    if (!koekies) {
      console.log('⚠️  Koekies & Kassies restaurant not found!');
      console.log('Creating restaurant entry...\n');
      
      // Create the restaurant if it doesn't exist
      const newRestaurant = new Restaurant({
        name: 'Koekies & Kassies',
        description: 'Hey, you may never know what you might find.',
        cuisine: 'Cookies',
        deliveryFee: 2.99,
        minimumOrder: 0,
        address: {
          street: 'The Angelo Mall, ,91 Heidelberg Rd, Glenverloch',
          city: 'Nigel',
          state: 'Gauteng',
          zipCode: '1941',
          country: 'South Africa',
          location: {
            type: 'Point',
            coordinates: [28.0473, -26.2041] // [lng, lat]
          }
        },
        location: {
          type: 'Point',
          coordinates: {
            latitude: -26.2041,
            longitude: 28.0473
          }
        },
        contact: {
          phone: '0836757795',
          email: 'tanyameyer74@gmail.com'
        },
        isActive: true,
        status: 'active',
        source: 'vendor_signup'
      });
      
      await newRestaurant.save();
      console.log('✅ Created Koekies & Kassies restaurant\n');
      
      // Re-fetch the restaurant
      const koekiesRestaurant = await Restaurant.findOne({ name: /Koekies.*Kassies/i });
      return uploadImageToRestaurant(koekiesRestaurant, imageUrl);
    }
    
    console.log('✅ Found Koekies & Kassies restaurant');
    console.log('   ID:', koekies._id);
    console.log('   Name:', koekies.name);
    console.log('');
    
    return uploadImageToRestaurant(koekies, imageUrl);
    
  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    console.error('\nDetails:', error);
    process.exit(1);
  }
}

async function uploadImageToRestaurant(restaurant, imageUrl) {
  try {
    console.log('📤 Uploading cookie image to Cloudinary...');
    console.log('   Source: Professional bakery/cookie image (royalty-free)');
    console.log('');
    
    const uploadResult = await cloudinary.uploader.upload(imageUrl, {
      folder: 'restaurants/koekies-kassies',
      public_id: `koekies-kassies-${Date.now()}`,
      transformation: [
        { width: 1200, height: 800, crop: 'fill', gravity: 'center', quality: 'auto' }
      ]
    });
    
    console.log('✅ Image uploaded to Cloudinary!');
    console.log('');
    console.log('📸 Image Details:');
    console.log('   URL:', uploadResult.secure_url);
    console.log('   Public ID:', uploadResult.public_id);
    console.log('   Format:', uploadResult.format);
    console.log('   Size:', (uploadResult.bytes / 1024).toFixed(2), 'KB');
    console.log('');
    
    console.log('💾 Updating restaurant in database...');
    
    // Update with new structure
    restaurant.images = restaurant.images || {};
    restaurant.images.profileImage = {
      url: uploadResult.secure_url,
      publicId: uploadResult.public_id,
      filename: 'koekies-kassies.jpg',
      uploadedAt: new Date()
    };
    restaurant.images.coverImage = {
      url: uploadResult.secure_url,
      publicId: uploadResult.public_id,
      filename: 'koekies-kassies.jpg',
      uploadedAt: new Date()
    };
    
    // Legacy fields
    restaurant.image = uploadResult.secure_url;
    restaurant.coverImage = uploadResult.secure_url;
    
    await restaurant.save();
    
    console.log('✅ Database updated!\n');
    
    console.log('='.repeat(70));
    console.log('🎉 SUCCESS!');
    console.log('='.repeat(70));
    console.log('');
    console.log('Koekies & Kassies now has a professional image hosted on Cloudinary!');
    console.log('');
    console.log('📱 Image URL (use this in your app):');
    console.log(uploadResult.secure_url);
    console.log('');
    console.log('🍪 Restaurant Details:');
    console.log('   Name:', restaurant.name);
    console.log('   Cuisine:', restaurant.cuisine);
    console.log('   Location:', restaurant.address.city);
    console.log('   Status:', restaurant.status);
    console.log('');
    console.log('💡 TIP: You can replace this with your own image later by:');
    console.log('   1. Uploading through the vendor dashboard in your app');
    console.log('   2. Or running this script again with a different imageUrl');
    console.log('   3. Or change the imageUrl variable on line 14 of this script');
    console.log('');
    
    await mongoose.connection.close();
    process.exit(0);
    
  } catch (error) {
    throw error;
  }
}

uploadKoekiesImage();