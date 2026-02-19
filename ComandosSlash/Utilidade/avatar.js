const { EmbedBuilder } = require("discord.js");

module.exports = {
    name: "avatar",
    description: "Mostra o avatar de um usuário.",
    type: "CHAT_INPUT",
    options: [
        {
            name: "usuario",
            description: "O usuário para ver o avatar",
            type: "USER",
            required: false,
        },
    ],
    run: async (client, interaction) => {
        try {
            const user = interaction.options.getUser("usuario") || interaction.user;

            const embed = new EmbedBuilder()
                .setTitle(`🖼️ Avatar de ${user.tag}`)
                .setColor("Blue")
                .setImage(user.displayAvatarURL({ dynamic: true, size: 4096 }))
                .setFooter({ text: `Solicitado por ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() });

            interaction.reply({ embeds: [embed] });
        } catch (err) {
            console.error(err);
            interaction.reply({ content: "Erro ao buscar avatar.", ephemeral: true });
        }
    },
};
