const axios = require('axios');

const testMenuAPI = async () => {
  try {
    console.log('🧪 Testing Menu API...\n');
    
    // Login with delivernow@gmail.com
    const loginResponse = await axios.post('http://172.20.10.2:5000/api/auth/login', {
      email: 'delivernow@gmail.com',
      password: 'password123'
    });
    
    const token = loginResponse.data.token;
    console.log('✅ Login successful');
    console.log('User:', loginResponse.data.user.name);
    console.log('User ID:', loginResponse.data.user._id);
    console.log('');
    
    // Get menu items
    const menuResponse = await axios.get('http://172.20.10.2:5000/api/vendors/menu', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    console.log('📋 Menu API Response:\n');
    console.log(`Success: ${menuResponse.data.success}`);
    console.log(`Total items: ${menuResponse.data.menuItems?.length || 0}\n`);
    
    if (menuResponse.data.menuItems && menuResponse.data.menuItems.length > 0) {
      menuResponse.data.menuItems.forEach((item, index) => {
        console.log(`${index + 1}. ${item.name}`);
        console.log(`   Price: R${item.price}`);
        console.log(`   Category: ${item.category}`);
        console.log(`   Available: ${item.isAvailable}`);
        console.log(`   Image type: ${typeof item.image}`);
        console.log(`   Image value: ${item.image}`);
        console.log('');
      });
    } else {
      console.log('❌ No menu items returned');
      console.log('Full response:', JSON.stringify(menuResponse.data, null, 2));
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Response:', JSON.stringify(error.response.data, null, 2));
    }
  }
};

testMenuAPI();