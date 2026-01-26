const dayjs = require("dayjs")

const data = {
  開始時間: "2026/01/29",
  結束時間: "2026/01/30",
}

const isDateOnly = (str) => /^(\d{4}[-/]\d{2}[-/]\d{2})$/.test(str.trim())

console.log(`Start: "${data["開始時間"]}"`)
console.log(`End: "${data["結束時間"]}"`)

let hours = 0

if (isDateOnly(data["開始時間"]) && isDateOnly(data["結束時間"])) {
  console.log("Mode: Date Only")
  const startDate = dayjs(data["開始時間"])
  const endDate = dayjs(data["結束時間"])
  const diffDays = endDate.diff(startDate, "day")

  if (diffDays < 0) {
    console.log("Error: End < Start")
  } else {
    const totalDays = diffDays + 1
    hours = totalDays * 7.5
    console.log(`Original Calculated Hours: ${hours}`)

    // [NEW] 針對補休整天的特殊處理 (大於等於 7.5 小時強制算 7.5)
    // Simulate the FIXED logic in leaveService.js
    const type = "補休"
    const isDateOnlyMode = true // We are in Date Only block
    console.log(`Simulating Type: ${type}, DateOnly: ${isDateOnlyMode}`)

    // Fixed condition: Only cap if NOT Date Only
    if (type === "補休" && !isDateOnlyMode && hours >= 7.5) {
      console.log("Applying Compensatory Leave Cap (Bug?)")
      hours = 7.5
    } else {
      console.log("Compensatory Leave Cap Skipped (Correct Behavior)")
    }
    console.log(`Final Hours: ${hours}`)
  }
} else {
  console.log("Mode: Time Included")
}
