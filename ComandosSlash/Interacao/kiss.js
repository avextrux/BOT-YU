const Discord = require("discord.js");
const { getRandomGifUrl } = require("../../Utils/giphy");

module.exports = {
    name: "kiss",
    description: "Dê um beijo em alguém",
    type: 'CHAT_INPUT',
    options: [
        {
            name: "usuario",
            description: "Quem você quer beijar?",
            type: "USER",
            required: true
        },
        {
            name: "mensagem",
            description: "Mensagem opcional",
            type: "STRING",
            required: false
        }
    ],
    run: async (client, interaction) => {
        const user = interaction.options.getUser("usuario");
        const mensagem = interaction.options.getString("mensagem");

        if (user.id === interaction.user.id) {
            return interaction.reply({ content: "❌ Beijinho em si mesmo não vale.", ephemeral: true });
        }
        if (user.bot) {
            return interaction.reply({ content: "❌ Isso é um bot...", ephemeral: true });
        }

        await interaction.deferReply();

        const fallbacks = [
            "https://media.giphy.com/media/G3va31oEEnIkM/giphy.gif",
            "https://media.giphy.com/media/nyGFcsP0kAobm/giphy.gif",
            "https://media.giphy.com/media/3o6ZtpxSZbQRRnwCKQ/giphy.gif",
            "https://media.giphy.com/media/11k3oaUjSlFR4I/giphy.gif"
        ];
        const randomGif = await getRandomGifUrl("anime kiss", { rating: "pg-13" }).catch(() => null);
        const fallback = fallbacks[Math.floor(Math.random() * fallbacks.length)];

        const embed = new Discord.EmbedBuilder()
            .setTitle("💋 Kiss")
            .setDescription(`**${interaction.user}** beijou **${user}**!${mensagem ? `\n\n💬 ${mensagem.slice(0, 180)}` : ""}`)
            .setColor("Red")
            .setImage(randomGif || fallback);

        interaction.editReply({ embeds: [embed] });
    }
};
