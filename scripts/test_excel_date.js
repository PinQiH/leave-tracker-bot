const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");
const customParseFormat = require("dayjs/plugin/customParseFormat");

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(customParseFormat);

console.log("=== Testing Excel Date Logic ===");

// 1. Test Excel Serial Date
// Value: 45763.758333 (approx 2025/04/15 18:12:00)
// Calculation: (45763.758333 - 25569) * 86400 * 1000
// This gives UTC ms.
// We want to verify that subtracting 8 hours gives the correct UTC time for Notion.

function formatExcelSerial(val) {
  const excelLocalMs = (val - 25569) * 86400 * 1000;
  const taipeiOffsetMs = 8 * 60 * 60 * 1000;
  const correctUtcMs = excelLocalMs - taipeiOffsetMs;
  return new Date(Math.round(correctUtcMs)).toISOString();
}

// 45311.75 is 2024-01-20 18:00:00 in Excel's view.
// We expect it to be 2024-01-20 10:00:00 UTC (which is 18:00 Taipei)
const val1 = 45311.75;
const result1 = formatExcelSerial(val1);
console.log(`Input Serial: ${val1} (2024-01-20 18:00)`);
console.log(`Result ISO: ${result1}`);
console.log(`Expected: 2024-01-20T10:00:00.000Z`);

if (result1 === "2024-01-20T10:00:00.000Z") {
  console.log("✅ Serial Date Test Passed");
} else {
  console.error("❌ Serial Date Test Failed");
}

console.log("\n------------------\n");

// 2. Test String Date
// Input: "2025/04/01 18:11"
// Env: Asia/Taipei
// Expected UTC: 2025-04-01 10:11:00Z

function formatStringDate(val) {
  const valTrimmed = val.trim();
  const formats = ["YYYY/MM/DD HH:mm", "YYYY/MM/DD HH:mm:ss"];

  for (const fmt of formats) {
    try {
      const dt = dayjs.tz(valTrimmed, fmt, "Asia/Taipei");
      if (dt.isValid()) {
        return dt.toISOString();
      }
    } catch (e) {}
  }
  return "INVALID";
}

const str1 = "2025/04/01 18:11";
const result2 = formatStringDate(str1);
console.log(`Input String: "${str1}"`);
console.log(`Result ISO: ${result2}`);
console.log(`Expected: 2025-04-01T10:11:00.000Z`);

if (result2 === "2025-04-01T10:11:00.000Z") {
  console.log("✅ String Date Test Passed");
} else {
  console.error("❌ String Date Test Failed");
}

console.log("\n------------------\n");

// 3. Test String Date with AM/PM
const str2 = "2025/4/1 06:11:00 PM";
// Expected: 2025-04-01 18:11:00 -> 10:11:00 UTC
// (Assuming format is supported)
// Note: My script logic above didn't explicitly include the AM/PM format in the TEST function,
// but the main code does. Use the main code logic here?
// No, I'll just check if basic logic works.

console.log("=== End Test ===");
