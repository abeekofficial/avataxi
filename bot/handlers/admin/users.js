// handlers/admin/users.js — Foydalanuvchilar boshqaruvi

const User = require("../../models/User.model");
const Order = require("../../models/Order.model");
const logger = require("../../utils/logger");
const { isAdmin, fmtDate, sendUserCard, userButtons } = require("./utils");
const { freeDriverSeats } = require("../../services/driverService");
const { getRegionName } = require("../../utils/regionOptions");
const {
  getSession,
  createSession,
  deleteSession,
} = require("../../cache/sessionCache");

const S_ICON = {
  pending: "⏳",
  accepted: "✅",
  in_progress: "🚕",
  driver_confirmed: "🔄",
  passenger_confirmed: "🔄",
  completed: "🏁",
  cancelled: "❌",
};

function applyAdminUsers(bot) {
  // ─── 👥 Foydalanuvchilar ──────────────────────────────────────────────────
  bot.onText(/👥 Foydalanuvchilar/, async (msg) => {
    const chatId = msg.chat.id;
    if (!isAdmin(chatId)) return;
    const [d, p, bl] = await Promise.all([
      User.countDocuments({ role: "driver" }),
      User.countDocuments({ role: "passenger" }),
      User.countDocuments({ isBlocked: true }),
    ]);
    bot.sendMessage(
      chatId,
      `<pre>👥 FOYDALANUVCHILAR</pre>\n\n🚗 Haydovchilar: <b>${d}</b>\n🧍 Yo'lovchilar: <b>${p}</b>\n🚫 Bloklangan: <b>${bl}</b>`,
      {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [
              { text: "🚗 Haydovchilar", callback_data: "adm_list_drivers" },
              { text: "🧍 Yo'lovchilar", callback_data: "adm_list_passengers" },
            ],
            [
              {
                text: "🟢 Aktiv haydovchilar",
                callback_data: "adm_list_active",
              },
              { text: "🚫 Bloklangan", callback_data: "adm_list_blocked" },
            ],
            [
              { text: "🔍 ID bo'yicha", callback_data: "adm_search_id" },
              { text: "🔍 Ism / telefon", callback_data: "adm_search_text" },
            ],
          ],
        },
      },
    );
  });

  // ─── 🚗 Haydovchilar (menyu tugmasi) ─────────────────────────────────────
  bot.onText(/🚗 Haydovchilar/, async (msg) => {
    const chatId = msg.chat.id;
    if (!isAdmin(chatId)) return;
    const [total, active, busy] = await Promise.all([
      User.countDocuments({ role: "driver" }),
      User.countDocuments({ role: "driver", isActive: true }),
      Order.countDocuments({ status: { $in: ["accepted", "in_progress"] } }),
    ]);
    bot.sendMessage(
      chatId,
      `<pre>🚗 HAYDOVCHILAR</pre>\n\nJami: <b>${total}</b>\nAktiv: <b>${active}</b>\nSafarda: <b>${busy}</b>`,
      {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [
              { text: "📋 Ro'yxat", callback_data: "adm_list_drivers" },
              { text: "🟢 Aktiv", callback_data: "adm_list_active" },
            ],
            [
              { text: "🔍 ID", callback_data: "adm_search_id" },
              { text: "🔍 Ism/tel", callback_data: "adm_search_text" },
            ],
          ],
        },
      },
    );
  });

  // ─── 🔍 Qidirish (menyu tugmasi) ─────────────────────────────────────────
  bot.onText(/🔍 Qidirish/, async (msg) => {
    const chatId = msg.chat.id;
    if (!isAdmin(chatId)) return;
    bot.sendMessage(chatId, "<b>🔍 QIDIRISH</b>", {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            { text: "👤 Foydalanuvchi ID", callback_data: "adm_search_id" },
            { text: "👤 Ism / telefon", callback_data: "adm_search_text" },
          ],
          [{ text: "📦 Buyurtma ID", callback_data: "adm_search_order" }],
        ],
      },
    });
  });

  // ─── CALLBACKS ────────────────────────────────────────────────────────────
  bot.on("callback_query", async (query) => {
    if (!isAdmin(query.from.id)) return;
    const chatId = query.from.id;
    const data = query.data;

    // Ro'yxatlar
    if (data === "adm_list_drivers") {
      await bot.answerCallbackQuery(query.id);
      const list = await User.find({ role: "driver" })
        .sort({ completedOrders: -1 })
        .limit(20)
        .lean();
      if (!list.length) return bot.sendMessage(chatId, "Haydovchi yo'q.");
      let text = `<pre>🚗 HAYDOVCHILAR (${list.length} ta)</pre>\n\n`;
      list.forEach((d, i) => {
        text += `${i + 1}. <b>${d.name}</b> | ⭐${d.rating?.toFixed(1) || "5.0"} | ✅${d.completedOrders || 0} | ${d.isActive ? "🟢" : "⚪"}${d.isBlocked ? " 🚫" : ""}\n   📱 ${d.phone}\n`;
      });
      return bot.sendMessage(chatId, text, {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: list.map((d) => [
            {
              text: `${d.isBlocked ? "🚫" : d.isActive ? "🟢" : "⚪"} ${d.name}`,
              callback_data: "adm_view_user_" + d.telegramId,
            },
          ]),
        },
      });
    }

    if (data === "adm_list_passengers") {
      await bot.answerCallbackQuery(query.id);
      const list = await User.find({ role: "passenger" })
        .sort({ createdAt: -1 })
        .limit(20)
        .lean();
      if (!list.length) return bot.sendMessage(chatId, "Yo'lovchi yo'q.");
      let text = `<pre>🧍 YO'LOVCHILAR (${list.length} ta)</pre>\n\n`;
      list.forEach((u, i) => {
        text += `${i + 1}. <b>${u.name}</b>${u.isBlocked ? " 🚫" : ""}\n   📱 ${u.phone}\n`;
      });
      return bot.sendMessage(chatId, text, {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: list.map((u) => [
            {
              text: `${u.isBlocked ? "🚫 " : "🧍 "}${u.name}`,
              callback_data: "adm_view_user_" + u.telegramId,
            },
          ]),
        },
      });
    }

    if (data === "adm_list_active") {
      await bot.answerCallbackQuery(query.id);
      const list = await User.find({ role: "driver", isActive: true }).lean();
      if (!list.length)
        return bot.sendMessage(chatId, "🟢 Aktiv haydovchi yo'q.");
      let text = `<pre>🟢 AKTIV HAYDOVCHILAR (${list.length} ta)</pre>\n\n`;
      list.forEach((d, i) => {
        text += `${i + 1}. <b>${d.name}</b> | ⭐${d.rating?.toFixed(1) || "5.0"}\n   📍 ${d.from}→${d.to}\n`;
      });
      return bot.sendMessage(chatId, text, {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: list.map((d) => [
            {
              text: `🟢 ${d.name}`,
              callback_data: "adm_view_user_" + d.telegramId,
            },
          ]),
        },
      });
    }

    if (data === "adm_list_blocked") {
      await bot.answerCallbackQuery(query.id);
      const list = await User.find({ isBlocked: true }).lean();
      if (!list.length) return bot.sendMessage(chatId, "✅ Bloklangan yo'q.");
      let text = `<pre>🚫 BLOKLANGAN (${list.length} ta)</pre>\n\n`;
      list.forEach((u, i) => {
        text += `${i + 1}. ${u.role === "driver" ? "🚗" : "🧍"} <b>${u.name}</b>\n   <code>${u.telegramId}</code>\n`;
      });
      return bot.sendMessage(chatId, text, {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: list.map((u) => [
            {
              text: `${u.role === "driver" ? "🚗" : "🧍"} ${u.name}`,
              callback_data: "adm_view_user_" + u.telegramId,
            },
          ]),
        },
      });
    }

    // Qidirish
    if (data === "adm_search_id") {
      await bot.answerCallbackQuery(query.id);
      await createSession(chatId, "ADM_SEARCH_ID", {});
      return bot.sendMessage(chatId, "🆔 Telegram ID kiriting:");
    }

    if (data === "adm_search_text") {
      await bot.answerCallbackQuery(query.id);
      await createSession(chatId, "ADM_SEARCH_TEXT", {});
      return bot.sendMessage(chatId, "👤 Ism yoki telefon kiriting:");
    }

    // Profil ko'rish
    if (data.startsWith("adm_view_user_")) {
      await bot.answerCallbackQuery(query.id);
      const uid = Number(data.replace("adm_view_user_", ""));
      const user = await User.findOne({ telegramId: uid });
      if (!user) return bot.sendMessage(chatId, "❌ Topilmadi.");
      return sendUserCard(bot, chatId, user);
    }

    // Bloklash / blokdan chiqarish
    if (data.startsWith("adm_block_")) {
      const uid = Number(data.replace("adm_block_", ""));
      const user = await User.findOne({ telegramId: uid });
      if (!user)
        return bot.answerCallbackQuery(query.id, { text: "Topilmadi" });
      user.isBlocked = !user.isBlocked;
      await user.save();
      await bot.answerCallbackQuery(query.id, {
        text: user.isBlocked ? "🚫 Bloklandi" : "✅ Blokdan chiqarildi",
        show_alert: true,
      });
      try {
        await bot.sendMessage(
          uid,
          user.isBlocked
            ? "🚫 Akkauntingiz bloklandi. Admin bilan bog'laning."
            : "✅ Akkauntingiz blokdan chiqarildi. /start bosing.",
        );
      } catch (e) {}
      try {
        await bot.editMessageReplyMarkup(
          { inline_keyboard: userButtons(user) },
          { chat_id: chatId, message_id: query.message.message_id },
        );
      } catch (e) {}
      logger.info(`Admin ${user.isBlocked ? "blocked" : "unblocked"}: ${uid}`);
      return;
    }

    // User buyurtmalari
    if (data.startsWith("adm_user_orders_")) {
      const uid = Number(data.replace("adm_user_orders_", ""));
      const user = await User.findOne({ telegramId: uid }).lean();
      const field = user?.role === "driver" ? "driverId" : "passengerId";
      const orders = await Order.find({ [field]: uid })
        .sort({ createdAt: -1 })
        .limit(10)
        .lean();
      if (!orders.length)
        return bot.answerCallbackQuery(query.id, { text: "Buyurtmalar yo'q" });
      await bot.answerCallbackQuery(query.id);
      let t = `<pre>📦 BUYURTMALAR (${orders.length} ta)</pre>\n\n`;
      orders.forEach((o, i) => {
        t += `${i + 1}. ${S_ICON[o.status] || "?"} ${getRegionName(o.from)}→${getRegionName(o.to)} | ${fmtDate(o.createdAt)}\n`;
      });
      return bot.sendMessage(chatId, t, {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: orders.map((o) => [
            {
              text: `${S_ICON[o.status] || "?"} ${getRegionName(o.from)}→${getRegionName(o.to)}`,
              callback_data: "adm_ord_view_" + o._id,
            },
          ]),
        },
      });
    }

    // Admin xabar yuborish — maqsad tanlash
    if (data.startsWith("adm_msg_")) {
      await bot.answerCallbackQuery(query.id);
      const targetId = Number(data.replace("adm_msg_", ""));
      await createSession(chatId, "ADM_MSG_TEXT", { targetId });
      const user = await User.findOne({ telegramId: targetId }).lean();
      return bot.sendMessage(
        chatId,
        `💬 <b>${user?.name || targetId}</b> ga xabar yuboring:`,
        { parse_mode: "HTML" },
      );
    }

    // Driver aktiv buyurtmalarini force yakunlash
    if (data.startsWith("adm_finish_")) {
      const driverId = Number(data.replace("adm_finish_", ""));
      const orders = await Order.find({
        driverId,
        status: {
          $in: [
            "accepted",
            "in_progress",
            "driver_confirmed",
            "passenger_confirmed",
          ],
        },
      });
      let cnt = 0;
      for (const o of orders) {
        o.status = "completed";
        o.completedAt = new Date();
        await o.save();
        if (o.orderType === "passenger")
          await freeDriverSeats(driverId, o.passengers || 1);
        cnt++;
      }
      bot.answerCallbackQuery(query.id, {
        text: `${cnt} ta yakunlandi`,
        show_alert: true,
      });
      return;
    }
  });

  // ─── SESSION orqali qidirish ──────────────────────────────────────────────
  bot.on("message", async (msg) => {
    if (msg.chat.type !== "private") return;
    const chatId = msg.chat.id;
    if (!isAdmin(chatId)) return;
    const session = await getSession(chatId);
    if (!session) return;

    if (session.step === "ADM_SEARCH_ID") {
      await deleteSession(chatId);
      const uid = parseInt(msg.text);
      if (isNaN(uid)) return bot.sendMessage(chatId, "❌ Noto'g'ri ID.");
      const user = await User.findOne({ telegramId: uid });
      if (!user) return bot.sendMessage(chatId, "❌ Topilmadi: " + uid);
      return sendUserCard(bot, chatId, user);
    }

    if (session.step === "ADM_SEARCH_TEXT") {
      await deleteSession(chatId);
      const q = msg.text.trim();
      const users = await User.find({
        $or: [
          { name: { $regex: q, $options: "i" } },
          { phone: { $regex: q, $options: "i" } },
          { username: { $regex: q, $options: "i" } },
        ],
      })
        .limit(5)
        .lean();
      if (!users.length) return bot.sendMessage(chatId, "❌ Topilmadi: " + q);
      for (const u of users) await sendUserCard(bot, chatId, u);
      return;
    }

    if (session.step === "ADM_MSG_TEXT") {
      const { targetId } = session.data;
      await deleteSession(chatId);
      let text = null,
        mediaType = null,
        fileId = null;
      if (msg.text) {
        text = `📢 <b>Admin xabari:</b>\n\n${msg.text}`;
      } else if (msg.photo) {
        fileId = msg.photo[msg.photo.length - 1].file_id;
        mediaType = "photo";
        text = `📢 <b>Admin xabari:</b>${msg.caption ? "\n\n" + msg.caption : ""}`;
      } else {
        return bot.sendMessage(chatId, "❌ Faqat matn yoki rasm yuboring.");
      }
      try {
        if (mediaType === "photo") {
          await bot.sendPhoto(targetId, fileId, {
            caption: text,
            parse_mode: "HTML",
          });
        } else {
          await bot.sendMessage(targetId, text, { parse_mode: "HTML" });
        }
        bot.sendMessage(chatId, "✅ Xabar yuborildi.");
      } catch (e) {
        bot.sendMessage(chatId, "❌ Yuborilmadi: " + e.message);
      }
      return;
    }
  });
}

module.exports = { applyAdminUsers };
