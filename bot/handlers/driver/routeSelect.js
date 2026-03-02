// handlers/driver/routeSelect.js
const logger = require("../../utils/logger");
const { getRegionName, createInlineKeyboard } = require("../../utils/regionOptions");
const { getSession, updateSession, deleteSession } = require("../../cache/sessionCache");
const { updateDriverRoute } = require("../../services/driverService");

// Inline keyboard — driver_region_ prefixi bilan (passenger region_ dan farq qilsin)
function createDriverRegionKeyboard() {
  const { REGIONS } = require("../../utils/regionOptions");
  const buttons = REGIONS.map((r) => ({
    text: r.name,
    callback_data: `driver_region_${r.code}`,
  }));
  const keyboard = [];
  for (let i = 0; i < buttons.length; i += 2) {
    keyboard.push(buttons.slice(i, i + 2));
  }
  return { reply_markup: { inline_keyboard: keyboard } };
}

async function handleDriverRouteSelect(bot, query) {
  const chatId     = query.message.chat.id;
  const regionCode = query.data.replace("driver_region_", "");
  const session    = await getSession(chatId);

  if (!session || !["DRIVER_FROM", "DRIVER_TO"].includes(session.step)) {
    return bot.answerCallbackQuery(query.id);
  }

  await bot.answerCallbackQuery(query.id);

  if (session.step === "DRIVER_FROM") {
    await updateSession(chatId, { step: "DRIVER_TO", data: { from: regionCode } });

    return bot.sendMessage(
      chatId,
      `📍 Qayerga qarab harakatlanasiz?`,
      createDriverRegionKeyboard(),
    );
  }

  if (session.step === "DRIVER_TO") {
    const from = session.data?.from;
    const to   = regionCode;

    if (from === to) {
      return bot.sendMessage(chatId, "❌ Bir xil viloyatni tanlash mumkin emas!", createDriverRegionKeyboard());
    }

    await updateDriverRoute(chatId, from, to);
    await deleteSession(chatId);

    const fromName = getRegionName(from);
    const toName   = getRegionName(to);

    await bot.editMessageReplyMarkup(
      { inline_keyboard: [] },
      { chat_id: chatId, message_id: query.message.message_id },
    );

    await bot.sendMessage(
      chatId,
      `✅ <b>Yo'nalish tanlandi!</b>\n\n📍 ${fromName} → ${toName}\n\n🚖 Buyurtmalar kutilmoqda...`,
      {
        parse_mode: "HTML",
        reply_markup: {
          keyboard: [
            ["🚖 Buyurtma qabul qilishni to'xtatish"],
            ["📋 Buyurtmalar", "👤 Profilim"],
            ["📊 Statistika", "⭐ Reytingim"],
          ],
          resize_keyboard: true,
        },
      },
    );

    logger.success(`Driver yo'nalish tanladi: ${chatId}`, { from, to });
  }
}

module.exports = { handleDriverRouteSelect, createDriverRegionKeyboard };
