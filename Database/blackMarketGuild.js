const { Schema, model } = require("mongoose");

const CheckpointSchema = new Schema(
    {
        districtId: { type: String, default: "central" },
        createdAt: { type: Number, default: 0 },
        activeUntil: { type: Number, default: 0, index: true },
        placedBy: { type: String, default: null },
    },
    { _id: false, minimize: false }
);

const VendorSchema = new Schema(
    {
        vendorId: { type: String, required: true },
        name: { type: String, default: "" },
        restockEveryMs: { type: Number, default: 60 * 60 * 1000 },
        nextRestockAt: { type: Number, default: 0, index: true },
        stock: { type: Map, of: Number, default: {} },
        specialUntil: { type: Number, default: 0 },
    },
    { _id: false, minimize: false }
);

const BlackMarketGuildSchema = new Schema(
    {
        guildID: { type: String, required: true, unique: true, index: true },
        createdAt: { type: Number, default: 0 },
        active: { type: Boolean, default: false, index: true },

        config: {
            patrolBaseChance: { type: Number, default: 0.08 },
            checkpointBonus: { type: Number, default: 0.12 },
            maxCheckpoints: { type: Number, default: 3 },
            checkpointDurationMs: { type: Number, default: 20 * 60 * 1000 },
            heatDecayPerHour: { type: Number, default: 4 },
            demandEmaAlpha: { type: Number, default: 0.25 },
            maxDemandFactor: { type: Number, default: 1.5 },
            maxHeatFactor: { type: Number, default: 1.2 },
            dailyResetAt: { type: Number, default: 0, index: true },
            weeklyResetAt: { type: Number, default: 0, index: true },
            discountUntil: { type: Number, default: 0 },
            discountMultiplier: { type: Number, default: 1.0 },
        },

        patrol: {
            intensity: { type: Number, default: 0.35 },
            lastTickAt: { type: Number, default: 0 },
        },

        heat: {
            level: { type: Number, default: 0 },
            lastUpdateAt: { type: Number, default: 0 },
        },

        demandEma: { type: Map, of: Number, default: {} },

        checkpoints: { type: [CheckpointSchema], default: [] },
        vendors: { type: [VendorSchema], default: [] },

        mission: {
            dailySeed: { type: Number, default: 0 },
            weeklySeed: { type: Number, default: 0 },
        },

        announce: {
            channelId: { type: String, default: null },
            pingEveryone: { type: Boolean, default: false },
        },
    },
    { minimize: false }
);

BlackMarketGuildSchema.statics.getOrCreate = async function (guildID) {
    let doc = await this.findOne({ guildID });
    if (!doc) {
        doc = new this({ guildID, createdAt: Date.now(), active: false });
        await doc.save();
    }
    return doc;
};

module.exports = model("BlackMarketGuild", BlackMarketGuildSchema);
