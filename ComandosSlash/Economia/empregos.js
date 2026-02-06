const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require("discord.js");

module.exports = {
    name: "empregos",
    description: "Escolha um novo emprego",
    type: 1, // CHAT_INPUT
    run: async (client, interaction) => {

        let userdb = await client.userdb.getOrCreate(interaction.user.id);

        const embed = new EmbedBuilder()
            .setTitle('💼 Agência de Empregos')
            .setColor("Blue")
            .setDescription('Selecione uma vaga abaixo para ver detalhes.\n\n⚠️ **Atenção:** Cada emprego tem um tempo de descanso (cooldown) e uma faixa salarial diferente.')
            .setThumbnail("https://i.imgur.com/8N6G6wP.png");

        const options = [
            { label: 'Lixeiro', emoji: '🗑️', value: 'lixeiro', desc: 'Trabalho honesto, salário humilde.' },
            { label: 'Entregador de Pizza', emoji: '🍕', value: 'pizza', desc: 'Rápido e perigoso.' },
            { label: 'Frentista', emoji: '⛽', value: 'frentista', desc: 'Cheiro de gasolina o dia todo.' },
            { label: 'Caminhoneiro', emoji: '🚛', value: 'caminhoneiro', desc: 'Estradas longas, pagamentos altos.' },
            { label: 'Sedex', emoji: '📦', value: 'sedex', desc: 'Entregue pacotes (se não extraviar).' },
            { label: 'Pescador', emoji: '🎣', value: 'pescador', desc: 'Paciência é a chave do lucro.' },
            { label: 'TI', emoji: '💻', value: 'ti', desc: 'Resolva bugs e ganhe muito bem.' }
        ];

        const row = new ActionRowBuilder()
            .addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('menu_jobs')
                    .setPlaceholder('Selecione uma vaga disponível...')
                    .addOptions(options.map(o => ({
                        label: o.label,
                        value: o.value,
                        emoji: o.emoji,
                        description: o.desc
                    })))
            );

        await interaction.reply({ embeds: [embed], components: [row] });
        const msg = await interaction.fetchReply();

        const collector = msg.createMessageComponentCollector({ 
            filter: i => i.user.id === interaction.user.id, 
            idle: 60000 
        });

        collector.on('collect', async i => {
            if (i.isStringSelectMenu()) {
                const select = i.values[0];
                const jobInfo = getJobInfo(select);

                const detailEmbed = new EmbedBuilder()
                    .setTitle(`${jobInfo.emoji} Vaga de ${jobInfo.name}`)
                    .setColor("Blue")
                    .addFields(
                        { name: "🕒 Carga Horária (Cooldown)", value: jobInfo.cooldownText, inline: true },
                        { name: "💰 Salário Máximo", value: `R$ ${jobInfo.maxmoney}`, inline: true }
                    )
                    .setFooter({ text: "Clique no botão abaixo para assinar o contrato." });

                const btnRow = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId(`accept_${select}`)
                            .setLabel('Aceitar Emprego')
                            .setStyle(ButtonStyle.Success)
                            .setEmoji('✍️')
                    );

                await i.update({ embeds: [detailEmbed], components: [row, btnRow] });
            }

            if (i.isButton()) {
                const jobValue = i.customId.split("_")[1];
                
                // Verifica cooldown de troca de emprego (1 semana)
                const now = Date.now();
                if (userdb.cooldowns.trabalho > now) {
                     const calc = userdb.cooldowns.trabalho - now;
                     const { days, hours, minutes } = ms(calc);
                     return i.reply({ 
                         content: `🚫 Você só pode trocar de emprego a cada 7 dias.\nTempo restante: **${days}d ${hours}h ${minutes}m**`, 
                         ephemeral: true 
                     });
                }

                if (userdb.economia.trabalho.trampo === jobValue) {
                    return i.reply({ content: "🤨 Você já trabalha nisso!", ephemeral: true });
                }

                const jobInfo = getJobInfo(jobValue);

                userdb.cooldowns.trabalho = now + 604800000; // 7 dias
                userdb.economia.trabalho = {
                    maxmoney: jobInfo.maxmoneyInt,
                    trampo: jobValue,
                    cooldown: jobInfo.cooldownInt
                };
                
                await userdb.save();

                await i.update({ 
                    embeds: [new EmbedBuilder().setColor("Green").setTitle("🤝 Contratado!").setDescription(`Parabéns! Agora você é um **${jobInfo.name}**.\nUse \`/work\` para começar a trabalhar.`)], 
                    components: [] 
                });
                
                collector.stop();
            }
        });
    }
}

function getJobInfo(job) {
    switch (job) {
        case "lixeiro": return { name: "Lixeiro", emoji: "🗑️", cooldownText: "45m", maxmoney: "1.000", maxmoneyInt: 1000, cooldownInt: 2700000 };
        case "pizza": return { name: "Entregador de Pizza", emoji: "🍕", cooldownText: "1h 30m", maxmoney: "1.500", maxmoneyInt: 1500, cooldownInt: 5400000 };
        case "frentista": return { name: "Frentista", emoji: "⛽", cooldownText: "3h", maxmoney: "2.500", maxmoneyInt: 2500, cooldownInt: 10800000 };
        case "caminhoneiro": return { name: "Caminhoneiro", emoji: "🚛", cooldownText: "5h", maxmoney: "3.500", maxmoneyInt: 3500, cooldownInt: 18000000 };
        case "sedex": return { name: "Entregador Sedex", emoji: "📦", cooldownText: "7h", maxmoney: "6.000", maxmoneyInt: 6000, cooldownInt: 25200000 };
        case "pescador": return { name: "Pescador", emoji: "🎣", cooldownText: "9h", maxmoney: "8.500", maxmoneyInt: 8500, cooldownInt: 32400000 };
        case "ti": return { name: "Técnico de TI", emoji: "💻", cooldownText: "10h", maxmoney: "10.000", maxmoneyInt: 10000, cooldownInt: 36000000 };
        default: return { name: "Desempregado", emoji: "❌", cooldownText: "0", maxmoney: "0", maxmoneyInt: 0, cooldownInt: 0 };
    }
}

function ms(ms) {
  const seconds = ~~(ms/1000)
  const minutes = ~~(seconds/60)
  const hours = ~~(minutes/60)
  const days = ~~(hours/24)
  return { days, hours: hours%24, minutes: minutes%60, seconds: seconds%60 }
}
