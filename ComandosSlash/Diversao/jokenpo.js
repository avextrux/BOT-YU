const Discord = require("../../Utils/djs");
const { replyOrEditFetch } = require("../../Utils/commandKit");

module.exports = {
    name: "jokenpo",
    description: "Jogue Pedra, Papel e Tesoura contra o bot",
    type: 'CHAT_INPUT',
    run: async (client, interaction) => {
        try {
            const embed = new Discord.MessageEmbed()
                .setTitle("✂️ Jokenpô")
                .setColor("BLUE")
                .setDescription("Escolha sua jogada abaixo:")
                .setFooter({ text: "Você tem 30 segundos para escolher." });

            const row = new Discord.ActionRowBuilder()
                .addComponents(
                    new Discord.ButtonBuilder().setCustomId('pedra').setLabel('Pedra').setStyle('SECONDARY').setEmoji('🪨'),
                    new Discord.ButtonBuilder().setCustomId('papel').setLabel('Papel').setStyle('SECONDARY').setEmoji('📄'),
                    new Discord.ButtonBuilder().setCustomId('tesoura').setLabel('Tesoura').setStyle('SECONDARY').setEmoji('✂️')
                );

            const msg = await replyOrEditFetch(interaction, { embeds: [embed], components: [row] });
            if (!msg) return;

            const collector = msg.createMessageComponentCollector({ 
                componentType: Discord.ComponentType.Button,
                filter: i => i.user.id === interaction.user.id, 
                time: 30000, 
                max: 1 
            });

            collector.on('collect', async i => {
                const jogadaUsuario = i.customId;
                const opcoes = ['pedra', 'papel', 'tesoura'];
                const jogadaBot = opcoes[Math.floor(Math.random() * 3)];

                let resultado;
                let cor;

                if (jogadaUsuario === jogadaBot) {
                    resultado = "Empate! 🤝";
                    cor = "YELLOW";
                } else if (
                    (jogadaUsuario === 'pedra' && jogadaBot === 'tesoura') ||
                    (jogadaUsuario === 'papel' && jogadaBot === 'pedra') ||
                    (jogadaUsuario === 'tesoura' && jogadaBot === 'papel')
                ) {
                    resultado = "Você ganhou! 🎉";
                    cor = "GREEN";
                } else {
                    resultado = "Eu ganhei! 🤖";
                    cor = "RED";
                }

                const resultEmbed = new Discord.MessageEmbed()
                    .setTitle("✂️ Jokenpô - Resultado")
                    .setColor(cor)
                    .addFields(
                        { name: "Você", value: `${emoji(jogadaUsuario)} ${capitalize(jogadaUsuario)}`, inline: true },
                        { name: "VS", value: "⚡", inline: true },
                        { name: "Bot", value: `${emoji(jogadaBot)} ${capitalize(jogadaBot)}`, inline: true }
                    )
                    .setDescription(`**${resultado}**`);

                await i.update({ embeds: [resultEmbed], components: [] });
            });

            collector.on('end', collected => {
                if (collected.size === 0) {
                    interaction.editReply({ embeds: [new Discord.MessageEmbed().setColor("RED").setDescription("⏰ Tempo esgotado.")], components: [] }).catch(() => {});
                }
            });

        } catch (err) {
            console.error(err);
            interaction.reply({ content: "Erro ao jogar Jokenpô.", ephemeral: true });
        }
    }
};

function capitalize(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
}

function emoji(s) {
    if (s === 'pedra') return '🪨';
    if (s === 'papel') return '📄';
    if (s === 'tesoura') return '✂️';
}
