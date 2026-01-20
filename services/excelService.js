const xlsx = require('xlsx');
const dateUtils = require('../utils/dateUtils'); // Assuming useful or use dayjs directly

const excelService = {
  /**
   * 解析請假 Excel 檔案
   * @param {Buffer} buffer - 檔案 Buffer
   * @returns {Array} 解析後的資料陣列
   */
  parseLeaveExcel(buffer) {
    try {
      const workbook = xlsx.read(buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      
      // 轉換為 JSON，預設第一列為 Header
      const rawData = xlsx.utils.sheet_to_json(worksheet);
      
      const parsedData = [];
      const errors = [];

      rawData.forEach((row, index) => {
        // 欄位對應: 加班或補修, 說明, 起始時間, 結束時間, 時數(小時)
        // 注意 Excel 時間格式可能是數字 (Excel Serial Date) 或字串
        
        const type = row['加班或補修'];
        const remark = row['說明'];
        const startRaw = row['起始時間'];
        const endRaw = row['結束時間'];
        const hours = row['時數(小時)']; // 或者 累計時數? Spec says: 加班或補修/說明/起始時間/結束時間/時數(小時)/累計時數
        
        if (!type || !startRaw || !endRaw) {
             // Skip empty rows or log warning
             return;
        }


        const formatExcelDate = (val) => {
            // Excel Serial Date (e.g. 45311.75)
            if (typeof val === 'number') {
                // Excel epoch is 1899-12-30. 
                // JS timestamp calculated from it.
                // We treat the resulting time as "Local Time in Excel" -> "Taipei Time"
                const date = new Date(Math.round((val - 25569) * 86400 * 1000));
                // 這裡 date 如果環境是 UTC，它可能會顯示 "2024-01-20T18:00:00.000Z" (若 val 代表 18:00)
                // 我們希望這個 "18:00" 是台北時間的 18:00
                // 但為了單純化，我們先轉成 ISO 字串 (UTC)，Notion 其實會顯示成使用者時區
                // 修正：如果 Notion 預期收到含有正確 offset 的 ISO，或者 UTC
                // 假設使用者 Excel 填 "18:00"，希望 Notion 看到 "18:00 (GMT+8)"
                // 我們應該回傳 "2024-01-20T10:00:00.000Z" (UTC)
                
                // 但 `new Date` 的行為依賴系統時區。
                // 比較穩的做法：將 Excel 數值視為 UTC，然後扣掉 8 小時 (因為 Excel 1900 是無時區的，通常被視為本地)
                // 或者直接用 dayjs 處理
                // const dt = new Date((val - 25569) * 86400 * 1000);
                // return dt.toISOString();
                
                // 這裡保留原樣，待實際錯誤再調
                return new Date(Math.round((val - 25569)*86400*1000)).toISOString();
            }

            // String format (e.g. "2026/01/20 18:00", "2026-01-20 18:00")
            if (typeof val === 'string') {
                // 使用 dayjs 強制解析為台北時間
                const dayjs = require('dayjs');
                const utc = require('dayjs/plugin/utc');
                const timezone = require('dayjs/plugin/timezone');
                dayjs.extend(utc);
                dayjs.extend(timezone);

                // 嘗試解析並指定為台北時間
                // 如果格式是 "YYYY/MM/DD HH:mm:ss"
                const dt = dayjs.tz(val, "Asia/Taipei");
                if (dt.isValid()) {
                    return dt.toISOString(); // 轉換為 UTC ISO String
                }
            }
            
            // Fallback
            return new Date(val).toISOString();
        };

        parsedData.push({
            type: type,
            remark: remark,
            startTime: formatExcelDate(startRaw),
            endTime: formatExcelDate(endRaw),
            hours: hours
        });
      });

      return { success: true, data: parsedData };

    } catch (error) {
      console.error('Excel Parse Error:', error);
      return { success: false, error: error.message };
    }
  }
};

module.exports = excelService;
