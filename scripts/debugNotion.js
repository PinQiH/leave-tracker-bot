require('dotenv').config();
const { Client } = require('@notionhq/client');

const notion = new Client({
    auth: process.env.NOTION_TOKEN,
});

async function debug() {
    console.log('notion.databases keys:', Object.keys(notion.databases));
    console.log('Type of notion.databases.query:', typeof notion.databases.query);
    console.log('Type of notion.databases.retrieve:', typeof notion.databases.retrieve);
}

debug();
