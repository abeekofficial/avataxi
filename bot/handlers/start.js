// handlers/start.js
const User   = require("../models/User.model");
const config = require("../config");
const Order = require("../models/Order.model");
const logger = require("../utils/logger");
const { deleteSession } = require("../cache/sessionCache");
const {
  isDriverBusy,
  getDriverFreeSeats,
  updateDriverSeats,
  MAX_SEATS,
} = require("../services/driverService");
const { notifyPassengerDriverFound } = require("../services/notifyService");
const { getRegionName } = require("../utils/regionOptions");

function applyStart(bot) {
  bot.onText(/\/start(.*)/, async (msg, match) => {
    const chatId = Number(msg.chat.id);
    const param = (match[1] || "").trim();

    try {
      await deleteSession(chatId);

      // ── ADMIN ─────────────────────────────────────────────────────────────
      if (config.bot.adminIds.includes(chatId)) {
        return bot.sendMessage(chatId, "👑 <b>ADMIN PANEL</b>\n\nXush kelibsiz!", {
          parse_mode: "HTML",
          reply_markup: {
            keyboard: [
              ["📊 Admin statistika",  "👥 Foydalanuvchilar"],
              ["🚗 Haydovchilar",      "📦 Buyurtmalar"],
              ["📢 Guruhlar",          "📣 Post yuborish"],
              ["🔧 Tizim",             "🔍 Qidirish"],
            ],
            resize_keyboard: true,
          },
        });
      }

      // ── GURUHDAN BUYURTMA QABUL QILISH: /start order_<orderId> ───────────
      if (param.startsWith("order_")) {
        const orderId = param.replace("order_", "");
        return handleGroupOrderAccept(bot, chatId, orderId, msg);
      }

      // ── REFERRAL ──────────────────────────────────────────────────────────
      let referredBy = null;
      if (param && param.startsWith("REF")) {
        const referrer = await User.findOne({ referralCode: param });
        if (referrer && referrer.telegramId !== chatId) {
          referredBy = param;
          await User.findOneAndUpdate(
            { referralCode: param },
            { $inc: { referralCount: 1 } },
          );
          logger.info("Referal: " + chatId + " → " + param);
        }
      }

      // ── RO'YXATDAN O'TGANMI? ─────────────────────────────────────────────
      const user = await User.findOne({ telegramId: chatId });

      if (user && user.role) {
        return sendMainMenu(bot, chatId, user);
      }

      // Yangi foydalanuvchi
      if (referredBy) {
        await User.findOneAndUpdate(
          { telegramId: chatId },
          { $setOnInsert: { referredBy } },
          { upsert: true },
        );
      }

      await bot.sendMessage(
        chatId,
        "👋 <b>Xush kelibsiz!</b>\n\nQuyidagilardan birini tanlang:",
        {
          parse_mode: "HTML",
          reply_markup: {
            keyboard: [["🚕 Haydovchi", "🧍 Yo'lovchi"]],
            resize_keyboard: true,
          },
        },
      );
    } catch (err) {
      logger.error("Start error:", err);
      bot.sendMessage(chatId, "❌ Xatolik yuz berdi, qaytadan /start bosing");
    }
  });
}

// ─── GURUHDAN BUYURTMA QABUL QILISH ──────────────────────────────────────────
async function handleGroupOrderAccept(bot, chatId, orderId, msg) {
  try {
    // Ro'yxatdan o'tganmi?
    const driver = await User.findOne({ telegramId: chatId });

    if (!driver || driver.role !== "driver") {
      return bot.sendMessage(
        chatId,
        "⚠️ <b>Buyurtma qabul qilish uchun haydovchi sifatida ro'yxatdan o'ting!</b>\n\n/start",
        { parse_mode: "HTML" },
      );
    }

    if (driver.isBlocked) {
      return bot.sendMessage(chatId, "🚫 Sizning akkauntingiz bloklangan.");
    }

    const order = await Order.findById(orderId);

    if (!order) {
      return bot.sendMessage(chatId, "❌ Buyurtma topilmadi yoki eskirgan.");
    }
    if (order.status !== "pending") {
      return bot.sendMessage(
        chatId,
        "❌ Bu buyurtma allaqachon qabul qilingan.",
      );
    }

    const neededSeats =
      order.orderType === "passenger" ? order.passengers || 1 : 0;

    // Band tekshiruvi
    if (order.orderType === "passenger") {
      // in_progress safar bor?
      const busy = await isDriverBusy(chatId, "cargo"); // strict check
      if (busy) {
        const activeOrders = await Order.find({
          driverId: chatId,
          status: {
            $in: [
              "accepted",
              "in_progress",
              "driver_confirmed",
              "passenger_confirmed",
            ],
          },
        })
          .select("_id status passengers")
          .lean();

        let activeText = "⚠️ <b>Sizda tugallanmagan buyurtmalar bor:</b>\n\n";
        activeOrders.forEach((o, i) => {
          const statusMap = {
            accepted: "Qabul qilingan",
            in_progress: "Jarayonda",
            driver_confirmed: "Tasdiqlash kutilmoqda",
            passenger_confirmed: "Yakunlash kutilmoqda",
          };
          activeText +=
            i +
            1 +
            ". " +
            (statusMap[o.status] || o.status) +
            " — " +
            (o.passengers || 1) +
            " kishi\n";
          activeText += "   /done_" + o._id + " — yakunlash\n\n";
        });
        activeText += "Avval ularni yakunlang yoki bekor qiling!";
        return bot.sendMessage(chatId, activeText, { parse_mode: "HTML" });
      }

      // O'rinlar yetarlimi?
      const freeSeats = await getDriverFreeSeats(chatId);
      if (freeSeats < neededSeats) {
        return bot.sendMessage(
          chatId,
          "⚠️ <b>Mashinangizda " +
            neededSeats +
            " ta bo'sh o'rin yo'q!</b>\n\n" +
            "Hozir bo'sh o'rinlar: <b>" +
            freeSeats +
            " ta</b>\n\n" +
            "Avval mavjud buyurtmalarni yakunlang.",
          { parse_mode: "HTML" },
        );
      }
    } else {
      // Cargo: oddiy band tekshiruvi
      const busy = await isDriverBusy(chatId, "cargo");
      if (busy) {
        return bot.sendMessage(
          chatId,
          "⚠️ <b>Sizda tugallanmagan buyurtma bor!</b>\n\nAvval uni yakunlang.",
          { parse_mode: "HTML" },
        );
      }
    }

    // Atomic update
    const updated = await Order.findOneAndUpdate(
      { _id: orderId, driverId: null, status: "pending" },
      { driverId: chatId, status: "accepted", acceptedAt: new Date() },
      { new: true },
    );

    if (!updated) {
      return bot.sendMessage(
        chatId,
        "❌ Bu buyurtma allaqachon boshqa haydovchi tomonidan qabul qilindi.",
      );
    }

    // O'rinlarni band qilish
    if (order.orderType === "passenger") {
      await updateDriverSeats(chatId, neededSeats);
    }

    const passenger = await User.findOne({
      telegramId: updated.passengerId,
    }).lean();
    const fromName = getRegionName(updated.from);
    const toName = getRegionName(updated.to);
    const typeEmoji = updated.orderType === "cargo" ? "📦" : "👥";
    const typeText =
      updated.orderType === "cargo"
        ? "Yuk: <b>" + updated.cargoDescription + "</b>"
        : "Yo'lovchilar: <b>" + (updated.passengers || 1) + " kishi</b>";

    let passengerInfo = "";
    if (passenger) {
      passengerInfo =
        "\n\n👤 Buyurtmachi: <b>" +
        passenger.name +
        "</b>\n" +
        "📱 Telefon: <b>" +
        passenger.phone +
        "</b>\n" +
        (passenger.username
          ? "💬 Telegram: @" + passenger.username + "\n"
          : "");
    }

    let seatsAfterMsg = "";
    if (order.orderType === "passenger") {
      const freeAfter = await getDriverFreeSeats(chatId);
      seatsAfterMsg =
        freeAfter > 0
          ? "\n🚗 Qolgan bo'sh o'rinlar: <b>" + freeAfter + " ta</b>"
          : "\n🚗 Mashina <b>to'ldi</b>";
    }

    // Driverga: passenger ma'lumotlari + tugmalar
    await bot.sendMessage(
      chatId,
      "✅ <b>Buyurtma qabul qilindi!</b>\n\n" +
        "📍 " +
        fromName +
        " → " +
        toName +
        "\n" +
        typeEmoji +
        " " +
        typeText +
        passengerInfo +
        seatsAfterMsg +
        "\n\n💡 Yo'lovchini olgach tugmani bosing:",
      {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "🚕 Safar boshlash",
                callback_data: "start_trip_" + orderId,
              },
              {
                text: "❌ Buyurtmani bekor qilish",
                callback_data: "cancel_trip_" + orderId,
              },
            ],
          ],
        },
      },
    );

    // Passengerga xabar
    if (passenger) {
      await notifyPassengerDriverFound(bot, passenger, driver, updated);
    }

    logger.success("Guruhdan driver qabul qildi: " + orderId, {
      driverId: chatId,
    });
  } catch (err) {
    logger.error("handleGroupOrderAccept error:", err);
    bot.sendMessage(chatId, "❌ Xatolik yuz berdi");
  }
}

async function sendMainMenu(bot, chatId, user) {
  try {
    const botInfo = await bot.getMe();
    const referralLink =
      "https://t.me/" +
      botInfo.username +
      "?start=" +
      (user.referralCode || "");

    if (user.role === "driver") {
      return bot.sendMessage(
        chatId,
        "👋 Xush kelibsiz, <b>" +
          user.name +
          "</b>!\n\n" +
          "⭐ Rating: <b>" +
          (user.rating?.toFixed(1) || "5.0") +
          "</b>\n" +
          "✅ Bajarilgan: <b>" +
          (user.completedOrders || 0) +
          " ta</b>\n" +
          "👥 Referallar: <b>" +
          (user.referralCount || 0) +
          " ta</b>\n\n" +
          "🔗 Referal havola:\n" +
          referralLink,
        {
          parse_mode: "HTML",
          reply_markup: {
            keyboard: [
              ["🚖 Buyurtma qabul qilish", "👤 Profilim"],
              ["📋 Mening buyurtmalarim", "📊 Statistika"],
              ["⭐ Reytingim", "📋 Bot haqida"],
            ],
            resize_keyboard: true,
          },
        },
      );
    }

    if (user.role === "passenger") {
      return bot.sendMessage(
        chatId,
        "👋 Xush kelibsiz, <b>" +
          user.name +
          "</b>!\n\n" +
          "👥 Referallar: <b>" +
          (user.referralCount || 0) +
          " ta</b>\n\n" +
          "🔗 Referal havola:\n" +
          referralLink,
        {
          parse_mode: "HTML",
          reply_markup: {
            keyboard: [
              ["🚖 Buyurtma berish", "📦 Yuk/Pochta"],
              ["👤 Profilim", "📋 Tarixim"],
              ["📋 Bot haqida"],
            ],
            resize_keyboard: true,
          },
        },
      );
    }
  } catch (err) {
    logger.error("sendMainMenu error:", err);
  }
}

module.exports = { applyStart, sendMainMenu };
