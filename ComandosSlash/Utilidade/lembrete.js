const Discord = require("discord.js");

function getReminders(client) {
    if (!client._reminders) client._reminders = new Map();
    return client._reminders;
}

module.exports = {
    name: "lembrete",
    description: "Crie um lembrete (em minutos)",
    type: "CHAT_INPUT",
    options: [
        {
            name: "minutos",
            description: "De 1 a 720 (12h)",
            type: "INTEGER",
            required: true
        },
        {
            name: "mensagem",
            description: "O que você quer lembrar?",
            type: "STRING",
            required: true
        }
    ],
    run: async (client, interaction) => {
        try {
            const minutes = interaction.options.getInteger("minutos");
            const message = interaction.options.getString("mensagem").trim();

            if (!minutes || minutes < 1 || minutes > 720) {
                return interaction.reply({ content: "❌ Minutos inválidos (1 a 720).", ephemeral: true });
            }
            if (!message) {
                return interaction.reply({ content: "❌ Mensagem inválida.", ephemeral: true });
            }

            const ms = minutes * 60 * 1000;
            const reminders = getReminders(client);
            const id = `${interaction.user.id}:${Date.now()}`;

            const embed = new Discord.MessageEmbed()
                .setTitle("⏰ Lembrete criado")
                .setColor("BLURPLE")
                .addFields(
                    { name: "Em", value: `${minutes} minuto(s)`, inline: true },
                    { name: "Mensagem", value: message.slice(0, 1024), inline: false }
                );

            await interaction.reply({ embeds: [embed], ephemeral: true });

            const timeout = setTimeout(async () => {
                reminders.delete(id);
                const ping = `<@${interaction.user.id}>`;
                const remindEmbed = new Discord.MessageEmbed()
                    .setTitle("⏰ Lembrete")
                    .setColor("GREEN")
                    .setDescription(message);

                interaction.channel.send({ content: ping, embeds: [remindEmbed] }).catch(() => {});
            }, ms);

            reminders.set(id, timeout);
        } catch (err) {
            console.error(err);
            interaction.reply({ content: "Erro ao criar lembrete.", ephemeral: true }).catch(() => {});
        }
    }
};

