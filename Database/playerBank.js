const { Schema, model } = require("mongoose");

const LoanSchema = new Schema({
    borrowerId: { type: String, required: true },
    principal: { type: Number, default: 0 },
    interestRate: { type: Number, default: 0.1 },
    createdAt: { type: Number, default: 0 },
    dueAt: { type: Number, default: 0 },
    remaining: { type: Number, default: 0 },
}, { _id: false, minimize: false });

const PlayerBankSchema = new Schema({
    guildID: { type: String, required: true, index: true },
    bankID: { type: String, required: true },
    name: { type: String, required: true },
    ownerId: { type: String, required: true },
    createdAt: { type: Number, default: 0 },

    reserves: { type: Number, default: 0 },
    depositInterestRate: { type: Number, default: 0.0 },
    loanInterestRate: { type: Number, default: 0.15 },
    feeRate: { type: Number, default: 0.01 },

    deposits: {
        type: Map,
        of: Number,
        default: {},
    },

    loans: { type: [LoanSchema], default: [] },
}, { minimize: false });

PlayerBankSchema.index({ guildID: 1, bankID: 1 }, { unique: true });

module.exports = model("PlayerBanks", PlayerBankSchema);

