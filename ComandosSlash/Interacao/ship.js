const Discord = require("discord.js");

module.exports = {
    name: "ship",
    description: "Descubra a porcentagem de amor entre duas pessoas",
    type: 'CHAT_INPUT',
    options: [
        {
            name: "usuario1",
            description: "Primeira pessoa",
            type: "USER",
            required: true
        },
        {
            name: "usuario2",
            description: "Segunda pessoa (opcional, padrão: você)",
            type: "USER",
            required: false
        }
    ],
    run: async (client, interaction) => {
        const user1 = interaction.options.getUser("usuario1");
        const user2 = interaction.options.getUser("usuario2") || interaction.user;

        // Gera uma porcentagem baseada nos IDs (para ser sempre a mesma entre o casal)
        const love = (parseInt(user1.id.slice(-3)) + parseInt(user2.id.slice(-3))) % 101;

        let desc = "";
        let cor = "";
        
        if (love < 20) {
            desc = "💔 Sem chance...";
            cor = "Black";
        } else if (love < 50) {
            desc = "😐 Talvez na friendzone.";
            cor = "Red";
        } else if (love < 80) {
            desc = "❤️ Há esperança!";
            cor = "Orange";
        } else {
            desc = "💖 Casal perfeito! Casem logo!";
            cor = "LuminousVividPink";
        }

        // Barra de progresso
        const progress = "🟩".repeat(Math.floor(love / 10)) + "⬛".repeat(10 - Math.floor(love / 10));

        const embed = new Discord.EmbedBuilder()
            .setTitle("💘 Máquina do Amor")
            .setDescription(`**${user1}** + **${user2}** = **${love}%**\n\n${progress}\n\n${desc}`)
            .setColor(cor);

        interaction.reply({ embeds: [embed] });
    }
};
