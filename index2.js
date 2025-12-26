const axios = require('axios');
const cheerio = require('cheerio');

async function scrapeDebankProfile(address) {
  const url = `https://debank.com/profile/${address}`;
  
  try {
    // Make the HTTP request
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      }
    });
    console.log('HTTP request successful. Status code:', response.data);
    // Load the HTML into cheerio
    const $ = cheerio.load(response.data);

    // Extract the value from the specific div
    const totalAsset = $('.HeaderInfo_totalAssetInner__HyrdC.HeaderInfo_curveEnable__HVRYq').text().trim();

    if (totalAsset) {
      console.log('Total Asset Value:', totalAsset);
      return totalAsset;
    } else {
      console.log('Element not found. The page might be dynamically loaded with JavaScript.');
      console.log('Consider using Puppeteer or Playwright for JavaScript-rendered content.');
      return null;
    }

  } catch (error) {
    console.error('Error scraping DeBank profile:', error.message);
    return null;
  }
}

// Example usage
const walletAddress = '0xe8a2bfaadff50c8ca75aac494134da77f9820b24';
scrapeDebankProfile(walletAddress);

// If the above doesn't work (DeBank uses client-side rendering), use Puppeteer:
/*
const puppeteer = require('puppeteer');

async function scrapeWithPuppeteer(address) {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  
  try {
    await page.goto(`https://debank.com/profile/${address}`, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    // Wait for the element to appear
    await page.waitForSelector('.HeaderInfo_totalAssetInner__HyrdC.HeaderInfo_curveEnable__HVRYq', {
      timeout: 10000
    });

    // Extract the text content
    const totalAsset = await page.$eval(
      '.HeaderInfo_totalAssetInner__HyrdC.HeaderInfo_curveEnable__HVRYq',
      el => el.textContent.trim()
    );

    console.log('Total Asset Value:', totalAsset);
    return totalAsset;

  } catch (error) {
    console.error('Error:', error.message);
    return null;
  } finally {
    await browser.close();
  }
}

scrapeWithPuppeteer(walletAddress);
*/