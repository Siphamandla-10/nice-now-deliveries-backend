// fixOrdersVendor.js
const mongoose = require("mongoose");
const Order = require("./models/Order");
const Restaurant = require("./models/Restaurant");

(async () => {
  await mongoose.connect("mongodb+srv://sphakhumalo610:Aphiwe%402018@cluster0.cxs0hbt.mongodb.net/food-delivery?retryWrites=true&w=majority&appName=Cluster0");

  console.log("🔄 Fixing vendor fields in existing orders...");

  const orders = await Order.find({ vendor: { $exists: false } });
  for (const order of orders) {
    const restaurant = await Restaurant.findById(order.restaurant);
    if (restaurant && restaurant.owner) {
      order.vendor = restaurant.owner;
      await order.save();
      console.log(`✅ Fixed order ${order._id}`);
    } else {
      console.log(`⚠️ No vendor found for restaurant ${order.restaurant}`);
    }
  }

  console.log("🎯 Done fixing vendor fields.");
  mongoose.connection.close();
})();
