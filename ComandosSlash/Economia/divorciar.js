const Discord = require("discord.js");

module.exports = {
    name: "divorciar",
    description: "Termine seu casamento (custará metade dos seus bens, brincadeira)",
    type: 'CHAT_INPUT',
    run: async (client, interaction) => {
        try {
            const userdb = await client.userdb.getOrCreate(interaction.user.id);

            // Verifica se é casado
            if (!userdb.economia.marry || !userdb.economia.marry.casado || !userdb.economia.marry.com) {
                return interaction.reply({ 
                    embeds: [new Discord.MessageEmbed().setColor("RED").setDescription("❌ Você não pode se divorciar se não for casado(a).")], 
                    ephemeral: true 
                });
            }

            const conjugeId = userdb.economia.marry.com;
            const conjuge = await client.users.fetch(conjugeId).catch(() => null);
            const nomeConjuge = conjuge ? conjuge.username : "Desconhecido";

            const row = new Discord.MessageActionRow()
                .addComponents(
                    new Discord.MessageButton().setCustomId('confirm_divorce').setLabel('Sim, quero o divórcio').setStyle('DANGER').setEmoji('💔'),
                    new Discord.MessageButton().setCustomId('cancel_divorce').setLabel('Não, mudei de ideia').setStyle('SECONDARY').setEmoji('🔙')
                );

            const embed = new Discord.MessageEmbed()
                .setTitle("💔 Divórcio")
                .setColor("DARK_RED")
                .setDescription(`Você tem certeza que deseja se divorciar de **${nomeConjuge}**?\nEssa ação é irreversível (até você pedir de novo).`)
                .setThumbnail("https://i.imgur.com/4J5h6X8.png");

            const msg = await interaction.reply({ embeds: [embed], components: [row], fetchReply: true });

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

                    const successEmbed = new Discord.MessageEmbed()
                        .setTitle("💔 Divórcio Concluído")
                        .setColor("GREY")
                        .setDescription(`Você se divorciou de **${nomeConjuge}**. Agora você está solteiro(a) na pista.`)
                        .setImage("https://media.giphy.com/media/26ufcVAp3AiJJsrmw/giphy.gif"); // GIF triste/liberdade

                    await i.update({ embeds: [successEmbed], components: [] });
                } else {
                    await i.update({ embeds: [new Discord.MessageEmbed().setColor("GREEN").setDescription("❤️ O amor venceu! Divórcio cancelado.")], components: [] });
                }
            });

            collector.on('end', collected => {
                if (collected.size === 0) {
                    interaction.editReply({ embeds: [new Discord.MessageEmbed().setColor("RED").setDescription("⏰ Tempo esgotado.")], components: [] }).catch(() => {});
                }
            });

        } catch (err) {
            console.error(err);
            interaction.reply({ content: "Erro ao processar divórcio.", ephemeral: true });
        }
    }
};
