// handlers/admin/index.js — Admin panel entry point

const { applyAdminStats } = require("./stats");
const { applyAdminUsers } = require("./users");
const { applyAdminOrders } = require("./orders");
const { applyAdminGroups } = require("./groups");
const { applyAdminBroadcast } = require("./broadcast");
const { isAdmin, adminMenu } = require("./utils");

function applyAdmin(bot) {
  applyAdminStats(bot); // /admin, ⬅️ Bosh menyu, 📊 statistika, 🔧 tizim
  applyAdminUsers(bot); // 👥 foydalanuvchilar, 🚗 haydovchilar, 🔍 qidirish
  applyAdminOrders(bot); // 📦 buyurtmalar
  applyAdminGroups(bot); // 📢 guruhlar
  applyAdminBroadcast(bot); // 📣 post yuborish
}

module.exports = { applyAdmin, isAdmin, adminMenu };
