const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const Restaurant = require('../models/Restaurant');
const MenuItem = require('../models/MenuItem');
const { auth, isDriver, isVendor, isAdmin } = require('../middleware/auth');

// ==========================================
// CREATE ORDER - FIXED
// ==========================================
router.post('/create', auth, async (req, res) => {
  try {
    const { restaurantId, items, deliveryAddress } = req.body;

    console.log('📦 Creating order for restaurant:', restaurantId);
    console.log('📦 Items:', items);

    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant) return res.status(404).json({ error: 'Restaurant not found' });

    let subtotal = 0;
    const detailedItems = [];

    for (const item of items) {
      const menuItem = await MenuItem.findById(item.itemId);
      if (!menuItem) return res.status(404).json({ error: `Menu item not found: ${item.itemId}` });

      const itemSubtotal = menuItem.price * item.quantity;
      subtotal += itemSubtotal;
      detailedItems.push({
        menuItem: menuItem._id,
        name: menuItem.name,
        quantity: item.quantity,
        price: menuItem.price,
        specialInstructions: item.specialInstructions || '',
        subtotal: itemSubtotal,
      });
    }

    const deliveryFee = 25;
    const serviceFee = 5;
    const total = subtotal + deliveryFee + serviceFee;

    console.log('💰 Order calculation:', { subtotal, deliveryFee, serviceFee, total });

    // Prepare delivery address
    const formattedAddress = typeof deliveryAddress === 'string' 
      ? {
          street: deliveryAddress,
          city: 'Johannesburg',
          state: 'Gauteng',
          zipCode: '2000',
          country: 'South Africa',
          contactPhone: req.user.phone || '0000000000'
        }
      : {
          street: deliveryAddress.street || 'Address not provided',
          city: deliveryAddress.city || 'Johannesburg',
          state: deliveryAddress.state || 'Gauteng',
          zipCode: deliveryAddress.zipCode || '2000',
          country: deliveryAddress.country || 'South Africa',
          contactPhone: deliveryAddress.contactPhone || req.user.phone || '0000000000',
          instructions: deliveryAddress.instructions || ''
        };

    const newOrder = new Order({
      user: req.user.id,
      restaurant: restaurant._id,
      items: detailedItems,
      deliveryAddress: formattedAddress,
      // ✅ FIXED: Use pricing object structure
      pricing: {
        subtotal: subtotal,
        deliveryFee: deliveryFee,
        serviceFee: serviceFee,
        discount: 0,
        total: total,
        platformCommissionRate: 20,
        driverPayout: 20
      },
      status: 'pending',
      payment: {
        method: 'cash',
        status: 'pending'
      }
    });

    await newOrder.save();
    
    console.log('✅ Order saved successfully');
    console.log('💰 Order pricing:', newOrder.pricing);
    console.log('💰 Order total:', newOrder.pricing.total);
    
    // Transform for response
    const orderResponse = newOrder.toObject();
    orderResponse.total = newOrder.pricing.total;
    orderResponse.subtotal = newOrder.pricing.subtotal;
    orderResponse.deliveryFee = newOrder.pricing.deliveryFee;
    
    res.status(201).json({ 
      success: true, 
      message: 'Order created successfully', 
      order: orderResponse
    });
  } catch (error) {
    console.error('❌ Error creating order:', error);
    res.status(500).json({ error: 'Failed to create order', details: error.message });
  }
});

// ==========================================
// MIGRATION ROUTE - FIX OLD ORDERS
// ==========================================
router.post('/migrate-old-orders', auth, async (req, res) => {
  try {
    console.log('\n========== 🔄 STARTING ORDER MIGRATION ==========');
    
    const orders = await Order.find({}).lean();
    console.log(`📦 Found ${orders.length} orders to check`);

    let updated = 0;
    let skipped = 0;
    const errors = [];

    for (const order of orders) {
      try {
        const needsUpdate = 
          !order.payment?.method ||
          !order.deliveryAddress?.contactPhone ||
          !order.pricing ||
          order.items?.some(item => item.subtotal === undefined);

        if (needsUpdate) {
          const updateData = {};

          // Fix payment if missing
          if (!order.payment?.method) {
            updateData['payment.method'] = 'cash';
            updateData['payment.status'] = order.payment?.status || 'pending';
            console.log(`  ✅ Fixing payment for order ${order._id}`);
          }

          // Fix deliveryAddress if missing contactPhone
          if (!order.deliveryAddress?.contactPhone) {
            updateData['deliveryAddress.contactPhone'] = '0000000000';
            console.log(`  ✅ Fixing contactPhone for order ${order._id}`);
          }

          // Fix pricing if missing
          if (!order.pricing) {
            updateData['pricing'] = {
              subtotal: order.subtotal || 0,
              deliveryFee: order.deliveryFee || 25,
              serviceFee: order.serviceFee || 5,
              discount: 0,
              total: order.total || 0,
              platformCommissionRate: 20,
              platformCommission: 0,
              restaurantPayout: 0,
              driverPayout: 20,
              platformProfit: 0,
              tax: 0,
              taxRate: 0
            };
            console.log(`  ✅ Fixing pricing for order ${order._id}`);
          }

          // Fix items subtotal if missing
          if (order.items && order.items.some(item => item.subtotal === undefined)) {
            const fixedItems = order.items.map(item => ({
              ...item,
              subtotal: item.subtotal || (item.price * item.quantity)
            }));
            updateData['items'] = fixedItems;
            console.log(`  ✅ Fixing item subtotals for order ${order._id}`);
          }

          // Fix driverEarnings if missing
          if (order.driverEarnings === undefined) {
            updateData['driverEarnings'] = order.pricing?.driverPayout || 20;
          }

          await Order.updateOne(
            { _id: order._id },
            { $set: updateData },
            { runValidators: false }
          );

          updated++;
          if (updated % 10 === 0) {
            console.log(`   Progress: ${updated} orders updated...`);
          }
        } else {
          skipped++;
        }
      } catch (err) {
        console.error(`❌ Error updating order ${order._id}:`, err.message);
        errors.push({ orderId: order._id, error: err.message });
      }
    }

    console.log('\n========== ✅ MIGRATION COMPLETE ==========');
    console.log(`   ✅ Updated: ${updated} orders`);
    console.log(`   ⏭️  Skipped: ${skipped} orders (already valid)`);
    console.log(`   ❌ Errors: ${errors.length}`);
    console.log('==========================================\n');

    res.json({
      success: true,
      message: 'Migration completed successfully',
      stats: {
        total: orders.length,
        updated,
        skipped,
        errors: errors.length
      },
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error) {
    console.error('❌ Migration failed:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Migration failed', 
      error: error.message 
    });
  }
});

// ==========================================
// DEBUG TEST ROUTE
// ==========================================
router.get('/debug-test', auth, async (req, res) => {
  try {
    console.log('\n========== 🔍 DEBUG TEST STARTING ==========');
    
    const allOrders = await Order.find().limit(3).lean();
    console.log('📊 Total orders in DB:', await Order.countDocuments());
    console.log('📋 Sample orders found:', allOrders.length);
    
    if (allOrders.length > 0) {
      const firstOrder = allOrders[0];
      console.log('\n========== FIRST ORDER ==========');
      console.log('Order ID:', firstOrder._id);
      console.log('Has pricing object:', !!firstOrder.pricing);
      console.log('Pricing.total:', firstOrder.pricing?.total);
      console.log('Pricing.subtotal:', firstOrder.pricing?.subtotal);
      console.log('Pricing.deliveryFee:', firstOrder.pricing?.deliveryFee);
      console.log('Status:', firstOrder.status);
      console.log('\nFull pricing object:', JSON.stringify(firstOrder.pricing, null, 2));
    }
    
    res.json({
      success: true,
      debug: {
        totalOrders: await Order.countDocuments(),
        firstOrderPricing: allOrders[0]?.pricing || null,
        sampleOrder: allOrders[0] || null
      }
    });
    
  } catch (error) {
    console.error('❌ Debug test error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// GET ALL ORDERS (ADMIN) - FIXED
// ==========================================
router.get('/', auth, isAdmin, async (req, res) => {
  try {
    const orders = await Order.find()
      .populate('user', 'name email phone')
      .populate('restaurant', 'name')
      .populate('driver', 'name phone')
      .lean()
      .sort({ createdAt: -1 });

    // Transform orders to include flat price fields
    const transformedOrders = orders.map(order => ({
      ...order,
      total: order.pricing?.total || order.total || 0,
      subtotal: order.pricing?.subtotal || order.subtotal || 0,
      deliveryFee: order.pricing?.deliveryFee || order.deliveryFee || 0,
      serviceFee: order.pricing?.serviceFee || order.serviceFee || 0
    }));

    res.json({ success: true, count: transformedOrders.length, orders: transformedOrders });
  } catch (error) {
    console.error('❌ Error fetching all orders:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// ==========================================
// GET MY ORDERS (USER) - FIXED
// ==========================================
router.get('/my-orders', auth, async (req, res) => {
  try {
    const orders = await Order.find({ user: req.user.id })
      .populate('restaurant', 'name')
      .populate('driver', 'name phone')
      .lean()
      .sort({ createdAt: -1 });

    const transformedOrders = orders.map(order => ({
      ...order,
      total: order.pricing?.total || order.total || 0,
      subtotal: order.pricing?.subtotal || order.subtotal || 0,
      deliveryFee: order.pricing?.deliveryFee || order.deliveryFee || 0,
      serviceFee: order.pricing?.serviceFee || order.serviceFee || 0
    }));

    res.json({ success: true, count: transformedOrders.length, orders: transformedOrders });
  } catch (error) {
    console.error('❌ Error fetching my orders:', error);
    res.status(500).json({ error: 'Failed to fetch your orders' });
  }
});

// ==========================================
// GET VENDOR ORDERS - FIXED
// ==========================================
router.get('/vendor-orders', auth, isVendor, async (req, res) => {
  try {
    const restaurant = await Restaurant.findOne({ owner: req.user.id });
    if (!restaurant) {
      return res.json({ 
        success: true, 
        count: 0, 
        orders: [], 
        message: 'No restaurant found for this vendor' 
      });
    }

    const orders = await Order.find({ restaurant: restaurant._id })
      .populate('user', 'name email phone')
      .populate('restaurant', 'name')
      .populate('driver', 'name phone')
      .lean()
      .sort({ createdAt: -1 });

    const transformedOrders = orders.map(order => ({
      ...order,
      total: order.pricing?.total || order.total || 0,
      subtotal: order.pricing?.subtotal || order.subtotal || 0,
      deliveryFee: order.pricing?.deliveryFee || order.deliveryFee || 0,
      serviceFee: order.pricing?.serviceFee || order.serviceFee || 0
    }));

    console.log('Vendor orders fetched:', transformedOrders.length);
    if (transformedOrders.length > 0) {
      console.log('First order total:', transformedOrders[0].total);
    }

    res.json({ success: true, count: transformedOrders.length, orders: transformedOrders });
  } catch (error) {
    console.error('❌ Error fetching vendor orders:', error);
    res.status(500).json({ error: 'Failed to fetch vendor orders', details: error.message });
  }
});

// ==========================================
// VENDOR REQUEST DRIVER - FIXED
// ==========================================
router.post('/:id/request-driver', auth, isVendor, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).lean();
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const restaurant = await Restaurant.findOne({ _id: order.restaurant, owner: req.user.id });
    if (!restaurant) return res.status(403).json({ error: 'Unauthorized to request driver for this order' });

    // ✅ Use updateOne to bypass validation
    await Order.updateOne(
      { _id: req.params.id },
      { 
        $set: { 
          status: 'ready',
          'timestamps.readyAt': new Date()
        } 
      },
      { runValidators: false }
    );

    const updatedOrder = await Order.findById(req.params.id).lean();

    res.json({ 
      success: true, 
      message: 'Driver requested successfully', 
      order: {
        ...updatedOrder,
        total: updatedOrder.pricing?.total || updatedOrder.total || 0,
        subtotal: updatedOrder.pricing?.subtotal || updatedOrder.subtotal || 0,
        deliveryFee: updatedOrder.pricing?.deliveryFee || updatedOrder.deliveryFee || 0
      }
    });
  } catch (error) {
    console.error('❌ Error requesting driver:', error);
    res.status(500).json({ error: 'Failed to request driver', details: error.message });
  }
});

// ==========================================
// GET DRIVER ORDERS - FIXED
// ==========================================
router.get('/driver-orders', auth, isDriver, async (req, res) => {
  try {
    const orders = await Order.find({ driver: req.user.id })
      .populate('restaurant', 'name')
      .populate('user', 'name phone')
      .lean()
      .sort({ createdAt: -1 });

    const transformedOrders = orders.map(order => ({
      ...order,
      total: order.pricing?.total || order.total || 0,
      subtotal: order.pricing?.subtotal || order.subtotal || 0,
      deliveryFee: order.pricing?.deliveryFee || order.deliveryFee || 0,
      serviceFee: order.pricing?.serviceFee || order.serviceFee || 0,
      driverEarnings: order.driverEarnings || order.pricing?.driverPayout || 0
    }));

    res.json({ success: true, count: transformedOrders.length, orders: transformedOrders });
  } catch (error) {
    console.error('❌ Error fetching driver orders:', error);
    res.status(500).json({ error: 'Failed to fetch driver orders' });
  }
});

// ==========================================
// GET SINGLE ORDER DETAILS - FIXED
// ==========================================
router.get('/:id', auth, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('user', 'name email phone')
      .populate('restaurant', 'name address contact')
      .populate('driver', 'name phone')
      .populate('items.menuItem', 'name description price')
      .lean();

    if (!order) return res.status(404).json({ error: 'Order not found' });

    const isAuthorized =
      req.user.userType === 'admin' ||
      order.user._id.toString() === req.user.id ||
      (order.driver && order.driver._id.toString() === req.user.id);

    if (!isAuthorized) {
      return res.status(403).json({ error: 'Unauthorized to view this order' });
    }

    // Transform order
    const transformedOrder = {
      ...order,
      total: order.pricing?.total || order.total || 0,
      subtotal: order.pricing?.subtotal || order.subtotal || 0,
      deliveryFee: order.pricing?.deliveryFee || order.deliveryFee || 0,
      serviceFee: order.pricing?.serviceFee || order.serviceFee || 0
    };

    console.log('Order details - total:', transformedOrder.total);

    res.json({ success: true, order: transformedOrder });
  } catch (error) {
    console.error('❌ Error fetching order details:', error);
    res.status(500).json({ error: 'Failed to fetch order details' });
  }
});

// ==========================================
// UPDATE ORDER STATUS (Vendor or Admin) - FIXED
// ==========================================
router.put('/:id/status', auth, async (req, res) => {
  try {
    const { status } = req.body;
    const order = await Order.findById(req.params.id).lean();
    if (!order) return res.status(404).json({ error: 'Order not found' });

    if (req.user.userType === 'vendor') {
      const restaurant = await Restaurant.findOne({ _id: order.restaurant, owner: req.user.id });
      if (!restaurant) return res.status(403).json({ error: 'Unauthorized to update this order' });
    }

    // ✅ Use updateOne to bypass validation
    const timestampField = 
      status === 'confirmed' ? 'confirmedAt' :
      status === 'preparing' ? 'preparingAt' :
      status === 'ready' ? 'readyAt' :
      status === 'picked_up' ? 'pickedUpAt' :
      status === 'delivered' ? 'deliveredAt' :
      status === 'cancelled' ? 'cancelledAt' : null;

    const updateData = { status: status };
    if (timestampField) {
      updateData[`timestamps.${timestampField}`] = new Date();
    }

    await Order.updateOne(
      { _id: req.params.id },
      { $set: updateData },
      { runValidators: false }
    );
    
    // Fetch updated order
    const updatedOrder = await Order.findById(req.params.id).lean();
    
    // Transform response
    const orderResponse = {
      ...updatedOrder,
      total: updatedOrder.pricing?.total || updatedOrder.total || 0,
      subtotal: updatedOrder.pricing?.subtotal || updatedOrder.subtotal || 0,
      deliveryFee: updatedOrder.pricing?.deliveryFee || updatedOrder.deliveryFee || 0
    };
    
    res.json({ success: true, message: 'Order status updated', order: orderResponse });
  } catch (error) {
    console.error('❌ Error updating order status:', error);
    res.status(500).json({ error: 'Failed to update order status' });
  }
});

// ==========================================
// DRIVER ACCEPTS ORDER - FIXED
// ==========================================
router.put('/:id/assign', auth, isDriver, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).lean();
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.driver) return res.status(400).json({ error: 'Order already assigned' });

    // ✅ Use updateOne to bypass validation
    await Order.updateOne(
      { _id: req.params.id },
      { 
        $set: { 
          driver: req.user.id,
          status: 'driver_assigned',
          driverStatus: 'accepted'
        } 
      },
      { runValidators: false }
    );

    const updatedOrder = await Order.findById(req.params.id).lean();

    // Transform response
    const orderResponse = {
      ...updatedOrder,
      total: updatedOrder.pricing?.total || updatedOrder.total || 0,
      subtotal: updatedOrder.pricing?.subtotal || updatedOrder.subtotal || 0,
      deliveryFee: updatedOrder.pricing?.deliveryFee || updatedOrder.deliveryFee || 0,
      driverEarnings: updatedOrder.driverEarnings || updatedOrder.pricing?.driverPayout || 0
    };

    res.json({ success: true, message: 'Order assigned to driver', order: orderResponse });
  } catch (error) {
    console.error('❌ Error assigning driver:', error);
    res.status(500).json({ error: 'Failed to assign driver' });
  }
});

// ==========================================
// DRIVER UPDATES ORDER STATUS - FIXED
// ==========================================
router.put('/:id/driver-status', auth, isDriver, async (req, res) => {
  try {
    const { status } = req.body;
    const order = await Order.findById(req.params.id).lean();
    if (!order) return res.status(404).json({ error: 'Order not found' });

    if (!order.driver || order.driver.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized to update this order' });
    }

    // ✅ Use updateOne to bypass validation
    const timestampField = 
      status === 'picked_up' ? 'pickedUpAt' :
      status === 'on_the_way' ? 'pickedUpAt' :
      status === 'delivered' ? 'deliveredAt' : null;

    const updateData = { status: status };
    if (timestampField) {
      updateData[`timestamps.${timestampField}`] = new Date();
    }

    await Order.updateOne(
      { _id: req.params.id },
      { $set: updateData },
      { runValidators: false }
    );

    const updatedOrder = await Order.findById(req.params.id).lean();

    // Transform response
    const orderResponse = {
      ...updatedOrder,
      total: updatedOrder.pricing?.total || updatedOrder.total || 0,
      subtotal: updatedOrder.pricing?.subtotal || updatedOrder.subtotal || 0,
      deliveryFee: updatedOrder.pricing?.deliveryFee || updatedOrder.deliveryFee || 0,
      driverEarnings: updatedOrder.driverEarnings || updatedOrder.pricing?.driverPayout || 0
    };

    res.json({ success: true, message: 'Order status updated by driver', order: orderResponse });
  } catch (error) {
    console.error('❌ Error updating driver order status:', error);
    res.status(500).json({ error: 'Failed to update driver order status' });
  }
});

module.exports = router;