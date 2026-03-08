// handlers/help.js
// /help va "📋 Bot haqida" — barcha foydalanuvchilar uchun

const User = require("../models/User.model");
const { version } = require("../package.json");

// ─── YANGI FOYDALANUVCHI ──────────────────────────────────────────────────────
const HELP_NEW = `
🚖 <b>AVATAXI</b> | <a>${version}</a>
⚡ Telegram orqali ishlaydigan aqlli taksi tizimi!

🚀 <b>Boshlash uchun:</b>
<blockquote>/start → Ro'yxatdan o'ting</blockquote>

👤 <b>Rolni tanlang:</b>
<blockquote>🚕 Haydovchi — buyurtma qabul qiling, daromad toping
🧍 Yo'lovchi — tez va qulay taksi buyurtma bering</blockquote>

✨ <b>Imkoniyatlar:</b>
<blockquote>🌍 Viloyatlararo safar va yuk tashish
⚡ Tezkor haydovchi topish tizimi
🔄 Real vaqtda buyurtma kuzatuvi
⭐ Ikki tomonlama baholash tizimi
👥 Do'stlarni taklif qilish (referal)</blockquote>`.trim();

// ─── HAYDOVCHI ────────────────────────────────────────────────────────────────
const HELP_DRIVER = `
🚗 <b>HAYDOVCHI UCHUN QO'LLANMA</b> | <code>${version}</code>

📋 <b>Ro'yxatdan o'tish:</b>
<blockquote>/start → "🚕 Haydovchi" tugmasini bosing
👤 To'liq ism, 📱 telefon, 🤳 profil rasm
🚙 Mashina modeli va 🔢 davlat raqami
🗺 Yo'nalish: qayerdan → qayerga</blockquote>

🎯 <b>Buyurtma qabul qilish jarayoni:</b>
<blockquote>1️⃣ Bildirishnoma keladi — yo'nalish, necha kishi
2️⃣ 30 soniya ichida qaror qiling
3️⃣ ✅ Qabul → yo'lovchi ma'lumotlari ochiladi
4️⃣ Yo'lovchini olgach → "🚕 Safar boshlash"
5️⃣ Manzilga yetgach → "✅ Safar yakunlandi"
6️⃣ Yo'lovchi tasdiqlaydi → ⭐ baholash</blockquote>

🔄 <b>Buyurtma qanday keladi:</b>
<blockquote>🤖 Avtomatik — bot sizga to'g'ridan-to'g'ri yuboradi
⏱ 30 soniyada javob bermasangiz — keyingisiga o'tiladi
📢 Guruh orqali — hech kim olmasa guruhga chiqariladi</blockquote>

🚗 <b>Mashina o'rinlari tizimi:</b>
<blockquote>Mashinada maksimal 4 ta o'rin bor
2 kishilik buyurtma → 2 o'rin band bo'ladi
Safar yakunlansa → o'rinlar avtomatik bo'shaydi
Mashina to'lganda → yangi buyurtma kelmaydi
💡 Bir vaqtda bir nechta yo'lovchi olish mumkin!</blockquote>

📦 <b>Yuk/Cargo buyurtmalar:</b>
<blockquote>O'rin tizimiga bog'liq emas — alohida qabul qilinadi
Aktiv buyurtma bo'lsa yuk qabul qilib bo'lmaydi</blockquote>

⭐ <b>Reyting tizimi:</b>
<blockquote>🏆 4.8 – 5.0 → A'lo haydovchi
✅ 4.5 – 4.7 → Yaxshi haydovchi
📊 4.0 – 4.4 → O'rtacha
⚠️ 4.0 dan past → Reyting oshiring</blockquote>

👥 <b>Referal tizimi:</b>
<blockquote>🔗 Havolangizni do'stlarga yuboring
Har bir ro'yxatdan o'tgan do'st uchun ball
Havola: "👤 Profilim" bo'limida</blockquote>

❓ <b>Komandalar:</b>
<blockquote>/start — bosh menyu
/help — ushbu qo'llanma
/myorders — mening buyurtmalarim</blockquote>`.trim();

// ─── YO'LOVCHI ────────────────────────────────────────────────────────────────
const HELP_PASSENGER = `
🧍 <b>YO'LOVCHI UCHUN QO'LLANMA</b> | <a>${version}</a>

📋 <b>Ro'yxatdan o'tish:</b>
<blockquote>/start → "🧍 Yo'lovchi" tugmasini bosing
👤 To'liq ism va 📱 telefon raqamingizni kiriting</blockquote>

🚖 <b>Taksi buyurtma berish:</b>
<blockquote>1️⃣ "🚖 Buyurtma berish" tugmasini bosing
2️⃣ Qayerdan va qayerga ketishni tanlang
3️⃣ Necha kishi ekanini tanlang (1-4)
4️⃣ Tizim avtomatik haydovchi qidiradi
5️⃣ Haydovchi topilganda uning ma'lumotlari keladi
6️⃣ Safar yakunlangach → "✅ Ha, yakunlandi"
7️⃣ Haydovchini ⭐ baholang</blockquote>

🔄 <b>Haydovchi qanday topiladi:</b>
<blockquote>⚡ Birinchi navbatda reytingi yuqori haydovchilar
⏱ Haydovchi 30 soniya ichida qaror qiladi
🔁 Rad etsa — keyingi haydovchiga o'tiladi
📢 Hech kim bo'lmasa — umumiy guruhga chiqariladi</blockquote>

📦 <b>Yuk/Pochta jo'natish:</b>
<blockquote>1️⃣ "📦 Yuk/Pochta" tugmasini bosing
2️⃣ Yo'nalishni tanlang
3️⃣ Yuk tavsifini yozing
4️⃣ Rasm yuboring (ixtiyoriy)
5️⃣ Haydovchi topilganda xabar keladi</blockquote>

❌ <b>Bekor qilish:</b>
<blockquote>Safar boshlanmagan bo'lsa — bekor qilish mumkin
Safar boshlangandan keyin bekor bo'lmaydi
Haydovchi bekor qilsa — darhol xabardor bo'lasiz</blockquote>

⭐ <b>Baholash tizimi:</b>
<blockquote>Safar yakunlangach haydovchini 1-5 yulduz bering
Siz ham haydovchi tomonidan baholanasiz!
Yaxshi yo'lovchi — tezroq xizmat oladi 😊</blockquote>

👥 <b>Referal tizimi:</b>
<blockquote>🔗 "👤 Profilim" da referal havolangiz bor
Do'stlarni taklif qiling → ball to'plang</blockquote>

❓ <b>Komandalar:</b>
<blockquote>/start — bosh menyu
/help — ushbu qo'llanma</blockquote>`.trim();

// ─── FUNKSIYALAR ──────────────────────────────────────────────────────────────
function applyHelp(bot) {
  bot.onText(/\/help|📋 Bot haqida/, async (msg) => {
    const chatId = msg.chat.id;
    if (msg.chat.type !== "private") return;

    try {
      const user = await User.findOne({ telegramId: Number(chatId) });

      let text;
      if (!user) {
        text = HELP_NEW;
      } else if (user.role === "driver") {
        text = HELP_DRIVER;
      } else {
        text = HELP_PASSENGER;
      }

      bot.sendMessage(chatId, text, { parse_mode: "HTML" });
    } catch (err) {
      bot.sendMessage(chatId, HELP_NEW, { parse_mode: "HTML" });
    }
  });

  bot.onText(/\/myorders/, async (msg) => {
    const chatId = msg.chat.id;
    if (msg.chat.type !== "private") return;

    bot.sendMessage(
      chatId,
      "📋 Buyurtmalaringizni ko'rish uchun menyudagi tugmani bosing:",
      {
        reply_markup: {
          keyboard: [["📋 Mening buyurtmalarim"], ["📋 Tarixim"]],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      },
    );
  });
}

module.exports = { applyHelp, HELP_DRIVER, HELP_PASSENGER };
