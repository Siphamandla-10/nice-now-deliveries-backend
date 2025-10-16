// backend/scripts/enrichRestaurants_standalone.js
// Standalone script with no model dependencies

const mongoose = require('mongoose');
const axios = require('axios');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Configuration
const CONFIG = {
  DELAY_BETWEEN_REQUESTS: 3000,
  REQUEST_TIMEOUT: 20000,
  MAX_RETRIES: 2,
  SEARCH_RADIUS_KM: 50000,
  FALLBACK_LOCATION: {
    lat: -26.2041,
    lon: 28.0473
  }
};

/**
 * Search for a specific restaurant with multiple strategies
 */
async function searchSpecificRestaurant(restaurantName, city, retryCount = 0) {
  try {
    console.log(`\n🔍 Searching for: "${restaurantName}"${city ? ` in ${city}` : ''}`);

    let query;
    const cleanCity = city && city !== 'City' && city !== 'City to be updated' ? city : null;
    
    if (cleanCity) {
      query = `
        [out:json][timeout:15];
        area["name"~"${cleanCity}",i]["admin_level"~"[468]"]->.searchArea;
        (
          node["amenity"~"restaurant|fast_food"]["name"="${restaurantName}"](area.searchArea);
          way["amenity"~"restaurant|fast_food"]["name"="${restaurantName}"](area.searchArea);
        );
        out body 1;
      `;
    } else {
      const { lat, lon } = CONFIG.FALLBACK_LOCATION;
      query = `
        [out:json][timeout:15];
        (
          node["amenity"~"restaurant|fast_food"]["name"="${restaurantName}"](around:${CONFIG.SEARCH_RADIUS_KM},${lat},${lon});
          way["amenity"~"restaurant|fast_food"]["name"="${restaurantName}"](around:${CONFIG.SEARCH_RADIUS_KM},${lat},${lon});
        );
        out body 1;
      `;
    }

    const response = await axios.post(
      'https://overpass-api.de/api/interpreter',
      query,
      {
        headers: { 
          'Content-Type': 'text/plain',
          'User-Agent': 'NiceNowDeliveries/1.0'
        },
        timeout: CONFIG.REQUEST_TIMEOUT
      }
    );

    if (!response.data?.elements || response.data.elements.length === 0) {
      console.log(`   ⚠️ No exact match, trying fuzzy search...`);
      return await searchFuzzy(restaurantName, cleanCity);
    }

    const element = response.data.elements[0];
    
    if (!element.tags?.name || !element.lat || !element.lon) {
      console.log(`   ❌ Invalid data in match`);
      return null;
    }

    console.log(`   ✅ Found: ${element.tags.name}`);
    console.log(`   📍 Location: [${element.lat}, ${element.lon}]`);
    console.log(`   🏙️ City: ${element.tags['addr:city'] || cleanCity || 'Unknown'}`);

    return formatRestaurantData(element, cleanCity);

  } catch (error) {
    return handleSearchError(error, restaurantName, city, retryCount);
  }
}

/**
 * Fuzzy search when exact match fails
 */
async function searchFuzzy(restaurantName, city) {
  try {
    const { lat, lon } = CONFIG.FALLBACK_LOCATION;

    const query = `
      [out:json][timeout:15];
      (
        node["amenity"~"restaurant|fast_food"]["name"~"${restaurantName}",i](around:${CONFIG.SEARCH_RADIUS_KM},${lat},${lon});
        way["amenity"~"restaurant|fast_food"]["name"~"${restaurantName}",i](around:${CONFIG.SEARCH_RADIUS_KM},${lat},${lon});
      );
      out body 3;
    `;

    const response = await axios.post(
      'https://overpass-api.de/api/interpreter',
      query,
      {
        headers: { 
          'Content-Type': 'text/plain',
          'User-Agent': 'NiceNowDeliveries/1.0'
        },
        timeout: CONFIG.REQUEST_TIMEOUT
      }
    );

    if (!response.data?.elements || response.data.elements.length === 0) {
      console.log(`   ❌ No fuzzy match found`);
      return null;
    }

    const element = response.data.elements.find(el => 
      el.tags?.name && el.lat && el.lon
    );

    if (!element) {
      console.log(`   ❌ No valid fuzzy match`);
      return null;
    }

    console.log(`   ✅ Fuzzy match: ${element.tags.name}`);
    return formatRestaurantData(element, city);

  } catch (error) {
    console.log(`   ❌ Fuzzy search failed: ${error.message}`);
    return null;
  }
}

/**
 * Format restaurant data from OSM element
 */
function formatRestaurantData(element, fallbackCity) {
  return {
    name: element.tags.name,
    location: {
      type: 'Point',
      coordinates: {
        latitude: element.lat,
        longitude: element.lon
      }
    },
    address: {
      street: element.tags['addr:street'] || element.tags['addr:housenumber'] || '',
      city: element.tags['addr:city'] || fallbackCity || 'Johannesburg',
      region: element.tags['addr:province'] || element.tags['addr:state'] || 'Gauteng',
      zipCode: element.tags['addr:postcode'] || ''
    },
    contact: {
      phone: element.tags.phone || element.tags['contact:phone'] || '',
      website: element.tags.website || element.tags['contact:website'] || ''
    },
    cuisine: element.tags.cuisine || 'Various',
    osmId: element.id,
    source: 'openstreetmap',
    lastVerified: new Date()
  };
}

/**
 * Handle search errors with retry logic
 */
async function handleSearchError(error, restaurantName, city, retryCount) {
  if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
    console.log(`   ⏱️ Timeout - query took too long`);
  } else if (error.response?.status === 429) {
    console.log(`   🚦 Rate limited - waiting longer...`);
    if (retryCount < CONFIG.MAX_RETRIES) {
      await new Promise(resolve => setTimeout(resolve, 10000));
      console.log(`   🔄 Retrying (${retryCount + 1}/${CONFIG.MAX_RETRIES})...`);
      return await searchSpecificRestaurant(restaurantName, city, retryCount + 1);
    }
  } else if (error.response?.status === 504) {
    console.log(`   ⏱️ Gateway timeout - server overloaded`);
  } else if (error.code === 'ENOTFOUND') {
    console.log(`   🌐 Network error - check internet connection`);
  } else {
    console.error(`   ❌ Error: ${error.message}`);
  }
  return null;
}

/**
 * Main enrichment function
 */
async function enrichRestaurants() {
  let connection;
  
  try {
    console.log('🚀 Starting Restaurant Enrichment Script (Standalone)\n');
    console.log('⚙️ Configuration:');
    console.log(`   - Delay between requests: ${CONFIG.DELAY_BETWEEN_REQUESTS}ms`);
    console.log(`   - Request timeout: ${CONFIG.REQUEST_TIMEOUT}ms`);
    console.log(`   - Max retries: ${CONFIG.MAX_RETRIES}`);
    console.log(`   - Fallback location: Johannesburg\n`);
    
    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
    
    if (!mongoUri) {
      throw new Error('MONGO_URI or MONGODB_URI not found in environment variables');
    }
    
    console.log('Connecting to MongoDB...');
    connection = await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB\n');

    // Access the restaurants collection directly
    const db = connection.connection.db;
    const restaurantsCollection = db.collection('restaurants');

    // Get all restaurants that need location data
    const restaurants = await restaurantsCollection.find({
      $or: [
        { 'location.coordinates.latitude': { $exists: false } },
        { 'location.coordinates.latitude': null },
        { 'location.coordinates.latitude': 0 }
      ]
    }).toArray();

    console.log(`📊 Found ${restaurants.length} restaurants needing location data\n`);
    console.log('═══════════════════════════════════════════\n');

    const stats = {
      total: restaurants.length,
      updated: 0,
      notFound: 0,
      skipped: 0,
      errors: []
    };

    for (let i = 0; i < restaurants.length; i++) {
      const restaurant = restaurants[i];
      
      console.log(`[${i + 1}/${restaurants.length}] ${restaurant.name}`);
      console.log(`   Current city: ${restaurant.address?.city || 'Not set'}`);

      // Skip if already has location
      if (restaurant.location?.coordinates?.latitude && 
          restaurant.location?.coordinates?.longitude) {
        console.log(`   ⏭️ Already has location, skipping`);
        stats.skipped++;
        continue;
      }

      // Search for this restaurant
      const found = await searchSpecificRestaurant(
        restaurant.name,
        restaurant.address?.city || null
      );

      if (found) {
        try {
          // Prepare update
          const updateData = {
            location: found.location,
            osmId: found.osmId,
            source: 'openstreetmap',
            lastVerified: new Date()
          };

          // Only update if better data is found
          if (found.address.street && !restaurant.address?.street) {
            updateData['address.street'] = found.address.street;
          }
          if (found.address.city) {
            updateData['address.city'] = found.address.city;
          }
          if (found.address.region && !restaurant.address?.region) {
            updateData['address.region'] = found.address.region;
          }
          if (found.address.zipCode && !restaurant.address?.zipCode) {
            updateData['address.zipCode'] = found.address.zipCode;
          }
          if (found.contact.phone && !restaurant.contact?.phone) {
            updateData['contact.phone'] = found.contact.phone;
          }
          if (found.contact.website && !restaurant.contact?.website) {
            updateData['contact.website'] = found.contact.website;
          }
          if (found.cuisine && (!restaurant.cuisine || restaurant.cuisine === 'Various')) {
            updateData.cuisine = found.cuisine;
          }

          // Update in database
          await restaurantsCollection.updateOne(
            { _id: restaurant._id },
            { $set: updateData }
          );
          
          stats.updated++;
          console.log(`   💾 UPDATED`);
        } catch (saveError) {
          console.error(`   ❌ Save failed: ${saveError.message}`);
          stats.errors.push({ name: restaurant.name, error: saveError.message });
        }
      } else {
        stats.notFound++;
        console.log(`   ❌ NOT FOUND - Consider manual update`);
      }

      // Delay to avoid rate limiting
      if (i < restaurants.length - 1) {
        console.log(`   ⏳ Waiting ${CONFIG.DELAY_BETWEEN_REQUESTS / 1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, CONFIG.DELAY_BETWEEN_REQUESTS));
      }
    }

    console.log('\n═══════════════════════════════════════════');
    console.log('\n📊 ENRICHMENT SUMMARY:');
    console.log(`   Total restaurants: ${stats.total}`);
    console.log(`   ✅ Updated: ${stats.updated}`);
    console.log(`   ❌ Not found: ${stats.notFound}`);
    console.log(`   ⏭️ Skipped: ${stats.skipped}`);
    
    if (stats.errors.length > 0) {
      console.log(`\n⚠️ Errors encountered:`);
      stats.errors.forEach(err => {
        console.log(`   - ${err.name}: ${err.error}`);
      });
    }

    if (stats.notFound > 0) {
      console.log(`\n💡 Tip: For restaurants not found, consider:`);
      console.log(`   1. Manually updating their city to a specific location`);
      console.log(`   2. Checking if the name matches exactly on OpenStreetMap`);
      console.log(`   3. Adding coordinates manually if available`);
    }

    console.log('\n✅ Enrichment complete!');

  } catch (error) {
    console.error('\n❌ Fatal error:', error);
  } finally {
    if (connection) {
      await mongoose.disconnect();
      console.log('\n👋 Disconnected from MongoDB');
    }
    process.exit(0);
  }
}

// Run the script
enrichRestaurants();