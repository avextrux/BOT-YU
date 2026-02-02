const { Schema, model } = require("mongoose");

const MemberSchema = new Schema(
    {
        userId: { type: String, required: true },
        role: { type: String, default: "member" },
        joinedAt: { type: Number, default: 0 },
    },
    { _id: false, minimize: false }
);

const FactionSchema = new Schema(
    {
        guildID: { type: String, required: true, index: true },
        factionId: { type: String, required: true, unique: true, index: true },
        createdAt: { type: Number, default: 0, index: true },

        name: { type: String, required: true },
        tag: { type: String, default: "" },
        side: { type: String, default: "criminal", index: true },

        leaderId: { type: String, required: true, index: true },
        members: { type: [MemberSchema], default: [] },

        treasury: { type: Number, default: 0 },
        rep: { type: Number, default: 0, index: true },

        territories: { type: [String], default: [] },

        stats: {
            warsWon: { type: Number, default: 0, index: true },
            warsLost: { type: Number, default: 0, index: true },
            influenceGained: { type: Number, default: 0, index: true },
        },
    },
    { minimize: false }
);

FactionSchema.index({ guildID: 1, name: 1 }, { unique: true });

module.exports = model("Faction", FactionSchema);

