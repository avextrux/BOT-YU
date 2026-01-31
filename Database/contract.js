const { Schema, model } = require("mongoose");

const ContractSchema = new Schema({
    guildID: { type: String, required: true, index: true },
    createdAt: { type: Number, default: 0 },
    status: { type: String, default: "pending" },

    title: { type: String, default: "Contrato" },
    description: { type: String, default: "" },

    partyA: { type: String, required: true },
    partyB: { type: String, required: true },

    escrow: {
        a: { type: Number, default: 0 },
        b: { type: Number, default: 0 },
    },

    fine: { type: Number, default: 0 },
    dueAt: { type: Number, default: 0 },

    dispute: {
        active: { type: Boolean, default: false },
        endsAt: { type: Number, default: 0 },
        votesA: { type: Number, default: 0 },
        votesB: { type: Number, default: 0 },
        voters: { type: [String], default: [] },
        decidedWinner: { type: String, default: null },
    },

    completion: {
        aConfirmed: { type: Boolean, default: false },
        bConfirmed: { type: Boolean, default: false },
    },
}, { minimize: false });

ContractSchema.statics.getByShortId = async function (guildID, shortId) {
    if (!shortId) return null;
    const id = String(shortId).trim();
    if (!id) return null;
    if (/^[a-fA-F0-9]{24}$/.test(id)) return this.findOne({ guildID, _id: id });
    const all = await this.find({ guildID }).sort({ createdAt: -1 }).limit(50);
    return all.find((c) => String(c._id).slice(-6).toLowerCase() === id.toLowerCase()) || null;
};

module.exports = model("Contratos", ContractSchema);

