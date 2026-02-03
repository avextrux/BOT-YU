const Discord = require("discord.js");
const fs = require("fs");

module.exports = {
    name: "help",
    description: "Hub de ajuda e guias do servidor",
    type: "CHAT_INPUT",
    run: async (client, interaction) => {
        try {
            const hasAdminPerm =
                interaction.member?.permissions?.has("ADMINISTRATOR") ||
                interaction.member?.permissions?.has("MANAGE_GUILD");

            // --- PÁGINA INICIAL (HOME) ---
            const embedHome = new Discord.MessageEmbed()
                .setTitle('📚 Central de Ajuda & Guias')
                .setColor("BLURPLE")
                .setDescription(
                    `Seja bem-vindo à central de informações do servidor.\n\n` +
                    `**O que você procura hoje?**\n` +
                    `💣 **Evento Submundo**: Tudo sobre o RP de Facções vs Polícia.\n` +
                    `🤖 **Comandos Gerais**: Diversão, economia básica e utilidades.\n` +
                    `👑 **Administração**: Painel para staff.`
                )
                .setThumbnail(client.user.displayAvatarURL())
                .setFooter({ text: `Solicitado por ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() });

            const rowHome = new Discord.MessageActionRow().addComponents(
                new Discord.MessageButton()
                    .setCustomId('help_btn_event')
                    .setLabel('Evento Submundo')
                    .setEmoji('💣')
                    .setStyle('DANGER'),
                new Discord.MessageButton()
                    .setCustomId('help_btn_general')
                    .setLabel('Comandos Gerais')
                    .setEmoji('🤖')
                    .setStyle('PRIMARY'),
                new Discord.MessageButton()
                    .setCustomId('help_btn_admin')
                    .setLabel('Admin')
                    .setEmoji('👑')
                    .setStyle('SECONDARY')
                    .setDisabled(!hasAdminPerm)
            );

            const msg = await interaction.reply({ 
                embeds: [embedHome], 
                components: [rowHome], 
                fetchReply: true 
            });

            const collector = msg.createMessageComponentCollector({ idle: 120000 });

            collector.on('collect', async i => {
                if (i.user.id !== interaction.user.id) {
                    return i.reply({ content: `Use /help para abrir seu próprio menu.`, ephemeral: true });
                }

                // --- EVENTO SUBMUNDO ---
                if (i.customId === 'help_btn_event') {
                    const embedEvent = new Discord.MessageEmbed()
                        .setTitle("💣 Guia do Evento: Submundo")
                        .setColor("DARK_RED")
                        .setDescription(
                            "O **Submundo** é um evento de RP (Roleplay) e Economia onde duas forças colidem:\n" +
                            "O **Mercado Negro** (criminosos, facções) e a **Polícia**.\n\n" +
                            "**Como participar?**\n" +
                            "Escolha seu lado. Não é necessário registro formal, basta começar a usar os comandos do seu lado.\n\n" +
                            "**Principais Hubs (Use estes comandos!):**"
                        )
                        .addFields(
                            { 
                                name: "💀 Para Criminosos", 
                                value: "> `/faccao` - Crie sua org, domine territórios, venda drogas.\n> `/mercadonegro` - Compre armas, aceite missões, veja o ranking.", 
                                inline: false 
                            },
                            { 
                                name: "👮 Para Policiais", 
                                value: "> `/policia` - Aliste-se, patrulhe, investigue crimes e prenda criminosos.", 
                                inline: false 
                            },
                            {
                                name: "💰 Economia & Política",
                                value: "> `/bancocentral` - (Admin/Gerente) Tesouro do servidor.\n> `/eleicao` - Vote em representantes.",
                                inline: false
                            }
                        )
                        .setImage("https://media.discordapp.net/attachments/1327129759292559444/1336048039206256722/SUBMUNDO_BANNER.png?ex=67a11680&is=679fc500&hm=0a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p") // Placeholder visual se tiver
                        .setFooter({ text: "Use o botão 'Voltar' para o menu principal." });

                    const rowEvent = new Discord.MessageActionRow().addComponents(
                        new Discord.MessageButton().setCustomId('help_btn_home').setLabel('Voltar').setStyle('SECONDARY')
                    );
                    
                    return i.update({ embeds: [embedEvent], components: [rowEvent] });
                }

                // --- COMANDOS GERAIS (CATEGORIAS) ---
                if (i.customId === 'help_btn_general') {
                    // Ler categorias
                    const categorias = fs.readdirSync("./ComandosSlash/").filter(c => !["Admin", "Outros", "Economia"].includes(c)); 
                    // Nota: "Economia" tem muita coisa do evento, mas também tem 'atm', 'pay'. 
                    // Vamos incluir Economia mas filtrar comandos do evento depois se quiser, ou deixar tudo.
                    // O usuário quer "Geral" separado de "Evento".
                    
                    // Vamos criar um Select Menu para as categorias clássicas
                    const cats = ["Economia", "Diversao", "Interacao", "Utilidade", "Loja", "Moderacao"];
                    
                    const options = cats.map(cat => {
                        let emoji = '📁';
                        if (cat === 'Economia') emoji = '💵';
                        if (cat === 'Diversao') emoji = '🎲';
                        if (cat === 'Utilidade') emoji = '🛠️';
                        if (cat === 'Moderacao') emoji = '🛡️';
                        if (cat === 'Interacao') emoji = '🫂';
                        if (cat === 'Loja') emoji = '🛒';
                        
                        return {
                            label: cat,
                            description: `Comandos de ${cat}`,
                            value: `cat_${cat}`,
                            emoji: emoji
                        };
                    });

                    const rowSelect = new Discord.MessageActionRow().addComponents(
                        new Discord.MessageSelectMenu()
                            .setCustomId('help_select_general')
                            .setPlaceholder('Escolha uma categoria...')
                            .addOptions(options)
                    );
                    
                    const rowBack = new Discord.MessageActionRow().addComponents(
                        new Discord.MessageButton().setCustomId('help_btn_home').setLabel('Voltar').setStyle('SECONDARY')
                    );

                    const embedGen = new Discord.MessageEmbed()
                        .setTitle("🤖 Comandos Gerais")
                        .setColor("BLUE")
                        .setDescription("Selecione uma categoria abaixo para ver os comandos convencionais do bot.");

                    return i.update({ embeds: [embedGen], components: [rowSelect, rowBack] });
                }

                // --- ADMIN ---
                if (i.customId === 'help_btn_admin') {
                    if (!hasAdminPerm) return i.reply({ content: "Sem permissão.", ephemeral: true });

                    const embedAdmin = new Discord.MessageEmbed()
                        .setTitle("👑 Painel de Administração")
                        .setColor("GOLD")
                        .setDescription("Ferramentas para gestão do servidor e do evento.")
                        .addFields(
                            { name: "Evento", value: "`/bancocentral`, `/mercadonegro` (opções de admin), `/policia` (definir chefe).", inline: false },
                            { name: "Moderação", value: "`/ban`, `/kick`, `/clear`", inline: false },
                            { name: "Política", value: "`/crise`, `/eleicao`", inline: false }
                        );

                    const rowBack = new Discord.MessageActionRow().addComponents(
                        new Discord.MessageButton().setCustomId('help_btn_home').setLabel('Voltar').setStyle('SECONDARY')
                    );

                    return i.update({ embeds: [embedAdmin], components: [rowBack] });
                }

                // --- VOLTAR (HOME) ---
                if (i.customId === 'help_btn_home') {
                    return i.update({ embeds: [embedHome], components: [rowHome] });
                }

                // --- SELEÇÃO DE CATEGORIA ---
                if (i.isSelectMenu() && i.customId === 'help_select_general') {
                    const catName = i.values[0].replace('cat_', '');
                    
                    let arquivos = [];
                    try {
                        arquivos = fs.readdirSync(`./ComandosSlash/${catName}/`).filter(file => file.endsWith(".js"));
                    } catch (e) {
                        return i.reply({ content: "Categoria vazia ou não encontrada.", ephemeral: true });
                    }

                    const embedCat = new Discord.MessageEmbed()
                        .setTitle(`📂 Categoria: ${catName}`)
                        .setColor("BLUE")
                        .setFooter({ text: "Use o menu para trocar de categoria ou Voltar para o início." });

                    const campos = arquivos.map(arquivo => {
                        const cmd = require(`../${catName}/${arquivo}`);
                        return {
                            name: `/${cmd.name}`,
                            value: cmd.description || "Sem descrição",
                            inline: true
                        };
                    });

                    if (campos.length <= 25) {
                        embedCat.addFields(campos);
                    } else {
                        const desc = campos.map(c => `**${c.name}**: ${c.value}`).join('\n');
                        embedCat.setDescription(desc.substring(0, 4096));
                    }
                    
                    // Manter o menu de seleção e adicionar botão voltar
                    return i.update({ embeds: [embedCat] }); // Mantém componentes antigos (o select menu e o botão voltar)
                }
            });

            collector.on('end', () => {
                const disabledRow = new Discord.MessageActionRow()
                    .addComponents(
                        new Discord.MessageButton()
                            .setCustomId('expired')
                            .setLabel('Menu Expirado')
                            .setStyle('SECONDARY')
                            .setDisabled(true)
                    );
                interaction.editReply({ components: [disabledRow] }).catch(() => {});
            });

        } catch (err) {
            console.error(err);
            interaction.reply({ content: "Erro ao carregar menu de ajuda.", ephemeral: true });
        }
    }
};
