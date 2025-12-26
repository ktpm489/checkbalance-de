const puppeteer = require('puppeteer');

async function scrapeDebankProfile(address) {
  const url = `https://debank.com/profile/${address}`;
  let browser;
  
  try {
    console.log('Launching browser...');
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu'
      ]
    });

    const page = await browser.newPage();
    
    // Set viewport and user agent
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    console.log(`Navigating to ${url}...`);
    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    console.log('Waiting for content to load...');
    
    // Wait a bit for dynamic content
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Try multiple possible selectors
    const selectors = [
      '.HeaderInfo_totalAssetInner__HyrdC.HeaderInfo_curveEnable__HVRYq',
      '.HeaderInfo_totalAssetInner__HyrdC',
      '[class*="HeaderInfo_totalAssetInner"]',
      '[class*="totalAsset"]'
    ];

    let totalAsset = null;

    for (const selector of selectors) {
      try {
        await page.waitForSelector(selector, { timeout: 5000 });
        totalAsset = await page.$eval(selector, el => el.textContent.trim());
        
        if (totalAsset) {
          console.log(`Found with selector: ${selector}`);
          console.log('Total Asset Value:', totalAsset);
          break;
        }
      } catch (err) {
        console.log(`Selector not found: ${selector}`);
        continue;
      }
    }

    if (!totalAsset) {
      // Take a screenshot for debugging
      await page.screenshot({ path: 'debank-debug.png' });
      console.log('Screenshot saved as debank-debug.png for debugging');
      
      // Get all text content to see what's available
      const bodyText = await page.evaluate(() => document.body.innerText);
      console.log('Page content preview:', bodyText.substring(0, 500));
    }

    return totalAsset;

  } catch (error) {
    console.error('Error scraping DeBank profile:', error.message);
    return null;
  } finally {
    if (browser) {
      await browser.close();
      console.log('Browser closed');
    }
  }
}

// Example usage
const walletAddress = '0x33abb60d114346758282d4742db8649c32df21fa';

scrapeDebankProfile(walletAddress)
  .then(result => {
    if (result) {
      console.log('\n✓ Success! Total Assets:', result);
    } else {
      console.log('\n✗ Could not extract total asset value');
    }
    process.exit(0);
  })
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });