const { EmbedBuilder } = require("discord.js");
const { formatMoney } = require("../../Utils/economy");
const logger = require("../../Utils/logger");
const { replyOrEdit } = require("../../Utils/commandKit");

module.exports = {
    name: "loja",
    description: "Veja os itens disponíveis para compra",
    type: 1, // CHAT_INPUT
    run: async (client, interaction) => {
        try {
            const guildEco = client.guildEconomydb?.getOrCreate ? await client.guildEconomydb.getOrCreate(interaction.guild.id) : null;
            const inflation = guildEco?.crisis?.active && String(guildEco.crisis.type || "").toLowerCase().includes("infla");
            const priceMult = inflation ? 1.25 : 1;

            const itens = await client.shopdb.find({ guildID: interaction.guild.id, hidden: { $ne: true } });

            if (!itens || itens.length === 0) {
                return interaction.reply({ 
                    embeds: [new EmbedBuilder()
                        .setTitle("🏪 Loja Vazia")
                        .setColor("Yellow")
                        .setDescription("Ainda não há itens na loja deste servidor.\nPeça para um moderador adicionar itens usando `/loja-admin criar`.")
                    ]
                });
            }

            const embed = new EmbedBuilder()
                .setTitle(`🏪 Loja de ${interaction.guild.name}`)
                .setColor("Gold")
                .setDescription("Use `/comprar [id]` para adquirir um item.")
                .setThumbnail(interaction.guild.iconURL({ dynamic: true }));

            itens.forEach(item => {
                const price = Math.floor((item.price || 0) * priceMult);
                let detalhes = `🆔 **ID:** \`${item.itemID}\`\n💰 **Preço:** ${formatMoney(price)}${inflation ? " (inflação)" : ""}\n📝 **Desc:** ${item.description}`;
                if (item.roleID) {
                    detalhes += `\n🎁 **Prêmio:** <@&${item.roleID}>`;
                }
                embed.addFields({ name: `📦 ${item.name}`, value: detalhes, inline: true });
            });

            interaction.reply({ embeds: [embed] });

        } catch (err) {
            logger.error("Erro ao carregar a loja", { error: String(err?.message || err) });
            replyOrEdit(interaction, { content: "Erro ao carregar a loja.", ephemeral: true }).catch(() => {});
        }
    }
};
