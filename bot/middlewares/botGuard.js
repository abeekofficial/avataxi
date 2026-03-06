// middlewares/botGuard.js
const User = require("../models/User.model");
const logger = require("../utils/logger");
const { getSession } = require("../cache/sessionCache");

const config = require("../config");

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

const PUBLIC_COMMANDS = new Set(["/start", "/help"]);
const ROLE_BUTTONS = new Set(["🚕 Haydovchi", "🧍 Yo'lovchi"]);

async function ensureRegistered(msg) {
  const chatId = msg.chat.id;
  const text = msg.text || "";

  // Admin hech qachon block bo'lmaydi
  if (config.bot.adminIds.includes(Number(chatId))) return { ok: true };

  if (PUBLIC_COMMANDS.has(text.split(" ")[0])) return { ok: true };
  if (ROLE_BUTTONS.has(text)) return { ok: true };

  const session = await getSession(chatId);
  if (session && REGISTRATION_STEPS.has(session.step)) return { ok: true };

  const user = await User.findOne({ telegramId: chatId }).lean();
  if (user && user.isBlocked) return { ok: false, blocked: true };
  if (user) return { ok: true, user };

  return { ok: false };
}

function applyGuard(bot) {
  // Auth natijasini cache — bir xabar uchun bir marta DB so'rovi
  const authCache = new Map();

  // ⭐ ASOSIY TUZATISH: bir xabar uchun faqat bir marta ogohlantirish
  const warnedMessages = new Set();

  function getAuthResult(chatId, messageId, msg) {
    const key = `${chatId}:${messageId}`;
    if (!authCache.has(key)) {
      authCache.set(key, ensureRegistered(msg));
      setTimeout(() => authCache.delete(key), 5000);
    }
    return authCache.get(key);
  }

  async function guardCheck(msg, callback, match = null) {
    if (msg.chat.type !== "private") return callback(msg, match);
    if (msg.new_chat_members) return callback(msg, match);

    const result = await getAuthResult(msg.chat.id, msg.message_id, msg);

    if (!result.ok) {
      // Bir messageId uchun faqat bir marta xabar yuborish
      const warnKey = `${msg.chat.id}:${msg.message_id}`;
      if (!warnedMessages.has(warnKey)) {
        warnedMessages.add(warnKey);
        setTimeout(() => warnedMessages.delete(warnKey), 10000);
        await sendReRegisterPrompt(bot, msg.chat.id, result.blocked);
      }
      return; // callback chaqirmaymiz
    }

    return callback(msg, match);
  }

  const origOnText = bot.onText.bind(bot);
  const origOn = bot.on.bind(bot);

  bot.onText = (regexp, callback) => {
    origOnText(regexp, (msg, match) => guardCheck(msg, callback, match));
  };

  bot.on = (event, callback) => {
    if (event !== "message") return origOn(event, callback);
    origOn("message", (msg) => guardCheck(msg, callback));
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
