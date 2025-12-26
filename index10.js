const puppeteer = require("puppeteer");
const tr = require("tor-request");
const net = require("net");
const fs = require("fs");

// Tor Configuration
const TOR_CONFIG = {
  host: "localhost",
  port: 9050,
  controlPort: 9051,
  controlPassword: "",
  timeout: 10000
};

tr.setTorAddress(TOR_CONFIG.host, TOR_CONFIG.port);

if (TOR_CONFIG.controlPassword) {
  tr.TorControlPort.password = TOR_CONFIG.controlPassword;
  tr.TorControlPort.host = TOR_CONFIG.host;
  tr.TorControlPort.port = TOR_CONFIG.controlPort;
}

// Enhanced user agents with more variety
const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7; rv:109.0) Gecko/20100101 Firefox/115.0",
  "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/121.0"
];

// Enhanced browser languages for better disguise
const LANGUAGES = [
  "en-US,en;q=0.9",
  "en-GB,en;q=0.9",
  "en-US,en;q=0.9,es;q=0.8",
  "en-CA,en;q=0.9,fr;q=0.8"
];

function getRandomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function getRandomLanguage() {
  return LANGUAGES[Math.floor(Math.random() * LANGUAGES.length)];
}

function getRandomDelay(min, max) {
  return min + Math.floor(Math.random() * (max - min));
}

// Check if Tor proxy is accessible
async function checkTorProxy() {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    socket.setTimeout(3000); // Reduced from 5000

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

// Get current Tor IP
async function getCurrentTorIP() {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Tor IP check timed out"));
    }, TOR_CONFIG.timeout);

    tr.request("https://check.torproject.org/api/ip", (err, res, body) => {
      clearTimeout(timeout);
      if (err) {
        reject(new Error("Failed to get Tor IP: " + err.message));
        return;
      }
      try {
        const data = JSON.parse(body);
        if (data.IsTor) {
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

// Check Tor connection
async function checkTorConnection() {
  console.log("✓ Connected to Tor network");
  const ip = await getCurrentTorIP();
  console.log(`  Tor IP: ${ip}`);
  return ip;
}

// Force new Tor circuit
async function forceNewCircuit() {
  console.log("\n🔄 Forcing new Tor circuit...");
  
  try {
    const { execSync } = require('child_process');
    execSync('killall -HUP tor 2>/dev/null || pkill -HUP tor 2>/dev/null || true', { stdio: 'ignore' });
    console.log("  ✓ Tor circuits cleared");
  } catch (err) {
    console.log("  Note: Could not send HUP signal");
  }

  console.log("  Waiting for new Tor circuits...");
  await new Promise((resolve) => setTimeout(resolve, 4000)); // Reduced from 8000
}

// Verify IP change with retries
async function verifyIPChange(previousIP, maxAttempts = 3) { // Reduced from 5
  let attempts = 0;
  
  while (attempts < maxAttempts) {
    try {
      const newIP = await getCurrentTorIP();
      if (!previousIP || newIP !== previousIP) {
        console.log(`  ✓ New IP acquired: ${newIP}`);
        return newIP;
      } else {
        console.log(`  ⚠️ IP unchanged (${newIP}), waiting longer... (${attempts + 1}/${maxAttempts})`);
        await new Promise((resolve) => setTimeout(resolve, 3000)); // Reduced from 5000
        attempts++;
      }
    } catch (err) {
      console.log(`  Failed to check IP: ${err.message}`);
      attempts++;
      await new Promise((resolve) => setTimeout(resolve, 2000)); // Reduced from 3000
    }
  }
  
  throw new Error("Could not acquire new IP after multiple attempts");
}

// Enhanced scraping with better error handling and retries
async function scrapeDebankProfile(address, browser, retryCount = 0, maxRetries = 3) {
  const url = `https://debank.com/profile/${address}`;
  let page;
  
  try {
    page = await browser.newPage();

    // Enhanced browser fingerprint randomization
    const userAgent = getRandomUserAgent();
    const language = getRandomLanguage();
    
    // Set realistic viewport sizes
    const viewports = [
      { width: 1920, height: 1080 },
      { width: 1366, height: 768 },
      { width: 1536, height: 864 },
      { width: 1440, height: 900 }
    ];
    const viewport = viewports[Math.floor(Math.random() * viewports.length)];
    
    await page.setViewport(viewport);
    await page.setUserAgent(userAgent);
    
    // Set additional headers to look more like a real browser
    await page.setExtraHTTPHeaders({
      'Accept-Language': language,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1'
    });

    // Inject random mouse movements and realistic behavior
    await page.evaluateOnNewDocument(() => {
      // Override navigator properties to avoid detection
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined
      });
      
      // Add realistic window properties
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5]
      });
    });

    console.log(`  Using User-Agent: ${userAgent.substring(0, 50)}...`);
    console.log(`  Viewport: ${viewport.width}x${viewport.height}`);
    console.log(`  Navigating to ${address}...`);

    // Navigate with timeout
    await page.goto(url, {
      waitUntil: "networkidle0", // Changed from networkidle0 for faster loading
      timeout: 60000, // Reduced from 90000
    });

    // Optimized wait time - reduced significantly
    const pageLoadDelay = getRandomDelay(4000, 7000); // Reduced from 15000-35000
    console.log(`  Waiting ${(pageLoadDelay / 1000).toFixed(2)}s for content to load...`);
    await new Promise((resolve) => setTimeout(resolve, pageLoadDelay));

    // Simulate faster scrolling behavior
    await page.evaluate(async () => {
      await new Promise((resolve) => {
        let totalHeight = 0;
        const distance = 150; // Increased from 100 for faster scroll
        const timer = setInterval(() => {
          const scrollHeight = document.body.scrollHeight;
          window.scrollBy(0, distance);
          totalHeight += distance;

          if (totalHeight >= scrollHeight / 2) {
            clearInterval(timer);
            resolve();
          }
        }, 80); // Reduced from 100 for faster scroll
      });
    });

    await new Promise((resolve) => setTimeout(resolve, 1000)); // Reduced from 2000

    // Enhanced selector list with more variations
    const selectors = [
      ".HeaderInfo_totalAssetInner__HyrdC.HeaderInfo_curveEnable__HVRYq",
      ".HeaderInfo_totalAssetInner__HyrdC",
      '[class*="HeaderInfo_totalAssetInner"]',
      '[class*="totalAssetInner"]',
      '[class*="totalAsset"]',
      '[class*="HeaderInfo"]',
      'div[class*="totalAsset"] span',
      'div[class*="HeaderInfo"] span'
    ];

    let totalAsset = null;
    let selectorUsed = null;

    // Try each selector with optimized wait time
    for (const selector of selectors) {
      try {
        await page.waitForSelector(selector, { timeout: 7000 }); // Reduced from 10000
        totalAsset = await page.$eval(selector, (el) => el.textContent.trim());
        if (totalAsset && totalAsset !== '' && totalAsset !== '0' && !totalAsset.includes('undefined')) {
          selectorUsed = selector;
          console.log(`  ✓ Found total assets: ${totalAsset} (using selector: ${selector})`);
          break;
        }
      } catch (err) {
        continue;
      }
    }

    // If no selector worked, save debug info and throw error to trigger IP change
    if (!totalAsset) {
      const screenshotPath = `debug_${address}_${Date.now()}.png`;
      await page.screenshot({ path: screenshotPath, fullPage: true });
      console.log(`  ⚠️ Could not find total asset value for ${address}`);
      console.log(`  📸 Screenshot saved: ${screenshotPath}`);
      
      // Get page content for debugging
      const pageContent = await page.content();
      const debugPath = `debug_${address}_${Date.now()}.html`;
      fs.writeFileSync(debugPath, pageContent);
      console.log(`  📄 Page content saved: ${debugPath}`);
      
      await page.close();
      
      // Throw error to trigger retry with new IP
      throw new Error("Could not find total asset value");
    }

    await page.close();
    
    return {
      address,
      totalAsset,
      selectorUsed,
      userAgent: userAgent,
      viewport: `${viewport.width}x${viewport.height}`,
      success: true
    };

  } catch (error) {
    console.error(`  ❌ Error scraping ${address}:`, error.message);
    
    if (page) {
      try {
        await page.close();
      } catch (e) {
        // Ignore close errors
      }
    }

    // Retry logic with IP change
    if (retryCount < maxRetries) {
      console.log(`  🔄 Retrying with new IP... (attempt ${retryCount + 1}/${maxRetries})`);
      
      // Return special flag to indicate IP change needed
      return {
        needsIPChange: true,
        address,
        retryCount: retryCount + 1,
        error: error.message
      };
    }

    return {
      address,
      totalAsset: null,
      error: error.message,
      retries: retryCount,
      success: false
    };
  }
}

async function scrapeMultipleAddresses(addresses) {
  let browser;
  const results = [];
  const ipLog = [];
  const failedAddresses = [];

  try {
    console.log("Checking Tor proxy accessibility...");
    await checkTorProxy();

    console.log("\nVerifying Tor network connection...");
    const initialIP = await checkTorConnection();
    ipLog.push({ request: 0, ip: initialIP, address: "Initial" });

    console.log("\nUsing browser restart method for IP rotation\n");
    console.log(`\nScraping ${addresses.length} addresses with IP rotation...\n`);

    for (let i = 0; i < addresses.length; i++) {
      const address = addresses[i];
      console.log(`\n[${"=".repeat(60)}]`);
      console.log(`[${i + 1}/${addresses.length}] Processing: ${address}`);
      console.log(`[${"=".repeat(60)}]`);

      // Force new circuit and close browser for each request (except first)
      if (i > 0) {
        if (browser) {
          await browser.close();
          browser = null;
        }

        await forceNewCircuit();
        
        const previousIP = ipLog[ipLog.length - 1].ip;
        try {
          const newIP = await verifyIPChange(previousIP);
          ipLog.push({ request: i + 1, ip: newIP, address });
        } catch (err) {
          console.log(`  ⚠️ Warning: ${err.message}`);
          // Continue anyway
        }

        const circuitDelay = getRandomDelay(2000, 4000); // Reduced from 3000-6000
        console.log(`  Waiting ${(circuitDelay / 1000).toFixed(2)}s for circuit stabilization...`);
        await new Promise((resolve) => setTimeout(resolve, circuitDelay));
      }

      // Launch browser
      if (!browser) {
        console.log("\n  Launching browser with Tor proxy...");
        browser = await puppeteer.launch({
          headless: "new",
          args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-accelerated-2d-canvas",
            "--disable-gpu",
            "--disable-web-security",
            "--disable-features=IsolateOrigins,site-per-process",
            "--disable-blink-features=AutomationControlled",
            `--proxy-server=socks5://${TOR_CONFIG.host}:${TOR_CONFIG.port}`,
          ],
        });
      }

      // Attempt to scrape with automatic IP rotation on failure
      let result;
      let maxIPRetries = 3; // Maximum number of IP changes for this address
      let ipRetryCount = 0;
      
      while (ipRetryCount <= maxIPRetries) {
        result = await scrapeDebankProfile(address, browser, ipRetryCount);
        
        // Check if we need to change IP and retry
        if (result.needsIPChange && ipRetryCount < maxIPRetries) {
          console.log(`\n  🔄 Changing IP for retry...`);
          
          // Close browser and force new circuit
          if (browser) {
            await browser.close();
            browser = null;
          }
          
          await forceNewCircuit();
          
          const previousIP = ipLog[ipLog.length - 1].ip;
          try {
            const newIP = await verifyIPChange(previousIP);
            ipLog.push({ 
              request: `${i + 1}-retry-${ipRetryCount + 1}`, 
              ip: newIP, 
              address: `${address} (retry)` 
            });
          } catch (err) {
            console.log(`  ⚠️ Warning: ${err.message}`);
          }
          
          const circuitDelay = getRandomDelay(2000, 4000); // Reduced from 3000-6000
          console.log(`  Waiting ${(circuitDelay / 1000).toFixed(2)}s for circuit stabilization...`);
          await new Promise((resolve) => setTimeout(resolve, circuitDelay));
          
          // Relaunch browser
          console.log("\n  Relaunching browser with new Tor circuit...");
          browser = await puppeteer.launch({
            headless: "new",
            args: [
              "--no-sandbox",
              "--disable-setuid-sandbox",
              "--disable-dev-shm-usage",
              "--disable-accelerated-2d-canvas",
              "--disable-gpu",
              "--disable-web-security",
              "--disable-features=IsolateOrigins,site-per-process",
              "--disable-blink-features=AutomationControlled",
              `--proxy-server=socks5://${TOR_CONFIG.host}:${TOR_CONFIG.port}`,
            ],
          });
          
          ipRetryCount++;
        } else {
          // Either succeeded or exhausted retries
          break;
        }
      }
      
      results.push(result);
      
      if (!result.success) {
        failedAddresses.push(address);
      }

      // Optimized delay between requests
      if (i < addresses.length - 1) {
        const requestDelay = getRandomDelay(1000, 3000); // Reduced from 8000-20000
        console.log(`\n  ⏱️ Waiting ${(requestDelay / 1000).toFixed(2)}s before next request...`);
        await new Promise((resolve) => setTimeout(resolve, requestDelay));
      }
    }

    // Display summary
    console.log("\n" + "=".repeat(60));
    console.log("IP ROTATION LOG");
    console.log("=".repeat(60));
    ipLog.forEach((entry) => {
      console.log(`Request ${entry.request}: ${entry.ip} (${entry.address})`);
    });

    console.log("\n" + "=".repeat(60));
    console.log("FAILED ADDRESSES");
    console.log("=".repeat(60));
    if (failedAddresses.length === 0) {
      console.log("✓ All addresses scraped successfully!");
    } else {
      failedAddresses.forEach((addr, idx) => {
        console.log(`${idx + 1}. ${addr}`);
      });
      console.log(`\nTotal failed: ${failedAddresses.length}/${addresses.length}`);
    }

    return { results, ipLog, failedAddresses };

  } catch (error) {
    console.error("Fatal error:", error.message);
    return { results, ipLog, failedAddresses };
  } finally {
    if (browser) {
      await browser.close();
      console.log("\nBrowser closed");
    }
  }
}

// Example usage
const raw = `
0x654b22705f2a06cd6d9120d2ac0f7dd659ebfc6e
0x6780a7be5ed085de037ccf1a3214d2a8d463879c
0x6ca07af3682375fae1d3ad5b66e684c4d6aef783
0x707b5e0447cd57c69801b0c274c548800024e7f4
0x71b585d876e426518a115c7a3185323474ff21e6
0x73b1e850f1c360730ec67aeb3fa144a88327c6e7
0x74ba16a57f81dffb573f0427030f1502833bb040
0x7f0298c8ffc109c4746fee3bf8d90749e95795ea
0x7f1abe8c1de9dc475fc330688d739b706ac4aeb6
0x81e9137e1d3c8ec6dc5d3af6b61dbd1ba11beeb6
0x841becc07885fde1530dda577eeb129837eaa333
0x8a3630c9a91f4a1db8b36ad38f539294eaa434c9
0x8cc0ab3c993ab8c4b87ce2570457af00788ff6ac
0x8d7ce1107aebee1e3a9eb4da703da1a2b36b33ae
0x8f0d30188584b606d96fb482eef0b61b5713c3ae
0x8f7ab4721c4954c612af6e6d9200511c3ae115d1
0x90ca0eacf720c8c86ef50109cc19dccabd6e0427
0x91c3b834573ef1301ceb0822bcb95e0f7ccd42ec
0x99c2a232abebccb6dac6411d94b2f08369e00355
0x9c9bc80806a8e43b0b6b1038bfcd4be74e23106a
0x9ec8f246c6acf5f6446ed2f7ea5b92659c27178b
0x9f2cbab6afb0aa5ef51f8c226ea61be78422c7bf
0xa5b053fb2e1a0d391b24408a4500eac3051b8b95
0xabedbe8c3ece31e27831cd945a824fd6b91fc2e5
0xad4d0154092423bfafa8dfc548adb7b572fd022f
0xafef76d5de3cb0ab0c5f6a71f6f3a22cbce4407e
0xb8a2068435741b6997d22c1b8b573150aa26cf78
0xb909610f6d4001c44d000881961d6183a76b01c6
0xbd075c573eb13796ff882e61454e3b13ab420f42
0xbd78b972560efe06bc46a5d45be93fe523025463
0xbd9ba9d8d13c711eb5cde9b22723e7b1939e9c78
0xbefe58f4f74c3b5bd6c952ed551c9810dce3c9ac
0xc03f81a789036646ef9f5554962b868c5e179a5b
0xc3dac2f35836d5ba9fff6a8fbf7a56bafb6b7d63
0xc78ced0f4d6ce02e43ed68d248d51fd5150fda7e
0xc9987910d4fcb5eec8b21fc2e9ca30395acadb34
0xca0e686d4400570db2b879c471f74427ff994e0e
0xcb122f372cb0a2d1edf8fcadad82c24eea618981
0xd2e37a8fda1523b8accc5191800bf46da0794872
0xd302d197c0fce25cc2d49d76eae391a6c49d7dcb
0xd621fbf9c155a1ba65844654533341af360e3b67
0xd8f05e86fa51619d0867579e586e2a3a0097ef14
0xdc86e2c5745a1248ea77993d55562434a4dea3ee
0xdcd89b59a34dfc4052f12495b6d3452a5ad5d1c7
0xe07c5e3fadfe965a49ea40f44a7665457eee0693
0xe182b236cd93c3cc2be4af5e0cddc2ec8bf9a5a1
0xe2458f8d9ae4a2458b240d05d42993d4510b8030
0xe84ed3ba93c442ee46cba23adbdb828be024684b
0xe8a2bfaadff50c8ca75aac494134da77f9820b24
`;

const addresses = raw
  .trim()
  .split(/\s+/)
  .map((a) => a.toLowerCase());

const walletAddresses = Array.from(new Set(addresses));

scrapeMultipleAddresses(walletAddresses)
  .then(({ results, ipLog, failedAddresses }) => {
    console.log("\n" + "=".repeat(60));
    console.log("RESULTS SUMMARY");
    console.log("=".repeat(60));
    
    const successCount = results.filter(r => r.success).length;
    console.log(`Success rate: ${successCount}/${results.length} (${((successCount/results.length)*100).toFixed(1)}%)\n`);
    
    results.forEach((result, index) => {
      console.log(`\n${index + 1}. Address: ${result.address}`);
      if (result.totalAsset) {
        console.log(`   Total Assets: ${result.totalAsset}`);
        console.log(`   Selector Used: ${result.selectorUsed}`);
      } else {
        console.log(`   Status: Failed to retrieve`);
        if (result.error) {
          console.log(`   Error: ${result.error}`);
        }
        if (result.retries) {
          console.log(`   Retries: ${result.retries}`);
        }
      }
    });

    console.log("\n" + "=".repeat(60));

    // Save comprehensive results
    const output = {
      timestamp: new Date().toISOString(),
      summary: {
        total: results.length,
        successful: successCount,
        failed: results.length - successCount,
        successRate: `${((successCount/results.length)*100).toFixed(1)}%`
      },
      ipRotationLog: ipLog,
      failedAddresses,
      results: results
    };
    
    fs.writeFileSync("debank-results.json", JSON.stringify(output, null, 2));
    console.log("\n✓ Results saved to debank-results.json");
    
    process.exit(0);
  })
  .catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });