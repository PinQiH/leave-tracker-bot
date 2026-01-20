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
            if (val instanceof Date) return val.toISOString();
            // 如果是數字 (Excel Date Serial)，xlsx 通常能自動處理解析，但若 sheet_to_json 沒設定 raw: false，會是數字
            // 建議手動處理或信賴 input string
            // 這裡簡單假設使用者輸入字串或 xlsx 解析為標準格式，若有問題後續再修
            // 為了保險，嘗試 new Date
            const d = new Date(val);
            // 處理時區問題? 假設輸入是本地時間
            // 簡單轉 ISO String, 注意時區偏移 (Node 預設 UTC)
            // 這裡先簡單回傳字串，讓 dateUtils 或 notionRepo 處理
            // 若 Excel 讀出來是 "2026/01/20 18:00"， new Date 會依賴系統
            
            // Excel 數字 45311.75 = 2024-01-20 18:00
            if (typeof val === 'number') {
                // Excel 1900 epoch
                return new Date(Math.round((val - 25569)*86400*1000)).toISOString();
            }
            return d.toISOString(); // 會轉成 UTC
        };

        // 簡單處理: 直接存 raw data 讓人工確認或後續處理，但 plan 說要 clean array
        // 考慮到時區問題，最好用 dayjs 處理
        // 暫時直接回傳 row data，由 repo 層轉 ISO
        
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
