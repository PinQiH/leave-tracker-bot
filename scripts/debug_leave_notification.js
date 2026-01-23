require("dotenv").config()
const { Client } = require("@notionhq/client")
const config = require("../config/config")
const dayjs = require("dayjs")

// Mock config if not loaded (though dotenv should load)
const notionToken = process.env.NOTION_TOKEN || config.notion.token
const databaseId = process.env.NOTION_DATABASE_ID || config.notion.databaseId

const notion = new Client({
  auth: notionToken,
  notionVersion: "2022-06-28",
})

const testDate = "2026-01-23"

async function run() {
  console.log(`Checking leaves for ${testDate}...`)
  try {
    const response = await notion.databases.query({
      database_id: databaseId,
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
    })

    console.log(`Found ${response.results.length} records.`)
    response.results.forEach((page) => {
      const name = page.properties["姓名"]?.title[0]?.text?.content
      const created = page.created_time
      const startTime = page.properties["開始時間"]?.date?.start
      const endTimeProp = page.properties["結束時間"]?.date

      console.log(`Name: ${name}`)
      console.log(`  Created At (UTC): ${created}`)
      console.log(`  Created At (Local): ${dayjs(created).format()}`) // Depends on system TZ
      console.log(`  Start: ${startTime}`)
      console.log(`  End Prop: ${JSON.stringify(endTimeProp)}`)
    })
  } catch (error) {
    console.error("Error:", error)
  }
}

run()
