const { Telegraf, session } = require('telegraf');
const http = require('http');

// 強制設定時區 (必須在最前面)
process.env.TZ = "Asia/Taipei";

const config = require('./config/config');
const botController = require('./controllers/botController');
const schedulerService = require('./services/schedulerService');
const authService = require('./services/authService');

// 檢查 Token
if (!config.telegram.botToken) {
  console.error('❌ 錯誤: 未設定 TELEGRAM_BOT_TOKEN。請檢查 .env 檔案。');
  process.exit(1);
}

const bot = new Telegraf(config.telegram.botToken);

// Session middleware for state management
bot.use(session());

// Error Handling
bot.catch((err, ctx) => {
  console.error(`Ooops, encountered an error for ${ctx.updateType}`, err);
  ctx.reply('系統發生錯誤，請稍後再試。').catch(e => console.error('Failed to reply error', e));
});

// Middleware: Authentication & Binding
bot.use(async (ctx, next) => {
    // 忽略非訊息或非來自使用者的更新
    if (!ctx.from || !ctx.message) {
        return next();
    }

    const tgId = ctx.from.id;
    
    // 1. 初始化 session
    if (!ctx.session) ctx.session = {};

    // 2. 檢查是否在綁定流程中 (等待輸入員工編號)
    if (ctx.session.waitingForEmpId) {
        const empId = ctx.message.text.trim();
        
        // 簡單驗證輸入是否為數字
        if (!/^\d+$/.test(empId)) {
            return ctx.reply('⚠️ 員工編號應為數字，請重新輸入。');
        }

        try {
            const user = await authService.findUserByEmployeeId(empId);
            
            if (user) {
                // 如果已經綁定過其他 TG ID，提示一下 (或直接覆蓋，看需求，這邊選擇覆蓋)
                if (user.currentTgId && user.currentTgId !== String(tgId)) {
                   await ctx.reply(`⚠️ 此員工編號先前已綁定其他 Telegram ID (${user.currentTgId})，將更新為此帳號。`);
                }

                await authService.bindTelegramId(user.id, tgId);
                ctx.session.waitingForEmpId = false; // 清除狀態
                // 更新 session 中的 user cache (若有的話)
                ctx.session.user = { id: user.id, name: user.name, employeeId: empId };
                
                await ctx.reply(`🎉 綁定成功！\n你好，${user.name}。現在您可以開始使用 Bot 服務了。`);
                
                // 檢查是否有暫存的原始請求
                if (ctx.session.originalRequest) {
                    const originalText = ctx.session.originalRequest;
                    delete ctx.session.originalRequest; // 清除暫存

                    // 將目前的訊息內容替換為原始請求，讓後續的 middleware 處理
                    ctx.message.text = originalText;
                    
                    // 提示使用者
                    await ctx.reply(`🔄 正在繼續執行您原本的請求：${originalText}`);
                } else {
                    // 若無原始請求，則不需做額外處理，下層 middleware 會收到 "員工編號" 的訊息 (這通常會被忽略或視為無效指令)
                    // 為了避免機器人對員工編號做出奇怪回應，這邊可以選擇不 call next()，或者 call next() 但讓 controller 決定
                    // 這裡改為直接 return，除非有 pending request 才 next
                    return; 
                }

                return next(); 

            } else {
                return ctx.reply('❌ 找不到此員工編號，請確認後重新輸入，或聯繫管理員。');
            }
        } catch (error) {
            console.error('Auth Error:', error);
            return ctx.reply('系統查詢失敗，請稍後再試。');
        }
    }

    // 3. 檢查是否已認證
    if (ctx.session.user) {
        return next();
    }

    // 4. 若 session 無資訊，查詢 Notion
    try {
        const user = await authService.checkUserByTelegramId(tgId);
        
        if (user) {
            // 已綁定，寫入 session cache
            ctx.session.user = user;
            return next();
        } else {
            // 未綁定 -> 進入綁定流程
            ctx.session.waitingForEmpId = true;
            
            // 暫存使用者的原始請求 (除了 /start 以外)
            if (ctx.message.text && ctx.message.text !== '/start') {
                ctx.session.originalRequest = ctx.message.text;
            }

            await ctx.reply(`👋 您好，歡迎使用。\n\n請輸入您的「員工編號」進行綁定：`);
            // 中斷後續 middleware (controller) 執行
            return;
        }

    } catch (error) {
        console.error('Auth Check Error:', error);
        return ctx.reply('系統驗證過程發生錯誤，請稍後再試。');
    }
});

// 指令註冊
bot.command('start', botController.handleHelpCommand);
bot.command('help', botController.handleHelpCommand);
bot.command('format', botController.handleFormatCommand);
bot.command('getid', botController.handleGetIdCommand);
bot.command('testcron', botController.handleTestCronCommand);

// 訊息監聽 (放在最後，避免攔截指令)
bot.on('text', botController.handleMessage);
bot.on('document', botController.handleDocument);

// 啟動 Bot
console.log('🚀 Telegram Bot 啟動中...');

// User request: 立即顯示成功訊息並啟動排程，不等待 launch Promise
console.log('✅ Bot 已連線並開始監聽訊息。');
schedulerService.init(bot);

bot.launch().catch((err) => {
    console.error('❌ Bot 啟動失敗:', err);
});

//優雅停機
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

// 建立 HTTP Server 以符合 Render 的 Port 監聽要求
const port = process.env.PORT || 8080;
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot is alive');
});

server.listen(port, () => {
    console.log(`Web Server running on port ${port}`);
});
