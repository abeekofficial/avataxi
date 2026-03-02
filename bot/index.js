// index.js — Bot kirish nuqtasi
require("dotenv").config({
  path: `.env.${process.env.NODE_ENV || "development"}`,
});

const TelegramBot = require("node-telegram-bot-api");
const config      = require("./config");
const connectDB   = require("./config/database");
const logger      = require("./utils/logger");

// ── Middlewares ──────────────────────────────────────────────────────────────
const { applyGuard }        = require("./middlewares/botGuard");
const { applyErrorHandler } = require("./middlewares/errorHandler");

// ── Handlers ─────────────────────────────────────────────────────────────────
const { applyStart }         = require("./handlers/start");
const { applyRegistration }  = require("./handlers/registration");
const { applyDriverMenu }    = require("./handlers/driver/menu");
const { applyPassengerMenu } = require("./handlers/passenger/menu");
const { applyCallbackRouter }= require("./handlers/callbackRouter");
const { applyAdmin }         = require("./handlers/admin");

async function startBot() {
  try {
    await connectDB();

    const rawBot = new TelegramBot(config.bot.token, { polling: true });

    logger.success(`🚀 Bot ishga tushdi [${config.NODE_ENV.toUpperCase()}]`);
    logger.info(`Admin IDs: ${config.bot.adminIds.join(", ")}`);

    // 1️⃣ Error handler — eng birinchi
    applyErrorHandler(rawBot);

    // 2️⃣ Global auth guard — bot.onText va bot.on("message") wrap
    const bot = applyGuard(rawBot);

    // 3️⃣ /start — public, guard dan oldin
    applyStart(bot);

    // 4️⃣ Registratsiya — role tanlash va step handler
    applyRegistration(bot);

    // 5️⃣ Callback router — BITTA callback_query handler
    applyCallbackRouter(bot);

    // 6️⃣ Driver menyu handlerlari
    applyDriverMenu(bot);

    // 7️⃣ Passenger menyu handlerlari
    applyPassengerMenu(bot);

    // 8️⃣ Admin
    applyAdmin(bot);

    logger.success("✅ Barcha handler'lar yuklandi");

    // Graceful shutdown
    process.on("SIGTERM", () => {
      logger.info("SIGTERM olindi, bot to'xtatilmoqda...");
      rawBot.stopPolling();
      process.exit(0);
    });

    process.on("SIGINT", () => {
      logger.info("SIGINT olindi, bot to'xtatilmoqda...");
      rawBot.stopPolling();
      process.exit(0);
    });
  } catch (err) {
    logger.error("BOT START XATOSI:", err);
    process.exit(1);
  }
}

startBot();
