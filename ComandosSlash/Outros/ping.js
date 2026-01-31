const { MessageEmbed } = require("discord.js");

module.exports = {
    name: "ping",
    description: "Verifica a latência do bot e da API.",
    type: 'CHAT_INPUT',
    run: async (client, interaction) => {
        try {
            const start = Date.now();
            
            // Medir tempo de resposta do banco de dados (opcional, mas legal de ter)
            // Se não quiser medir DB, pode remover a linha abaixo.
            await client.userdb.findOne({ userID: interaction.user.id }); 
            const dbLatency = Date.now() - start;

            const embed = new MessageEmbed()
                .setColor("BLUE")
                .setTitle("� Pong!")
                .addFields(
                    { name: "📡 Latência da API", value: `\`${Math.round(client.ws.ping)}ms\``, inline: true },
                    { name: "🍃 Latência do Banco", value: `\`${dbLatency}ms\``, inline: true },
                    { name: "🤖 Latência do Bot", value: `\`${Date.now() - interaction.createdTimestamp}ms\``, inline: true }
                )
                .setFooter({ text: `Solicitado por ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() })
                .setTimestamp();

            interaction.reply({ embeds: [embed] });
        } catch (err) {
            console.error(err);
            interaction.reply({ content: "Erro ao verificar ping.", ephemeral: true });
        }
    },
};
