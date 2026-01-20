require('dotenv').config();
const axios = require('axios');

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const DATABASE_ID = process.env.NOTION_CONTACT_DATABASE_ID;

const notionApi = axios.create({
    baseURL: 'https://api.notion.com/v1',
    headers: {
        'Authorization': `Bearer ${NOTION_TOKEN}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
    }
});

async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function syncNotionIds() {
    if (!NOTION_TOKEN || !DATABASE_ID) {
        console.error('❌ Error: Missing NOTION_TOKEN or NOTION_CONTACT_DATABASE_ID');
        return;
    }

    try {
        console.log(`fetching pages from database: ${DATABASE_ID}...`);
        
        let hasMore = true;
        let startCursor = undefined;
        let pages = [];

        // 1. Fetch all pages
        while (hasMore) {
            const response = await notionApi.post(`/databases/${DATABASE_ID}/query`, {
                page_size: 100,
                start_cursor: startCursor
            });
            
            pages = pages.concat(response.data.results);
            hasMore = response.data.has_more;
            startCursor = response.data.next_cursor;
        }

        console.log(`✅ Found ${pages.length} pages. Starting update...`);

        // 2. Iterate and update
        let updatedCount = 0;
        let skippedCount = 0;

        for (const page of pages) {
            const personField = page.properties['Person'];
            const notionIdField = page.properties['Notion_ID'];
            const nameField = page.properties['姓名']; // For logging

            const name = nameField?.title?.[0]?.plain_text || 'Unknown Name';
            
            // Check if Person field has data
            if (personField && personField.people && personField.people.length > 0) {
                const userId = personField.people[0].id;
                const currentNotionId = notionIdField?.rich_text?.[0]?.plain_text;

                if (currentNotionId === userId) {
                    console.log(`⏭️  Skipping ${name}: Notion_ID already matches (${userId})`);
                    skippedCount++;
                    continue;
                }

                console.log(`🔄 Updating ${name}: Setting Notion_ID to ${userId}...`);

                // Update the page
                try {
                    await notionApi.patch(`/pages/${page.id}`, {
                        properties: {
                            'Notion_ID': {
                                rich_text: [
                                    {
                                        text: {
                                            content: userId
                                        }
                                    }
                                ]
                            }
                        }
                    });
                    console.log(`   ✅ Success`);
                    updatedCount++;
                    // Rate limit protection
                    await delay(350); 
                } catch (updateError) {
                    console.error(`   ❌ Failed to update ${name}:`, updateError.response?.data?.message || updateError.message);
                }
            } else {
                console.log(`⚠️  Skipping ${name}: No Person assigned`);
                skippedCount++;
            }
        }

        console.log(`\n🎉 Sync Complete!`);
        console.log(`   Updated: ${updatedCount}`);
        console.log(`   Skipped: ${skippedCount}`);

    } catch (error) {
        console.error('❌ Fatal Error:', error.response?.data || error.message);
    }
}

syncNotionIds();
