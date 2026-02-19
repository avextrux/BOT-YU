const { EmbedBuilder } = require("discord.js");

const WORDS = ["TERMO", "JOGAR", "NOITE", "MUNDO", "PODER", "LIVRO", "CORPO", "FESTA", "LETRA", "PAPEL"];

module.exports = {
    name: "wordle",
    description: "Jogue Wordle (Termo) no Discord",
    type: "CHAT_INPUT",
    options: [
        {
            name: "tentar",
            description: "Faça uma tentativa",
            type: "SUB_COMMAND",
            options: [{ name: "palavra", description: "Palavra de 5 letras", type: "STRING", required: true }]
        },
        { name: "novo", description: "Começar novo jogo", type: "SUB_COMMAND" }
    ],
    run: async (client, interaction) => {
        try {
            if (!client.wordleSessions) client.wordleSessions = new Map();
            const sessions = client.wordleSessions;
            const sub = interaction.options.getSubcommand();
            const key = interaction.user.id;

            if (sub === "novo") {
                const answer = WORDS[Math.floor(Math.random() * WORDS.length)];
                sessions.set(key, { answer, guesses: [], expires: Date.now() + 10 * 60 * 1000 });
                const embed = new EmbedBuilder()
                    .setTitle("🟩🟨⬛ Wordle")
                    .setColor("Green")
                    .setDescription("Novo jogo iniciado! Use `/wordle tentar palavra:XXXXX`.");
                return interaction.reply({ embeds: [embed] });
            }

            if (sub === "tentar") {
                const session = sessions.get(key);
                if (!session || Date.now() > session.expires) {
                    return interaction.reply({ content: "❌ Sem jogo ativo. Use `/wordle novo`.", ephemeral: true });
                }

                const guess = interaction.options.getString("palavra").toUpperCase().trim();
                if (guess.length !== 5) return interaction.reply({ content: "❌ A palavra deve ter 5 letras.", ephemeral: true });

                session.guesses.push(guess);
                const won = guess === session.answer;
                const over = session.guesses.length >= 6;

                const lines = session.guesses.map(g => {
                    return g.split("").map((l, i) => {
                        if (l === session.answer[i]) return `🟩 ${l}`;
                        if (session.answer.includes(l)) return `🟨 ${l}`;
                        return `⬛ ${l}`;
                    }).join(" ");
                });

                const embed = new EmbedBuilder()
                    .setTitle("Wordle")
                    .setColor(won ? "Green" : over ? "Red" : "Blurple")
                    .setDescription(lines.join("\n"));

                if (won) {
                    sessions.delete(key);
                    embed.addFields({ name: "Resultado", value: "🎉 Você venceu!" });
                } else if (over) {
                    sessions.delete(key);
                    embed.addFields({ name: "Resultado", value: `💀 Perdeu! Era **${session.answer}**.` });
                } else {
                    embed.setFooter({ text: `Tentativas: ${session.guesses.length}/6` });
                }

                interaction.reply({ embeds: [embed] });
            }
        } catch (err) {
            console.error(err);
            interaction.reply({ content: "Erro no Wordle.", ephemeral: true }).catch(() => {});
        }
    }
};

