// config/index.js
require("dotenv").config({
  path: `.env.${process.env.NODE_ENV || "development"}`,
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
    ttl: 60 * 60 * 2, // 2 soat (sekund)
  },

  order: {
    offerTimeoutMs: 30_000,    // Driver uchun 30 soniya
    maxDriversPerOrder: 10,
  },
};

// Majburiy env tekshiruvi
const required = ["BOT_TOKEN", "MONGO_URI"];
for (const key of required) {
  if (!process.env[key]) {
    console.error(`❌ Missing required env: ${key}`);
    process.exit(1);
  }
}

module.exports = config;
