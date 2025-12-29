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
  timeout: 8000 // Reduced from 10000
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

function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

function formatTime(date) {
  return date.toLocaleTimeString('en-US', { 
    hour12: false, 
    hour: '2-digit', 
    minute: '2-digit', 
    second: '2-digit' 
  });
}

// Check if Tor proxy is accessible
async function checkTorProxy() {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    socket.setTimeout(2000); // Reduced from 3000

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
  await new Promise((resolve) => setTimeout(resolve, 2500)); // Reduced from 4000
}

// Verify IP change with retries
async function verifyIPChange(previousIP, maxAttempts = 3) { // Reduced from 3
  let attempts = 0;
  
  while (attempts < maxAttempts) {
    try {
      const newIP = await getCurrentTorIP();
      if (!previousIP || newIP !== previousIP) {
        console.log(`  ✓ New IP acquired: ${newIP}`);
        return newIP;
      } else {
        console.log(`  ⚠️ IP unchanged (${newIP}), waiting longer... (${attempts + 1}/${maxAttempts})`);
        await new Promise((resolve) => setTimeout(resolve, 2000)); // Reduced from 3000
        attempts++;
      }
    } catch (err) {
      console.log(`  Failed to check IP: ${err.message}`);
      attempts++;
      await new Promise((resolve) => setTimeout(resolve, 1500)); // Reduced from 2000
    }
  }
  
  throw new Error("Could not acquire new IP after multiple attempts");
}

// Enhanced scraping with better error handling and retries
async function scrapeDebankProfile(address, browser, retryCount = 0, maxRetries = 3) { // Reduced from 3
  const url = `https://debank.com/profile/${address}`;
  let page;
  
  try {
    page = await browser.newPage();

    // Enhanced browser fingerprint randomization
    const userAgent = getRandomUserAgent();
    const language = getRandomLanguage();
    
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

    console.log(`  Using User-Agent: ${userAgent.substring(0, 50)}...`);
    console.log(`  Navigating to ${address}...`);

    // Navigate with timeout
    await page.goto(url, {
      waitUntil: "networkidle0", // Changed from networkidle0 for faster loading
      timeout: 45000, // Reduced from 60000
    });

    // Optimized wait time - significantly reduced
    const pageLoadDelay = getRandomDelay(2000, 3000); // Reduced from 3000-5000
    console.log(`  Waiting ${(pageLoadDelay / 1000).toFixed(2)}s for content to load...`);
    await new Promise((resolve) => setTimeout(resolve, pageLoadDelay));

    // Enhanced selector list with more variations
    const selectors = [
      '.HeaderInfo_totalAssetInner__HyrdC.HeaderInfo_curveEnable__HVRYq',
      '[class*="HeaderInfo_totalAssetInner"]',
    ];

    let totalAsset = null;
    let selectorUsed = null;

    // Try each selector with optimized wait time
    for (const selector of selectors) {
      try {
        await page.waitForSelector(selector, { timeout: 4000 }); // Reduced from 5000
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
  
  // Time tracking
  const startTime = Date.now();
  const startDate = new Date();
  
  // Optimized estimate: ~12-15 seconds per address with faster settings
  const estimatedTimePerAddress = 13000; // Reduced from 20000
  const estimatedTotalTime = addresses.length * estimatedTimePerAddress;
  const estimatedEndTime = new Date(startTime + estimatedTotalTime);

  try {
    console.log("\n" + "=".repeat(60));
    console.log("TIME ESTIMATION");
    console.log("=".repeat(60));
    console.log(`Start Time: ${formatTime(startDate)}`);
    console.log(`Estimated End Time: ${formatTime(estimatedEndTime)}`);
    console.log(`Estimated Duration: ${formatDuration(estimatedTotalTime)}`);
    console.log(`Total Addresses: ${addresses.length}`);
    console.log("=".repeat(60) + "\n");

    console.log("Checking Tor proxy accessibility...");
    await checkTorProxy();

    console.log("\nVerifying Tor network connection...");
    const initialIP = await checkTorConnection();
    ipLog.push({ request: 0, ip: initialIP, address: "Initial" });

    console.log("\nUsing browser restart method for IP rotation\n");
    console.log(`\nScraping ${addresses.length} addresses with IP rotation...\n`);

    for (let i = 0; i < addresses.length; i++) {
      const address = addresses[i];
      const addressStartTime = Date.now();
      
      console.log(`\n[${"=".repeat(60)}]`);
      console.log(`[${i + 1}/${addresses.length}] Processing: ${address}`);
      
      // Calculate progress and updated ETA
      if (i > 0) {
        const elapsedTime = Date.now() - startTime;
        const averageTimePerAddress = elapsedTime / i;
        const remainingAddresses = addresses.length - i;
        const estimatedRemainingTime = remainingAddresses * averageTimePerAddress;
        const updatedEndTime = new Date(Date.now() + estimatedRemainingTime);
        
        console.log(`Progress: ${((i / addresses.length) * 100).toFixed(1)}% | Elapsed: ${formatDuration(elapsedTime)} | ETA: ${formatTime(updatedEndTime)} (${formatDuration(estimatedRemainingTime)} remaining)`);
      }
      
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
        }

        const circuitDelay = getRandomDelay(1000, 1500); // Reduced from 2000-3000
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
      let maxIPRetries = 3; 
      let ipRetryCount = 0;
      
      while (ipRetryCount <= maxIPRetries) {
        result = await scrapeDebankProfile(address, browser, ipRetryCount);
        
        if (result.needsIPChange && ipRetryCount < maxIPRetries) {
          console.log(`\n  🔄 Changing IP for retry...`);
          
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
          
          const circuitDelay = getRandomDelay(1000, 2000); // Reduced from 2000-4000
          console.log(`  Waiting ${(circuitDelay / 1000).toFixed(2)}s for circuit stabilization...`);
          await new Promise((resolve) => setTimeout(resolve, circuitDelay));
          
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
          break;
        }
      }
      
      const addressEndTime = Date.now();
      const addressDuration = addressEndTime - addressStartTime;
      console.log(`  ⏱️ Address completed in ${formatDuration(addressDuration)}`);
      
      results.push(result);
      
      if (!result.success) {
        failedAddresses.push(address);
      }

      // Optimized delay between requests
      if (i < addresses.length - 1) {
        const requestDelay = getRandomDelay(500, 1000); // Reduced from 1000-2000
        console.log(`\n  ⏱️ Waiting ${(requestDelay / 1000).toFixed(2)}s before next request...`);
        await new Promise((resolve) => setTimeout(resolve, requestDelay));
      }
    }

    const endTime = Date.now();
    const endDate = new Date();
    const totalDuration = endTime - startTime;

    // Display time summary
    console.log("\n" + "=".repeat(60));
    console.log("TIME SUMMARY");
    console.log("=".repeat(60));
    console.log(`Start Time: ${formatTime(startDate)}`);
    console.log(`End Time: ${formatTime(endDate)}`);
    console.log(`Total Duration: ${formatDuration(totalDuration)}`);
    console.log(`Average per Address: ${formatDuration(totalDuration / addresses.length)}`);
    console.log(`Estimated Duration: ${formatDuration(estimatedTotalTime)}`);
    console.log(`Difference: ${formatDuration(Math.abs(totalDuration - estimatedTotalTime))} ${totalDuration > estimatedTotalTime ? 'slower' : 'faster'} than estimate`);
    console.log("=".repeat(60));

    // Display IP rotation log
    console.log("\n" + "=".repeat(60));
    console.log("IP ROTATION LOG");
    console.log("=".repeat(60));
    ipLog.forEach((entry) => {
      console.log(`Request ${entry.request}: ${entry.ip} (${entry.address})`);
    });

    // Display failed addresses
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

    return { 
      results, 
      ipLog, 
      failedAddresses,
      timing: {
        startTime: startDate.toISOString(),
        endTime: endDate.toISOString(),
        durationMs: totalDuration,
        durationFormatted: formatDuration(totalDuration),
        averagePerAddressMs: totalDuration / addresses.length,
        averagePerAddressFormatted: formatDuration(totalDuration / addresses.length)
      }
    };

  } catch (error) {
    console.error("Fatal error:", error.message);
    return { 
      results, 
      ipLog, 
      failedAddresses,
      timing: {
        startTime: startDate.toISOString(),
        durationMs: Date.now() - startTime,
        error: error.message
      }
    };
  } finally {
    if (browser) {
      await browser.close();
      console.log("\nBrowser closed");
    }
  }
}

// Example usage
const raw = `
0x080063b4801832aac728ec5c7d67cecd9f3b992f
0x088f276fa36cab062c48283d75ceb24aa8a6f771
0x08cb7d04608cd6c3543edb287108bb4f8426b2a6
0x096529d95d7742a02532ed8c672fdafa87bc4747
0x0cb6271d8c43695841fe0d8c3cbb4ebe088ec2a3
0x0fcc60ba6ce0ea2cd094bf07f0cd7ea14e103772
0x12acf1f251f4d3c4a83d764b10e54c40f3013c38
0x1e1e8a7335e29d93ec4c4e6b2e1fd64e0f307853
0x1f06b613e69c46186b15897f054cc16bc2bb10a0
0x20f5ceea3835fa91c0d16e1eeb6c5359fa22cc2f
0x229c15011fda808a2b98d487ca55291641740062
0x264ef753d3686d2f4a73a2852ced23ca3a6b6f76
0x2a64bfe71241e6bfca8aea600eabc363465ef776
0x2ad3641c227a977cacc5ce25a26b4f6e596e9775
0x2b2e3da881eb5eb7db391c7934cd34941cd5fbee
0x2d7235f2ccfdf29e346c591b9e97c05a493fc773
0x3606e39ed7cda9777b9469c40f5befa71a1eb6f6
0x393200a58da0047e1d4ae9559e3c9aa165ab2782
0x3a9f851cb0df5f88f10b0b461a8e9bbbb11ab575
0x3c5477063da98a605624847ffd9ef4d8267378fd
0x3d734009ff16366a1d3805e762663cb147136d80
0x3f411483f9d772a8be8419792abe0313e8931440
0x3f93bb776eb15c1296112ba80f332910fc41da4d
0x3fb6e49beddaeb14282066083fa43159b9b95f4e
0x42285a766208bb5c8bfd678758f7e475d42c36af
0x43cf3e8d2893bc02ca91a52e967c76ee6739958d
0x468ad891d5c750f2b07a8d60ceb1bd83e1a9f141
0x47e60bdd18e186a68f4fcf6526b539d600626b1a
0x4bd684588dcc799625c0e66d02728ac8b4cf59af
0x4fc824f7047bfde9a0a8df810d196325b02c9248
0x578b6122b8aca611b51fdd04bee8e1319ce1e96e
0x586bbb69942efcbbdc6f711e37a97d2e372a0690
0x59e3ce17e18b5615de9a86d45768d21f23439b7a
0x5c63cb44522c979f16e67ee4728349c149fb1ac6
0x5d73b898a0b1307ad54acf8c72f60edf07eb6f76
0x632cae603b960df08485a69c44b46abc74ec9ece
0x67d06422914a71f3cbf168d80ce5a4b4c930b108
0x6b758523e380cceeeea0c3e54dafbb1053603b7e
0x6bc9527bc2226130e941506d0f3afcabb2d7de14
0x6bfe3a1bd917f8fe50eb624d50a0774af03a8b8e
0x6f5e2c0e56ff2d1187b1628d17b63e2dfa2f59b6
0x701e792bc3dd90d3ed707a3b8f78ac007d9aafb8
0x70e467af0cb9e68afaff0cad9408d51aec9b5c34
0x72450f10dbc7277b4b3441dc54e75b9bc462e8d6
0x786a05b29661a3cfdd45bc0a404a96363795f3fa
0x78a64770ca018469678fccef26eedc15063c1d28
0x7941dba51da5fb5ecc96b5b3cf73c27d8230cba2
0x79a3d44fac2fb34298c9937c46396ccf33e9559f
0x79a8667434df8778918c07d7ec8641d76190e2ae
0x7a33cad63bd0b75a4c453d2e4fcc2845df38712f
0x7a6d0f41641906665890ecd0e27a317e99800993
0x7ac1303054eb93927aadf6d30379ea2d13e539d4
0x7b5e27136381b7050fa14ca63d1748827ab63dd8
0x7bb00bfebc4fafefc4a5eae0311dd45204a7cad7
0x7cf27c136041d03c8d5524888821d0eaba6a05f1
0x7d06ca5a872751a809efde78a06c9660ff862127
0x7d795a75551a3b5c54c77238c14854ca7a1ba3f6
0x83e0f1c06becedb479d7e635f787155e6f1f2e2d
0x8438a0a00bfe46081cf3635730b62dc99d1df4bc
0x8584c3e2d3d8f6d7755015db5ff154a3017c4786
0x8604ea5e711645f207cd53bd5df400000008362c
0x890e30594bf038628ddb8308fd6306db09d08950
0x89a6fea7c123c3ea32f1d525f6c58f0d93593a39
0x8b23de46c9a3e0d6448bcbb4d20403e34d30aadf
0x8d92d939c0c459a32a6992452dc2e3511e9f319e
0x94a1b8aadaca98f4ff903d6a524b7bbc058445fc
0x9712d71b112bfa9b1247a51ccc545e4c2aa43b30
0x987c8f0e5c906784060a087a2694b3c5f1c97817
0x9cf7db3586e0089d932d2b8bc96e0da753c5c737
0x9d493e2eb19964e2e60750062520d59dc4169c62
0x9eadb75d844112cbf02ef82c0efcdcf7cfcae824
0xa22c38ba66affb6a5117e98a0df2bb9b653e75b7
0xa32c266df58fb884bc1c00f528dcad6674efd304
0xa3b30de0d20af1296c816fcbd67d4df86d4ac84b
0xa5c14f8c953467391b5807c6595461f0405ad4e2
0xa967c7f226a8d4e1149e3b795680bb8a3616c5e5
0xab8b421fc61f9d58e956459100cbce879d3308f1
0xafa5b484ade9f3b062d286c3b150a1187f57b643
0xaff3be8f187a9315a0f7355fb11ed957e75efc5a
0xb29489b08aa6f28a70358f22a9c40fadebf41e60
0xb7134086a8a88867268214b8a2ce21f92a5b049b
0xb863ef9b3cb6619ba98080a48dba05612af52585
0xb98e61ac46b3f795fee203dabcbeafc3225fd598
0xb9d6851835e35d3da82feecc51370b1d632f9e07
0xbbe50b3b20403646528924da884cbe0e6eab797b
0xbd108589bf327025989a351c451568764767c6eb
0xbd3a292dfdb9851e11f328c35085924e19aa5b48
0xbf0c919d6517ea7d24ab1445f4ecb414941df688
0xc1e4b23d5a5f45ae20486e2f8e6540b609fda61e
0xc257c17648f5b6b2f59c51e21f310b44e2c1f723
0xc8b0ab5ae9fd0082dc90a308d65c84025896e389
0xc95c4c089ea9ee3555338dee719edc8a5a2c56fe
0xcb040f7d0a3809d0f748056e3687aab0c558588f
0xcd210e8f21b6a1d2c9a832681220ad6c6792a360
0xcd3931c814f92494c1de35e89f9e166d805ebcfb
0xcf655bae9b51aeeea7d04c8b2611d457fad588a7
0xcfdf62de9d81024def4c4efc421d192860326fae
0xd0ce6ab697befca4e0cc265a93b4e8b7f7c96ee2
0xd1ea6253c1b722dbae59c1a0f32a66f1ccf98d3c
0xd2688fcc1c2ebcb40589ef5855d554adac2ac1a2
0xd2740fa3cae559133612a680c8c9b074e3f71eff
0xd46e2092b2ff22d0e0278187d4ceb75634a62737
0xd5a5edd0deccb7819d2e57820c669aa9bf9f5346
0xd6b03cd1bf554e34a210f31942e2e93806555de9
0xd89a3da01690380ab61ffffcbccccc95cf3ee1ad
0xd9671512bb5f3d413bfcfa44338138f2b1554fe5
0xda11abd3f013e3600ad62b5a66ddbbc20a3d2084
0xe32cf6a5d391e994889631d7c20c037658908cb2
0xe70831d62a92cb702fc56431b037b5f8eeda6eb5
0xe96b6b8633d021771454e1acf0a32d3b1d26bfa9
0xe9e768fdb310a6bed7bf654db1fd3ea79b1bc603
0xeccdcfdb9c3f48d64aa9aa812208bc8a0009eaf8
0xee0f84d5721c467bd7765f335539ea9588298b4b
0xefb6d8397d65c1713c534ef803f1de089cba2fb7
0xf1ac3af2097b6f5d6917c645d0c5324c63b6f64d
0xf50cbcc17b3b42ee3d1553a0897df387e8c172ae
0xf6335e63ab0ea8b6b1c647894c1a22a87ba7b331
0xf6b638c65da1095eb95570b5df77833855a48e74
0xf72ee742dfe3831ef40924a55d788a0e0ad516d2
0xfb2175499ce63227051fd85b8992ba4e492e6726
0xfb839e26be3902934254ed5c529afa69db883977
0xfc23b245ea7244029a55d661fca0e244f133e971
0xfd5dd29dc995208f641dc6cf2450c2f2e250935e
0xfe7be7edfacd8b5b471d2f769f3dc72ccc512794
0xfe9c29fd14f5c5eda7071888a418cf3e423502c4
0xc6ce0762012e8ecdbbfb271c89f75d8a74bdf9bf
0xeac271bdb7d095e9766af7a26ca469d72aaf8a31
0x8659c407ac4480e4a6954a603278a300d6c33918
0xa2f05a1b27665e175339313043318da85dcdcba7
0x8f9f34ee0ea50a91767445b87577d6f5b2870cd8
0x89b295444babb44fdefed628159b619411ec60f2
0x3b60495cf81143cbb7e1016a5dba3be286d9a36b
0x568577A030449ab7f46b209229383e2D1b89412E
0xf215e69dbcdb414310c901f4c42e692dccaa8fb2
0xd4173b1c3cf5dedb60b6ade416244265c2353455
0x6d3142cefd0d3b69152e47addb224e64e5c05a52
0xacdca174add318a099f3c6f0aa5c74b9e8502192
0xe3a210673795b876faaa9773e4cf3a4cedd96868
0x276845f52a087002a5e5f8b251e77954d5db7e01
0x08d8c778507fa425d4f8a1d2bf7aa44ad05c7d6f
0x84fdcb617e8d039fcdf5fb87be6ccf75a2e180f7
0x22caee28c33f3956bd6eea1561c5c844220f8777
0xa46c6d2cdadc99390dae051e33887fc2d629334a
0xaa2e612e85232c85b242e9926cec445cb730c8be
0x4bce902c97c3dd986eaa8c25b0aa650d2911ced7
0x5c6ef54ccbb2b1024391cc453122c909ce6ba8b5
0x06a5a9b12bf919725e52a64116ec6ff7ae96d491
0x188a937125079db08478e8c0f9c31c0e60893563
0x4832db89f7ecab3e2835e4923f38fdf976311659`;

const addresses = raw
  .trim()
  .split(/\s+/)
  .map((a) => a.toLowerCase());

const walletAddresses = Array.from(new Set(addresses));

scrapeMultipleAddresses(walletAddresses)
  .then(({ results, ipLog, failedAddresses, timing }) => {
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
      timing,
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