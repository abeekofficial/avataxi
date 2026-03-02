// handlers/driver/tripActions.js
const Order  = require("../../models/Order.model");
const User   = require("../../models/User.model");
const logger = require("../../utils/logger");
const { getRegionName } = require("../../utils/regionOptions");
const {
  notifyPassengerTripStarted,
  notifyPassengerCancelled,
  notifyPassengerConfirmRequest,
  notifyTripCompleted,
} = require("../../services/notifyService");

function getTypeInfo(order) {
  return {
    typeEmoji: order.orderType === "cargo" ? "📦" : "👥",
    typeInfo: order.orderType === "cargo"
      ? `Yuk: ${order.cargoDescription}`
      : `${order.passengers || 1} kishi`,
  };
}

// ─── SAFAR BOSHLASH ───────────────────────────────────────────────────────────
async function handleStartTrip(bot, query) {
  const chatId  = query.message.chat.id;
  const orderId = query.data.replace("start_trip_", "");
  const order   = await Order.findById(orderId);

  if (!order) {
    return bot.answerCallbackQuery(query.id, { text: "❌ Buyurtma topilmadi!", show_alert: true });
  }
  if (order.driverId !== Number(chatId)) {
    return bot.answerCallbackQuery(query.id, { text: "❌ Bu sizning buyurtmangiz emas!", show_alert: true });
  }
  if (order.status !== "accepted") {
    return bot.answerCallbackQuery(query.id, { text: "❌ Buyurtma holati noto'g'ri!", show_alert: true });
  }

  const fromName        = getRegionName(order.from);
  const toName          = getRegionName(order.to);
  const { typeEmoji, typeInfo } = getTypeInfo(order);

  order.status    = "in_progress";
  order.startedAt = new Date();
  await order.save();

  await bot.answerCallbackQuery(query.id, { text: "✅ Safar boshlandi!" });

  await bot.editMessageText(
    `🚕 <b>SAFAR BOSHLANDI!</b>\n\n📍 ${fromName} → ${toName}\n${typeEmoji} ${typeInfo}\n\n` +
    `<blockquote>Manzilga yetgach safarni yakunlang ✅\nAks holda yangi buyurtmalar kelmaydi 🚫</blockquote>`,
    {
      chat_id: chatId,
      message_id: query.message.message_id,
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [[
          { text: "✅ Safar yakunlandi", callback_data: `complete_order_${orderId}` },
        ]],
      },
    },
  );

  await notifyPassengerTripStarted(bot, order);
  logger.info(`Safar boshlandi: ${orderId}`);
}

// ─── SAFAR BEKOR QILISH (driver) ─────────────────────────────────────────────
async function handleCancelTrip(bot, query) {
  const chatId  = query.message.chat.id;
  const orderId = query.data.replace("cancel_trip_", "");
  const order   = await Order.findById(orderId);

  if (!order || order.driverId !== Number(chatId)) {
    return bot.answerCallbackQuery(query.id, { text: "❌ Bu sizning buyurtmangiz emas!", show_alert: true });
  }

  const fromName        = getRegionName(order.from);
  const toName          = getRegionName(order.to);
  const { typeEmoji, typeInfo } = getTypeInfo(order);

  order.status      = "cancelled";
  order.cancelledAt = new Date();
  order.cancelledBy = "driver";
  await order.save();

  await bot.answerCallbackQuery(query.id, { text: "❌ Bekor qilindi" });

  await bot.editMessageReplyMarkup(
    { inline_keyboard: [] },
    { chat_id: chatId, message_id: query.message.message_id },
  );

  await bot.sendMessage(
    chatId,
    `❌ <b>Buyurtma bekor qilindi.</b>\n\n📍 ${fromName} → ${toName}\n${typeEmoji} ${typeInfo}`,
    { parse_mode: "HTML" },
  );

  await notifyPassengerCancelled(bot, order);
  logger.info(`Driver bekor qildi: ${orderId}`);
}

// ─── SAFAR YAKUNLASH (driver) ─────────────────────────────────────────────────
async function handleCompleteOrder(bot, query) {
  const chatId  = query.message.chat.id;
  const orderId = query.data.replace("complete_order_", "");
  const order   = await Order.findById(orderId);

  if (!order) {
    return bot.answerCallbackQuery(query.id, { text: "❌ Buyurtma topilmadi!", show_alert: true });
  }
  if (order.driverId !== Number(chatId)) {
    return bot.answerCallbackQuery(query.id, { text: "❌ Bu sizning buyurtmangiz emas!", show_alert: true });
  }
  if (order.status === "completed") {
    return bot.answerCallbackQuery(query.id, { text: "✅ Allaqachon yakunlangan!", show_alert: true });
  }

  const fromName        = getRegionName(order.from);
  const toName          = getRegionName(order.to);
  const { typeEmoji, typeInfo } = getTypeInfo(order);

  if (order.status === "passenger_confirmed") {
    // Ikki tomon ham tasdiqladi — yakunlash
    order.status      = "completed";
    order.completedAt = new Date();
    await order.save();

    await User.findOneAndUpdate({ telegramId: chatId }, { $inc: { completedOrders: 1 } });

    await bot.answerCallbackQuery(query.id, { text: "✅ Safar yakunlandi!" });

    await bot.editMessageText(
      `✅ <b>SAFAR YAKUNLANDI!</b>\n\n📍 ${fromName} → ${toName}\n${typeEmoji} ${typeInfo}\n\nRahmat! 🙏`,
      {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: [] },
      },
    );

    await notifyTripCompleted(bot, order);
    logger.success(`Safar yakunlandi: ${orderId}`);
  } else {
    // Driver birinchi tasdiqladi
    order.status            = "driver_confirmed";
    order.driverConfirmedAt = new Date();
    await order.save();

    await bot.answerCallbackQuery(query.id, {
      text: "✅ Siz tasdiqladingiz! Yo'lovchi tasdiqini kutmoqda...",
    });

    await bot.editMessageText(
      `✅ Siz safar tugaganini tasdiqladingiz!\n\n⏳ Yo'lovchi tasdiqini kutmoqda...`,
      {
        chat_id: chatId,
        message_id: query.message.message_id,
        reply_markup: { inline_keyboard: [] },
      },
    );

    await notifyPassengerConfirmRequest(bot, order);
    logger.info(`Driver tasdiqladi, passenger kutmoqda: ${orderId}`);
  }
}

module.exports = { handleStartTrip, handleCancelTrip, handleCompleteOrder };
