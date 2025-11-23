// server.js - COMPLETE FIXED VERSION WITH VENDORS ROUTES
require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const os = require('os');

const app = express();
const server = http.createServer(app);

// ========== UTILITY FUNCTIONS ==========
const getLocalIP = () => {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
};

// ========== CORS CONFIGURATION ==========
const localIP = getLocalIP();
const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      "http://localhost:3000",
      "http://localhost:8081",
      "http://localhost:19006",
      `http://${localIP}:8081`,
      `http://${localIP}:19006`,
      `http://${localIP}:3000`,
      "http://192.168.1.150:8081",
      "http://192.168.1.150:19006",
      "http://192.168.1.150:3000",
      "http://192.168.0.129:8081",
      "http://192.168.0.129:19006",
      "http://192.168.0.234:8081",
      "http://192.168.0.234:19006",
      "capacitor://localhost",
      "ionic://localhost",
    ];
    
    if (process.env.NODE_ENV === 'production' || 
        allowedOrigins.indexOf(origin) !== -1 || 
        process.env.NODE_ENV === 'development') {
      callback(null, true);
    } else {
      callback(null, true); // Allow all in development
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

// ========== MIDDLEWARE ==========

// Request logging with better formatting
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  next();
});

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

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

// ========== DATABASE CONNECTION ==========
const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI;

// Debug logging
console.log('\n🔍 Environment Check:');
console.log('NODE_ENV:', process.env.NODE_ENV || 'development');
console.log('PORT:', process.env.PORT || 5000);
console.log('MONGODB_URI exists:', !!process.env.MONGODB_URI);
console.log('MONGO_URI exists:', !!process.env.MONGO_URI);

if (!MONGODB_URI) {
  console.error('\n❌ CRITICAL ERROR: No MongoDB URI found!');
  console.error('Available MONGO env vars:', 
    Object.keys(process.env).filter(key => key.toUpperCase().includes('MONGO'))
  );
  console.error('\n💡 Solution: Add MONGO_URI to environment variables');
  console.error('Variable name: MONGO_URI');
  console.error('Value format: mongodb+srv://username:password@cluster...');
  process.exit(1);
}

console.log('🔗 Connecting to MongoDB...');
console.log('URI format looks valid:', MONGODB_URI.startsWith('mongodb'));

mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(async () => {
    console.log('✅ MongoDB Connected Successfully');
    console.log('📊 Database:', mongoose.connection.db.databaseName);
    
    if (process.env.NODE_ENV !== 'production') {
      await testDatabase();
    }
  })
  .catch(err => {
    console.error('❌ MongoDB connection error:', err.message);
    console.error('Full error:', err);
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
    
    console.log('📈 Database counts:');
    console.log('   Payments:', paymentCount);
    console.log('   Orders:', orderCount);
    console.log('   Users:', userCount);
  } catch (error) {
    console.error('⚠️ Database test failed:', error.message);
  }
};

// ========== LOAD MODELS ==========
console.log('📦 Loading models...');
require('./models/User');
require('./models/Restaurant');
require('./models/MenuItem');
require('./models/Driver');
require('./models/Order');
require('./models/Payment');
console.log('✅ Models loaded:', Object.keys(mongoose.models).join(', '));

// ========== LOAD ROUTES ==========
console.log('🛣️  Loading routes...');

let authRoutes, userRoutes, restaurantRoutes, orderRoutes, 
    paymentRoutes, vendorRoutes, driverRoutes, uploadRoutes;

try {
  authRoutes = require('./routes/auth');
  console.log('   ✅ Auth routes loaded');
} catch (e) {
  console.error('   ❌ Auth routes failed:', e.message);
}

try {
  userRoutes = require('./routes/users');
  console.log('   ✅ Users routes loaded');
} catch (e) {
  console.error('   ❌ Users routes failed:', e.message);
}

try {
  restaurantRoutes = require('./routes/restaurants');
  console.log('   ✅ Restaurants routes loaded');
} catch (e) {
  console.error('   ❌ Restaurants routes failed:', e.message);
}

try {
  orderRoutes = require('./routes/orders');
  console.log('   ✅ Orders routes loaded');
} catch (e) {
  console.error('   ❌ Orders routes failed:', e.message);
}

try {
  paymentRoutes = require('./routes/payments');
  console.log('   ✅ Payments routes loaded');
} catch (e) {
  console.error('   ❌ Payments routes failed:', e.message);
}

try {
  vendorRoutes = require('./routes/vendors');
  console.log('   ✅ Vendors routes loaded');
} catch (e) {
  console.error('   ❌ Vendors routes failed:', e.message);
  console.error('   💡 Make sure backend/routes/vendors.js exists');
}

try {
  driverRoutes = require('./routes/drivers');
  console.log('   ✅ Drivers routes loaded');
} catch (e) {
  console.error('   ❌ Drivers routes failed:', e.message);
}

try {
  uploadRoutes = require('./routes/upload');
  console.log('   ✅ Upload routes loaded');
} catch (e) {
  console.error('   ❌ Upload routes failed:', e.message);
}

// ========== STATIC FILES ==========
const uploadsPath = path.join(__dirname, 'uploads');
app.use('/uploads', express.static(uploadsPath));

// ========== REGISTER ROUTES ==========
console.log('🔗 Registering routes...');

if (authRoutes) {
  app.use('/api/auth', authRoutes);
  console.log('   ✅ /api/auth registered');
}

if (userRoutes) {
  app.use('/api/users', userRoutes);
  console.log('   ✅ /api/users registered');
}

if (restaurantRoutes) {
  app.use('/api/restaurants', restaurantRoutes);
  console.log('   ✅ /api/restaurants registered');
}

if (orderRoutes) {
  app.use('/api/orders', orderRoutes);
  console.log('   ✅ /api/orders registered');
}

if (paymentRoutes) {
  app.use('/api/payments', paymentRoutes);
  console.log('   ✅ /api/payments registered');
}

// CRITICAL: Register vendors routes
if (vendorRoutes) {
  app.use('/api/vendors', vendorRoutes);
  console.log('   ✅ /api/vendors registered');
  console.log('   📍 /api/vendors/orders - GET vendor orders');
  console.log('   📍 /api/vendors/orders/:id/status - PATCH update order status');
  console.log('   📍 /api/vendors/restaurant - GET vendor restaurant');
  console.log('   📍 /api/vendors/menu - GET vendor menu');
} else {
  console.error('   ❌ /api/vendors NOT registered - vendors.js file missing or has errors!');
}

if (driverRoutes) {
  app.use('/api/drivers', driverRoutes);
  console.log('   ✅ /api/drivers registered');
}

if (uploadRoutes) {
  app.use('/api/upload', uploadRoutes);
  console.log('   ✅ /api/upload registered');
}

// ========== API ENDPOINTS ==========

// Health check with detailed info
app.get('/api/health', async (req, res) => {
  try {
    const dbState = mongoose.connection.readyState;
    const states = { 0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting' };
    
    const cloudinaryConfigured = !!(
      process.env.CLOUDINARY_CLOUD_NAME && 
      process.env.CLOUDINARY_API_KEY && 
      process.env.CLOUDINARY_API_SECRET
    );
    
    res.json({ 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      serverIP: getLocalIP(),
      database: {
        state: states[dbState],
        connected: dbState === 1,
        name: mongoose.connection.db?.databaseName
      },
      cloudinary: {
        configured: cloudinaryConfigured,
        cloudName: cloudinaryConfigured ? process.env.CLOUDINARY_CLOUD_NAME : 'not configured'
      },
      routes: {
        auth: !!authRoutes,
        users: !!userRoutes,
        restaurants: !!restaurantRoutes,
        orders: !!orderRoutes,
        payments: !!paymentRoutes,
        vendors: !!vendorRoutes,
        drivers: !!driverRoutes,
        upload: !!uploadRoutes
      },
      models: Object.keys(mongoose.models)
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'error', 
      message: error.message 
    });
  }
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Nice Now Deliveries API',
    version: '1.0.0',
    status: 'running',
    serverIP: getLocalIP(),
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
    },
    vendorEndpoints: {
      getOrders: 'GET /api/vendors/orders',
      updateOrderStatus: 'PATCH /api/vendors/orders/:id/status',
      getRestaurant: 'GET /api/vendors/restaurant',
      getMenu: 'GET /api/vendors/menu'
    }
  });
});

// Debug endpoint to list all registered routes
app.get('/api/debug/routes', (req, res) => {
  const routes = [];
  
  function extractRoutes(stack, prefix = '') {
    stack.forEach((middleware) => {
      if (middleware.route) {
        const methods = Object.keys(middleware.route.methods).join(', ').toUpperCase();
        routes.push({
          path: prefix + middleware.route.path,
          methods: methods
        });
      } else if (middleware.name === 'router') {
        const routerPath = middleware.regexp.source
          .replace('\\/?', '')
          .replace('(?=\\/|$)', '')
          .replace(/\\\//g, '/')
          .replace('^', '')
          .replace('$', '');
        
        if (middleware.handle.stack) {
          extractRoutes(middleware.handle.stack, routerPath);
        }
      }
    });
  }
  
  extractRoutes(app._router.stack);
  
  // Sort routes alphabetically
  routes.sort((a, b) => a.path.localeCompare(b.path));
  
  res.json({
    success: true,
    totalRoutes: routes.length,
    routes: routes,
    vendorRoutes: routes.filter(r => r.path.includes('/vendors'))
  });
});

// ========== ERROR HANDLERS ==========

// 404 handler
app.use('*', (req, res) => {
  console.log(`⚠️ 404 - Route not found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ 
    success: false,
    message: 'Route not found',
    path: req.originalUrl,
    method: req.method,
    hint: 'Try GET /api/debug/routes to see all available routes'
  });
});

// Error handler
app.use((error, req, res, next) => {
  console.error('❌ Error:', error);
  res.status(500).json({ 
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
});

// ========== START SERVER ==========
const PORT = process.env.PORT || 5000;

server.listen(PORT, '0.0.0.0', () => {
  const ip = getLocalIP();
  
  console.log('\n================================================');
  console.log('🚀 SERVER STARTED SUCCESSFULLY');
  console.log('================================================');
  console.log(`📍 Local:    http://localhost:${PORT}`);
  console.log(`📍 Network:  http://${ip}:${PORT}`);
  console.log(`📍 API Base: http://${ip}:${PORT}/api`);
  console.log('');
  console.log('📋 Available Routes:');
  console.log('   ✅ /api/health       - Health check');
  console.log('   ✅ /api/auth         - Authentication');
  console.log('   ✅ /api/users        - User management');
  console.log('   ✅ /api/restaurants  - Restaurants');
  console.log('   ✅ /api/orders       - Order management 🎯');
  console.log('   ✅ /api/payments     - Payments');
  console.log('   ✅ /api/vendors      - Vendor operations 🏪');
  console.log('   ✅ /api/drivers      - Driver operations');
  console.log('   ✅ /api/upload       - Image uploads');
  console.log('');
  console.log('🏪 Vendor Routes:');
  console.log('   📍 GET    /api/vendors/orders');
  console.log('   📍 PATCH  /api/vendors/orders/:id/status ⭐');
  console.log('   📍 GET    /api/vendors/restaurant');
  console.log('   📍 GET    /api/vendors/menu');
  console.log('');
  console.log('🧪 Quick Tests:');
  console.log(`   curl http://localhost:${PORT}/api/health`);
  console.log(`   curl http://localhost:${PORT}/api/debug/routes`);
  console.log('');
  const cloudinaryConfigured = !!(
    process.env.CLOUDINARY_CLOUD_NAME && 
    process.env.CLOUDINARY_API_KEY && 
    process.env.CLOUDINARY_API_SECRET
  );
  console.log('☁️  Cloudinary:', cloudinaryConfigured ? '✅ Configured' : '❌ Not configured');
  console.log('📦 Models loaded:', Object.keys(mongoose.models).length);
  console.log('================================================');
  console.log(`\n📱 React Native App Config:`);
  console.log(`   API_BASE_URL = "http://${ip}:${PORT}/api"\n`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing server...');
  server.close(() => {
    mongoose.connection.close(false, () => {
      console.log('MongoDB connection closed');
      process.exit(0);
    });
  });
});

process.on('SIGINT', () => {
  console.log('\nSIGINT received, closing server...');
  server.close(() => {
    mongoose.connection.close(false, () => {
      console.log('MongoDB connection closed');
      process.exit(0);
    });
  });
});

module.exports = app;