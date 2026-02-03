const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const Restaurant = require('../models/Restaurant');
const { auth } = require('../middleware/auth');
const NodeGeocoder = require('node-geocoder');

// Initialize geocoder
const geocoder = NodeGeocoder({
  provider: 'google',
  apiKey: 'AIzaSyBmGlXDi7C_3LsGgpKj8GODZS-jNbX57kQ',
  formatter: null
});

// Helper function to geocode address
async function geocodeAddress(address) {
  try {
    const addressString = address.street 
      ? `${address.street}, ${address.city}, ${address.state || ''}, ${address.zipCode || ''}, ${address.country || 'South Africa'}`
      : '';
    
    if (!addressString) {
      console.log('⚠️ No address to geocode');
      return { coordinates: [0, 0], latitude: 0, longitude: 0 };
    }
    
    console.log('🔍 Geocoding address:', addressString);
    
    const results = await geocoder.geocode(addressString);
    
    if (results && results.length > 0) {
      const lat = results[0].latitude;
      const lng = results[0].longitude;
      
      console.log('✅ Geocoded successfully:', { lat, lng });
      
      return {
        coordinates: [lng, lat], // GeoJSON: [longitude, latitude]
        latitude: lat,
        longitude: lng,
        location: {
          type: 'Point',
          coordinates: [lng, lat]
        }
      };
    } else {
      console.log('⚠️ No geocoding results found');
      return { coordinates: [0, 0], latitude: 0, longitude: 0 };
    }
  } catch (error) {
    console.error('❌ Geocoding error:', error.message);
    return { coordinates: [0, 0], latitude: 0, longitude: 0 };
  }
}

// ==========================================
// CREATE NEW ORDER - WITH GEOCODING
// ==========================================
router.post('/', auth, async (req, res) => {
  try {
    console.log('\n========== 📦 CREATE ORDER ==========');
    console.log('Customer ID:', req.user.id);
    
    const { 
      restaurantId, 
      items, 
      deliveryAddress,
      paymentMethod,
      specialInstructions 
    } = req.body;
    
    // Validate restaurant exists
    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: 'Restaurant not found'
      });
    }
    
    // Calculate pricing
    const subtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const deliveryFee = 25;
    const tax = subtotal * 0.15; // 15% tax
    const driverPayout = 20;
    
    console.log('💰 Order pricing:', {
      subtotal,
      deliveryFee,
      tax,
      total: subtotal + deliveryFee + tax
    });
    
    // GEOCODE THE DELIVERY ADDRESS
    console.log('🌍 Geocoding delivery address...');
    const geoData = await geocodeAddress(deliveryAddress);
    
    console.log('📍 Geocoded coordinates:', geoData.coordinates);
    
    // Create order with geocoded coordinates
    const order = new Order({
      user: req.user.id,
      restaurant: restaurantId,
      items: items.map(item => ({
        menuItem: item.menuItemId || item.menuItem,
        name: item.name,
        price: item.price,
        quantity: item.quantity,
        specialInstructions: item.specialInstructions || '',
        subtotal: item.price * item.quantity
      })),
      deliveryAddress: {
        street: deliveryAddress.street,
        city: deliveryAddress.city,
        state: deliveryAddress.state,
        zipCode: deliveryAddress.zipCode,
        country: deliveryAddress.country || 'South Africa',
        coordinates: geoData.coordinates, // [lng, lat]
        location: geoData.location,
        instructions: deliveryAddress.instructions || '',
        contactPhone: deliveryAddress.contactPhone || deliveryAddress.phone || req.user.phone
      },
      pricing: {
        subtotal: subtotal,
        deliveryFee: deliveryFee,
        tax: tax,
        driverPayout: driverPayout,
        discount: 0
      },
      payment: {
        method: paymentMethod || 'cash',
        status: 'pending'
      },
      specialInstructions: specialInstructions || ''
    });
    
    await order.save();
    
    console.log('✅ Order created:', {
      orderId: order._id,
      orderNumber: order.orderNumber,
      coordinates: geoData.coordinates,
      hasValidCoordinates: geoData.coordinates[0] !== 0 && geoData.coordinates[1] !== 0
    });
    console.log('====================================\n');
    
    // Populate before sending response
    await order.populate('restaurant', 'name image coverImage displayName');
    await order.populate('items.menuItem', 'name price image');
    
    res.status(201).json({
      success: true,
      message: 'Order created successfully',
      order: order
    });
    
  } catch (error) {
    console.error('❌ Error creating order:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to create order',
      error: error.message 
    });
  }
});

// ==========================================
// GET CUSTOMER ORDERS - SIMPLIFIED PRICING
// ==========================================
router.get('/', auth, async (req, res) => {
  try {
    console.log('\n========== 📦 CUSTOMER ORDERS REQUEST ==========');
    console.log('Customer ID:', req.user.id);
    console.log('User Type:', req.user.userType);
    
    const { page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;

    const orders = await Order.find({ user: req.user.id })
      .populate('restaurant', 'name image coverImage displayName')
      .populate('items.menuItem', 'name price image')
      .populate('driver', 'name phone')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await Order.countDocuments({ user: req.user.id });

    console.log('📦 Orders found:', orders.length);
    console.log('📊 Total orders:', total);
    
    // ✅ Transform orders - ONLY Subtotal + Delivery Fee + Tax (15%)
    const transformedOrders = orders.map(order => {
      // Get stored values from pricing object (saved at payment time)
      const subtotal = order.pricing?.subtotal || order.subtotal || 0;
      const deliveryFee = order.pricing?.deliveryFee || order.deliveryFee || 0;
      const tax = order.pricing?.tax || order.tax || 0;
      
      // Calculate total: Subtotal + Delivery Fee + Tax ONLY
      const total = subtotal + deliveryFee + tax;
      
      return {
        ...order,
        id: order._id,
        // Only include these 4 fields for pricing
        subtotal: parseFloat(subtotal.toFixed(2)),
        deliveryFee: parseFloat(deliveryFee.toFixed(2)),
        tax: parseFloat(tax.toFixed(2)),
        total: parseFloat(total.toFixed(2))
      };
    });

    if (transformedOrders.length > 0) {
      console.log('✅ Sample order pricing:');
      console.log('   Order Number:', transformedOrders[0].orderNumber);
      console.log('   Status:', transformedOrders[0].status);
      console.log('   Subtotal:', transformedOrders[0].subtotal);
      console.log('   Delivery Fee:', transformedOrders[0].deliveryFee);
      console.log('   Tax (15%):', transformedOrders[0].tax);
      console.log('   Total:', transformedOrders[0].total);
    }
    console.log('===============================================\n');

    res.json({
      success: true,
      orders: transformedOrders,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('❌ Error fetching customer orders:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch orders',
      error: error.message
    });
  }
});

// ==========================================
// GET SINGLE ORDER BY ID - SIMPLIFIED PRICING
// ==========================================
router.get('/:id', auth, async (req, res) => {
  try {
    console.log('\n========== 📦 GET SINGLE ORDER ==========');
    console.log('Order ID:', req.params.id);
    console.log('Customer ID:', req.user.id);
    
    const order = await Order.findOne({ 
      _id: req.params.id,
      user: req.user.id
    })
      .populate('restaurant', 'name image coverImage displayName address contact')
      .populate('items.menuItem', 'name price image description')
      .populate('driver', 'name phone vehicle')
      .lean();

    if (!order) {
      console.log('❌ Order not found');
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // ✅ Transform order - ONLY Subtotal + Delivery Fee + Tax (15%)
    const subtotal = order.pricing?.subtotal || order.subtotal || 0;
    const deliveryFee = order.pricing?.deliveryFee || order.deliveryFee || 0;
    const tax = order.pricing?.tax || order.tax || 0;
    const total = subtotal + deliveryFee + tax;

    const transformedOrder = {
      ...order,
      id: order._id,
      subtotal: parseFloat(subtotal.toFixed(2)),
      deliveryFee: parseFloat(deliveryFee.toFixed(2)),
      tax: parseFloat(tax.toFixed(2)),
      total: parseFloat(total.toFixed(2))
    };

    console.log('✅ Order found:', transformedOrder.orderNumber);
    console.log('   Total:', transformedOrder.total);
    console.log('=========================================\n');

    res.json({
      success: true,
      order: transformedOrder
    });
  } catch (error) {
    console.error('❌ Error fetching order:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch order',
      error: error.message
    });
  }
});

// ==========================================
// CANCEL ORDER
// ==========================================
router.patch('/:id/cancel', auth, async (req, res) => {
  try {
    console.log('\n========== ❌ CANCEL ORDER ==========');
    console.log('Order ID:', req.params.id);
    console.log('Customer ID:', req.user.id);
    
    const order = await Order.findOne({
      _id: req.params.id,
      user: req.user.id
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Check if order can be cancelled
    const cancellableStatuses = ['pending', 'confirmed'];
    if (!cancellableStatuses.includes(order.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot cancel order with status: ${order.status}`
      });
    }

    order.status = 'cancelled';
    if (order.timestamps) {
      order.timestamps.cancelledAt = new Date();
    }
    await order.save();

    console.log('✅ Order cancelled:', order.orderNumber);
    console.log('====================================\n');

    res.json({
      success: true,
      message: 'Order cancelled successfully',
      order
    });
  } catch (error) {
    console.error('❌ Error cancelling order:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel order',
      error: error.message
    });
  }
});

module.exports = router;