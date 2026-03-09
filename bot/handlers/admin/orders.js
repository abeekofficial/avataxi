// handlers/admin/orders.js — Buyurtmalar boshqaruvi

const Order = require("../../models/Order.model");
const User = require("../../models/User.model");
const logger = require("../../utils/logger");
const { isAdmin, fmtDate } = require("./utils");
const { freeDriverSeats } = require("../../services/driverService");
const { getRegionName } = require("../../utils/regionOptions");
const {
  getSession,
  createSession,
  deleteSession,
} = require("../../cache/sessionCache");

const STATUS_MAP = {
  pending: "⏳ Kutilmoqda",
  accepted: "✅ Qabul",
  in_progress: "🚕 Jarayonda",
  driver_confirmed: "🔄 Driver tasdiqladi",
  passenger_confirmed: "🔄 Passenger tasdiqladi",
  completed: "🏁 Yakunlandi",
  cancelled: "❌ Bekor",
};
const S_ICON = {
  pending: "⏳",
  accepted: "✅",
  in_progress: "🚕",
  driver_confirmed: "🔄",
  passenger_confirmed: "🔄",
  completed: "🏁",
  cancelled: "❌",
};
const ACTIVE_ST = [
  "accepted",
  "in_progress",
  "driver_confirmed",
  "passenger_confirmed",
];

// ─── Buyurtma kartasi ─────────────────────────────────────────────────────────
async function sendOrderCard(bot, chatId, order) {
  const [passenger, driver] = await Promise.all([
    User.findOne({ telegramId: order.passengerId }).lean(),
    order.driverId ? User.findOne({ telegramId: order.driverId }).lean() : null,
  ]);

  let text = "<pre>📦 BUYURTMA</pre>\n\n";
  text += `🆔 <code>${order._id}</code>\n`;
  text += `Holat: <b>${STATUS_MAP[order.status] || order.status}</b>\n`;
  text += `📍 <b>${getRegionName(order.from)} → ${getRegionName(order.to)}</b>\n`;
  text +=
    order.orderType === "cargo"
      ? `📦 Yuk: ${order.cargoDescription || "—"}\n`
      : `👥 ${order.passengers || 1} kishi\n`;
  text += "\n";

  if (passenger) {
    const pLink = passenger.username
      ? `<a href="https://t.me/${passenger.username}">${passenger.name}</a>`
      : `<a href="tg://user?id=${passenger.telegramId}">${passenger.name}</a>`;
    text += `🧍 ${pLink} | 📱 ${passenger.phone}\n`;
  }
  if (driver) {
    const dLink = driver.username
      ? `<a href="https://t.me/${driver.username}">${driver.name}</a>`
      : `<a href="tg://user?id=${driver.telegramId}">${driver.name}</a>`;
    text += `🚗 ${dLink} | 📱 ${driver.phone}\n`;
    if (driver.carModel)
      text += `   🚙 ${driver.carModel} | ${driver.carNumber}\n`;
  }

  text += `\n📅 ${fmtDate(order.createdAt)}`;
  if (order.acceptedAt) text += `\n✅ ${fmtDate(order.acceptedAt)}`;
  if (order.startedAt) text += `\n🚕 ${fmtDate(order.startedAt)}`;
  if (order.completedAt) text += `\n🏁 ${fmtDate(order.completedAt)}`;
  if (order.cancelledAt) text += `\n❌ ${fmtDate(order.cancelledAt)}`;

  const btns = [];
  if (ACTIVE_ST.includes(order.status)) {
    btns.push([
      {
        text: "🏁 Majburiy yakunlash",
        callback_data: "adm_force_complete_" + order._id,
      },
      {
        text: "❌ Bekor qilish",
        callback_data: "adm_force_cancel_" + order._id,
      },
    ]);
  }
  if (passenger)
    btns.push([
      {
        text: "🧍 Yo'lovchi profili",
        callback_data: "adm_view_user_" + passenger.telegramId,
      },
    ]);
  if (driver)
    btns.push([
      {
        text: "🚗 Haydovchi profili",
        callback_data: "adm_view_user_" + driver.telegramId,
      },
    ]);

  return bot.sendMessage(chatId, text, {
    parse_mode: "HTML",
    reply_markup: btns.length ? { inline_keyboard: btns } : undefined,
    disable_web_page_preview: true,
  });
}

function applyAdminOrders(bot) {
  // ─── 📦 Buyurtmalar (menyu tugmasi) ──────────────────────────────────────
  bot.onText(/📦 Buyurtmalar/, async (msg) => {
    const chatId = msg.chat.id;
    if (!isAdmin(chatId)) return;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [ac, td, total] = await Promise.all([
      Order.countDocuments({ status: { $in: ["pending", ...ACTIVE_ST] } }),
      Order.countDocuments({ createdAt: { $gte: today } }),
      Order.countDocuments(),
    ]);
    bot.sendMessage(
      chatId,
      `<pre>📦 BUYURTMALAR</pre>\n\n⚡ Aktiv: <b>${ac}</b>\n📅 Bugun: <b>${td}</b>\n📊 Jami: <b>${total}</b>`,
      {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [
              { text: "⚡ Aktiv", callback_data: "adm_ord_active" },
              { text: "📅 Bugungi", callback_data: "adm_ord_today" },
            ],
            [
              { text: "🏁 Yakunlanganlar", callback_data: "adm_ord_completed" },
              {
                text: "❌ Bekor qilinganlar",
                callback_data: "adm_ord_cancelled",
              },
            ],
            [
              {
                text: "🔍 Buyurtma qidirish",
                callback_data: "adm_search_order",
              },
            ],
          ],
        },
      },
    );
  });

  // ─── CALLBACKS ────────────────────────────────────────────────────────────
  bot.on("callback_query", async (query) => {
    if (!isAdmin(query.from.id)) return;
    const chatId = query.from.id;
    const data = query.data;

    if (data === "adm_ord_active") {
      await bot.answerCallbackQuery(query.id);
      const orders = await Order.find({
        status: { $in: ["pending", ...ACTIVE_ST] },
      })
        .sort({ createdAt: -1 })
        .limit(15)
        .lean();
      if (!orders.length)
        return bot.sendMessage(chatId, "✅ Aktiv buyurtmalar yo'q.");
      let text = `<pre>⚡ AKTIV BUYURTMALAR (${orders.length} ta)</pre>\n\n`;
      for (const o of orders) {
        text += `${S_ICON[o.status] || "?"} ${o.orderType === "cargo" ? "📦" : "👥"} ${getRegionName(o.from)}→${getRegionName(o.to)}\n`;
        text += `   P:<code>${o.passengerId}</code>${o.driverId ? " D:<code>" + o.driverId + "</code>" : " [driver yo'q]"}\n`;
      }
      return bot.sendMessage(chatId, text, {
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

    if (data === "adm_ord_today") {
      await bot.answerCallbackQuery(query.id);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const orders = await Order.find({ createdAt: { $gte: today } })
        .sort({ createdAt: -1 })
        .limit(20)
        .lean();
      if (!orders.length)
        return bot.sendMessage(chatId, "📅 Bugun buyurtmalar yo'q.");
      return _sendOrderList(bot, chatId, orders, "📅 BUGUNGI");
    }

    if (data === "adm_ord_completed") {
      await bot.answerCallbackQuery(query.id);
      const orders = await Order.find({ status: "completed" })
        .sort({ createdAt: -1 })
        .limit(15)
        .lean();
      if (!orders.length) return bot.sendMessage(chatId, "Yakunlangan yo'q.");
      return _sendOrderList(bot, chatId, orders, "🏁 YAKUNLANGANLAR");
    }

    if (data === "adm_ord_cancelled") {
      await bot.answerCallbackQuery(query.id);
      const orders = await Order.find({ status: "cancelled" })
        .sort({ createdAt: -1 })
        .limit(15)
        .lean();
      if (!orders.length)
        return bot.sendMessage(chatId, "Bekor qilingan yo'q.");
      return _sendOrderList(bot, chatId, orders, "❌ BEKOR QILINGANLAR");
    }

    if (data === "adm_search_order") {
      await bot.answerCallbackQuery(query.id);
      await createSession(chatId, "ADM_SEARCH_ORDER", {});
      return bot.sendMessage(
        chatId,
        "📦 Buyurtma ID kiriting (to'liq yoki oxirgi 8 ta belgi):",
      );
    }

    if (data.startsWith("adm_ord_view_")) {
      await bot.answerCallbackQuery(query.id);
      const order = await Order.findById(
        data.replace("adm_ord_view_", ""),
      ).catch(() => null);
      if (!order) return bot.sendMessage(chatId, "❌ Buyurtma topilmadi.");
      return sendOrderCard(bot, chatId, order);
    }

    if (data.startsWith("adm_force_complete_")) {
      const order = await Order.findById(
        data.replace("adm_force_complete_", ""),
      );
      if (!order)
        return bot.answerCallbackQuery(query.id, { text: "Topilmadi" });
      order.status = "completed";
      order.completedAt = new Date();
      await order.save();
      if (order.driverId && order.orderType === "passenger")
        await freeDriverSeats(order.driverId, order.passengers || 1);
      await bot.answerCallbackQuery(query.id, {
        text: "🏁 Yakunlandi",
        show_alert: true,
      });
      try {
        await bot.editMessageReplyMarkup(
          { inline_keyboard: [] },
          { chat_id: chatId, message_id: query.message.message_id },
        );
      } catch (e) {}
      logger.info("Admin force completed: " + order._id);
      return;
    }

    if (data.startsWith("adm_force_cancel_")) {
      const order = await Order.findById(data.replace("adm_force_cancel_", ""));
      if (!order)
        return bot.answerCallbackQuery(query.id, { text: "Topilmadi" });
      order.status = "cancelled";
      order.cancelledAt = new Date();
      order.cancelledBy = "admin";
      await order.save();
      if (order.driverId && order.orderType === "passenger")
        await freeDriverSeats(order.driverId, order.passengers || 1);
      await bot.answerCallbackQuery(query.id, {
        text: "❌ Bekor qilindi",
        show_alert: true,
      });
      try {
        await bot.editMessageReplyMarkup(
          { inline_keyboard: [] },
          { chat_id: chatId, message_id: query.message.message_id },
        );
      } catch (e) {}
      logger.info("Admin force cancelled: " + order._id);
      return;
    }
  });

  // ─── SESSION — buyurtma qidirish ──────────────────────────────────────────
  bot.on("message", async (msg) => {
    if (msg.chat.type !== "private") return;
    const chatId = msg.chat.id;
    if (!isAdmin(chatId)) return;
    const session = await getSession(chatId);
    if (!session || session.step !== "ADM_SEARCH_ORDER") return;
    await deleteSession(chatId);

    const suffix = msg.text?.trim();
    if (!suffix) return;
    let order = null;
    if (suffix.length === 24)
      order = await Order.findById(suffix).catch(() => null);
    if (!order) {
      const all = await Order.find({})
        .sort({ createdAt: -1 })
        .limit(200)
        .lean();
      order = all.find((o) => o._id.toString().endsWith(suffix)) || null;
    }
    if (!order) return bot.sendMessage(chatId, "❌ Buyurtma topilmadi.");
    return sendOrderCard(bot, chatId, order);
  });
}

function _sendOrderList(bot, chatId, orders, title) {
  let text = `<pre>${title} (${orders.length} ta)</pre>\n\n`;
  orders.forEach((o) => {
    text += `${S_ICON[o.status] || "?"} ${getRegionName(o.from)}→${getRegionName(o.to)} | ${fmtDate(o.createdAt)}\n`;
  });
  return bot.sendMessage(chatId, text, {
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

module.exports = { applyAdminOrders, sendOrderCard };
