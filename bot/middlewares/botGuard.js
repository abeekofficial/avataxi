// middlewares/botGuard.js
// Har bir xabar uchun foydalanuvchi autentifikatsiyasini tekshiradi
const User = require("../models/User.model");
const logger = require("../utils/logger");
const { getSession } = require("../cache/sessionCache");

// Registration jarayonidagi steplar — autentifikatsiya kerak emas
const REGISTRATION_STEPS = new Set([
  "PASSENGER_NAME",
  "PASSENGER_PHONE",
  "DRIVER_NAME",
  "DRIVER_PHONE",
  "DRIVER_PHOTO",
  "DRIVER_CAR_MODEL",
  "DRIVER_CAR_NUMBER",
  "DRIVER_FROM",
  "DRIVER_TO",
  "ORDER_FROM_REGION",
  "ORDER_TO_REGION",
  "ORDER_PASSENGER_COUNT",
  "ORDER_CARGO_DESCRIPTION",
  "CARGO_FROM_REGION",
  "CARGO_TO_REGION",
  "CARGO_DESCRIPTION",
  "CARGO_PHOTO",
]);

// Public komandalar — tekshiruvsiz o'tadi
const PUBLIC_COMMANDS = new Set(["/start", "/help"]);

// Role tanlash tugmalari
const ROLE_BUTTONS = new Set(["🚕 Haydovchi", "🧍 Yo'lovchi"]);

async function ensureRegistered(msg) {
  const chatId = msg.chat.id;
  const text = msg.text || "";

  // Public komandalar
  if (PUBLIC_COMMANDS.has(text.split(" ")[0])) return { ok: true };

  // Role tanlash tugmalari
  if (ROLE_BUTTONS.has(text)) return { ok: true };

  // Session tekshiruvi — registration stepida bo'lsa o'tadi
  const session = await getSession(chatId);
  if (session && REGISTRATION_STEPS.has(session.step)) return { ok: true };

  // User DB dan tekshirish
  const user = await User.findOne({ telegramId: chatId }).lean();
  if (user && !user.isBlocked) return { ok: true, user };

  // Bloklangan user
  if (user && user.isBlocked) {
    return { ok: false, blocked: true };
  }

  return { ok: false };
}

// Bot metodlarini wrap qilish
function applyGuard(bot) {
  // Message-level cache — bir xabar bir marta tekshirilsin
  const pendingChecks = new Map();

  function getAuthResult(chatId, messageId, msg) {
    const key = `${chatId}:${messageId}`;
    if (!pendingChecks.has(key)) {
      pendingChecks.set(key, ensureRegistered(msg));
      setTimeout(() => pendingChecks.delete(key), 5000);
    }
    return pendingChecks.get(key);
  }

  const origOnText = bot.onText.bind(bot);
  const origOn = bot.on.bind(bot);

  bot.onText = (regexp, callback) => {
    origOnText(regexp, async (msg, match) => {
      // Faqat private chat da guard ishlaydi
      if (msg.chat.type !== "private") return callback(msg, match);

      const result = await getAuthResult(msg.chat.id, msg.message_id, msg);
      if (!result.ok) {
        return sendReRegisterPrompt(bot, msg.chat.id, result.blocked);
      }
      return callback(msg, match);
    });
  };

  bot.on = (event, callback) => {
    // MUHIM: faqat "message" eventini wrap qilamiz
    // callback_query va boshqa eventlar to'g'ridan-to'g'ri o'tadi
    if (event !== "message") return origOn(event, callback);

    origOn("message", async (msg) => {
      // Faqat private chat da guard ishlaydi
      if (msg.chat.type !== "private") return callback(msg);

      // Guruhga qo'shilish xabarlarini o'tkazib yuborish (admin.js uchun)
      if (msg.new_chat_members) return callback(msg);

      const result = await getAuthResult(msg.chat.id, msg.message_id, msg);
      if (!result.ok) {
        return sendReRegisterPrompt(bot, msg.chat.id, result.blocked);
      }
      return callback(msg);
    });
  };

  return bot;
}

async function sendReRegisterPrompt(bot, chatId, isBlocked = false) {
  try {
    const text = isBlocked
      ? "🚫 <b>Sizning akkauntingiz bloklangan.</b>\n\nAdmin bilan bog'laning."
      : "⚠️ <b>Siz tizimda ro'yxatdan o'tmagansiz.</b>\n\n/start bosing";

    await bot.sendMessage(chatId, text, { parse_mode: "HTML" });
  } catch (err) {
    logger.error("sendReRegisterPrompt xato:", err.message);
  }
}

module.exports = { applyGuard };
