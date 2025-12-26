const puppeteer = require("puppeteer");
const tr = require("tor-request");
const net = require("net");

// Tor Configuration
const TOR_CONFIG = {
  host: "localhost",
  port: 9050, // Try 9150 if using Tor Browser
  timeout: 10000
};

// Configure Tor
tr.setTorAddress(TOR_CONFIG.host, TOR_CONFIG.port);

// Extensive array of user agents
const USER_AGENTS = [
  // Chrome on Windows
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36",
  
  // Chrome on macOS
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
  
  // Firefox on Windows
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0",
  
  // Safari on macOS
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
];

function getRandomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function getRandomDelay(min, max) {
  const range = max - min;
  const random = Math.random();
  
  if (random < 0.7) {
    return min + Math.floor(Math.random() * (range / 2));
  } else {
    return min + Math.floor(range / 2) + Math.floor(Math.random() * (range / 2));
  }
}

// Check if Tor proxy is accessible
async function checkTorProxy() {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    socket.setTimeout(5000);
    
    socket.connect(TOR_CONFIG.port, TOR_CONFIG.host, () => {
      console.log(`✓ Tor proxy is accessible at ${TOR_CONFIG.host}:${TOR_CONFIG.port}`);
      socket.destroy();
      resolve(true);
    });
    
    socket.on("timeout", () => {
      socket.destroy();
      reject(new Error(`Tor proxy timeout at ${TOR_CONFIG.host}:${TOR_CONFIG.port}`));
    });
    
    socket.on("error", (err) => {
      reject(new Error(`Cannot connect to Tor proxy at ${TOR_CONFIG.host}:${TOR_CONFIG.port} - ${err.message}`));
    });
  });
}

// Check Tor connection
async function checkTorConnection() {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Tor connection check timed out after 10 seconds"));
    }, TOR_CONFIG.timeout);

    tr.request("https://check.torproject.org/api/ip", (err, res, body) => {
      clearTimeout(timeout);
      
      if (err) {
        reject(new Error("Tor connection failed: " + err.message));
        return;
      }
      
      try {
        const data = JSON.parse(body);
        if (data.IsTor) {
          console.log("✓ Connected to Tor network");
          console.log(`  Tor IP: ${data.IP}`);
          resolve(data.IP);
        } else {
          reject(new Error("Not connected through Tor"));
        }
      } catch (e) {
        reject(new Error("Failed to parse Tor check response"));
      }
    });
  });
}

// Request new Tor identity
async function renewTorIdentity() {
  return new Promise((resolve) => {
    console.log("Requesting new Tor identity...");
    tr.renewTorSession((err) => {
      if (err) {
        console.log("Warning: Could not renew Tor session:", err.message);
      } else {
        console.log("✓ Tor identity renewed");
      }
      resolve();
    });
  });
}

async function scrapeDebankProfile(address, browser) {
  const url = `https://debank.com/profile/${address}`;

  try {
    const page = await browser.newPage();

    // Set viewport and random user agent
    await page.setViewport({ width: 1920, height: 1080 });
    const userAgent = getRandomUserAgent();
    await page.setUserAgent(userAgent);
    console.log(`Using User-Agent: ${userAgent.substring(0, 60)}...`);

    console.log(`\nNavigating to ${address}...`);
    await page.goto(url, {
      waitUntil: "networkidle2",
      timeout: 60000,
    });

    // Random wait time between 10-30 seconds after page load
    const pageLoadDelay = getRandomDelay(10000, 30000);
    console.log(`Waiting ${(pageLoadDelay / 1000).toFixed(2)}s for content to load...`);
    await new Promise((resolve) => setTimeout(resolve, pageLoadDelay));

    // Try multiple possible selectors
    const selectors = [
      ".HeaderInfo_totalAssetInner__HyrdC.HeaderInfo_curveEnable__HVRYq",
      ".HeaderInfo_totalAssetInner__HyrdC",
      '[class*="HeaderInfo_totalAssetInner"]',
      '[class*="totalAsset"]',
    ];

    let totalAsset = null;

    for (const selector of selectors) {
      try {
        await page.waitForSelector(selector, { timeout: 5000 });
        totalAsset = await page.$eval(selector, (el) => el.textContent.trim());

        if (totalAsset) {
          console.log(`✓ Found total assets: ${totalAsset}`);
          break;
        }
      } catch (err) {
        continue;
      }
    }

    if (!totalAsset) {
      console.log(`✗ Could not find total asset value for ${address}`);
    }

    await page.close();
    return { address, totalAsset };
  } catch (error) {
    console.error(`Error scraping ${address}:`, error.message);
    return { address, totalAsset: null, error: error.message };
  }
}

async function scrapeMultipleAddresses(addresses) {
  let browser;
  const results = [];

  try {
    // Check if Tor proxy is accessible first
    console.log("Checking Tor proxy accessibility...");
    try {
      await checkTorProxy();
    } catch (err) {
      console.error("\n❌ " + err.message);
      console.error("\nTroubleshooting steps:");
      console.error("1. Install Tor:");
      console.error("   - Ubuntu/Debian: sudo apt install tor");
      console.error("   - macOS: brew install tor");
      console.error("   - Windows: Download from https://www.torproject.org/download/");
      console.error("\n2. Start Tor:");
      console.error("   - Linux/macOS: Run 'tor' in terminal");
      console.error("   - Or: sudo systemctl start tor");
      console.error("   - Windows: Start Tor service or Tor Browser");
      console.error("\n3. If using Tor Browser, change TOR_CONFIG.port to 9150");
      console.error("\n4. Verify Tor is running: netstat -an | grep 9050");
      throw new Error("Tor proxy not accessible");
    }

    // Check Tor connection
    console.log("\nVerifying Tor network connection...");
    await checkTorConnection();

    console.log("\nLaunching browser with Tor proxy...");
    browser = await puppeteer.launch({
      headless: "new",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--disable-gpu",
        // Route Puppeteer through Tor SOCKS5 proxy
        `--proxy-server=socks5://${TOR_CONFIG.host}:${TOR_CONFIG.port}`,
      ],
    });

    console.log(`\nScraping ${addresses.length} addresses...\n`);

    for (let i = 0; i < addresses.length; i++) {
      const address = addresses[i];
      console.log(`[${i + 1}/${addresses.length}] Processing: ${address}`);

      const result = await scrapeDebankProfile(address, browser);
      results.push(result);

      // Renew Tor identity every 2-3 requests for better anonymity
      if ((i + 1) % 2 === 0 && i < addresses.length - 1) {
        await renewTorIdentity();
        await new Promise((resolve) => setTimeout(resolve, 3000)); // Wait for circuit to establish
      }

      // Random delay between requests (5-15 seconds for Tor)
      if (i < addresses.length - 1) {
        const requestDelay = getRandomDelay(5000, 15000);
        console.log(`Waiting ${(requestDelay / 1000).toFixed(2)}s before next request...`);
        await new Promise((resolve) => setTimeout(resolve, requestDelay));
      }
    }

    return results;
  } catch (error) {
    console.error("Fatal error:", error.message);
    return results;
  } finally {
    if (browser) {
      await browser.close();
      console.log("\nBrowser closed");
    }
  }
}

// Example usage with multiple addresses
const walletAddresses = [
  "0x6c5b39764ff267a8628b9f2d6a5b5861596a4ad4",
  "0xe84ed3ba93c442ee46cba23adbdb828be024684b",
    "0xe8a2bfaadff50c8ca75aac494134da77f9820b24"
];

scrapeMultipleAddresses(walletAddresses)
  .then((results) => {
    console.log("\n" + "=".repeat(60));
    console.log("RESULTS SUMMARY");
    console.log("=".repeat(60));

    results.forEach((result, index) => {
      console.log(`\n${index + 1}. Address: ${result.address}`);
      if (result.totalAsset) {
        console.log(`   Total Assets: ${result.totalAsset}`);
      } else {
        console.log(`   Status: Failed to retrieve`);
        if (result.error) {
          console.log(`   Error: ${result.error}`);
        }
      }
    });

    console.log("\n" + "=".repeat(60));

    // Optional: Save to JSON file
    const fs = require("fs");
    fs.writeFileSync("debank-results.json", JSON.stringify(results, null, 2));
    console.log("\nResults saved to debank-results.json");

    process.exit(0);
  })
  .catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });