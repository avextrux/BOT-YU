const { Schema, model } = require("mongoose");

const userset = new Schema({
  userID: { type: String, required: true, unique: true },
  economia: {
      trabalho: {
          maxmoney: { type: Number, default: 0 },
          trampo: { type: String, default: null },
          cooldown: { type: Number, default: 0 }
      },
      stats: {
          dailyStreak: { type: Number, default: 0 },
          dailyLastAt: { type: Number, default: 0 },
          workStreak: { type: Number, default: 0 },
          workLastAt: { type: Number, default: 0 },
          messagesSent: { type: Number, default: 0 },
      },
      marry:{
        casado: { type: Boolean, default: false },
        com: { type: String, default: null },
        since: { type: Number, default: null }
      },
      banco: { type: Number, default: 0 },
      money: { type: Number, default: 0 },
      dirtyMoney: { type: Number, default: 0 },
      restrictions: {
        bannedUntil: { type: Number, default: 0 },
        blackMarketBannedUntil: { type: Number, default: 0 },
        casinoBannedUntil: { type: Number, default: 0 },
      },
      transactions: {
        type: [
          {
            at: { type: Number, default: 0 },
            type: { type: String, default: "" },
            walletDelta: { type: Number, default: 0 },
            bankDelta: { type: Number, default: 0 },
            meta: { type: Schema.Types.Mixed, default: null },
          },
        ],
        default: [],
      },
      sobremim: { type: String, default: "Use /sobremim para alterar este texto."}
  },
  cooldowns: {
    trabalho: { type: Number, default: 0 },
    work: { type: Number, default: 0 },
    daily: { type: Number, default: 0 },
    investigar: { type: Number, default: 0 },
  },
});

// Método estático para pegar ou criar o usuário
userset.statics.getOrCreate = async function (id) {
    let user = await this.findOne({ userID: id });
    if (!user) {
        user = new this({ userID: id });
        await user.save();
    }
    return user;
};

module.exports = model("Usuários", userset);
