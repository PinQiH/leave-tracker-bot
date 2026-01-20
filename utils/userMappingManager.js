const fs = require('fs');
const path = require('path');

const MAPPING_FILE = path.join(__dirname, '../data/userMapping.json');

const userMappingManager = {
    /**
     * 讀取所有對照資料
     */
    _readMapping() {
        try {
            if (!fs.existsSync(MAPPING_FILE)) {
                return {};
            }
            const data = fs.readFileSync(MAPPING_FILE, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            console.error('Core:Failed to read user mapping:', error);
            return {};
        }
    },

    /**
     * 寫入對照資料
     */
    _writeMapping(data) {
        try {
            // 確保目錄存在
            const dir = path.dirname(MAPPING_FILE);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(MAPPING_FILE, JSON.stringify(data, null, 2), 'utf8');
        } catch (error) {
            console.error('Core:Failed to write user mapping:', error);
        }
    },

    /**
     * 根據 Telegram User ID 取得 Notion Email
     * @param {string|number} userId 
     * @returns {string|null} email
     */
    getEmail(userId) {
        const mapping = this._readMapping();
        return mapping[String(userId)] || null;
    },

    /**
     * 設定 Telegram User ID 與 Notion Email 的對照
     * @param {string|number} userId 
     * @param {string} email 
     */
    setEmail(userId, email) {
        const mapping = this._readMapping();
        mapping[String(userId)] = email;
        this._writeMapping(mapping);
    }
};

module.exports = userMappingManager;
