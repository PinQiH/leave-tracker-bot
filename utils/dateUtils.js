const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');

dayjs.extend(utc);
dayjs.extend(timezone);

// 設定預設時區為台北
dayjs.tz.setDefault("Asia/Taipei");

/**
 * 計算兩個時間的小時差
 * @param {string} start - 開始時間 (ISO string or YYYY-MM-DD HH:mm)
 * @param {string} end - 結束時間
 * @returns {number} - 小時數 (保留一位小數)
 */
const calculateHours = (start, end) => {
  // 強制視為台北時間解析
  const startDate = dayjs.tz(start, "Asia/Taipei");
  const endDate = dayjs.tz(end, "Asia/Taipei");
  const diffMs = endDate.diff(startDate);
  // 轉換為小時，保留1位小數
  const hours = diffMs / (1000 * 60 * 60);
  return Math.round(hours * 10) / 10;
};

/**
 * 格式化日期為 ISO 8601 (Notion 需求)
 * @param {string} dateStr 
 * @returns {string}
 */
const toIsoString = (dateStr) => {
  // 強制視為台北時間解析，再轉為 ISO (會自動轉為 UTC)
  return dayjs.tz(dateStr, "Asia/Taipei").toISOString();
};

module.exports = {
  calculateHours,
  toIsoString,
};
