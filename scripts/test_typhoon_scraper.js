const assert = require("assert/strict")
const fs = require("fs")
const os = require("os")
const path = require("path")
const typhoonManager = require("../utils/typhoonManager")

const sampleHtml = `
<!doctype html>
<html lang="zh-Hant">
  <body>
    <div>115年 3月 24日 天然災害停止上班及上課情形</div>
    <div>更新時間：2026/03/24 04:13:03</div>
    <table class="Table_Body">
      <tr>
        <th>區域</th>
        <th>縣市名稱</th>
        <th>是否停止上班上課情形</th>
      </tr>
      <tr>
        <td>北部地區</td>
        <td>臺北市</td>
        <td>尚未宣布消息</td>
      </tr>
      <tr>
        <td>北部地區</td>
        <td>新北市</td>
        <td>今晚 18:00 起停止上班、停止上課。</td>
      </tr>
      <tr>
        <td>北部地區</td>
        <td>桃園市</td>
        <td>尚未宣布消息</td>
      </tr>
      <tr>
        <td>中部地區</td>
        <td>臺中市</td>
        <td>今日照常上班、照常上課。</td>
      </tr>
    </table>
  </body>
</html>
`

function buildTempFile() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "typhoon-status-"))
  return path.join(tempDir, "typhoon_status.json")
}

function runParserTest() {
  const parsed = typhoonManager.parseTyphoonPage(sampleHtml)

  assert.equal(parsed.sourceUpdatedAt, "2026/03/24 04:13:03")
  assert.deepEqual(parsed.statuses, {
    臺北市: "尚未宣布消息",
    新北市: "今晚 18:00 起停止上班、停止上課。",
    桃園市: "尚未宣布消息",
    臺中市: "今日照常上班、照常上課。",
  })

  console.log("PASS parser test")
}

async function runPersistenceTest() {
  const storageFile = buildTempFile()

  const firstCheck = await typhoonManager.checkForUpdates({
    html: sampleHtml,
    storageFile,
  })

  assert.equal(firstCheck.initialized, true)
  assert.equal(firstCheck.shouldNotify, false)

  const secondCheck = await typhoonManager.checkForUpdates({
    html: sampleHtml,
    storageFile,
  })

  assert.equal(secondCheck.initialized, false)
  assert.equal(secondCheck.shouldNotify, false)

  const updatedHtml = sampleHtml.replace(
    "尚未宣布消息",
    "今日停止上班、停止上課。"
  )

  const thirdCheck = await typhoonManager.checkForUpdates({
    html: updatedHtml,
    storageFile,
  })

  assert.equal(thirdCheck.shouldNotify, true)
  assert.deepEqual(
    thirdCheck.changes.map((item) => item.city),
    ["臺北市"]
  )

  console.log("PASS persistence test")
}

async function runLiveTest() {
  const snapshot = await typhoonManager.getCurrentSnapshot()
  console.log(typhoonManager.formatCurrentStatusMessage(snapshot))
}

async function main() {
  runParserTest()
  await runPersistenceTest()

  if (process.argv.includes("--live")) {
    await runLiveTest()
  } else {
    console.log("Skip live fetch. Use `node scripts/test_typhoon_scraper.js --live` to test against DGPA.")
  }
}

main().catch((error) => {
  console.error("FAIL typhoon scraper test:", error)
  process.exit(1)
})
