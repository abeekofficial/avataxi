// models/Order.model.js
const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema(
  {
    passengerId:      { type: Number, required: true, index: true },
    driverId:         { type: Number, default: null, index: true },
    from:             { type: String, required: true },
    to:               { type: String, required: true },

    orderType:        { type: String, enum: ["passenger", "cargo"], default: "passenger" },
    passengers:       { type: Number, default: 1, min: 1, max: 4 },

    cargoDescription: { type: String, default: null },
    cargoPhotoId:     { type: String, default: null },

    status: {
      type: String,
      enum: [
        "pending",
        "accepted",
        "in_progress",
        "driver_confirmed",
        "passenger_confirmed",
        "completed",
        "cancelled",
      ],
      default: "pending",
      index: true,
    },

    // Vaqt belgilari
    acceptedAt:           { type: Date },
    startedAt:            { type: Date },
    driverConfirmedAt:    { type: Date },
    passengerConfirmedAt: { type: Date },
    completedAt:          { type: Date },
    cancelledAt:          { type: Date },
    cancelledBy:          { type: String, enum: ["driver", "passenger", "admin"], default: null },

    // Guruh xabarlari (o'chirish uchun)
    groupMessages: [
      {
        groupId:   Number,
        messageId: Number,
      },
    ],
  },
  {
    timestamps: true,
  },
);

// Compound indexlar — assignOrder query uchun
orderSchema.index({ status: 1, driverId: 1 });
orderSchema.index({ passengerId: 1, status: 1 });
orderSchema.index({ driverId: 1, status: 1 });

module.exports = mongoose.model("Order", orderSchema);
