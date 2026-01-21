const xlsx = require("xlsx");
const dateUtils = require("../utils/dateUtils"); // Assuming useful or use dayjs directly

// Ensure we have the required plugins for Day.js
const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");
const customParseFormat = require("dayjs/plugin/customParseFormat");

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(customParseFormat);

const excelService = {
  /**
   * 解析請假 Excel 檔案
   * @param {Buffer} buffer - 檔案 Buffer
   * @returns {Array} 解析後的資料陣列
   */
  parseLeaveExcel(buffer) {
    try {
      const workbook = xlsx.read(buffer, { type: "buffer" });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];

      // 轉換為 JSON，預設第一列為 Header
      const rawData = xlsx.utils.sheet_to_json(worksheet);

      const parsedData = [];
      const errors = [];

      rawData.forEach((row, index) => {
        // 欄位對應: 加班或補修, 說明, 起始時間, 結束時間, 時數(小時)
        // 注意 Excel 時間格式可能是數字 (Excel Serial Date) 或字串

        const type = row["加班或補修"]?.trim();
        const remark = row["說明"];
        const startRaw = row["起始時間"];
        const endRaw = row["結束時間"];
        const hours = row["時數(小時)"]; // 或者 累計時數? Spec says: 加班或補修/說明/起始時間/結束時間/時數(小時)/累計時數

        if (!type || !startRaw || !endRaw) {
          // Skip empty rows or log warning
          return;
        }

        const formatExcelDate = (val) => {
          // Excel Serial Date (e.g. 45311.75 = 2024-01-20 18:00:00)
          if (typeof val === "number") {
            // 1. Calculate the 'Local' milliseconds from Excel epoch (1899-12-30)
            //    (val - 25569) converts 1900-based date to 1970-based date
            //    This gives us a timestamp that represents the Excel time as if it were UTC.
            const excelLocalMs = (val - 25569) * 86400 * 1000;

            // 2. The user wants this "Excel Local time" to be strictly "Taipei Time".
            //    If Excel says "18: 00", we have a timestamp for "18: 00 UTC".
            //    We need "18: 00 Taipei", which is "10: 00 UTC".
            //    Difference is -8 hours (-28800000 ms).
            const taipeiOffsetMs = 8 * 60 * 60 * 1000;
            const correctUtcMs = excelLocalMs - taipeiOffsetMs;

            // 3. Return ISO string (e.g., 10:00Z)
            return new Date(Math.round(correctUtcMs)).toISOString();
          }

          // String format (e.g. "2026/01/20 18:00", "2026-01-20 18:00", "2025/4/1 06:11:00 PM")
          if (typeof val === "string") {
            const valTrimmed = val.trim();

            // 定義支援的格式清單 - Order matters (more specific first)
            const formats = [
              "YYYY/MM/DD HH:mm:ss",
              "YYYY/MM/DD HH:mm",
              "YYYY/M/D HH:mm:ss",
              "YYYY/M/D HH:mm",
              "YYYY-MM-DD HH:mm:ss",
              "YYYY-MM-DD HH:mm",
              "YYYY/M/D hh:mm:ss A", // For "2025/4/1 06:11:00 PM"
              "YYYY/MM/DD hh:mm:ss A",
              "M/D/YYYY hh:mm:ss A",
              "MM/DD/YYYY hh:mm:ss A",
            ];

            for (const fmt of formats) {
              try {
                // dayjs.tz with format parses the string assuming it is in the given timezone.
                // If parsing fails, it might output "Invalid Date" or throw RangeError.
                const dt = dayjs.tz(valTrimmed, fmt, "Asia/Taipei");
                if (dt.isValid()) {
                  return dt.toISOString();
                }
              } catch (e) {
                // Ignore parse errors for specific format and try next
                continue;
              }
            }

            console.warn(
              `[ExcelService] Unable to parse date string with explicitly defined formats: "${valTrimmed}"`,
            );
          }

          // Fallback (若真的無法解析，使用系統預設)
          try {
            // If standard Date parse is used, it often assumes UTC or Local.
            // We shouldn't rely on this for "18:11" -> Taipei if server is UTC.
            // But as a last resort:
            const dt = new Date(val);
            if (!isNaN(dt.getTime())) {
              return dt.toISOString();
            }
          } catch (e) {
            console.error(
              `[ExcelService] Date parsing failed completely for value: ${val}`,
              e,
            );
          }

          return null; // Return null if all failed
        };

        const startTimeISO = formatExcelDate(startRaw);
        const endTimeISO = formatExcelDate(endRaw);

        if (!startTimeISO || !endTimeISO) {
          console.error(
            `Row skipped due to invalid date. Start: ${startRaw}, End: ${endRaw}`,
          );
          // Depending on requirements, might want to push to errors array
          // Continue to next row
          return;
        }

        // 簡單處理: 直接存 raw data 讓人工確認或後續處理
        parsedData.push({
          type: type,
          remark: remark,
          startTime: startTimeISO,
          endTime: endTimeISO,
          hours: hours,
        });
      });

      return { success: true, data: parsedData };
    } catch (error) {
      console.error("Excel Parse Error:", error);
      return { success: false, error: error.message };
    }
  },
};

module.exports = excelService;
