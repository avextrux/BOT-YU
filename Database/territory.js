const { Schema, model } = require("mongoose");

const TerritorySchema = new Schema(
    {
        guildID: { type: String, required: true, index: true },
        territoryId: { type: String, required: true, unique: true, index: true },
        createdAt: { type: Number, default: 0, index: true },

        name: { type: String, required: true },
        ownerFactionId: { type: String, default: null, index: true },
        influence: { type: Map, of: Number, default: {} },
        policeInfluence: { type: Number, default: 0 },

        lastWarAt: { type: Number, default: 0, index: true },
        bonus: { type: String, default: "none" },
    },
    { minimize: false }
);

module.exports = model("Territory", TerritorySchema);

