// services/driverService.js
const User  = require("../models/User.model");
const Order = require("../models/Order.model");

/**
 * Driver hozir band (aktiv zakazi bor) mi tekshirish
 */
async function isDriverBusy(driverTelegramId) {
  const activeOrder = await Order.findOne({
    driverId: Number(driverTelegramId),
    status: { $in: ["accepted", "in_progress", "driver_confirmed"] },
  }).select("_id").lean();
  return !!activeOrder;
}

/**
 * Zakaz uchun bo'sh driverlarni priority tartibda olish
 */
async function getAvailableDrivers(from, to, limit = 10) {
  return User.find({
    role:      "driver",
    isActive:  true,
    isBlocked: false,
    from,
    to,
  })
    .sort({ referralCount: -1, rating: -1 })
    .limit(limit)
    .lean();
}

/**
 * Driver ratingini yangilash
 */
async function updateDriverRating(driverTelegramId, newRating) {
  const driver = await User.findOne({ telegramId: Number(driverTelegramId) });
  if (!driver) return;

  const totalRating = driver.rating * driver.ratingCount + newRating;
  driver.ratingCount += 1;
  driver.rating = parseFloat((totalRating / driver.ratingCount).toFixed(2));
  await driver.save();
  return driver;
}

/**
 * Driver yo'nalishini yangilash
 */
async function updateDriverRoute(telegramId, from, to) {
  return User.findOneAndUpdate(
    { telegramId: Number(telegramId) },
    { from, to, isActive: true },
    { new: true },
  );
}

module.exports = { isDriverBusy, getAvailableDrivers, updateDriverRating, updateDriverRoute };
