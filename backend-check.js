// backend-check.js
// Run this in your backend directory: node backend-check.js

const express = require('express');
const app = express();

console.log('\n========================================');
console.log('BACKEND ROUTES VERIFICATION');
console.log('========================================\n');

// Check if routes files exist
const fs = require('fs');
const path = require('path');

const routesPath = path.join(__dirname, 'routes');
const requiredRoutes = ['auth.js', 'users.js', 'orders.js', 'vendors.js', 'drivers.js', 'restaurants.js'];

console.log('1. CHECKING ROUTE FILES:\n');
requiredRoutes.forEach(file => {
  const exists = fs.existsSync(path.join(routesPath, file));
  console.log(`   ${exists ? '✅' : '❌'} ${file} ${exists ? 'EXISTS' : 'MISSING'}`);
});

console.log('\n2. CHECKING ROUTE REGISTRATION:\n');

// Try to import and check routes
try {
  const ordersRouter = require('./routes/orders');
  console.log('   ✅ orders.js can be imported');
  
  // Check if routes are Express Router
  if (ordersRouter && typeof ordersRouter === 'function') {
    console.log('   ✅ orders.js exports a valid Express Router');
    
    // Try to inspect routes (this won't work perfectly but gives an idea)
    const routes = [];
    ordersRouter.stack.forEach(layer => {
      if (layer.route) {
        const methods = Object.keys(layer.route.methods).join(', ').toUpperCase();
        routes.push(`${methods} ${layer.route.path}`);
      }
    });
    
    console.log('\n   Registered routes in orders.js:');
    routes.forEach(route => {
      console.log(`      • ${route}`);
    });
  } else {
    console.log('   ❌ orders.js does not export a valid router');
  }
} catch (error) {
  console.log(`   ❌ Error importing orders.js: ${error.message}`);
}

console.log('\n3. CHECKING MAIN SERVER FILE:\n');

// Check if main server file registers routes
const serverFiles = ['server.js', 'app.js', 'index.js'];
let serverFile = null;

for (const file of serverFiles) {
  if (fs.existsSync(file)) {
    serverFile = file;
    break;
  }
}

if (serverFile) {
  console.log(`   ✅ Found server file: ${serverFile}`);
  const serverContent = fs.readFileSync(serverFile, 'utf8');
  
  console.log('\n   Checking route registrations:');
  
  const routeChecks = [
    { pattern: /app\.use\(['"`]\/api\/orders['"`].*orders/i, name: 'Orders routes' },
    { pattern: /app\.use\(['"`]\/api\/users['"`].*users/i, name: 'Users routes' },
    { pattern: /app\.use\(['"`]\/api\/vendors['"`].*vendors/i, name: 'Vendors routes' },
    { pattern: /app\.use\(['"`]\/api\/auth['"`].*auth/i, name: 'Auth routes' }
  ];
  
  routeChecks.forEach(check => {
    const registered = check.pattern.test(serverContent);
    console.log(`      ${registered ? '✅' : '❌'} ${check.name} ${registered ? 'REGISTERED' : 'NOT REGISTERED'}`);
  });
} else {
  console.log('   ❌ Could not find main server file');
}

console.log('\n4. SOLUTION:\n');
console.log('   If orders routes are NOT registered, add this to your server file:\n');
console.log('   const ordersRouter = require(\'./routes/orders\');');
console.log('   app.use(\'/api/orders\', ordersRouter);\n');

console.log('5. TESTING ENDPOINTS:\n');
console.log('   After fixing, test these endpoints:');
console.log('   • GET  /api/orders/my-orders (customer orders)');
console.log('   • GET  /api/orders (all orders)');
console.log('   • POST /api/orders (create order)');
console.log('   • GET  /api/orders/debug/all (debug endpoint)\n');

console.log('========================================');
console.log('Run your server and test with:');
console.log('curl http://localhost:5000/api/orders/test-debug');
console.log('========================================\n');