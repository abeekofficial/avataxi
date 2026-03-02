// handlers/admin.js
const User   = require("../models/User.model");
const Order  = require("../models/Order.model");
const Group  = require("../models/Group.model");
const config = require("../config");
const logger = require("../utils/logger");
const { getActiveListenerCount } = require("../services/assignService");

function isAdmin(chatId) {
  return config.bot.adminIds.includes(Number(chatId));
}

function applyAdmin(bot) {
  // ─── Admin komandalar ──────────────────────────────────────────────────────
  bot.onText(/\/admin/, async (msg) => {
    const chatId = msg.chat.id;
    if (!isAdmin(chatId)) return;

    bot.sendMessage(chatId, "👑 <b>ADMIN PANEL</b>", {
      parse_mode: "HTML",
      reply_markup: {
        keyboard: [
          ["📊 Statistika", "👤 Foydalanuvchilar"],
          ["🚗 Haydovchilar", "📦 Buyurtmalar"],
          ["📢 Guruhlar", "🔧 Tizim"],
        ],
        resize_keyboard: true,
      },
    });
  });

  // ─── Statistika ────────────────────────────────────────────────────────────
  bot.onText(/📊 Statistika/, async (msg) => {
    const chatId = msg.chat.id;
    if (!isAdmin(chatId)) return;

    try {
      const [
        totalUsers,
        totalDrivers,
        totalPassengers,
        totalOrders,
        pendingOrders,
        completedOrders,
        cancelledOrders,
        totalGroups,
        activeListeners,
      ] = await Promise.all([
        User.countDocuments(),
        User.countDocuments({ role: "driver" }),
        User.countDocuments({ role: "passenger" }),
        Order.countDocuments(),
        Order.countDocuments({ status: "pending" }),
        Order.countDocuments({ status: "completed" }),
        Order.countDocuments({ status: "cancelled" }),
        Group.countDocuments({ isActive: true }),
        Promise.resolve(getActiveListenerCount()),
      ]);

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayOrders = await Order.countDocuments({ createdAt: { $gte: today } });

      const text =
        `<pre>📊 TIZIM STATISTIKASI</pre>\n\n` +
        `👥 Jami foydalanuvchilar: <b>${totalUsers}</b>\n` +
        `🚗 Haydovchilar: <b>${totalDrivers}</b>\n` +
        `🧍 Yo'lovchilar: <b>${totalPassengers}</b>\n\n` +
        `📦 Jami buyurtmalar: <b>${totalOrders}</b>\n` +
        `⏳ Kutilmoqda: <b>${pendingOrders}</b>\n` +
        `✅ Yakunlangan: <b>${completedOrders}</b>\n` +
        `❌ Bekor qilingan: <b>${cancelledOrders}</b>\n` +
        `📅 Bugun: <b>${todayOrders}</b>\n\n` +
        `📢 Faol guruhlar: <b>${totalGroups}</b>\n` +
        `🔄 Aktiv listenerlar: <b>${activeListeners}</b>\n` +
        `💾 NODE ENV: ${config.NODE_ENV}`;

      bot.sendMessage(chatId, text, { parse_mode: "HTML" });
    } catch (err) {
      logger.error("Admin stat error:", err);
      bot.sendMessage(chatId, "❌ Xatolik: " + err.message);
    }
  });

  // ─── Guruhlar ──────────────────────────────────────────────────────────────
  bot.onText(/📢 Guruhlar/, async (msg) => {
    const chatId = msg.chat.id;
    if (!isAdmin(chatId)) return;

    try {
      const groups = await Group.find().sort({ totalOrders: -1 }).limit(20);

      if (groups.length === 0) {
        return bot.sendMessage(chatId, "❌ Guruhlar yo'q. Botni guruhga qo'shing.");
      }

      let text = `<pre>📢 GURUHLAR (${groups.length} ta):</pre>\n\n`;
      groups.forEach((g, i) => {
        text += `${i + 1}. <b>${g.title}</b>\n`;
        text += `   ID: <code>${g.groupId}</code>\n`;
        text += `   Status: ${g.isActive ? "✅ Faol" : "❌ Nofaol"}\n`;
        text += `   Buyurtmalar: ${g.totalOrders}\n\n`;
      });

      bot.sendMessage(chatId, text, { parse_mode: "HTML" });
    } catch (err) {
      logger.error("Admin groups error:", err);
    }
  });

  // ─── Guruh qo'shish ────────────────────────────────────────────────────────
  bot.on("message", async (msg) => {
    if (!msg.new_chat_members) return;
    const botInfo = await bot.getMe();
    const addedBot = msg.new_chat_members?.some((m) => m.id === botInfo.id);
    if (!addedBot) return;

    const groupId = msg.chat.id;
    const title   = msg.chat.title || "Noma'lum guruh";

    await Group.findOneAndUpdate(
      { groupId },
      { groupId, title, isActive: true, addedBy: msg.from?.id },
      { upsert: true, new: true },
    );

    logger.success(`Bot guruhga qo'shildi: ${title} (${groupId})`);

    // Admin ga xabar
    for (const adminId of config.bot.adminIds) {
      try {
        await bot.sendMessage(
          adminId,
          `✅ Bot yangi guruhga qo'shildi:\n<b>${title}</b>\nID: <code>${groupId}</code>`,
          { parse_mode: "HTML" },
        );
      } catch (e) { /* ignore */ }
    }
  });

  // ─── Foydalanuvchilarni tekshirish (ID bo'yicha) ──────────────────────────
  bot.onText(/\/user (\d+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    if (!isAdmin(chatId)) return;

    try {
      const userId = Number(match[1]);
      const user   = await User.findOne({ telegramId: userId });

      if (!user) {
        return bot.sendMessage(chatId, `❌ User topilmadi: ${userId}`);
      }

      const orders = await Order.countDocuments({ passengerId: userId });

      const text =
        `👤 <b>${user.name}</b>\n\n` +
        `📱 Telefon: ${user.phone}\n` +
        `🎭 Role: ${user.role}\n` +
        `⭐ Rating: ${user.rating?.toFixed(1) || "5.0"}\n` +
        `✅ Zakazlar: ${user.completedOrders || 0}\n` +
        `📦 Jami buyurtmalar: ${orders}\n` +
        `🚫 Bloklangan: ${user.isBlocked ? "Ha" : "Yo'q"}\n` +
        `📅 Ro'yxat: ${user.createdAt?.toLocaleDateString("uz-UZ")}`;

      bot.sendMessage(chatId, text, {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [[
            { text: user.isBlocked ? "✅ Blokdan chiqarish" : "🚫 Bloklash",
              callback_data: `admin_block_${userId}` },
          ]],
        },
      });
    } catch (err) {
      logger.error("Admin user lookup error:", err);
    }
  });

  // ─── Block/Unblock callback ────────────────────────────────────────────────
  bot.on("callback_query", async (query) => {
    if (!isAdmin(query.from.id)) return;
    if (!query.data.startsWith("admin_block_")) return;

    const userId = Number(query.data.replace("admin_block_", ""));
    const user   = await User.findOne({ telegramId: userId });
    if (!user) return;

    user.isBlocked = !user.isBlocked;
    await user.save();

    await bot.answerCallbackQuery(query.id, {
      text: user.isBlocked ? "✅ Foydalanuvchi bloklandi" : "✅ Blokdan chiqarildi",
      show_alert: true,
    });

    logger.info(`Admin ${user.isBlocked ? "blocked" : "unblocked"}: ${userId}`);
  });
}

module.exports = { applyAdmin };
