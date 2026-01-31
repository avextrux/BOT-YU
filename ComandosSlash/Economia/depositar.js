const Discord = require("discord.js");
const { getRandomGifUrl } = require("../../Utils/giphy");
const { formatMoney, parseAmountInput, transferWalletToBank, errorEmbed } = require("../../Utils/economy");
const { ensureEconomyAllowed } = require("../../Utils/economyGuard");

module.exports = {
    name: "depositar",
    description: "Deposite seu dinheiro no banco",
    type: 'CHAT_INPUT',
    options: [
        {
            name: "quantia",
            description: "Valor para depositar (ou 'tudo')",
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
            const carteira = userdb.economia.money || 0;

            const parsed = parseAmountInput(String(quantiaInput), { max: carteira });
            if (!parsed) {
                return interaction.reply({ embeds: [errorEmbed("❌ Digite um valor válido maior que zero (ou `tudo`/`metade`).")], ephemeral: true });
            }

            let valorDepositar = 0;
            if (parsed.kind === "all") valorDepositar = carteira;
            if (parsed.kind === "half") valorDepositar = Math.floor(carteira / 2);
            if (parsed.kind === "number") valorDepositar = parsed.value;

            if (valorDepositar <= 0) {
                return interaction.reply({ embeds: [errorEmbed("❌ Você não tem dinheiro suficiente na carteira para depositar.")], ephemeral: true });
            }

            const updated = await transferWalletToBank(
                client.userdb,
                interaction.user.id,
                valorDepositar,
                { by: interaction.user.id, channel: interaction.channelId }
            );

            if (!updated) {
                return interaction.reply({ embeds: [errorEmbed("❌ Saldo insuficiente na carteira.")], ephemeral: true });
            }

            userdb = updated;

            const gif =
                (await getRandomGifUrl("bank deposit", { rating: "pg-13" }).catch(() => null)) ||
                "https://media.giphy.com/media/26BRBupaJvXQy1m7S/giphy.gif";

            const embed = new Discord.MessageEmbed()
                .setTitle(`🏦 Depósito Realizado`)
                .setColor("GREEN")
                .setDescription(`✅ Você depositou **${formatMoney(valorDepositar)}** no banco.`)
                .addFields(
                    { name: "💵 Carteira", value: formatMoney(userdb.economia.money), inline: true },
                    { name: "🏦 Banco", value: formatMoney(userdb.economia.banco), inline: true }
                )
                .setImage(gif)
                .setTimestamp();

            interaction.reply({ embeds: [embed] });

        } catch (err) {
            console.error(err);
            interaction.reply({ content: "Erro ao realizar depósito.", ephemeral: true });
        }
    }
};
