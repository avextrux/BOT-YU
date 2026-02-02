const { Schema, model } = require("mongoose");

const EvidenceSchema = new Schema(
    {
        at: { type: Number, default: 0 },
        kind: { type: String, default: "note" },
        by: { type: String, default: null },
        data: { type: Schema.Types.Mixed, default: {} },
    },
    { _id: false, minimize: false }
);

const PoliceCaseSchema = new Schema(
    {
        guildID: { type: String, required: true, index: true },
        caseId: { type: String, required: true, unique: true, index: true },
        createdAt: { type: Number, default: 0, index: true },

        status: { type: String, default: "open", index: true },
        suspectId: { type: String, default: null, index: true },
        assignedTo: { type: String, default: null, index: true },

        progress: { type: Number, default: 0, index: true },
        riskScore: { type: Number, default: 0 },
        estimatedValue: { type: Number, default: 0 },

        evidence: { type: [EvidenceSchema], default: [] },

        resolvedAt: { type: Number, default: 0, index: true },
        resolution: {
            kind: { type: String, default: null },
            by: { type: String, default: null },
            reward: { type: Number, default: 0 },
            seizedValue: { type: Number, default: 0 },
        },
    },
    { minimize: false }
);

module.exports = model("PoliceCase", PoliceCaseSchema);

