const axios = require("axios")
const cheerio = require("cheerio")
const fs = require("fs")
const path = require("path")

// > 配置資訊
const DGPA_URL = "https://www.dgpa.gov.tw/typh/daily/nds.html"
const STATUS_FILE = path.join(__dirname, "../assets/typhoonStatus.json")
const TARGET_CITIES = ["臺北市", "新北市", "桃園市", "臺中市"]

const typhoonManager = {
	// - 抓取並解析 HTML 狀態
	async fetchStatus() {
		try {
			const { data } = await axios.get(DGPA_URL, {
				headers: {
					"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
				},
				timeout: 10000
			})
			const $ = cheerio.load(data)
			const results = {}

			// @ 分析表格結構
			$("table.Table_Body tr").each((i, el) => {
				const text = $(el).text()
				TARGET_CITIES.forEach(city => {
					if (text.includes(city)) {
						const status = $(el).find("td").last().text().trim()
						results[city] = status
					}
				})
			})

			return results
		} catch (error) {
			console.error("❌ 抓取 DGPA 失敗:", error.message)
			return null
		}
	},

	// - 解析 HTML 字串 (相容於 scripts/test_typhoon_scraper.js)
	parseTyphoonPage(html) {
		const $ = cheerio.load(html)
		const results = {
			statuses: {},
			sourceUpdatedAt: ""
		}

		// 嘗試抓取更新時間
		const updatedText = $("div:contains('更新時間')").text()
		const match = updatedText.match(/\d{4}\/\d{2}\/\d{2}\s\d{2}:\d{2}:\d{2}/)
		if (match) results.sourceUpdatedAt = match[0]

		$("table.Table_Body tr").each((i, el) => {
			const text = $(el).text()
			TARGET_CITIES.forEach(city => {
				if (text.includes(city)) {
					const status = $(el).find("td").last().text().trim()
					results.statuses[city] = status
				}
			})
		})

		return results
	},

	// - 檢查異動 (相容 schedulerService.js)
	async checkForUpdates() {
		const currentStatus = await this.fetchStatus()
		if (!currentStatus) return { shouldNotify: false, changes: [] }

		let lastStatus = null
		let initialized = false

		if (fs.existsSync(STATUS_FILE)) {
			try {
				lastStatus = JSON.parse(fs.readFileSync(STATUS_FILE, "utf-8"))
			} catch (e) {
				console.error("❌ 讀取狀態檔失敗:", e.message)
			}
		} else {
			initialized = true
		}

		const changes = []
		TARGET_CITIES.forEach(city => {
			const current = currentStatus[city] || "尚未宣布消息"
			const last = lastStatus ? (lastStatus[city] || "尚未宣布消息") : "尚未宣布消息"

			if (current !== last) {
				changes.push({
					city,
					oldStatus: last,
					newStatus: current
				})
			}
		})

		// @ 持久化新狀態
		fs.writeFileSync(STATUS_FILE, JSON.stringify(currentStatus, null, 2))

		return {
			initialized,
			shouldNotify: changes.length > 0,
			changes,
			currentStatus
		}
	},

	// - 格式化異動通知 (相容 schedulerService.js)
	formatChangeNotification(result) {
		if (!result.changes || result.changes.length === 0) return ""

		let msg = "🌀 **停班停課狀態異動通知**\n\n"
		result.changes.forEach(change => {
			if (change.newStatus === "尚未宣布消息") {
				msg += `✅ **${change.city}**：已無停班停課資訊 (恢復正常)\n`
			} else {
				msg += `📍 **${change.city}**：${change.newStatus}\n`
			}
		})
		msg += `\n🔗 [行政院人事行政總處](${DGPA_URL})`
		return msg
	},

	// - 取得目前即時快照 (用於 /testtyphoon)
	async getCurrentSnapshot() {
		return await this.fetchStatus()
	},

	// - 格式化目前狀態訊息 (用於 /testtyphoon)
	formatCurrentStatusMessage(snapshot) {
		if (!snapshot) return "⚠️ 無法取得目前停班停課資訊。"
		
		let msg = "🌀 **目前各縣市停班停課狀態**：\n\n"
		TARGET_CITIES.forEach(city => {
			const status = snapshot[city] || "尚未宣布消息"
			msg += `📍 ${city}：${status}\n`
		})
		msg += `\n🔗 [行政院人事行政總處](${DGPA_URL})`
		return msg
	}
}

module.exports = typhoonManager
