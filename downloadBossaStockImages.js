// downloadBossaStockImages.js - Download stock images for Bossa menu
const https = require('https');
const fs = require('fs');
const path = require('path');

const menuImagesDir = path.join(__dirname, 'Uploads', 'menu-items', 'bossa');

// Professional food/wine stock images from Unsplash
const stockImages = {
  'beef-curry.jpg': 'https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?w=600&h=600&fit=crop',
  'wine-sauvignon-blanc.jpg': 'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?w=600&h=600&fit=crop',
  'wine-pinotage-rose.jpg': 'https://images.unsplash.com/photo-1567206563064-6f60f40a2b57?w=600&h=600&fit=crop',
  'wine-shiraz.jpg': 'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?w=600&h=600&fit=crop&sat=-20'
};

function downloadImage(url, filename) {
  return new Promise((resolve, reject) => {
    const filepath = path.join(menuImagesDir, filename);
    
    if (fs.existsSync(filepath)) {
      console.log(`⏭️  ${filename} already exists, skipping...`);
      resolve();
      return;
    }

    const file = fs.createWriteStream(filepath);
    
    https.get(url, (response) => {
      response.pipe(file);
      
      file.on('finish', () => {
        file.close();
        console.log(`✅ Downloaded: ${filename}`);
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(filepath, () => {});
      console.log(`❌ Failed to download ${filename}: ${err.message}`);
      reject(err);
    });
  });
}

async function downloadStockImages() {
  console.log('📥 DOWNLOADING STOCK IMAGES FOR BOSSA MENU');
  console.log('='.repeat(80));
  
  if (!fs.existsSync(menuImagesDir)) {
    console.log('📁 Creating folder...');
    fs.mkdirSync(menuImagesDir, { recursive: true });
    console.log('✅ Folder created\n');
  }

  console.log(`📂 Saving to: ${menuImagesDir}\n`);
  console.log('📸 Downloading professional stock images...\n');

  let successCount = 0;
  let failCount = 0;

  for (const [filename, url] of Object.entries(stockImages)) {
    try {
      await downloadImage(url, filename);
      successCount++;
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      failCount++;
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('✅ DOWNLOAD COMPLETE!');
  console.log('='.repeat(80));
  console.log(`✅ Downloaded: ${successCount} images`);
  console.log(`❌ Failed: ${failCount} images`);
  console.log('\n💡 Next step: Run node uploadBossaMenuImages.js');
  console.log('='.repeat(80));
}

downloadStockImages().catch(console.error);