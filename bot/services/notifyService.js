// services/notifyService.js
// Barcha bot xabarlari shu yerdan o'tadi — retry, error handling markazlashgan

const logger = require("../utils/logger");
const { getRegionName } = require("../utils/regionOptions");

/**
 * Driverga: haydovchi topildi xabari
 */
async function notifyPassengerDriverFound(bot, passenger, driver, order) {
  const msg =
    `<pre>🚗 HAYDOVCHI TOPILDI!</pre>\n\n` +
    `👤 <b>${driver.name}</b>\n` +
    `📱 <b>${driver.phone}</b>\n` +
    `🚙 <b>${driver.carModel}</b>\n` +
    `🔢 <b>${driver.carNumber}</b>\n` +
    `⭐ Rating: <b>${driver.rating?.toFixed(1) || "5.0"}</b>\n\n` +
    `📞 Haydovchi bilan bog'laning!\n\n` +
    `⏳ Safar boshlanishini kuting...`;

  try {
    if (driver.driverPhoto) {
      await bot.sendPhoto(passenger.telegramId, driver.driverPhoto, {
        caption: msg,
        parse_mode: "HTML",
      });
    } else {
      await bot.sendMessage(passenger.telegramId, msg, { parse_mode: "HTML" });
    }
  } catch (err) {
    logger.error("notifyPassengerDriverFound xato:", err.message);
  }
}

/**
 * Passengerga: safar boshlandi
 */
async function notifyPassengerTripStarted(bot, order) {
  const fromName = getRegionName(order.from);
  const toName   = getRegionName(order.to);
  try {
    await bot.sendMessage(
      order.passengerId,
      `🚕 <b>Safar boshlandi!</b>\n\n📍 ${fromName} → ${toName}\n\nYaxshi yo'l! 🙏`,
      { parse_mode: "HTML" },
    );
  } catch (err) {
    logger.error("notifyPassengerTripStarted xato:", err.message);
  }
}

/**
 * Passengerga: driver bekor qildi
 */
async function notifyPassengerCancelled(bot, order) {
  const fromName  = getRegionName(order.from);
  const toName    = getRegionName(order.to);
  const typeEmoji = order.orderType === "cargo" ? "📦" : "👥";
  const typeInfo  = order.orderType === "cargo"
    ? `Yuk: ${order.cargoDescription}`
    : `${order.passengers || 1} kishi`;

  try {
    await bot.sendMessage(
      order.passengerId,
      `❌ <b>Haydovchi buyurtmangizni bekor qildi.</b>\n\n` +
      `📍 ${fromName} → ${toName}\n` +
      `${typeEmoji} ${typeInfo}\n\n` +
      `🔄 Iltimos, qaytadan buyurtma bering.`,
      { parse_mode: "HTML" },
    );
  } catch (err) {
    logger.error("notifyPassengerCancelled xato:", err.message);
  }
}

/**
 * Driverga: passenger bekor qildi
 */
async function notifyDriverCancelled(bot, order) {
  const fromName  = getRegionName(order.from);
  const toName    = getRegionName(order.to);
  const typeEmoji = order.orderType === "cargo" ? "📦" : "👥";
  const typeInfo  = order.orderType === "cargo"
    ? `Yuk: ${order.cargoDescription}`
    : `${order.passengers || 1} kishi`;

  try {
    await bot.sendMessage(
      order.driverId,
      `❌ <b>Yo'lovchi buyurtmani bekor qildi.</b>\n\n` +
      `📍 ${fromName} → ${toName}\n` +
      `${typeEmoji} ${typeInfo}\n\n` +
      `🔄 Yangi buyurtma kutishingiz mumkin.`,
      { parse_mode: "HTML" },
    );
  } catch (err) {
    logger.error("notifyDriverCancelled xato:", err.message);
  }
}

/**
 * Passengerga: driver tasdiqlash so'radi
 */
async function notifyPassengerConfirmRequest(bot, order) {
  const fromName  = getRegionName(order.from);
  const toName    = getRegionName(order.to);
  const typeEmoji = order.orderType === "cargo" ? "📦" : "👥";
  const typeInfo  = order.orderType === "cargo"
    ? `Yuk: ${order.cargoDescription}`
    : `${order.passengers || 1} kishi`;

  try {
    await bot.sendMessage(
      order.passengerId,
      `🚗 Haydovchi safar tugaganini bildirdi.\n\n📍 <b>${fromName} → ${toName}</b>\n${typeEmoji} ${typeInfo}\n\nSafar yakunlandimi?`,
      {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [[
            { text: "✅ Ha, yakunlandi", callback_data: `confirm_complete_btn_${order._id}` },
            { text: "❌ Yo'q",           callback_data: `dispute_${order._id}` },
          ]],
        },
      },
    );
  } catch (err) {
    logger.error("notifyPassengerConfirmRequest xato:", err.message);
  }
}

/**
 * Driverga: passenger tasdiqlash so'radi
 */
async function notifyDriverConfirmRequest(bot, order) {
  const fromName  = getRegionName(order.from);
  const toName    = getRegionName(order.to);
  const typeEmoji = order.orderType === "cargo" ? "📦" : "👥";
  const typeInfo  = order.orderType === "cargo"
    ? `Yuk: ${order.cargoDescription}`
    : `${order.passengers || 1} kishi`;

  try {
    await bot.sendMessage(
      order.driverId,
      `👤 Yo'lovchi safar tugaganini bildirdi.\n\n📍 <b>${fromName} → ${toName}</b>\n${typeEmoji} ${typeInfo}\n\nSafar yakunlandimi?`,
      {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [[
            { text: "✅ Ha, yakunlandi", callback_data: `complete_order_${order._id}` },
            { text: "❌ Yo'q",           callback_data: `dispute_${order._id}` },
          ]],
        },
      },
    );
  } catch (err) {
    logger.error("notifyDriverConfirmRequest xato:", err.message);
  }
}

/**
 * Ikki tomonga: safar yakunlandi
 */
async function notifyTripCompleted(bot, order) {
  const fromName  = getRegionName(order.from);
  const toName    = getRegionName(order.to);
  const typeEmoji = order.orderType === "cargo" ? "📦" : "👥";
  const typeInfo  = order.orderType === "cargo"
    ? `Yuk: ${order.cargoDescription}`
    : `${order.passengers || 1} kishi`;

  try {
    await bot.sendMessage(
      order.passengerId,
      `✅ <b>SAFAR YAKUNLANDI!</b>\n\n📍 ${fromName} → ${toName}\n${typeEmoji} ${typeInfo}\n\n⭐ Haydovchini baholang: /rate_driver_${order._id}`,
      { parse_mode: "HTML" },
    );
  } catch (err) {
    logger.error("notifyTripCompleted (passenger) xato:", err.message);
  }

  try {
    await bot.sendMessage(
      order.driverId,
      `⭐ Yo'lovchini baholang: /rate_passenger_${order._id}`,
    );
  } catch (err) {
    logger.error("notifyTripCompleted (driver) xato:", err.message);
  }
}

module.exports = {
  notifyPassengerDriverFound,
  notifyPassengerTripStarted,
  notifyPassengerCancelled,
  notifyDriverCancelled,
  notifyPassengerConfirmRequest,
  notifyDriverConfirmRequest,
  notifyTripCompleted,
};
