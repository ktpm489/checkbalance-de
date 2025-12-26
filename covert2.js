// OK
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
let csv = "address,amount_usd,change_percent,error\n";
let csvFiltered = "address,amount_usd,change_percent,error\n";
let csvEmpty = "address,amount_usd,change_percent,error\n";

// ===== PARSE & CONVERT =====
data.results.forEach(({ address, totalAsset, error }) => {
  // Handle null or missing totalAsset
  if (!totalAsset) {
    const errorMsg = error ? `"${error.replace(/"/g, '""')}"` : "";
    const row = `${address},,,${errorMsg}\n`;
    csv += row;
    csvEmpty += row; // Add to empty CSV
    return;
  }

  /**
   * Examples:
   * "$8,869-1.29%"
   * "$3,576+100.00%"
   * "$0+0%"
   * "-+0.64%"
   * "--11.76%"
   */
  const match = totalAsset.match(/\$([\d,]+)\s*([+-]?[\d.]+%)/);

  const amount = match ? match[1].replace(/,/g, "") : "";
  const change = match ? match[2] : "";
  const errorMsg = error ? `"${error.replace(/"/g, '""')}"` : "";

  const row = `${address},${amount},${change},${errorMsg}\n`;
  csv += row;
  
  // Check if amount is 0 or greater than 0
  const amountNum = parseFloat(amount);
  if (!isNaN(amountNum) && amountNum > 0) {
    csvFiltered += row; // Add to filtered CSV (balance > 0)
  } else {
    csvEmpty += row; // Add to empty CSV (balance = 0)
  }
});

// ===== WRITE CSV =====
fs.writeFileSync(outputPath, csv, "utf8");
fs.writeFileSync(outputPathFiltered, csvFiltered, "utf8");
fs.writeFileSync(outputPathEmpty, csvEmpty, "utf8");

console.log("✅ CSV files created successfully:");
console.log("   Full:", outputPath);
console.log("   Filtered (balance > $0):", outputPathFiltered);
console.log("   Empty (null or $0):", outputPathEmpty);
console.log(`📊 Total records: ${data.results.length}`);
console.log(`📊 Filtered records (balance > $0): ${csvFiltered.split('\n').length - 2}`);
console.log(`📊 Empty records (null or $0): ${csvEmpty.split('\n').length - 2}`);