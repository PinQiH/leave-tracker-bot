const notionRepo = require('../repository/notionRepo');
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


async function testPagination() {
    const personId = '98257844-8a8d-46ef-a2fd-4b7b91144ef4'; // Cassie
    console.log(`Checking pagination for ID: ${personId}`);

    try {
        const response = await notionApi.post(`/databases/${LEAVE_DB_ID}/query`, {
             filter: {
                and: [
                    {
                        property: '人員',
                        people: {
                            contains: personId
                        }
                    },
                    {
                    or: [
                        {
                        property: '類型',
                        select: {
                            equals: '加班',
                        },
                        },
                        {
                        property: '類型',
                        select: {
                            equals: '補休',
                        },
                        },
                    ],
                    },
                ],
            }
        });

        const results = response.data.results;
        console.log(`Returned Count: ${results.length}`);
        console.log(`Has More: ${response.data.has_more}`);
        
        let overtimeCount = 0;
        let compCount = 0;
        results.forEach(p => {
            const t = p.properties['類型']?.select?.name;
            if (t === '加班') overtimeCount++;
            if (t === '補休') compCount++;
        });
        
        console.log(`Overtime Records: ${overtimeCount}`);
        console.log(`Compensatory Records: ${compCount}`);

    } catch (error) {
        console.error('Error:', error.response?.data || error.message);
    }
}

testPagination();
