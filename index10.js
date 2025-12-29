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
    socket.setTimeout(3000);

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
  await new Promise((resolve) => setTimeout(resolve, 4000));
}

// Verify IP change with retries
async function verifyIPChange(previousIP, maxAttempts = 3) {
  let attempts = 0;
  
  while (attempts < maxAttempts) {
    try {
      const newIP = await getCurrentTorIP();
      if (!previousIP || newIP !== previousIP) {
        console.log(`  ✓ New IP acquired: ${newIP}`);
        return newIP;
      } else {
        console.log(`  ⚠️ IP unchanged (${newIP}), waiting longer... (${attempts + 1}/${maxAttempts})`);
        await new Promise((resolve) => setTimeout(resolve, 3000));
        attempts++;
      }
    } catch (err) {
      console.log(`  Failed to check IP: ${err.message}`);
      attempts++;
      await new Promise((resolve) => setTimeout(resolve, 2000));
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
      waitUntil: "networkidle0",
      timeout: 60000,
    });

    // Optimized wait time
    const pageLoadDelay = getRandomDelay(3000, 5000);
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
        await page.waitForSelector(selector, { timeout: 5000 });
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
  
  // Estimate time per address (including all delays and retries)
  // Average: ~15-25 seconds per address with IP rotation
  const estimatedTimePerAddress = 20000; // 20 seconds average
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

        const circuitDelay = getRandomDelay(2000, 3000);
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
          
          const circuitDelay = getRandomDelay(2000, 4000);
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

      // Delay between requests
      if (i < addresses.length - 1) {
        const requestDelay = getRandomDelay(1000, 2000);
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
0x654b22705f2a06cd6d9120d2ac0f7dd659ebfc6e
0x6780a7be5ed085de037ccf1a3214d2a8d463879c
0x6ca07af3682375fae1d3ad5b66e684c4d6aef783
0x707b5e0447cd57c69801b0c274c548800024e7f4
0x71b585d876e426518a115c7a3185323474ff21e6
0x73b1e850f1c360730ec67aeb3fa144a88327c6e7
0x74ba16a57f81dffb573f0427030f1502833bb040
0x7f0298c8ffc109c4746fee3bf8d90749e95795ea`;

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