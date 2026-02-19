const Discord = require("discord.js");

module.exports = {
    name: "8ball",
    description: "Pergunte algo para a bola mágica",
    type: 'CHAT_INPUT',
    options: [
        {
            name: "pergunta",
            description: "O que você quer saber?",
            type: "STRING",
            required: true
        }
    ],
    run: async (client, interaction) => {
        const respostas = [
            "Com certeza!", "Sem dúvida.", "Sim, definitivamente.", "Você pode contar com isso.",
            "A meu ver, sim.", "Provavelmente.", "Sim.", "Sinais apontam que sim.",
            "Resposta nebulosa, tente de novo.", "Pergunte mais tarde.", "Melhor não te dizer agora.",
            "Não conte com isso.", "Minha resposta é não.", "Minhas fontes dizem não.", "Muito duvidoso."
        ];

        const pergunta = interaction.options.getString("pergunta");
        const resposta = respostas[Math.floor(Math.random() * respostas.length)];

        let cor = "Blue";
        if (["Não", "duvidoso"].some(x => resposta.includes(x))) cor = "Red";
        if (["Sim", "certeza", "provavelmente"].some(x => resposta.includes(x))) cor = "Green";

        const embed = new Discord.EmbedBuilder()
            .setTitle("🎱 Bola Mágica 8Ball")
            .setColor(cor)
            .addFields(
                { name: "❓ Pergunta", value: pergunta },
                { name: "🎱 Resposta", value: resposta }
            )
            .setFooter({ text: `Perguntado por ${interaction.user.tag}` });

        interaction.reply({ embeds: [embed] });
    }
};
