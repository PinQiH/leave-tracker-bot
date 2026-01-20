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

/**
 * 透過 Telegram ID 檢查使用者是否存在
 * @param {string} tgId 
 * @returns {Promise<object|null>} 回傳使用者資料或是 null
 */
async function checkUserByTelegramId(tgId) {
    if (!NOTION_TOKEN || !DATABASE_ID) {
        throw new Error('Missing NOTION_TOKEN or NOTION_CONTACT_DATABASE_ID');
    }

    try {
        const response = await notionApi.post(`/databases/${DATABASE_ID}/query`, {
            filter: {
                property: 'TG_ID',
                rich_text: {
                    equals: String(tgId)
                }
            }
        });

        if (response.data.results.length > 0) {
            const page = response.data.results[0];
            return {
                id: page.id,
                name: page.properties['姓名']?.title?.[0]?.plain_text || 'Unknown',
                employeeId: page.properties['員工編號']?.number,
                notionUserId: page.properties['Notion_ID']?.rich_text?.[0]?.plain_text
            };
        }
        return null;
    } catch (error) {
        console.error('Error in checkUserByTelegramId:', error.response?.data || error.message);
        throw error;
    }
}

/**
 * 透過員工編號搜尋使用者
 * @param {string|number} employeeId 
 * @returns {Promise<object|null>} 回傳使用者資料或是 null
 */
async function findUserByEmployeeId(employeeId) {
    if (!NOTION_TOKEN || !DATABASE_ID) {
        throw new Error('Missing NOTION_TOKEN or NOTION_CONTACT_DATABASE_ID');
    }

    try {
        const response = await notionApi.post(`/databases/${DATABASE_ID}/query`, {
            filter: {
                property: '員工編號',
                number: {
                    equals: Number(employeeId)
                }
            }
        });

        if (response.data.results.length > 0) {
            const page = response.data.results[0];
            return {
                id: page.id,
                name: page.properties['姓名']?.title?.[0]?.plain_text || 'Unknown',
                currentTgId: page.properties['TG_ID']?.rich_text?.[0]?.plain_text,
                notionUserId: page.properties['Notion_ID']?.rich_text?.[0]?.plain_text
            };
        }
        return null;
    } catch (error) {
        console.error('Error in findUserByEmployeeId:', error.response?.data || error.message);
        throw error;
    }
}

/**
 * 綁定 Telegram ID 到該使用者
 * @param {string} pageId 
 * @param {string} tgId 
 * @returns {Promise<boolean>}
 */
async function bindTelegramId(pageId, tgId) {
    try {
        await notionApi.patch(`/pages/${pageId}`, {
            properties: {
                'TG_ID': {
                    rich_text: [
                        {
                            text: {
                                content: String(tgId)
                            }
                        }
                    ]
                }
            }
        });
        return true;
    } catch (error) {
        console.error('Error in bindTelegramId:', error.response?.data || error.message);
        throw error;
    }
}

module.exports = {
    checkUserByTelegramId,
    findUserByEmployeeId,
    bindTelegramId
};
