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
let csv = "address,amount_usd,change_percent\n";

// ===== PARSE & CONVERT =====
data.forEach(({ address, totalAsset }) => {
  /**
   * Examples:
   * "$8,869-1.29%"
   * "$3,576+100.00%"
   * "$0+0%"
   */
  const match = totalAsset.match(/\$([\d,]+)\s*([+-]?[\d.]+%)/);

  const amount = match ? match[1].replace(/,/g, "") : "";
  const change = match ? match[2] : "";

  csv += `${address},${amount},${change}\n`;
});

// ===== WRITE CSV =====
fs.writeFileSync(outputPath, csv, "utf8");

console.log("✅ CSV created successfully:");
console.log(outputPath);
