// routes/restaurants.js - COMPLETE FIXED VERSION with all routes

const express = require('express');
const router = express.Router();
const axios = require('axios');
const Restaurant = require('../models/Restaurant');
const MenuItem = require('../models/MenuItem');
const { authMiddleware } = require('../middleware/auth');

/**
 * Calculate distance between two coordinates (km)
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Format a readable address
 */
function formatAddress(tags) {
  const parts = [];
  
  if (tags['addr:housenumber'] && tags['addr:street']) {
    parts.push(`${tags['addr:housenumber']} ${tags['addr:street']}`);
  } else if (tags['addr:street']) {
    parts.push(tags['addr:street']);
  }
  
  if (tags['addr:suburb']) parts.push(tags['addr:suburb']);
  if (tags['addr:city']) parts.push(tags['addr:city']);
  if (tags['addr:postcode']) parts.push(tags['addr:postcode']);
  
  return parts.join(', ') || 'Address not available';
}

/**
 * Find ALL real locations of a restaurant chain near user
 */
async function findNearbyLocations(restaurantName, userLat, userLng, radiusKm = 10) {
  try {
    console.log(`🔍 Finding all "${restaurantName}" locations within ${radiusKm}km`);

    const query = `
      [out:json][timeout:25];
      (
        node["amenity"~"restaurant|fast_food"]["name"~"^${restaurantName}$",i](around:${radiusKm * 1000},${userLat},${userLng});
        way["amenity"~"restaurant|fast_food"]["name"~"^${restaurantName}$",i](around:${radiusKm * 1000},${userLat},${userLng});
      );
      out body;
    `;

    const response = await axios.post(
      'https://overpass-api.de/api/interpreter',
      query,
      {
        headers: { 
          'Content-Type': 'text/plain',
          'User-Agent': 'NiceNowDeliveries/1.0'
        },
        timeout: 30000
      }
    );

    if (!response.data?.elements || response.data.elements.length === 0) {
      console.log(`   ❌ No locations found`);
      return [];
    }

    const locations = response.data.elements
      .filter(element => element.tags?.name && element.lat && element.lon)
      .map(element => {
        const distance = calculateDistance(userLat, userLng, element.lat, element.lon);
        
        const street = element.tags['addr:street'] || '';
        const suburb = element.tags['addr:suburb'] || '';
        const city = element.tags['addr:city'] || '';
        
        let locationName = restaurantName;
        if (suburb) {
          locationName = `${restaurantName} - ${suburb}`;
        } else if (street) {
          locationName = `${restaurantName} - ${street}`;
        } else if (city) {
          locationName = `${restaurantName} - ${city}`;
        }

        return {
          osmId: element.id,
          name: locationName,
          baseName: restaurantName,
          location: {
            type: 'Point',
            coordinates: {
              latitude: element.lat,
              longitude: element.lon
            }
          },
          address: {
            street: street,
            suburb: suburb,
            city: city,
            region: element.tags['addr:province'] || element.tags['addr:state'] || '',
            zipCode: element.tags['addr:postcode'] || '',
            full: formatAddress(element.tags)
          },
          contact: {
            phone: element.tags.phone || element.tags['contact:phone'] || '',
            website: element.tags.website || element.tags['contact:website'] || ''
          },
          cuisine: element.tags.cuisine || '',
          distance: parseFloat(distance.toFixed(2)),
          openingHours: element.tags.opening_hours || '',
          source: 'openstreetmap'
        };
      })
      .sort((a, b) => a.distance - b.distance);

    console.log(`   ✅ Found ${locations.length} locations`);
    return locations;

  } catch (error) {
    console.error(`   ❌ Error: ${error.message}`);
    return [];
  }
}

// ==================== SPECIFIC ROUTES FIRST (BEFORE PARAMETERIZED ROUTES) ====================

/**
 * GET /api/restaurants/enrich-all
 * Admin endpoint: Search and update existing restaurants (for setup only)
 */
router.get('/enrich-all', authMiddleware, async (req, res) => {
  try {
    const { userLat, userLng, limit = 10 } = req.query;
    
    console.log('📋 Starting enrichment...');

    const restaurants = await Restaurant.find({
      $or: [
        { 'location.coordinates.latitude': { $exists: false } },
        { 'location.coordinates.latitude': null },
        { 'location.coordinates.latitude': 0 }
      ]
    }).limit(parseInt(limit));

    const results = {
      total: restaurants.length,
      updated: 0,
      notFound: 0,
      details: []
    };

    for (const restaurant of restaurants) {
      console.log(`\n🔍 ${restaurant.name}`);

      if (userLat && userLng) {
        const locations = await findNearbyLocations(
          restaurant.name,
          parseFloat(userLat),
          parseFloat(userLng),
          50
        );

        if (locations.length > 0) {
          const closest = locations[0];
          restaurant.location = closest.location;
          restaurant.osmId = closest.osmId;
          restaurant.source = 'openstreetmap';
          restaurant.lastVerified = new Date();
          
          if (closest.address.city) restaurant.address.city = closest.address.city;
          if (closest.cuisine) restaurant.cuisine = closest.cuisine;
          
          await restaurant.save();
          results.updated++;
          console.log(`   ✅ Updated`);
        } else {
          results.notFound++;
          console.log(`   ❌ Not found`);
        }
      }

      results.details.push({
        name: restaurant.name,
        status: locations?.length > 0 ? 'updated' : 'not_found'
      });

      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    res.json({
      success: true,
      message: 'Enrichment complete',
      results
    });

  } catch (error) {
    console.error('❌ Enrichment error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to enrich restaurants',
      error: error.message
    });
  }
});

// ==================== PARAMETERIZED ROUTES ====================

/**
 * GET /api/restaurants/:id/menu
 * Get restaurant menu items - MUST BE BEFORE /:id route
 */
router.get('/:id/menu', async (req, res) => {
  try {
    const { id } = req.params;

    console.log(`📍 GET /api/restaurants/${id}/menu`);

    // Check if restaurant exists
    const restaurant = await Restaurant.findById(id);

    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: 'Restaurant not found'
      });
    }

    // Get menu items for this restaurant
    const menuItems = await MenuItem.find({
      restaurant: id,
      isAvailable: true
    })
    .sort({ category: 1, name: 1 })
    .lean();

    console.log(`   ✅ Found ${menuItems.length} menu items`);

    // Group by category
    const menuByCategory = {};
    menuItems.forEach(item => {
      const category = item.category || 'Other';
      if (!menuByCategory[category]) {
        menuByCategory[category] = [];
      }
      menuByCategory[category].push(item);
    });

    res.json({
      success: true,
      menu: menuItems,
      menuByCategory: menuByCategory,
      total: menuItems.length,
      restaurant: {
        id: restaurant._id,
        name: restaurant.name
      }
    });

  } catch (error) {
    console.error('❌ Get restaurant menu error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get restaurant menu',
      error: error.message
    });
  }
});

/**
 * GET /api/restaurants/:name/locations
 * Get all locations for a specific restaurant chain
 */
router.get('/:name/locations', async (req, res) => {
  try {
    const { name } = req.params;
    const { lat, lng, radius = 10 } = req.query;

    if (!lat || !lng) {
      return res.status(400).json({
        success: false,
        message: 'User location (lat, lng) is required'
      });
    }

    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);
    const radiusKm = parseFloat(radius);

    const restaurant = await Restaurant.findOne({ 
      name: new RegExp(`^${name}$`, 'i'),
      isActive: true 
    }).lean();

    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: `Restaurant "${name}" not found in database`
      });
    }

    const locations = await findNearbyLocations(
      restaurant.name,
      latitude,
      longitude,
      radiusKm
    );

    const locationsWithDetails = locations.map(location => ({
      ...location,
      images: restaurant.images || [],
      rating: restaurant.rating || 4.0,
      deliveryFee: restaurant.deliveryFee || 0,
      estimatedDeliveryTime: restaurant.estimatedDeliveryTime || '30-45 min',
      minimumOrder: restaurant.minimumOrder || 0,
      cuisine: location.cuisine || restaurant.cuisine
    }));

    res.json({
      success: true,
      restaurant: restaurant.name,
      locations: locationsWithDetails,
      total: locationsWithDetails.length,
      userLocation: { lat: latitude, lng: longitude },
      radius: radiusKm
    });

  } catch (error) {
    console.error('❌ Get locations error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get restaurant locations',
      error: error.message
    });
  }
});

/**
 * GET /api/restaurants/:id
 * Get single restaurant details by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    console.log(`📍 GET /api/restaurants/${id}`);

    const restaurant = await Restaurant.findById(id).lean();

    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: 'Restaurant not found'
      });
    }

    // Format restaurant data
    const formattedRestaurant = {
      ...restaurant,
      displayName: restaurant.name,
      image: restaurant.images?.coverImage?.url || 
             restaurant.images?.profileImage?.url ||
             restaurant.coverImage ||
             restaurant.image ||
             `https://ui-avatars.com/api/?name=${encodeURIComponent(restaurant.name)}&size=400&background=C444C7&color=fff&bold=true`,
      available: restaurant.isActive && restaurant.status === 'active'
    };

    console.log(`   ✅ Found restaurant: ${restaurant.name}`);

    res.json({
      success: true,
      restaurant: formattedRestaurant
    });

  } catch (error) {
    console.error('❌ Get restaurant details error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get restaurant details',
      error: error.message
    });
  }
});

// ==================== MAIN ROUTES ====================

/**
 * GET /api/restaurants
 * Main endpoint - Shows all restaurants with real nearby locations (Uber Eats style)
 */
router.get('/', async (req, res) => {
  try {
    const { 
      lat, 
      lng, 
      radius = 10,
      city, 
      cuisine,
      search,
      limit = 50,
      expandLocations = 'false'
    } = req.query;

    console.log('📍 GET /api/restaurants:', { lat, lng, radius, expandLocations });

    // Build query for database restaurants
    const query = { isActive: true };

    if (city) query['address.city'] = new RegExp(city, 'i');
    if (cuisine) query.cuisine = new RegExp(cuisine, 'i');
    if (search) query.name = new RegExp(search, 'i');

    // Get base restaurants from database
    const dbRestaurants = await Restaurant.find(query)
      .select('name cuisine images rating deliveryFee estimatedDeliveryTime minimumOrder isChain location address')
      .limit(parseInt(limit))
      .lean();

    console.log(`📊 Found ${dbRestaurants.length} restaurants in database`);

    // ===== MODE 1: No location provided - Return ALL database restaurants =====
    if (!lat || !lng) {
      console.log('📋 No location provided - returning all database restaurants');
      
      const formattedRestaurants = dbRestaurants.map(restaurant => ({
        ...restaurant,
        displayName: restaurant.name,
        image: restaurant.images?.coverImage?.url || 
               restaurant.images?.profileImage?.url ||
               restaurant.coverImage ||
               restaurant.image ||
               `https://ui-avatars.com/api/?name=${encodeURIComponent(restaurant.name)}&size=400&background=C444C7&color=fff&bold=true`,
        available: true
      }));

      return res.json({
        success: true,
        restaurants: formattedRestaurants,
        total: formattedRestaurants.length,
        mode: 'all_database',
        expandedLocations: false
      });
    }

    // ===== MODE 2: Location provided =====
    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);
    const radiusKm = parseFloat(radius);

    // If expandLocations is false, just return database restaurants with distances
    if (expandLocations !== 'true') {
      console.log('📍 Calculating distances for database restaurants...');
      
      const restaurantsWithDistance = dbRestaurants.map(restaurant => {
        const restaurantLat = 
          restaurant.location?.coordinates?.latitude || 
          restaurant.address?.location?.coordinates?.[1];
        
        const restaurantLon = 
          restaurant.location?.coordinates?.longitude || 
          restaurant.address?.location?.coordinates?.[0];

        let distance = null;
        if (restaurantLat && restaurantLon) {
          distance = calculateDistance(latitude, longitude, restaurantLat, restaurantLon);
        }

        return {
          ...restaurant,
          displayName: restaurant.name,
          distance: distance ? parseFloat(distance.toFixed(2)) : null,
          image: restaurant.images?.coverImage?.url || 
                 restaurant.images?.profileImage?.url ||
                 restaurant.coverImage ||
                 restaurant.image ||
                 `https://ui-avatars.com/api/?name=${encodeURIComponent(restaurant.name)}&size=400&background=C444C7&color=fff&bold=true`,
          available: true
        };
      });

      // Sort by distance (null distances last)
      restaurantsWithDistance.sort((a, b) => {
        if (a.distance === null && b.distance === null) return 0;
        if (a.distance === null) return 1;
        if (b.distance === null) return -1;
        return a.distance - b.distance;
      });

      return res.json({
        success: true,
        restaurants: restaurantsWithDistance,
        total: restaurantsWithDistance.length,
        userLocation: { lat: latitude, lng: longitude },
        mode: 'database_with_distance',
        expandedLocations: false
      });
    }

    // ===== MODE 3: Expand locations (Find real OSM locations) =====
    console.log('🔍 Expanding to find real OSM locations...');
    
    const expandedRestaurants = [];
    const processedRestaurants = new Set();

    for (const restaurant of dbRestaurants) {
      if (processedRestaurants.has(restaurant.name)) continue;
      processedRestaurants.add(restaurant.name);

      console.log(`\n🔍 Searching for: ${restaurant.name}`);

      const realLocations = await findNearbyLocations(
        restaurant.name,
        latitude,
        longitude,
        radiusKm
      );

      if (realLocations.length > 0) {
        realLocations.forEach(location => {
          expandedRestaurants.push({
            _id: `osm-${location.osmId}`,
            displayName: location.name,
            name: restaurant.name,
            baseName: restaurant.name,
            location: location.location,
            address: location.address,
            contact: location.contact,
            distance: location.distance,
            openingHours: location.openingHours,
            osmId: location.osmId,
            images: restaurant.images || [],
            image: restaurant.images?.coverImage?.url || 
                   restaurant.images?.profileImage?.url ||
                   restaurant.coverImage ||
                   restaurant.image,
            rating: restaurant.rating || 4.0,
            deliveryFee: restaurant.deliveryFee || 0,
            estimatedDeliveryTime: restaurant.estimatedDeliveryTime || '30-45 min',
            minimumOrder: restaurant.minimumOrder || 0,
            cuisine: location.cuisine || restaurant.cuisine || 'Various',
            source: 'openstreetmap',
            available: true
          });
        });
      } else {
        expandedRestaurants.push({
          ...restaurant,
          displayName: restaurant.name,
          distance: null,
          available: false,
          message: 'No nearby locations found'
        });
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    expandedRestaurants.sort((a, b) => {
      if (a.distance === null) return 1;
      if (b.distance === null) return -1;
      return a.distance - b.distance;
    });

    const availableRestaurants = expandedRestaurants.filter(r => r.available !== false);
    const finalRestaurants = availableRestaurants.length > 0 
      ? availableRestaurants 
      : expandedRestaurants;

    console.log(`\n✅ Returning ${finalRestaurants.length} restaurant locations`);

    res.json({
      success: true,
      restaurants: finalRestaurants,
      total: finalRestaurants.length,
      userLocation: { lat: latitude, lng: longitude },
      radius: radiusKm,
      mode: 'expanded_osm',
      expandedLocations: true
    });

  } catch (error) {
    console.error('❌ Get restaurants error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get restaurants',
      error: error.message
    });
  }
});

module.exports = router;