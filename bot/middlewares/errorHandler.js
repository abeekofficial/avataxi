// middlewares/errorHandler.js
const logger = require("../utils/logger");

function applyErrorHandler(bot) {
  bot.on("polling_error", (err) => {
    logger.error("Polling error:", err.message);
  });

  bot.on("error", (err) => {
    logger.error("Bot error:", err.message);
  });

  process.on("unhandledRejection", (reason) => {
    logger.error("Unhandled Rejection:", reason);
  });

  process.on("uncaughtException", (err) => {
    logger.error("Uncaught Exception:", err);
    // PM2 restart qiladi
    process.exit(1);
  });
}

module.exports = { applyErrorHandler };
