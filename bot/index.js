// index.js — Bot kirish nuqtasi (Webhook + Polling auto-switch)
const TelegramBot = require("node-telegram-bot-api");
const express = require("express");
const config = require("./config");
const connectDB = require("./config/database");
const logger = require("./utils/logger");

// ── Middlewares ───────────────────────────────────────────────────────────────
const { applyGuard } = require("./middlewares/botGuard");
const { applyErrorHandler } = require("./middlewares/errorHandler");

// ── Handlers ──────────────────────────────────────────────────────────────────
const { applyStart } = require("./handlers/start");
const { applyRegistration } = require("./handlers/registration");
const { applyDriverMenu } = require("./handlers/driver/menu");
const { applyPassengerMenu } = require("./handlers/passenger/menu");
const { applyCallbackRouter } = require("./handlers/callbackRouter");
const { applyAdmin } = require("./handlers/admin/index");
const { applyHelp } = require("./handlers/help");
const { applyGroupJoin } = require("./handlers/groupJoin");
const { applyProfileEdit } = require("./handlers/profile/edit");

// ─── Handler'larni botga ulash ────────────────────────────────────────────────
function applyHandlers(rawBot) {
  applyErrorHandler(rawBot);
  const bot = applyGuard(rawBot);

  applyStart(bot);
  applyRegistration(bot);
  applyCallbackRouter(bot);
  applyDriverMenu(bot);
  applyPassengerMenu(bot);
  applyHelp(bot);
  applyGroupJoin(bot);
  applyProfileEdit(bot);
  applyAdmin(bot);

  logger.success("✅ Barcha handler'lar yuklandi");
}

// ─── WEBHOOK rejimi (Render.com production) ───────────────────────────────────
async function startWebhook() {
  const app = express();
  const webhookUrl = config.webhook.url;
  const port = config.webhook.port;
  const secret = config.webhook.secret;
  const hookPath = "/webhook/" + secret;

  // Bot — webhook rejimida (polling o'chiq)
  const rawBot = new TelegramBot(config.bot.token, { polling: false });

  app.use(express.json());

  // Render.com health check — "spin down" ni oldini olish
  app.get("/", (req, res) =>
    res.json({
      status: "ok",
      mode: "webhook",
      uptime: Math.floor(process.uptime()) + "s",
    }),
  );
  app.get("/health", (req, res) => res.json({ status: "ok" }));

  // Telegram update qabul qilish
  app.post(hookPath, (req, res) => {
    rawBot.processUpdate(req.body);
    res.sendStatus(200);
  });

  // Handler'larni ulash
  applyHandlers(rawBot);

  // Server ishga tushirish
  app.listen(port, "0.0.0.0", async () => {
    logger.success("🌐 Express server: port " + port);
    try {
      await rawBot.deleteWebHook();
      await rawBot.setWebHook(webhookUrl + hookPath, {
        allowed_updates: [
          "message",
          "callback_query",
          "my_chat_member",
          "chat_member",
        ],
        drop_pending_updates: true,
      });
      const info = await rawBot.getWebHookInfo();
      logger.success("🔗 Webhook: " + webhookUrl + hookPath);
      logger.info("Pending updates: " + info.pending_update_count);
    } catch (err) {
      logger.error("Webhook xato:", err.message);
    }
  });

  process.on("SIGTERM", async () => {
    logger.info("SIGTERM — to'xtatilmoqda...");
    await rawBot.deleteWebHook().catch(() => {});
    process.exit(0);
  });
  process.on("SIGINT", async () => {
    await rawBot.deleteWebHook().catch(() => {});
    process.exit(0);
  });
}

// ─── POLLING rejimi (local development) ──────────────────────────────────────
async function startPolling() {
  // Eski webhookni o'chirish
  const tmp = new TelegramBot(config.bot.token, { polling: false });
  await tmp.deleteWebHook({ drop_pending_updates: true }).catch(() => {});
  logger.info("Eski webhook o'chirildi");

  const rawBot = new TelegramBot(config.bot.token, {
    polling: {
      interval: 300,
      autoStart: true,
      params: {
        timeout: 10,
        allowed_updates: [
          "message",
          "callback_query",
          "my_chat_member",
          "chat_member",
        ],
      },
    },
  });

  applyHandlers(rawBot);
  logger.success("🔄 Polling rejimida ishlamoqda");

  process.on("SIGTERM", () => {
    rawBot.stopPolling();
    process.exit(0);
  });
  process.on("SIGINT", () => {
    rawBot.stopPolling();
    process.exit(0);
  });
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  try {
    await connectDB();
    logger.success(
      "🚀 Bot ishga tushdi [" + config.NODE_ENV.toUpperCase() + "]",
    );
    logger.info("Admin IDs: " + config.bot.adminIds.join(", "));

    if (config.isProd && config.webhook.url) {
      logger.info("Rejim: 🌐 WEBHOOK → " + config.webhook.url);
      await startWebhook();
    } else {
      logger.info("Rejim: 🔄 POLLING (dev)");
      await startPolling();
    }
  } catch (err) {
    logger.error("BOT START XATOSI:", err);
    process.exit(1);
  }
}

main();
