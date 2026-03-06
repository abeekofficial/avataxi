// handlers/passenger/menu.js
const User = require("../../models/User.model");
const Order = require("../../models/Order.model");
const logger = require("../../utils/logger");
const { getRegionName } = require("../../utils/regionOptions");
const {
  startPassengerOrder,
  handleCargoDescription,
  handleCargoPhoto,
} = require("./orderCreate");
const { getSession } = require("../../cache/sessionCache");

// ── Vaqtni formatlash ─────────────────────────────────────────────────────────
function fmtDate(date) {
  if (!date) return "—";
  return new Date(date).toLocaleString("uz-UZ", {
    timeZone: "Asia/Tashkent",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtDuration(start, end) {
  if (!start || !end) return null;
  const ms = new Date(end) - new Date(start);
  const min = Math.floor(ms / 60000);
  if (min < 60) return min + " daqiqa";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h + " soat" + (m ? " " + m + " daq" : "");
}

function statusLine(order) {
  const map = {
    pending: "⏳ Kutilmoqda",
    accepted: "✅ Haydovchi topildi",
    in_progress: "🚕 Jarayonda",
    driver_confirmed: "🔄 Haydovchi tasdiqladi",
    passenger_confirmed: "🔄 Siz tasdiqladingiz",
    completed: "✅ Yakunlandi",
    cancelled: "❌ Bekor qilindi",
  };
  return map[order.status] || order.status;
}

function orderCard(order, i) {
  const from = getRegionName(order.from);
  const to = getRegionName(order.to);
  const icon = order.orderType === "cargo" ? "📦" : "👥";
  const typeInfo =
    order.orderType === "cargo"
      ? "Yuk: " + (order.cargoDescription || "—")
      : (order.passengers || 1) + " kishi";

  let card = i + 1 + ". " + icon + " <b>" + from + " → " + to + "</b>\n";
  card += "   " + typeInfo + "\n";
  card += "   Holat: <b>" + statusLine(order) + "</b>\n";
  card += "   Yaratildi: " + fmtDate(order.createdAt) + "\n";

  if (order.acceptedAt) card += "   Qabul: " + fmtDate(order.acceptedAt) + "\n";
  if (order.startedAt)
    card += "   Boshlandi: " + fmtDate(order.startedAt) + "\n";
  if (order.completedAt) {
    card += "   Yakunlandi: " + fmtDate(order.completedAt) + "\n";
    const dur = fmtDuration(order.startedAt, order.completedAt);
    if (dur) card += "   Davomiyligi: " + dur + "\n";
  }
  if (order.cancelledAt) {
    card += "   Bekor qilindi: " + fmtDate(order.cancelledAt) + "\n";
    card += "   Kim: " + (order.cancelledBy || "—") + "\n";
  }

  return card;
}

// Aktiv order uchun inline tugmalar (passenger tomonidan)
function activeOrderKeyboard(order) {
  const id = order._id.toString();

  if (order.status === "pending" || order.status === "accepted") {
    return {
      inline_keyboard: [
        [{ text: "❌ Bekor qilish", callback_data: "cancel_order_" + id }],
      ],
    };
  }
  if (order.status === "driver_confirmed") {
    return {
      inline_keyboard: [
        [
          {
            text: "✅ Tasdiqlash",
            callback_data: "confirm_complete_btn_" + id,
          },
          { text: "❌ Shikoyat", callback_data: "dispute_" + id },
        ],
      ],
    };
  }
  if (
    order.status === "in_progress" ||
    order.status === "passenger_confirmed"
  ) {
    // Safar davomida passenger bekor qila olmaydi, faqat info
    return null;
  }
  return null;
}

function applyPassengerMenu(bot) {
  // ── Buyurtma berish ────────────────────────────────────────────────────────
  bot.onText(/🚖 Buyurtma berish/, async (msg) => {
    const chatId = msg.chat.id;
    try {
      const user = await User.findOne({ telegramId: Number(chatId) });
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
      const user = await User.findOne({ telegramId: Number(chatId) });
      if (!user || user.role !== "passenger") return;
      await startPassengerOrder(bot, chatId, "cargo");
    } catch (err) {
      logger.error("Yuk buyurtma error:", err);
    }
  });

  // ── Session bo'lsa xabarni ushlash (cargo tavsif/rasm) ────────────────────
  bot.on("message", async (msg) => {
    if (msg.chat.type !== "private") return;
    const chatId = msg.chat.id;
    const session = await getSession(chatId);
    if (!session) return;

    if (
      session.step === "CARGO_DESCRIPTION" &&
      msg.text &&
      msg.text !== "📷 Rasm yo'q, davom etish"
    ) {
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
      const user = await User.findOne({
        telegramId: Number(chatId),
        role: "passenger",
      });
      if (!user) return;

      const botInfo = await bot.getMe();
      const referralLink =
        "https://t.me/" +
        botInfo.username +
        "?start=" +
        (user.referralCode || "");

      const text =
        "<pre>👤 MENING PROFILIM</pre>\n\n" +
        "👤 Ism: <b>" +
        user.name +
        "</b>\n" +
        "📱 Telefon: <b>" +
        user.phone +
        "</b>\n" +
        "⭐ Rating: <b>" +
        (user.rating?.toFixed(1) || "5.0") +
        "</b>\n" +
        "👥 Referallar: <b>" +
        (user.referralCount || 0) +
        " ta</b>\n\n" +
        "🔗 Referal havolangiz:\n" +
        referralLink;

      bot.sendMessage(chatId, text, {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [[
            { text: "✏️ Profilni tahrirlash", callback_data: "open_profile_edit" },
          ]],
        },
      });
    } catch (err) {
      logger.error("Passenger profil error:", err);
    }
  });

  // ── Tarixim ────────────────────────────────────────────────────────────────
  bot.onText(/📋 Tarixim/, async (msg) => {
    const chatId = msg.chat.id;
    const passengerId = Number(chatId);
    try {
      // Jarayondagi orderlar
      const activeOrders = await Order.find({
        passengerId,
        status: {
          $in: [
            "pending",
            "accepted",
            "in_progress",
            "driver_confirmed",
            "passenger_confirmed",
          ],
        },
      }).sort({ createdAt: -1 });

      // Yakunlangan/bekor qilingan (oxirgi 10 ta)
      const histOrders = await Order.find({
        passengerId,
        status: { $in: ["completed", "cancelled"] },
      })
        .sort({ createdAt: -1 })
        .limit(10);

      if (activeOrders.length === 0 && histOrders.length === 0) {
        return bot.sendMessage(chatId, "📋 Sizda hali buyurtmalar yo'q");
      }

      // ── Aktiv orderlar — har biri tugma bilan ─────────────────────────────
      for (const order of activeOrders) {
        const card = orderCard(order, 0);
        const replyMu = activeOrderKeyboard(order);
        await bot.sendMessage(
          chatId,
          "<pre>⚡ AKTIV BUYURTMA</pre>\n\n" + card,
          {
            parse_mode: "HTML",
            reply_markup: replyMu || { remove_keyboard: false },
          },
        );
      }

      // ── Tarix ─────────────────────────────────────────────────────────────
      if (histOrders.length > 0) {
        let text =
          "<pre>📋 BUYURTMALAR TARIXI (" + histOrders.length + " ta)</pre>\n\n";
        histOrders.forEach((o, i) => {
          text += orderCard(o, i) + "\n";
        });
        await bot.sendMessage(chatId, text, { parse_mode: "HTML" });
      }
    } catch (err) {
      logger.error("Passenger tarix error:", err);
    }
  });
}

module.exports = { applyPassengerMenu };
