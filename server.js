// server.js - UPDATED FOR DEPLOYMENT WITH MODEL IMPORTS
require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);

// Enhanced CORS configuration for both development and production
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, curl requests)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      // Development origins
      "http://localhost:3000",
      "http://localhost:8081",
      "http://localhost:19006",
      "http://192.168.0.26:8081",
      "http://192.168.0.26:19006",
      "http://192.168.0.26:3000",
      "http://192.168.0.47:8081",
      "http://192.168.0.47:19006",
      "http://192.168.0.47:3000",
      "http://192.168.3.38:8081",
      "http://192.168.3.38:19006",
      "http://10.0.2.2:8081",
      "http://localhost:8080",
      "capacitor://localhost",
      "ionic://localhost",
    ];
    
    // In production, allow any origin for React Native apps
    if (process.env.NODE_ENV === 'production') {
      return callback(null, true);
    }
    
    if (allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV === 'development') {
      callback(null, true);
    } else {
      console.log('CORS blocked origin:', origin);
      callback(null, true); // Allow anyway for React Native compatibility
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: [
    'Content-Type', 
    'Authorization', 
    'X-Requested-With', 
    'Accept', 
    'Origin',
    'Access-Control-Request-Method',
    'Access-Control-Request-Headers'
  ],
  exposedHeaders: ['Authorization'],
  preflightContinue: false,
  optionsSuccessStatus: 204
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path} - Origin: ${req.get('Origin') || 'none'}`);
  next();
});

// Socket.io setup
const io = socketIo(server, {
  cors: {
    origin: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    credentials: true
  }
});

app.use((req, res, next) => {
  req.io = io;
  next();
});

// Parse JSON and URL-encoded data
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// MongoDB connection with enhanced debugging
mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    console.log('✅ MongoDB Connected Successfully');
    console.log('📊 Database name:', mongoose.connection.db.databaseName);
    console.log('🌐 Host:', mongoose.connection.host);
    console.log('🔌 Port:', mongoose.connection.port);
    
    // Test database operations only in development
    if (process.env.NODE_ENV !== 'production') {
      await testDatabaseOperations();
    }
  })
  .catch(err => {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
  });

// Database event listeners
mongoose.connection.on('connected', () => {
  console.log('✅ Mongoose connected to MongoDB');
});

mongoose.connection.on('error', (err) => {
  console.error('❌ Mongoose connection error:', err);
});

mongoose.connection.on('disconnected', () => {
  console.log('⚠️ Mongoose disconnected from MongoDB');
});

mongoose.connection.on('reconnected', () => {
  console.log('🔄 Mongoose reconnected to MongoDB');
});

// Test database operations function (only for development)
const testDatabaseOperations = async () => {
  try {
    console.log('🧪 Testing database operations...');
    
    // Import models - adjust paths as needed
    const Payment = require('./models/Payment');
    const Order = require('./models/Order');
    const User = require('./models/User');
    
    // Count existing records
    const paymentCount = await Payment.countDocuments();
    const orderCount = await Order.countDocuments();
    const userCount = await User.countDocuments();
    
    console.log('📋 Current database counts:');
    console.log('   Payments:', paymentCount);
    console.log('   Orders:', orderCount);
    console.log('   Users:', userCount);
    
    console.log('✅ Database operations test completed successfully');
    
  } catch (error) {
    console.error('💥 Database test failed:', error);
    console.error('   Error details:', error.message);
    console.error('   This might indicate issues with your models or database permissions');
  }
};

// Import models to register them with mongoose - CRITICAL FOR MODEL ACCESS
console.log('📦 Loading models...');
require('./models/User');
require('./models/Restaurant');
require('./models/MenuItem');
require('./models/Driver');
require('./models/Order');
require('./models/Payment');
console.log('✅ Models loaded:', Object.keys(mongoose.models));

// Load and register routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const restaurantRoutes = require('./routes/restaurants');
const orderRoutes = require('./routes/orders');
const paymentRoutes = require('./routes/payments');
const vendorRoutes = require('./routes/vendors');
const driverRoutes = require('./routes/drivers');

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/restaurants', restaurantRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/vendors', vendorRoutes);
app.use('/api/drivers', driverRoutes);

// Serve static files
app.use('/uploads', express.static('uploads'));

// Enhanced health check with database status
app.get('/api/health', async (req, res) => {
  try {
    const dbState = mongoose.connection.readyState;
    const states = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting', 
      3: 'disconnecting'
    };
    
    let collections = {};
    if (dbState === 1) {
      try {
        const Payment = require('./models/Payment');
        const Order = require('./models/Order');
        const User = require('./models/User');
        
        collections = {
          payments: await Payment.countDocuments(),
          orders: await Order.countDocuments(),
          users: await User.countDocuments()
        };
      } catch (error) {
        collections.error = error.message;
      }
    }
    
    res.json({ 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      cors: 'enabled',
      database: {
        state: states[dbState],
        connected: dbState === 1,
        name: mongoose.connection.db?.databaseName,
        host: mongoose.connection.host,
        port: mongoose.connection.port
      },
      collections,
      availableModels: Object.keys(mongoose.models)
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Debug endpoints (only available in development)
if (process.env.NODE_ENV !== 'production') {
  // Debug endpoint for specific payment
  app.get('/api/debug/payment/:identifier', async (req, res) => {
    try {
      const { identifier } = req.params;
      const Payment = require('./models/Payment');
      
      console.log('🔍 Debug request for payment:', identifier);
      
      // Try to find payment by various identifiers
      let payment = await Payment.findOne({
        $or: [
          { paymentId: identifier },
          { stripePaymentIntentId: identifier },
          { _id: mongoose.Types.ObjectId.isValid(identifier) ? identifier : null }
        ]
      }).populate('order').populate('customer', 'name email').populate('restaurant', 'name');
      
      if (payment) {
        console.log('✅ Payment found in debug:', payment.paymentId);
        res.json({ 
          found: true, 
          payment: {
            paymentId: payment.paymentId,
            status: payment.status,
            amount: payment.amount,
            stripePaymentIntentId: payment.stripePaymentIntentId,
            customer: payment.customer,
            restaurant: payment.restaurant,
            order: payment.order,
            createdAt: payment.createdAt,
            updatedAt: payment.updatedAt
          }
        });
      } else {
        console.log('❌ Payment not found in debug');
        
        // Show recent payments for context
        const recentPayments = await Payment.find()
          .sort({ createdAt: -1 })
          .limit(10)
          .select('paymentId status createdAt stripePaymentIntentId amount.total');
        
        res.json({ 
          found: false, 
          recentPayments: recentPayments.map(p => ({
            paymentId: p.paymentId,
            status: p.status,
            total: p.amount.total,
            stripePaymentIntentId: p.stripePaymentIntentId,
            createdAt: p.createdAt
          })),
          message: 'Payment not found'
        });
      }
    } catch (error) {
      console.error('💥 Debug endpoint error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Debug endpoint for all payments (limit 20)
  app.get('/api/debug/payments/all', async (req, res) => {
    try {
      const Payment = require('./models/Payment');
      
      const payments = await Payment.find()
        .sort({ createdAt: -1 })
        .limit(20)
        .populate('customer', 'name email')
        .populate('restaurant', 'name')
        .populate('order', 'orderNumber total');
      
      console.log('📋 Debug: Found', payments.length, 'payments in database');
      
      res.json({ 
        count: payments.length,
        payments: payments.map(p => ({
          paymentId: p.paymentId,
          status: p.status,
          total: p.amount.total,
          customer: p.customer?.name || 'Unknown',
          restaurant: p.restaurant?.name || 'Unknown',
          orderNumber: p.order?.orderNumber || 'Unknown',
          createdAt: p.createdAt,
          stripePaymentIntentId: p.stripePaymentIntentId
        }))
      });
    } catch (error) {
      console.error('💥 Debug all payments error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Debug endpoint to test payment creation
  app.post('/api/debug/test-payment', async (req, res) => {
    try {
      const Payment = require('./models/Payment');
      
      console.log('🧪 Creating test payment via debug endpoint...');
      
      const testPayment = new Payment({
        stripePaymentIntentId: `debug_test_${Date.now()}`,
        order: new mongoose.Types.ObjectId(),
        customer: new mongoose.Types.ObjectId(),
        restaurant: new mongoose.Types.ObjectId(),
        amount: {
          subtotal: 19.99,
          deliveryFee: 2.99,
          tax: 1.84,
          total: 24.82,
          platformFee: 0.60,
          vendorAmount: 24.22
        },
        currency: 'USD',
        status: 'pending'
      });

      const savedPayment = await testPayment.save();
      console.log('✅ Debug test payment created:', savedPayment.paymentId);
      
      // Verify it exists
      const foundPayment = await Payment.findById(savedPayment._id);
      
      res.json({
        success: true,
        message: 'Test payment created successfully',
        payment: {
          paymentId: savedPayment.paymentId,
          id: savedPayment._id,
          status: savedPayment.status,
          amount: savedPayment.amount,
          verified: !!foundPayment
        }
      });
    } catch (error) {
      console.error('💥 Test payment creation failed:', error);
      res.status(500).json({ 
        success: false,
        error: error.message,
        stack: error.stack
      });
    }
  });
}

// Test CORS endpoint
app.get('/api/test-cors', (req, res) => {
  res.json({ 
    message: 'CORS is working!',
    origin: req.get('Origin'),
    userAgent: req.get('User-Agent'),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Nice Now Deliveries API',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    status: 'running',
    endpoints: {
      health: '/api/health',
      auth: '/api/auth',
      users: '/api/users',
      restaurants: '/api/restaurants',
      orders: '/api/orders',
      payments: '/api/payments',
      vendors: '/api/vendors',
      drivers: '/api/drivers'
    }
  });
});

// 404 handler
app.use('*', (req, res) => {
  console.log('404 - Route not found:', req.method, req.originalUrl);
  res.status(404).json({ 
    message: 'Route not found',
    path: req.originalUrl,
    method: req.method,
    availableEndpoints: [
      '/api/health',
      '/api/auth/*',
      '/api/users/*',
      '/api/restaurants/*',
      '/api/orders/*',
      '/api/payments/*',
      '/api/vendors/*',
      '/api/drivers/*'
    ]
  });
});

// Error handler
app.use((error, req, res, next) => {
  console.error('Global error handler:', error);
  res.status(500).json({ 
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong',
    timestamp: new Date().toISOString()
  });
});

// Start server - UPDATED FOR DEPLOYMENT
const PORT = process.env.PORT || 5000;

// For deployment, bind to all interfaces (0.0.0.0)
// For local development, you can still use specific IP
const HOST = process.env.NODE_ENV === 'production' ? '0.0.0.0' : '0.0.0.0';

server.listen(PORT, HOST, () => {
  console.log('================================================');
  console.log(`🚀 Server Running on ${HOST}:${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  
  if (process.env.NODE_ENV === 'production') {
    console.log(`🌐 Production URL: https://your-app-name.onrender.com`);
  } else {
    console.log(`🌐 Local: http://localhost:${PORT}`);
    console.log(`🌐 Network: http://192.168.0.26:${PORT}`);
    console.log(`📱 React Native URL: http://192.168.0.26:${PORT}/api`);
    console.log(`🧪 Debug Endpoints Available:`);
    console.log(`   - GET /api/debug/payments/all`);
    console.log(`   - GET /api/debug/payment/:identifier`);
    console.log(`   - POST /api/debug/test-payment`);
  }
  
  console.log(`🔧 CORS: Enabled for React Native`);
  console.log(`🔧 JSON Parsing: Enabled for all routes`);
  console.log(`📋 Health Check: GET /api/health`);
  console.log('================================================');
});

module.exports = app;