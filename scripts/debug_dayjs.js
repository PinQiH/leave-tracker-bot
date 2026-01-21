const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
const customParseFormat = require('dayjs/plugin/customParseFormat');

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(customParseFormat);

const formats = [
    "YYYY/MM/DD HH:mm:ss", 
    "YYYY/MM/DD HH:mm", 
    "YYYY/MM/DD" // Checking valid but short
];
const input = "2025/04/01 18:11";

console.log(`Input: ${input}`);

function parse(val) {
    for (const fmt of formats) {
        // Use loose parsing first? Or check strictness?
        // Let's try dayjs.tz direct
        const dt = dayjs.tz(val, fmt, "Asia/Taipei");
        // Check if valid AND if strict match? dayjs.tz doesn't return parsing flags easily?
        // Let's just check validity.
        if (dt.isValid()) {
             // To prevent "2025/04/01 18:11" matching "YYYY/MM/DD" (ignoring time)
             // We can check if the formatted output matches input length roughly?
             // Or rely on format order.
             console.log(`Matched format: ${fmt} -> ${dt.toISOString()}`);
             return dt.toISOString();
        }
    }
    return null;
}

parse(input);


