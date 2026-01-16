# Telegram Bot with Notion Integration

這個專案是一個 Telegram 機器人，用於協助團隊進行請假登記與加班時數統計，並將資料整合至 Notion Database。

## 功能特色

1. **請假記錄**：接收特定格式的請假訊息，自動計算時數並寫入 Notion。
2. **加班統計**：提供指令查詢個人或全員的加班統計資料。
3. **自動提醒**：定時發送 Mynote 填寫提醒至群組 (每週一、每月 15/20 號)。

## 開始使用

### 1. 環境設定

請確保 `.env` 檔案已正確設定：

```env
TELEGRAM_BOT_TOKEN=你的_Bot_Token
NOTION_TOKEN=你的_Integration_Secret
NOTION_DATABASE_ID=你的_Database_ID
TELEGRAM_GROUP_ID=你的_Telegram_Group_ID
```

### 2. 資料庫設定 (Notion)

您的 Notion Database 需包含以下欄位：

- **姓名** (Title)
- **類型** (Select): 補休, 加班, 其他假別
- **開始時間** (Date)
- **結束時間** (Date)
- **時數** (Number)
- **備註** (Text)

### 3. 啟動機器人

```bash
npm start
# 或
node server.js
```

## 指令說明

### 📝 新增請假/加班記錄

直接在聊天室傳送以下格式訊息（支援 `：` 全形冒號）：

```text
姓名: 王小明
類型: 加班
開始時間: 2026-01-20 18:00
結束時間: 2026-01-20 20:00
```

> 機器人會自動計算 `結束時間 - 開始時間` 的時數並回覆確認。

### 📊 查詢統計

- `/stats`：查詢目前 Database 中所有類型為「加班」的總時數。
- `/stats 王小明`：查詢特定人員的加班總時數。

### ℹ️ 其他指令

- `/help`：顯示使用說明。

## 開發結構

- `server.js`: 程式入口與 Bot 設定
- `services/leaveService.js`: 核心邏輯 (格式解析、時數計算)
- `repository/notionRepo.js`: Notion API 串接
- `controllers/botController.js`: 處理 Telegram 事件
