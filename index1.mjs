import axios  from "axios";

const url =
  "https://api.debank.com/portfolio/list" +
  "?user_addr=0xe8a2bfaadff50c8ca75aac494134da77f9820b24" +
  "&project_id=etherdelta";

const response = await axios.get(url, {
  headers: {
    accept: "*/*",
    "accept-language": "en-US,en;q=0.9,vi;q=0.8",
    account: JSON.stringify({
      random_at: 1760340876,
      random_id: "80205a2b2071417f801842e50e366d3e",
      user_addr: null,
      connected_addr: "0x88d42618ae1dd5d9178ddb6e1ff832a040ec8ffd",
    }),
    "cache-control": "no-cache",
    pragma: "no-cache",
    priority: "u=1, i",
    "sec-ch-ua":
      '"Chromium";v="142", "Google Chrome";v="142", "Not_A Brand";v="99"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"macOS"',
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-site",
    source: "web",

    // ⚠️ DeBank internal auth headers
    "x-api-key": "c3b4bb17-0ef9-4ae6-a03b-062e2bff2a42",
    "x-api-nonce": "n_RXmUFIVfqm7AdN0heH4QgokLw2dQC8vpM4cGrDfA",
    "x-api-sign":
      "903d8ce360c7604eea6cd4ee30c594b6eaf9c5c96c65a6f60f5c11a4e1697742",
    "x-api-time": "1765178340",
    "x-api-ts": "1766564833",
    "x-api-ver": "v2",

    referer: "https://debank.com/",
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
  },
  timeout: 15000,
});

console.log(response.data);
