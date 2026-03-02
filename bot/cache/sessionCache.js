// cache/sessionCache.js
// Redis asosida session — MongoDB ga har xabarda query yuborilmaydi
const { getRedis } = require("./redis");
const config = require("../config");

const TTL = config.session.ttl; // 2 soat

function sessionKey(telegramId) {
  return `session:${telegramId}`;
}

async function getSession(telegramId) {
  try {
    const redis = getRedis();
    const data = await redis.get(sessionKey(telegramId));
    return data ? JSON.parse(data) : null;
  } catch (err) {
    // Redis xato bo'lsa — null qaytaramiz (fallback)
    return null;
  }
}

async function setSession(telegramId, sessionData) {
  try {
    const redis = getRedis();
    await redis.setex(
      sessionKey(telegramId),
      TTL,
      JSON.stringify(sessionData),
    );
    return true;
  } catch (err) {
    return false;
  }
}

async function updateSession(telegramId, updates) {
  try {
    const current = await getSession(telegramId) || {};
    const updated = {
      ...current,
      ...updates,
      data: { ...(current.data || {}), ...(updates.data || {}) },
    };
    return setSession(telegramId, updated);
  } catch (err) {
    return false;
  }
}

async function deleteSession(telegramId) {
  try {
    const redis = getRedis();
    await redis.del(sessionKey(telegramId));
    return true;
  } catch (err) {
    return false;
  }
}

async function createSession(telegramId, step, data = {}) {
  return setSession(telegramId, { step, data, createdAt: Date.now() });
}

module.exports = { getSession, setSession, updateSession, deleteSession, createSession };
