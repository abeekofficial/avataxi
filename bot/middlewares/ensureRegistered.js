// middlewares/ensureRegistered.js
const { getSession } = require("../cache/sessionCache");
const User = require("../models/User.model");

// Session steplar — bu steplarda auth tekshirilmaydi
const SKIP_STEPS = new Set([
  "PASSENGER_NAME", "PASSENGER_PHONE",
  "DRIVER_NAME",    "DRIVER_PHONE", "DRIVER_PHOTO", "DRIVER_CAR_MODEL", "DRIVER_CAR_NUMBER",
  "DRIVER_FROM",    "DRIVER_TO",
  "ORDER_FROM_REGION", "ORDER_TO_REGION", "ORDER_PASSENGER_COUNT",
  "CARGO_FROM_REGION", "CARGO_TO_REGION", "CARGO_DESCRIPTION", "CARGO_PHOTO",
]);

module.exports = async function ensureRegistered(bot, msg) {
  const chatId = msg.chat.id;

  // Aktiv session tekshiruvi
  const session = await getSession(chatId);
  if (session && SKIP_STEPS.has(session.step)) {
    return { ok: true };
  }

  // User DB da bormi?
  const user = await User.findOne({ telegramId: chatId }).lean();
  if (!user || !user.role) {
    await bot.sendMessage(
      chatId,
      "<b>⚠️ Ma'lumotlaringiz topilmadi.\nIltimos qayta ro'yxatdan o'ting ❗</b>",
      {
        parse_mode: "HTML",
        reply_markup: {
          keyboard: [["🧍 Yo'lovchi", "🚕 Haydovchi"]],
          resize_keyboard: true,
        },
      },
    );
    return { ok: false };
  }

  return { ok: true, user };
};
