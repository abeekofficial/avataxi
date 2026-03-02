// config/database.js
const mongoose = require("mongoose");
const config   = require("./index");
const logger   = require("../utils/logger");

async function connectDB() {
  try {
    await mongoose.connect(config.mongo.uri, config.mongo.options);
    logger.success("✅ MongoDB ulandi");

    mongoose.connection.on("disconnected", () => {
      logger.warn("MongoDB uzilib qoldi, qayta ulanmoqda...");
    });

    mongoose.connection.on("reconnected", () => {
      logger.success("✅ MongoDB qayta ulandi");
    });

    mongoose.connection.on("error", (err) => {
      logger.error("MongoDB error:", err.message);
    });
  } catch (err) {
    logger.error("MongoDB ulanmadi:", err.message);
    process.exit(1);
  }
}

module.exports = connectDB;
