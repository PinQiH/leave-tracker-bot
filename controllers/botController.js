const leaveService = require('../services/leaveService');
const config = require('../config/config');

const botController = {
  /**
   * 處理文字訊息
   * @param {Object} ctx - Telegraf context
   */
  async handleMessage(ctx) {
    const text = ctx.message.text;
    if (!text) return;

    // 嘗試解析是否為請假/加班訊息
    const result = await leaveService.processLeaveMessage(text);
    
    if (result) {
      // 1. 回覆使用者 (無論成功或失敗)
      await ctx.reply(result.message);

      // 2. 若成功且有設定群組 ID，則推播通知
      if (result.success && config.telegram.groupId) {
          try {
              const { name, type, hours, complianceWarning } = result.data;
              let notifyText = `📢 請假通知\n\n 姓名：${name}\n 假別：${type}\n 時數：${hours} 小時`;
              
              if (complianceWarning) {
                  notifyText += `\n\n${complianceWarning}`;
              }

              await ctx.telegram.sendMessage(config.telegram.groupId, notifyText);
          } catch (error) {
              console.error('Failed to send group notification:', error);
          }
      }
    }
  },
  
  /**
   * 處理 /help 指令
   */
  async handleHelpCommand(ctx) {
      const helpText = `
🤖 **請假/加班機器人指令說明**

**1. 新增記錄**：
直接傳送以下格式：
\`\`\`
姓名: 王小明
類型: 加班
開始時間: 2026-01-20 18:00
結束時間: 2026-01-20 20:00
\`\`\`
*類型支援：補休、加班、特休、病假...*

**⚠️ 注意事項**：

**休假預告期**
除病假外，請依天數提前申請：
- 1 天內：提前 1 天
- 2~3 天：提前 2 天
- 4~5 天：提前 5 天
- 6 天以上：提前 14 天
*(未符合系統將顯示警示)*

**補休時段**
補休請以半天為單位：
- 上午：08:30 ~ 12:00
- 下午：13:30 ~ 17:30
*(時段不符系統將顯示警示)*
      `;
      await ctx.replyWithMarkdown(helpText);
  },

  /**
   * 處理 /getid 指令
   * 用於取得當前聊天室 ID (個人或群組)
   */
  async handleGetIdCommand(ctx) {
      const chatId = ctx.chat.id;
      const title = ctx.chat.title || ctx.chat.first_name || '此聊天室';
      await ctx.reply(`🆔 **${title}** 的 ID 是：\n\`${chatId}\``, { parse_mode: 'Markdown' });
  },

  /**
   * 測試排程通知 (手動觸發)
   */
  async handleTestCronCommand(ctx) {
      if (!config.telegram.groupId) {
          return ctx.reply('❌ 尚未設定群組 ID (TELEGRAM_GROUP_ID)，無法測試。');
      }
      
      await ctx.reply('🚀 正在發送測試通知到群組...');
      
      try {
        // 模擬每月 15 號
        await ctx.telegram.sendMessage(config.telegram.groupId, '🔔 [測試] 請於21號以前完成前一個月Mynote工作記錄及納管專案工項的進度回報，以利後續作業，感恩大家。');

        // 模擬每月 20 號
        await ctx.telegram.sendMessage(config.telegram.groupId, '🔔 [測試] 大家早安！今天是 20 號，記得寫 Mynote 喔！');
        
        // 模擬週一
        await ctx.telegram.sendMessage(config.telegram.groupId, '🔔 [測試] 大家早安！又是新的一週，記得寫 Mynote 喔！');
        
        await ctx.reply('✅ 測試通知已發送！');
      } catch (error) {
        console.error('Test Cron Error:', error);
        await ctx.reply(`❌ 發送失敗: ${error.message}`);
      }
  }
};

module.exports = botController;
