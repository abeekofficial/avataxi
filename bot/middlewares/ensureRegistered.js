module.exports = async function ensureRegistered(bot, msg) {
  const chatId = msg.chat.id;

  // ✅ Session tekshiruvi (await bilan!)
  const session = await Session.findOne({ telegramId: chatId });

  if (session && SKIP_STEPS.has(session.step)) {
    return { ok: true };
  }

  // ✅ User tekshiruvi
  const user = await User.findOne({ telegramId: chatId }).lean();

  if (!user || !user.role) {
    await bot.sendMessage(
      chatId,
      "<b>⚠️ Ma'lumotlaringiz topilmadi.\nIltimos qayta ro'yxatdan o'ting ❗</b>",
      {
        parse_mode: "HTML",
        reply_markup: {
          keyboard: [["🧍 Yo'lovchi", "🚕 Haydovchi"]],
          resize_keyboard: true,
        },
      },
    );

    return { ok: false };
  }

  return { ok: true, user };
};
