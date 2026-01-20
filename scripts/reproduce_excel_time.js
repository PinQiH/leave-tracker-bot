const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
const customParseFormat = require('dayjs/plugin/customParseFormat');

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(customParseFormat);

function testParse(val) {
    console.log(`\nInput: "${val}"`);

    // 1. Current Logic Simulation
    let parsed1 = null;
    try {
        const dt = dayjs.tz(val, "Asia/Taipei");
        if (dt.isValid()) {
            parsed1 = dt.toISOString();
            console.log(`[Current Logic] dayjs.tz result: ${parsed1} (Local: ${dt.format()})`);
        } else {
             console.log(`[Current Logic] dayjs.tz INVALID`);
        }
    } catch (e) {
        console.log(`[Current Logic] Error: ${e.message}`);
    }

    // 2. Fallback simulation (Native Date)
    const d = new Date(val);
    console.log(`[Fallback] new Date() result: ${d.toISOString()}`);

    // 3. Proposed Fix
    // Need to handle "2025/4/1 06:11:00 PM" specifically
    const formats = [
        "YYYY/M/D hh:mm:ss A", 
        "YYYY/MM/DD hh:mm:ss A",
        "YYYY/M/D HH:mm:ss",
        "YYYY-MM-DD HH:mm"
    ];
    let parsed3 = null;
    const dt3 = dayjs.tz(val, formats, "Asia/Taipei");
    if (dt3.isValid()) {
        parsed3 = dt3.toISOString();
        console.log(`[Proposed] dayjs with Format result: ${parsed3}`);
    } else {
        console.log(`[Proposed] Invalid with formats`);
    }
}

testParse("2025/4/1 06:11:00 PM");
testParse("2025/4/1 06:49:00 PM");
