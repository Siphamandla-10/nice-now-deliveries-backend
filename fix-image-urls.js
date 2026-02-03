const mongoose = require('mongoose');
require('dotenv').config();

const fixImageUrls = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB\n');

    const restaurantId = new mongoose.Types.ObjectId('6929b734761ec5fc0dcd1656');
    
    // Find menu items
    const menuItems = await mongoose.connection.db.collection('menuitems').find(
      { restaurant: restaurantId }
    ).toArray();
    
    console.log(`📋 Found ${menuItems.length} menu items\n`);
    
    let fixedCount = 0;
    
    for (const item of menuItems) {
      console.log(`\n🔧 Fixing: ${item.name}`);
      console.log('   Current image type:', typeof item.image);
      console.log('   Current image value:', JSON.stringify(item.image));
      
      let imageUrl = '';
      let publicId = '';
      
      // Handle different image formats
      if (typeof item.image === 'object' && item.image !== null) {
        // If it's an object, try to extract URL
        imageUrl = item.image.url || item.image.secure_url || item.image.path || '';
        publicId = item.image.public_id || item.image.publicId || '';
      } else if (typeof item.image === 'string') {
        imageUrl = item.image;
        // Try to extract public_id from URL
        const match = imageUrl.match(/\/v\d+\/(.+)\.\w+$/);
        if (match) {
          publicId = match[1];
        }
      }
      
      console.log('   Extracted URL:', imageUrl || 'NONE');
      console.log('   Extracted Public ID:', publicId || 'NONE');
      
      // Update the item
      if (imageUrl || publicId) {
        const updateData = {};
        if (imageUrl) updateData.image = imageUrl;
        if (publicId) updateData.imagePublicId = publicId;
        
        await mongoose.connection.db.collection('menuitems').updateOne(
          { _id: item._id },
          { $set: updateData }
        );
        
        console.log('   ✅ Fixed!');
        fixedCount++;
      } else {
        console.log('   ⚠️ No valid image data found - will need to re-upload');
      }
    }
    
    console.log(`\n\n✅ Fixed ${fixedCount} out of ${menuItems.length} menu items`);
    
    // Verify the fixes
    console.log('\n📸 Verification:');
    const verifyItems = await mongoose.connection.db.collection('menuitems').find(
      { restaurant: restaurantId }
    ).toArray();
    
    verifyItems.forEach(item => {
      console.log(`\n${item.name}:`);
      console.log(`   Image: ${item.image || 'NO IMAGE'}`);
      console.log(`   Public ID: ${item.imagePublicId || 'NO PUBLIC ID'}`);
    });

    await mongoose.connection.close();
  } catch (error) {
    console.error('❌ Error:', error);
  }
};

fixImageUrls();