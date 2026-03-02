// handlers/registration/driver.js
const User    = require("../../models/User.model");
const logger  = require("../../utils/logger");
const { isValidName, isValidPhone, normalizePhone, validateCarNumber } = require("../../utils/validators");
const { createSession, updateSession, deleteSession } = require("../../cache/sessionCache");

async function handleMessage(bot, msg, session) {
  const chatId = msg.chat.id;
  const text   = msg.text || "";

  try {
    // ─── ISM ─────────────────────────────────────────────────────────────────
    if (session.step === "DRIVER_NAME") {
      if (!msg.text) {
        return bot.sendMessage(chatId, "❌ Iltimos ismingizni matn ko'rinishida yuboring!");
      }
      if (!isValidName(text)) {
        return bot.sendMessage(
          chatId,
          "❌ Ism noto'g'ri!\n\n• Kamida 3 ta harf bo'lishi kerak\n• Faqat harflar va apostrof mumkin\n• Raqam yoki komanda bo'lmasin",
        );
      }

      await updateSession(chatId, { step: "DRIVER_PHONE", data: { name: text.trim() } });

      return bot.sendMessage(chatId, "📱 Telefon raqamingizni kiriting:", {
        reply_markup: {
          keyboard: [[{ text: "📱 Telefon raqamni yuborish", request_contact: true }]],
          resize_keyboard: true,
        },
      });
    }

    // ─── TELEFON ─────────────────────────────────────────────────────────────
    if (session.step === "DRIVER_PHONE") {
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

      const phone = normalizePhone(rawPhone);
      await updateSession(chatId, { step: "DRIVER_PHOTO", data: { phone } });

      return bot.sendMessage(
        chatId,
        "📸 O'zingiz va mashinangiz bilan bitta RASM yuboring:",
        { reply_markup: { remove_keyboard: true } },
      );
    }

    // ─── RASM ─────────────────────────────────────────────────────────────────
    if (session.step === "DRIVER_PHOTO") {
      if (!msg.photo) {
        return bot.sendMessage(chatId, "❌ Iltimos rasm yuboring! (faqat rasm formatida)");
      }

      const fileId = msg.photo[msg.photo.length - 1].file_id;
      await updateSession(chatId, { step: "DRIVER_CAR_MODEL", data: { driverPhoto: fileId } });

      return bot.sendMessage(chatId, "🚗 Mashina modelini kiriting:\n(Masalan: Chevrolet Lacetti)");
    }

    // ─── MASHINA MODELI ───────────────────────────────────────────────────────
    if (session.step === "DRIVER_CAR_MODEL") {
      if (!msg.text) {
        return bot.sendMessage(chatId, "❌ Iltimos matn ko'rinishida yuboring!");
      }
      if (text.trim().length < 3) {
        return bot.sendMessage(chatId, "❌ Mashina modeli kamida 3 ta belgi bo'lishi kerak!");
      }

      await updateSession(chatId, { step: "DRIVER_CAR_NUMBER", data: { carModel: text.trim() } });

      return bot.sendMessage(
        chatId,
        "🔢 Mashina davlat raqamini kiriting:\n\n" +
        "Formatlar:\n" +
        "• <code>01 A 777 AA</code>\n" +
        "• <code>01 777 AAA</code>",
        { parse_mode: "HTML" },
      );
    }

    // ─── MASHINA RAQAMI ───────────────────────────────────────────────────────
    if (session.step === "DRIVER_CAR_NUMBER") {
      if (!msg.text) {
        return bot.sendMessage(chatId, "❌ Iltimos matn ko'rinishida yuboring!");
      }

      const result = validateCarNumber(text);
      if (!result.valid) {
        return bot.sendMessage(chatId, result.message, { parse_mode: "HTML" });
      }

      // Barcha session datani yig'amiz
      const data = session.data || {};
      data.carNumber = result.formatted;

      // DB ga saqlash
      let user = await User.findOneAndUpdate(
        { telegramId: chatId },
        {
          $set: {
            role:        "driver",
            name:        data.name,
            phone:       data.phone,
            driverPhoto: data.driverPhoto,
            carModel:    data.carModel,
            carNumber:   data.carNumber,
            isActive:    true,
          },
        },
        { new: true, upsert: true },
      );

      // Session tozalash
      await deleteSession(chatId);

      logger.success("Haydovchi ro'yxatdan o'tdi:", { id: chatId, name: user.name });

      // Referal kodi yaratish
      if (!user.referralCode) {
        user.referralCode = `REF${user.telegramId}${Date.now().toString(36).toUpperCase()}`;
        await user.save();
      }

      const botInfo       = await bot.getMe();
      const referralLink  = `https://t.me/${botInfo.username}?start=${user.referralCode}`;

      const welcomeMsg =
        `✅ <b>RO'YXATDAN O'TDINGIZ!</b>\n\n` +
        `👤 Ism: <b>${user.name}</b>\n` +
        `📱 Telefon: <b>${user.phone}</b>\n` +
        `🚗 Mashina: <b>${user.carModel}</b>\n` +
        `🔢 Raqam: <b>${user.carNumber}</b>\n\n` +
        `🚗 REFERAL DASTURI:\n` +
        `Do'stlaringizni taklif qiling — prioritetingiz oshadi!\n\n` +
        `📎 Sizning havolangiz:\n${referralLink}\n\n` +
        `💡 Buyurtma qabul qilishni boshlash uchun tugmani bosing!`;

      return bot.sendMessage(chatId, welcomeMsg, {
        parse_mode: "HTML",
        reply_markup: {
          keyboard: [
            ["🚖 Buyurtma qabul qilishni boshlash"],
            ["📋 Buyurtmalar", "👤 Profilim"],
            ["📊 Statistika", "⭐ Reytingim", "📋 Bot haqida"],
          ],
          resize_keyboard: true,
        },
      });
    }
  } catch (err) {
    logger.error("Driver registration error:", err);
    bot.sendMessage(chatId, "❌ Xatolik yuz berdi, qaytadan urinib ko'ring");
  }
}

module.exports = { handleMessage };
