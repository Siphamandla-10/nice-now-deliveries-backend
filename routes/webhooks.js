// routes/restaurant_order_webhook.js - Complete webhook handler for restaurant order status updates
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { authenticateToken } = require('../middleware/auth');

// Import your existing models
const User = require('../models/User');
const Order = require('../models/Order');
const Restaurant = require('../models/Restaurant');

// Firebase Admin SDK setup (uncomment when ready to use)
/*
const admin = require('firebase-admin');

// Initialize Firebase Admin SDK if not already done
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}
*/

// Restaurant order status update endpoint with driver notification
router.put('/:id/status', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes, location } = req.body;
    const userId = req.user.id;

    console.log(`Order status update requested: ${id} -> ${status} by user ${userId}`);

    // Validate status
    const validStatuses = [
      'pending', 'confirmed', 'preparing', 'ready_for_pickup', 
      'accepted', 'picked_up', 'on_way_to_customer', 'delivered', 'cancelled'
    ];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ 
        message: 'Invalid status',
        validStatuses 
      });
    }

    // Find order with all necessary populated fields
    const order = await Order.findById(id)
      .populate('restaurant', 'name address contact coordinates owner')
      .populate('customer', 'name phone addresses fcmToken')
      .populate('driver', 'name phone fcmToken driverProfile')
      .populate('items.menuItem', 'name price');

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Authorization check - only restaurant owner, assigned driver, or customer can update
    const isRestaurantOwner = req.user.userType === 'vendor' && 
      order.restaurant.owner?.toString() === userId;
    const isAssignedDriver = req.user.userType === 'driver' && 
      order.driver?._id?.toString() === userId;
    const isCustomer = req.user.userType === 'customer' && 
      order.customer._id.toString() === userId;
    const isAdmin = req.user.userType === 'admin';

    if (!isRestaurantOwner && !isAssignedDriver && !isCustomer && !isAdmin) {
      return res.status(403).json({ 
        message: 'Not authorized to update this order',
        userType: req.user.userType,
        orderId: id
      });
    }

    // Store previous status for comparison and logging
    const previousStatus = order.status;
    console.log(`Order ${order.orderNumber || id}: ${previousStatus} -> ${status}`);

    // Update order status
    order.status = status;
    
    // Add to status history
    order.statusHistory.push({
      status,
      timestamp: new Date(),
      updatedBy: userId,
      notes: notes || null,
      location: location || null
    });

    // Set specific timestamps based on status
    const now = new Date();
    switch (status) {
      case 'confirmed':
        order.confirmedAt = now;
        break;
      case 'preparing':
        order.preparingAt = now;
        break;
      case 'ready_for_pickup':
        order.readyAt = now;
        break;
      case 'accepted':
        order.acceptedAt = now;
        break;
      case 'picked_up':
        order.pickedUpAt = now;
        break;
      case 'delivered':
        order.deliveredAt = now;
        order.completedAt = now;
        break;
      case 'cancelled':
        order.cancelledAt = now;
        order.cancelReason = notes || 'Order cancelled';
        break;
    }

    // Save order
    await order.save();

    // Handle notifications and real-time updates
    const notificationResults = await handleOrderStatusNotifications(
      order, 
      previousStatus, 
      status, 
      req.io,
      req.user
    );

    // Response with success and notification details
    res.json({
      success: true,
      order: {
        _id: order._id,
        orderNumber: order.orderNumber,
        status: order.status,
        statusHistory: order.statusHistory,
        updatedAt: order.updatedAt,
        previousStatus,
        newStatus: status
      },
      notifications: notificationResults,
      message: `Order status updated from ${previousStatus} to ${status}`
    });

  } catch (error) {
    console.error('Update order status error:', error);
    res.status(500).json({ 
      message: 'Failed to update order status',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Webhook endpoint for external restaurant systems to update order status
router.post('/webhook/order-status-update', async (req, res) => {
  try {
    const { orderId, orderNumber, status, restaurantId, apiKey, notes } = req.body;

    // Validate API key (implement your own API key validation)
    if (!apiKey || apiKey !== process.env.RESTAURANT_WEBHOOK_API_KEY) {
      return res.status(401).json({ message: 'Invalid API key' });
    }

    // Find order by ID or order number
    const query = orderId ? { _id: orderId } : { orderNumber };
    const order = await Order.findOne(query)
      .populate('restaurant', 'name address contact coordinates')
      .populate('customer', 'name phone addresses fcmToken')
      .populate('driver', 'name phone fcmToken driverProfile');

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Verify restaurant ID matches
    if (restaurantId && order.restaurant._id.toString() !== restaurantId) {
      return res.status(403).json({ message: 'Restaurant ID mismatch' });
    }

    const previousStatus = order.status;
    
    // Update order status
    order.status = status;
    order.statusHistory.push({
      status,
      timestamp: new Date(),
      notes: notes || 'Updated via webhook',
      updatedBy: null // External webhook
    });

    // Set timestamps
    const now = new Date();
    if (status === 'ready_for_pickup') {
      order.readyAt = now;
    }

    await order.save();

    // Handle notifications
    const notificationResults = await handleOrderStatusNotifications(
      order, 
      previousStatus, 
      status, 
      null, // No io instance for webhook
      null  // No user for webhook
    );

    res.json({
      success: true,
      orderId: order._id,
      orderNumber: order.orderNumber,
      previousStatus,
      newStatus: status,
      notifications: notificationResults
    });

  } catch (error) {
    console.error('Webhook order status update error:', error);
    res.status(500).json({ 
      message: 'Failed to process webhook',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Function to handle all notifications when order status changes
async function handleOrderStatusNotifications(order, previousStatus, newStatus, io, updatedByUser) {
  const notifications = [];
  
  try {
    console.log(`Handling notifications for order ${order.orderNumber}: ${previousStatus} -> ${newStatus}`);

    // When restaurant marks order as ready for pickup - notify assigned driver
    if (newStatus === 'ready_for_pickup' && order.driver) {
      console.log(`Order ${order.orderNumber} ready - notifying driver ${order.driver._id}`);

      const driverNotification = {
        type: 'order_ready',
        title: 'Order Ready for Pickup!',
        body: `Your order at ${order.restaurant.name} is ready for pickup.`,
        data: {
          orderId: order._id.toString(),
          orderNumber: order.orderNumber,
          restaurantName: order.restaurant.name,
          restaurantAddress: order.restaurant.address,
          customerAddress: order.customer.addresses?.[0] || 'Customer address',
          earning: order.driverEarning?.toString() || '0',
          action: 'navigate_to_restaurant'
        }
      };

      // Send push notification to driver
      if (order.driver.fcmToken) {
        try {
          await sendPushNotification(order.driver.fcmToken, driverNotification);
          notifications.push(`Push notification sent to driver ${order.driver.name}`);
        } catch (pushError) {
          console.error('Failed to send push notification to driver:', pushError);
          notifications.push(`Failed to send push notification to driver: ${pushError.message}`);
        }
      } else {
        notifications.push(`Driver ${order.driver.name} has no FCM token - push notification skipped`);
      }

      // Send real-time notification via Socket.io
      if (io) {
        io.to(`driver_${order.driver._id}`).emit('order_ready_notification', {
          ...driverNotification,
          orderId: order._id,
          timestamp: new Date(),
          sound: true,
          vibrate: true
        });
        notifications.push(`Real-time notification sent to driver ${order.driver.name}`);
      }
    }

    // When order status changes to preparing - notify customer
    if (newStatus === 'preparing') {
      const customerNotification = {
        type: 'order_preparing',
        title: 'Your Order is Being Prepared',
        body: `${order.restaurant.name} is preparing your order.`,
        data: {
          orderId: order._id.toString(),
          orderNumber: order.orderNumber,
          restaurantName: order.restaurant.name,
          estimatedTime: '15-20 minutes'
        }
      };

      // Send push notification to customer
      if (order.customer.fcmToken) {
        try {
          await sendPushNotification(order.customer.fcmToken, customerNotification);
          notifications.push(`Push notification sent to customer ${order.customer.name}`);
        } catch (pushError) {
          console.error('Failed to send push notification to customer:', pushError);
        }
      }

      // Real-time update via Socket.io
      if (io) {
        io.to(`customer_${order.customer._id}`).emit('order_status_update', {
          ...customerNotification,
          orderId: order._id,
          status: newStatus,
          timestamp: new Date()
        });
        notifications.push(`Real-time update sent to customer ${order.customer.name}`);
      }
    }

    // When driver accepts order - notify customer and restaurant
    if (newStatus === 'accepted' && order.driver) {
      // Notify customer
      const customerNotification = {
        type: 'driver_assigned',
        title: 'Driver Assigned',
        body: `${order.driver.name} will deliver your order.`,
        data: {
          orderId: order._id.toString(),
          orderNumber: order.orderNumber,
          driverName: order.driver.name,
          driverPhone: order.driver.phone || '',
          estimatedDeliveryTime: '25-35 minutes'
        }
      };

      if (order.customer.fcmToken) {
        await sendPushNotification(order.customer.fcmToken, customerNotification);
      }

      if (io) {
        io.to(`customer_${order.customer._id}`).emit('driver_assigned', {
          ...customerNotification,
          orderId: order._id,
          timestamp: new Date()
        });
      }

      // Notify restaurant
      if (io) {
        io.to(`restaurant_${order.restaurant._id}`).emit('order_accepted', {
          orderId: order._id,
          orderNumber: order.orderNumber,
          driverName: order.driver.name,
          driverPhone: order.driver.phone,
          estimatedPickupTime: new Date(Date.now() + 15 * 60 * 1000) // 15 minutes
        });
      }

      notifications.push(`Driver assignment notifications sent`);
    }

    // When driver picks up order - notify customer with tracking
    if (newStatus === 'picked_up') {
      const customerNotification = {
        type: 'order_picked_up',
        title: 'Order Picked Up',
        body: `${order.driver?.name || 'Your driver'} has picked up your order and is on the way!`,
        data: {
          orderId: order._id.toString(),
          orderNumber: order.orderNumber,
          driverName: order.driver?.name || 'Driver',
          trackingEnabled: 'true'
        }
      };

      if (order.customer.fcmToken) {
        await sendPushNotification(order.customer.fcmToken, customerNotification);
      }

      if (io) {
        io.to(`customer_${order.customer._id}`).emit('order_status_update', {
          ...customerNotification,
          orderId: order._id,
          status: newStatus,
          timestamp: new Date(),
          enableTracking: true
        });
      }

      notifications.push(`Order pickup notifications sent`);
    }

    // When order is delivered - notify all parties and update driver status
    if (newStatus === 'delivered') {
      // Notify restaurant about completion
      if (io) {
        io.to(`restaurant_${order.restaurant._id}`).emit('order_completed', {
          orderId: order._id,
          orderNumber: order.orderNumber,
          completedAt: new Date(),
          driverName: order.driver?.name
        });
      }

      // Update driver status back to online if no other active deliveries
      if (order.driver) {
        const activeDeliveries = await Order.countDocuments({
          driver: order.driver._id,
          status: { $in: ['accepted', 'picked_up', 'on_way_to_customer'] }
        });

        if (activeDeliveries === 0) {
          await User.findByIdAndUpdate(order.driver._id, {
            'driverProfile.status': 'online'
          });
          
          if (io) {
            io.to(`driver_${order.driver._id}`).emit('delivery_completed', {
              orderId: order._id,
              earning: order.driverEarning || 0,
              statusUpdated: 'online',
              message: 'Delivery completed! You are now online for new orders.'
            });
          }
        }
      }

      notifications.push(`Delivery completion notifications sent`);
    }

    // When order is cancelled - notify relevant parties
    if (newStatus === 'cancelled') {
      const reason = order.cancelReason || 'Order cancelled';
      
      // Notify customer
      const customerNotification = {
        type: 'order_cancelled',
        title: 'Order Cancelled',
        body: `Your order has been cancelled. ${reason}`,
        data: {
          orderId: order._id.toString(),
          orderNumber: order.orderNumber,
          reason: reason
        }
      };

      if (order.customer.fcmToken) {
        await sendPushNotification(order.customer.fcmToken, customerNotification);
      }

      // Notify driver if assigned
      if (order.driver) {
        const driverNotification = {
          type: 'order_cancelled',
          title: 'Order Cancelled',
          body: `Order ${order.orderNumber} has been cancelled.`,
          data: {
            orderId: order._id.toString(),
            orderNumber: order.orderNumber,
            reason: reason
          }
        };

        if (order.driver.fcmToken) {
          await sendPushNotification(order.driver.fcmToken, driverNotification);
        }

        // Update driver status back to online
        await User.findByIdAndUpdate(order.driver._id, {
          'driverProfile.status': 'online'
        });

        if (io) {
          io.to(`driver_${order.driver._id}`).emit('order_cancelled', {
            orderId: order._id,
            reason: reason,
            statusUpdated: 'online'
          });
        }
      }

      notifications.push(`Cancellation notifications sent`);
    }

    // Broadcast to nearby drivers when new order becomes available
    if (newStatus === 'ready_for_pickup' && !order.driver) {
      await notifyNearbyDriversNewOrder(order, io);
      notifications.push(`Nearby drivers notified of new available order`);
    }

    // Log all notifications
    if (notifications.length > 0) {
      console.log(`Order ${order.orderNumber} notifications:`, notifications);
    }

    return notifications;

  } catch (error) {
    console.error('Error handling order status notifications:', error);
    return [`Error sending notifications: ${error.message}`];
  }
}

// Function to send push notifications via Firebase
async function sendPushNotification(fcmToken, notification) {
  try {
    if (!fcmToken) {
      throw new Error('No FCM token provided');
    }

    console.log(`Sending push notification: ${notification.title}`);

    // For development/testing - just log the notification
    if (process.env.NODE_ENV === 'development' || !process.env.FIREBASE_PROJECT_ID) {
      console.log('MOCK PUSH NOTIFICATION:', {
        token: fcmToken.substring(0, 20) + '...',
        title: notification.title,
        body: notification.body,
        data: notification.data
      });
      return { success: true, mock: true };
    }

    // Uncomment this section when Firebase is properly configured
    /*
    const admin = require('firebase-admin');
    
    const message = {
      token: fcmToken,
      notification: {
        title: notification.title,
        body: notification.body,
      },
      data: notification.data || {},
      android: {
        notification: {
          sound: 'notification_sound',
          channelId: 'driver-orders',
          priority: 'high'
        },
      },
      apns: {
        payload: {
          aps: {
            sound: 'notification_sound.mp3',
            badge: 1
          },
        },
      },
    };

    const response = await admin.messaging().send(message);
    console.log('Push notification sent successfully:', response);
    return { success: true, messageId: response };
    */

    return { success: true, mock: true };

  } catch (error) {
    console.error('Push notification error:', error);
    throw new Error(`Failed to send push notification: ${error.message}`);
  }
}

// Function to notify nearby drivers of new available orders
async function notifyNearbyDriversNewOrder(order, io) {
  try {
    if (!order.restaurant.coordinates) {
      console.log('Restaurant coordinates not available, skipping nearby driver notification');
      return;
    }

    // Find nearby online drivers (within 10km radius)
    const radius = 10; // km
    const nearbyDrivers = await User.find({
      userType: 'driver',
      'driverProfile.status': 'online',
      'driverProfile.currentLocation.latitude': { $exists: true },
      'driverProfile.currentLocation.longitude': { $exists: true }
    }).select('_id name fcmToken driverProfile.currentLocation');

    const eligibleDrivers = nearbyDrivers.filter(driver => {
      const driverLat = driver.driverProfile.currentLocation.latitude;
      const driverLon = driver.driverProfile.currentLocation.longitude;
      const restaurantLat = order.restaurant.coordinates.latitude;
      const restaurantLon = order.restaurant.coordinates.longitude;
      
      const distance = calculateDistance(driverLat, driverLon, restaurantLat, restaurantLon);
      return distance <= radius;
    });

    if (eligibleDrivers.length === 0) {
      console.log('No eligible drivers found nearby');
      return;
    }

    // Calculate estimated earning
    const baseRate = 25;
    const distance = 5; // Default estimated distance
    const earning = baseRate + (distance * 5);

    const newOrderNotification = {
      type: 'new_order',
      title: 'New Order Available!',
      body: `Pickup from ${order.restaurant.name} - R${earning.toFixed(2)}`,
      data: {
        orderId: order._id.toString(),
        orderNumber: order.orderNumber,
        restaurantName: order.restaurant.name,
        restaurantAddress: order.restaurant.address,
        earning: earning.toString(),
        distance: distance.toString()
      }
    };

    // Send notifications to all eligible drivers
    const notificationPromises = eligibleDrivers.map(async (driver) => {
      try {
        // Send push notification
        if (driver.fcmToken) {
          await sendPushNotification(driver.fcmToken, newOrderNotification);
        }

        // Send real-time notification
        if (io) {
          io.to(`driver_${driver._id}`).emit('new_order_available', {
            ...newOrderNotification,
            orderId: order._id,
            timestamp: new Date(),
            sound: true
          });
        }

        return `Notified driver ${driver.name}`;
      } catch (error) {
        console.error(`Failed to notify driver ${driver._id}:`, error);
        return `Failed to notify driver ${driver.name}: ${error.message}`;
      }
    });

    const results = await Promise.all(notificationPromises);
    console.log('Nearby driver notifications:', results);

  } catch (error) {
    console.error('Error notifying nearby drivers:', error);
  }
}

// Helper function to calculate distance between two points
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// Test webhook endpoint for development
router.post('/test-notification', async (req, res) => {
  try {
    const { orderId, status, targetUser } = req.body;
    
    if (!orderId || !status) {
      return res.status(400).json({ message: 'orderId and status required' });
    }

    const order = await Order.findById(orderId)
      .populate('restaurant', 'name address')
      .populate('customer', 'name fcmToken')
      .populate('driver', 'name fcmToken');

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    const notifications = await handleOrderStatusNotifications(
      order, 
      'pending', 
      status, 
      req.io,
      null
    );

    res.json({
      success: true,
      message: 'Test notification sent',
      notifications,
      order: {
        id: order._id,
        orderNumber: order.orderNumber,
        status: order.status
      }
    });

  } catch (error) {
    console.error('Test notification error:', error);
    res.status(500).json({ 
      message: 'Test notification failed',
      error: error.message 
    });
  }
});

// FIXED: Export only the router, not an object
module.exports = router;