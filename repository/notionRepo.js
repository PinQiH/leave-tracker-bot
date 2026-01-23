const { Client } = require("@notionhq/client")
const config = require("../config/config")

// 初始化 Notion Client
const notion = new Client({
  auth: config.notion.token,
  notionVersion: "2022-06-28", // 強制指定穩定版本，解決 5.7.0 預設版本問題
})
const databaseId = config.notion.databaseId

const notionRepo = {
  /**
   * 新增請假/加班記錄
   * @param {Object} data - { name, type, start, end, hours, remark, personId, balance }
   */
  async createLeaveRecord({
    name,
    type,
    start,
    end,
    hours,
    remark,
    personId,
    balance,
  }) {
    try {
      const properties = {
        姓名: {
          title: [
            {
              text: {
                content: name,
              },
            },
          ],
        },
        類型: {
          select: {
            name: type?.trim(),
          },
        },
        開始時間: {
          date: {
            start: start,
          },
        },
        結束時間: {
          date: {
            start: end,
          },
        },
        時數: {
          number: hours,
        },
        備註: {
          rich_text: [
            {
              text: {
                content: remark || "",
              },
            },
          ],
        },
      }

      if (personId) {
        properties["人員"] = {
          people: [
            {
              id: personId,
            },
          ],
        }
      }

      if (typeof balance === "number") {
        properties["balance"] = {
          number: balance,
        }
      }

      const response = await notion.pages.create({
        parent: { database_id: databaseId },
        properties: properties,
      })
      return response
    } catch (error) {
      console.error("Notion Create Error:", error)
      throw error
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
            property: "類型",
            select: {
              equals: "加班",
            },
          },
        ],
      }

      if (name) {
        filter.and.push({
          property: "姓名",
          title: {
            equals: name,
          },
        })
      }

      // Notion API 分頁處理 (這裡先簡化，這只抓前100筆)
      // Workaround: Use notion.request because notion.databases.query is missing in v5.7.0 client
      const response = await notion.request({
        path: `databases/${databaseId}/query`,
        method: "post",
        body: {
          filter: filter,
        },
      })

      // 計算總時數
      const totalHours = response.results.reduce((sum, page) => {
        const hours = page.properties["時數"]?.number || 0
        return sum + hours
      }, 0)

      return {
        count: response.results.length,
        totalHours: totalHours,
      }
    } catch (error) {
      console.error("Notion Query Error:", error)
      throw error
    }
  },

  /**
   * 計算特定人員的加班/補休結餘
   * @param {string} name
   * @returns {Promise<{overtime: number, compensatory: number, balance: number}>}
   */
  async getUserTimeBalance(name) {
    try {
      const filter = {
        and: [
          {
            property: "姓名",
            title: {
              equals: name,
            },
          },
          {
            or: [
              {
                property: "類型",
                select: {
                  equals: "加班",
                },
              },
              {
                property: "類型",
                select: {
                  equals: "補休",
                },
              },
            ],
          },
        ],
      }

      // 1. 優先檢查最新的一筆紀錄是否有 balance 欄位
      const latestPage = await notion.request({
        path: `databases/${databaseId}/query`,
        method: "post",
        body: {
          filter: filter,
          sorts: [
            {
              property: "開始時間",
              direction: "descending",
            },
          ],
          page_size: 1,
        },
      })

      if (latestPage.results.length > 0) {
        const balanceValue = latestPage.results[0].properties["balance"]?.number
        if (typeof balanceValue === "number" && balanceValue !== null) {
          return {
            overtime: 0,
            compensatory: 0,
            balance: balanceValue,
            isFromBalanceField: true,
          }
        }
      }

      // 2. 如果沒值，則計算總額
      let allResults = []
      let hasMore = true
      let startCursor = undefined

      while (hasMore) {
        const response = await notion.request({
          path: `databases/${databaseId}/query`,
          method: "post",
          body: {
            filter: filter,
            start_cursor: startCursor,
          },
        })

        allResults = allResults.concat(response.results)
        hasMore = response.has_more
        startCursor = response.next_cursor
      }

      let overtime = 0
      let compensatory = 0

      allResults.forEach((page) => {
        const type = page.properties["類型"]?.select?.name
        const hours = page.properties["時數"]?.number || 0

        if (type === "加班") {
          overtime += hours
        } else if (type === "補休") {
          compensatory += hours
        }
      })

      return {
        overtime,
        compensatory,
        balance: overtime - compensatory,
        isFromBalanceField: false,
      }
    } catch (error) {
      console.error("Get Balance Error:", error)
      throw error
    }
  },

  /**
   * 計算特定 Person ID 的加班/補休結餘
   * @param {string} personId
   * @returns {Promise<{overtime: number, compensatory: number, balance: number}>}
   */
  async getUserTimeBalanceByPersonId(personId) {
    try {
      const filter = {
        and: [
          {
            property: "人員",
            people: {
              contains: personId,
            },
          },
          {
            or: [
              {
                property: "類型",
                select: {
                  equals: "加班",
                },
              },
              {
                property: "類型",
                select: {
                  equals: "補休",
                },
              },
            ],
          },
        ],
      }

      // 1. 優先檢查最新的一筆紀錄是否有 balance 欄位
      const latestPage = await notion.request({
        path: `databases/${databaseId}/query`,
        method: "post",
        body: {
          filter: filter,
          sorts: [
            {
              property: "開始時間",
              direction: "descending",
            },
          ],
          page_size: 1,
        },
      })

      if (latestPage.results.length > 0) {
        const pageId = latestPage.results[0].id
        const balanceValue = latestPage.results[0].properties["balance"]?.number
        if (typeof balanceValue === "number" && balanceValue !== null) {
          return {
            overtime: 0,
            compensatory: 0,
            balance: balanceValue,
            isFromBalanceField: true,
            pageId: pageId,
          }
        } else {
          // 有紀錄但沒有 balance 值，要求手動輸入
          return {
            requireManualBalance: true,
            pageId: pageId,
          }
        }
      }

      // 2. 如果完全無紀錄，則視為結餘 0
      return {
        overtime: 0,
        compensatory: 0,
        balance: 0,
        isFromBalanceField: false,
      }
    } catch (error) {
      console.error("Get Balance By ID Error:", error)
      throw error
    }
  },

  /**
   * 更新特定頁面的 balance 欄位
   * @param {string} pageId
   * @param {number} balance
   */
  async updateBalance(pageId, balance) {
    try {
      await notion.pages.update({
        page_id: pageId,
        properties: {
          balance: {
            number: balance,
          },
        },
      })
    } catch (error) {
      console.error("Update Balance Error:", error)
      throw error
    }
  },

  /**
   * 查詢指定日期的請假名單 (包含跨日)
   * @param {string} dateStr - YYYY-MM-DD
   */
  async getLeavesByDate(dateStr) {
    try {
      const response = await notion.request({
        path: `databases/${databaseId}/query`,
        method: "post",
        body: {
          filter: {
            and: [
              {
                property: "開始時間",
                date: {
                  on_or_before: dateStr,
                },
              },
              {
                property: "結束時間",
                date: {
                  on_or_after: dateStr,
                },
              },
            ],
          },
          sorts: [
            {
              property: "開始時間",
              direction: "ascending",
            },
          ],
        },
      })

      return response.results.map((page) => {
        const start = page.properties["開始時間"]?.date?.start
        // 修正: 結束時間是獨立的 Date 欄位，其值存在 start 屬性中 (因為它不是一個 Range)
        const end = page.properties["結束時間"]?.date?.start

        // 格式化時間：若是全天 (YYYY-MM-DD)，保持原樣；若是含時間，取 HH:mm ~ HH:mm
        // 但為了通知清楚，統一顯示原始字串或簡單處理
        // 這裡回傳原始日期資料讓 Service/Controller 決定顯示方式
        return {
          name: page.properties["姓名"]?.title[0]?.text?.content || "未知",
          type: page.properties["類型"]?.select?.name || "未知",
          start: start,
          end: end || start, // 若無結束時間通常代表單日
        }
      })
    } catch (error) {
      console.error("Get Leaves By Date Error:", error)
      throw error
    }
  },

  /**
   * 透過 Email 尋找 Notion 使用者
   * @param {string} email
   * @returns {Promise<string|null>} user id
   */
  async findUserByEmail(email) {
    try {
      const response = await notion.users.list({})
      // 這裡回傳的是所有使用者 (paginated, 但通常人不多)
      const user = response.results.find(
        (u) => u.person && u.person.email === email
      )
      return user ? user.id : null
    } catch (error) {
      console.error("Find User By Email Error:", error)
      // 若無權限或找不到，回傳 null
      return null
    }
  },

  /**
   * 檢查是否有重複的請假紀錄
   * @param {string} personId - Notion User ID
   * @param {string} type
   * @param {string} start
   * @param {string} end
   * @returns {Promise<boolean>}
   */
  async checkDuplicate(personId, type, start, end) {
    if (!personId) return false // 若無 Person ID，無法精確判斷重複 (或視為不重複)

    try {
      const response = await notion.request({
        path: `databases/${databaseId}/query`,
        method: "post",
        body: {
          filter: {
            and: [
              {
                property: "人員",
                people: {
                  contains: personId,
                },
              },
              {
                property: "類型",
                select: {
                  equals: type,
                },
              },
              {
                property: "開始時間",
                date: {
                  equals: start, // 需完全一致
                },
              },
              {
                property: "結束時間",
                date: {
                  equals: end, // 需完全一致
                },
              },
            ],
          },
        },
      })
      return response.results.length > 0
    } catch (error) {
      console.error("Check Duplicate Error:", error)
      return false // 保守處理：若查詢失敗，視為無重複 (或視需求改成 throw)
    }
  },
}

module.exports = notionRepo
