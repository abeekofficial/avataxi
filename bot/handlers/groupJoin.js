// handlers/groupJoin.js
// Bot guruhga qo'shilganda: info xabar + pin + adminlarga bildirishnoma

const Group = require("../models/Group.model");
const config = require("../config");
const logger = require("../utils/logger");

function applyGroupJoin(bot) {
  bot.on("message", async (msg) => {
    if (!msg.new_chat_members) return;

    const botInfo = await bot.getMe();
    const addedBot = msg.new_chat_members.some((m) => m.id === botInfo.id);
    if (!addedBot) return;

    const groupId = msg.chat.id;
    const title = msg.chat.title || "Guruh";

    // Guruhni DB ga saqlash
    await Group.findOneAndUpdate(
      { groupId },
      { groupId, title, isActive: true, addedBy: msg.from?.id },
      { upsert: true, new: true },
    );

    logger.success("Bot guruhga qo'shildi: " + title + " (" + groupId + ")");

    // ── Guruhga info xabar + botga kirish tugmasi ────────────────────────
    // Chapda: bot ma'lumoti | O'ngda: inline button (botga kirish)
    // Pin qilinadi, ammo button pin bosmasdan ham ishlaydi (URL button)
    try {
      const infoText =
        "🚖 <b>TAXI & YUK TASHISH BOTI</b>\n\n" +
        "Ushbu guruh orqali buyurtmalar haydovchilarga tarqatiladi.\n\n" +
        "📌 <b>Haydovchilar uchun:</b>\n" +
        'Buyurtma kelganda "✅ Qabul qilaman" tugmasini bosing\n' +
        "Bot sizga to'g'ridan-to'g'ri yozadi\n\n" +
        "👇 <b>Botga kirish va ro'yxatdan o'tish:</b>";

      const sentMsg = await bot.sendMessage(groupId, infoText, {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "🚖 Buyurtma berish",
                url: "https://t.me/" + botInfo.username + "?start=group",
              },
            ],
          ],
        },
      });

      // Pin qilish (bot admin bo'lsa ishlaydi)
      try {
        await bot.pinChatMessage(groupId, sentMsg.message_id, {
          disable_notification: true,
        });
        logger.info("Xabar pin qilindi: " + groupId);
      } catch (pinErr) {
        logger.warn(
          "Pin qilish muvaffaqiyatsiz (admin huquqi yo'q): " + pinErr.message,
        );
      }
    } catch (err) {
      logger.error("Guruh info xabari xatosi: " + err.message);
    }

    // ── Adminlarga bildirishnoma ──────────────────────────────────────────
    for (const adminId of config.bot.adminIds) {
      try {
        await bot.sendMessage(
          adminId,
          "✅ <b>Bot yangi guruhga qo'shildi!</b>\n\n" +
            "📢 Guruh: <b>" +
            title +
            "</b>\n" +
            "🆔 ID: <code>" +
            groupId +
            "</code>\n" +
            "👤 Kim qo'shdi: " +
            (msg.from?.username
              ? "@" + msg.from.username
              : msg.from?.first_name || "—"),
          { parse_mode: "HTML" },
        );
      } catch (e) {
        /* ignore */
      }
    }
  });

  // ── Bot guruhdan chiqarilganda deaktivlashtirish ──────────────────────────
  bot.on("message", async (msg) => {
    if (!msg.left_chat_member) return;
    const botInfo = await bot.getMe();
    if (msg.left_chat_member.id !== botInfo.id) return;

    await Group.findOneAndUpdate({ groupId: msg.chat.id }, { isActive: false });
    logger.info("Bot guruhdan chiqdi: " + msg.chat.title);
  });
}

module.exports = { applyGroupJoin };
