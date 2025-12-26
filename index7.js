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
    console.log(`   Using User-Agent: ${userAgent.substring(0, 60)}...`);

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
          // Method 1: Close and reopen browser (slower but always works)
          console.log("\n🔄 Restarting browser for new Tor circuit...");
          if (browser) {
            await browser.close();
          }
          await new Promise((resolve) => setTimeout(resolve, 2000));
          
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
          
          console.log("   Browser restarted, waiting for new circuit...");
          await new Promise((resolve) => setTimeout(resolve, 5000));
          
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
// const walletAddresses = [
//   "0x6c5b39764ff267a8628b9f2d6a5b5861596a4ad4",
//   "0xe84ed3ba93c442ee46cba23adbdb828be024684b",
//   "0xe8a2bfaadff50c8ca75aac494134da77f9820b24"
// ];
const raw = `
0x61cd97156738be47aefab2df60657302a98008ae
0x6214b3afd4aa5cdd7e200fad32cd5e28aa716599
0x639b1a123155e0d0b5fbd04c4de8a3a36be1b05d
0x6433cc935b75de66befa4f751274d6db97f02512
0x647c72e0eacd2b353354d823e15b6bd6f3e84af8
0x654b22705f2a06cd6d9120d2ac0f7dd659ebfc6e
0x65a41f3962fa7af084a143430abdfb68bae1bdda
0x66cead6c11038464f3448bdf4e1855a4eed282ed
0x6780a7be5ed085de037ccf1a3214d2a8d463879c
0x68cc4ff62a37eee0be1fa3ce49c9cf53244f70a9
0x68d6115978e2c87630cbab9fbf8cbc54bed3baf0
0x6935a6c1b07105c59dc98fdf0a98480178c8da65
0x6bd363641d0f0b8402ad1efeffb142ed8c599c28
0x6c01adb983d242ab3f220cb0168e0e5bc624d764
0x6c213940348c72929c951fa22b1588b2a6352e64
0x6c5b39764ff267a8628b9f2d6a5b5861596a4ad4
0x6ca07af3682375fae1d3ad5b66e684c4d6aef783
0x6d2fbd32f6e9323fdc00f6e79cf6a75952d8f999
0x6d7c3fd98d14d305dd0dc6c5d8480b4f887ecca3
0x6e4936b45ef4ea6a9e4c97b79e1fa6988aae1867
0x6e6a979d74b0bf5f7b9364638fb957272644f704
0x70276ba10414fe7e87622377618130816aafe4b8
0x707b5e0447cd57c69801b0c274c548800024e7f4
0x719243726fbec76c148cfe987108eb9a0732bced
0x71b585d876e426518a115c7a3185323474ff21e6
0x73b1e850f1c360730ec67aeb3fa144a88327c6e7
0x73f3dc071c4b8c410dacdd2700d9bab002d6d442
0x740ab6be4b58500855541ace93386e7265953598
0x74ba16a57f81dffb573f0427030f1502833bb040
0x763cf2d170579c0a3ef1fb513064650f5502b588
0x7776bf9e5de1b648e642f3ea854a8c464ede4884
0x793930c5a5191b617da64b003e5d0656e469027e
0x7a03dc96c3783eecdc2d53d83b02e9c6dc9e85f5
0x7bd61c4797b5e20519b65bf08155adf9d659b012
0x7c71cf8154b7d9aca60d499d7acd8f79cbe6c610
0x7cb428a35cb7b98a5789133972c5e794afc04e4b
0x7f0298c8ffc109c4746fee3bf8d90749e95795ea
0x7f1abe8c1de9dc475fc330688d739b706ac4aeb6
0x8007a6077f9356124f302fff76c698ad89493c24
0x814e961d8f47583e89343cd45e9b67d60f5a71ab
0x81aabb9abc31e6c0ec5fd30ee790a9f0e3089fe6
0x81e9137e1d3c8ec6dc5d3af6b61dbd1ba11beeb6
0x841becc07885fde1530dda577eeb129837eaa333
0x842771d72c7a6170f5f152dd1faf5cf02334c562
0x85957c860dc8cacded18fb9390424974244216e2
0x85d08dfe1d5ff1766a79e99a87c40a2b691bc64e
0x869ef0c78bf24160fe08db6a52b259475e69bf0e
0x880cca12f0c5bdc5abcfce497e20950f9ea99cc5
0x89801efb254b46b3163591f5e0eb66d25806531b
0x8a3630c9a91f4a1db8b36ad38f539294eaa434c9
0x8a387ac1294c3b07aadd9424bab76d0f83fefe70
0x8cc0ab3c993ab8c4b87ce2570457af00788ff6ac
0x8cd82c3f991959ad9b16a57ecfc211bbe8c5e58f
0x8d7ce1107aebee1e3a9eb4da703da1a2b36b33ae
0x8ebd64ead44e38fabf0fd6fae7806f12edc7df79
0x8f0d30188584b606d96fb482eef0b61b5713c3ae
0x8f7ab4721c4954c612af6e6d9200511c3ae115d1
0x90bffb6a8e943b189fa85e2262ff4d5663d1df6d
0x90ca0eacf720c8c86ef50109cc19dccabd6e0427
0x90cafee4f2a6961f3b0e79201edea94e3911822d
0x911d860f2bd109a35d0d8e06c3a5b33f94b88cdf
0x9129f3928dd3e2be2a2793f7a38a105d26297d50
0x91c3b834573ef1301ceb0822bcb95e0f7ccd42ec
0x91e031b42a46a67fed575a60d62475e6ef1a801b
0x92790b6d809c6774a8ec043f2837a5df026d1fd2
0x93478ea41b22c23b281cf19ed32dc3844fdbbae1
0x93b159af9e374e69f7e5929ef1092d54d7e81cca
0x93c54adeea70b2a3211c3eee4eb1484d4ca3af84
0x95170fb8d44549a95ecec51cac179ad8096aaf35
0x961b451319f1bf72b97e80df382a15ee8381e6c5
0x964d7d2b6696e65b84d68b1f45ecde442f060999
0x9773f53a670ed72fa27b4210fcee6ad20d16cc7d
0x99c2a232abebccb6dac6411d94b2f08369e00355
0x99d7b353d74417c7a04d5f061cca3e8fe6b45bb7
0x9a88df22e45b70dd25617bbbeec7737a3da6bd09
0x9adc64880a45292fef90b3ca0b86e6678c1fc6cf
0x9afdd03a1f3e928a6fdbf368d8f1c8c5029b4a76
0x9ba4242429a79e98219cca4445a2d90111d91545
0x9c7c53e47d77395750e8833f1efa80653ba02ac7
0x9c9bc80806a8e43b0b6b1038bfcd4be74e23106a
0x9ca2af2b00c688fb669ea74bb03a5992363d1972
0x9e172941dc11b268afe585c95384cd912377090c
0x9e798b2670f106b4c3efe383d11ec5963afc07c8
0x9ec8f246c6acf5f6446ed2f7ea5b92659c27178b
0x9f2cbab6afb0aa5ef51f8c226ea61be78422c7bf
0xa0343fbd40b0c21a3c57e4f90b7118d0590edb61
0xa32ea049f84cc3a903a6454b1d568366d93a5c15
0xa5b053fb2e1a0d391b24408a4500eac3051b8b95
0xa5f10883517d7e79ce997cd8b6daf1ffecb05bd9
0xa69c0865439842432a8582dac003c77aa07143c1
0xa6d878ee5903b73782f5094f2bc16d8a0ae022a6
0xa9af9b0bab1bd63ef244280195bfeed304409c53
0xa9ea54541786f796439e98c77c0bf90789f85242
0xabedbe8c3ece31e27831cd945a824fd6b91fc2e5
0xac0c60ab2151676ab1c8d6dab0629f6fd3f095e3
0xad4d0154092423bfafa8dfc548adb7b572fd022f
0xadc1f292a3b3cd974c4501fba55f499e3ab182a6
0xaf0a23faf00d69cb8519e7cc37c9ef3926136ee5
0xaf66adad5a1f772e53104b9a963d681e42c1b786
0xafef76d5de3cb0ab0c5f6a71f6f3a22cbce4407e
0xb0ccd4caf024644e38024116c0414e775bac26ea
0xb12337f1ff6a397b55963ca3ec4c9760a40179c0
0xb16591b0d5494b1b784748c3f5cb7bfe2984629a
0xb333cf57b6ded8866eed5a9f232cb08eb6f11bd0
0xb34ad5d66812b58adb15072783f93b16b4a9a6e9
0xb47c163ef1ad81c6f3541d4f05d8872994ab5e16
0xb84525eda6471e4c0491da0b931dab675ea1d3b0
0xb8a2068435741b6997d22c1b8b573150aa26cf78
0xb909610f6d4001c44d000881961d6183a76b01c6
0xb96cf09bd1a05f232a8617f9bb7882696604501b
0xbb270431b17c70c5fc88de2e91cc30245a2e08fc
0xbbcf8c4956f3c0bcec4d220174f1f688905ef918
0xbd075c573eb13796ff882e61454e3b13ab420f42
0xbd4deddc396ba3b45bb1a82e9af43dfcc7446e98
0xbd78b972560efe06bc46a5d45be93fe523025463
0xbd9ba9d8d13c711eb5cde9b22723e7b1939e9c78
0xbe1d9a8e5b0ec12d67352e189bf8df0fcb28ed79
0xbe5b2121aa60271eb9868832bec3ead0ebe03020
0xbefe58f4f74c3b5bd6c952ed551c9810dce3c9ac
0xc03f81a789036646ef9f5554962b868c5e179a5b
0xc08cd5b8d84fdaeb7679f9e1fcd3a7c9162fe0c4
0xc19924bf2531a4be5eaa3f2aa90a1c543ce93f99
0xc298b09f4198e26bbc1c5b100cc94e8cc176505f
0xc38a70b5810a25d8c7673657ffe4ffaec19304f1
0xc3dac2f35836d5ba9fff6a8fbf7a56bafb6b7d63
0xc3df74bc1cc2fd02480d71025254d6c9c9decfe7
0xc55e98067a6e50f9479e3b78914c74eb6bece32d
0xc71b713d9e49792d0fbe3b78c5ebe0e2a1d3ea65
0xc78ced0f4d6ce02e43ed68d248d51fd5150fda7e
0xc9874378c214e1ef491cd84bafa9b16bbd2e4458
0xc9987910d4fcb5eec8b21fc2e9ca30395acadb34
0xca0e686d4400570db2b879c471f74427ff994e0e
0xcac426b1c0544615e0b1bb67ba64d55444f39841
0xcad56f6aaaab172e300b1f54a66760a09280ab5a
0xcb122f372cb0a2d1edf8fcadad82c24eea618981
0xcb67822a5e1393a85978d755cc44abc37b77b118
0xcb99d22f6ddef8b67cbec64e4fd1a48c97a2dba3
0xcba02711c56cf2c27cbd26cba22b663c6c4b0831
0xcd2b78e5b042f4be2f6a1e953ff99e2af8f4a892
0xcdd61d4f5e5315ba1b3f98a63fc12ff5866b377b
0xcee7050a81ca43704c2e229662f21bb53e3d3a5f
0xcf9454a54269e93e3caaf6f6156ca2fc3995d673
0xd08383c7061fb1ae13535c81692c82523252fa91
0xd0b1bea5f58d4aa9762a764f93b075214fc55d6d
0xd284314f5f0cedb78fbfa67c8ab803d0706b9938
0xd2e37a8fda1523b8accc5191800bf46da0794872
0xd2ec61a81daa8b43c45098f5cc4fb23e4d048ed2
0xd302d197c0fce25cc2d49d76eae391a6c49d7dcb
0xd4ebb0c37db75d0cdb9b6c82398bbdc96ebab2c9
0xd4fd79e0601a205a9cee038fc78606d0f549fcfb
0xd57fae099e58a4499c2245a4bebfd9cd280aa398
0xd621fbf9c155a1ba65844654533341af360e3b67
0xd6276d60b6f11e8d6aa431200f28ff244092a5f0
0xd76394e22f6faf9e1a60cedb03a0ac2a3b40d99b
0xd8451fb438a7b1bab5bfe1b4b5ce83a1485898f8
0xd8f05e86fa51619d0867579e586e2a3a0097ef14
0xd9e5ee8e89137b7ea52cbcff3b24e3183128864d
0xda6eaba07d9cc156290a764b52c0252ed4f442a7
0xdc86e2c5745a1248ea77993d55562434a4dea3ee
0xdcd89b59a34dfc4052f12495b6d3452a5ad5d1c7
0xdd1ee692c54caa8dae588f768f3b80286100888d
0xdd5825cbe0b69361a010213efffee725035c9bff
0xddd4feb10476386296efd3db68c2ccc37a4fdb4f
0xde83f7d133cee889477ea0b0ba92bc04d7bf4737
0xe0124cdf5369b49a53137bdde7d0ccd2c5a3c0e9
0xe07c5e3fadfe965a49ea40f44a7665457eee0693
0xe182b236cd93c3cc2be4af5e0cddc2ec8bf9a5a1
0xe2458f8d9ae4a2458b240d05d42993d4510b8030
0xe2df98dea886cc3dfeee9000ff677e7786efda22
0xe355bad4780923e6ecce16dee7ee15542e2fa9f5
0xe37982f69b9d3acfdfa190fc1a240c099b717af6
0xe53581a9c08c2efe926259cade869798aafc6ce8
0xe84ed3ba93c442ee46cba23adbdb828be024684b
0xe8a2bfaadff50c8ca75aac494134da77f9820b24
0xe9066acbd36bd06f29cce35e225bb441c48b8abc
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