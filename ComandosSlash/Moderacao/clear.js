const { MessageEmbed, Permissions } = require("discord.js");

module.exports = {
    name: "clear",
    description: "Limpa mensagens do chat.",
    type: "CHAT_INPUT",
    options: [
        {
            name: "quantidade",
            description: "Número de mensagens para apagar (1-100)",
            type: "INTEGER",
            required: true,
            minValue: 1,
            maxValue: 100
        }
    ],
    run: async (client, interaction) => {
        try {
            if (!interaction.member.permissions.has(Permissions.FLAGS.MANAGE_MESSAGES)) {
                return interaction.reply({ content: "Você não tem permissão para usar este comando.", ephemeral: true });
            }

            const amount = interaction.options.getInteger("quantidade");

            await interaction.channel.bulkDelete(amount, true);

            const embed = new MessageEmbed()
                .setColor("GREEN")
                .setDescription(`🧹 **${amount}** mensagens foram limpas com sucesso!`);

            interaction.reply({ embeds: [embed], ephemeral: true });

        } catch (err) {
            console.error(err);
            interaction.reply({ content: "Erro ao tentar limpar mensagens. Verifique se tenho permissão ou se as mensagens são muito antigas (mais de 14 dias).", ephemeral: true });
        }
    },
};
