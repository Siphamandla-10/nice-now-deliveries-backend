const mongoose = require('mongoose');
require('dotenv').config();

const checkMenuItems = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB\n');

    const restaurantId = new mongoose.Types.ObjectId('6929b734761ec5fc0dcd1656');
    
    // Find the restaurant
    const restaurant = await mongoose.connection.db.collection('restaurants').findOne(
      { _id: restaurantId }
    );
    
    console.log('🏪 Restaurant:', restaurant?.name);
    console.log('   Owner:', restaurant?.owner);
    console.log('   Contact Email:', restaurant?.contact?.email);
    
    // Find menu items for this restaurant
    const menuItems = await mongoose.connection.db.collection('menuitems').find(
      { restaurant: restaurantId }
    ).toArray();
    
    console.log(`\n📋 Menu Items: ${menuItems.length} found\n`);
    
    if (menuItems.length === 0) {
      console.log('❌ No menu items found for this restaurant');
      console.log('\n🔍 Searching for menu items without restaurant link...');
      
      const orphanedItems = await mongoose.connection.db.collection('menuitems').find({
        restaurant: { $exists: false }
      }).toArray();
      
      console.log(`Found ${orphanedItems.length} orphaned menu items`);
    } else {
      menuItems.forEach((item, index) => {
        console.log(`${index + 1}. ${item.name}`);
        console.log(`   Price: R${item.price}`);
        console.log(`   Category: ${item.category || 'N/A'}`);
        console.log(`   Available: ${item.isAvailable}`);
        console.log(`   Image: ${item.image || 'No image'}`);
        console.log(`   Image Public ID: ${item.imagePublicId || 'N/A'}`);
        console.log(`   Restaurant ID: ${item.restaurant}`);
        console.log('');
      });
    }
    
    // Check for menu items from other restaurants
    console.log('\n🔍 Checking all menu items in database...');
    const allItems = await mongoose.connection.db.collection('menuitems').find({}).toArray();
    console.log(`Total menu items in database: ${allItems.length}`);
    
    // Group by restaurant
    const byRestaurant = {};
    allItems.forEach(item => {
      const restId = item.restaurant?.toString() || 'no-restaurant';
      if (!byRestaurant[restId]) {
        byRestaurant[restId] = [];
      }
      byRestaurant[restId].push(item);
    });
    
    console.log('\n📊 Menu items by restaurant:');
    for (const [restId, items] of Object.entries(byRestaurant)) {
      if (restId === 'no-restaurant') {
        console.log(`   No Restaurant: ${items.length} items`);
      } else {
        const rest = await mongoose.connection.db.collection('restaurants').findOne(
          { _id: new mongoose.Types.ObjectId(restId) }
        );
        console.log(`   ${rest?.name || 'Unknown'} (${restId}): ${items.length} items`);
      }
    }

    await mongoose.connection.close();
  } catch (error) {
    console.error('❌ Error:', error);
  }
};

checkMenuItems();