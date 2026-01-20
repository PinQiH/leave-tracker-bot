const axios = require('axios');
const config = require('../config/config');
require('dotenv').config();

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const LEAVE_DB_ID = config.notion.databaseId;

const notionApi = axios.create({
    baseURL: 'https://api.notion.com/v1',
    headers: {
        'Authorization': `Bearer ${NOTION_TOKEN}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
    }
});

async function checkMissingPerson() {
    console.log(`Checking Leave Database ID: ${LEAVE_DB_ID}`);

    try {
        let hasMore = true;
        let startCursor = undefined;
        let totalRecords = 0;
        let missingPersonCount = 0;
        let sampleMissing = [];

        while (hasMore) {
            const response = await notionApi.post(`/databases/${LEAVE_DB_ID}/query`, {
                page_size: 100,
                start_cursor: startCursor
            });

            const results = response.data.results;

            results.forEach(page => {
                totalRecords++;
                const person = page.properties['人員']?.people;
                const name = page.properties['姓名']?.title?.[0]?.plain_text || 'Unknown';
                
                if (!person || person.length === 0) {
                    missingPersonCount++;
                    if (sampleMissing.length < 5) {
                        sampleMissing.push({ id: page.id, name: name, date: page.properties['開始時間']?.date?.start });
                    }
                }
            });

            hasMore = response.data.has_more;
            startCursor = response.data.next_cursor;
        }

        console.log('------------------------------------------------');
        console.log(`Total Records Scanned: ${totalRecords}`);
        console.log(`Records MISSING Person Tag: ${missingPersonCount}`);
        console.log('------------------------------------------------');
        if (sampleMissing.length > 0) {
            console.log('Sample Records without Person Tag:');
            sampleMissing.forEach(r => console.log(`- [${r.name}] Date: ${r.date} (ID: ${r.id})`));
        }

    } catch (error) {
        console.error('Error:', error.response?.data || error.message);
    }
}

checkMissingPerson();
