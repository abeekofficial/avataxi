// handlers/admin/utils.js — Umumiy yordamchi funksiyalar

const config = require("../../config");
const Order = require("../../models/Order.model");
const { getRegionName } = require("../../utils/regionOptions");

function isAdmin(chatId) {
  return config.bot.adminIds.includes(Number(chatId));
}

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleString("uz-UZ", {
    timeZone: "Asia/Tashkent",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtMoney(n) {
  return Number(n || 0).toLocaleString("uz-UZ") + " so'm";
}

function adminMenu() {
  return {
    parse_mode: "HTML",
    reply_markup: {
      keyboard: [
        ["📊 Admin statistika", "👥 Foydalanuvchilar"],
        ["🚗 Haydovchilar", "📦 Buyurtmalar"],
        ["📢 Guruhlar", "📣 Post yuborish"],
        ["🔧 Tizim", "🔍 Qidirish"],
        ["⬅️ Bosh menyu"],
      ],
      resize_keyboard: true,
    },
  };
}

function userCardText(user, orders = 0) {
  const role = user.role === "driver" ? "🚗 Haydovchi" : "🧍 Yo'lovchi";
  const nameLink = user.username
    ? `<b><a href="https://t.me/${user.username}">${user.name}</a></b>`
    : `<b><a href="tg://user?id=${user.telegramId}">${user.name}</a></b>`;

  let t = `${role} | ${nameLink}\n`;
  t += `📱 ${user.phone}\n`;
  t += `🆔 <code>${user.telegramId}</code>`;
  if (user.username)
    t += ` | <a href="https://t.me/${user.username}">@${user.username}</a>`;
  t += "\n";

  if (user.role === "driver") {
    t += `🚙 ${user.carModel || "—"} | ${user.carNumber || "—"}\n`;
    t += `📍 ${user.from ? getRegionName(user.from) : "—"} → ${user.to ? getRegionName(user.to) : "—"}\n`;
    t += `⭐ ${user.rating?.toFixed(1) || "5.0"} | ✅ ${user.completedOrders || 0} ta\n`;
    t += `🔘 ${user.isActive ? "🟢 Aktiv" : "⚪ Nofaol"}\n`;
  }

  t += `📦 Buyurtmalar: ${orders} ta\n`;
  t += `📅 ${fmtDate(user.createdAt)}\n`;
  t += user.isBlocked ? "🚫 <b>BLOKLANGAN</b>\n" : "✅ Faol\n";
  return t;
}

function userButtons(user) {
  const id = user.telegramId;
  const btns = [
    [
      {
        text: user.isBlocked ? "✅ Blokdan chiqarish" : "🚫 Bloklash",
        callback_data: "adm_block_" + id,
      },
      { text: "📋 Buyurtmalar", callback_data: "adm_user_orders_" + id },
    ],
    [{ text: "💬 Xabar yuborish", callback_data: "adm_msg_" + id }],
  ];
  if (user.role === "driver") {
    btns.push([
      {
        text: "🔄 Aktiv buyurtmalarni yakunlash",
        callback_data: "adm_finish_" + id,
      },
    ]);
  }
  return btns;
}

async function sendUserCard(bot, chatId, user) {
  const orders = await Order.countDocuments({
    [user.role === "driver" ? "driverId" : "passengerId"]: user.telegramId,
  });
  const text = "<pre>👤 PROFIL</pre>\n\n" + userCardText(user, orders);
  const opts = {
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: userButtons(user) },
    disable_web_page_preview: true,
  };
  if (user.role === "driver" && user.driverPhoto) {
    try {
      return await bot.sendPhoto(chatId, user.driverPhoto, {
        caption: text,
        ...opts,
      });
    } catch (e) {}
  }
  return bot.sendMessage(chatId, text, opts);
}

module.exports = {
  isAdmin,
  fmtDate,
  fmtMoney,
  adminMenu,
  userCardText,
  userButtons,
  sendUserCard,
};
