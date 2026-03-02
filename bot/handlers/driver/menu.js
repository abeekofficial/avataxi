// handlers/driver/menu.js
const User  = require("../../models/User.model");
const Order = require("../../models/Order.model");
const logger = require("../../utils/logger");
const { getRegionName } = require("../../utils/regionOptions");
const { isDriverBusy }  = require("../../services/driverService");
const { createDriverRegionKeyboard } = require("./routeSelect");
const { createSession } = require("../../cache/sessionCache");

function getStatusText(status) {
  const map = {
    pending:            "Kutilmoqda",
    accepted:           "Qabul qilindi",
    in_progress:        "Jarayonda",
    driver_confirmed:   "Haydovchi tasdiqladi",
    passenger_confirmed:"Yo'lovchi tasdiqladi",
    completed:          "Yakunlandi",
    cancelled:          "Bekor qilindi",
  };
  return map[status] || status;
}

function applyDriverMenu(bot) {
  // ── Buyurtma qabul qilishni boshlash ────────────────────────────────────────
  bot.onText(/🚖 Buyurtma qabul qilishni boshlash/, async (msg) => {
    const chatId = msg.chat.id;
    try {
      const user = await User.findOne({ telegramId: chatId, role: "driver" });
      if (!user) return;

      if (await isDriverBusy(chatId)) {
        return bot.sendMessage(
          chatId,
          "⚠️ <b>Sizda yakunlanmagan buyurtma bor!</b>\n\nAvval uni yakunlang.",
          { parse_mode: "HTML" },
        );
      }

      await createSession(chatId, "DRIVER_FROM", { role: "driver_route" });

      await bot.sendMessage(
        chatId,
        "📍 Qayerdan yo'lga chiqasiz?",
        createDriverRegionKeyboard(),
      );
    } catch (err) {
      logger.error("Buyurtma qabul boshlash error:", err);
    }
  });

  // ── Buyurtma qabul qilishni to'xtatish ─────────────────────────────────────
  bot.onText(/🚖 Buyurtma qabul qilishni to'xtatish/, async (msg) => {
    const chatId = msg.chat.id;
    try {
      await User.findOneAndUpdate({ telegramId: chatId }, { isActive: false });
      await bot.sendMessage(
        chatId,
        "⏸ <b>Buyurtma qabul qilish to'xtatildi.</b>\n\nQayta boshlash uchun tugmani bosing.",
        {
          parse_mode: "HTML",
          reply_markup: {
            keyboard: [
              ["🚖 Buyurtma qabul qilishni boshlash"],
              ["📋 Buyurtmalar", "👤 Profilim"],
              ["📊 Statistika", "⭐ Reytingim", "📋 Bot haqida"],
            ],
            resize_keyboard: true,
          },
        },
      );
    } catch (err) {
      logger.error("To'xtatish error:", err);
    }
  });

  // ── Buyurtmalar menyusi ─────────────────────────────────────────────────────
  bot.onText(/📋 Buyurtmalar/, async (msg) => {
    const chatId = msg.chat.id;
    try {
      const user = await User.findOne({ telegramId: chatId });
      if (!user || user.role !== "driver") return;

      bot.sendMessage(chatId, "📋 Qaysi buyurtmalarni ko'rmoqchisiz?", {
        reply_markup: {
          keyboard: [
            ["🚗 Mening buyurtmalarim"],
            ["🌍 Barcha buyurtmalar"],
            ["⬅️ Bosh menuga qaytish"],
          ],
          resize_keyboard: true,
        },
      });
    } catch (err) {
      logger.error("Buyurtmalar menu error:", err);
    }
  });

  // ── Mening buyurtmalarim ────────────────────────────────────────────────────
  bot.onText(/🚗 Mening buyurtmalarim/, async (msg) => {
    const chatId = msg.chat.id;
    try {
      const orders = await Order.find({
        driverId: chatId,
        status: { $in: ["accepted", "in_progress", "driver_confirmed"] },
      }).sort({ createdAt: -1 });

      if (orders.length === 0) {
        return bot.sendMessage(chatId, "❌ Sizda faol buyurtmalar yo'q");
      }

      let text = `<pre>🚗 MENING BUYURTMALARIM (${orders.length} ta):</pre>\n\n`;
      orders.forEach((order, i) => {
        const statusEmoji = { accepted: "✅", in_progress: "🚕", driver_confirmed: "⏳" };
        const icon = order.orderType === "cargo" ? "📦" : "👥";
        text += `${i + 1}. ${statusEmoji[order.status] || "📦"} <b>${getRegionName(order.from)} → ${getRegionName(order.to)}</b>\n`;
        text += `   ${icon} `;
        text += order.orderType === "cargo"
          ? `Yuk: <b>${order.cargoDescription || "-"}</b>\n`
          : `<b>${order.passengers || 1} kishi</b>\n`;
        text += `   Status: <b>${getStatusText(order.status)}</b>\n`;
        text += `   ID: ${order._id.toString().slice(-6)}\n\n`;
      });

      bot.sendMessage(chatId, text, { parse_mode: "HTML" });
    } catch (err) {
      logger.error("Mening buyurtmalarim error:", err);
    }
  });

  // ── Barcha buyurtmalar (pending) ────────────────────────────────────────────
  bot.onText(/🌍 Barcha buyurtmalar/, async (msg) => {
    const chatId = msg.chat.id;
    try {
      const user = await User.findOne({ telegramId: chatId });
      if (!user || user.role !== "driver") return;

      if (await isDriverBusy(chatId)) {
        return bot.sendMessage(
          chatId,
          "⚠️ <b>Sizda yakunlanmagan buyurtma bor!</b>\n\nAvval uni yakunlang yoki bekor qiling.",
          { parse_mode: "HTML" },
        );
      }

      const orders = await Order.find({ status: "pending", driverId: null })
        .sort({ createdAt: -1 })
        .limit(10);

      if (orders.length === 0) {
        return bot.sendMessage(chatId, "❌ Hozircha buyurtmalar yo'q");
      }

      for (const order of orders) {
        const icon = order.orderType === "cargo" ? "📦" : "👥";
        const typeText = order.orderType === "cargo"
          ? `Yuk: ${order.cargoDescription || "-"}`
          : `Yo'lovchilar: ${order.passengers || 1} kishi`;
        const passenger = await User.findOne({ telegramId: order.passengerId }).lean();

        const text =
          `<pre>🚖 YANGI BUYURTMA</pre>\n\n` +
          `📍 <b>${getRegionName(order.from)} → ${getRegionName(order.to)}</b>\n` +
          `${icon} <b>${typeText}</b>\n\n` +
          `👤 <b>${passenger?.name || "-"}</b>\n` +
          `📱 <b>${passenger?.phone || "-"}</b>\n` +
          `💬 ${passenger?.username ? `@${passenger.username}` : "yo'q"}\n\n` +
          `🕐 <b>${new Date(order.createdAt).toLocaleTimeString("uz-UZ", { hour: "2-digit", minute: "2-digit" })}</b>`;

        await bot.sendMessage(chatId, text, {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [[
              { text: "▶️ Qabul qilish", callback_data: `accept_${order._id}` },
              { text: "❌ Rad etish",    callback_data: `reject_${order._id}` },
            ]],
          },
        });
      }
    } catch (err) {
      logger.error("Barcha buyurtmalar error:", err);
    }
  });

  // ── Profil ──────────────────────────────────────────────────────────────────
  bot.onText(/👤 Profilim/, async (msg) => {
    const chatId = msg.chat.id;
    try {
      const user = await User.findOne({ telegramId: chatId, role: "driver" });
      if (!user) return;

      const fromName = user.from ? getRegionName(user.from) : "Tanlanmagan";
      const toName   = user.to   ? getRegionName(user.to)   : "Tanlanmagan";

      const text =
        `<pre>👤 MENING PROFILIM</pre>\n\n` +
        `👤 Ism: <b>${user.name}</b>\n` +
        `📱 Telefon: <b>${user.phone}</b>\n` +
        `🚙 Mashina: <b>${user.carModel || "-"}</b>\n` +
        `🔢 Raqam: <b>${user.carNumber || "-"}</b>\n` +
        `📍 Yo'nalish: <b>${fromName} → ${toName}</b>\n` +
        `⭐ Reyting: <b>${user.rating?.toFixed(1) || "5.0"}</b>\n` +
        `✅ Bajarilgan: <b>${user.completedOrders} ta</b>\n` +
        `👥 Referallar: <b>${user.referralCount} ta</b>\n` +
        `🔘 Holat: <b>${user.isActive ? "Aktiv ✅" : "Nofaol ⏸"}</b>`;

      bot.sendMessage(chatId, text, { parse_mode: "HTML" });
    } catch (err) {
      logger.error("Profil error:", err);
    }
  });

  // ── Statistika ──────────────────────────────────────────────────────────────
  bot.onText(/📊 Statistika/, async (msg) => {
    const chatId = msg.chat.id;
    try {
      const user = await User.findOne({ telegramId: chatId, role: "driver" });
      if (!user) return;

      const text =
        `<pre>📊 STATISTIKA</pre>\n\n` +
        `✅ Bajarilgan zakazlar: <b>${user.completedOrders}</b>\n` +
        `⭐ Reyting: <b>${user.rating?.toFixed(1) || "5.0"} / 5.0</b>\n` +
        `🏆 Baholar soni: <b>${user.ratingCount || 0} ta</b>\n` +
        `👥 Referallar: <b>${user.referralCount} ta</b>\n\n` +
        `🏆 Daraja: ${getRankEmoji(user.rating, user.completedOrders)}`;

      bot.sendMessage(chatId, text, { parse_mode: "HTML" });
    } catch (err) {
      logger.error("Statistika error:", err);
    }
  });

  // ── Reyting ─────────────────────────────────────────────────────────────────
  bot.onText(/⭐ Reytingim/, async (msg) => {
    const chatId = msg.chat.id;
    try {
      const user = await User.findOne({ telegramId: chatId, role: "driver" });
      if (!user) return;

      const text =
        `<pre>⭐ REYTINGIM</pre>\n\n` +
        `👤 ${user.name}\n` +
        `⭐ Rating: <b>${user.rating?.toFixed(1) || "5.0"} / 5.0</b>\n` +
        `🏆 Baholar soni: <b>${user.ratingCount || 0} ta</b>\n\n` +
        `🏆 Daraja: ${getRankEmoji(user.rating, user.completedOrders)}`;

      bot.sendMessage(chatId, text, { parse_mode: "HTML" });
    } catch (err) {
      logger.error("Reyting error:", err);
    }
  });
}

function getRankEmoji(rating, completed) {
  if (rating >= 4.8 && completed >= 50) return "🥇 A'LO HAYDOVCHI";
  if (rating >= 4.5 && completed >= 20) return "🥈 YAXSHI HAYDOVCHI";
  if (rating >= 4.0) return "🥉 O'RTA HAYDOVCHI";
  return "🆕 YANGI HAYDOVCHI";
}

module.exports = { applyDriverMenu };
