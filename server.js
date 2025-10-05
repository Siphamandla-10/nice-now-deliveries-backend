// server.js - COMPLETE VERSION WITH CLOUDINARY
require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);

// CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      "http://localhost:3000",
      "http://localhost:8081",
      "http://localhost:19006",
      "http://192.168.1.114:8081",
      "http://192.168.1.114:19006",
      "http://192.168.1.114:3000",
      "http://192.168.0.126:8081",
      "http://192.168.0.126:19006",
      "http://192.168.0.26:8081",
      "http://192.168.0.26:19006",
      "capacitor://localhost",
      "ionic://localhost",
    ];
    
    if (process.env.NODE_ENV === 'production') {
      return callback(null, true);
    }
    
    if (allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV === 'development') {
      callback(null, true);
    } else {
      callback(null, true);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  exposedHeaders: ['Authorization'],
  preflightContinue: false,
  optionsSuccessStatus: 204
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Socket.io
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

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// MongoDB connection
mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    console.log('MongoDB Connected Successfully');
    console.log('Database:', mongoose.connection.db.databaseName);
    
    if (process.env.NODE_ENV !== 'production') {
      await testDatabase();
    }
  })
  .catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });

const testDatabase = async () => {
  try {
    const Payment = require('./models/Payment');
    const Order = require('./models/Order');
    const User = require('./models/User');
    
    const paymentCount = await Payment.countDocuments();
    const orderCount = await Order.countDocuments();
    const userCount = await User.countDocuments();
    
    console.log('Database counts:');
    console.log('  Payments:', paymentCount);
    console.log('  Orders:', orderCount);
    console.log('  Users:', userCount);
  } catch (error) {
    console.error('Database test failed:', error.message);
  }
};

// Load models
console.log('Loading models...');
require('./models/User');
require('./models/Restaurant');
require('./models/MenuItem');
require('./models/Driver');
require('./models/Order');
require('./models/Payment');
console.log('Models loaded:', Object.keys(mongoose.models));

// Load routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const restaurantRoutes = require('./routes/restaurants');
const orderRoutes = require('./routes/orders');
const paymentRoutes = require('./routes/payments');
const vendorRoutes = require('./routes/vendors');
const driverRoutes = require('./routes/drivers');
const uploadRoutes = require('./routes/upload');  // NEW: Cloudinary routes

// Register routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/restaurants', restaurantRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/vendors', vendorRoutes);
app.use('/api/drivers', driverRoutes);
app.use('/api/upload', uploadRoutes);  // NEW: Register upload routes

// Serve static files
const uploadsPath = path.join(__dirname, 'uploads');
app.use('/uploads', express.static(uploadsPath));

// Health check
app.get('/api/health', async (req, res) => {
  try {
    const dbState = mongoose.connection.readyState;
    const states = { 0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting' };
    
    // Check Cloudinary configuration
    const cloudinaryConfigured = !!(
      process.env.CLOUDINARY_CLOUD_NAME && 
      process.env.CLOUDINARY_API_KEY && 
      process.env.CLOUDINARY_API_SECRET
    );
    
    res.json({ 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      database: {
        state: states[dbState],
        connected: dbState === 1,
        name: mongoose.connection.db?.databaseName
      },
      cloudinary: {
        configured: cloudinaryConfigured,
        cloudName: cloudinaryConfigured ? process.env.CLOUDINARY_CLOUD_NAME : 'not configured'
      },
      models: Object.keys(mongoose.models)
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Nice Now Deliveries API',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      health: '/api/health',
      auth: '/api/auth',
      users: '/api/users',
      restaurants: '/api/restaurants',
      orders: '/api/orders',
      payments: '/api/payments',
      vendors: '/api/vendors',
      drivers: '/api/drivers',
      upload: '/api/upload'
    }
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ 
    message: 'Route not found',
    path: req.originalUrl,
    method: req.method
  });
});

// Error handler
app.use((error, req, res, next) => {
  console.error('Error:', error);
  res.status(500).json({ 
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
});

// Start server
const PORT = process.env.PORT || 5000;

server.listen(PORT, '0.0.0.0', () => {
  console.log('================================================');
  console.log(`Server Running on 0.0.0.0:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Local: http://localhost:${PORT}`);
  console.log(`Network: http://192.168.1.116:${PORT}`);
  console.log(`API Base: http://192.168.1.116:${PORT}/api`);
  console.log('');
  console.log('Available Routes:');
  console.log('  /api/auth       - Authentication');
  console.log('  /api/users      - User management');
  console.log('  /api/restaurants - Restaurant operations');
  console.log('  /api/orders     - Order management');
  console.log('  /api/payments   - Payment processing');
  console.log('  /api/vendors    - Vendor operations');
  console.log('  /api/drivers    - Driver operations');
  console.log('  /api/upload     - Image uploads (Cloudinary)');
  console.log('');
  const cloudinaryConfigured = !!(
    process.env.CLOUDINARY_CLOUD_NAME && 
    process.env.CLOUDINARY_API_KEY && 
    process.env.CLOUDINARY_API_SECRET
  );
  console.log('Cloudinary: ' + (cloudinaryConfigured ? 'Configured' : 'Not configured'));
  console.log('================================================');
});

module.exports = app;