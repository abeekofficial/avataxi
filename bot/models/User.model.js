// models/User.model.js
const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    telegramId:     { type: Number, required: true, unique: true, index: true },
    username:       { type: String, default: null },
    role:           { type: String, enum: ["driver", "passenger"], required: true },
    name:           { type: String, required: true },
    phone:          { type: String, required: true },

    // Driver uchun
    driverPhoto:    { type: String, default: null },
    carModel:       { type: String, default: null },
    carNumber:      { type: String, default: null },
    from:           { type: String, default: null },
    to:             { type: String, default: null },
    isActive:       { type: Boolean, default: false },

    // Umumiy
    isBlocked:      { type: Boolean, default: false },
    rating:         { type: Number, default: 5.0, min: 1, max: 5 },
    ratingCount:    { type: Number, default: 0 },
    completedOrders:{ type: Number, default: 0 },

    // Referal
    referralCode:   { type: String, default: null, unique: true, sparse: true },
    referralCount:  { type: Number, default: 0 },
    referredBy:     { type: String, default: null },
  },
  {
    timestamps: true,
  },
);

// Indexlar
userSchema.index({ role: 1, isActive: 1, isBlocked: 1, from: 1, to: 1 });
userSchema.index({ referralCode: 1 });

module.exports = mongoose.model("User", userSchema);
