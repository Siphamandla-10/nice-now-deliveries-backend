
require('dotenv').config();
const mongoose = require('mongoose');
const MONGO_URI = process.env.MONGO_URI;
const OLD_IP = '192.168.1.114';  // or whatever old IP was in the DB
const NEW_IP = '192.168.1.116';
async function fixImageUrls() {
  try {
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB');

    const db = mongoose.connection.db;

    // Update menu items
    console.log('🍔 Updating menu item images...');
    const menuResult = await db.collection('menuitems').updateMany(
      {
        $or: [
          { "image.url": { $regex: OLD_IP } },
          { "images.mainImage.url": { $regex: OLD_IP } }
        ]
      },
      [
        {
          $set: {
            "image.url": {
              $replaceOne: {
                input: { $ifNull: ["$image.url", ""] },
                find: OLD_IP,
                replacement: NEW_IP
              }
            },
            "images.mainImage.url": {
              $replaceOne: {
                input: { $ifNull: ["$images.mainImage.url", ""] },
                find: OLD_IP,
                replacement: NEW_IP
              }
            }
          }
        }
      ]
    );
    console.log(`✓ Menu items updated: ${menuResult.modifiedCount}`);

    // Also update mainImageUrl field if it exists
    const mainImageUrlResult = await db.collection('menuitems').updateMany(
      { "mainImageUrl": { $regex: OLD_IP } },
      [
        {
          $set: {
            "mainImageUrl": {
              $replaceOne: {
                input: "$mainImageUrl",
                find: OLD_IP,
                replacement: NEW_IP
              }
            }
          }
        }
      ]
    );
    console.log(`✓ mainImageUrl fields updated: ${mainImageUrlResult.modifiedCount}`);

    await mongoose.disconnect();
    console.log('✅ All image URLs fixed!');
    console.log(`Old IP: ${OLD_IP} → New IP: ${NEW_IP}`);
   
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

fixImageUrls();