const leaveService = require("../services/leaveService")
const excelService = require("../services/excelService")
const notionRepo = require("../repository/notionRepo")
const userMappingManager = require("../utils/userMappingManager")
const config = require("../config/config")
const axios = require("axios")

// 簡單的狀態管理: { [userId]: { step: 'WAIT_FOR_INFO', excelData: [...] } }
const userStates = {}

const botController = {
  /**
   * 處理文字訊息
   * @param {Object} ctx - Telegraf context
   */
  async handleMessage(ctx) {
    const text = ctx.message.text
    if (!text) return

    const userId = ctx.from.id

    // 0.1 處理等待註冊 Email
    if (userStates[userId] && userStates[userId].step === "WAIT_FOR_EMAIL") {
      const email = text.trim()
      // 簡單驗證 Email
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return ctx.reply(
          "⚠️ Email 格式不正確，請重新輸入 (例如: user@example.com)"
        )
      }

      try {
        // 驗證 Notion 是否有此人
        const personId = await notionRepo.findUserByEmail(email)
        if (!personId) {
          return ctx.reply(
            `⚠️ 在 Notion 找不到 ${email}，請確認 Email 是否正確 (需與 Notion 帳號一致)？\n請重新輸入：`
          )
        }

        // 綁定成功
        userMappingManager.setEmail(userId, email)
        await ctx.reply(`✅ 綁定成功！\n正在自動繼續處理您的請假申請...`)

        // 取出暫存的請假文字
        const originalText = userStates[userId].pendingText

        // 清除狀態
        delete userStates[userId]

        // 重新執行請假流程 (這會掉到下方的 handleLeaveFlow，或是我們直接在這裡呼叫)
        // 為了避免代碼重複，這裡我們將 `originalText` 設為 `text` 並讓程式繼續往下走？
        // 但因為 `text` 是 const，所以我們這裡直接呼叫 service 比較保險

        // Reuse Logic: 直接呼叫 service (複製下方的 logic)
        const result = await leaveService.processLeaveMessage(
          originalText,
          userId
        )

        // 處理結果 (複製自下方)
        if (result) {
          await ctx.reply(result.message)
          if (result.success && config.telegram.groupId) {
            try {
              console.log(
                "Attempting to send group notification (handleMessage)..."
              )
              const {
                name,
                type,
                hours,
                startTime,
                endTime,
                complianceWarning,
              } = result.data
              let notifyText = `📢 出勤異動通知\n\n 申請人：${name}\n 類型：${type}\n 開始：${startTime}\n 結束：${endTime}`
              if (complianceWarning) notifyText += `\n\n${complianceWarning}`
              await ctx.telegram.sendMessage(
                config.telegram.groupId,
                notifyText
              )
              console.log("✅ Group notification sent successfully.")
            } catch (error) {
              console.error("Failed to send group notification:", error)
            }
          }
        }
        return
      } catch (err) {
        console.error("Binding Error:", err)
        return ctx.reply(`❌ 綁定過程發生錯誤: ${err.message}`)
      }
    }

    // 0.2 處理等待手動輸入結餘
    if (userStates[userId] && userStates[userId].step === "WAIT_FOR_BALANCE") {
      const manualBalance = parseFloat(text.trim())
      if (isNaN(manualBalance)) {
        return ctx.reply("⚠️ 請輸入正確的數字（例如：5.5 或 8）")
      }

      try {
        const originalText = userStates[userId].pendingText
        const pageId = userStates[userId].pageId

        // 如果沒有 pendingText，代表只是單純查詢 /balance 時發現沒資料，補填
        if (!originalText) {
          if (pageId) {
            await notionRepo.updateBalance(pageId, manualBalance)
          }
          delete userStates[userId]
          return ctx.reply(`✅ 累計時數已更新為: ${manualBalance} 小時`)
        }

        // 有 pendingText，代表是請假流程中發現沒結餘
        // 清除狀態
        delete userStates[userId]

        // 帶入手動結餘重跑流程
        const result = await leaveService.processLeaveMessage(
          originalText,
          userId,
          manualBalance
        )

        // 處理結果
        if (result) {
          await ctx.reply(result.message)
          if (result.success && config.telegram.groupId) {
            try {
              console.log(
                "Attempting to send group notification (manual balance)..."
              )
              const {
                name,
                type,
                hours,
                startTime,
                endTime,
                complianceWarning,
              } = result.data
              let notifyText = `📢 出勤異動通知\n\n 申請人：${name}\n 類型：${type}\n 開始：${startTime}\n 結束：${endTime}`
              if (complianceWarning) notifyText += `\n\n${complianceWarning}`
              await ctx.telegram.sendMessage(
                config.telegram.groupId,
                notifyText
              )
              console.log("✅ Group notification sent successfully.")
            } catch (error) {
              console.error("Failed to send group notification:", error)
            }
          }
        }
        return
      } catch (err) {
        console.error("Manual Balance Error:", err)
        return ctx.reply(`❌ 處理過程發生錯誤: ${err.message}`)
      }
    }

    // 0. 檢查是否在等待輸入資料狀態 (Excel)
    if (userStates[userId] && userStates[userId].step === "WAIT_FOR_INFO") {
      const input = text.trim()
      // 格式: 姓名, Email (或是用中文逗號)
      const parts = input.split(/[,，]/)
      if (parts.length < 2) {
        return ctx.reply(
          "⚠️ 格式錯誤，請輸入：姓名, Email\n例如：王小明, ming@example.com"
        )
      }

      const name = parts[0].trim()
      const email = parts[1].trim()

      // 回覆使用者正在處理
      await ctx.reply("🔍 正在驗證資料並匯入中，請稍候...")

      // 先取出 excelData，避免非同步執行時 userStates 已被刪除
      const excelData = userStates[userId].excelData

      // 背景執行匯入，避免阻塞導致 Timeout
      ;(async () => {
        try {
          // 尋找 Notion User
          const personId = await notionRepo.findUserByEmail(email)
          if (!personId) {
            await ctx.reply(
              `⚠️ 注意：在 Notion 中找不到 Email 為 ${email} 的使用者，將無法標記人員欄位。`
            )
          }

          let successCount = 0
          let duplicateCount = 0
          let errorCount = 0

          for (const record of excelData) {
            const exists = await notionRepo.checkDuplicate(
              personId,
              record.type,
              record.startTime,
              record.endTime
            )

            if (exists) {
              duplicateCount++
              continue
            }

            try {
              await notionRepo.createLeaveRecord({
                name: name,
                type: record.type,
                start: record.startTime,
                end: record.endTime,
                hours: record.hours,
                remark: record.remark,
                personId: personId,
              })
              successCount++
            } catch (err) {
              console.error("Import Record Error:", err)
              errorCount++
            }
          }

          let resultMsg = `✅ 匯入完成！\n成功: ${successCount} 筆\n重複忽略: ${duplicateCount} 筆`
          if (errorCount > 0) resultMsg += `\n失敗: ${errorCount} 筆`

          await ctx.reply(resultMsg)
        } catch (error) {
          console.error("Import Process Error:", error)
          await ctx.reply(`❌ 匯入過程發生錯誤: ${error.message}`)
        }
      })()

      // 清除狀態
      delete userStates[userId]
      return
    }

    // 嘗試解析是否為請假/加班訊息
    const result = await leaveService.processLeaveMessage(text, userId)

    // [NEW] 處理未綁定狀態
    if (result && result.status === "MISSING_MAPPING") {
      userStates[userId] = {
        step: "WAIT_FOR_EMAIL",
        pendingText: text,
      }
      await ctx.reply(
        result.message +
          "\n\n💡 這是您第一次使用，請輸入您的 Notion Email 以完成綁定 (只需設定一次)："
      )
      return
    }

    // [NEW] 處理手動輸入結餘狀態
    if (result && result.status === "WAIT_FOR_BALANCE") {
      userStates[userId] = {
        step: "WAIT_FOR_BALANCE",
        pendingText: text,
      }
      await ctx.reply(result.message)
      return
    }

    if (result) {
      // 1. 回覆使用者 (無論成功或失敗)
      await ctx.reply(result.message)

      // 2. 若成功且有設定群組 ID，則推播通知
      if (result.success && config.telegram.groupId) {
        try {
          const { name, type, hours, startTime, endTime, complianceWarning } =
            result.data
          let notifyText = `📢 出勤異動通知\n\n 申請人：${name}\n 類型：${type}\n 開始：${startTime}\n 結束：${endTime}`

          if (complianceWarning) {
            notifyText += `\n\n${complianceWarning}`
          }

          await ctx.telegram.sendMessage(config.telegram.groupId, notifyText)
          console.log("✅ Group notification sent successfully.")
        } catch (error) {
          console.error("Failed to send group notification:", error)
        }
      }
    }
  },

  /**
   * 處理文件訊息 (Excel)
   */
  async handleDocument(ctx) {
    const doc = ctx.message.document
    const mimeType = doc.mime_type
    const fileName = doc.file_name.toLowerCase()

    // 檢查是否為 Excel
    if (
      mimeType ===
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      mimeType === "application/vnd.ms-excel" ||
      fileName.endsWith(".xlsx") ||
      fileName.endsWith(".xls")
    ) {
      try {
        // 檢查使用者權限 (理論上 middleware 已攔截，但再確認一次 session)
        const user = ctx.session?.user
        if (!user || !user.notionUserId) {
          return ctx.reply("⚠️ 無法識別您的身分，請先完成綁定流程。")
        }

        const fileId = doc.file_id
        const fileLink = await ctx.telegram.getFileLink(fileId)

        // 下載檔案
        const response = await axios({
          url: fileLink.href,
          method: "GET",
          responseType: "arraybuffer",
        })

        // 解析 Excel
        const result = excelService.parseLeaveExcel(response.data)

        if (!result.success) {
          return ctx.reply(`❌ 解析失敗: ${result.error}`)
        }

        const data = result.data
        if (data.length === 0) {
          return ctx.reply("⚠️ 檔案中沒有有效資料。")
        }

        await ctx.reply(
          `📄 收到 ${data.length} 筆資料，正在為 ${user.name} 匯入中...`
        )

        // 執行匯入
        let successCount = 0
        let duplicateCount = 0
        let errorCount = 0

        // 背景執行匯入
        ;(async () => {
          for (const record of data) {
            // 使用 session 中的 user.notionUserId 以及 user.name (或 Excel 內的，但 user 要求只能匯入自己)
            // 強制使用 session user name 覆蓋 record 內的 name (若 excel 沒 name)
            // 或者我們假設 record 內有 name 但我們只用 user's personId tag.
            // 既然 "只能自己匯入自己的資料", 用 user.name 最保險
            const recordName = user.name
            const personId = user.notionUserId

            const exists = await notionRepo.checkDuplicate(
              personId,
              record.type,
              record.startTime,
              record.endTime
            )

            if (exists) {
              duplicateCount++
              continue
            }

            try {
              await notionRepo.createLeaveRecord({
                name: recordName,
                type: record.type,
                start: record.startTime,
                end: record.endTime,
                hours: record.hours,
                remark: record.remark,
                personId: personId,
              })
              successCount++
            } catch (err) {
              console.error("Import Record Error:", err)
              errorCount++
            }
          }

          let resultMsg = `✅ ${user.name} 匯入完成！\n成功: ${successCount} 筆\n重複忽略: ${duplicateCount} 筆`
          if (errorCount > 0) resultMsg += `\n失敗: ${errorCount} 筆`

          await ctx.reply(resultMsg)

          // [NEW] 匯入後提示輸入目前累計時數
          try {
            const balanceData = await notionRepo.getUserTimeBalanceByPersonId(
              user.notionUserId
            )
            if (balanceData.pageId) {
              userStates[ctx.from.id] = {
                step: "WAIT_FOR_BALANCE",
                pageId: balanceData.pageId,
              }
              await ctx.reply(
                "💡 請輸入**目前**的累計時數，以確保後續計算準確："
              )
            }
          } catch (err) {
            console.error("Post-import balance query failed:", err)
          }
        })()
      } catch (error) {
        console.error("Handle Document Error:", error)
        await ctx.reply(`❌ 處理檔案失敗: ${error.message}`)
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
*類型支援：補休、加班、特休、病假、事假...*

**2. 匯入 Excel 檔案**：
直接傳送 Excel 檔案，系統會自動解析並匯入。
格式為：
\`\`\`
加班或補修/說明/起始時間/結束時間/時數(小時)/累計時數
\`\`\`
其中加班或補修的值為：加班或補休
加班或補修/起始時間/結束時間，是必填欄位，不得為空白
時數要是正數且是0.5倍數

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

**提醒**：請假整天請勿填寫時間，避免時數計算錯誤 (直接填寫日期即可)
\`\`\`
姓名: 王小明
類型: 補休
開始時間: 2026-01-20
結束時間: 2026-01-20
\`\`\`

**常用指令**：
- /help - 顯示說明
- /format - 快速複製紀錄格式
- /balance - 查詢剩餘補休
      `
    await ctx.replyWithMarkdown(helpText)
  },

  /**
   * 處理 /getid 指令
   * 用於取得當前聊天室 ID (個人或群組)
   */
  async handleGetIdCommand(ctx) {
    const chatId = ctx.chat.id
    const title = ctx.chat.title || ctx.chat.first_name || "此聊天室"
    await ctx.reply(`🆔 **${title}** 的 ID 是：\n\`${chatId}\``, {
      parse_mode: "Markdown",
    })
  },

  /**
   * 測試排程通知 (手動觸發)
   */
  async handleTestCronCommand(ctx) {
    if (!config.telegram.groupId) {
      return ctx.reply("❌ 尚未設定群組 ID (TELEGRAM_GROUP_ID)，無法測試。")
    }

    await ctx.reply("🚀 正在發送測試通知到群組...")

    try {
      // 模擬每月 15 號
      await ctx.telegram.sendMessage(
        config.telegram.groupId,
        "🔔 [測試] 請於21號以前完成前一個月Mynote工作記錄及納管專案工項的進度回報，以利後續作業，感恩大家。\n\n例如：02/21 需完成 01/21 ~ 02/20 Mynote 工作紀錄。"
      )

      // 模擬每月 20 號
      await ctx.telegram.sendMessage(
        config.telegram.groupId,
        "🔔 [測試] 大家早安！今天是 20 號，記得寫 Mynote 喔！"
      )

      // 模擬週一
      await ctx.telegram.sendMessage(
        config.telegram.groupId,
        "🔔 [測試] 大家早安！又是新的一週，記得寫 Mynote 喔！"
      )

      // 模擬每日請假通知
      const today = new Date().toISOString().split("T")[0]
      await ctx.telegram.sendMessage(
        config.telegram.groupId,
        `📅 **${today} 出勤異動名單**：\n1. 測試人員 測試假 (09:00~18:00)`,
        { parse_mode: "Markdown" }
      )

      await ctx.reply("✅ 測試通知已發送！")
    } catch (error) {
      console.error("Test Cron Error:", error)
      await ctx.reply(`❌ 發送失敗: ${error.message}`)
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
      `
    await ctx.reply(formatText, { parse_mode: "Markdown" })
  },

  /**
   * 處理 /balance 指令
   * 查詢個人結餘
   */
  async handleMyBalanceCommand(ctx) {
    try {
      // 檢查登入狀態
      const user = ctx.session?.user
      if (!user || !user.notionUserId) {
        return ctx.reply(
          "⚠️ 您尚未綁定或資料未同步，無法查詢結餘。\n請輸入您的員工編號以完成綁定。"
        )
      }

      // 呼叫 Repo 查詢 (使用新的 Person ID 方法)
      const balanceData = await notionRepo.getUserTimeBalanceByPersonId(
        user.notionUserId
      )

      if (balanceData.requireManualBalance) {
        userStates[ctx.from.id] = {
          step: "WAIT_FOR_BALANCE",
          pageId: balanceData.pageId,
          // 沒有 pendingText 代表只是純查詢
        }
        return ctx.reply(
          "⚠️ 系統無法計算您的累計時數。\n請輸入您**目前**的累計時數："
        )
      }

      const msg =
        `💰 **${user.name} 的補休結餘**\n\n` + `**${balanceData.balance}** 小時`

      await ctx.reply(msg, { parse_mode: "Markdown" })
    } catch (error) {
      console.error("Balance Command Error:", error)
      await ctx.reply(`❌ 查詢失敗: ${error.message}`)
    }
  },
  userStates,
}

module.exports = botController
