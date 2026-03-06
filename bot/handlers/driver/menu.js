// handlers/driver/menu.js
const User = require("../../models/User.model");
const Order = require("../../models/Order.model");
const logger = require("../../utils/logger");
const { getRegionName } = require("../../utils/regionOptions");
const {
  isDriverBusy,
  getDriverFreeSeats,
  MAX_SEATS,
} = require("../../services/driverService");
const { createDriverRegionKeyboard } = require("./routeSelect");
const { createSession } = require("../../cache/sessionCache");

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

function fmtDur(a, b) {
  if (!a || !b) return null;
  const m = Math.floor((new Date(b) - new Date(a)) / 60000);
  return m < 60
    ? m + " daq"
    : Math.floor(m / 60) + "h " + (m % 60 ? (m % 60) + "d" : "");
}

const STATUS = {
  pending: "⏳ Kutilmoqda",
  accepted: "✅ Qabul qilindi",
  in_progress: "🚕 Jarayonda",
  driver_confirmed: "🔄 Siz tasdiqladingiz",
  passenger_confirmed: "🔄 Yo'lovchi tasdiqladi",
  completed: "✅ Yakunlandi",
  cancelled: "❌ Bekor qilindi",
};

function card(o) {
  const icon = o.orderType === "cargo" ? "📦" : "👥";
  const info =
    o.orderType === "cargo"
      ? "Yuk: " + (o.cargoDescription || "—")
      : (o.passengers || 1) + " kishi";

  let t =
    icon +
    " <b>" +
    getRegionName(o.from) +
    " → " +
    getRegionName(o.to) +
    "</b>\n";
  t += "   " + info + " | " + (STATUS[o.status] || o.status) + "\n";
  t += "   📅 " + fmtDate(o.createdAt) + "\n";
  if (o.acceptedAt) t += "   ✅ Qabul: " + fmtDate(o.acceptedAt) + "\n";
  if (o.startedAt) t += "   🚕 Boshlandi: " + fmtDate(o.startedAt) + "\n";
  if (o.completedAt) {
    t += "   🏁 Yakunlandi: " + fmtDate(o.completedAt) + "\n";
    const d = fmtDur(o.startedAt, o.completedAt);
    if (d) t += "   ⏱ Davomiyligi: " + d + "\n";
  }
  if (o.cancelledAt) {
    t +=
      "   ❌ Bekor: " +
      fmtDate(o.cancelledAt) +
      " (" +
      (o.cancelledBy === "driver" ? "siz" : "yo'lovchi") +
      ")\n";
  }
  return t;
}

function activeButtons(o) {
  const id = o._id.toString();
  if (o.status === "accepted") {
    return [
      [
        { text: "🚕 Safar boshlash", callback_data: "start_trip_" + id },
        { text: "❌ Bekor qilish", callback_data: "cancel_trip_" + id },
      ],
    ];
  }
  if (o.status === "in_progress" || o.status === "passenger_confirmed") {
    return [
      [{ text: "✅ Safarni yakunlash", callback_data: "complete_order_" + id }],
    ];
  }
  if (o.status === "driver_confirmed") {
    return [
      [{ text: "⏳ Yo'lovchi tasdiqini kutmoqda...", callback_data: "noop" }],
    ];
  }
  return null;
}

function applyDriverMenu(bot) {
  // ── Buyurtma qabul qilishni boshlash ────────────────────────────────────
  bot.onText(/🚖 Buyurtma qabul qilishni boshlash/, async (msg) => {
    const chatId = Number(msg.chat.id);
    try {
      const user = await User.findOne({ telegramId: chatId, role: "driver" });
      if (!user) return;

      const busy = await isDriverBusy(chatId, "cargo");
      if (busy) {
        return bot.sendMessage(
          chatId,
          "⚠️ <b>Sizda yakunlanmagan safar bor!</b>\n\n📋 «Mening buyurtmalarim» bo'limida ko'ring.",
          { parse_mode: "HTML" },
        );
      }

      await createSession(chatId, "DRIVER_FROM", { role: "driver_route" });
      await bot.sendMessage(
        chatId,
        "📍 Qayerdan yo'lga chiqasiz?",
        createDriverRegionKeyboard(),
      );
    } catch (err) {
      logger.error("Boshlash error:", err);
    }
  });

  // ── To'xtatish ──────────────────────────────────────────────────────────
  bot.onText(/🚖 Buyurtma qabul qilishni to'xtatish/, async (msg) => {
    const chatId = Number(msg.chat.id);
    try {
      await User.findOneAndUpdate({ telegramId: chatId }, { isActive: false });
      bot.sendMessage(chatId, "⏸ <b>To'xtatildi.</b>", {
        parse_mode: "HTML",
        reply_markup: {
          keyboard: [
            ["🚖 Buyurtma qabul qilishni boshlash"],
            ["📋 Mening buyurtmalarim", "👤 Profilim"],
            ["📊 Statistika", "⭐ Reytingim"],
          ],
          resize_keyboard: true,
        },
      });
    } catch (err) {
      logger.error("To'xtatish error:", err);
    }
  });

  // ── Mening buyurtmalarim — BARCHA buyurtmalar ───────────────────────────
  bot.onText(/📋 Mening buyurtmalarim/, async (msg) => {
    const chatId = Number(msg.chat.id);
    try {
      const user = await User.findOne({ telegramId: chatId, role: "driver" });
      if (!user) return;

      const [active, history] = await Promise.all([
        Order.find({
          driverId: chatId,
          status: {
            $in: [
              "accepted",
              "in_progress",
              "driver_confirmed",
              "passenger_confirmed",
            ],
          },
        }).sort({ createdAt: -1 }),
        Order.find({
          driverId: chatId,
          status: { $in: ["completed", "cancelled"] },
        })
          .sort({ createdAt: -1 })
          .limit(20),
      ]);

      if (!active.length && !history.length) {
        return bot.sendMessage(chatId, "📋 Sizda hali buyurtmalar yo'q.");
      }

      // O'rin holati
      const free = await getDriverFreeSeats(chatId);
      const used = MAX_SEATS - free;
      await bot.sendMessage(
        chatId,
        "🚗 <b>Mashina o'rinlari:</b> " +
          used +
          "/" +
          MAX_SEATS +
          " band" +
          (free > 0 ? " (" + free + " bo'sh)" : " — to'la"),
        { parse_mode: "HTML" },
      );

      // Aktiv — tugmalar bilan
      for (const o of active) {
        const btns = activeButtons(o);
        await bot.sendMessage(chatId, "<pre>⚡ AKTIV</pre>\n\n" + card(o), {
          parse_mode: "HTML",
          reply_markup: btns ? { inline_keyboard: btns } : undefined,
        });
      }

      // Tarix
      if (history.length) {
        let t = "<pre>📋 TARIX (" + history.length + " ta)</pre>\n\n";
        history.forEach((o, i) => {
          t += i + 1 + ". " + card(o) + "\n";
        });
        await bot.sendMessage(chatId, t, { parse_mode: "HTML" });
      }
    } catch (err) {
      logger.error("Mening buyurtmalarim error:", err);
    }
  });

  // ── Barcha buyurtmalar (pending, guruh) ─────────────────────────────────
  bot.onText(/🌍 Barcha buyurtmalar/, async (msg) => {
    const chatId = Number(msg.chat.id);
    try {
      const user = await User.findOne({ telegramId: chatId, role: "driver" });
      if (!user) return;

      const busy = await isDriverBusy(chatId, "cargo");
      if (busy) {
        return bot.sendMessage(
          chatId,
          "⚠️ <b>Sizda yakunlanmagan safar bor!</b>",
          { parse_mode: "HTML" },
        );
      }

      const free = await getDriverFreeSeats(chatId);
      const orders = await Order.find({ status: "pending", driverId: null })
        .sort({ createdAt: -1 })
        .limit(10);

      if (!orders.length)
        return bot.sendMessage(chatId, "❌ Hozircha buyurtmalar yo'q");

      for (const o of orders) {
        const p = await User.findOne({ telegramId: o.passengerId }).lean();
        const icon = o.orderType === "cargo" ? "📦" : "👥";
        const info =
          o.orderType === "cargo"
            ? "Yuk: " + (o.cargoDescription || "—")
            : (o.passengers || 1) + " kishi";
        const needed = o.orderType === "passenger" ? o.passengers || 1 : 0;
        const canTake = o.orderType === "cargo" || free >= needed;

        const t =
          "<pre>🚖 BUYURTMA</pre>\n\n" +
          "📍 <b>" +
          getRegionName(o.from) +
          " → " +
          getRegionName(o.to) +
          "</b>\n" +
          icon +
          " <b>" +
          info +
          "</b>\n\n" +
          "👤 <b>" +
          (p?.name || "—") +
          "</b>\n" +
          "📱 <b>" +
          (p?.phone || "—") +
          "</b>\n" +
          (p?.username ? "💬 @" + p.username + "\n" : "") +
          "\n🕐 " +
          fmtDate(o.createdAt) +
          (!canTake
            ? "\n\n⚠️ Kerakli o'rin: " + needed + " ta (sizda: " + free + ")"
            : "");

        await bot.sendMessage(chatId, t, {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              canTake
                ? [
                    {
                      text: "▶️ Qabul qilish",
                      callback_data: "accept_" + o._id,
                    },
                    { text: "❌ Rad etish", callback_data: "reject_" + o._id },
                  ]
                : [{ text: "⚠️ O'rin yetarli emas", callback_data: "noop" }],
            ],
          },
        });
      }
    } catch (err) {
      logger.error("Barcha buyurtmalar error:", err);
    }
  });

  // ── Profil ───────────────────────────────────────────────────────────────
  bot.onText(/👤 Profilim/, async (msg) => {
    const chatId = Number(msg.chat.id);
    try {
      const user = await User.findOne({ telegramId: chatId, role: "driver" });
      if (!user) return;
      const free = await getDriverFreeSeats(chatId);
      bot.sendMessage(
        chatId,
        "<pre>👤 PROFIL</pre>\n\n" +
          "👤 " +
          user.name +
          "\n" +
          "📱 " +
          user.phone +
          "\n" +
          "🚙 " +
          (user.carModel || "—") +
          "\n" +
          "🔢 " +
          (user.carNumber || "—") +
          "\n" +
          "📍 " +
          (user.from ? getRegionName(user.from) : "—") +
          " → " +
          (user.to ? getRegionName(user.to) : "—") +
          "\n" +
          "🚗 O'rinlar: " +
          (MAX_SEATS - free) +
          "/" +
          MAX_SEATS +
          " band\n" +
          "⭐ " +
          (user.rating?.toFixed(1) || "5.0") +
          " | ✅ " +
          user.completedOrders +
          " ta\n" +
          "🔘 " +
          (user.isActive ? "Aktiv ✅" : "Nofaol ⏸"),
        {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "✏️ Profilni tahrirlash",
                  callback_data: "open_profile_edit",
                },
              ],
            ],
          },
        },
      );
    } catch (err) {
      logger.error("Profil error:", err);
    }
  });

  // ── Statistika — faqat raqamlar, buyurtmalar "Mening buyurtmalarim"da ───
  bot.onText(/📊 Statistika/, async (msg) => {
    const chatId = Number(msg.chat.id);
    try {
      const user = await User.findOne({ telegramId: chatId, role: "driver" });
      if (!user) return;

      const [completed, cancelled] = await Promise.all([
        Order.countDocuments({ driverId: chatId, status: "completed" }),
        Order.countDocuments({ driverId: chatId, status: "cancelled" }),
      ]);

      bot.sendMessage(
        chatId,
        "<pre>📊 STATISTIKA</pre>\n\n" +
          "✅ Yakunlangan: <b>" +
          completed +
          " ta</b>\n" +
          "❌ Bekor: <b>" +
          cancelled +
          " ta</b>\n" +
          "⭐ Reyting: <b>" +
          (user.rating?.toFixed(1) || "5.0") +
          "</b>\n" +
          "🏆 Baholar: <b>" +
          (user.ratingCount || 0) +
          " ta</b>\n" +
          "👥 Referallar: <b>" +
          user.referralCount +
          " ta</b>\n" +
          "🏅 " +
          rank(user.rating, completed) +
          "\n\n" +
          "📋 Batafsil tarix: <b>Mening buyurtmalarim</b>",
        { parse_mode: "HTML" },
      );
    } catch (err) {
      logger.error("Statistika error:", err);
    }
  });

  // ── Reyting ──────────────────────────────────────────────────────────────
  bot.onText(/⭐ Reytingim/, async (msg) => {
    const chatId = Number(msg.chat.id);
    try {
      const user = await User.findOne({ telegramId: chatId, role: "driver" });
      if (!user) return;
      const cnt = await Order.countDocuments({
        driverId: chatId,
        status: "completed",
      });
      bot.sendMessage(
        chatId,
        "<pre>⭐ REYTING</pre>\n\n" +
          "👤 " +
          user.name +
          "\n" +
          "⭐ <b>" +
          (user.rating?.toFixed(1) || "5.0") +
          " / 5.0</b>\n" +
          "🏆 <b>" +
          (user.ratingCount || 0) +
          " ta baholandi</b>\n" +
          "✅ <b>" +
          cnt +
          " ta yakunlandi</b>\n\n" +
          "🏅 " +
          rank(user.rating, cnt),
        { parse_mode: "HTML" },
      );
    } catch (err) {
      logger.error("Reyting error:", err);
    }
  });
}

function rank(r, n) {
  if (r >= 4.8 && n >= 50) return "🥇 A'LO HAYDOVCHI";
  if (r >= 4.5 && n >= 20) return "🥈 YAXSHI HAYDOVCHI";
  if (r >= 4.0) return "🥉 O'RTA HAYDOVCHI";
  return "🆕 YANGI HAYDOVCHI";
}

module.exports = { applyDriverMenu };
