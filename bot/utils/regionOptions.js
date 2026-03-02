// utils/regionOptions.js

const REGIONS = [
  { code: "tashkent_city",  name: "Toshkent shahri" },
  { code: "tashkent",       name: "Toshkent viloyati" },
  { code: "samarkand",      name: "Samarqand" },
  { code: "bukhara",        name: "Buxoro" },
  { code: "namangan",       name: "Namangan" },
  { code: "andijan",        name: "Andijon" },
  { code: "fergana",        name: "Farg'ona" },
  { code: "kashkadarya",    name: "Qashqadaryo" },
  { code: "surkhandarya",   name: "Surxondaryo" },
  { code: "jizzakh",        name: "Jizzax" },
  { code: "syrdarya",       name: "Sirdaryo" },
  { code: "navoi",          name: "Navoiy" },
  { code: "khorezm",        name: "Xorazm" },
  { code: "karakalpakstan", name: "Qoraqalpog'iston" },
];

const REGION_MAP = new Map(REGIONS.map((r) => [r.code, r.name]));

function getRegionName(code) {
  return REGION_MAP.get(code) || code;
}

function createInlineKeyboard() {
  const buttons = REGIONS.map((r) => ({
    text: r.name,
    callback_data: `region_${r.code}`,
  }));

  // 2 ustunli keyboard
  const keyboard = [];
  for (let i = 0; i < buttons.length; i += 2) {
    keyboard.push(buttons.slice(i, i + 2));
  }

  return {
    reply_markup: { inline_keyboard: keyboard },
  };
}

module.exports = { REGIONS, getRegionName, createInlineKeyboard };
