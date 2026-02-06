const { Schema, model } = require("mongoose");

const BlackMarketUserSchema = new Schema({
    guildID: { type: String, required: true, index: true },
    userID: { type: String, required: true, index: true },
    
    // Reputação e Heat
    reputation: {
        score: { type: Number, default: 0 },
        level: { type: Number, default: 0 },
        lastUpdateAt: { type: Number, default: 0 }
    },
    heat: {
        level: { type: Number, default: 0 },
        lastUpdateAt: { type: Number, default: 0 }
    },

    // Inventário de itens ilícitos
    inventory: { type: Map, of: Number, default: {} },

    // Estatísticas
    stats: {
        criminalProfit: { type: Number, default: 0 },
        criminalRuns: { type: Number, default: 0 },
        seizedCount: { type: Number, default: 0 },
        seizedValue: { type: Number, default: 0 },
        repBoughtToday: { type: Number, default: 0 },
        repBoughtResetAt: { type: Number, default: 0 }
    },

    // Cooldowns específicos
    cooldowns: {
        blackmarket: { type: Number, default: 0 },
        patrol: { type: Number, default: 0 },
        checkpoint: { type: Number, default: 0 },
        robbery: { type: Number, default: 0 },
        trafficking: { type: Number, default: 0 },
        laundering: { type: Number, default: 0 }
    },

    // Última atividade criminosa
    lastCrime: {
        at: { type: Number, default: 0 },
        districtId: { type: String, default: null },
        kind: { type: String, default: null }
    },

    // Operação ativa (assalto, tráfico)
    operation: {
        active: { type: Boolean, default: false },
        kind: { type: String, default: null }, // robbery, trafficking
        districtId: { type: String, default: null },
        caseId: { type: String, default: null },
        startedAt: { type: Number, default: 0 },
        endsAt: { type: Number, default: 0 },
        dirtyPayout: { type: Number, default: 0 },
        cleanCost: { type: Number, default: 0 }
    },

    // Anti-cheat / Rate limit interno
    antiCheat: {
        strikes: { type: Number, default: 0 },
        lockedUntil: { type: Number, default: 0 },
        windowStartAt: { type: Number, default: 0 },
        windowCount: { type: Number, default: 0 }
    },

    // Missões
    missions: [
        {
            missionId: String,
            progress: Number,
            goal: Number,
            claimed: Boolean,
            resetsAt: Number
        }
    ]
}, { minimize: false });

// Índice para ranking de lucro criminoso
BlackMarketUserSchema.index({ guildID: 1, "stats.criminalProfit": -1 });

// Helper para garantir criação
BlackMarketUserSchema.statics.getOrCreate = async function (guildID, userID) {
    let doc = await this.findOne({ guildID, userID });
    if (!doc) {
        try {
            doc = await this.create({ guildID, userID });
        } catch (e) {
            if (e.code === 11000) {
                doc = await this.findOne({ guildID, userID });
            } else {
                throw e;
            }
        }
    }
    return doc;
};

module.exports = model("BlackMarketUser", BlackMarketUserSchema);
