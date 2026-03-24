const fs = require("fs");
const path = require("path");
const xlsx = require("xlsx");
const dayjs = require("dayjs");

/**
 * 假日管理工具
 * 負責解析 assets/holiday_2026.csv 並提供查詢介面
 */
class HolidayManager {
  constructor() {
    this.holidays = new Map(); // key: YYYYMMDD, value: { name, isHoliday, category, description }
    this.isLoaded = false;
  }

  /**
   * 初始化並載入 CSV 資料
   */
  init() {
    if (this.isLoaded) return;

    try {
      const csvPath = path.join(__dirname, "../assets/holiday_2026.csv");
      if (!fs.existsSync(csvPath)) {
        console.warn(`⚠️ 找不到假日資料檔: ${csvPath}`);
        return;
      }

      const workbook = xlsx.readFile(csvPath);
      const sheetName = workbook.SheetNames[0];
      const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

      data.forEach((row) => {
        // CSV 格式: date, year, name, isholiday, holidaycategory, description
        const dateStr = String(row.date); // 20260101
        this.holidays.set(dateStr, {
          date: dateStr,
          name: row.name || "",
          isHoliday: row.isholiday === "是",
          category: row.holidaycategory || "",
          description: row.description || "",
        });
      });

      this.isLoaded = true;
      console.log(`✅ 成功載入 ${this.holidays.size} 筆假日資料。`);
    } catch (error) {
      console.error("❌ 載入假日資料失敗:", error);
    }
  }

  /**
   * 獲取指定日期的假日資訊
   * @param {string|Date|Dayjs} date - 日期
   * @returns {Object|null}
   */
  getHolidayInfo(date) {
    if (!this.isLoaded) this.init();

    const dateStr = dayjs(date).format("YYYYMMDD");
    return this.holidays.get(dateStr) || null;
  }

  /**
   * 判斷明天是否為「需要通知」的假日
   * 規則：isholiday="是" 且 category 不是 "星期六、星期日" (或是特別名稱的國定假日)
   * @returns {Object|null} 如果有假日則回傳資訊，否則回傳 null
   */
  checkTomorrowHoliday() {
    const tomorrow = dayjs().add(1, "day");
    const info = this.getHolidayInfo(tomorrow);

    if (info && info.isHoliday) {
      // 排除一般的週末 (除非週末有名字，例如國慶日本來就在週六)
      // 使用者需求是「平日因為國定假日放假」，所以如果 category 是 "星期六、星期日" 且沒有 name，則跳過
      if (info.category === "星期六、星期日" && !info.name) {
        return null;
      }
      return info;
    }
    return null;
  }
}

module.exports = new HolidayManager();
