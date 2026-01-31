const { Schema, model } = require("mongoose");

const PoliceSchema = new Schema({
    guildID: { type: String, required: true, unique: true },
    createdAt: { type: Number, default: 0 },

    chiefId: { type: String, default: null },
    officers: { type: [String], default: [] },

    requests: {
        type: [
            {
                at: { type: Number, default: 0 },
                userId: { type: String, default: "" },
                reason: { type: String, default: "" },
                status: { type: String, default: "pending" },
                decidedAt: { type: Number, default: 0 },
                decidedBy: { type: String, default: null },
            },
        ],
        default: [],
    },
}, { minimize: false });

PoliceSchema.statics.getOrCreate = async function (guildID) {
    let doc = await this.findOne({ guildID });
    if (!doc) {
        doc = new this({ guildID, createdAt: Date.now() });
        await doc.save();
    }
    return doc;
};

module.exports = model("Police", PoliceSchema);

