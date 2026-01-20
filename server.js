const { Telegraf } = require('telegraf');
const http = require('http');

// 強制設定時區 (必須在最前面)
process.env.TZ = "Asia/Taipei";

const config = require('./config/config');
const botController = require('./controllers/botController');
const schedulerService = require('./services/schedulerService');

// 檢查 Token
if (!config.telegram.botToken) {
  console.error('❌ 錯誤: 未設定 TELEGRAM_BOT_TOKEN。請檢查 .env 檔案。');
  process.exit(1);
}

const bot = new Telegraf(config.telegram.botToken);

// Error Handling
bot.catch((err, ctx) => {
  console.error(`Ooops, encountered an error for ${ctx.updateType}`, err);
});

// Middleware: Log messages (Optional)
// bot.use(async (ctx, next) => {
//   const start = new Date();
//   await next();
//   const ms = new Date() - start;
//   console.log('Response time: %sms', ms);
// });

// 指令註冊
bot.command('start', botController.handleHelpCommand);
bot.command('help', botController.handleHelpCommand);
bot.command('format', botController.handleFormatCommand);
bot.command('getid', botController.handleGetIdCommand);
bot.command('testcron', botController.handleTestCronCommand);

// 訊息監聽 (放在最後，避免攔截指令)
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

// 優雅停機
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
