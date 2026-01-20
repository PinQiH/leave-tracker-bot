const leaveService = require('../services/leaveService');
const excelService = require('../services/excelService');
const notionRepo = require('../repository/notionRepo');
const config = require('../config/config');
const axios = require('axios');

// 簡單的狀態管理: { [userId]: { step: 'WAIT_FOR_INFO', excelData: [...] } }
const userStates = {};

const botController = {
  /**
   * 處理文字訊息
   * @param {Object} ctx - Telegraf context
   */
  async handleMessage(ctx) {
    const text = ctx.message.text;
    if (!text) return;

    const userId = ctx.from.id;

    // 0. 檢查是否在等待輸入資料狀態
    if (userStates[userId] && userStates[userId].step === 'WAIT_FOR_INFO') {
        const input = text.trim();
        // 格式: 姓名, Email (或是用中文逗號)
        const parts = input.split(/[,，]/);
        if (parts.length < 2) {
            return ctx.reply('⚠️ 格式錯誤，請輸入：姓名, Email\n例如：王小明, ming@example.com');
        }

        const name = parts[0].trim();
        const email = parts[1].trim();

        // 回覆使用者正在處理
        await ctx.reply('🔍 正在驗證資料並匯入中，請稍候...');

        // 背景執行匯入，避免阻塞導致 Timeout
        (async () => {
            try {
                // 尋找 Notion User
                const personId = await notionRepo.findUserByEmail(email);
                if (!personId) {
                    await ctx.reply(`⚠️ 注意：在 Notion 中找不到 Email 為 ${email} 的使用者，將無法標記人員欄位。`);
                }

                const excelData = userStates[userId].excelData;
                let successCount = 0;
                let duplicateCount = 0;
                let errorCount = 0;

                for (const record of excelData) {
                    const exists = await notionRepo.checkDuplicate(personId, record.type, record.startTime, record.endTime);
                    
                    if (exists) {
                        duplicateCount++;
                        continue;
                    }

                    try {
                        await notionRepo.createLeaveRecord({
                            name: name,
                            type: record.type,
                            start: record.startTime,
                            end: record.endTime,
                            hours: record.hours,
                            remark: record.remark,
                            personId: personId
                        });
                        successCount++;
                    } catch (err) {
                        console.error('Import Record Error:', err);
                        errorCount++;
                    }
                }

                let resultMsg = `✅ 匯入完成！\n成功: ${successCount} 筆\n重複忽略: ${duplicateCount} 筆`;
                if (errorCount > 0) resultMsg += `\n失敗: ${errorCount} 筆`;
                
                await ctx.reply(resultMsg);

            } catch (error) {
                console.error('Import Process Error:', error);
                await ctx.reply(`❌ 匯入過程發生錯誤: ${error.message}`);
            }
        })();

        // 清除狀態
        delete userStates[userId];
        return;
    }

    // 嘗試解析是否為請假/加班訊息
    const result = await leaveService.processLeaveMessage(text);

     if (result) {
      // 1. 回覆使用者 (無論成功或失敗)
      await ctx.reply(result.message);

      // 2. 若成功且有設定群組 ID，則推播通知
      if (result.success && config.telegram.groupId) {
        try {
          const { name, type, hours, startTime, endTime, complianceWarning } = result.data;
          let notifyText = `📢 出勤異動通知\n\n 申請人：${name}\n 類型：${type}\n 開始：${startTime}\n 結束：${endTime}`;

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
   * 處理文件訊息 (Excel)
   */
  async handleDocument(ctx) {
      const doc = ctx.message.document;
      const mimeType = doc.mime_type;
      const fileName = doc.file_name.toLowerCase();

      // 檢查是否為 Excel
      if (
          mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || 
          mimeType === 'application/vnd.ms-excel' ||
          fileName.endsWith('.xlsx') || 
          fileName.endsWith('.xls')
      ) {
          try {
              const fileId = doc.file_id;
              const fileLink = await ctx.telegram.getFileLink(fileId);
              
              // 下載檔案
              const response = await axios({
                  url: fileLink.href,
                  method: 'GET',
                  responseType: 'arraybuffer'
              });

              // 解析 Excel
              const result = excelService.parseLeaveExcel(response.data);
              
              if (!result.success) {
                  return ctx.reply(`❌ 解析失敗: ${result.error}`);
              }

              const data = result.data;
              if (data.length === 0) {
                  return ctx.reply('⚠️ 檔案中沒有有效資料。');
              }

              // 暫存狀態
              userStates[ctx.from.id] = {
                  step: 'WAIT_FOR_INFO',
                  excelData: data
              };

              await ctx.reply(`📄 收到 ${data.length} 筆資料。\n請回覆您的 **姓名, Notion Email** 以進行登記。\n(例如: 王小明, ming@example.com)`);

          } catch (error) {
              console.error('Handle Document Error:', error);
              await ctx.reply(`❌ 處理檔案失敗: ${error.message}`);
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
      await ctx.telegram.sendMessage(config.telegram.groupId, '🔔 [測試] 請於21號以前完成前一個月Mynote工作記錄及納管專案工項的進度回報，以利後續作業，感恩大家。\n\n例如：02/21 需完成 01/21 ~ 02/20 Mynote 工作紀錄。');

      // 模擬每月 20 號
      await ctx.telegram.sendMessage(config.telegram.groupId, '🔔 [測試] 大家早安！今天是 20 號，記得寫 Mynote 喔！');

      // 模擬週一
      await ctx.telegram.sendMessage(config.telegram.groupId, '🔔 [測試] 大家早安！又是新的一週，記得寫 Mynote 喔！');

      // 模擬每日請假通知
      const today = new Date().toISOString().split('T')[0];
      await ctx.telegram.sendMessage(config.telegram.groupId, `📅 **${today} 出勤異動名單**：\n1. 測試人員 測試假 (09:00~18:00)`, { parse_mode: 'Markdown' });

      await ctx.reply('✅ 測試通知已發送！');
    } catch (error) {
      console.error('Test Cron Error:', error);
      await ctx.reply(`❌ 發送失敗: ${error.message}`);
    }
  },

  /**
   * 處理 /format 指令
   * 提供手機使用者快速複製格式
   */
  async handleFormatCommand(ctx) {
    const formatText = `
\`\`\`
姓名: 王小明
類型: 加班
開始時間: 2026-01-20 18:00
結束時間: 2026-01-20 20:00
\`\`\`
請複製上方文字並修改內容後傳送。
      `;
    await ctx.reply(formatText, { parse_mode: 'Markdown' });
  },
};

module.exports = botController;
