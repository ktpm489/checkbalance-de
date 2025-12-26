// OK
const puppeteer = require("puppeteer");
const tr = require("tor-request");
const net = require("net");

// Tor Configuration
const TOR_CONFIG = {
  host: "localhost",
  port: 9050, // Try 9150 if using Tor Browser
  controlPort: 9051, // Control port for identity renewal
  controlPassword: "", // Leave empty if using cookie authentication
  timeout: 10000
};

// Configure Tor with control port
tr.setTorAddress(TOR_CONFIG.host, TOR_CONFIG.port);

// Configure control port for identity renewal
if (TOR_CONFIG.controlPassword) {
  tr.TorControlPort.password = TOR_CONFIG.controlPassword;
  tr.TorControlPort.host = TOR_CONFIG.host;
  tr.TorControlPort.port = TOR_CONFIG.controlPort;
}

// Extensive array of user agents
const USER_AGENTS = [
  // Chrome on macOS
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
  // Safari on macOS
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15", // Older macOS, recent Safari
"Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15", // macOS Sonoma (14.0), Safari 17

  // Firefox on macOS
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7; rv:109.0) Gecko/20100101 Firefox/115.0", // Older macOS, Firefox 115
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0; rv:109.0) Gecko/20100101 Firefox/120.0", // macOS Sonoma, Firefox 120
  // Egle on macOS
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Edge/122.0.0.0", // macOS 10.15.7, Edge 122
"Mozilla/5.0 (Macintosh; Intel Mac OS X 14_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36 Edg/121.0.0.0", // macOS 14.1, Edge 121


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

// Request new Tor identity and verify IP change
async function renewTorIdentity(maxRetries = 5) {
  console.log("\n🔄 Requesting new Tor identity...");
  
  // Get current IP before renewal
  let oldIP;
  try {
    oldIP = await getCurrentTorIP();
    console.log(`   Old IP: ${oldIP}`);
  } catch (err) {
    console.log("   Could not get old IP, proceeding with renewal...");
  }

  return new Promise((resolve, reject) => {
    tr.renewTorSession(async (err) => {
      if (err) {
        console.log("⚠️  Warning: Could not renew Tor session:", err.message);
        resolve(false);
        return;
      }

      console.log("   Waiting for new circuit to establish...");
      
      // Wait longer to ensure circuit is established
      await new Promise(r => setTimeout(r, 5000));

      // Verify IP has changed
      let newIP;
      let attempts = 0;
      
      while (attempts < maxRetries) {
        try {
          newIP = await getCurrentTorIP();
          
          if (!oldIP || newIP !== oldIP) {
            console.log(`✓  New IP: ${newIP}`);
            resolve(true);
            return;
          } else {
            console.log(`   IP unchanged, retrying... (${attempts + 1}/${maxRetries})`);
            await new Promise(r => setTimeout(r, 3000));
            attempts++;
          }
        } catch (err) {
          console.log(`   Failed to verify IP change: ${err.message}`);
          attempts++;
          await new Promise(r => setTimeout(r, 3000));
        }
      }

      console.log("⚠️  Could not verify IP change after multiple attempts");
      resolve(false);
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
    console.log(`   Using User-Agent: ${userAgent}...`);

    console.log(`   Navigating to ${address}...`);
    await page.goto(url, {
      waitUntil: "networkidle2",
      timeout: 60000,
    });

    // Random wait time between 10-30 seconds after page load
    const pageLoadDelay = getRandomDelay(10000, 30000);
    console.log(`   Waiting ${(pageLoadDelay / 1000).toFixed(2)}s for content to load...`);
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
          console.log(`✓  Found total assets: ${totalAsset}`);
          break;
        }
      } catch (err) {
        continue;
      }
    }

    if (!totalAsset) {
      console.log(`✗  Could not find total asset value for ${address}`);
    }

    await page.close();
    return { address, totalAsset };
  } catch (error) {
    console.error(`   Error scraping ${address}:`, error.message);
    return { address, totalAsset: null, error: error.message };
  }
}

async function scrapeMultipleAddresses(addresses) {
  let browser;
  const results = [];
  const ipLog = [];
  const USE_BROWSER_RESTART = true; // Set to true if ControlPort doesn't work

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
      console.error("\n3. Enable ControlPort in torrc:");
      console.error("   Add these lines to /usr/local/etc/tor/torrc (or /etc/tor/torrc):");
      console.error("   ControlPort 9051");
      console.error("   CookieAuthentication 1");
      console.error("   Then restart tor: brew services restart tor");
      console.error("\n4. Verify Tor is running: netstat -an | grep 9050");
      throw new Error("Tor proxy not accessible");
    }

    // Check Tor connection
    console.log("\nVerifying Tor network connection...");
    const initialIP = await checkTorConnection();
    ipLog.push({ request: 0, ip: initialIP, address: "Initial" });

    if (USE_BROWSER_RESTART) {
      console.log("\nUsing browser restart method for IP rotation");
      console.log("(ControlPort not configured - this is slower but works)\n");
    } else {
      console.log("\nUsing ControlPort method for IP rotation\n");
    }

    console.log(`\nScraping ${addresses.length} addresses with IP rotation...\n`);

    for (let i = 0; i < addresses.length; i++) {
      const address = addresses[i];
      console.log(`\n[${"=".repeat(60)}]`);
      console.log(`[${i + 1}/${addresses.length}] Processing: ${address}`);
      console.log(`[${"=".repeat(60)}]`);

      // Renew Tor identity before EACH request (except the first one)
      if (i > 0) {
        if (USE_BROWSER_RESTART) {
          // Method 1: Force new circuit by restarting Tor service
          console.log("\n🔄 Forcing new Tor circuit...");
          
          // Close browser first
          if (browser) {
            await browser.close();
            browser = null;
          }
          
          console.log("   Sending SIGHUP to Tor to clear circuits...");
          try {
            // Send SIGHUP to Tor process to clear circuits
            const { execSync } = require('child_process');
            execSync('killall -HUP tor 2>/dev/null || pkill -HUP tor 2>/dev/null || true', { stdio: 'ignore' });
            console.log("   ✓ Tor circuits cleared");
          } catch (err) {
            console.log("   Note: Could not send HUP signal (this is okay)");
          }
          
          // Wait for Tor to establish new circuits
          console.log("   Waiting for new Tor circuits...");
          await new Promise((resolve) => setTimeout(resolve, 8000));
          
          // Verify IP changed before proceeding
          let newIP;
          let attempts = 0;
          const maxAttempts = 5;
          const previousIP = ipLog.length > 0 ? ipLog[ipLog.length - 1].ip : null;
          
          while (attempts < maxAttempts) {
            try {
              newIP = await getCurrentTorIP();
              
              if (!previousIP || newIP !== previousIP) {
                console.log(`   ✓ New IP acquired: ${newIP}`);
                break;
              } else {
                console.log(`   ⚠️  IP unchanged (${newIP}), waiting longer... (${attempts + 1}/${maxAttempts})`);
                await new Promise((resolve) => setTimeout(resolve, 5000));
                attempts++;
              }
            } catch (err) {
              console.log(`   Failed to check IP: ${err.message}`);
              attempts++;
              await new Promise((resolve) => setTimeout(resolve, 3000));
            }
          }
          
          // Relaunch browser
          console.log("   Relaunching browser...");
          browser = await puppeteer.launch({
            headless: "new",
            args: [
              "--no-sandbox",
              "--disable-setuid-sandbox",
              "--disable-dev-shm-usage",
              "--disable-accelerated-2d-canvas",
              "--disable-gpu",
              "--disable-web-security", // Helps with circuit isolation
              "--disable-features=IsolateOrigins,site-per-process",
              `--proxy-server=socks5://${TOR_CONFIG.host}:${TOR_CONFIG.port}`,
            ],
          });
          
        } else {
          // Method 2: Use ControlPort (faster but requires configuration)
          const renewed = await renewTorIdentity();
          
          const circuitDelay = getRandomDelay(3000, 6000);
          console.log(`   Waiting ${(circuitDelay / 1000).toFixed(2)}s for circuit stabilization...`);
          await new Promise((resolve) => setTimeout(resolve, circuitDelay));
        }
        
        // Log the new IP
        try {
          const currentIP = await getCurrentTorIP();
          ipLog.push({ request: i + 1, ip: currentIP, address });
          console.log(`✓  Current IP: ${currentIP}`);
        } catch (err) {
          console.log("   Could not verify current IP");
        }
      }

      // Launch browser for first request if using browser restart method
      if (i === 0 || !USE_BROWSER_RESTART) {
        if (!browser) {
          console.log("\nLaunching browser with Tor proxy...");
          browser = await puppeteer.launch({
            headless: "new",
            args: [
              "--no-sandbox",
              "--disable-setuid-sandbox",
              "--disable-dev-shm-usage",
              "--disable-accelerated-2d-canvas",
              "--disable-gpu",
              `--proxy-server=socks5://${TOR_CONFIG.host}:${TOR_CONFIG.port}`,
            ],
          });
        }
      }

      const result = await scrapeDebankProfile(address, browser);
      results.push(result);

      // Random delay between requests
      if (i < addresses.length - 1) {
        const requestDelay = getRandomDelay(5000, 15000);
        console.log(`\n⏱️  Waiting ${(requestDelay / 1000).toFixed(2)}s before next request...`);
        await new Promise((resolve) => setTimeout(resolve, requestDelay));
      }
    }

    // Display IP rotation log
    console.log("\n" + "=".repeat(60));
    console.log("IP ROTATION LOG");
    console.log("=".repeat(60));
    ipLog.forEach((entry) => {
      console.log(`Request ${entry.request}: ${entry.ip} (${entry.address})`);
    });

    return { results, ipLog };
  } catch (error) {
    console.error("Fatal error:", error.message);
    return { results, ipLog };
  } finally {
    if (browser) {
      await browser.close();
      console.log("\nBrowser closed");
    }
  }
}

// Example usage with multiple addresses
const raw = `
0x61cd97156738be47aefab2df60657302a98008ae
0x6433cc935b75de66befa4f751274d6db97f02512
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
const walletAddresses = Array.from(new Set(addresses)); // Remove duplicates

scrapeMultipleAddresses(walletAddresses)
  .then(({ results, ipLog }) => {
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

    // Save to JSON file with IP log
    const fs = require("fs");
    const output = {
      timestamp: new Date().toISOString(),
      ipRotationLog: ipLog,
      results: results
    };
    fs.writeFileSync("debank-results.json", JSON.stringify(output, null, 2));
    console.log("\nResults saved to debank-results.json");

    process.exit(0);
  })
  .catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });