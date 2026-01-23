require("dotenv").config()
const { Client } = require("@notionhq/client")
const config = require("../config/config")
const fs = require("fs")

const notionToken = process.env.NOTION_TOKEN || config.notion.token
const databaseId = process.env.NOTION_DATABASE_ID || config.notion.databaseId

const notion = new Client({
  auth: notionToken,
  notionVersion: "2022-06-28",
})

const testDate = "2026-01-23"
const outputFile = "debug_output.txt"

async function run() {
  try {
    fs.writeFileSync(outputFile, `Starting check for ${testDate}\n`)

    const response = await notion.request({
      path: `databases/${databaseId}/query`,
      method: "post",
      body: {
        filter: {
          and: [
            {
              property: "開始時間",
              date: {
                on_or_before: testDate,
              },
            },
            {
              property: "結束時間",
              date: {
                on_or_after: testDate,
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

    fs.appendFileSync(outputFile, `Found ${response.results.length} records.\n`)

    response.results.forEach((page) => {
      const name = page.properties["姓名"]?.title[0]?.text?.content
      const created = page.created_time // UTC

      const startProp = page.properties["開始時間"]?.date
      const endProp = page.properties["結束時間"]?.date

      const log = `Name: ${name}
  Created (UTC): ${created}
  Start: ${startProp?.start}
  EndProp Start: ${endProp?.start}
-------------------\n`
      fs.appendFileSync(outputFile, log)
    })
  } catch (error) {
    fs.appendFileSync(outputFile, `Error: ${error.stack}\n`)
  }
}

run()
