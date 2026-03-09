// handlers/admin/broadcast.js — Post yuborish (broadcast)

const User = require("../../models/User.model");
const Group = require("../../models/Group.model");
const logger = require("../../utils/logger");
const { isAdmin } = require("./utils");
const {
  getSession,
  createSession,
  deleteSession,
} = require("../../cache/sessionCache");

// ─── Rate limit xavfsiz yuborish ─────────────────────────────────────────────
async function safeSend(bot, chatId, text, extra = {}) {
  try {
    await bot.sendMessage(chatId, text, extra);
    return true;
  } catch (e) {
    if (
      e.message?.includes("bot was blocked") ||
      e.message?.includes("user is deactivated") ||
      e.message?.includes("chat not found")
    )
      return false;
    if (
      e.message?.includes("429") ||
      e.message?.includes("Too Many Requests")
    ) {
      const wait = (e.parameters?.retry_after || 3) * 1000 + 500;
      await new Promise((r) => setTimeout(r, wait));
      try {
        await bot.sendMessage(chatId, text, extra);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }
}

// ─── Broadcast asosiy funksiya ────────────────────────────────────────────────
async function doBroadcast(
  bot,
  adminId,
  text,
  filter = {},
  mediaType = null,
  fileId = null,
) {
  const users = await User.find({ isBlocked: false, ...filter }).lean();
  if (!users.length)
    return bot.sendMessage(adminId, "❌ Foydalanuvchilar topilmadi.");

  const statusMsg = await bot.sendMessage(
    adminId,
    `📤 Yuborilmoqda...\n👥 Jami: <b>${users.length} ta</b>`,
    { parse_mode: "HTML" },
  );

  let ok = 0,
    fail = 0;
  for (let i = 0; i < users.length; i++) {
    const u = users[i];
    let sent = false;
    try {
      if (mediaType === "photo" && fileId) {
        await bot.sendPhoto(u.telegramId, fileId, {
          caption: text,
          parse_mode: "HTML",
        });
        sent = true;
      } else if (mediaType === "video" && fileId) {
        await bot.sendVideo(u.telegramId, fileId, {
          caption: text,
          parse_mode: "HTML",
        });
        sent = true;
      } else {
        sent = await safeSend(bot, u.telegramId, text, { parse_mode: "HTML" });
      }
    } catch {
      sent = false;
    }
    if (sent) ok++;
    else fail++;

    if ((i + 1) % 25 === 0 || i === users.length - 1) {
      const pct = Math.round(((i + 1) / users.length) * 100);
      await bot
        .editMessageText(
          `📤 Yuborilmoqda...\n👥 Jami: <b>${users.length} ta</b>\n✅ ${ok} | ❌ ${fail} | 📊 ${pct}%`,
          {
            chat_id: adminId,
            message_id: statusMsg.message_id,
            parse_mode: "HTML",
          },
        )
        .catch(() => {});
      if ((i + 1) % 25 === 0 && i !== users.length - 1)
        await new Promise((r) => setTimeout(r, 1000));
    }
  }

  await bot
    .editMessageText(
      `✅ <b>Broadcast yakunlandi!</b>\n\n👥 Jami: <b>${users.length}</b>\n✅ Yuborildi: <b>${ok}</b>\n❌ Bormadi: <b>${fail}</b>`,
      {
        chat_id: adminId,
        message_id: statusMsg.message_id,
        parse_mode: "HTML",
      },
    )
    .catch(() => {});

  logger.info(`Broadcast yakunlandi: ${ok}/${users.length}`);
}

function applyAdminBroadcast(bot) {
  // ─── 📣 Post yuborish (menyu tugmasi) ────────────────────────────────────
  bot.onText(/📣 Post yuborish/, async (msg) => {
    const chatId = msg.chat.id;
    if (!isAdmin(chatId)) return;
    await createSession(chatId, "BC_TARGET", {});
    bot.sendMessage(chatId, "<b>📣 POST YUBORISH</b>\n\nKimga yuboramiz?", {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            { text: "👥 Hammaga", callback_data: "bc_all" },
            { text: "🚗 Haydovchilar", callback_data: "bc_drivers" },
          ],
          [
            { text: "🧍 Yo'lovchilar", callback_data: "bc_passengers" },
            { text: "📢 Guruhlar", callback_data: "bc_groups" },
          ],
          [{ text: "❌ Bekor", callback_data: "bc_cancel" }],
        ],
      },
    });
  });

  // ─── CALLBACKS ────────────────────────────────────────────────────────────
  bot.on("callback_query", async (query) => {
    if (!isAdmin(query.from.id)) return;
    const chatId = query.from.id;
    const data = query.data;

    const BC_TARGETS = {
      bc_all: { label: "Hammaga", filter: {} },
      bc_drivers: { label: "Haydovchilar", filter: { role: "driver" } },
      bc_passengers: { label: "Yo'lovchilar", filter: { role: "passenger" } },
      bc_groups: { label: "Guruhlar", filter: null },
    };

    if (data === "bc_cancel") {
      await deleteSession(chatId);
      await bot.answerCallbackQuery(query.id);
      return bot.sendMessage(chatId, "❌ Bekor qilindi.");
    }

    if (BC_TARGETS[data]) {
      const target = BC_TARGETS[data];
      await bot.answerCallbackQuery(query.id);
      await createSession(chatId, "BC_TEXT", {
        target: data,
        filter: target.filter,
        label: target.label,
      });
      return bot.sendMessage(
        chatId,
        `📝 <b>${target.label}</b> uchun matn / rasm / video yuboring:`,
        { parse_mode: "HTML" },
      );
    }

    if (data === "bc_confirm") {
      const session = await getSession(chatId);
      if (!session || session.step !== "BC_CONFIRM") return;
      await bot.answerCallbackQuery(query.id);
      await deleteSession(chatId);
      const { target, filter, text, mediaType, fileId } = session.data;

      if (target === "bc_groups") {
        const groups = await Group.find({ isActive: true }).lean();
        let ok = 0,
          fail = 0;
        for (const g of groups) {
          try {
            await bot.sendMessage(g.groupId, "📢 <b>E'LON</b>\n\n" + text, {
              parse_mode: "HTML",
            });
            ok++;
            await new Promise((r) => setTimeout(r, 200));
          } catch {
            fail++;
          }
        }
        return bot.sendMessage(
          chatId,
          `✅ <b>${ok}</b> guruhga yuborildi | ❌ <b>${fail}</b> xato`,
          { parse_mode: "HTML" },
        );
      }

      return doBroadcast(bot, chatId, text, filter, mediaType, fileId);
    }
  });

  // ─── SESSION — matn/media qabul qilish ───────────────────────────────────
  bot.on("message", async (msg) => {
    if (msg.chat.type !== "private") return;
    const chatId = msg.chat.id;
    if (!isAdmin(chatId)) return;
    const session = await getSession(chatId);
    if (!session || session.step !== "BC_TEXT") return;

    const { target, filter, label } = session.data;
    let text = null,
      mediaType = null,
      fileId = null;

    if (msg.text) {
      text = msg.text;
    } else if (msg.photo) {
      fileId = msg.photo[msg.photo.length - 1].file_id;
      mediaType = "photo";
      text = msg.caption || "";
    } else if (msg.video) {
      fileId = msg.video.file_id;
      mediaType = "video";
      text = msg.caption || "";
    } else {
      return bot.sendMessage(
        chatId,
        "❌ Faqat matn, rasm yoki video yuboring.",
      );
    }

    await deleteSession(chatId);
    await createSession(chatId, "BC_CONFIRM", {
      target,
      filter,
      label,
      text,
      mediaType,
      fileId,
    });

    const preview = text
      ? text.substring(0, 100) + (text.length > 100 ? "..." : "")
      : "(media)";
    return bot.sendMessage(
      chatId,
      `📋 <b>Tasdiqlang:</b>\n\n👥 Kimga: <b>${label}</b>\n📝 ${preview}\n\nYuborilsinmi?`,
      {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [
              { text: "✅ Ha, yuborish", callback_data: "bc_confirm" },
              { text: "❌ Bekor", callback_data: "bc_cancel" },
            ],
          ],
        },
      },
    );
  });
}

module.exports = { applyAdminBroadcast, doBroadcast };
