const { Telegraf, session } = require("telegraf")
const http = require("http")

// 強制設定時區 (必須在最前面)
process.env.TZ = "Asia/Taipei"

const config = require("./config/config")
const botController = require("./controllers/botController")
const { userStates } = botController
const schedulerService = require("./services/schedulerService")
const authService = require("./services/authService")

// 檢查 Token
if (!config.telegram.botToken) {
  console.error("❌ 錯誤: 未設定 TELEGRAM_BOT_TOKEN。請檢查 .env 檔案。")
  process.exit(1)
}

const bot = new Telegraf(config.telegram.botToken)

// Session middleware for state management
bot.use(session())

// Error Handling
bot.catch((err, ctx) => {
  console.error(`Ooops, encountered an error for ${ctx.updateType}`, err)
  ctx
    .reply("系統發生錯誤，請稍後再試。")
    .catch((e) => console.error("Failed to reply error", e))
})

// Middleware: Authentication & Binding
// Middleware: Authentication & Binding
bot.use(async (ctx, next) => {
  // 忽略非訊息或非來自使用者的更新
  if (!ctx.from || !ctx.message) {
    return next()
  }

  const tgId = ctx.from.id

  // 0. 檢查是否在群組中，如果是則提示改用私訊
  if (
    ctx.chat &&
    (ctx.chat.type === "group" || ctx.chat.type === "supergroup")
  ) {
    try {
      const botInfo = await ctx.telegram.getMe()
      await ctx.reply(
        "👋 請改用 <b>私訊</b> 與 Bot 互動。\n\n" +
          `點擊 <a href="https://t.me/${botInfo.username}">這裡</a> 或直接搜尋我的帳號，開始私訊。`,
        { parse_mode: "HTML" }
      )
    } catch (e) {
      // 如果回覆失敗 (如群組已升級或權限不足)，直接記錄並返回，避免多次嘗試
      console.warn(`[Group Check] Failed to reply in group ${ctx.chat.id}:`, e.message)
    }
    return
  }

  // 1. 初始化 session
  if (!ctx.session) ctx.session = {}

  // 2. 檢查是否在綁定流程中 (等待輸入員工編號)
  if (ctx.session.waitingForEmpId) {
    const empId = ctx.message.text.trim()

    // 簡單驗證輸入是否為數字
    if (!/^\d+$/.test(empId)) {
      return ctx.reply("⚠️ 員工編號應為數字，請重新輸入。")
    }

    try {
      const user = await authService.findUserByEmployeeId(empId)

      if (user) {
        // 檢查該員工是否有因為離職或其他原因，導致無效 (例如缺 Notion ID)
        if (!user.notionUserId) {
          return ctx.reply(
            "❌ 您的員工資料不完整，無法啟用服務。請聯繫管理員。"
          )
        }

        // 如果已經綁定過其他 TG ID，提示一下 (或直接覆蓋，看需求，這邊選擇覆蓋)
        if (user.currentTgId && user.currentTgId !== String(tgId)) {
          await ctx.reply(
            `⚠️ 此員工編號先前已綁定其他 Telegram ID (${user.currentTgId})，將更新為此帳號。`
          )
        }

        await authService.bindTelegramId(user.id, tgId)
        ctx.session.waitingForEmpId = false // 清除狀態
        ctx.session.user = user

        await ctx.reply(
          `🎉 綁定成功！\n你好，${user.name}。現在您可以開始使用 Bot 服務了。`
        )

        // 檢查是否有暫存的原始請求
        if (ctx.session.originalRequest) {
          const originalText = ctx.session.originalRequest
          delete ctx.session.originalRequest // 清除暫存

          // 清除 userStates 中的等待狀態 (避免干擾新請求的處理)
          delete userStates[tgId]

          ctx.message.text = originalText
          await ctx.reply(`🔄 正在繼續執行您原本的請求：${originalText}`)
        } else {
          return
        }
        return next()
      } else {
        return ctx.reply(
          "❌ 找不到此員工編號，請確認後重新輸入，或聯繫管理員。"
        )
      }
    } catch (error) {
      console.error("Auth Error:", error)
      return ctx.reply("系統查詢失敗，請稍後再試。")
    }
  }

  // 3. 即時權限驗證 (Real-time Auth Check)
  // 為了確保離職後立即失效，我們每次都檢查 Notion 狀態，而非僅依賴 session cache
  try {
    const user = await authService.checkUserByTelegramId(tgId)

    if (user && user.notionUserId) {
      // 已驗證且資料完整
      ctx.session.user = user // 更新 session 以供 controller 使用
      return next()
    } else {
      // 驗證失敗 (Notion 找不到人，或被移除，或無 Notion ID)
      // 若 session 曾經有 user，代表被移除了
      if (ctx.session.user) {
        delete ctx.session.user
        await ctx.reply("⚠️ 您的帳號權限已失效，無法繼續使用。請聯繫管理員。")
        return // 阻止後續執行
      }

      // 若本來就沒登入 -> 進入綁定流程
      ctx.session.waitingForEmpId = true

      // 暫存使用者的原始請求
      if (ctx.message.text && ctx.message.text !== "/start") {
        ctx.session.originalRequest = ctx.message.text
      }

      await ctx.reply(`👋 您好，歡迎使用。\n\n請輸入您的「員工編號」進行綁定：`)
      return
    }
  } catch (error) {
    console.error("Auth Check Error:", error)
    // 若 API 錯誤 (如 Notion 掛掉)，暫時寬容或是嚴格阻擋?
    // 嚴格阻擋：
    return ctx.reply("系統驗證過程發生錯誤，請稍後再試。")
  }
})

// 指令註冊
bot.command("start", botController.handleHelpCommand)
bot.command("help", botController.handleHelpCommand)
bot.command("format", botController.handleFormatCommand)
bot.command("getid", botController.handleGetIdCommand)
bot.command("testcron", botController.handleTestCronCommand)
bot.command("testtyphoon", botController.handleTestTyphoonCommand)
bot.command("balance", botController.handleMyBalanceCommand)

// 訊息監聽 (放在最後，避免攔截指令)
bot.on("text", botController.handleMessage)
bot.on("document", botController.handleDocument)

// 啟動 Bot
console.log("🚀 Telegram Bot 啟動中...")

// User request: 立即顯示成功訊息並啟動排程，不等待 launch Promise
console.log("✅ Bot 已連線並開始監聽訊息。")
schedulerService.init(bot)

bot.launch().catch((err) => {
  console.error("❌ Bot 啟動失敗:", err)
})

//優雅停機
process.once("SIGINT", () => bot.stop("SIGINT"))
process.once("SIGTERM", () => bot.stop("SIGTERM"))

// 建立 HTTP Server 以符合 Render 的 Port 監聽要求
const port = process.env.PORT || 8080
const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" })
  res.end("Bot is alive")
})

server.listen(port, () => {
  console.log(`Web Server running on port ${port}`)
})
