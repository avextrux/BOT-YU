const { EmbedBuilder } = require("discord.js");
const { getRandomGifUrl } = require("../../Utils/giphy");

module.exports = {
    name: "gif",
    description: "Busca um GIF no GIPHY",
    type: "CHAT_INPUT",
    options: [
        {
            name: "busca",
            description: "Ex: anime hug, gato, meme",
            type: "STRING",
            required: true
        }
    ],
    run: async (client, interaction) => {
        try {
            const q = interaction.options.getString("busca").trim();
            if (!q) return interaction.reply({ content: "❌ Informe um termo de busca.", ephemeral: true });

            await interaction.deferReply();

            const gif = await getRandomGifUrl(q, { rating: "pg-13" }).catch(() => null);
            if (!gif) {
                return interaction.editReply({ content: "❌ Não encontrei GIF (ou a key do GIPHY não está configurada)." });
            }

            const embed = new EmbedBuilder()
                .setColor("Blurple")
                .setTitle("🎞️ GIF")
                .setDescription(`Busca: **${q}**`)
                .setImage(gif);

            interaction.editReply({ embeds: [embed] });
        } catch (err) {
            console.error(err);
            if (interaction.deferred || interaction.replied) {
                interaction.editReply({ content: "Erro ao buscar GIF." }).catch(() => {});
            } else {
                interaction.reply({ content: "Erro ao buscar GIF.", ephemeral: true }).catch(() => {});
            }
        }
    }
};

