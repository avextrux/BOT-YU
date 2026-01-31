const { Schema, model } = require("mongoose");

const shopSchema = new Schema({
    guildID: { type: String, required: true }, // Para suportar múltiplos servidores se necessário, ou usar 'global'
    itemID: { type: String, required: true }, // ID único curto para comprar (ex: 'vip')
    name: { type: String, required: true },
    description: { type: String, default: "Sem descrição." },
    price: { type: Number, required: true },
    roleID: { type: String, default: null }, // ID do cargo a ser entregue (opcional)
    hidden: { type: Boolean, default: false } // Se o item está escondido
});

// Índice para garantir que não haja itemIDs duplicados por servidor
shopSchema.index({ guildID: 1, itemID: 1 }, { unique: true });

module.exports = model("Shop", shopSchema);
