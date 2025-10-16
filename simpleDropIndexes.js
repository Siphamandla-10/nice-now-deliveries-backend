// simpleDropIndexes.js - Run this ONCE to fix the database
// This version doesn't need .env file

const mongoose = require('mongoose');

// MongoDB Atlas connection string
const MONGODB_URI = 'mongodb+srv://sphakhumalo610:Aphiwe%402018@cluster0.cxs0hbt.mongodb.net/food-delivery?retryWrites=true&w=majority&appName=Cluster0';

async function dropOldIndexes() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    console.log('Database:', MONGODB_URI.split('/').pop().split('?')[0]);
    
    await mongoose.connect(MONGODB_URI);
    
    console.log('✅ Connected to MongoDB\n');
    
    const db = mongoose.connection.db;
    
    console.log('📊 Checking Users collection...');
    const usersCollection = db.collection('users');
    
    // Count documents
    const userCount = await usersCollection.countDocuments();
    console.log(`Found ${userCount} users in database`);
    
    // Get all indexes
    const indexes = await usersCollection.indexes();
    console.log('\nCurrent indexes:');
    indexes.forEach(idx => {
      console.log(`  - ${idx.name}:`, JSON.stringify(idx.key));
    });
    
    // Drop the problematic location index
    console.log('\n🗑️  Dropping old location index...');
    try {
      await usersCollection.dropIndex('location_2dsphere');
      console.log('✅ Dropped location_2dsphere index');
    } catch (err) {
      if (err.message.includes('index not found')) {
        console.log('ℹ️  Index already dropped or doesn\'t exist');
      } else {
        console.log('⚠️  Could not drop index:', err.message);
      }
    }
    
    // Drop ALL indexes and recreate fresh
    console.log('\n🔨 Dropping all indexes (except _id)...');
    try {
      await usersCollection.dropIndexes();
      console.log('✅ Dropped all indexes');
    } catch (err) {
      console.log('⚠️ ', err.message);
    }
    
    console.log('\n🔨 Recreating indexes with correct format...');
    
    // Create location index with correct array format
    await usersCollection.createIndex(
      { 'location': '2dsphere' },
      { name: 'location_2dsphere' }
    );
    console.log('✅ Created location_2dsphere index');
    
    // Create other necessary indexes
    await usersCollection.createIndex({ email: 1 }, { unique: true });
    console.log('✅ Created email index');
    
    await usersCollection.createIndex({ phone: 1 });
    console.log('✅ Created phone index');
    
    await usersCollection.createIndex({ userType: 1 });
    console.log('✅ Created userType index');
    
    await usersCollection.createIndex({ city: 1, isActive: 1 });
    console.log('✅ Created city + isActive index');
    
    // Verify new indexes
    const newIndexes = await usersCollection.indexes();
    console.log('\n📊 New indexes:');
    newIndexes.forEach(idx => {
      console.log(`  - ${idx.name}:`, JSON.stringify(idx.key));
    });
    
    console.log('\n✅ ALL DONE! Now restart your server and try registration again.');
    
    await mongoose.connection.close();
    console.log('🔌 Disconnected from MongoDB\n');
    
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

console.log('='.repeat(60));
console.log('DROP OLD INDEXES SCRIPT');
console.log('='.repeat(60));
console.log('This will fix the GeoJSON location index issue\n');

dropOldIndexes();