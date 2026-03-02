// handlers/passenger/menu.js
const User   = require("../../models/User.model");
const Order  = require("../../models/Order.model");
const logger = require("../../utils/logger");
const { getRegionName } = require("../../utils/regionOptions");
const { startPassengerOrder, handleCargoDescription, handleCargoPhoto } = require("./orderCreate");
const { getSession } = require("../../cache/sessionCache");

function getStatusText(status) {
  const map = {
    pending:             "Kutilmoqda ⏳",
    accepted:            "Qabul qilindi ✅",
    in_progress:         "Jarayonda 🚕",
    driver_confirmed:    "Haydovchi tasdiqladi ✅",
    passenger_confirmed: "Siz tasdiqladingiz ✅",
    completed:           "Yakunlandi ✅",
    cancelled:           "Bekor qilindi ❌",
  };
  return map[status] || status;
}

function applyPassengerMenu(bot) {
  // ── Buyurtma berish ────────────────────────────────────────────────────────
  bot.onText(/🚖 Buyurtma berish/, async (msg) => {
    const chatId = msg.chat.id;
    try {
      const user = await User.findOne({ telegramId: chatId });
      if (!user || user.role !== "passenger") return;
      await startPassengerOrder(bot, chatId, "passenger");
    } catch (err) {
      logger.error("Buyurtma berish error:", err);
    }
  });

  // ── Yuk/Pochta ─────────────────────────────────────────────────────────────
  bot.onText(/📦 Yuk\/Pochta/, async (msg) => {
    const chatId = msg.chat.id;
    try {
      const user = await User.findOne({ telegramId: chatId });
      if (!user || user.role !== "passenger") return;
      await startPassengerOrder(bot, chatId, "cargo");
    } catch (err) {
      logger.error("Yuk buyurtma error:", err);
    }
  });

  // ── Session bor bo'lsa xabarni ushlash (cargo tavsif/rasm) ─────────────────
  bot.on("message", async (msg) => {
    if (msg.chat.type !== "private") return;
    const chatId  = msg.chat.id;
    const session = await getSession(chatId);
    if (!session) return;

    if (session.step === "CARGO_DESCRIPTION" && msg.text && msg.text !== "📷 Rasm yo'q, davom etish") {
      return handleCargoDescription(bot, msg, session);
    }

    if (session.step === "CARGO_PHOTO") {
      return handleCargoPhoto(bot, msg, session);
    }
  });

  // ── Profil ─────────────────────────────────────────────────────────────────
  bot.onText(/👤 Profilim/, async (msg) => {
    const chatId = msg.chat.id;
    try {
      const user = await User.findOne({ telegramId: chatId, role: "passenger" });
      if (!user) return;

      const botInfo      = await bot.getMe();
      const referralLink = `https://t.me/${botInfo.username}?start=${user.referralCode || ""}`;

      const text =
        `<pre>👤 MENING PROFILIM</pre>\n\n` +
        `👤 Ism: <b>${user.name}</b>\n` +
        `📱 Telefon: <b>${user.phone}</b>\n` +
        `⭐ Rating: <b>${user.rating?.toFixed(1) || "5.0"}</b>\n` +
        `👥 Referallar: <b>${user.referralCount || 0} ta</b>\n\n` +
        `🔗 Referal havolangiz:\n${referralLink}`;

      bot.sendMessage(chatId, text, { parse_mode: "HTML" });
    } catch (err) {
      logger.error("Passenger profil error:", err);
    }
  });

  // ── Tarix ──────────────────────────────────────────────────────────────────
  bot.onText(/📋 Tarixim/, async (msg) => {
    const chatId = msg.chat.id;
    try {
      const orders = await Order.find({ passengerId: chatId })
        .sort({ createdAt: -1 })
        .limit(10);

      if (orders.length === 0) {
        return bot.sendMessage(chatId, "📋 Sizda hali buyurtmalar yo'q");
      }

      let text = `<pre>📋 BUYURTMALAR TARIXI (${orders.length} ta):</pre>\n\n`;
      orders.forEach((order, i) => {
        const icon = order.orderType === "cargo" ? "📦" : "👥";
        const from = getRegionName(order.from);
        const to   = getRegionName(order.to);
        text += `${i + 1}. ${icon} <b>${from} → ${to}</b>\n`;
        text += `   Status: ${getStatusText(order.status)}\n`;
        text += `   ${new Date(order.createdAt).toLocaleDateString("uz-UZ")}\n\n`;
      });

      bot.sendMessage(chatId, text, { parse_mode: "HTML" });
    } catch (err) {
      logger.error("Passenger tarix error:", err);
    }
  });
}

module.exports = { applyPassengerMenu };
