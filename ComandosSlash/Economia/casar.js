const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require("discord.js");
const { getRandomGifUrl } = require("../../Utils/giphy");

module.exports = {
    name: "casar",
    description: "Proponha casamento a alguém especial",
    type: 'CHAT_INPUT',
    options: [
        {
            name: "usuario",
            description: "A pessoa com quem você quer casar",
            type: "USER",
            required: true
        },
    ],
    run: async (client, interaction) => {
        try {
            const user = interaction.options.getUser("usuario");

            if (!client._pendingMarry) client._pendingMarry = new Map();
            const now = Date.now();
            const authorPending = client._pendingMarry.get(interaction.user.id);
            const targetPending = client._pendingMarry.get(user.id);
            if ((authorPending && authorPending > now) || (targetPending && targetPending > now)) {
                return interaction.reply({ content: "❌ Já existe um pedido de casamento pendente para um dos envolvidos. Aguarde terminar.", ephemeral: true });
            }

            // Validações
            if (interaction.user.id === user.id) {
                return interaction.reply({ 
                    embeds: [new EmbedBuilder().setColor("Red").setDescription("❌ Você não pode se casar consigo mesmo (narcisismo tem limite!).")], 
                    ephemeral: true 
                });
            }

            if (user.bot) {
                return interaction.reply({ 
                    embeds: [new EmbedBuilder().setColor("Red").setDescription("❌ Eu sei que bots são atraentes, mas você não pode se casar com um.")], 
                    ephemeral: true 
                });
            }

            // Busca dados dos usuários
            const authorDb = await client.userdb.getOrCreate(interaction.user.id);
            const targetDb = await client.userdb.getOrCreate(user.id);

            // Verifica se já são casados
            if (authorDb.economia.marry && authorDb.economia.marry.casado) {
                const conjuge = await client.users.fetch(authorDb.economia.marry.com).catch(() => null);
                const nomeConjuge = conjuge ? conjuge.tag : "alguém";
                return interaction.reply({ 
                    embeds: [new EmbedBuilder().setColor("Red").setDescription(`❌ Você já é casado(a) com **${nomeConjuge}**! Divorcie-se primeiro.`)], 
                    ephemeral: true 
                });
            }

            if (targetDb.economia.marry && targetDb.economia.marry.casado) {
                return interaction.reply({ 
                    embeds: [new EmbedBuilder().setColor("Red").setDescription(`❌ **${user.tag}** já é casado(a). Respeite o relacionamento alheio!`)], 
                    ephemeral: true 
                });
            }

            await interaction.deferReply();

            const expiresAt = Date.now() + 60000;
            client._pendingMarry.set(interaction.user.id, expiresAt);
            client._pendingMarry.set(user.id, expiresAt);

            const proposalGif = await getRandomGifUrl("anime marriage proposal", { rating: "pg-13" }).catch(() => null);
            const weddingGif = await getRandomGifUrl("anime wedding kiss", { rating: "pg-13" }).catch(() => null);
            const fallbackProposalGif = "https://media.giphy.com/media/3ohs4BSacFKI7A717y/giphy.gif";
            const fallbackWeddingGif = "https://media.giphy.com/media/26ufcVAp3AiJJsrmw/giphy.gif";

            // Pedido de Casamento
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder().setCustomId('accept_marry').setLabel('Aceitar').setStyle(ButtonStyle.Success).setEmoji('💍'),
                    new ButtonBuilder().setCustomId('deny_marry').setLabel('Recusar').setStyle(ButtonStyle.Danger).setEmoji('💔')
                );

            const embed = new EmbedBuilder()
                .setTitle("💍 Pedido de Casamento")
                .setColor("Fuchsia")
                .setDescription(`**${user}**, **${interaction.user}** está pedindo a sua mão em casamento!\n\nVocê aceita viver feliz para sempre (ou até o divórcio)?`)
                .setFooter({ text: "Responda em 60 segundos." });

            embed.setImage(proposalGif || fallbackProposalGif);

            await interaction.editReply({ content: `${user}`, embeds: [embed], components: [row] });
            const msg = await interaction.fetchReply();

            const collector = msg.createMessageComponentCollector({ 
                componentType: ComponentType.Button,
                filter: i => i.user.id === user.id, 
                time: 60000, 
                max: 1 
            });

            collector.on('collect', async i => {
                if (i.customId === 'accept_marry') {
                    await i.deferUpdate();
                    // Atualiza DB Author
                    const since = Date.now();
                    authorDb.economia.marry = { casado: true, com: user.id, since };
                    await authorDb.save();

                    // Atualiza DB Target
                    targetDb.economia.marry = { casado: true, com: interaction.user.id, since };
                    await targetDb.save();

                    const successEmbed = new EmbedBuilder()
                        .setTitle("💒 Casados! 🎉")
                        .setColor("LuminousVividPink")
                        .setDescription(`Parabéns! **${interaction.user}** e **${user}** agora estão oficialmente casados! ❤️`)
                        .setTimestamp();

                    successEmbed.setImage(weddingGif || proposalGif || fallbackWeddingGif);

                    await interaction.editReply({ embeds: [successEmbed], components: [] });
                } else {
                    await i.deferUpdate();
                    const sadEmbed = new EmbedBuilder()
                        .setTitle("💔 Pedido Recusado")
                        .setColor("DarkRed")
                        .setDescription(`**${user}** recusou o pedido de **${interaction.user}**... Soldado abatido.`)
                        .setTimestamp();
                    
                    await interaction.editReply({ embeds: [sadEmbed], components: [] });
                }
            });

            collector.on('end', collected => {
                client._pendingMarry.delete(interaction.user.id);
                client._pendingMarry.delete(user.id);
                if (collected.size === 0) {
                    interaction.editReply({ embeds: [new EmbedBuilder().setColor("Red").setDescription("⏰ O pedido expirou. Talvez na próxima.")], components: [] }).catch(() => {});
                }
            });

        } catch (err) {
            console.error(err);
            if (interaction.deferred || interaction.replied) {
                interaction.editReply({ content: "Erro ao processar pedido de casamento." }).catch(() => {});
            } else {
                interaction.reply({ content: "Erro ao processar pedido de casamento.", ephemeral: true }).catch(() => {});
            }
        }
    }
};
