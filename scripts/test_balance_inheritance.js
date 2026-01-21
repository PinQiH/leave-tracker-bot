require("dotenv").config()
const leaveService = require("../services/leaveService")
const authService = require("../services/authService")
const notionRepo = require("../repository/notionRepo")

async function test() {
  console.log("--- Testing 一般假別 (特休) 應沿用 Balance ---")
  const text = `姓名: 黃品綺\n類型: 特休\n開始時間: 2026-02-10\n結束時間: 2026-02-10`

  // Mock AuthService
  const originalCheck = authService.checkUserByTelegramId
  authService.checkUserByTelegramId = async () => ({
    notionUserId: "98257844-8a8d-46ef-a2fd-4b7b91144ef4", // Cassie
    name: "黃品綺",
  })

  // Mock Repo
  const originalCreate = notionRepo.createLeaveRecord
  notionRepo.createLeaveRecord = async (data) => {
    console.log(
      ">>> Notion Repo received balance:",
      data.balance,
      "(Type:",
      data.type,
      ")"
    )
    return { id: "fake" }
  }

  try {
    const result = await leaveService.processLeaveMessage(text, "fake_tg_id")
    console.log("Message Result Message:", result.message)
  } catch (e) {
    console.error(e)
  } finally {
    authService.checkUserByTelegramId = originalCheck
    notionRepo.createLeaveRecord = originalCreate
  }
}

test()
