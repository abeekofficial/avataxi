// handlers/registration/index.js
const logger = require("../../utils/logger");
const { getSession, createSession } = require("../../cache/sessionCache");
const { handleMessage: handleDriverReg }    = require("./driver");
const { handleMessage: handlePassengerReg } = require("./passenger");

const DRIVER_STEPS    = ["DRIVER_NAME",    "DRIVER_PHONE",    "DRIVER_PHOTO", "DRIVER_CAR_MODEL", "DRIVER_CAR_NUMBER"];
const PASSENGER_STEPS = ["PASSENGER_NAME", "PASSENGER_PHONE"];

function applyRegistration(bot) {
  // ── Haydovchi sifatida kirishni boshlash ─────────────────────────────────
  bot.onText(/🚕 Haydovchi/, async (msg) => {
    const chatId = msg.chat.id;
    try {
      await createSession(chatId, "DRIVER_NAME", { role: "driver" });
      return bot.sendMessage(
        chatId,
        "👤 Ismingizni kiriting:\n(Masalan: Abror Toshmatov)",
        { reply_markup: { remove_keyboard: true } },
      );
    } catch (err) {
      logger.error("Driver start reg error:", err);
    }
  });

  // ── Yo'lovchi sifatida kirishni boshlash ──────────────────────────────────
  bot.onText(/🧍 Yo'lovchi/, async (msg) => {
    const chatId = msg.chat.id;
    try {
      await createSession(chatId, "PASSENGER_NAME", { role: "passenger" });
      return bot.sendMessage(
        chatId,
        "👤 Ismingizni kiriting:\n(Masalan: Kamola Yusupova)",
        { reply_markup: { remove_keyboard: true } },
      );
    } catch (err) {
      logger.error("Passenger start reg error:", err);
    }
  });

  // ── Barcha xabarlar — session stepiga yo'naltirish ────────────────────────
  bot.on("message", async (msg) => {
    if (msg.chat.type !== "private") return;

    const chatId  = msg.chat.id;
    const session = await getSession(chatId);
    if (!session) return;

    try {
      if (DRIVER_STEPS.includes(session.step)) {
        return handleDriverReg(bot, msg, session);
      }
      if (PASSENGER_STEPS.includes(session.step)) {
        return handlePassengerReg(bot, msg, session);
      }
    } catch (err) {
      logger.error("Registration router error:", err);
      bot.sendMessage(chatId, "❌ Xatolik yuz berdi, /start bosing");
    }
  });
}

module.exports = { applyRegistration };
