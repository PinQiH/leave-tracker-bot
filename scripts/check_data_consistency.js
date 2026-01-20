const axios = require('axios');
const config = require('../config/config');
require('dotenv').config();

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const CONTACT_DB_ID = process.env.NOTION_CONTACT_DATABASE_ID;
const LEAVE_DB_ID = config.notion.databaseId;

const notionApi = axios.create({
    baseURL: 'https://api.notion.com/v1',
    headers: {
        'Authorization': `Bearer ${NOTION_TOKEN}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
    }
});

async function checkConsistency() {
    console.log('--- Checking Data Consistency ---');
    
    // 1. Fetch Contact DB to get mapping of Name -> Person ID (Real) vs Notion_ID (Stored Text)
    const contacts = {};
    try {
        const response = await notionApi.post(`/databases/${CONTACT_DB_ID}/query`, {});
        response.data.results.forEach(page => {
            const name = page.properties['姓名']?.title?.[0]?.plain_text || 'Unknown';
            const realPersonId = page.properties['Person']?.people?.[0]?.id || 'Missing';
            const storedNotionId = page.properties['Notion_ID']?.rich_text?.[0]?.plain_text || 'Missing';
            contacts[name] = { realPersonId, storedNotionId };
        });
    } catch (e) {
        console.error('Error fetching contacts:', e.message);
    }

    console.log('\n--- Contact Database Users ---');
    console.table(contacts);

    // 2. Fetch Leave DB Records (Sample) and see what Person ID is actually there
    console.log('\n--- Leave Database Samples (Overtime) ---');
    try {
        const response = await notionApi.post(`/databases/${LEAVE_DB_ID}/query`, {
            page_size: 50,
            filter: {
                property: '類型',
                select: {
                    equals: '加班'
                }
            }
        });
        
        const samples = [];
        response.data.results.forEach(page => {
            const name = page.properties['姓名']?.title?.[0]?.plain_text || 'Unknown';
            const personId = page.properties['人員']?.people?.[0]?.id || 'Missing';
            
            // Only show if we found a person tag
            if (personId !== 'Missing') {
                 // Check if this matches what we know
                 const contact = contacts[name];
                 let status = 'UNKNOWN USER';
                 if (contact) {
                     if (contact.realPersonId === personId && contact.storedNotionId === personId) {
                         status = 'OK';
                     } else {
                         status = 'MISMATCH!';
                         if (contact.realPersonId !== personId) status += ` (Diff from Contact DB Person: ${contact.realPersonId})`;
                         if (contact.storedNotionId !== personId) status += ` (Diff from Stored ID: ${contact.storedNotionId})`;
                     }
                 }
                 samples.push({ name, leaveRecordPersonId: personId, status });
            }
        });
        
        console.table(samples);
        
    } catch (e) {
        console.error('Error fetching leaves:', e.message);
    }
}

checkConsistency();
