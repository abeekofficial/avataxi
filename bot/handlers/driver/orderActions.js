// handlers/driver/orderActions.js
const Order  = require("../../models/Order.model");
const User   = require("../../models/User.model");
const logger = require("../../utils/logger");
const { getRegionName } = require("../../utils/regionOptions");
const { isDriverBusy }  = require("../../services/driverService");
const { notifyPassengerDriverFound } = require("../../services/notifyService");

// ─── QABUL QILISH (barcha buyurtmalar ro'yxatidan) ───────────────────────────
async function handleAcceptOrder(bot, query) {
  const chatId  = query.message.chat.id;
  const orderId = query.data.replace("accept_", "");
  const order   = await Order.findById(orderId);

  if (!order) {
    return bot.answerCallbackQuery(query.id, { text: "❌ Buyurtma topilmadi!", show_alert: true });
  }
  if (order.driverId) {
    return bot.answerCallbackQuery(query.id, {
      text: "❌ Buyurtma allaqachon qabul qilingan!", show_alert: true,
    });
  }

  // Band tekshiruvi
  if (await isDriverBusy(chatId)) {
    return bot.answerCallbackQuery(query.id, {
      text: "❌ Sizda yakunlanmagan buyurtma bor!", show_alert: true,
    });
  }

  // Atomic update — race condition himoyasi
  const updated = await Order.findOneAndUpdate(
    { _id: orderId, driverId: null, status: "pending" },
    { driverId: chatId, status: "accepted", acceptedAt: new Date() },
    { new: true },
  );

  if (!updated) {
    return bot.answerCallbackQuery(query.id, {
      text: "❌ Buyurtma allaqachon qabul qilingan!", show_alert: true,
    });
  }

  const fromName  = getRegionName(updated.from);
  const toName    = getRegionName(updated.to);
  const typeEmoji = updated.orderType === "cargo" ? "📦" : "👥";
  const typeText  = updated.orderType === "cargo"
    ? `Yuk: <b>${updated.cargoDescription}</b>`
    : `Yo'lovchilar: <b>${updated.passengers || 1} kishi</b>`;

  await bot.answerCallbackQuery(query.id, { text: "✅ Buyurtma qabul qilindi!" });

  await bot.editMessageReplyMarkup(
    { inline_keyboard: [] },
    { chat_id: chatId, message_id: query.message.message_id },
  );

  // Driverga: safar boshlash tugmasi
  await bot.sendMessage(
    chatId,
    `<b>✅ Buyurtma qabul qilindi!\n\n📍 ${fromName} → ${toName}\n${typeEmoji} ${typeText}</b>\n\n` +
    `💡 Yo'lovchini olgach tugmani bosing:`,
    {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [[
          { text: "🚕 Safar boshlash",         callback_data: `start_trip_${orderId}` },
          { text: "❌ Buyurtmani bekor qilish", callback_data: `cancel_trip_${orderId}` },
        ]],
      },
    },
  );

  // Passengerga: driver topildi xabari
  const driver = await User.findOne({ telegramId: chatId }).lean();
  const passenger = await User.findOne({ telegramId: updated.passengerId }).lean();
  if (driver && passenger) {
    await notifyPassengerDriverFound(bot, passenger, driver, updated);
  }

  logger.success(`Driver qabul qildi (ro'yxatdan): ${orderId}`, { driverId: chatId });
}

// ─── RAD ETISH ────────────────────────────────────────────────────────────────
async function handleRejectOrder(bot, query) {
  await bot.answerCallbackQuery(query.id, { text: "❌ Buyurtma rad etildi!" });
  await bot.editMessageReplyMarkup(
    { inline_keyboard: [] },
    { chat_id: query.message.chat.id, message_id: query.message.message_id },
  );
}

module.exports = { handleAcceptOrder, handleRejectOrder };
