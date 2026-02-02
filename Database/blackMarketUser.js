const { Schema, model } = require("mongoose");

const MissionProgressSchema = new Schema(
    {
        missionId: { type: String, required: true },
        kind: { type: String, default: "daily" },
        progress: { type: Number, default: 0 },
        goal: { type: Number, default: 0 },
        claimed: { type: Boolean, default: false },
        resetsAt: { type: Number, default: 0, index: true },
    },
    { _id: false, minimize: false }
);

const BlackMarketUserSchema = new Schema(
    {
        guildID: { type: String, required: true, index: true },
        userID: { type: String, required: true, index: true },
        createdAt: { type: Number, default: 0 },

        reputation: {
            score: { type: Number, default: 0, index: true },
            level: { type: Number, default: 0, index: true },
            lastUpdateAt: { type: Number, default: 0 },
        },

        heat: {
            level: { type: Number, default: 0, index: true },
            lastUpdateAt: { type: Number, default: 0 },
        },

        inventory: { type: Map, of: Number, default: {} },

        stats: {
            criminalProfit: { type: Number, default: 0, index: true },
            criminalRuns: { type: Number, default: 0, index: true },
            seizedCount: { type: Number, default: 0, index: true },
            seizedValue: { type: Number, default: 0, index: true },
        },

        missions: { type: [MissionProgressSchema], default: [] },

        faction: {
            factionId: { type: String, default: null, index: true },
            joinedAt: { type: Number, default: 0 },
        },

        cooldowns: {
            blackmarket: { type: Number, default: 0 },
            patrol: { type: Number, default: 0 },
            checkpoint: { type: Number, default: 0 },
        },

        antiCheat: {
            strikes: { type: Number, default: 0 },
            lockedUntil: { type: Number, default: 0, index: true },
            windowStartAt: { type: Number, default: 0 },
            windowCount: { type: Number, default: 0 },
        },
    },
    { minimize: false }
);

BlackMarketUserSchema.index({ guildID: 1, userID: 1 }, { unique: true });

BlackMarketUserSchema.statics.getOrCreate = async function (guildID, userID) {
    let doc = await this.findOne({ guildID, userID });
    if (!doc) {
        doc = new this({ guildID, userID, createdAt: Date.now() });
        await doc.save();
    }
    return doc;
};

module.exports = model("BlackMarketUser", BlackMarketUserSchema);
