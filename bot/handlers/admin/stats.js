// handlers/admin/stats.js — Statistika va tizim

const User = require("../../models/User.model");
const Order = require("../../models/Order.model");
const Group = require("../../models/Group.model");
const config = require("../../config");
const logger = require("../../utils/logger");
const { isAdmin, fmtDate, adminMenu } = require("./utils");
const { getActiveListenerCount } = require("../../services/assignService");

function applyAdminStats(bot) {
  // ─── /admin ──────────────────────────────────────────────────────────────
  bot.onText(/\/admin/, async (msg) => {
    if (!isAdmin(msg.chat.id)) return;
    bot.sendMessage(
      msg.chat.id,
      "👑 <b>ADMIN PANEL</b>\n\nXush kelibsiz!",
      adminMenu(),
    );
  });

  // ─── Bosh menyuga qaytish ─────────────────────────────────────────────────
  bot.onText(/⬅️ Bosh menyu/, async (msg) => {
    if (!isAdmin(msg.chat.id)) return;
    const user = await User.findOne({ telegramId: Number(msg.chat.id) }).lean();
    bot.sendMessage(msg.chat.id, "Bosh menyuga qaytdingiz.", {
      reply_markup: {
        keyboard:
          user?.role === "driver"
            ? [
                ["🚖 Buyurtma qabul qilishni boshlash"],
                ["📋 Mening buyurtmalarim", "👤 Profilim"],
                ["📊 Statistika", "⭐ Reytingim"],
                ["/admin"],
              ]
            : [
                ["🚖 Buyurtma berish", "📦 Yuk/Pochta"],
                ["👤 Profilim", "📋 Tarixim"],
                ["/admin"],
              ],
        resize_keyboard: true,
      },
    });
  });

  // ─── 📊 Admin statistika ──────────────────────────────────────────────────
  bot.onText(/📊 Admin statistika/, async (msg) => {
    const chatId = msg.chat.id;
    if (!isAdmin(chatId)) return;
    await _sendStats(bot, chatId);
  });

  // ─── 🔧 Tizim ─────────────────────────────────────────────────────────────
  bot.onText(/🔧 Tizim/, async (msg) => {
    const chatId = msg.chat.id;
    if (!isAdmin(chatId)) return;
    _sendSystemInfo(bot, chatId);
  });

  // ─── CALLBACKS ────────────────────────────────────────────────────────────
  bot.on("callback_query", async (query) => {
    if (!isAdmin(query.from.id)) return;
    const chatId = query.from.id;
    const data = query.data;

    if (data === "adm_stat_refresh") {
      await bot.answerCallbackQuery(query.id, { text: "🔄 Yangilanmoqda..." });
      const text = await _buildStatsText();
      await bot
        .editMessageText(text, {
          chat_id: chatId,
          message_id: query.message.message_id,
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [
                { text: "🔄 Yangilash", callback_data: "adm_stat_refresh" },
                { text: "🔧 Tizim", callback_data: "adm_system_info" },
              ],
            ],
          },
        })
        .catch(() => {});
      return;
    }

    if (data === "adm_system_info") {
      await bot.answerCallbackQuery(query.id);
      _sendSystemInfo(bot, chatId);
      return;
    }

    if (data === "adm_cleanup") {
      await bot.answerCallbackQuery(query.id, { text: "🧹 Tozalanmoqda..." });
      const cutoff = new Date(Date.now() - 30 * 86400000);
      const result = await Order.deleteMany({
        status: { $in: ["pending", "cancelled"] },
        createdAt: { $lt: cutoff },
      });
      bot.sendMessage(
        chatId,
        `✅ ${result.deletedCount} ta eski buyurtma o'chirildi.`,
      );
      return;
    }

    if (data === "adm_fixseats") {
      await bot.answerCallbackQuery(query.id, { text: "🔄 Tuzatilmoqda..." });
      await User.updateMany({ role: "driver" }, { usedSeats: 0 });
      const active = await Order.find({
        status: {
          $in: [
            "accepted",
            "in_progress",
            "driver_confirmed",
            "passenger_confirmed",
          ],
        },
        orderType: "passenger",
      }).lean();
      for (const o of active) {
        await User.findOneAndUpdate(
          { telegramId: o.driverId },
          { $inc: { usedSeats: o.passengers || 1 } },
        );
      }
      bot.sendMessage(
        chatId,
        `✅ usedSeats qayta hisoblandi.\nAktiv: <b>${active.length}</b> ta`,
        { parse_mode: "HTML" },
      );
      return;
    }
  });
}

async function _buildStatsText() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const week = new Date(Date.now() - 7 * 86400000);
  const [tu, dr, pa, bl, to, pe, ac, co, ca, td, wk, tg, ag, ad] =
    await Promise.all([
      User.countDocuments(),
      User.countDocuments({ role: "driver" }),
      User.countDocuments({ role: "passenger" }),
      User.countDocuments({ isBlocked: true }),
      Order.countDocuments(),
      Order.countDocuments({ status: "pending" }),
      Order.countDocuments({
        status: {
          $in: [
            "accepted",
            "in_progress",
            "driver_confirmed",
            "passenger_confirmed",
          ],
        },
      }),
      Order.countDocuments({ status: "completed" }),
      Order.countDocuments({ status: "cancelled" }),
      Order.countDocuments({ createdAt: { $gte: today } }),
      Order.countDocuments({ createdAt: { $gte: week } }),
      Group.countDocuments(),
      Group.countDocuments({ isActive: true }),
      User.countDocuments({ role: "driver", isActive: true }),
    ]);

  const fmtDate = (d) =>
    new Date(d).toLocaleString("uz-UZ", {
      timeZone: "Asia/Tashkent",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    `<pre>📊 ADMIN STATISTIKA</pre>\n\n` +
    `👥 <b>FOYDALANUVCHILAR</b>\n` +
    `Jami: <b>${tu}</b> | 🚗 ${dr} | 🧍 ${pa}\n` +
    `🚫 Bloklangan: <b>${bl}</b> | 🟢 Aktiv: <b>${ad}</b>\n\n` +
    `📦 <b>BUYURTMALAR</b>\n` +
    `Jami: <b>${to}</b>\n` +
    `⏳ ${pe} | ⚡ ${ac} | ✅ ${co} | ❌ ${ca}\n` +
    `📅 Bugun: <b>${td}</b> | 📆 7 kun: <b>${wk}</b>\n\n` +
    `📢 Guruhlar: <b>${tg}</b> | Faol: <b>${ag}</b>\n\n` +
    `🔄 Listeners: <b>${getActiveListenerCount()}</b>\n` +
    `🖥 Muhit: <b>${config.NODE_ENV.toUpperCase()}</b>\n` +
    `🕐 <b>${fmtDate(new Date())}</b>`
  );
}

async function _sendStats(bot, chatId) {
  try {
    const text = await _buildStatsText();
    bot.sendMessage(chatId, text, {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            { text: "🔄 Yangilash", callback_data: "adm_stat_refresh" },
            { text: "🔧 Tizim", callback_data: "adm_system_info" },
          ],
        ],
      },
    });
  } catch (err) {
    bot.sendMessage(chatId, "❌ Xatolik: " + err.message);
  }
}

function _sendSystemInfo(bot, chatId) {
  const mem = process.memoryUsage();
  const uptime = Math.floor(process.uptime());
  const h = Math.floor(uptime / 3600);
  const m = Math.floor((uptime % 3600) / 60);
  bot.sendMessage(
    chatId,
    `<pre>🔧 TIZIM</pre>\n\n` +
      `⏱ Uptime: <b>${h}s ${m}d</b>\n` +
      `💾 RAM: <b>${Math.round(mem.heapUsed / 1024 / 1024)} MB</b>\n` +
      `📦 Node: <b>${process.version}</b>\n` +
      `🌍 Muhit: <b>${config.NODE_ENV.toUpperCase()}</b>\n` +
      `🔄 Listeners: <b>${getActiveListenerCount()}</b>`,
    {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "🧹 Eski buyurtmalarni tozalash",
              callback_data: "adm_cleanup",
            },
            { text: "🔄 Seats tuzatish", callback_data: "adm_fixseats" },
          ],
        ],
      },
    },
  );
}

module.exports = { applyAdminStats };
