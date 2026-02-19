const Discord = require("discord.js");
const { getRandomGifUrl } = require("../../Utils/giphy");

module.exports = {
    name: "slap",
    description: "Dê um tapa em alguém (com carinho ou não)",
    type: 'CHAT_INPUT',
    options: [
        {
            name: "usuario",
            description: "Quem merece um tapa?",
            type: "USER",
            required: true
        },
        {
            name: "intensidade",
            description: "Quão forte foi o tapa?",
            type: "STRING",
            required: false,
            choices: [
                { name: "Leve", value: "leve" },
                { name: "Normal", value: "normal" },
                { name: "Pesado", value: "pesado" }
            ]
        }
    ],
    run: async (client, interaction) => {
        const user = interaction.options.getUser("usuario");
        const intensidade = interaction.options.getString("intensidade") || "normal";

        if (user.id === interaction.user.id) {
            return interaction.reply({ content: "❌ Você não pode se dar um tapa (eu acho).", ephemeral: true });
        }
        if (user.bot) {
            return interaction.reply({ content: "❌ Não bata em bots.", ephemeral: true });
        }

        await interaction.deferReply();

        const fallbacks = [
            "https://media.giphy.com/media/jLeyZWgtwgr2U/giphy.gif",
            "https://media.giphy.com/media/3XlEk2RxPS1m8/giphy.gif",
            "https://media.giphy.com/media/l3q2K5jinAlChoCLS/giphy.gif",
            "https://media.giphy.com/media/12Pq4fG2P0xGmY/giphy.gif",
            "https://media.giphy.com/media/11HeubLHnQJSAU/giphy.gif",
            "https://media.giphy.com/media/3o7TKr3nzbh5WgCFxe/giphy.gif"
        ];

        const query =
            intensidade === "leve"
                ? "anime light slap"
                : intensidade === "pesado"
                ? "anime hard slap"
                : "anime slap";

        const randomGif = await getRandomGifUrl(query, { rating: "pg-13" }).catch(() => null);
        const fallback = fallbacks[Math.floor(Math.random() * fallbacks.length)];

        const gif = randomGif || fallback;

        const frases = {
            leve: ["foi só um tapinha!", "um tapa de amizade.", "um corretivo leve."],
            normal: ["doeu ou não doeu?", "foi merecido.", "um tapa clássico."],
            pesado: ["foi com ódio!", "um tapa pra acordar.", "caiu até a alma."]
        };
        const frase = (frases[intensidade] || frases.normal)[Math.floor((frases[intensidade] || frases.normal).length * Math.random())];

        const embed = new Discord.EmbedBuilder()
            .setTitle("🤚 Slap")
            .setDescription(`**${interaction.user}** deu um tapa em **${user}** — ${frase}`)
            .setColor("Orange")
            .setImage(gif);

        interaction.editReply({ embeds: [embed] });
    }
};
