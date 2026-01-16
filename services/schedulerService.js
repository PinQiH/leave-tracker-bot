const cron = require('node-cron');
const config = require('../config/config');

const schedulerService = {
  /**
   * 初始化排程
   * @param {Object} bot - Telegraf bot instance
   */
  init(bot) {
    console.log('⏳ 排程系統啟動中...');

    const groupId = config.telegram.groupId;

    if (!groupId) {
        console.warn('⚠️ 未設定 TELEGRAM_GROUP_ID，無法啟動排程通知。');
        return;
    }

    // 1. 每個月 15 號 早上 09:00
    cron.schedule('0 9 15 * *', async () => {
      try {
        console.log('⏰ 執行排程：每月 15 號提醒');
        await bot.telegram.sendMessage(groupId, '🔔 請於21號以前完成前一個月Mynote工作記錄及納管專案工項的進度回報，以利後續作業，感恩大家。');
      } catch (error) {
        console.error('排程執行失敗 (每月 15 號):', error);
      }
    });

    // 2. 每個月 20 號 早上 09:00
    cron.schedule('0 9 20 * *', async () => {
      try {
        console.log('⏰ 執行排程：每月 20 號提醒');
        await bot.telegram.sendMessage(groupId, '🔔 大家早安！今天是 20 號，記得寫 Mynote 喔！');
      } catch (error) {
        console.error('排程執行失敗 (每月 20 號):', error);
      }
    });

    // 3. 每個禮拜一 早上 09:00
    cron.schedule('0 9 * * 1', async () => {
      try {
        console.log('⏰ 執行排程：週一提醒');
        await bot.telegram.sendMessage(groupId, '🔔 大家早安！又是新的一週，記得寫 Mynote 喔！');
      } catch (error) {
        console.error('排程執行失敗 (週一):', error);
      }
    });

    console.log('✅ 排程已註冊：\n   - 每月 15 號 09:00\n   - 每月 20 號 09:00\n   - 每週一 09:00');
  }
};

module.exports = schedulerService;
