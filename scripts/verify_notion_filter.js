require("dotenv").config()
const notionRepo = require("../repository/notionRepo")

async function verify() {
  try {
    const testDate = "2026-01-24" // The date with the invalid "test" record
    console.log(`Querying leaves for ${testDate}...`)

    // This calls the actual repository function which now has the filter
    const leaves = await notionRepo.getLeavesByDate(testDate)

    console.log(`Found ${leaves.length} records.`)
    leaves.forEach((l) => {
      console.log(`- ${l.name} (${l.type})`)
    })

    const foundTest = leaves.find((l) => l.name === "test")
    if (!foundTest) {
      console.log("PASS: 'test' record was filtered out.")
    } else {
      console.log("FAIL: 'test' record is still present.")
    }
  } catch (error) {
    console.error("Error:", error)
  }
}

verify()
