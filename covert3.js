const fs = require("fs");
const path = require("path");

// ===== CONFIG =====
const INPUT_FILE = "debank-results.json";
const OUTPUT_FILE = "debank-results.csv";
const OUTPUT_FILE_FILTERED = "debank-results-filtered.csv";
const OUTPUT_FILE_EMPTY = "debank-results-empty.csv";

// ===== PATHS =====
const inputPath = path.resolve(__dirname, INPUT_FILE);
const outputPath = path.resolve(__dirname, OUTPUT_FILE);
const outputPathFiltered = path.resolve(__dirname, OUTPUT_FILE_FILTERED);
const outputPathEmpty = path.resolve(__dirname, OUTPUT_FILE_EMPTY);

// ===== READ JSON =====
if (!fs.existsSync(inputPath)) {
  console.error("❌ Input file not found:", inputPath);
  process.exit(1);
}

const raw = fs.readFileSync(inputPath, "utf8");
const data = JSON.parse(raw);

// ===== CSV HEADER =====
let csv = "address,amount_usd,success,selector_used,user_agent\n";
let csvFiltered = "address,amount_usd,success,selector_used,user_agent\n";
let csvEmpty = "address,amount_usd,success,selector_used,user_agent\n";

// ===== PARSE & CONVERT =====
data.results.forEach(({ address, totalAsset, success, selectorUsed, userAgent }) => {
  // Extract numeric value from totalAsset string like "$61,988"
  let amount = "";
  
  if (totalAsset) {
    // Remove $ and commas, keep just the number
    const match = totalAsset.match(/\$([\d,]+)/);
    amount = match ? match[1].replace(/,/g, "") : "0";
  }

  // Escape fields that might contain commas or quotes
  const escapeCsv = (str) => {
    if (!str) return "";
    const escaped = str.replace(/"/g, '""');
    return escaped.includes(',') ? `"${escaped}"` : escaped;
  };

  const successFlag = success ? "true" : "false";
  const selector = escapeCsv(selectorUsed);
  const ua = escapeCsv(userAgent);

  const row = `${address},${amount},${successFlag},${selector},${ua}\n`;
  csv += row;
  
  // Check if amount is greater than 0
  const amountNum = parseFloat(amount);
  if (!isNaN(amountNum) && amountNum > 0) {
    csvFiltered += row; // Add to filtered CSV (balance > 0)
  } else {
    csvEmpty += row; // Add to empty CSV (balance = 0 or null)
  }
});

// ===== WRITE CSV =====
fs.writeFileSync(outputPath, csv, "utf8");
fs.writeFileSync(outputPathFiltered, csvFiltered, "utf8");
fs.writeFileSync(outputPathEmpty, csvEmpty, "utf8");

// ===== SUMMARY STATS =====
const totalRecords = data.results.length;
const filteredCount = csvFiltered.split('\n').length - 2; // -2 for header and trailing newline
const emptyCount = csvEmpty.split('\n').length - 2;

console.log("✅ CSV files created successfully:");
console.log("   Full:", outputPath);
console.log("   Filtered (balance > $0):", outputPathFiltered);
console.log("   Empty (null or $0):", outputPathEmpty);
console.log(`\n📊 Statistics:`);
console.log(`   Total records: ${totalRecords}`);
console.log(`   With balance (> $0): ${filteredCount}`);
console.log(`   Empty/Zero balance: ${emptyCount}`);
console.log(`   Success rate: ${data.summary.successRate}`);