const { EmbedBuilder } = require("discord.js");
const { formatMoney } = require("../../Utils/economy");
const { ensureEconomyAllowed } = require("../../Utils/economyGuard");
const logger = require("../../Utils/logger");
const { replyOrEdit } = require("../../Utils/commandKit");

module.exports = {
    name: "comprar",
    description: "Compre um item da loja",
    type: 1, // CHAT_INPUT
    options: [
        {
            name: "id",
            description: "O ID do item que você quer comprar (veja na /loja)",
            type: 3, // STRING
            required: true
        }
    ],
    run: async (client, interaction) => {
        try {
            await interaction.deferReply({ ephemeral: true }).catch(() => {});

            const gate = await ensureEconomyAllowed(client, interaction, interaction.user.id);
            if (!gate.ok) return replyOrEdit(interaction, { embeds: [gate.embed], ephemeral: true });
            
            const itemID = interaction.options.getString("id").toLowerCase();
            const guildID = interaction.guild.id;

            // Busca item
            const item = await client.shopdb.findOne({ guildID, itemID });

            if (!item) {
                return replyOrEdit(interaction, { 
                    embeds: [new EmbedBuilder().setColor("Red").setDescription(`❌ Item com ID \`${itemID}\` não encontrado na loja.`)], 
                    ephemeral: true 
                });
            }

            const guildEco = client.guildEconomydb?.getOrCreate ? await client.guildEconomydb.getOrCreate(guildID) : null;
            const inflation = guildEco?.crisis?.active && String(guildEco.crisis.type || "").toLowerCase().includes("infla");
            const priceMult = inflation ? 1.25 : 1;
            const finalPrice = Math.floor((item.price || 0) * priceMult);

            const userdb = gate.userdb;
            if (!Array.isArray(userdb.economia.transactions)) userdb.economia.transactions = [];
            const saldo = userdb.economia.money || 0;

            if (saldo < finalPrice) {
                return replyOrEdit(interaction, { 
                    embeds: [new EmbedBuilder().setColor("Red").setDescription(`❌ Dinheiro insuficiente.\n💵 Você tem: **${formatMoney(saldo)}**\n💰 Preço: **${formatMoney(finalPrice)}**${inflation ? " (inflação)" : ""}`)], 
                    ephemeral: true 
                });
            }

            // Verifica cargo (se o item der cargo)
            let roleStatus = "";
            if (item.roleID) {
                const role = interaction.guild.roles.cache.get(item.roleID);
                if (role) {
                    if (interaction.member.roles.cache.has(role.id)) {
                        return replyOrEdit(interaction, { content: "❌ Você já possui o cargo que este item oferece.", ephemeral: true });
                    }
                    try {
                        await interaction.member.roles.add(role);
                        roleStatus = `\n🎁 **Cargo recebido:** ${role.name}`;
                    } catch (e) {
                        logger.error("Erro ao dar cargo na compra", { error: String(e?.message || e), roleId: String(item.roleID || ""), guildId: String(guildID) });
                        roleStatus = `\n⚠️ **Erro:** Não consegui te dar o cargo. Verifique minhas permissões.`;
                    }
                } else {
                    roleStatus = `\n⚠️ **Aviso:** O cargo deste item foi deletado do servidor.`;
                }
            }

            // Transação
            userdb.economia.money -= finalPrice;
            userdb.economia.transactions.push({
                at: Date.now(),
                type: "shop_buy",
                walletDelta: -Math.floor(finalPrice),
                bankDelta: 0,
                meta: { guildID, itemID: item.itemID, name: item.name, roleID: item.roleID || null, inflation },
            });
            userdb.economia.transactions = userdb.economia.transactions.slice(-50);
            await userdb.save();

            const embed = new EmbedBuilder()
                .setTitle("🛒 Compra Realizada!")
                .setColor("Green")
                .setDescription(`Você comprou **${item.name}** por **${formatMoney(finalPrice)}**.${inflation ? " (inflação)" : ""}${roleStatus}`)
                .setFooter({ text: `Saldo restante: ${formatMoney(userdb.economia.money)}` });

            replyOrEdit(interaction, { embeds: [embed], ephemeral: true });

        } catch (err) {
            logger.error("Erro ao realizar compra", { error: String(err?.message || err) });
            replyOrEdit(interaction, { content: "Erro ao realizar compra.", ephemeral: true }).catch(() => {});
        }
    }
};
