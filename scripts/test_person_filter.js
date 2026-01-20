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

async function testPersonFilter() {
    const personId = '98257844-8a8d-46ef-a2fd-4b7b91144ef4'; // Cassie
    console.log(`Testing Filter Person contains: ${personId}`);

    try {
        const response = await notionApi.post(`/databases/${LEAVE_DB_ID}/query`, {
             filter: {
                property: '人員',
                people: {
                    contains: personId
                }
             }
        });

        const results = response.data.results;
        console.log(`Returned Count: ${results.length}`);
        
        const counts = {};
        results.forEach(p => {
            const t = p.properties['類型']?.select?.name || 'Unknown';
            counts[t] = (counts[t] || 0) + 1;
        });
        console.log('Counts by Type:', counts);

    } catch (error) {
        console.error('Error:', error.response?.data || error.message);
    }
}

testPersonFilter();
