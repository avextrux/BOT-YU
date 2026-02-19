const { EmbedBuilder } = require("discord.js");
const { ensureEconomyAllowed } = require("../../Utils/economyGuard");
const { formatMoney } = require("../../Utils/economy");

module.exports = {
    name: "crise",
    description: "Pedir auxílio do governo (somente se estiver pobre)",
    type: 'CHAT_INPUT',
    run: async (client, interaction) => {
        try {
            const gate = await ensureEconomyAllowed(client, interaction, interaction.user.id);
            if (!gate.ok) return interaction.reply({ embeds: [gate.embed], ephemeral: true });

            const userdb = gate.userdb;
            const carteira = userdb.economia.money || 0;
            const banco = userdb.economia.banco || 0;
            const total = carteira + banco;

            // Limite de pobreza para pedir auxílio
            const LIMITE_POBREZA = 500;
            const AUXILIO = 250;
            const COOLDOWN = 60 * 60 * 1000; // 1 hora

            const now = Date.now();
            const last = userdb.cooldowns?.crise || 0;

            if (now < last) {
                return interaction.reply({ 
                    content: `⏳ Você já pediu auxílio recentemente. Volte <t:${Math.floor(last / 1000)}:R>.`,
                    ephemeral: true 
                });
            }

            if (total > LIMITE_POBREZA) {
                const embed = new EmbedBuilder()
                    .setTitle("🚫 Auxílio Negado")
                    .setColor("Red")
                    .setDescription(`Você tem **${formatMoney(total)}**. O governo só ajuda quem tem menos de **${formatMoney(LIMITE_POBREZA)}**.`)
                    .setFooter({ text: "Deixe para quem realmente precisa!" });
                
                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            userdb.economia.money = (userdb.economia.money || 0) + AUXILIO;
            if (!userdb.cooldowns) userdb.cooldowns = {};
            userdb.cooldowns.crise = now + COOLDOWN;
            await userdb.save();

            const embed = new EmbedBuilder()
                .setTitle("🆘 Auxílio Emergencial")
                .setColor("Green")
                .setDescription(`O governo te concedeu um auxílio de **${formatMoney(AUXILIO)}**.\n\nUse com sabedoria!`)
                .setTimestamp();

            interaction.reply({ embeds: [embed] });

        } catch (err) {
            console.error(err);
            interaction.reply({ content: "Erro ao pedir auxílio.", ephemeral: true });
        }
    }
};

