// services/assignService.js
const Order  = require("../models/Order.model");
const Group  = require("../models/Group.model");
const User   = require("../models/User.model");
const logger = require("../utils/logger");
const config = require("../config");
const { getAvailableDrivers, isDriverBusy } = require("./driverService");
const { notifyPassengerDriverFound } = require("./notifyService");
const { getRegionName } = require("../utils/regionOptions");

// Aktiv listenerlar — Memory safe (cleanup majburiy)
const activeListeners = new Map();

// ─── ASOSIY FUNKSIYA ──────────────────────────────────────────────────────────
async function assignOrder(bot, orderId) {
  try {
    const order = await Order.findById(orderId);
    if (!order) {
      logger.error("assignOrder: order topilmadi", { orderId });
      return;
    }

    if (order.status !== "pending") {
      logger.warn("assignOrder: order pending emas", { orderId, status: order.status });
      return;
    }

    const drivers = await getAvailableDrivers(order.from, order.to, config.order.maxDriversPerOrder);
    logger.info(`📊 Topilgan haydovchilar: ${drivers.length} ta`, { orderId });

    if (drivers.length === 0) {
      logger.warn("⚠️ Haydovchi topilmadi, guruhga yuborilmoqda...");
      await sendOrderToGroups(bot, order);
      return;
    }

    for (const driver of drivers) {
      const busy = await isDriverBusy(driver.telegramId);
      if (busy) {
        logger.debug(`⏭️ Driver band: ${driver.name}`);
        continue;
      }

      logger.info(`📤 Taklif yuborilmoqda: ${driver.name}`);
      const accepted = await offerToDriver(bot, order, driver);
      if (accepted) {
        logger.success(`Driver qabul qildi: ${driver.name}`, { orderId });
        return;
      }
    }

    logger.warn("⚠️ Hech kim qabul qilmadi, guruhga yuborilmoqda...");
    await sendOrderToGroups(bot, order);
  } catch (err) {
    logger.error("assignOrder error:", err);
  }
}

// ─── BITTA DRIVERGA TAKLIF ────────────────────────────────────────────────────
function offerToDriver(bot, order, driver) {
  return new Promise(async (resolve) => {
    try {
      const passenger = await User.findOne({ telegramId: order.passengerId }).lean();
      if (!passenger) {
        logger.error("offerToDriver: passenger topilmadi");
        return resolve(false);
      }

      const fromName  = getRegionName(order.from);
      const toName    = getRegionName(order.to);
      const typeEmoji = order.orderType === "cargo" ? "📦" : "👥";
      const typeText  = order.orderType === "cargo"
        ? `Yuk: <b>${order.cargoDescription}</b>`
        : `Yo'lovchilar: <b>${order.passengers || 1} kishi</b>`;

      const message =
        `<pre>🚖 YANGI BUYURTMA!</pre>\n\n` +
        `<b>📍 ${fromName} ➝ ${toName}</b>\n` +
        `${typeEmoji} ${typeText}\n\n` +
        `👤 Buyurtmachi: <b>${passenger.name}</b>\n` +
        `📱 Telefon: <b>${passenger.phone}</b>\n` +
        (passenger.username ? `Telegram: @${passenger.username}\n` : "");

      const keyboard = {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [[
            { text: "✅ Qabul qilish", callback_data: `accept_${order._id}` },
            { text: "❌ Rad etish",    callback_data: `reject_${order._id}` },
          ]],
        },
      };

      let sentMsg;
      if (order.orderType === "cargo" && order.cargoPhotoId) {
        sentMsg = await bot.sendPhoto(driver.telegramId, order.cargoPhotoId, {
          caption: message, parse_mode: "HTML", ...keyboard,
        });
      } else {
        sentMsg = await bot.sendMessage(driver.telegramId, message, keyboard);
      }

      const listenerId = `offer_${order._id}_${driver.telegramId}`;
      let resolved = false;

      const safeResolve = (val) => {
        if (!resolved) {
          resolved = true;
          resolve(val);
        }
      };

      const timeout = setTimeout(() => {
        cleanupListener(bot, listenerId);
        logger.debug(`⏰ Timeout: ${driver.name}`);
        safeResolve(false);
      }, config.order.offerTimeoutMs);

      const handler = async (query) => {
        if (query.from.id !== driver.telegramId) return;
        if (
          query.data !== `accept_${order._id}` &&
          query.data !== `reject_${order._id}`
        ) return;

        clearTimeout(timeout);
        cleanupListener(bot, listenerId);

        if (query.data === `accept_${order._id}`) {
          await handleDriverAccept(bot, query, order, driver, passenger, message, sentMsg, safeResolve);
        } else {
          await handleDriverReject(bot, query, order, message, sentMsg);
          safeResolve(false);
        }
      };

      activeListeners.set(listenerId, handler);
      bot.on("callback_query", handler);
    } catch (err) {
      logger.error("offerToDriver error:", err);
      resolve(false);
    }
  });
}

// ─── QABUL QILDI ─────────────────────────────────────────────────────────────
async function handleDriverAccept(bot, query, order, driver, passenger, message, sentMsg, resolve) {
  // Band tekshiruvi
  const busy = await isDriverBusy(driver.telegramId);
  if (busy) {
    await bot.answerCallbackQuery(query.id, {
      text: "❌ Sizda yakunlanmagan buyurtma bor!", show_alert: true,
    });
    return resolve(false);
  }

  // Double-accept himoyasi (atomic update)
  const updatedOrder = await Order.findOneAndUpdate(
    { _id: order._id, driverId: null, status: "pending" },
    { driverId: driver.telegramId, status: "accepted", acceptedAt: new Date() },
    { new: true },
  );

  if (!updatedOrder) {
    await bot.answerCallbackQuery(query.id, {
      text: "❌ Buyurtma allaqachon qabul qilingan!", show_alert: true,
    });
    return resolve(false);
  }

  resolve(true); // ← DB ga yozilgach resolve, xabar yuborishdan OLDIN

  await bot.answerCallbackQuery(query.id, { text: "✅ Buyurtma qabul qilindi!" });

  // Eski xabarni yangilash
  try {
    if (order.orderType === "cargo" && order.cargoPhotoId) {
      await bot.editMessageCaption(message + `\n\n✅ SIZ QABUL QILDINGIZ!`, {
        chat_id: driver.telegramId,
        message_id: sentMsg.message_id,
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: [] },
      });
    } else {
      await bot.editMessageText(message + `\n\n✅ SIZ QABUL QILDINGIZ!`, {
        chat_id: driver.telegramId,
        message_id: sentMsg.message_id,
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: [] },
      });
    }
  } catch (e) {
    logger.error("editMessage xatosi:", e.message);
  }

  const fromName  = getRegionName(order.from);
  const toName    = getRegionName(order.to);
  const typeEmoji = order.orderType === "cargo" ? "📦" : "👥";
  const typeText  = order.orderType === "cargo"
    ? `Yuk: <b>${order.cargoDescription}</b>`
    : `Yo'lovchilar: <b>${order.passengers || 1} kishi</b>`;

  // Passengerga: driver ma'lumotlari
  await notifyPassengerDriverFound(bot, passenger, driver, updatedOrder);

  // Driverga: safar boshlash tugmasi
  try {
    await bot.sendMessage(
      driver.telegramId,
      `<b>✅ Buyurtma qabul qilindi!\n\n📍 ${fromName} → ${toName}\n${typeEmoji} ${typeText}</b>\n\n` +
      `💡 Yo'lovchini olgach "Safar boshlash" tugmasini bosing:`,
      {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [[
            { text: "🚕 Safar boshlash",         callback_data: `start_trip_${order._id}` },
            { text: "❌ Buyurtmani bekor qilish", callback_data: `cancel_trip_${order._id}` },
          ]],
        },
      },
    );
  } catch (e) {
    logger.error("Driverga start_trip xabari xatosi:", e.message);
  }
}

// ─── RAD ETDI ─────────────────────────────────────────────────────────────────
async function handleDriverReject(bot, query, order, message, sentMsg) {
  try {
    if (order.orderType === "cargo" && order.cargoPhotoId) {
      await bot.editMessageCaption(message + `\n\n❌ SIZ RAD ETDINGIZ`, {
        chat_id: query.from.id,
        message_id: sentMsg.message_id,
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: [] },
      });
    } else {
      await bot.editMessageText(message + `\n\n❌ SIZ RAD ETDINGIZ`, {
        chat_id: query.from.id,
        message_id: sentMsg.message_id,
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: [] },
      });
    }
  } catch (e) {
    logger.error("editMessage (reject) xatosi:", e.message);
  }
  await bot.answerCallbackQuery(query.id, { text: "❌ Buyurtma rad etildi" });
}

// ─── GURUHGA YUBORISH ─────────────────────────────────────────────────────────
async function sendOrderToGroups(bot, order) {
  try {
    const botInfo  = await bot.getMe();
    const groups   = await Group.find({ isActive: true }).lean();
    const passenger = await User.findOne({ telegramId: order.passengerId }).lean();

    if (!passenger) { logger.error("sendOrderToGroups: passenger topilmadi"); return; }
    if (groups.length === 0) { logger.warn("Faol guruh topilmadi"); return; }

    const fromName  = getRegionName(order.from);
    const toName    = getRegionName(order.to);
    const typeEmoji = order.orderType === "cargo" ? "📦" : "👥";
    const typeText  = order.orderType === "cargo"
      ? `Yuk: ${order.cargoDescription}`
      : `${order.passengers || 1} kishi`;

    const message =
      `<pre>🚖 YANGI BUYURTMA!</pre>\n\n` +
      `📍 ${fromName} ➝ ${toName}\n` +
      `${typeEmoji} ${typeText}\n` +
      `⏰ ${new Date().toLocaleTimeString("uz-UZ", { hour: "2-digit", minute: "2-digit" })}\n\n` +
      `⚠️ Qabul qilish uchun botga o'ting ⬇️`;

    logger.info(`📤 ${groups.length} ta guruhga yuborilmoqda...`);

    for (const group of groups) {
      try {
        const sent = await bot.sendMessage(group.groupId, message, {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [[
              {
                text: "✅ Qabul qilaman",
                url: `https://t.me/${botInfo.username}?start=accept_${order._id}`,
              },
            ]],
          },
        });

        await Order.findByIdAndUpdate(order._id, {
          $push: { groupMessages: { groupId: group.groupId, messageId: sent.message_id } },
        });

        await Group.findOneAndUpdate(
          { groupId: group.groupId },
          { $inc: { totalOrders: 1 }, lastActivity: new Date() },
        );

        logger.info(`✅ Guruhga yuborildi: ${group.title}`);
      } catch (err) {
        logger.error(`❌ Guruhga yuborishda xato (${group.title}):`, err.message);
        if (err.message.includes("bot was kicked") || err.message.includes("chat not found")) {
          await Group.findOneAndUpdate({ groupId: group.groupId }, { isActive: false });
        }
      }
    }
  } catch (err) {
    logger.error("sendOrderToGroups error:", err);
  }
}

// ─── LISTENER TOZALASH ────────────────────────────────────────────────────────
function cleanupListener(bot, listenerId) {
  const handler = activeListeners.get(listenerId);
  if (handler) {
    bot.removeListener("callback_query", handler);
    activeListeners.delete(listenerId);
  }
}

function getActiveListenerCount() {
  return activeListeners.size;
}

module.exports = { assignOrder, getActiveListenerCount };
