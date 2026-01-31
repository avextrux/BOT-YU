const { Schema, model } = require("mongoose");

const GuildEconomySchema = new Schema({
    guildID: { type: String, required: true, unique: true },
    createdAt: { type: Number, default: 0 },

    policy: {
        presidentId: { type: String, default: null },
        taxRate: { type: Number, default: 0.0 },
        minWageBonus: { type: Number, default: 0 },
        dailySubsidy: { type: Number, default: 0 },
        treasury: { type: Number, default: 0 },
    },

    crisis: {
        active: { type: Boolean, default: false },
        type: { type: String, default: null },
        endsAt: { type: Number, default: 0 },
        multiplier: { type: Number, default: 1.0 },
        blackoutUntil: { type: Number, default: 0 },
    },

    election: {
        active: { type: Boolean, default: false },
        endsAt: { type: Number, default: 0 },
        candidates: { type: [String], default: [] },
        votes: { type: Map, of: Number, default: {} },
        voters: { type: [String], default: [] },
    },
}, { minimize: false });

GuildEconomySchema.statics.getOrCreate = async function (guildID) {
    let doc = await this.findOne({ guildID });
    if (!doc) {
        doc = new this({ guildID, createdAt: Date.now() });
        await doc.save();
    }
    return doc;
};

module.exports = model("GuildEconomy", GuildEconomySchema);

