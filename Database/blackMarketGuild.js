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
            eventCooldownMs: { type: Number, default: 10 * 60 * 1000 },
            eventCooldownUntil: { type: Number, default: 0 },
            eventProbs: {
                discount: { type: Number, default: 0.05 },
                raid: { type: Number, default: 0.05 },
                shortage: { type: Number, default: 0.05 },
                surplus: { type: Number, default: 0.05 },
                checkpointOp: { type: Number, default: 0.03 },
            },
            activeEvents: {
                raidUntil: { type: Number, default: 0 },
                shortage: {
                    until: { type: Number, default: 0 },
                    itemId: { type: String, default: null },
                },
                surplus: {
                    until: { type: Number, default: 0 },
                    itemId: { type: String, default: null },
                },
                checkpointOpUntil: { type: Number, default: 0 },
            },
            eventLog: {
                lastRaidEndAt: { type: Number, default: 0 },
                lastShortageEndAt: { type: Number, default: 0 },
                lastSurplusEndAt: { type: Number, default: 0 },
                lastDiscountEndAt: { type: Number, default: 0 },
                lastCheckpointOpEndAt: { type: Number, default: 0 },
            },
            activityRequirements: {
                level2: { type: Number, default: 50 },
                level3: { type: Number, default: 200 },
                level4: { type: Number, default: 500 },
            },
            repShop: {
                enabled: { type: Boolean, default: true },
                pricePerRep: { type: Number, default: 120 },
                maxPerDay: { type: Number, default: 250 },
            },
            crime: {
                robbery: {
                    enabled: { type: Boolean, default: true },
                    durationMs: { type: Number, default: 90 * 1000 },
                    cooldownMs: { type: Number, default: 8 * 60 * 1000 },
                    minDirty: { type: Number, default: 250 },
                    maxDirty: { type: Number, default: 1800 },
                    alertChance: { type: Number, default: 0.65 },
                },
                trafficking: {
                    enabled: { type: Boolean, default: true },
                    durationMs: { type: Number, default: 120 * 1000 },
                    cooldownMs: { type: Number, default: 10 * 60 * 1000 },
                    minDirty: { type: Number, default: 400 },
                    maxDirty: { type: Number, default: 2600 },
                    costMin: { type: Number, default: 200 },
                    costMax: { type: Number, default: 1200 },
                    alertChance: { type: Number, default: 0.75 },
                },
                laundering: {
                    enabled: { type: Boolean, default: true },
                    cooldownMs: { type: Number, default: 6 * 60 * 1000 },
                    feePct: { type: Number, default: 0.18 },
                    riskBase: { type: Number, default: 0.12 },
                },
            },
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
            policeRoleId: { type: String, default: null },
            alertPolice: { type: Boolean, default: true },
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
