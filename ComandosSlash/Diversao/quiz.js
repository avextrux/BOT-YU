const Discord = require("discord.js");
const logger = require("../../Utils/logger");
const { safe } = require("../../Utils/interactions");
const { replyOrEdit } = require("../../Utils/commandKit");

const QUESTIONS = [
    {
        q: "Qual é a capital do Brasil?",
        a: ["Brasília", "Rio de Janeiro", "São Paulo", "Salvador"],
        c: 0
    },
    {
        q: "Qual planeta é conhecido como Planeta Vermelho?",
        a: ["Marte", "Júpiter", "Vênus", "Saturno"],
        c: 0
    },
    {
        q: "Quantos lados tem um triângulo?",
        a: ["3", "4", "5", "6"],
        c: 0
    },
    {
        q: "Em que linguagem o Discord.js é usado?",
        a: ["JavaScript", "Python", "Go", "Rust"],
        c: 0
    },
    {
        q: "Qual desses NÃO é um mamífero?",
        a: ["Tubarão", "Baleia", "Cachorro", "Morcego"],
        c: 0
    },
];

function scoreStore(client) {
    if (!client._quizScore) client._quizScore = new Map();
    return client._quizScore;
}

module.exports = {
    name: "quiz",
    description: "Quiz rápido com botões",
    type: "CHAT_INPUT",
    run: async (client, interaction) => {
        try {
            const item = QUESTIONS[Math.floor(Math.random() * QUESTIONS.length)];
            const correct = item.c;

            const row = new Discord.MessageActionRow().addComponents(
                new Discord.MessageButton().setCustomId("q0").setLabel(item.a[0]).setStyle("PRIMARY"),
                new Discord.MessageButton().setCustomId("q1").setLabel(item.a[1]).setStyle("PRIMARY"),
                new Discord.MessageButton().setCustomId("q2").setLabel(item.a[2]).setStyle("PRIMARY"),
                new Discord.MessageButton().setCustomId("q3").setLabel(item.a[3]).setStyle("PRIMARY")
            );

            const embed = new Discord.MessageEmbed()
                .setTitle("🧠 Quiz")
                .setColor("BLURPLE")
                .setDescription(item.q)
                .setFooter({ text: "Você tem 20 segundos." });

            const msg = await interaction.reply({ embeds: [embed], components: [row], fetchReply: true });

            const collector = msg.createMessageComponentCollector({
                filter: (i) => i.user.id === interaction.user.id,
                time: 20000,
                max: 1
            });

            collector.on("collect", async (i) => {
                await safe(i.deferUpdate());
                const picked = Number(i.customId.slice(1));
                const ok = picked === correct;

                const scores = scoreStore(client);
                const current = scores.get(interaction.user.id) || { wins: 0, loses: 0 };
                if (ok) current.wins += 1;
                else current.loses += 1;
                scores.set(interaction.user.id, current);

                const end = new Discord.MessageEmbed()
                    .setTitle("🧠 Quiz - Resultado")
                    .setColor(ok ? "GREEN" : "RED")
                    .setDescription(
                        `${item.q}\n\n` +
                        `Sua resposta: **${item.a[picked]}**\n` +
                        `Correta: **${item.a[correct]}**\n\n` +
                        (ok ? "✅ Acertou!" : "❌ Errou!")
                    )
                    .addFields({ name: "Placar", value: `✅ ${current.wins} | ❌ ${current.loses}`, inline: true });

                await interaction.editReply({ embeds: [end], components: [] });
            });

            collector.on("end", async (collected) => {
                if (collected.size === 0) {
                    const end = new Discord.MessageEmbed()
                        .setTitle("🧠 Quiz")
                        .setColor("GREY")
                        .setDescription(`⏰ Tempo esgotado!\n\nCorreta: **${item.a[correct]}**`);
                    await safe(interaction.editReply({ embeds: [end], components: [] }));
                }
            });

        } catch (err) {
            logger.error("Erro no quiz", { error: String(err?.message || err) });
            replyOrEdit(interaction, { content: "Erro no quiz.", ephemeral: true }).catch(() => {});
        }
    }
};

