// handlers/admin/groups.js — Guruhlar boshqaruvi

const Group = require("../../models/Group.model");
const logger = require("../../utils/logger");
const { isAdmin, fmtDate } = require("./utils");

const TYPE_LABEL = {
  all: "👥+📦 Hammasi",
  passenger: "👥 Yo'lovchi",
  cargo: "📦 Yuk",
};

function applyAdminGroups(bot) {
  // ─── 📢 Guruhlar (menyu tugmasi) ─────────────────────────────────────────
  bot.onText(/📢 Guruhlar/, async (msg) => {
    const chatId = msg.chat.id;
    if (!isAdmin(chatId)) return;
    try {
      const groups = await Group.find()
        .sort({ totalOrders: -1 })
        .limit(20)
        .lean();
      if (!groups.length) return bot.sendMessage(chatId, "❌ Guruhlar yo'q.");

      let text = `<pre>📢 GURUHLAR (${groups.length} ta)</pre>\n\n`;
      const btns = [];

      groups.forEach((g, i) => {
        const t = g.orderTypes?.length ? g.orderTypes[0] : "all";
        const tLabel = TYPE_LABEL[t] || "👥+📦";
        text += `${i + 1}. <b>${g.title}</b>\n   ${g.isActive ? "✅" : "❌"} ${tLabel} | 📦 ${g.totalOrders} ta\n   <code>${g.groupId}</code>\n`;
        btns.push([
          {
            text: `${i + 1}. ${g.title.slice(0, 20)}`,
            callback_data: "adm_group_info_" + g.groupId,
          },
          {
            text: g.isActive ? "✅ Faol" : "❌ Off",
            callback_data: "adm_group_toggle_" + g.groupId,
          },
          { text: "🔧 Tur", callback_data: "adm_group_type_" + g.groupId },
        ]);
      });

      btns.push([
        { text: "✅ Hammasini yoqish", callback_data: "adm_groups_activate" },
        {
          text: "❌ Hammasini o'chirish",
          callback_data: "adm_groups_deactivate",
        },
      ]);

      bot.sendMessage(chatId, text, {
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: btns },
      });
    } catch (err) {
      logger.error("Admin groups error:", err);
    }
  });

  // ─── CALLBACKS ────────────────────────────────────────────────────────────
  bot.on("callback_query", async (query) => {
    if (!isAdmin(query.from.id)) return;
    const chatId = query.from.id;
    const data = query.data;

    // Guruh batafsil ma'lumot
    if (data.startsWith("adm_group_info_")) {
      await bot.answerCallbackQuery(query.id);
      const groupId = Number(data.replace("adm_group_info_", ""));
      const group = await Group.findOne({ groupId });
      if (!group) return bot.sendMessage(chatId, "❌ Guruh topilmadi.");

      const t = group.orderTypes?.length ? group.orderTypes[0] : "all";
      const tLabel = TYPE_LABEL[t] || "👥+📦 Hammasi";

      let inviteLink = null;
      try {
        inviteLink = await bot.exportChatInviteLink(groupId);
      } catch (e) {}

      const text =
        `<pre>📢 GURUH</pre>\n\n` +
        `📌 <b>${group.title}</b>\n` +
        `🆔 <code>${group.groupId}</code>\n` +
        `🔘 ${group.isActive ? "✅ Faol" : "❌ Nofaol"}\n` +
        `📦 Tur: <b>${tLabel}</b>\n` +
        `📊 Buyurtmalar: <b>${group.totalOrders} ta</b>\n` +
        `👤 Qo'shgan: <code>${group.addedBy || "—"}</code>\n` +
        `📅 ${fmtDate(group.createdAt)}\n` +
        `🕐 Faollik: ${fmtDate(group.lastActivity)}`;

      const btns = [
        [
          {
            text: group.isActive ? "❌ O'chirish" : "✅ Faollashtirish",
            callback_data: "adm_group_toggle_" + groupId,
          },
          {
            text: "🔧 Tur o'zgartirish",
            callback_data: "adm_group_type_" + groupId,
          },
        ],
      ];
      if (inviteLink)
        btns.push([{ text: "🔗 Guruhga kirish", url: inviteLink }]);

      return bot.sendMessage(chatId, text, {
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: btns },
      });
    }

    // Guruhni on/off
    if (data.startsWith("adm_group_toggle_")) {
      const groupId = Number(data.replace("adm_group_toggle_", ""));
      const group = await Group.findOne({ groupId });
      if (!group)
        return bot.answerCallbackQuery(query.id, { text: "Topilmadi" });
      group.isActive = !group.isActive;
      await group.save();
      await bot.answerCallbackQuery(query.id, {
        text: group.isActive ? "✅ Faollashtirildi" : "❌ O'chirildi",
        show_alert: true,
      });
      try {
        await bot.editMessageReplyMarkup(
          { inline_keyboard: [] },
          { chat_id: chatId, message_id: query.message.message_id },
        );
      } catch (e) {}
      logger.info(`Admin guruh toggle: ${groupId} → ${group.isActive}`);
      return;
    }

    // Guruh tur tanlash
    if (data.startsWith("adm_group_type_")) {
      const groupId = Number(data.replace("adm_group_type_", ""));
      const group = await Group.findOne({ groupId });
      if (!group)
        return bot.answerCallbackQuery(query.id, { text: "Topilmadi" });
      await bot.answerCallbackQuery(query.id);
      const cur = group.orderTypes?.join("+") || "all";
      return bot.sendMessage(
        chatId,
        `📢 <b>${group.title}</b>\nHozirgi: <b>${cur}</b>\n\nQaysi buyurtmalar kelsin?`,
        {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "👥+📦 Hammasi",
                  callback_data: "adm_gtype_all_" + groupId,
                },
              ],
              [
                {
                  text: "👥 Faqat yo'lovchi",
                  callback_data: "adm_gtype_passenger_" + groupId,
                },
              ],
              [
                {
                  text: "📦 Faqat yuk/cargo",
                  callback_data: "adm_gtype_cargo_" + groupId,
                },
              ],
            ],
          },
        },
      );
    }

    // Guruh turini saqlash
    if (data.startsWith("adm_gtype_")) {
      const parts = data.replace("adm_gtype_", "").split("_");
      const groupId = Number(parts[parts.length - 1]);
      const type = parts.slice(0, -1).join("_");
      const types =
        type === "all"
          ? ["all"]
          : type === "passenger"
            ? ["passenger"]
            : ["cargo"];
      await Group.findOneAndUpdate({ groupId }, { orderTypes: types });
      const label = TYPE_LABEL[type] || "Hammasi";
      await bot.answerCallbackQuery(query.id, {
        text: "✅ " + label,
        show_alert: true,
      });
      try {
        await bot.editMessageReplyMarkup(
          { inline_keyboard: [] },
          { chat_id: chatId, message_id: query.message.message_id },
        );
      } catch (e) {}
      logger.info(`Admin guruh turi: ${groupId} → ${type}`);
      return;
    }

    // Hammasini faollashtirish / o'chirish
    if (data === "adm_groups_activate") {
      await Group.updateMany({}, { isActive: true });
      return bot.answerCallbackQuery(query.id, {
        text: "✅ Barcha guruhlar faollashtirildi",
        show_alert: true,
      });
    }

    if (data === "adm_groups_deactivate") {
      await Group.updateMany({}, { isActive: false });
      return bot.answerCallbackQuery(query.id, {
        text: "❌ Barcha guruhlar o'chirildi",
        show_alert: true,
      });
    }
  });
}

module.exports = { applyAdminGroups };
