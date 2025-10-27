// routes/orders.js - Complete Order Routes with Financial Calculations
const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const Restaurant = require('../models/Restaurant');
const MenuItem = require('../models/MenuItem');
const Driver = require('../models/Driver');
const User = require('../models/User');
const { auth, isDriver, isVendor, isAdmin } = require('../middleware/auth');

// ==========================================
// CREATE ORDER
// ==========================================
router.post('/create', auth, async (req, res) => {
  try {
    const {
      restaurantId,
      items,
      deliveryAddress,
      paymentMethod,
      specialInstructions,
      couponCode
    } = req.body;

    console.log('📝 Creating new order:', { restaurantId, userId: req.user.id, itemCount: items.length });

    // 1. Validate restaurant exists and is active
    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant) {
      return res.status(404).json({ error: 'Restaurant not found' });
    }
    if (!restaurant.isActive || restaurant.status !== 'active') {
      return res.status(400).json({ error: 'Restaurant is not accepting orders' });
    }

    // 2. Validate and calculate items
    let subtotal = 0;
    const orderItems = [];

    for (const item of items) {
      const menuItem = await MenuItem.findById(item.menuItemId);
      
      if (!menuItem) {
        return res.status(404).json({ error: `Menu item ${item.menuItemId} not found` });
      }
      
      if (!menuItem.isAvailable) {
        return res.status(400).json({ error: `${menuItem.name} is not available` });
      }

      const itemSubtotal = menuItem.price * item.quantity;
      subtotal += itemSubtotal;

      orderItems.push({
        menuItem: menuItem._id,
        name: menuItem.name,
        price: menuItem.price,
        quantity: item.quantity,
        specialInstructions: item.specialInstructions || '',
        subtotal: itemSubtotal
      });
    }

    // 3. Check minimum order amount
    if (subtotal < restaurant.minimumOrder) {
      return res.status(400).json({
        error: `Minimum order amount is R${restaurant.minimumOrder}`,
        minimumOrder: restaurant.minimumOrder,
        currentTotal: subtotal
      });
    }

    // 4. Calculate fees
    const deliveryFee = restaurant.deliveryFee || 25;
    const serviceFee = 5; // Platform service fee
    let discount = 0;

    // Apply coupon if provided (implement your coupon logic)
    if (couponCode) {
      // TODO: Implement coupon validation and discount calculation
      console.log('🎟️ Coupon code provided:', couponCode);
    }

    // 5. Create order
    const order = new Order({
      user: req.user.id,
      restaurant: restaurantId,
      items: orderItems,
      deliveryAddress: {
        street: deliveryAddress.street,
        city: deliveryAddress.city,
        state: deliveryAddress.state,
        zipCode: deliveryAddress.zipCode,
        country: deliveryAddress.country || 'South Africa',
        location: deliveryAddress.location,
        instructions: deliveryAddress.instructions || '',
        contactPhone: deliveryAddress.contactPhone || req.user.phone
      },
      pricing: {
        subtotal,
        deliveryFee,
        serviceFee,
        discount,
        platformCommissionRate: 20, // 20% commission
        driverPayout: 20 // R20 for driver
      },
      payment: {
        method: paymentMethod,
        status: paymentMethod === 'cash' ? 'pending' : 'pending'
      },
      specialInstructions: specialInstructions || '',
      estimatedPreparationTime: 30,
      estimatedDeliveryTime: 45
    });

    await order.save();

    // 6. Update restaurant stats
    restaurant.totalOrders += 1;
    await restaurant.save();

    // 7. Populate order for response
    await order.populate('restaurant', 'name address contact images');
    await order.populate('items.menuItem', 'name images');

    console.log('✅ Order created successfully:', order.orderNumber);
    console.log('💰 Financial breakdown:', order.getFinancialBreakdown());

    res.status(201).json({
      success: true,
      message: 'Order placed successfully',
      order,
      financialBreakdown: order.getFinancialBreakdown()
    });

  } catch (error) {
    console.error('❌ Error creating order:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// GET USER'S ORDERS
// ==========================================
router.get('/my-orders', auth, async (req, res) => {
  try {
    const { status, limit = 20, page = 1 } = req.query;

    const query = { user: req.user.id };
    if (status) query.status = status;

    const orders = await Order.find(query)
      .populate('restaurant', 'name address images contact')
      .populate('driver', 'name phone rating')
      .populate('items.menuItem', 'name images')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const total = await Order.countDocuments(query);

    res.json({
      success: true,
      orders,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    });

  } catch (error) {
    console.error('❌ Error fetching orders:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// GET ACTIVE ORDERS FOR USER
// ==========================================
router.get('/active', auth, async (req, res) => {
  try {
    const orders = await Order.findActiveForUser(req.user.id);
    
    res.json({
      success: true,
      count: orders.length,
      orders
    });

  } catch (error) {
    console.error('❌ Error fetching active orders:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// GET SINGLE ORDER BY ID
// ==========================================
router.get('/:orderId', auth, async (req, res) => {
  try {
    const order = await Order.findById(req.params.orderId)
      .populate('restaurant', 'name address contact images')
      .populate('driver', 'name phone rating vehicle')
      .populate('user', 'name email phone')
      .populate('items.menuItem', 'name images category');

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Check authorization
    const isOwner = order.user._id.toString() === req.user.id;
    const isRestaurantOwner = order.restaurant.owner && order.restaurant.owner.toString() === req.user.id;
    const isOrderDriver = order.driver && order.driver._id.toString() === req.user.id;
    const isAdminUser = req.user.role === 'admin';

    if (!isOwner && !isRestaurantOwner && !isOrderDriver && !isAdminUser) {
      return res.status(403).json({ error: 'Not authorized to view this order' });
    }

    res.json({
      success: true,
      order,
      financialBreakdown: order.getFinancialBreakdown()
    });

  } catch (error) {
    console.error('❌ Error fetching order:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// UPDATE ORDER STATUS
// ==========================================
router.patch('/:orderId/status', auth, async (req, res) => {
  try {
    const { status } = req.body;
    
    const order = await Order.findById(req.params.orderId);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Authorization check based on status change
    const canUpdate = await canUpdateOrderStatus(order, req.user, status);
    if (!canUpdate.allowed) {
      return res.status(403).json({ error: canUpdate.reason });
    }

    await order.updateStatus(status);
    await order.populate('restaurant driver user');

    console.log(`✅ Order ${order.orderNumber} status updated to: ${status}`);

    res.json({
      success: true,
      message: `Order status updated to ${status}`,
      order
    });

  } catch (error) {
    console.error('❌ Error updating order status:', error);
    res.status(500).json({ error: error.message });
  }
});

// Helper function to check if user can update order status
async function canUpdateOrderStatus(order, user, newStatus) {
  // Admins can do anything
  if (user.role === 'admin') {
    return { allowed: true };
  }

  // Restaurant owner can confirm/prepare/ready
  const restaurant = await Restaurant.findById(order.restaurant);
  const isRestaurantOwner = restaurant.owner && restaurant.owner.toString() === user.id;
  
  if (isRestaurantOwner && ['confirmed', 'preparing', 'ready'].includes(newStatus)) {
    return { allowed: true };
  }

  // Driver can update pickup/delivery statuses
  const isDriver = order.driver && order.driver.toString() === user.id;
  if (isDriver && ['picked_up', 'on_the_way', 'delivered'].includes(newStatus)) {
    return { allowed: true };
  }

  // Customer can cancel pending orders
  const isCustomer = order.user.toString() === user.id;
  if (isCustomer && newStatus === 'cancelled' && order.status === 'pending') {
    return { allowed: true };
  }

  return { allowed: false, reason: 'Not authorized to update this order status' };
}

// ==========================================
// ASSIGN DRIVER TO ORDER
// ==========================================
router.patch('/:orderId/assign-driver', auth, async (req, res) => {
  try {
    const { driverId } = req.body;
    
    const order = await Order.findById(req.params.orderId);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Check if driver exists and is available
    const driver = await Driver.findById(driverId);
    if (!driver) {
      return res.status(404).json({ error: 'Driver not found' });
    }
    if (!driver.isActive || driver.status !== 'available') {
      return res.status(400).json({ error: 'Driver is not available' });
    }

    await order.assignDriver(driverId);
    
    // Update driver status
    driver.status = 'busy';
    await driver.save();

    await order.populate('driver restaurant user');

    console.log(`✅ Driver ${driver.name} assigned to order ${order.orderNumber}`);

    res.json({
      success: true,
      message: 'Driver assigned successfully',
      order
    });

  } catch (error) {
    console.error('❌ Error assigning driver:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// CANCEL ORDER
// ==========================================
router.post('/:orderId/cancel', auth, async (req, res) => {
  try {
    const { reason } = req.body;
    
    const order = await Order.findById(req.params.orderId);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Check if order can be cancelled
    if (!['pending', 'confirmed'].includes(order.status)) {
      return res.status(400).json({ 
        error: 'Order cannot be cancelled at this stage',
        currentStatus: order.status 
      });
    }

    // Determine who is cancelling
    let cancelledBy = 'user';
    if (req.user.role === 'admin') cancelledBy = 'admin';
    
    const restaurant = await Restaurant.findById(order.restaurant);
    if (restaurant.owner && restaurant.owner.toString() === req.user.id) {
      cancelledBy = 'restaurant';
    }

    // Calculate refund (full refund if cancelled early)
    const refundAmount = order.status === 'pending' ? order.pricing.total : 0;

    await order.cancelOrder(reason, cancelledBy, refundAmount);
    await order.populate('restaurant user driver');

    console.log(`✅ Order ${order.orderNumber} cancelled by ${cancelledBy}`);

    res.json({
      success: true,
      message: 'Order cancelled successfully',
      refundAmount,
      order
    });

  } catch (error) {
    console.error('❌ Error cancelling order:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// ADD RATING TO ORDER
// ==========================================
router.post('/:orderId/rate', auth, async (req, res) => {
  try {
    const { food, delivery, review } = req.body;
    
    const order = await Order.findById(req.params.orderId);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Only customer can rate
    if (order.user.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Only customer can rate the order' });
    }

    // Order must be delivered
    if (order.status !== 'delivered') {
      return res.status(400).json({ error: 'Can only rate delivered orders' });
    }

    // Check if already rated
    if (order.rating.reviewedAt) {
      return res.status(400).json({ error: 'Order already rated' });
    }

    await order.addRating({ food, delivery, review });

    // Update restaurant rating
    const restaurant = await Restaurant.findById(order.restaurant);
    const avgRating = (restaurant.rating * restaurant.totalRatings + food) / (restaurant.totalRatings + 1);
    restaurant.rating = avgRating;
    restaurant.totalRatings += 1;
    await restaurant.save();

    // Update driver rating if exists
    if (order.driver) {
      const driver = await Driver.findById(order.driver);
      if (driver) {
        const driverAvg = (driver.rating * driver.totalRatings + delivery) / (driver.totalRatings + 1);
        driver.rating = driverAvg;
        driver.totalRatings += 1;
        await driver.save();
      }
    }

    console.log(`✅ Order ${order.orderNumber} rated: Food ${food}/5, Delivery ${delivery}/5`);

    res.json({
      success: true,
      message: 'Rating submitted successfully',
      order
    });

  } catch (error) {
    console.error('❌ Error rating order:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// RESTAURANT: GET ORDERS
// ==========================================
router.get('/restaurant/orders', auth, isVendor, async (req, res) => {
  try {
    const { status, date, limit = 50 } = req.query;
    
    // Find restaurant owned by this user
    const restaurant = await Restaurant.findOne({ owner: req.user.id });
    if (!restaurant) {
      return res.status(404).json({ error: 'Restaurant not found' });
    }

    const orders = await Order.findForRestaurant(restaurant._id, status)
      .limit(parseInt(limit));

    res.json({
      success: true,
      count: orders.length,
      orders
    });

  } catch (error) {
    console.error('❌ Error fetching restaurant orders:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// DRIVER: GET ASSIGNED ORDERS
// ==========================================
router.get('/driver/orders', auth, isDriver, async (req, res) => {
  try {
    const { status } = req.query;
    
    const orders = await Order.findForDriver(req.user.driverId, status);

    res.json({
      success: true,
      count: orders.length,
      orders
    });

  } catch (error) {
    console.error('❌ Error fetching driver orders:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// ADMIN: GET PLATFORM STATISTICS
// ==========================================
router.get('/admin/stats', auth, isAdmin, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    const stats = await Order.getPlatformStats(start, end);

    res.json({
      success: true,
      period: { startDate: start, endDate: end },
      stats
    });

  } catch (error) {
    console.error('❌ Error fetching platform stats:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// FIND AVAILABLE DRIVERS NEAR RESTAURANT
// ==========================================
router.get('/:orderId/find-drivers', auth, async (req, res) => {
  try {
    const order = await Order.findById(req.params.orderId).populate('restaurant');
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Find available drivers near restaurant
    const drivers = await Driver.find({
      isActive: true,
      status: 'available',
      // Add location-based query here if you have driver locations
    }).select('name phone rating vehicle location');

    res.json({
      success: true,
      count: drivers.length,
      drivers
    });

  } catch (error) {
    console.error('❌ Error finding drivers:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;