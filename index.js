const express = require("express")
const http = require("http")
const { Server } = require("socket.io")
const { WebcastPushConnection } = require("tiktok-live-connector")

// 🔴 username TikTok đang live (không @)
const TIKTOK_USERNAME = "pet_xinh_sai_gon"

// 🔴 số comment tối đa lưu lại
const MAX_COMMENTS = 200

const app = express()
const server = http.createServer(app)
const io = new Server(server)

app.use(express.static("public"))

/**
 * 🧠 Lưu comment vào bộ nhớ
 */
let commentHistory = []

const tiktokLive = new WebcastPushConnection(TIKTOK_USERNAME)


function connectToLive() {
  console.log(`⏳ Đang kết nối tới @${TIKTOK_USERNAME}...`)

  tiktokLive.connect()
    .then(state => {
      console.log(`✅ Đã kết nối LIVE | RoomID: ${state.roomId}`)
    })
    .catch(err => {
      console.error("❌ Lỗi kết nối:", err.message || err)
      console.log("🔄 Sẽ thử lại sau 10 giây...")
      setTimeout(connectToLive, 10000)
    })
}

connectToLive()

// Tự động kết nối lại khi bị ngắt
tiktokLive.on("disconnected", () => {
  console.log("❌ Đã mất kết nối LIVE")
  console.log("🔄 Đang thử kết nối lại sau 10 giây...")
  setTimeout(connectToLive, 10000)
})

// 📥 Nhận comment từ TikTok
tiktokLive.on("chat", data => {
  // console.log(data); // Tắt log để đỡ rối

  const payload = {
    nickname: data.nickname,
    avatar: data.profilePictureUrl, // 👈 AVATAR
    comment: data.comment,
    time: new Date().toLocaleTimeString()
  }

  // Lưu vào history
  commentHistory.push(payload)

  // Giữ tối đa MAX_COMMENTS
  if (commentHistory.length > MAX_COMMENTS) {
    commentHistory.shift()
  }

  // Gửi realtime cho UI
  io.emit("comment", payload)
})

// ❤️ Nhận like từ TikTok
tiktokLive.on("like", data => {
  console.log(`${data.uniqueId} sent ${data.likeCount} likes, total likes: ${data.totalLikeCount}`);

  const payload = {
    nickname: data.nickname,
    avatar: data.profilePictureUrl,
    comment: `đã gửi ${data.likeCount} tim ❤️ (Tổng: ${data.totalLikeCount})`,
    time: new Date().toLocaleTimeString(),
    isLike: true // Đánh dấu là like để UI có thể style khác nếu muốn
  }

  // Lưu vào history (tuỳ chọn, nếu muốn lưu cả like)
  commentHistory.push(payload)
  if (commentHistory.length > MAX_COMMENTS) {
    commentHistory.shift()
  }

  io.emit("comment", payload)
})

// ➕ Nhận follow từ TikTok
tiktokLive.on("follow", data => {
  console.log(`${data.uniqueId} followed!`);

  const payload = {
    nickname: data.nickname,
    avatar: data.profilePictureUrl,
    comment: "đã follow bạn ➕",
    time: new Date().toLocaleTimeString(),
    isFollow: true
  }

  io.emit("comment", payload)
})

// 🚀 Nhận share từ TikTok
tiktokLive.on("share", data => {
  console.log(`${data.uniqueId} shared!`);

  const payload = {
    nickname: data.nickname,
    avatar: data.profilePictureUrl,
    comment: "đã chia sẻ live 🚀",
    time: new Date().toLocaleTimeString(),
    isShare: true
  }

  io.emit("comment", payload)
})

// 🌐 Khi UI kết nối
io.on("connection", socket => {
  console.log("📱 UI connected")

  // 🔁 Gửi lại comment cũ
  socket.emit("history", commentHistory)
})

// Start server
server.listen(4000, () => {
  console.log("🌐 UI chạy tại: http://localhost:4000")
})

// 🛡️ Chống crash khi gặp lỗi lạ
process.on('uncaughtException', (err) => {
  console.error('🔥 Lỗi hệ thống (không crash):', err.message || err);
});

process.on('unhandledRejection', (err) => {
  console.error('🔥 Lỗi Promise (không crash):', err.message || err);
});
