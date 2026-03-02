// handlers/start.js
const User   = require("../models/User.model");
const logger = require("../utils/logger");
const { deleteSession } = require("../cache/sessionCache");

function applyStart(bot) {
  bot.onText(/\/start(.*)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const param  = (match[1] || "").trim();

    try {
      await deleteSession(chatId);

      // Referral orqali kelgan?
      let referredBy = null;
      if (param && param.startsWith("REF")) {
        const referrer = await User.findOne({ referralCode: param });
        if (referrer && referrer.telegramId !== chatId) {
          referredBy = param;
          // Referrer ni yangilash
          await User.findOneAndUpdate(
            { referralCode: param },
            { $inc: { referralCount: 1 } },
          );
          logger.info(`Referal: ${chatId} → ${param}`);
        }
      }

      // Avval ro'yxatdan o'tganmi?
      const user = await User.findOne({ telegramId: chatId });

      if (user && user.role) {
        return sendMainMenu(bot, chatId, user);
      }

      // Yangi foydalanuvchi — rol tanlash
      if (referredBy) {
        await User.findOneAndUpdate(
          { telegramId: chatId },
          { $setOnInsert: { referredBy } },
          { upsert: true },
        );
      }

      await bot.sendMessage(
        chatId,
        "👋 <b>Xush kelibsiz!</b>\n\n" +
        "Quyidagilardan birini tanlang:",
        {
          parse_mode: "HTML",
          reply_markup: {
            keyboard: [["🚕 Haydovchi", "🧍 Yo'lovchi"]],
            resize_keyboard: true,
          },
        },
      );
    } catch (err) {
      logger.error("Start error:", err);
      bot.sendMessage(chatId, "❌ Xatolik yuz berdi, qaytadan /start bosing");
    }
  });
}

async function sendMainMenu(bot, chatId, user) {
  try {
    const botInfo      = await bot.getMe();
    const referralLink = `https://t.me/${botInfo.username}?start=${user.referralCode || ""}`;

    if (user.role === "driver") {
      return bot.sendMessage(
        chatId,
        `👋 Xush kelibsiz, <b>${user.name}</b>!\n\n` +
        `⭐ Rating: <b>${user.rating?.toFixed(1) || "5.0"}</b>\n` +
        `✅ Bajarilgan: <b>${user.completedOrders || 0} ta</b>\n` +
        `👥 Referallar: <b>${user.referralCount || 0} ta</b>\n\n` +
        `🔗 Referal havola:\n${referralLink}`,
        {
          parse_mode: "HTML",
          reply_markup: {
            keyboard: [
              ["🚖 Buyurtma qabul qilishni boshlash"],
              ["📋 Buyurtmalar", "👤 Profilim"],
              ["📊 Statistika",  "⭐ Reytingim", "📋 Bot haqida"],
            ],
            resize_keyboard: true,
          },
        },
      );
    }

    if (user.role === "passenger") {
      return bot.sendMessage(
        chatId,
        `👋 Xush kelibsiz, <b>${user.name}</b>!\n\n` +
        `👥 Referallar: <b>${user.referralCount || 0} ta</b>\n\n` +
        `🔗 Referal havola:\n${referralLink}`,
        {
          parse_mode: "HTML",
          reply_markup: {
            keyboard: [
              ["🚖 Buyurtma berish", "📦 Yuk/Pochta"],
              ["👤 Profilim",        "📋 Tarixim"],
              ["📋 Bot haqida"],
            ],
            resize_keyboard: true,
          },
        },
      );
    }
  } catch (err) {
    logger.error("sendMainMenu error:", err);
  }
}

module.exports = { applyStart, sendMainMenu };
