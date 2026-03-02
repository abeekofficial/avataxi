// utils/validators.js

const VALID_REGION_CODES = new Set([
  "01","02","03","04","05","06","07","08","09","10",
  "11","12","13","14","20","25","30","40","50","55",
  "60","65","70","75","80","85","90","95",
]);

function isValidName(text) {
  if (!text || typeof text !== "string") return false;
  if (text.startsWith("/")) return false;
  if (/^\d+$/.test(text)) return false;
  if (text.trim().length < 3 || text.trim().length > 64) return false;
  return /^[a-zA-Zа-яА-ЯёЁa-zA-ZʻʼˈΔ'\-\s]+$/u.test(text.trim());
}

function isValidPhone(phone) {
  if (!phone || typeof phone !== "string") return false;
  const cleaned = phone.replace(/[\s\-()]/g, "");
  return /^(\+998|998|0|00998)\d{9}$/.test(cleaned);
}

function normalizePhone(phone) {
  if (!phone) return null;
  const cleaned = phone.replace(/[\s\-()]/g, "");
  if (cleaned.startsWith("+998")) return cleaned;
  if (cleaned.startsWith("00998")) return "+" + cleaned.slice(2);
  if (cleaned.startsWith("998")) return "+" + cleaned;
  if (cleaned.startsWith("0")) return "+998" + cleaned.slice(1);
  return "+" + cleaned;
}

function validateCarNumber(text) {
  if (!text || typeof text !== "string") {
    return { valid: false, message: "❌ Raqam kiritilmadi" };
  }

  const cleaned = text.toUpperCase().replace(/\s+/g, "");

  // Format: 01A777AA (yangi)
  const newFormat = cleaned.match(/^(\d{2})([A-Z])(\d{3})([A-Z]{2})$/);
  if (newFormat) {
    const regionCode = newFormat[1];
    if (!VALID_REGION_CODES.has(regionCode)) {
      return { valid: false, message: `❌ Noto'g'ri viloyat kodi: <b>${regionCode}</b>` };
    }
    return {
      valid: true,
      formatted: `${newFormat[1]} ${newFormat[2]} ${newFormat[3]} ${newFormat[4]}`,
    };
  }

  // Format: 01777AAA (eski)
  const oldFormat = cleaned.match(/^(\d{2})(\d{3})([A-Z]{3})$/);
  if (oldFormat) {
    const regionCode = oldFormat[1];
    if (!VALID_REGION_CODES.has(regionCode)) {
      return { valid: false, message: `❌ Noto'g'ri viloyat kodi: <b>${regionCode}</b>` };
    }
    return {
      valid: true,
      formatted: `${oldFormat[1]} ${oldFormat[2]} ${oldFormat[3]}`,
    };
  }

  // Format: A777AAA (maxsus/diplomatik)
  const specialFormat = cleaned.match(/^([A-Z])(\d{3})([A-Z]{3})$/);
  if (specialFormat) {
    return {
      valid: true,
      formatted: `${specialFormat[1]} ${specialFormat[2]} ${specialFormat[3]}`,
    };
  }

  return {
    valid: false,
    message:
      "❌ Noto'g'ri format. Quyidagi formatlardan birini ishlating:\n" +
      "• <code>01 A 777 AA</code>\n" +
      "• <code>01 777 AAA</code>",
  };
}

module.exports = { isValidName, isValidPhone, normalizePhone, validateCarNumber };
