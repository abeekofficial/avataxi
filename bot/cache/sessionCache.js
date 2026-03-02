// cache/sessionCache.js
// Redis asosida session — Redis ishlamasa in-memory fallback
const { getRedis } = require("./redis");
const config = require("../config");

const TTL = config.session.ttl; // 2 soat (sekund)

// ── In-memory fallback (Redis ishlamasa) ─────────────────────────────────────
const memoryStore = new Map();

function memoryGet(key) {
  const entry = memoryStore.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    memoryStore.delete(key);
    return null;
  }
  return entry.value;
}

function memorySet(key, value, ttlSeconds) {
  memoryStore.set(key, {
    value,
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
}

function memoryDel(key) {
  memoryStore.delete(key);
}

// ── Session key ──────────────────────────────────────────────────────────────
function sessionKey(telegramId) {
  return `session:${telegramId}`;
}

// ── ASOSIY FUNKSIYALAR ───────────────────────────────────────────────────────

async function getSession(telegramId) {
  const key = sessionKey(telegramId);

  // Redis urinish
  try {
    const redis = getRedis();
    if (redis.status === "ready") {
      const data = await redis.get(key);
      if (data !== null) {
        return JSON.parse(data);
      }
      return memoryGet(key);
    }
  } catch (err) {
    // Redis ishlamaydi
  }

  // Fallback: in-memory
  return memoryGet(key);
}

async function setSession(telegramId, sessionData) {
  const key = sessionKey(telegramId);

  // Memory ga har doim yozamiz (backup sifatida)
  memorySet(key, sessionData, TTL);

  // Redis ga ham urinib ko'ramiz
  try {
    const redis = getRedis();
    if (redis.status === "ready") {
      await redis.setex(key, TTL, JSON.stringify(sessionData));
    }
  } catch (err) {
    // Redis xato — memory dan foydalanilamiz
  }

  return true;
}

async function updateSession(telegramId, updates) {
  try {
    const current = (await getSession(telegramId)) || {};
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
  const key = sessionKey(telegramId);

  memoryDel(key);

  try {
    const redis = getRedis();
    if (redis.status === "ready") {
      await redis.del(key);
    }
  } catch (err) {
    // ignore
  }

  return true;
}

async function createSession(telegramId, step, data = {}) {
  return setSession(telegramId, { step, data, createdAt: Date.now() });
}

module.exports = {
  getSession,
  setSession,
  updateSession,
  deleteSession,
  createSession,
};
