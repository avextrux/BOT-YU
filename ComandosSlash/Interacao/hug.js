const Discord = require("discord.js");
const { getRandomGifUrl } = require("../../Utils/giphy");

module.exports = {
    name: "hug",
    description: "Dê um abraço carinhoso em alguém",
    type: 'CHAT_INPUT',
    options: [
        {
            name: "usuario",
            description: "Quem você quer abraçar?",
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
            return interaction.reply({ content: "❌ Se abraçar conta? 😅", ephemeral: true });
        }
        if (user.bot) {
            return interaction.reply({ content: "❌ Bots aceitam abraço, mas não sentem.", ephemeral: true });
        }

        await interaction.deferReply();

        const fallbacks = [
            "https://media.giphy.com/media/od5H3PmEG5EVq/giphy.gif",
            "https://media.giphy.com/media/HaC1WdpkL3W00/giphy.gif",
            "https://media.giphy.com/media/sUIZWMnfd4Mb6/giphy.gif",
            "https://media.giphy.com/media/l2QDM9Jnim1YVILXa/giphy.gif"
        ];
        const randomGif = await getRandomGifUrl("anime hug", { rating: "pg-13" }).catch(() => null);
        const fallback = fallbacks[Math.floor(Math.random() * fallbacks.length)];

        const embed = new Discord.EmbedBuilder()
            .setTitle("🫂 Hug")
            .setDescription(`**${interaction.user}** abraçou **${user}**!${mensagem ? `\n\n💬 ${mensagem.slice(0, 180)}` : ""}`)
            .setColor("LuminousVividPink")
            .setImage(randomGif || fallback);

        interaction.editReply({ embeds: [embed] });
    }
};
