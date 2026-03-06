// handlers/profile/edit.js — Driver va Passenger profil tahrirlash
const User = require("../../models/User.model");
const logger = require("../../utils/logger");
const { getRegionName, REGIONS } = require("../../utils/regionOptions");
const {
  isValidName,
  isValidPhone,
  normalizePhone,
  validateCarNumber,
} = require("../../utils/validators");
const {
  createSession,
  updateSession,
  getSession,
  deleteSession,
} = require("../../cache/sessionCache");

// ─── Session steplari ────────────────────────────────────────────────────────
const EDIT_STEPS = new Set([
  "EDIT_NAME",
  "EDIT_PHONE",
  "EDIT_PHONE_WAIT",
  "EDIT_CAR_MODEL",
  "EDIT_CAR_NUMBER",
  "EDIT_PHOTO",
  "EDIT_FROM",
  "EDIT_TO",
]);

// ─── Region inline keyboard ──────────────────────────────────────────────────
function regionKeyboard(prefix) {
  const rows = [];
  for (let i = 0; i < REGIONS.length; i += 2) {
    const row = [
      { text: REGIONS[i].name, callback_data: prefix + REGIONS[i].code },
    ];
    if (REGIONS[i + 1]) {
      row.push({
        text: REGIONS[i + 1].name,
        callback_data: prefix + REGIONS[i + 1].code,
      });
    }
    rows.push(row);
  }
  return { inline_keyboard: rows };
}

// ─── Profil kartasi ko'rsatish ───────────────────────────────────────────────
async function showProfileEdit(bot, chatId, user) {
  if (user.role === "driver") {
    await bot.sendMessage(
      chatId,
      "<pre>✏️ PROFILNI TAHRIRLASH</pre>\n\n" +
        "👤 Ism: <b>" +
        user.name +
        "</b>\n" +
        "📱 Telefon: <b>" +
        user.phone +
        "</b>\n" +
        "🚗 Mashina: <b>" +
        (user.carModel || "—") +
        "</b>\n" +
        "🔢 Raqam: <b>" +
        (user.carNumber || "—") +
        "</b>\n" +
        "📍 Yo'nalish: <b>" +
        (user.from ? getRegionName(user.from) : "—") +
        " → " +
        (user.to ? getRegionName(user.to) : "—") +
        "</b>\n\n" +
        "Nimani o'zgartirmoqchisiz?",
      {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [
              { text: "👤 Ism", callback_data: "edit_name" },
              { text: "📱 Telefon", callback_data: "edit_phone" },
            ],
            [
              { text: "🚗 Mashina", callback_data: "edit_car_model" },
              { text: "🔢 Raqam", callback_data: "edit_car_number" },
            ],
            [
              { text: "📍 Qayerdan", callback_data: "edit_from" },
              { text: "🏁 Qayerga", callback_data: "edit_to" },
            ],
            [{ text: "📸 Rasm", callback_data: "edit_photo" }],
            [{ text: "❌ Bekor", callback_data: "edit_cancel" }],
          ],
        },
      },
    );
  } else {
    // Passenger
    await bot.sendMessage(
      chatId,
      "<pre>✏️ PROFILNI TAHRIRLASH</pre>\n\n" +
        "👤 Ism: <b>" +
        user.name +
        "</b>\n" +
        "📱 Telefon: <b>" +
        user.phone +
        "</b>\n\n" +
        "Nimani o'zgartirmoqchisiz?",
      {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [
              { text: "👤 Ism", callback_data: "edit_name" },
              { text: "📱 Telefon", callback_data: "edit_phone" },
            ],
            [{ text: "❌ Bekor", callback_data: "edit_cancel" }],
          ],
        },
      },
    );
  }
}

// ─── Xabar handler (tahrirlash jarayonida kiritilgan matnlar) ────────────────
async function handleEditMessage(bot, msg, session) {
  const chatId = msg.chat.id;
  const text = (msg.text || "").trim();
  const step = session.step;

  // ── Ism tahrirlash ─────────────────────────────────────────────────────────
  if (step === "EDIT_NAME") {
    if (!msg.text)
      return bot.sendMessage(chatId, "❌ Matn ko'rinishida yuboring!");
    if (!isValidName(text)) {
      return bot.sendMessage(
        chatId,
        "❌ Ism noto'g'ri!\n• Kamida 3 ta harf\n• Faqat harflar",
      );
    }
    await User.findOneAndUpdate({ telegramId: chatId }, { name: text });
    await deleteSession(chatId);
    logger.info("Edit name: " + chatId + " → " + text);
    return bot.sendMessage(chatId, "✅ <b>Ism yangilandi:</b> " + text, {
      parse_mode: "HTML",
      reply_markup: { remove_keyboard: false },
    });
  }

  // ── Telefon tahrirlash ─────────────────────────────────────────────────────
  if (step === "EDIT_PHONE_WAIT") {
    const rawPhone = msg.contact ? msg.contact.phone_number : text;
    if (!rawPhone || !isValidPhone(rawPhone)) {
      return bot.sendMessage(
        chatId,
        "❌ Noto'g'ri telefon!\nFormat: <code>+998901234567</code>",
        { parse_mode: "HTML" },
      );
    }
    const phone = normalizePhone(rawPhone);
    await User.findOneAndUpdate({ telegramId: chatId }, { phone });
    await deleteSession(chatId);
    logger.info("Edit phone: " + chatId + " → " + phone);
    return bot.sendMessage(chatId, "✅ <b>Telefon yangilandi:</b> " + phone, {
      parse_mode: "HTML",
      reply_markup: { remove_keyboard: true },
    });
  }

  // ── Mashina modeli ─────────────────────────────────────────────────────────
  if (step === "EDIT_CAR_MODEL") {
    if (!msg.text || text.length < 3) {
      return bot.sendMessage(chatId, "❌ Kamida 3 ta belgi kiriting!");
    }
    await User.findOneAndUpdate({ telegramId: chatId }, { carModel: text });
    await deleteSession(chatId);
    logger.info("Edit carModel: " + chatId + " → " + text);
    return bot.sendMessage(chatId, "✅ <b>Mashina yangilandi:</b> " + text, {
      parse_mode: "HTML",
    });
  }

  // ── Mashina raqami ─────────────────────────────────────────────────────────
  if (step === "EDIT_CAR_NUMBER") {
    if (!msg.text) return bot.sendMessage(chatId, "❌ Raqam kiriting!");
    const result = validateCarNumber(text);
    if (!result.valid) {
      return bot.sendMessage(chatId, result.message, { parse_mode: "HTML" });
    }
    await User.findOneAndUpdate(
      { telegramId: chatId },
      { carNumber: result.formatted },
    );
    await deleteSession(chatId);
    logger.info("Edit carNumber: " + chatId + " → " + result.formatted);
    return bot.sendMessage(
      chatId,
      "✅ <b>Mashina raqami yangilandi:</b> " + result.formatted,
      { parse_mode: "HTML" },
    );
  }

  // ── Rasm ───────────────────────────────────────────────────────────────────
  if (step === "EDIT_PHOTO") {
    if (!msg.photo) {
      return bot.sendMessage(
        chatId,
        "❌ Rasm yuboring! (faqat rasm formatida)",
      );
    }
    const fileId = msg.photo[msg.photo.length - 1].file_id;
    await User.findOneAndUpdate(
      { telegramId: chatId },
      { driverPhoto: fileId },
    );
    await deleteSession(chatId);
    logger.info("Edit photo: " + chatId);
    return bot.sendMessage(chatId, "✅ <b>Rasm yangilandi!</b>", {
      parse_mode: "HTML",
    });
  }
}

// ─── Asosiy funksiya ─────────────────────────────────────────────────────────
function applyProfileEdit(bot) {
  // ── 📝 Profilni tahrirlash tugmasi ─────────────────────────────────────────
  bot.onText(/📝 Profilni tahrirlash/, async (msg) => {
    const chatId = Number(msg.chat.id);
    try {
      const user = await User.findOne({ telegramId: chatId });
      if (!user) return;
      await showProfileEdit(bot, chatId, user);
    } catch (err) {
      logger.error("Profile edit error:", err);
    }
  });

  // ── Matn xabarlarni ushlash (tahrirlash steplari) ──────────────────────────
  bot.on("message", async (msg) => {
    if (msg.chat.type !== "private") return;
    const chatId = msg.chat.id;
    const session = await getSession(chatId);
    if (!session || !EDIT_STEPS.has(session.step)) return;

    await handleEditMessage(bot, msg, session);
  });

  // ── Callback querylar ──────────────────────────────────────────────────────
  bot.on("callback_query", async (query) => {
    const chatId = Number(query.from.id);
    const data = query.data;

    if (
      !data.startsWith("edit_") &&
      !data.startsWith("editfrom_") &&
      !data.startsWith("editto_")
    )
      return;

    await bot.answerCallbackQuery(query.id);

    try {
      // Profil tahrirlash menyusini ochish (👤 Profilim dan tugma orqali)
      if (data === "open_profile_edit") {
        const user = await User.findOne({ telegramId: chatId });
        if (!user) return;
        return showProfileEdit(bot, chatId, user);
      }

      // Bekor qilish
      if (data === "edit_cancel") {
        await deleteSession(chatId);
        return bot.sendMessage(chatId, "❌ Tahrirlash bekor qilindi.");
      }

      // Ism
      if (data === "edit_name") {
        await createSession(chatId, "EDIT_NAME", {});
        return bot.sendMessage(chatId, "👤 Yangi ismingizni kiriting:");
      }

      // Telefon
      if (data === "edit_phone") {
        await createSession(chatId, "EDIT_PHONE_WAIT", {});
        return bot.sendMessage(
          chatId,
          "📱 Yangi telefon raqamingizni yuboring:",
          {
            reply_markup: {
              keyboard: [
                [
                  {
                    text: "📱 Telefon raqamni yuborish",
                    request_contact: true,
                  },
                ],
              ],
              resize_keyboard: true,
              one_time_keyboard: true,
            },
          },
        );
      }

      // Mashina modeli (driver)
      if (data === "edit_car_model") {
        await createSession(chatId, "EDIT_CAR_MODEL", {});
        return bot.sendMessage(
          chatId,
          "🚗 Yangi mashina modelini kiriting:\n(Masalan: Chevrolet Lacetti)",
        );
      }

      // Mashina raqami (driver)
      if (data === "edit_car_number") {
        await createSession(chatId, "EDIT_CAR_NUMBER", {});
        return bot.sendMessage(
          chatId,
          "🔢 Yangi mashina raqamini kiriting:\n\n" +
            "• <code>01 A 777 AA</code>\n" +
            "• <code>01 777 AAA</code>",
          { parse_mode: "HTML" },
        );
      }

      // Rasm (driver)
      if (data === "edit_photo") {
        await createSession(chatId, "EDIT_PHOTO", {});
        return bot.sendMessage(
          chatId,
          "📸 O'zingiz va mashinangiz bilan bitta yangi rasm yuboring:",
        );
      }

      // Qayerdan (driver) — region tanlash
      if (data === "edit_from") {
        await createSession(chatId, "EDIT_FROM", {});
        return bot.sendMessage(chatId, "📍 Qayerdan yo'lga chiqasiz?", {
          reply_markup: regionKeyboard("editfrom_"),
        });
      }

      // Qayerga (driver) — region tanlash
      if (data === "edit_to") {
        await createSession(chatId, "EDIT_TO", {});
        return bot.sendMessage(chatId, "🏁 Qayerga ketasiz?", {
          reply_markup: regionKeyboard("editto_"),
        });
      }

      // Region saqlash — FROM
      if (data.startsWith("editfrom_")) {
        const regionCode = data.replace("editfrom_", "");
        const user = await User.findOneAndUpdate(
          { telegramId: chatId },
          { from: regionCode },
          { new: true },
        );
        await deleteSession(chatId);
        logger.info("Edit from: " + chatId + " → " + regionCode);
        return bot.sendMessage(
          chatId,
          "✅ <b>Qayerdan yangilandi:</b> " +
            getRegionName(regionCode) +
            "\n\n📍 Yo'nalish: <b>" +
            getRegionName(regionCode) +
            " → " +
            (user.to ? getRegionName(user.to) : "—") +
            "</b>",
          { parse_mode: "HTML" },
        );
      }

      // Region saqlash — TO
      if (data.startsWith("editto_")) {
        const regionCode = data.replace("editto_", "");
        const user = await User.findOneAndUpdate(
          { telegramId: chatId },
          { to: regionCode },
          { new: true },
        );
        await deleteSession(chatId);
        logger.info("Edit to: " + chatId + " → " + regionCode);
        return bot.sendMessage(
          chatId,
          "✅ <b>Qayerga yangilandi:</b> " +
            getRegionName(regionCode) +
            "\n\n📍 Yo'nalish: <b>" +
            (user.from ? getRegionName(user.from) : "—") +
            " → " +
            getRegionName(regionCode) +
            "</b>",
          { parse_mode: "HTML" },
        );
      }
    } catch (err) {
      logger.error("Edit callback error:", err);
      bot.sendMessage(chatId, "❌ Xatolik yuz berdi, qaytadan urinib ko'ring.");
    }
  });
}

module.exports = { applyProfileEdit, EDIT_STEPS };
