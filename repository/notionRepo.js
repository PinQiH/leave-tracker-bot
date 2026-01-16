const { Client } = require('@notionhq/client');
const config = require('../config/config');

// 初始化 Notion Client
const notion = new Client({ 
    auth: config.notion.token,
    notionVersion: '2022-06-28' // 強制指定穩定版本，解決 5.7.0 預設版本問題
});
const databaseId = config.notion.databaseId;

const notionRepo = {
  /**
   * 新增請假/加班記錄
   * @param {Object} data - { name, type, start, end, hours, remark }
   */
  async createLeaveRecord({ name, type, start, end, hours, remark }) {
    try {
      const response = await notion.pages.create({
        parent: { database_id: databaseId },
        properties: {
          '姓名': {
            title: [
              {
                text: {
                  content: name,
                },
              },
            ],
          },
          '類型': {
            select: {
              name: type,
            },
          },
          '開始時間': {
            date: {
              start: start,
            },
          },
          '結束時間': {
            date: {
              start: end,
            },
          },
          '時數': {
            number: hours,
          },
          '備註': {
            rich_text: [
              {
                text: {
                  content: remark || '',
                },
              },
            ],
          },
        },
      });
      return response;
    } catch (error) {
      console.error('Notion Create Error:', error);
      throw error;
    }
  },

  /**
   * 查詢加班統計 (範例：查詢特定使用者的加班總時數)
   * 這裡假設我們要統計 "類型" 為 "加班" 的總時數
   * @param {string} name - 使用者姓名 (Optional)
   */
  async getOvertimeStats(name) {
    try {
      const filter = {
        and: [
          {
            property: '類型',
            select: {
              equals: '加班',
            },
          },
        ],
      };

      if (name) {
        filter.and.push({
          property: '姓名',
          title: {
            equals: name,
          },
        });
      }

      // Notion API 分頁處理 (這裡先簡化，這只抓前100筆)
      // Workaround: Use notion.request because notion.databases.query is missing in v5.7.0 client
      const response = await notion.request({
        path: `databases/${databaseId}/query`,
        method: 'post',
        body: {
            filter: filter
        }
      });

      // 計算總時數
      const totalHours = response.results.reduce((sum, page) => {
        const hours = page.properties['時數']?.number || 0;
        return sum + hours;
      }, 0);

      return {
        count: response.results.length,
        totalHours: totalHours,
      };
    } catch (error) {
      console.error('Notion Query Error:', error);
      throw error;
    }
  },

  /**
   * 計算特定人員的加班/補休結餘
   * @param {string} name
   * @returns {Promise<{overtime: number, compensatory: number, balance: number}>}
   */
  async getUserTimeBalance(name) {
    try {
      const response = await notion.request({
        path: `databases/${databaseId}/query`,
        method: 'post',
        body: {
             filter: {
                and: [
                    {
                    property: '姓名',
                    title: {
                        equals: name,
                    },
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
        }
      });


      let overtime = 0;
      let compensatory = 0;

      response.results.forEach(page => {
        const type = page.properties['類型']?.select?.name;
        const hours = page.properties['時數']?.number || 0;

        if (type === '加班') {
          overtime += hours;
        } else if (type === '補休') {
          compensatory += hours;
        }
      });

      return {
        overtime,
        compensatory,
        balance: overtime - compensatory
      };

    } catch (error) {
      console.error('Get Balance Error:', error);
      throw error;
    }
  },
};

module.exports = notionRepo;
