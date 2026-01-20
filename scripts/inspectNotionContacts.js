require('dotenv').config();
const axios = require('axios');

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const DATABASE_ID = process.env.NOTION_CONTACT_DATABASE_ID;

async function inspectDatabase() {
    if (!NOTION_TOKEN || !DATABASE_ID) {
        console.error('❌ Error: Missing NOTION_TOKEN or NOTION_CONTACT_DATABASE_ID in .env');
        return;
    }

    try {
        console.log(`🔍 Inspecting Database: ${DATABASE_ID}...`);
        
        const response = await axios.post(
            `https://api.notion.com/v1/databases/${DATABASE_ID}/query`,
            { page_size: 5 },
            {
                headers: {
                    'Authorization': `Bearer ${NOTION_TOKEN}`,
                    'Notion-Version': '2022-06-28',
                    'Content-Type': 'application/json'
                }
            }
        );

        const results = response.data.results;
        console.log(`✅ Connection Successful! Found ${results.length} records (showing first 5).`);

        if (results.length > 0) {
             // Extract keys from the first result to show schema
            console.log('\n📊 Database Properties (Schema):');
            Object.keys(results[0].properties).forEach(key => {
                const type = results[0].properties[key].type;
                console.log(`- ${key} [${type}]`);
            });
        }

        results.forEach((page, index) => {
            console.log(`\n--- Record #${index + 1} ---`);
            const props = {};
            
            for (const [key, value] of Object.entries(page.properties)) {
                let content = 'Unknown';
                 try {
                    switch (value.type) {
                        case 'title':
                            content = value.title?.map(t => t.plain_text).join('') || '';
                            break;
                        case 'rich_text':
                            content = value.rich_text?.map(t => t.plain_text).join('') || '';
                            break;
                        case 'email':
                            content = value.email;
                            break;
                        case 'phone_number':
                            content = value.phone_number;
                            break;
                        case 'number':
                            content = value.number;
                            break;
                        case 'select':
                            content = value.select?.name || '';
                            break;
                        case 'multi_select':
                            content = value.multi_select?.map(o => o.name).join(', ') || '';
                            break;
                        case 'people':
                            content = value.people?.map(p => `${p.name} (ID: ${p.id})`).join(', ') || '';
                            // console.log('Full Person Object:', JSON.stringify(value.people, null, 2)); // Uncomment to see full structure
                            break;
                         case 'date':
                            content = value.date ? `${value.date.start}` : '';
                            break;
                        case 'url':
                            content = value.url;
                            break;
                        case 'files':
                            content = `(Files: ${value.files?.length})`;
                            break;
                        default:
                            content = `[${value.type}]`;
                    }
                } catch (e) {
                    content = 'Error parsing';
                }
                props[key] = content;
            }
            console.table(props);
        });

    } catch (error) {
        console.error('❌ Error fetching data:', error.response?.data || error.message);
    }
}

inspectDatabase();
