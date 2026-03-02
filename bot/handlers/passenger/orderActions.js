// handlers/passenger/orderActions.js
const Order  = require("../../models/Order.model");
const User   = require("../../models/User.model");
const logger = require("../../utils/logger");
const { getRegionName } = require("../../utils/regionOptions");
const { notifyDriverCancelled, notifyTripCompleted, notifyDriverConfirmRequest } = require("../../services/notifyService");
const config = require("../../config");

function getTypeInfo(order) {
  return {
    typeEmoji: order.orderType === "cargo" ? "📦" : "👥",
    typeInfo:  order.orderType === "cargo"
      ? `Yuk: ${order.cargoDescription}`
      : `${order.passengers || 1} kishi`,
  };
}

// ─── BEKOR QILISH (passenger) ─────────────────────────────────────────────────
async function handleCancelOrder(bot, query) {
  const chatId  = query.message.chat.id;
  const orderId = query.data.replace("cancel_order_", "");
  const order   = await Order.findById(orderId);

  if (!order) {
    return bot.answerCallbackQuery(query.id, { text: "❌ Buyurtma topilmadi!", show_alert: true });
  }
  if (order.passengerId !== Number(chatId)) {
    return bot.answerCallbackQuery(query.id, { text: "❌ Bu sizning buyurtmangiz emas!", show_alert: true });
  }
  if (!["pending", "accepted"].includes(order.status)) {
    return bot.answerCallbackQuery(query.id, {
      text: "❌ Safar boshlangandan keyin bekor qilib bo'lmaydi!", show_alert: true,
    });
  }

  const fromName        = getRegionName(order.from);
  const toName          = getRegionName(order.to);
  const { typeEmoji, typeInfo } = getTypeInfo(order);
  const driverId        = order.driverId;

  order.status      = "cancelled";
  order.cancelledAt = new Date();
  order.cancelledBy = "passenger";
  await order.save();

  await bot.answerCallbackQuery(query.id, { text: "✅ Bekor qilindi" });

  try {
    await bot.editMessageReplyMarkup(
      { inline_keyboard: [] },
      { chat_id: chatId, message_id: query.message.message_id },
    );
  } catch (e) { /* ignore */ }

  await bot.sendMessage(
    chatId,
    `❌ <b>Buyurtmangiz bekor qilindi.</b>\n\n📍 ${fromName} → ${toName}\n${typeEmoji} ${typeInfo}`,
    { parse_mode: "HTML" },
  );

  if (driverId) await notifyDriverCancelled(bot, order);
  logger.info(`Passenger bekor qildi: ${orderId}`);
}

// ─── TASDIQLASH (passenger safar yakunlandi deya) ────────────────────────────
async function handleConfirmComplete(bot, query) {
  const chatId  = query.message.chat.id;
  const orderId = query.data.replace("confirm_complete_btn_", "");
  const order   = await Order.findById(orderId);

  if (!order) {
    return bot.answerCallbackQuery(query.id, { text: "❌ Buyurtma topilmadi!", show_alert: true });
  }
  if (order.passengerId !== Number(chatId)) {
    return bot.answerCallbackQuery(query.id, { text: "❌ Bu sizning buyurtmangiz emas!", show_alert: true });
  }

  const fromName        = getRegionName(order.from);
  const toName          = getRegionName(order.to);
  const { typeEmoji, typeInfo } = getTypeInfo(order);

  if (order.status === "driver_confirmed") {
    // Ikki tomon ham tasdiqladi
    order.status                = "completed";
    order.completedAt           = new Date();
    order.passengerConfirmedAt  = new Date();
    await order.save();

    await User.findOneAndUpdate({ telegramId: order.driverId }, { $inc: { completedOrders: 1 } });

    await bot.answerCallbackQuery(query.id, { text: "✅ Safar yakunlandi!" });

    try {
      await bot.editMessageText(
        `✅ <b>SAFAR YAKUNLANDI!</b>\n\n📍 ${fromName} → ${toName}\n${typeEmoji} ${typeInfo}\n\nRahmat! 🙏`,
        {
          chat_id:    chatId,
          message_id: query.message.message_id,
          parse_mode: "HTML",
          reply_markup: { inline_keyboard: [] },
        },
      );
    } catch (e) { /* ignore */ }

    await notifyTripCompleted(bot, order);
    logger.success(`Safar yakunlandi (passenger confirmed): ${orderId}`);
  } else {
    // Passenger birinchi tasdiqladi
    order.status               = "passenger_confirmed";
    order.passengerConfirmedAt = new Date();
    await order.save();

    await bot.answerCallbackQuery(query.id, {
      text: "✅ Siz tasdiqladingiz! Haydovchi tasdiqini kutmoqda...",
    });

    try {
      await bot.editMessageText(
        `✅ Siz safar tugaganini tasdiqladingiz!\n\n⏳ Haydovchi tasdiqini kutmoqda...`,
        {
          chat_id:    chatId,
          message_id: query.message.message_id,
          reply_markup: { inline_keyboard: [] },
        },
      );
    } catch (e) { /* ignore */ }

    await notifyDriverConfirmRequest(bot, order);
    logger.info(`Passenger tasdiqladi, driver kutmoqda: ${orderId}`);
  }
}

// ─── DISPUTE ──────────────────────────────────────────────────────────────────
async function handleDispute(bot, query) {
  const chatId  = query.message.chat.id;
  const orderId = query.data.replace("dispute_", "");

  await bot.answerCallbackQuery(query.id, {
    text: "⚠️ Muammo qayd etildi, admin ko'rib chiqadi",
    show_alert: true,
  });

  // Admin ga xabar
  for (const adminId of config.bot.adminIds) {
    try {
      await bot.sendMessage(
        adminId,
        `⚠️ <b>DISPUTE:</b>\nBuyurtma: <code>${orderId}</code>\nFoydalanuvchi: ${chatId}`,
        { parse_mode: "HTML" },
      );
    } catch (e) { /* ignore */ }
  }

  logger.warn(`Dispute: ${orderId}`, { chatId });
}

module.exports = { handleCancelOrder, handleConfirmComplete, handleDispute };
