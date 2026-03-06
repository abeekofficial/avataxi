const path = require("path");
const dotenv = require("dotenv");

// Bot papkasining mutlaq yo'li
const botDir = __dirname.includes("config")
  ? path.join(__dirname, "..")
  : __dirname;

// Avval .env, keyin .env.development — ikkalasini ham yuklash
dotenv.config({ path: path.join(botDir, ".env") });
dotenv.config({
  path: path.join(botDir, `.env.${process.env.NODE_ENV || "development"}`),
});

const config = {
  NODE_ENV: process.env.NODE_ENV || "development",
  isDev: process.env.NODE_ENV === "development",
  isProd: process.env.NODE_ENV === "production",

  bot: {
    token: process.env.BOT_TOKEN,
    adminIds: (process.env.ADMIN_IDS || "")
      .split(",")
      .map((id) => Number(id.trim()))
      .filter(Boolean),
    testUsers: (process.env.TEST_USERS || "")
      .split(",")
      .map((id) => Number(id.trim()))
      .filter(Boolean),
  },

  mongo: {
    uri: process.env.MONGO_URI,
    options: {
      maxPoolSize: 20,
      minPoolSize: 5,
      socketTimeoutMS: 30000,
      connectTimeoutMS: 10000,
    },
  },

  redis: {
    host: process.env.REDIS_HOST || "127.0.0.1",
    port: Number(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    db: 0,
    keyPrefix: "regbot:",
    retryDelayOnFailover: 100,
    maxRetriesPerRequest: 3,
  },

  session: {
    ttl: 60 * 60 * 2,
  },

  order: {
    offerTimeoutMs: 30_000,
    maxDriversPerOrder: 10,
  },

  webhook: {
    url: process.env.WEBHOOK_URL || "", // https://avataxi.onrender.com
    port: Number(process.env.PORT) || 3000,
    secret: process.env.WEBHOOK_SECRET || "regbot_secret_2024",
  },
};

// Majburiy env tekshiruvi
const required = ["BOT_TOKEN", "MONGO_URI"];
// Production da WEBHOOK_URL ham kerak
if (
  (process.env.NODE_ENV || "development") === "production" &&
  !process.env.WEBHOOK_URL
) {
  console.warn("⚠️  WEBHOOK_URL not set — webhook rejimi ishlamaydi");
}
for (const key of required) {
  if (!process.env[key]) {
    console.error("❌ Missing required env: " + key);
    console.error("📁 .env qidirigan joyi: " + path.join(botDir, ".env"));
    process.exit(1);
  }
}

module.exports = config;
