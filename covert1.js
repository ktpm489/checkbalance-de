const fs = require("fs");
const path = require("path");

// ===== CONFIG =====
const INPUT_FILE = "debank-results.json";
const OUTPUT_FILE = "debank-results.csv";

// ===== PATHS =====
const inputPath = path.resolve(__dirname, INPUT_FILE);
const outputPath = path.resolve(__dirname, OUTPUT_FILE);

// ===== READ JSON =====
if (!fs.existsSync(inputPath)) {
  console.error("❌ Input file not found:", inputPath);
  process.exit(1);
}

const raw = fs.readFileSync(inputPath, "utf8");
const data = JSON.parse(raw);

// ===== CSV HEADER =====
let csv = "address,amount_usd,change_percent,error\n";

// ===== PARSE & CONVERT =====
data.results.forEach(({ address, totalAsset, error }) => {
  // Handle null or missing totalAsset
  if (!totalAsset) {
    const errorMsg = error ? `"${error.replace(/"/g, '""')}"` : "";
    csv += `${address},,,${errorMsg}\n`;
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

  csv += `${address},${amount},${change},${errorMsg}\n`;
});

// ===== WRITE CSV =====
fs.writeFileSync(outputPath, csv, "utf8");

console.log("✅ CSV created successfully:");
console.log(outputPath);
console.log(`📊 Total records: ${data.results.length}`);