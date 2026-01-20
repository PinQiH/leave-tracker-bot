const dateUtils = require('../utils/dateUtils');
const notionRepo = require('../repository/notionRepo');
const userMappingManager = require('../utils/userMappingManager');
const dayjs = require('dayjs');

const leaveService = {
  /**
   * 解析請假訊息並寫入 Notion
   * 格式:
   * 姓名: 王小明
   * 類型: 補休/加班/其他假別
   * 開始時間: 2026-01-20 09:00
   * 結束時間: 2026-01-20 18:00
   * @param {string} text - 訊息文字
   * @param {string|number} userId - Telegram User ID
   * @returns {Promise<Object>} - 回覆訊息物件
   */
  async processLeaveMessage(text, userId) {
    try {
      // 1. 解析訊息
      const lines = text.split('\n');
      const data = {};
      
      lines.forEach(line => {
        const parts = line.split(':');
        if (parts.length >= 2) {
          const key = parts[0].trim();
          // 連接剩餘部分以防值中含有冒號 (例如時間)
          const value = parts.slice(1).join(':').trim();
          data[key] = value;
        } else {
            // 嘗試處理全形冒號
            const partsFull = line.split('：');
            if (partsFull.length >= 2) {
                const key = partsFull[0].trim();
                const value = partsFull.slice(1).join('：').trim();
                data[key] = value;
            }
        }
      });

      // 檢查必要欄位
      const requiredFields = ['姓名', '類型', '開始時間', '結束時間'];
      const missingFields = requiredFields.filter(field => !data[field]);

      if (missingFields.length > 0) {
        // 如果缺欄位，可能不是請假訊息，或者是格式錯誤
        // 為了避免干擾一般聊天，這裡我們嚴格一點，只有當至少包含 "姓名" 和 "類型" 時才回報錯誤，
        // 或者我們可以回傳 null 代表此訊息非請假格式
        if (data['姓名'] || data['類型']) {
            return {
                success: false,
                message: `格式錯誤，缺少欄位: ${missingFields.join(', ')}\n請依照格式:\n姓名: XXX\n類型: XXX\n開始時間: YYYY-MM-DD HH:mm\n結束時間: YYYY-MM-DD HH:mm`
            };
        }
        return null; // 不處理
      }

      // 2. 計算時數
      let hours;
      let startForNotion = data['開始時間'];
      let endForNotion = data['結束時間'];
      
      const isDateOnly = (str) => /^(\d{4}[-/]\d{2}[-/]\d{2})$/.test(str.trim());

      // 如果使用者有手動輸入 "時數", 則優先使用
      if (data['時數']) {
          hours = parseFloat(data['時數']);
          // 如果手動輸入時數且是 DateOnly 格式，保持原字串傳給 Notion (不轉 ISO)
          if (!isDateOnly(data['開始時間'])) {
             startForNotion = dateUtils.toIsoString(data['開始時間']);
             endForNotion = dateUtils.toIsoString(data['結束時間']);
          }
      } else {
          // 自動計算
          if (isDateOnly(data['開始時間']) && isDateOnly(data['結束時間'])) {
              // 1. 純日期模式 (跨日/單日) -> 一天 7.5 小時
              // 計算天數差 (例如 26~27 = 2天)
              const startDate = dayjs(data['開始時間']);
              const endDate = dayjs(data['結束時間']);
              const diffDays = endDate.diff(startDate, 'day');
              
              if (diffDays < 0) {
                 return { success: false, message: `結束日期不能早於開始日期。` };
              }
              
              const totalDays = diffDays + 1;
              hours = totalDays * 7.5;
              
              // DateOnly 傳給 Notion 時不轉 ISO，保留 YYYY-MM-DD
          } else {
              // 2. 含時間模式 -> 核算小時
              hours = dateUtils.calculateHours(data['開始時間'], data['結束時間']);
              startForNotion = dateUtils.toIsoString(data['開始時間']);
              endForNotion = dateUtils.toIsoString(data['結束時間']);
          }
      }
      
      if (isNaN(hours) || hours <= 0) {
        return { success: false, message: `時間/時數格式錯誤。\n輸入: ${data['開始時間']} ~ ${data['結束時間']} (時數: ${data['時數']})` };
      }

      
      let complianceMsg = '';

      // 檢查是否為整天卻填寫時間 (若 >= 8 小時且非加班，建議用整天格式)
      if (data['類型'] !== '加班' && !isDateOnly(data['開始時間']) && hours >= 7.5) {
           complianceMsg += `\n⚠️ 提醒：請假整天請勿填寫時間，避免時數計算錯誤 (直接填寫日期即可)`;
      }

      // 3. [NEW] 檢查補休時段 (Rule 10)
      // 若類型為補休，且非整日模式(非 dateOnly)，必須符合 08:30~12:00 或 13:30~17:30
      if (data['類型'] === '補休' && !isDateOnly(data['開始時間'])) {
          const s = dayjs(startForNotion);
          const e = dayjs(endForNotion);
          const sTime = s.format('HH:mm');
          const eTime = e.format('HH:mm');
          
          const validMorning = (sTime === '08:30' && eTime === '12:00');
          const validAfternoon = (sTime === '13:30' && eTime === '17:30');
          
          if (!validMorning && !validAfternoon) {
              // 改為警示，不擋下
              complianceMsg += `\n⚠️ 注意：補休時段異常 (建議 08:30~12:00 或 13:30~17:30)`;
          }
      }

      // 3.5 [NEW] 檢查人員對應
      // const email = userMappingManager.getEmail(userId);
      // 改用 authService 查詢 Notion User ID
      const authService = require('./authService'); // Lazy load or move to top
      const user = await authService.checkUserByTelegramId(userId);

      if (!user || !user.notionUserId) {
          // 若找不到或沒綁定 Notion User ID (同步腳本沒跑?), 視為未綁定
             return {
              success: false,
              status: 'MISSING_MAPPING',
              message: '尚未完成身分綁定或同步，無法標記人員。'
          };
      }

      // 取得 Notion Person ID
      const personId = user.notionUserId;
      let personWarning = '';
      if (!personId) {
           // 理論上 checkUserByTelegramId 回傳 user 就應該有，除非 Notion_ID 欄位空的
           personWarning = `\n⚠️ 注意：您的資料未同步 Notion ID，無法自動標記人員。`;
      }

      // 4. 呼叫 Repo 寫入 Notion
      await notionRepo.createLeaveRecord({
        name: data['姓名'],
        type: data['類型'],
        start: startForNotion,
        end: endForNotion,
        hours: hours,
        remark: text, // 原始訊息當作備註
        personId: personId
      });

      // 4. 加班/補休 則計算剩餘時數
      let balanceMsg = '';
      if (['加班', '補休'].includes(data['類型'])) {
        try {
          // 改用 Person ID 計算結餘
          const balanceData = await notionRepo.getUserTimeBalanceByPersonId(personId);
          balanceMsg = `\n💰 目前結餘: ${balanceData.balance} 小時 (總加班 ${balanceData.overtime} - 總補休 ${balanceData.compensatory})`;
        } catch (e) {
          console.error('Balance calculation failed', e);
        }
      }
      
      // 5. [NEW] 檢查休假預告期 (Rule 2)
      // 若是 "加班" 通常是事後申請或補登，這裡主要針對 "請假" 類 (含補休)
      // 但使用者說 "除病假可臨時請外"，所以排除 "病假" 與 "加班"
      // let complianceMsg = ''; // 已在上方宣告
      let isCompliant = true;
      const warningType = ['加班', '病假']; // 這些類型通常不強制預告期
      
      if (!warningType.includes(data['類型'])) {
          const check = leaveService.validateAdvanceNotice(startForNotion, endForNotion, hours);
          if (!check.isValid) {
              isCompliant = false;
              complianceMsg += `\n⚠️ 注意：未符合預告期規定\n(需提前 ${check.requiredDays} 天申請)`;
          }
      }

      const successMessage = `✅ 登記成功！\n姓名: ${data['姓名']}\n類型: ${data['類型']}\n時數: ${hours} 小時${balanceMsg}${complianceMsg}${personWarning}`;

      return {
          success: true,
          message: successMessage,
          data: {
              name: data['姓名'],
              type: data['類型'],
              hours: hours,
              startTime: data['開始時間'],
              endTime: data['結束時間'],
              balanceMessage: balanceMsg,
              complianceWarning: isCompliant ? '' : complianceMsg
          }
      };

    } catch (error) {
      console.error('Leave Service Error:', error);
      return {
          success: false,
          message: `❌ 登記失敗，系統發生錯誤。\n原因: ${error.message}`
      };
    }
  },

  /**
   * 驗證休假預告期 (Rule 2)
   * @param {string} startIso - ISO 格式開始時間
   * @param {number} hours - 休假總時數
   * @returns {{isValid: boolean, requiredDays: number}}
   */
  validateAdvanceNotice(startIso, endIso, hours) {
      // 改用 "涵蓋日曆天數" 判斷 (Inclusive Calendar Days)
      // 例如 17號 18:00 ~ 20號 20:00
      // 涉及 17, 18, 19, 20 四個日期，算 4 天
      const start = dayjs(startIso).startOf('day');
      const end = dayjs(endIso).startOf('day');
      
      // diff('day') 計算相差天數，+1 為涵蓋天數
      const durationDays = end.diff(start, 'day') + 1;
      
      let requiredHours = 0;
      let requiredDays = 0;

      // 規則對應 (嚴格判定)
      if (durationDays <= 1) { 
          // 1天內
          requiredHours = 24;
          requiredDays = 1;
      } else if (durationDays <= 3) { 
          // 2~3天
          requiredHours = 48;
          requiredDays = 2;
      } else if (durationDays <= 5) {
          // 4~5天
          requiredHours = 120;
          requiredDays = 5;
      } else {
          // 6天以上
          requiredHours = 336;
          requiredDays = 14;
      }

      const now = dayjs();
      // 使用實際開始時間計算預告期
      // const actualStart = dayjs(startIso); 
      
      // 改為檢查 "日曆天" 差異
      // 今天是 20號, 申請 21號 => 21 - 20 = 1天 (符合提前1天)
      // 今天是 20號, 申請 20號 => 20 - 20 = 0天 (不符合提前1天)
      const submitDate = now.startOf('day');
      const startDate = dayjs(startIso).startOf('day');
      
      const daysInAdvance = startDate.diff(submitDate, 'day');
      
      return {
          isValid: daysInAdvance >= requiredDays,
          requiredDays: requiredDays,
          durationDays: durationDays // for debug/info if needed
      };
  },

  /**
   * 處理加班統計查詢
   * @param {string} text - 指令或文字
   * @returns {Promise<string>}
   */
  async processStatsQuery(text) {
      // 簡單實作：/stats [姓名]
      // 這裡假設 controller 已經處理好指令與參數
      // 但如果我們要從 text 解析也可以
      
      // 這裡先保留給 controller 呼叫
      return ''; 
  },

  async getStatsByName(name) {
      try {
        const stats = await notionRepo.getOvertimeStats(name);
        if (stats.count === 0) {
            return `查無 ${name ? name : '任何人'} 的加班記錄。`;
        }
        return `📊 統計結果 ${name ? '(' + name + ')' : '(全員)'}:\n總加班時數: ${stats.totalHours} 小時\n筆數: ${stats.count} 筆`;
      } catch (error) {
          console.error('Stats Service Error:', error);
          return `❌ 查詢失敗: ${error.message}`;
      }
  }
};

module.exports = leaveService;
