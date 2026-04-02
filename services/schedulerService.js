const cron = require("node-cron")
const config = require("../config/config")
const typhoonManager = require("../utils/typhoonManager")

async function runTyphoonStatusCheck(bot, groupId) {
	try {
		console.log("⏰ 執行排程：停班停課狀態檢查")
		const result = await typhoonManager.checkForUpdates()

		if (result.initialized) {
			console.log("🌀 已建立停班停課監控基準狀態。")
			return
		}

		if (!result.shouldNotify) {
			console.log("🌀 停班停課狀態無變更。")
			return
		}

		await bot.telegram.sendMessage(
			groupId,
			typhoonManager.formatChangeNotification(result)
		)
		console.log(`✅ 已發送停班停課通知，共 ${result.changes.length} 筆異動。`)
	} catch (error) {
		console.error("排程執行失敗 (停班停課通知):", error)
	}
}

const schedulerService = {
	/**
	 * 初始化排程
	 * @param {Object} bot - Telegraf bot instance
	 */
	init(bot) {
		console.log("⏳ 排程系統啟動中...")

		const groupId = config.telegram.groupId

		if (!groupId) {
			console.warn("⚠️ 未設定 TELEGRAM_GROUP_ID，無法啟動排程通知。")
			return
		}

		// 1. 每個月 15 號 早上 09:00
		cron.schedule("0 9 15 * *", async () => {
			try {
				console.log("⏰ 執行排程：每月 15 號提醒")
				await bot.telegram.sendMessage(
					groupId,
					"🔔 請於21號以前完成前一個月Mynote工作記錄及納管專案工項的進度回報，以利後續作業，感恩大家。\n\n例如：02/21 需完成 01/21 ~ 02/20 Mynote 工作紀錄。"
				)
			} catch (error) {
				console.error("排程執行失敗 (每月 15 號):", error)
			}
		})

		// 2. 每個月 20 號 早上 09:00
		cron.schedule("0 9 20 * *", async () => {
			try {
				console.log("⏰ 執行排程：每月 20 號提醒")
				await bot.telegram.sendMessage(
					groupId,
					"🔔 大家早安！今天是 20 號，記得寫 Mynote 喔！"
				)
			} catch (error) {
				console.error("排程執行失敗 (每月 20 號):", error)
			}
		})

		// 3. 每個禮拜一 早上 09:00
		cron.schedule("0 9 * * 1", async () => {
			try {
				console.log("⏰ 執行排程：週一提醒")
				await bot.telegram.sendMessage(
					groupId,
					"🔔 大家早安！又是新的一週，記得寫 Mynote 喔！"
				)
			} catch (error) {
				console.error("排程執行失敗 (週一):", error)
			}
		})

		// 4. 每天早上 08:00 通知當日請假
		cron.schedule("0 8 * * *", async () => {
			try {
				console.log("⏰ 執行排程：每日請假通知")
				const { dayjs } = require("../utils/dateUtils")
				const notionRepo = require("../repository/notionRepo")

				const today = dayjs().format("YYYY-MM-DD")
				const leaves = await notionRepo.getLeavesByDate(today)

				if (leaves && leaves.length > 0) {
					console.log(
						`📋 每日通知：發現 ${leaves.length} 筆請假資料，準備發送通知。`
					)
					let msg = `📅 **${today} 出勤異動名單**：\n`
					leaves.forEach((leave, index) => {
						let timeInfo = "(全天)"
						// 判斷是否為含時間的格式 (ISO string 通常包含 "T")
						if (leave.start.includes("T")) {
							const s = dayjs(leave.start).tz().format("HH:mm")
							const e = dayjs(leave.end).tz().format("HH:mm")
							timeInfo = `(${s}~${e})`
						}

						msg += `${index + 1}. ${leave.name} ${leave.type} ${timeInfo}\n`
					})

					await bot.telegram.sendMessage(groupId, msg, {
						parse_mode: "Markdown",
					})
					console.log("✅ 每日請假通知發送成功。")
				} else {
					console.log("今日無人請假，不發送通知。")
				}
			} catch (error) {
				console.error("排程執行失敗 (每日請假通知):", error)
			}
		})

		// 5. 國定假日放假通知 (每日 17:00 檢查明天)
		cron.schedule("0 17 * * *", async () => {
			try {
				console.log("⏰ 執行排程：國定假日放假通知檢查")
				const holidayManager = require("../utils/holidayManager")
				const holiday = holidayManager.checkTomorrowHoliday()

				if (holiday) {
					const holidayName = holiday.name || "國定假日"
					const joyfulMessages = [
						`明天【${holidayName}】放假一天呦 🥳✨ 大家準備好要怎麼放鬆了嗎？`,
						`耶！明天是【${holidayName}】休息喔 🎉 好好充電吧！`,
						`小叮嚀：明天是【${holidayName}】，不用上班唷 🌈 祝大家有個愉快的假期！`,
						`太棒了！明天【${holidayName}】大家可以睡到自然醒囉 💤🛋️`,
					]
					const randomMsg = joyfulMessages[Math.floor(Math.random() * joyfulMessages.length)]

					await bot.telegram.sendMessage(groupId, randomMsg)
					console.log(`✅ 已發送假日通知: ${holidayName}`)
				} else {
					console.log("明天不是特定國定假日，不發送通知。")
				}
			} catch (error) {
				console.error("排程執行失敗 (國定假日通知):", error)
			}
		})

		// 6. 每月第一個禮拜二的前一天 (週一) 16:00 提醒月會
		cron.schedule("0 16 * * 1", async () => {
			try {
				const { dayjs } = require("../utils/dateUtils")
				const tomorrow = dayjs().add(1, "day")

				// 判斷明天是否為 1-7 號 (表示明天是第一個禮拜二)
				if (tomorrow.date() <= 7) {
					console.log("⏰ 執行排程：每月會議提醒 (前一天)")
					await bot.telegram.sendMessage(
						groupId,
						"🔔 大家下午好，提醒明天 10:00 要開月會喔！"
					)
					console.log("✅ 已發送月會提醒通知。")
				} else {
					console.log("明日非當月第一個禮拜二，無需發送月會提醒。")
				}
			} catch (error) {
				console.error("排程執行失敗 (月會提醒):", error)
			}
		})

		// 7. 每 30 分鐘檢查停班停課狀態
		cron.schedule("*/30 * * * *", async () => {
			await runTyphoonStatusCheck(bot, groupId)
		})

		// 啟動時先同步一次狀態，沒有既有基準時只建立檔案不通知
		runTyphoonStatusCheck(bot, groupId).catch((error) => {
			console.error("啟動時同步停班停課狀態失敗:", error)
		})

		// 8. Keep Alive (Prevent Render Free Tier from spinning down)
		// Run every 10 minutes
		cron.schedule("*/10 * * * *", async () => {
			const renderUrl = process.env.RENDER_URL
			if (!renderUrl) {
				return
			}

			try {
				// console.log(`📡 Sending Keep-Alive request to ${renderUrl}`);
				const axios = require("axios")
				await axios.get(renderUrl)
				// console.log(`✅ Keep-Alive successful`);
			} catch (error) {
				console.error("❌ Keep-Alive failed:", error.message)
			}
		})

		console.log(
			"✅ 排程已註冊：\n   - 每月 15 號 09:00\n   - 每月 20 號 09:00\n   - 每週一 09:00\n   - 每週一 16:00 (每月會議提醒)\n   - 每日 08:00 (當日請假通知)\n   - 每日 17:00 (放假預告通知)\n   - 每 30 分鐘 (停班停課監控)\n   - 每 10 分鐘 (Keep Alive)"
		)
	},
}

module.exports = schedulerService
