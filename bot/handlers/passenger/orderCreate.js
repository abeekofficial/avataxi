// handlers/passenger/orderCreate.js
const Order  = require("../../models/Order.model");
const logger = require("../../utils/logger");
const { getRegionName, createInlineKeyboard, REGIONS } = require("../../utils/regionOptions");
const { getSession, createSession, updateSession, deleteSession } = require("../../cache/sessionCache");
const { assignOrder } = require("../../services/assignService");

// Yo'lovchi soni klaviaturasi
function pCountKeyboard(orderId) {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "1 kishi", callback_data: `pcount_1_${orderId}` },
          { text: "2 kishi", callback_data: `pcount_2_${orderId}` },
        ],
        [
          { text: "3 kishi", callback_data: `pcount_3_${orderId}` },
          { text: "4 kishi", callback_data: `pcount_4_${orderId}` },
        ],
      ],
    },
  };
}

// Passenger uchun region keyboard (passenger_ prefiksi bilan)
function passengerRegionKeyboard() {
  const buttons = REGIONS.map((r) => ({
    text: r.name,
    callback_data: `region_${r.code}`,
  }));
  const keyboard = [];
  for (let i = 0; i < buttons.length; i += 2) {
    keyboard.push(buttons.slice(i, i + 2));
  }
  return { reply_markup: { inline_keyboard: keyboard } };
}

// ─── BUYURTMA BERISH BOSHLASH ─────────────────────────────────────────────────
async function startPassengerOrder(bot, chatId, orderType = "passenger") {
  const step = orderType === "cargo" ? "CARGO_FROM_REGION" : "ORDER_FROM_REGION";
  await createSession(chatId, step, { orderType });

  const text = orderType === "cargo"
    ? "📦 Yuk qayerdan jo'natiladi?"
    : "📍 Qayerdan ketmoqchisiz?";

  return bot.sendMessage(chatId, text, passengerRegionKeyboard());
}

// ─── REGION TANLASH CALLBACK ──────────────────────────────────────────────────
async function handleRegionSelect(bot, query) {
  const chatId     = query.message.chat.id;
  const regionCode = query.data.replace("region_", "");
  const session    = await getSession(chatId);

  if (!session) return bot.answerCallbackQuery(query.id);

  await bot.answerCallbackQuery(query.id);

  // ── FROM tanlandi ─────────────────────────────────────────────────────────
  if (["ORDER_FROM_REGION", "CARGO_FROM_REGION"].includes(session.step)) {
    const nextStep = session.step === "ORDER_FROM_REGION"
      ? "ORDER_TO_REGION"
      : "CARGO_TO_REGION";

    await updateSession(chatId, { step: nextStep, data: { from: regionCode } });

    return bot.sendMessage(
      chatId,
      session.data?.orderType === "cargo"
        ? "📦 Yuk qayerga jo'natiladi?"
        : "📍 Qayerga ketmoqchisiz?",
      passengerRegionKeyboard(),
    );
  }

  // ── TO tanlandi ───────────────────────────────────────────────────────────
  if (["ORDER_TO_REGION", "CARGO_TO_REGION"].includes(session.step)) {
    const from = session.data?.from;
    const to   = regionCode;

    if (from === to) {
      return bot.sendMessage(chatId, "❌ Bir xil viloyatni tanlash mumkin emas!", passengerRegionKeyboard());
    }

    if (session.data?.orderType === "cargo") {
      await updateSession(chatId, { step: "CARGO_DESCRIPTION", data: { to } });
      return bot.sendMessage(chatId, "📝 Yuk tavsifini kiriting:\n(Masalan: 50 kg kartoshka)");
    }

    // Yo'lovchi buyurtmasi — yo'lovchi soni tanlash
    await updateSession(chatId, { step: "ORDER_PASSENGER_COUNT", data: { to } });

    const order = await Order.create({
      passengerId: chatId,
      from,
      to,
      orderType:  "passenger",
      passengers: 1,
      status:     "pending",
    });

    return bot.sendMessage(chatId, "👥 Necha kishi yo'l olmoqchisiz?", pCountKeyboard(order._id));
  }
}

// ─── YO'LOVCHI SONI ───────────────────────────────────────────────────────────
async function handlePassengerCount(bot, query) {
  const chatId  = query.message.chat.id;
  const parts   = query.data.split("_"); // pcount_2_orderId
  const count   = parseInt(parts[1]);
  const orderId = parts[2];

  const order = await Order.findByIdAndUpdate(
    orderId,
    { passengers: count },
    { new: true },
  );

  if (!order) {
    return bot.answerCallbackQuery(query.id, { text: "❌ Buyurtma topilmadi!", show_alert: true });
  }

  await deleteSession(chatId);

  const fromName = getRegionName(order.from);
  const toName   = getRegionName(order.to);

  await bot.answerCallbackQuery(query.id, { text: "✅ Buyurtma qabul qilindi!" });

  await bot.editMessageText(
    `✅ <b>Buyurtmangiz qabul qilindi!</b>\n\n` +
    `📍 ${fromName} → ${toName}\n` +
    `👥 ${count} kishi\n\n` +
    `⏳ Haydovchi izlanmoqda...`,
    {
      chat_id:    chatId,
      message_id: query.message.message_id,
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [[
          { text: "❌ Bekor qilish", callback_data: `cancel_order_${order._id}` },
        ]],
      },
    },
  );

  logger.info(`Yangi passenger buyurtma: ${order._id}`, { from: order.from, to: order.to });

  // Driver topish
  setImmediate(() => assignOrder(bot, order._id.toString()));
}

// ─── YUK TAVSIFI (text xabar) ────────────────────────────────────────────────
async function handleCargoDescription(bot, msg, session) {
  const chatId = msg.chat.id;
  const text   = msg.text;

  if (!text || text.trim().length < 3) {
    return bot.sendMessage(chatId, "❌ Yuk tavsifini to'liqroq kiriting (kamida 3 ta belgi)!");
  }

  await updateSession(chatId, { step: "CARGO_PHOTO", data: { cargoDescription: text.trim() } });

  return bot.sendMessage(
    chatId,
    "📸 Yuk rasmi yuboring (ixtiyoriy):",
    {
      reply_markup: {
        keyboard: [["📷 Rasm yo'q, davom etish"]],
        resize_keyboard: true,
      },
    },
  );
}

// ─── YUK RASM ─────────────────────────────────────────────────────────────────
async function handleCargoPhoto(bot, msg, session) {
  const chatId       = msg.chat.id;
  const data         = session.data || {};
  const cargoPhotoId = msg.photo ? msg.photo[msg.photo.length - 1].file_id : null;

  const order = await Order.create({
    passengerId:      chatId,
    from:             data.from,
    to:               data.to,
    orderType:        "cargo",
    cargoDescription: data.cargoDescription,
    cargoPhotoId,
    status: "pending",
  });

  await deleteSession(chatId);

  const fromName = getRegionName(order.from);
  const toName   = getRegionName(order.to);

  await bot.sendMessage(
    chatId,
    `✅ <b>Yuk buyurtmangiz qabul qilindi!</b>\n\n` +
    `📍 ${fromName} → ${toName}\n` +
    `📦 ${order.cargoDescription}\n\n` +
    `⏳ Haydovchi izlanmoqda...`,
    {
      parse_mode: "HTML",
      reply_markup: {
        keyboard: [
          ["🚖 Buyurtma berish", "📦 Yuk/Pochta"],
          ["👤 Profilim",        "📋 Tarixim"],
        ],
        resize_keyboard: true,
      },
    },
  );

  await bot.sendMessage(chatId, "❌ Bekor qilish uchun:", {
    reply_markup: {
      inline_keyboard: [[
        { text: "❌ Bekor qilish", callback_data: `cancel_order_${order._id}` },
      ]],
    },
  });

  logger.info(`Yangi cargo buyurtma: ${order._id}`, { from: order.from, to: order.to });
  setImmediate(() => assignOrder(bot, order._id.toString()));
}

module.exports = {
  startPassengerOrder,
  handleRegionSelect,
  handlePassengerCount,
  handleCargoDescription,
  handleCargoPhoto,
};
