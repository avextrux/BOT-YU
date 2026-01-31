const Discord = require("discord.js");

module.exports = {
    name: "embed",
    description: "Crie uma embed personalizada",
    type: 'CHAT_INPUT',
    options: [
        { name: "titulo", description: "Título da embed", type: "STRING", required: true },
        { name: "descricao", description: "Descrição da embed", type: "STRING", required: true },
        { name: "cor", description: "Cor (HEX ou nome)", type: "STRING", required: false },
        { name: "imagem", description: "URL da imagem", type: "STRING", required: false },
        { name: "footer", description: "Texto do rodapé", type: "STRING", required: false },
        { name: "canal", description: "Canal onde enviar (opcional)", type: "CHANNEL", required: false }
    ],
    run: async (client, interaction) => {
        if (!interaction.member.permissions.has("MANAGE_MESSAGES")) {
            return interaction.reply({ content: "❌ Sem permissão.", ephemeral: true });
        }

        const titulo = interaction.options.getString("titulo");
        const descricao = interaction.options.getString("descricao");
        const corInput = interaction.options.getString("cor");
        const imagem = interaction.options.getString("imagem");
        const footer = interaction.options.getString("footer");
        const canal = interaction.options.getChannel("canal") || interaction.channel;

        let cor = "BLUE";
        if (corInput) {
            const v = corInput.trim();
            if (/^#?[0-9a-fA-F]{6}$/.test(v)) {
                cor = v.startsWith("#") ? v : `#${v}`;
            } else {
                cor = v.toUpperCase();
            }
        }

        const embed = new Discord.MessageEmbed()
            .setTitle(titulo)
            .setDescription(descricao)
            .setColor(cor);

        if (imagem) embed.setImage(imagem);
        if (footer) embed.setFooter({ text: footer });

        await interaction.reply({ content: "✅ Embed enviada!", ephemeral: true });
        await canal.send({ embeds: [embed] });
    }
};
