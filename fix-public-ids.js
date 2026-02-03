const mongoose = require('mongoose');
require('dotenv').config();

const fixPublicIds = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB\n');

    const restaurantId = new mongoose.Types.ObjectId('6929b734761ec5fc0dcd1656');
    
    // Find menu items
    const menuItems = await mongoose.connection.db.collection('menuitems').find(
      { restaurant: restaurantId }
    ).toArray();
    
    console.log(`📋 Updating public IDs for ${menuItems.length} menu items\n`);
    
    for (const item of menuItems) {
      console.log(`🔧 ${item.name}`);
      
      // Extract public ID from URL
      const url = item.image;
      let publicId = '';
      
      if (url) {
        // Extract from URL pattern: /v1234567890/menu-items/xyz.jpg
        const match = url.match(/\/v\d+\/(menu-items\/[^\.]+)/);
        if (match) {
          publicId = match[1];
        }
      }
      
      if (publicId) {
        await mongoose.connection.db.collection('menuitems').updateOne(
          { _id: item._id },
          { $set: { imagePublicId: publicId } }
        );
        console.log(`   ✅ Set public ID: ${publicId}`);
      } else {
        console.log(`   ⚠️ Could not extract public ID from URL`);
      }
    }
    
    console.log('\n\n📸 Final Verification:');
    const verifyItems = await mongoose.connection.db.collection('menuitems').find(
      { restaurant: restaurantId }
    ).toArray();
    
    verifyItems.forEach(item => {
      console.log(`\n${item.name}:`);
      console.log(`   Image: ${item.image}`);
      console.log(`   Public ID: ${item.imagePublicId || 'MISSING'}`);
    });

    await mongoose.connection.close();
    console.log('\n✅ Done!');
  } catch (error) {
    console.error('❌ Error:', error);
  }
};

fixPublicIds();