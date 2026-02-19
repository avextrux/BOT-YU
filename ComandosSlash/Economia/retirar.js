const { EmbedBuilder } = require("discord.js");
const { getRandomGifUrl } = require("../../Utils/giphy");
const { formatMoney, parseAmountInput, transferBankToWallet, errorEmbed } = require("../../Utils/economy");
const { ensureEconomyAllowed } = require("../../Utils/economyGuard");

module.exports = {
    name: "retirar",
    description: "Retire seu dinheiro do banco",
    type: 'CHAT_INPUT',
    options: [
        {
            name: "quantia",
            description: "Valor para retirar (ou 'tudo')",
            type: "STRING",
            required: true
        },
    ],
    run: async (client, interaction) => {
        try {
            const quantiaInput = interaction.options.getString("quantia");

            const gate = await ensureEconomyAllowed(client, interaction, interaction.user.id);
            if (!gate.ok) return interaction.reply({ embeds: [gate.embed], ephemeral: true });
            
            // Busca ou cria o usuário
            let userdb = gate.userdb;
            const banco = userdb.economia.banco || 0;

            const parsed = parseAmountInput(String(quantiaInput), { max: banco });
            if (!parsed) {
                return interaction.reply({ embeds: [errorEmbed("❌ Digite um valor válido maior que zero (ou `tudo`/`metade`).")], ephemeral: true });
            }

            let valorRetirar = 0;
            if (parsed.kind === "all") valorRetirar = banco;
            if (parsed.kind === "half") valorRetirar = Math.floor(banco / 2);
            if (parsed.kind === "number") valorRetirar = parsed.value;

            if (valorRetirar <= 0) {
                return interaction.reply({ embeds: [errorEmbed("❌ Você não tem dinheiro suficiente no banco para sacar.")], ephemeral: true });
            }

            const updated = await transferBankToWallet(
                client.userdb,
                interaction.user.id,
                valorRetirar,
                { by: interaction.user.id, channel: interaction.channelId }
            );

            if (!updated) {
                return interaction.reply({ embeds: [errorEmbed("❌ Saldo insuficiente no banco.")], ephemeral: true });
            }

            userdb = updated;

            const gif =
                (await getRandomGifUrl("atm cash", { rating: "pg-13" }).catch(() => null)) ||
                "https://media.giphy.com/media/3o6gDWzmAzrpi5DQU8/giphy.gif";

            const embed = new EmbedBuilder()
                .setTitle(`💸 Saque Realizado`)
                .setColor("Green")
                .setDescription(`✅ Você sacou **${formatMoney(valorRetirar)}** do banco.`)
                .addFields(
                    { name: "💵 Carteira", value: formatMoney(userdb.economia.money), inline: true },
                    { name: "🏦 Banco", value: formatMoney(userdb.economia.banco), inline: true }
                )
                .setImage(gif)
                .setTimestamp();

            interaction.reply({ embeds: [embed] });

        } catch (err) {
            console.error(err);
            interaction.reply({ content: "Erro ao realizar saque.", ephemeral: true });
        }
    }
};
