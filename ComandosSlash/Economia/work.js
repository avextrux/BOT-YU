const Discord = require("discord.js");
const { getRandomGifUrl } = require("../../Utils/giphy");
const { formatMoney } = require("../../Utils/economy");
const { ensureEconomyAllowed } = require("../../Utils/economyGuard");
const logger = require("../../Utils/logger");
const { replyOrEdit } = require("../../Utils/commandKit");

module.exports = {
    name: "work",
    description: "Trabalhe e ganhe dinheiro",
    type: 'CHAT_INPUT',
    run: async (client, interaction) => {
        try {
            const gate = await ensureEconomyAllowed(client, interaction, interaction.user.id);
            if (!gate.ok) return interaction.reply({ embeds: [gate.embed], ephemeral: true });
            const userdb = gate.userdb;
            if (!userdb.economia.stats) userdb.economia.stats = {};
            if (!Array.isArray(userdb.economia.transactions)) userdb.economia.transactions = [];

            // Verifica se tem emprego
            if (!userdb.economia.trabalho || !userdb.economia.trabalho.trampo) {
                return interaction.reply({
                    embeds: [new Discord.MessageEmbed()
                        .setTitle(`💼 Você está desempregado!`)
                        .setColor("RED")
                        .setDescription(`Você precisa de um emprego para trabalhar.\nUse \`/empregos\` para ver as vagas disponíveis.`)
                    ],
                    ephemeral: true
                });
            }

            // Verifica Cooldown
            const now = Date.now();
            if (now < userdb.cooldowns.work) {
                const calc = userdb.cooldowns.work - now;
                const { hours, minutes, seconds } = ms(calc);
                
                return interaction.reply({
                    embeds: [new Discord.MessageEmbed()
                        .setTitle(`☕ Hora do Café`)
                        .setColor("YELLOW")
                        .setDescription(`Você está cansado. Volte ao trabalho em **${hours}h ${minutes}m ${seconds}s**.`)
                    ],
                    ephemeral: true
                });
            }

            // Lógica do trabalho
            const jobInfo = getJobDetails(userdb.economia.trabalho.trampo);
            const minMoney = Math.floor(userdb.economia.trabalho.maxmoney / 2);
            const baseGanho = Math.floor(Math.random() * (userdb.economia.trabalho.maxmoney - minMoney + 1)) + minMoney;

            const lastAt = userdb.economia.stats.workLastAt || 0;
            const within12h = lastAt && (now - lastAt) <= 12 * 60 * 60 * 1000;
            const newStreak = within12h ? (userdb.economia.stats.workStreak || 0) + 1 : 1;
            const mult = 1 + Math.min((newStreak - 1) * 0.05, 0.25);
            const crit = Math.random() < 0.1;
            const critMult = crit ? 1.2 : 1;
            const minWageBonus = gate.guildEco?.policy?.minWageBonus || 0;
            const crisisMult = gate.guildEco?.crisis?.active ? (gate.guildEco.crisis.multiplier || 1) : 1;
            const bruto = Math.max(1, Math.floor((baseGanho * mult * critMult + minWageBonus) * crisisMult));
            const taxRate = Math.max(0, Math.min(0.25, gate.guildEco?.policy?.taxRate || 0));
            const tax = Math.floor(bruto * taxRate);
            const ganho = Math.max(0, bruto - tax);
            
            // Frase aleatória
            const frase = jobInfo.frases[Math.floor(Math.random() * jobInfo.frases.length)];

            // Atualiza banco
            userdb.economia.money += ganho;
            userdb.cooldowns.work = now + userdb.economia.trabalho.cooldown;
            userdb.economia.stats.workStreak = newStreak;
            userdb.economia.stats.workLastAt = now;
            userdb.economia.transactions.push({
                at: now,
                type: "work",
                walletDelta: ganho,
                bankDelta: 0,
                meta: { job: userdb.economia.trabalho.trampo, base: baseGanho, streak: newStreak, mult, crit, minWageBonus, crisisMult, tax },
            });
            userdb.economia.transactions = userdb.economia.transactions.slice(-50);
            await userdb.save();

            if (tax > 0 && gate.guildEco) {
                gate.guildEco.policy.treasury = (gate.guildEco.policy.treasury || 0) + tax;
                await gate.guildEco.save().catch(() => {});
            }

            const gifQuery = crit ? "anime payday" : "anime working";
            const gif =
                (await getRandomGifUrl(gifQuery, { rating: "pg-13" }).catch(() => null)) ||
                "https://media.giphy.com/media/l0MYC0LajbaPoEADu/giphy.gif";

            const embed = new Discord.MessageEmbed()
                .setTitle(`🔨 Trabalho Concluído!`)
                .setColor("GREEN")
                .setDescription(`Você trabalhou como **${jobInfo.name}**.\n\n📝 **Relatório:** ${frase}`)
                .addFields(
                    { name: "💰 Pagamento", value: `**${formatMoney(ganho)}**`, inline: true },
                    { name: "🔥 Sequência", value: `**${newStreak}**`, inline: true },
                    { name: "✨ Bônus", value: `**x${(mult * critMult).toFixed(2)}**${crit ? " (crítico)" : ""}`, inline: true },
                    { name: "🧾 Imposto", value: tax > 0 ? `-${formatMoney(tax)}` : "-", inline: true }
                )
                .setImage(gif)
                .setFooter({ text: "Bom trabalho!", iconURL: interaction.user.displayAvatarURL() });

            interaction.reply({ embeds: [embed] });

        } catch (err) {
            logger.error("Erro ao trabalhar", { error: String(err?.message || err) });
            replyOrEdit(interaction, { content: "Erro ao trabalhar.", ephemeral: true }).catch(() => {});
        }
    }
};

function getJobDetails(job) {
    switch (job) {
        case "lixeiro":
            return { 
                name: "Lixeiro", 
                frases: ["Você recolheu 30 sacos de lixo.", "Você limpou a praça central.", "O cheiro estava ruim, mas o dinheiro é bom."] 
            };
        case "pizza":
            return { 
                name: "Entregador de Pizza", 
                frases: ["Você entregou 10 pizzas quentinhas.", "Quase caiu da moto, mas a pizza chegou inteira.", "Recebeu uma gorjeta extra pela rapidez."] 
            };
        case "frentista":
            return { 
                name: "Frentista", 
                frases: ["Abasteceu 50 carros hoje.", "Trocou o óleo de um caminhão.", "Lavou o parabrisa de um cliente VIP."] 
            };
        case "caminhoneiro":
            return { 
                name: "Caminhoneiro", 
                frases: ["Levou uma carga até o outro estado.", "Dirigiu a noite toda sem dormir.", "Escutou muita música sertaneja na estrada."] 
            };
        case "sedex":
            return { 
                name: "Entregador Sedex", 
                frases: ["Entregou todas as encomendas antes do prazo.", "Não jogou nenhuma caixa por cima do muro hoje.", "O cachorro correu atrás de você, mas você foi mais rápido."] 
            };
        case "pescador":
            return { 
                name: "Pescador", 
                frases: ["Pescou um peixe gigante!", "O mar estava calmo hoje.", "Vendeu vários peixes frescos no mercado."] 
            };
        case "ti":
            return { 
                name: "Técnico de TI", 
                frases: ["Removeu vírus do PC do chefe.", "Consertou a impressora (de novo).", "Atualizou o sistema sem travar nada."] 
            };
        default:
            return { name: "Trabalhador", frases: ["Trabalhou duro."] };
    }
}

function ms(ms) {
    const seconds = ~~(ms / 1000);
    const minutes = ~~(seconds / 60);
    const hours = ~~(minutes / 60);
    return { hours: hours % 24, minutes: minutes % 60, seconds: seconds % 60 };
}
