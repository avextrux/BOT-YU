const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

module.exports = {
    name: "divorciar",
    description: "Termine seu casamento (custará metade dos seus bens, brincadeira)",
    type: 1, // CHAT_INPUT
    run: async (client, interaction) => {
        try {
            const userdb = await client.userdb.getOrCreate(interaction.user.id);

            // Verifica se é casado
            if (!userdb.economia.marry || !userdb.economia.marry.casado || !userdb.economia.marry.com) {
                return interaction.reply({ 
                    embeds: [new EmbedBuilder().setColor("Red").setDescription("❌ Você não pode se divorciar se não for casado(a).")], 
                    ephemeral: true 
                });
            }

            const conjugeId = userdb.economia.marry.com;
            const conjuge = await client.users.fetch(conjugeId).catch(() => null);
            const nomeConjuge = conjuge ? conjuge.username : "Desconhecido";

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder().setCustomId('confirm_divorce').setLabel('Sim, quero o divórcio').setStyle(ButtonStyle.Danger).setEmoji('💔'),
                    new ButtonBuilder().setCustomId('cancel_divorce').setLabel('Não, mudei de ideia').setStyle(ButtonStyle.Secondary).setEmoji('🔙')
                );

            const embed = new EmbedBuilder()
                .setTitle("💔 Divórcio")
                .setColor("DarkRed")
                .setDescription(`Você tem certeza que deseja se divorciar de **${nomeConjuge}**?\nEssa ação é irreversível (até você pedir de novo).`)
                .setThumbnail("https://i.imgur.com/4J5h6X8.png");

            await interaction.reply({ embeds: [embed], components: [row] });
            const msg = await interaction.fetchReply();

            const collector = msg.createMessageComponentCollector({ 
                filter: i => i.user.id === interaction.user.id, 
                time: 30000, 
                max: 1 
            });

            collector.on('collect', async i => {
                if (i.customId === 'confirm_divorce') {
                    // Atualiza quem pediu
                    userdb.economia.marry = { casado: false, com: null, since: null };
                    await userdb.save();

                    // Atualiza o ex-cônjuge
                    const conjugeDb = await client.userdb.findOne({ userID: conjugeId });
                    if (conjugeDb) {
                        conjugeDb.economia.marry = { casado: false, com: null, since: null };
                        await conjugeDb.save();
                    }

                    const successEmbed = new EmbedBuilder()
                        .setTitle("💔 Divórcio Concluído")
                        .setColor("Grey")
                        .setDescription(`Você se divorciou de **${nomeConjuge}**. Agora você está solteiro(a) na pista.`)
                        .setImage("https://media.giphy.com/media/26ufcVAp3AiJJsrmw/giphy.gif"); // GIF triste/liberdade

                    await i.update({ embeds: [successEmbed], components: [] });
                } else {
                    await i.update({ embeds: [new EmbedBuilder().setColor("Green").setDescription("❤️ O amor venceu! Divórcio cancelado.")], components: [] });
                }
            });

            collector.on('end', collected => {
                if (collected.size === 0) {
                    interaction.editReply({ embeds: [new EmbedBuilder().setColor("Red").setDescription("⏰ Tempo esgotado.")], components: [] }).catch(() => {});
                }
            });

        } catch (err) {
            console.error(err);
            interaction.reply({ content: "Erro ao processar divórcio.", ephemeral: true });
        }
    }
};
