const Discord = require("discord.js");

const WORDS = [
    "ABACATE","ABRACO","ACORDE","AGUARD","AMAVEL","ANIME","ARROZ","ATIVOS","AZEITE","BANANA",
    "BATALHA","BICHO","BISCOI","BOLADO","BONECA","BRASIL","CABIDE","CACHOR","CADEIA","CAIXAS",
    "CANETA","CARTAO","CASADO","CENOUR","CIDADE","COELHO","COISAS","COMIDA","CONTA","CORACAO",
    "CUIDAR","DANADO","DENTRO","DESVIO","DIFICI","DINHEI","DORMIR","DUVIDO","ESCOLA","ESPADA",
    "FELIZ","FESTA","FRASES","GATINH","GIRASS","HABIL","HEROIS","JOGOS","JUNTO","LIMAO",
    "MELHOR","MUNDO","NINJA","NIVEL","NOITE","OURO","PIZZA","PLANOS","PRATA","RAPIDO",
    "SABER","SORTE","TEMPO","TIGRE","TRISTE","UNIDOS","VIDAS","VITORI","VOZES","ZEBRA"
].map(w => w.slice(0, 6));

function normalize(input) {
    return input
        .toUpperCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^A-Z]/g, "");
}

function sessions(client) {
    if (!client._forcaSessions) client._forcaSessions = new Map();
    return client._forcaSessions;
}

function key(guildId, userId) {
    return `${guildId}:${userId}`;
}

function maskWord(answer, guessed) {
    return answer
        .split("")
        .map(ch => (guessed.has(ch) ? ch : "_"))
        .join(" ");
}

function isSolved(answer, guessed) {
    for (const ch of answer) {
        if (!guessed.has(ch)) return false;
    }
    return true;
}

module.exports = {
    name: "forca",
    description: "Jogue Forca",
    type: "CHAT_INPUT",
    options: [
        { name: "iniciar", description: "Inicia uma partida", type: "SUB_COMMAND" },
        {
            name: "letra",
            description: "Tenta uma letra",
            type: "SUB_COMMAND",
            options: [
                { name: "letra", description: "Uma letra", type: "STRING", required: true }
            ]
        },
        {
            name: "palavra",
            description: "Chuta a palavra inteira",
            type: "SUB_COMMAND",
            options: [
                { name: "palavra", description: "Seu chute", type: "STRING", required: true }
            ]
        },
        { name: "desistir", description: "Encerra a partida", type: "SUB_COMMAND" }
    ],
    run: async (client, interaction) => {
        try {
            const sub = interaction.options.getSubcommand();
            const store = sessions(client);
            const k = key(interaction.guildId, interaction.user.id);

            if (sub === "iniciar") {
                const answer = WORDS[Math.floor(Math.random() * WORDS.length)];
                store.set(k, {
                    answer,
                    guessed: new Set(),
                    wrong: new Set(),
                    lives: 6,
                    expiresAt: Date.now() + 10 * 60 * 1000
                });

                const embed = new Discord.MessageEmbed()
                    .setTitle("🪢 Forca")
                    .setColor("BLURPLE")
                    .setDescription(
                        `Palavra: **${maskWord(answer, new Set())}**\n\n` +
                        `Vidas: **6**\n` +
                        `Use \/forca letra letra:A ou \/forca palavra palavra:XXXXX\n` +
                        `A partida expira em 10 minutos.`
                    );

                return interaction.reply({ embeds: [embed] });
            }

            const s = store.get(k);
            if (!s || s.expiresAt < Date.now()) {
                store.delete(k);
                return interaction.reply({ content: "❌ Você não tem partida ativa. Use `/forca iniciar`.", ephemeral: true });
            }

            if (sub === "desistir") {
                store.delete(k);
                return interaction.reply({ content: `✅ Você desistiu. A palavra era **${s.answer}**.`, ephemeral: true });
            }

            if (sub === "letra") {
                const raw = interaction.options.getString("letra");
                const letter = normalize(raw).slice(0, 1);
                if (!letter) {
                    return interaction.reply({ content: "❌ Envie uma letra válida.", ephemeral: true });
                }

                if (s.guessed.has(letter) || s.wrong.has(letter)) {
                    return interaction.reply({ content: "❌ Você já tentou essa letra.", ephemeral: true });
                }

                if (s.answer.includes(letter)) {
                    s.guessed.add(letter);
                } else {
                    s.wrong.add(letter);
                    s.lives -= 1;
                }
            }

            if (sub === "palavra") {
                const raw = interaction.options.getString("palavra");
                const guess = normalize(raw).slice(0, s.answer.length);
                if (guess.length !== s.answer.length) {
                    return interaction.reply({ content: `❌ Sua palavra deve ter **${s.answer.length}** letras.`, ephemeral: true });
                }
                if (guess === s.answer) {
                    for (const ch of s.answer) s.guessed.add(ch);
                } else {
                    s.lives -= 1;
                }
            }

            const solved = isSolved(s.answer, s.guessed);
            const dead = s.lives <= 0;

            const embed = new Discord.MessageEmbed()
                .setTitle("🪢 Forca")
                .setColor(solved ? "GREEN" : dead ? "RED" : "BLURPLE")
                .addFields(
                    { name: "Palavra", value: `**${maskWord(s.answer, s.guessed)}**`, inline: false },
                    { name: "Vidas", value: `**${Math.max(s.lives, 0)}**`, inline: true },
                    { name: "Erradas", value: s.wrong.size ? Array.from(s.wrong).sort().join(", ") : "-", inline: true }
                );

            if (solved) {
                store.delete(k);
                embed.addFields({ name: "Resultado", value: `🎉 Você venceu! A palavra era **${s.answer}**.` });
            } else if (dead) {
                store.delete(k);
                embed.addFields({ name: "Fim de jogo", value: `💀 Você perdeu. A palavra era **${s.answer}**.` });
            }

            return interaction.reply({ embeds: [embed] });
        } catch (err) {
            console.error(err);
            interaction.reply({ content: "Erro na forca.", ephemeral: true }).catch(() => {});
        }
    }
};

