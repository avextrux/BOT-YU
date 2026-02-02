const { Schema, model } = require("mongoose");

const MarketOfferSchema = new Schema(
    {
        guildID: { type: String, required: true, index: true },
        offerId: { type: String, required: true, unique: true, index: true },
        sellerId: { type: String, required: true, index: true },
        title: { type: String, required: true },
        description: { type: String, default: "" },
        price: { type: Number, required: true },
        stock: { type: Number, required: true },
        createdAt: { type: Number, default: 0, index: true },
        active: { type: Boolean, default: true, index: true },
    },
    { minimize: false }
);

module.exports = model("MarketOffer", MarketOfferSchema);

