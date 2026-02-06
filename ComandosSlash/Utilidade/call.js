const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits } = require("discord.js");

module.exports = {
    name: "call",
    description: "Inicie uma chamada privada temporária com alguém",
    type: 1, // CHAT_INPUT
    options: [
        {
            name: "usuario",
            description: "Usuário para ligar",
            type: 6, // USER
            required: true
        }
    ],
    run: async (client, interaction) => {
        try {
            const target = interaction.options.getUser("usuario");

            // Validações
            if (target.id === interaction.user.id) {
                return interaction.reply({ content: "❌ Você não pode ligar para si mesmo.", ephemeral: true });
            }
            if (target.bot) {
                return interaction.reply({ content: "❌ Você não pode ligar para um bot.", ephemeral: true });
            }

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder().setCustomId('accept_call').setLabel('Atender').setStyle(ButtonStyle.Success).setEmoji('📞'),
                    new ButtonBuilder().setCustomId('decline_call').setLabel('Recusar').setStyle(ButtonStyle.Danger).setEmoji('📵')
                );

            const embed = new EmbedBuilder()
                .setTitle("📞 Recebendo Chamada...")
                .setDescription(`**${interaction.user.tag}** está te ligando!\n\nSe aceitar, um chat privado temporário será criado por **5 minutos**.`)
                .setColor("Blue")
                .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
                .setFooter({ text: "A chamada expira em 60 segundos." });

            // Envia a mensagem mencionando o alvo
            await interaction.reply({ content: `${target}`, embeds: [embed], components: [row] });
            const msg = await interaction.fetchReply();

            // Cria o coletor apenas para o usuário alvo
            const collector = msg.createMessageComponentCollector({
                filter: i => i.user.id === target.id,
                time: 60000,
                max: 1
            });

            collector.on('collect', async i => {
                if (i.customId === 'accept_call') {
                    await i.deferUpdate(); // Evita erro de interação falhou

                    // Cria o canal temporário
                    const guild = interaction.guild;
                    const channelName = `call-${interaction.user.username}-${target.username}`.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 25);

                    try {
                        const tempChannel = await guild.channels.create({
                            name: channelName,
                            type: ChannelType.GuildText,
                            permissionOverwrites: [
                                {
                                    id: guild.id, // @everyone
                                    deny: [PermissionFlagsBits.ViewChannel]
                                },
                                {
                                    id: interaction.user.id, // Quem ligou
                                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles]
                                },
                                {
                                    id: target.id, // Quem atendeu
                                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles]
                                },
                                {
                                    id: client.user.id, // Bot
                                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels]
                                }
                            ],
                            reason: 'Call privada temporária'
                        });

                        // Atualiza a mensagem original
                        await interaction.editReply({ 
                            content: `✅ **Chamada Aceita!**\nO chat privado foi criado: ${tempChannel}\nEle será deletado automaticamente em 5 minutos.`, 
                            embeds: [], 
                            components: [] 
                        });

                        // Manda mensagem no canal novo
                        const welcomeEmbed = new EmbedBuilder()
                            .setTitle("📞 Call Privada Iniciada")
                            .setDescription(`Este chat é privado entre **${interaction.user}** e **${target}**.\n\n⏳ **Tempo restante:** 5 minutos.`)
                            .setColor("Green");

                        await tempChannel.send({ content: `${interaction.user} ${target}`, embeds: [welcomeEmbed] });

                        // Temporizador para deletar o canal
                        setTimeout(async () => {
                            if (tempChannel && !tempChannel.deleted) {
                                await tempChannel.delete('Tempo da call expirado').catch(() => {});
                            }
                        }, 5 * 60 * 1000); // 5 minutos

                        // Aviso de 1 minuto restante
                        setTimeout(async () => {
                            if (tempChannel && !tempChannel.deleted) {
                                await tempChannel.send("⚠️ **Atenção:** Este chat será apagado em 1 minuto!").catch(() => {});
                            }
                        }, 4 * 60 * 1000);

                    } catch (err) {
                        console.error("Erro ao criar canal de call:", err);
                        await interaction.followUp({ content: "❌ Erro ao criar o canal privado. Verifique minhas permissões.", ephemeral: true });
                    }

                } else if (i.customId === 'decline_call') {
                    await i.update({ 
                        content: `❌ **Chamada Recusada.**\n${target} não pode falar agora.`, 
                        embeds: [], 
                        components: [] 
                    });
                }
            });

            collector.on('end', collected => {
                if (collected.size === 0) {
                    interaction.editReply({ 
                        content: "⏰ **Chamada Perdida.**\nNinguém atendeu a tempo.", 
                        embeds: [], 
                        components: [] 
                    }).catch(() => {});
                }
            });

        } catch (err) {
            console.error(err);
            interaction.reply({ content: "Erro ao processar a chamada.", ephemeral: true });
        }
    }
};
