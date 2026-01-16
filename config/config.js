require("dotenv").config();

module.exports = {
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN ? process.env.TELEGRAM_BOT_TOKEN.trim() : '',
    groupId: process.env.TELEGRAM_GROUP_ID ? process.env.TELEGRAM_GROUP_ID.trim() : '',
  },
  notion: {
    token: process.env.NOTION_TOKEN ? process.env.NOTION_TOKEN.trim() : '',
    databaseId: process.env.NOTION_DATABASE_ID ? process.env.NOTION_DATABASE_ID.trim() : '',
  },
};
