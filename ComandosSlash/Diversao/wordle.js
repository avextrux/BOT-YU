const Discord = require("discord.js");

const WORDS = [
    "AMIGO","ANIME","BOTAO","CASAL","CASAR","CHUVA","CINCO","COISA","DADOS","DENTE",
    "FELIZ","FLORE","FORCA","FRASE","GATOS","HEROI","JOGAR","JUNTO","LIVRO","LOJAS",
    "MAGIA","MANGA","MELAO","MUNDO","NINJA","NOITE","NUVEM","OUROU","PAPEL","PEDRA",
    "PIZZA","PLANO","PRATA","RISCO","RODAS","RUBRO","SALDO","SORTE","TEMPO","TIGRE",
    "TRAVA","VIVER","VIRAR","VOZES","ZEBRA","BOLAS","BRISA","CARRO","CHAVE","DANCA",
    "FESTA","FOCUS","FURIA","GIRAR","HOMEM","IDEIA","JANTA","LIMAO","MOEDA","NATAL",
    "NIVEL","PONTO","QUASE","RAPAZ","RIRAO","RISOS","SABER","TARDE","TEXTO","URUBU",
    "VELHO","VIDAS","VITAO","XADRE","ZORRO","BANCO","DINHE","RANKS","PIXEL","COBRA",
];

function normalizeGuess(input) {
    return input
        .toUpperCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^A-Z]/g, "")
        .slice(0, 5);
}

function scoreGuess(guess, answer) {
    const res = Array(5).fill("B");
    const ans = answer.split("");
    const used = Array(5).fill(false);

    for (let i = 0; i < 5; i++) {
        if (guess[i] === ans[i]) {
            res[i] = "G";
            used[i] = true;
        }
    }

    for (let i = 0; i < 5; i++) {
        if (res[i] === "G") continue;
        const ch = guess[i];
        let found = -1;
        for (let j = 0; j < 5; j++) {
            if (!used[j] && ans[j] === ch) {
                found = j;
                break;
            }
        }
        if (found !== -1) {
            res[i] = "Y";
            used[found] = true;
        }
    }

    return res;
}

function toBlocks(guess, score) {
    const map = { G: "🟩", Y: "🟨", B: "⬛" };
    return score.map((s, i) => map[s] + guess[i]).join(" ");
}

function getSessions(client) {
    if (!client._wordleSessions) client._wordleSessions = new Map();
    return client._wordleSessions;
}

function sessionKey(guildId, userId) {
    return `${guildId}:${userId}`;
}

module.exports = {
    name: "wordle",
    description: "Jogue Wordle (5 letras)",
    type: "CHAT_INPUT",
    options: [
        {
            name: "iniciar",
            description: "Inicia uma partida",
            type: "SUB_COMMAND",
        },
        {
            name: "tentar",
            description: "Tente uma palavra",
            type: "SUB_COMMAND",
            options: [
                { name: "palavra", description: "Palavra de 5 letras", type: "STRING", required: true }
            ]
        },
        {
            name: "desistir",
            description: "Encerra sua partida atual",
            type: "SUB_COMMAND",
        }
    ],
    run: async (client, interaction) => {
        try {
            const sub = interaction.options.getSubcommand();
            const sessions = getSessions(client);
            const key = sessionKey(interaction.guildId, interaction.user.id);

            if (sub === "iniciar") {
                const answer = WORDS[Math.floor(Math.random() * WORDS.length)];
                sessions.set(key, {
                    answer,
                    attempts: [],
                    startedAt: Date.now(),
                    expiresAt: Date.now() + 10 * 60 * 1000
                });

                const embed = new Discord.MessageEmbed()
                    .setTitle("🟩🟨⬛ Wordle")
                    .setColor("GREEN")
                    .setDescription(
                        "Partida iniciada!\n\n" +
                        "- Use `/wordle tentar palavra:xxxxx`\n" +
                        "- Você tem **6 tentativas**\n" +
                        "- A partida expira em **10 minutos**"
                    );

                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            const session = sessions.get(key);
            if (!session || session.expiresAt < Date.now()) {
                sessions.delete(key);
                return interaction.reply({ content: "❌ Você não tem uma partida ativa. Use `/wordle iniciar`.", ephemeral: true });
            }

            if (sub === "desistir") {
                sessions.delete(key);
                return interaction.reply({ content: `✅ Partida encerrada. A resposta era **${session.answer}**.`, ephemeral: true });
            }

            if (sub === "tentar") {
                const raw = interaction.options.getString("palavra");
                const guess = normalizeGuess(raw);
                if (guess.length !== 5) {
                    return interaction.reply({ content: "❌ Envie uma palavra com **5 letras** (sem espaços).", ephemeral: true });
                }

                if (session.attempts.includes(guess)) {
                    return interaction.reply({ content: "❌ Você já tentou essa palavra.", ephemeral: true });
                }

                const score = scoreGuess(guess, session.answer);
                session.attempts.push(guess);

                const lines = session.attempts.map((g) => {
                    const s = scoreGuess(g, session.answer);
                    return toBlocks(g, s);
                });

                const remaining = 6 - session.attempts.length;
                const won = guess === session.answer;

                const embed = new Discord.MessageEmbed()
                    .setTitle("🟩🟨⬛ Wordle")
                    .setColor(won ? "GREEN" : remaining > 0 ? "BLURPLE" : "RED")
                    .setDescription(lines.join("\n"))
                    .addFields(
                        { name: "Tentativas restantes", value: String(Math.max(remaining, 0)), inline: true },
                        { name: "Dica", value: "🟩 letra certa/lugar certo • 🟨 letra certa/lugar errado • ⬛ não tem", inline: true }
                    );

                if (won) {
                    sessions.delete(key);
                    embed.addFields({ name: "Resultado", value: `🎉 Você acertou! A palavra era **${session.answer}**.`, inline: false });
                } else if (remaining <= 0) {
                    sessions.delete(key);
                    embed.addFields({ name: "Fim de jogo", value: `💀 Acabaram as tentativas. A palavra era **${session.answer}**.`, inline: false });
                }

                return interaction.reply({ embeds: [embed] });
            }

        } catch (err) {
            console.error(err);
            interaction.reply({ content: "Erro no Wordle.", ephemeral: true }).catch(() => {});
        }
    }
};

