const Discord = require("discord.js");

module.exports = {
    name: "sorteio",
    description: "Escolhe aleatoriamente uma opção",
    type: "CHAT_INPUT",
    options: [
        {
            name: "opcoes",
            description: "Separe por | (ex: pizza | hambúrguer | sushi)",
            type: "STRING",
            required: true
        }
    ],
    run: async (client, interaction) => {
        try {
            const raw = interaction.options.getString("opcoes");
            const options = raw
                .split("|")
                .map((s) => s.trim())
                .filter(Boolean)
                .slice(0, 30);

            if (options.length < 2) {
                return interaction.reply({ content: "❌ Coloque pelo menos 2 opções separadas por `|`.", ephemeral: true });
            }

            const winner = options[Math.floor(Math.random() * options.length)];

            const embed = new Discord.MessageEmbed()
                .setTitle("🎲 Sorteio")
                .setColor("GOLD")
                .addFields(
                    { name: "Opções", value: options.map((o) => `• ${o}`).join("\n").slice(0, 1024) },
                    { name: "Resultado", value: `✅ **${winner}**` }
                )
                .setFooter({ text: `Total: ${options.length} opções` });

            interaction.reply({ embeds: [embed] });
        } catch (err) {
            console.error(err);
            interaction.reply({ content: "Erro ao realizar sorteio.", ephemeral: true }).catch(() => {});
        }
    }
};

