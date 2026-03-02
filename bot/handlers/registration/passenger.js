// handlers/registration/passenger.js
const User   = require("../../models/User.model");
const logger = require("../../utils/logger");
const { isValidName, isValidPhone, normalizePhone } = require("../../utils/validators");
const { updateSession, deleteSession } = require("../../cache/sessionCache");

async function handleMessage(bot, msg, session) {
  const chatId = msg.chat.id;
  const text   = msg.text || "";

  try {
    // ─── ISM ─────────────────────────────────────────────────────────────────
    if (session.step === "PASSENGER_NAME") {
      if (!msg.text) {
        return bot.sendMessage(chatId, "❌ Iltimos ismingizni matn ko'rinishida yuboring!");
      }
      if (!isValidName(text)) {
        return bot.sendMessage(
          chatId,
          "❌ Ism noto'g'ri!\n\n• Kamida 3 ta harf bo'lishi kerak\n• Faqat harflar va apostrof mumkin",
        );
      }

      await updateSession(chatId, { step: "PASSENGER_PHONE", data: { name: text.trim() } });

      return bot.sendMessage(chatId, "📱 Telefon raqamingizni kiriting:", {
        reply_markup: {
          keyboard: [[{ text: "📱 Telefon raqamni yuborish", request_contact: true }]],
          resize_keyboard: true,
        },
      });
    }

    // ─── TELEFON ─────────────────────────────────────────────────────────────
    if (session.step === "PASSENGER_PHONE") {
      const rawPhone = msg.contact ? msg.contact.phone_number : text;

      if (!rawPhone) {
        return bot.sendMessage(chatId, "❌ Telefon raqam yuboring!");
      }
      if (!isValidPhone(rawPhone)) {
        return bot.sendMessage(
          chatId,
          "❌ Noto'g'ri telefon raqam!\n\nFormat: <code>+998901234567</code>",
          { parse_mode: "HTML" },
        );
      }

      const phone    = normalizePhone(rawPhone);
      const data     = session.data || {};

      let user = await User.findOneAndUpdate(
        { telegramId: chatId },
        {
          $set: {
            role:     "passenger",
            name:     data.name,
            phone,
            username: msg.from.username || null,
          },
        },
        { new: true, upsert: true },
      );

      await deleteSession(chatId);
      logger.success("Yo'lovchi ro'yxatdan o'tdi:", { id: chatId, name: user.name });

      // Referal kodi
      if (!user.referralCode) {
        user.referralCode = `REF${user.telegramId}${Date.now().toString(36).toUpperCase()}`;
        await user.save();
      }

      const botInfo      = await bot.getMe();
      const referralLink = `https://t.me/${botInfo.username}?start=${user.referralCode}`;

      return bot.sendMessage(
        chatId,
        `✅ <b>RO'YXATDAN O'TDINGIZ!</b>\n\n` +
        `👤 Ism: <b>${user.name}</b>\n` +
        `📱 Telefon: <b>${user.phone}</b>\n\n` +
        `🎁 Referal havolangiz:\n${referralLink}\n\n` +
        `Buyurtma berish uchun quyidagi tugmalardan birini bosing:`,
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
    logger.error("Passenger registration error:", err);
    bot.sendMessage(chatId, "❌ Xatolik yuz berdi, qaytadan urinib ko'ring");
  }
}

module.exports = { handleMessage };
