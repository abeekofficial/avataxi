// cache/redis.js
const Redis = require("ioredis");
const config = require("../config");
const logger = require("../utils/logger");

let client = null;

function getRedis() {
  if (client) return client;

  // Render.com REDIS_URL (redis://...) yoki alohida host/port
  const redisUrl = process.env.REDIS_URL;

  const options = redisUrl
    ? {
        // Render.com Redis — URL formatida
        lazyConnect: false,
        enableReadyCheck: true,
        keyPrefix: "regbot:",
        maxRetriesPerRequest: 3,
        retryStrategy(times) {
          if (times > 10) {
            logger.error("Redis: ulanib bo'lmadi");
            return null;
          }
          return Math.min(times * 100, 2000);
        },
      }
    : {
        // Docker / local — host:port formatida
        host: config.redis.host,
        port: config.redis.port,
        password: config.redis.password || undefined,
        db: config.redis.db,
        keyPrefix: config.redis.keyPrefix,
        maxRetriesPerRequest: config.redis.maxRetriesPerRequest,
        enableReadyCheck: true,
        lazyConnect: false,
        retryStrategy(times) {
          if (times > 10) {
            logger.error("Redis: ulanib bo'lmadi");
            return null;
          }
          return Math.min(times * 100, 2000);
        },
      };

  client = redisUrl ? new Redis(redisUrl, options) : new Redis(options);

  client.on("connect", () => logger.info("✅ Redis ulandi"));
  client.on("error", (err) => logger.error("Redis xato:", err.message));
  client.on("reconnecting", () => logger.warn("Redis qayta ulanmoqda..."));

  return client;
}

module.exports = { getRedis };
