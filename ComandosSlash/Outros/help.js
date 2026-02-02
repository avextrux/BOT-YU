const Discord = require("discord.js");
const fs = require("fs");

module.exports = {
    name: "help",
    description: "Ver a lista de comandos do bot de forma dinâmica",
    type: "CHAT_INPUT",
    run: async (client, interaction) => {
        try {
            const hasAdminPerm =
                interaction.member?.permissions?.has("ADMINISTRATOR") ||
                interaction.member?.permissions?.has("MANAGE_GUILD");

            const embed = new Discord.MessageEmbed()
                .setTitle('🤖 Central de Ajuda')
                .setColor("BLUE")
                .setDescription('Selecione uma categoria abaixo para ver os comandos disponíveis.')
                .setThumbnail(client.user.displayAvatarURL())
                .setFooter({ text: `Solicitado por ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() });

            // Ler categorias dinamicamente
            const categorias = fs.readdirSync("./ComandosSlash/");
            const ordemPreferida = [
                "Economia",
                "Diversao",
                "Interacao",
                "Utilidade",
                "Loja",
                "Moderacao",
                "Outros",
                "Admin",
            ];
            categorias.sort((a, b) => {
                const ia = ordemPreferida.findIndex((x) => x.toLowerCase() === a.toLowerCase());
                const ib = ordemPreferida.findIndex((x) => x.toLowerCase() === b.toLowerCase());
                const ra = ia === -1 ? 999 : ia;
                const rb = ib === -1 ? 999 : ib;
                if (ra !== rb) return ra - rb;
                return a.localeCompare(b, "pt-BR");
            });
            const options = [];

            categorias.forEach(categoria => {
                let emoji = '📁';
                if (categoria.toLowerCase() === 'economia') emoji = '🤑';
                if (categoria.toLowerCase() === 'outros') emoji = '🌐';
                if (categoria.toLowerCase() === 'utilidade') emoji = '🛠️';
                if (categoria.toLowerCase() === 'moderacao') emoji = '🛡️';
                if (categoria.toLowerCase() === 'diversao') emoji = '🎲';
                if (categoria.toLowerCase() === 'interacao') emoji = '🤝';
                if (categoria.toLowerCase() === 'loja') emoji = '🛒';
                if (categoria.toLowerCase() === 'admin') emoji = '👑';

                options.push({
                    label: categoria,
                    description: `Comandos da categoria ${categoria}`,
                    emoji: emoji,
                    value: categoria
                });
            });

            options.unshift({
                label: "Evento: Submundo (Mercado Negro x Polícia)",
                description: "Lore, regras e comandos principais do evento",
                emoji: "💣",
                value: "__EVENT_SUBWORLD__"
            });

            if (hasAdminPerm) {
                options.push({
                    label: "Evento (ADM)",
                    description: "Comandos do evento (apenas administração)",
                    emoji: "🎪",
                    value: "__EVENT_ADMIN__"
                });
                const hasAdminCategory = options.some((o) => String(o.value || "").toLowerCase() === "admin");
                if (!hasAdminCategory) {
                    options.push({
                        label: "ADM",
                        description: "Comandos administrativos (eleição/política/crises)",
                        emoji: "👑",
                        value: "__ADM__"
                    });
                }
            }

            const seen = new Set();
            const deduped = [];
            for (const opt of options) {
                const key = String(opt.value);
                if (seen.has(key)) continue;
                seen.add(key);
                deduped.push(opt);
            }

            const row = new Discord.MessageActionRow()
                .addComponents(
                    new Discord.MessageSelectMenu()
                        .setCustomId('menu_help')
                        .setPlaceholder('Selecione uma categoria...')
                        .addOptions(deduped)
                );

            const msg = await interaction.reply({ embeds: [embed], components: [row], fetchReply: true });

            const collector = msg.createMessageComponentCollector({ componentType: 'SELECT_MENU', idle: 60000 });

            collector.on('collect', async i => {
                if (i.user.id !== interaction.user.id) {
                    return i.reply({ content: `Apenas ${interaction.user} pode usar este menu.`, ephemeral: true });
                }

                const categoriaSelecionada = i.values[0];

                if (categoriaSelecionada === "__EVENT_SUBWORLD__") {
                    const eventEmbed = new Discord.MessageEmbed()
                        .setTitle("💣 Evento: Submundo — Mercado Negro x Polícia")
                        .setColor("DARK_BUT_NOT_BLACK")
                        .setDescription(
                            [
                                "O submundo virou arena. **NPCs** vendem mercadoria ilícita com preço dinâmico e a **Polícia Econômica** caça pistas, monta checkpoints e fecha casos.",
                                "",
                                "✅ Liberdade total: você pode ser criminoso, policial, ou alternar lados.",
                            ].join("\n")
                        )
                        .addFields(
                            {
                                name: "Criminoso (Mercado Negro)",
                                value: [
                                    "• `/mercadonegro vendedores`",
                                    "• `/mercadonegro item_comprar` / `/mercadonegro item_vender`",
                                    "• `/mercadonegro inventario`",
                                    "• `/mercadonegro ranking` / `/mercadonegro missoes`",
                                    "• `/faccao criar|entrar|territorios`",
                                ].join("\n"),
                                inline: false,
                            },
                            {
                                name: "Polícia",
                                value: [
                                    "• `/policia candidatar` / `/policia status`",
                                    "• `/policia patrulhar` / `/policia checkpoint`",
                                    "• `/policia casos` / `/policia caso_ver`",
                                    "• `/policia caso_investigar` / `/policia caso_capturar`",
                                    "• `/policia ranking` / `/policia missoes`",
                                ].join("\n"),
                                inline: false,
                            },
                            {
                                name: "Regras rápidas",
                                value: [
                                    "• Rivalidade e RP valem: alianças, propaganda e blefes são permitidos",
                                    "• Proibido: ameaças reais, doxxing, assédio e golpes fora do RP",
                                    "• Anti-cheat ativo: spam de ações pode bloquear temporariamente",
                                ].join("\n"),
                                inline: false,
                            }
                        )
                        .setFooter({ text: "Dica: admin configura anúncios com /mercadonegro configurar." });

                    return i.update({ embeds: [eventEmbed], components: [row] });
                }

                if (categoriaSelecionada === "__EVENT_ADMIN__") {
                    const canOpen =
                        i.member?.permissions?.has("ADMINISTRATOR") ||
                        i.member?.permissions?.has("MANAGE_GUILD");
                    if (!canOpen) {
                        return i.reply({ content: "❌ Apenas administradores podem abrir esta aba.", ephemeral: true });
                    }

                    const adminEventEmbed = new Discord.MessageEmbed()
                        .setTitle("🎪 Evento Submundo — Painel ADM")
                        .setColor("DARK_GOLD")
                        .setDescription("Comandos de administração do evento (visível apenas para ADM).")
                        .addFields(
                            {
                                name: "Configuração",
                                value: [
                                    "• `/mercadonegro configurar canal:#canal ping_everyone:true|false`",
                                    "• `/mercadonegro evento_ativar` / `/mercadonegro evento_desativar`",
                                    "• `/policia definir_chefe usuario:@X`",
                                ].join("\n"),
                                inline: false,
                            },
                            {
                                name: "Operação",
                                value: [
                                    "• Incentive rivalidade: checkpoints, patrulhas e casos",
                                    "• Use o tesouro para prêmios e recompensas",
                                    "• Atrações automáticas rolam (leilão relâmpago)",
                                ].join("\n"),
                                inline: false,
                            },
                            {
                                name: "Banco Central (tesouro)",
                                value: [
                                    "• `/bancocentral status`",
                                    "• `/bancocentral gerente_adicionar usuario:@X escopo:(...)`",
                                    "• `/bancocentral pagar usuario:@X valor:1000 motivo:...`",
                                ].join("\n"),
                                inline: false,
                            },
                            {
                                name: "Economia e regras",
                                value: [
                                    "• `/politica set` (presidente/admin)",
                                    "• `/crise iniciar|encerrar` (admin)",
                                ].join("\n"),
                                inline: false,
                            }
                        );

                    return i.update({ embeds: [adminEventEmbed], components: [row] });
                }

                if (categoriaSelecionada === "__ADM__") {
                    const canOpen =
                        i.member?.permissions?.has("ADMINISTRATOR") ||
                        i.member?.permissions?.has("MANAGE_GUILD");
                    if (!canOpen) {
                        return i.reply({ content: "❌ Apenas administradores podem abrir esta aba.", ephemeral: true });
                    }

                    const categoryEmbed = new Discord.MessageEmbed()
                        .setTitle(`👑 Comandos ADM`)
                        .setColor("RED")
                        .setDescription("Comandos administrativos de eleição, política e crises.")
                        .addFields(
                            { name: "/eleicao iniciar", value: "Inicia eleição (admin).", inline: true },
                            { name: "/eleicao encerrar", value: "Encerra eleição (admin).", inline: true },
                            { name: "/politica set", value: "Ajusta imposto/salário/subsídio (presidente/admin).", inline: true },
                            { name: "/crise iniciar", value: "Inicia crise global (admin).", inline: true },
                            { name: "/crise encerrar", value: "Encerra crise global (admin).", inline: true },
                            { name: "/policia definir_chefe", value: "Define chefe de polícia (admin).", inline: true }
                        );

                    return i.update({ embeds: [categoryEmbed], components: [row] });
                }

                const arquivos = fs.readdirSync(`./ComandosSlash/${categoriaSelecionada}/`).filter(file => file.endsWith(".js"));

                const categoryEmbed = new Discord.MessageEmbed()
                    .setTitle(`${options.find(o => o.value === categoriaSelecionada).emoji} Comandos de ${categoriaSelecionada}`)
                    .setColor("BLUE")
                    .setFooter({ text: `Total: ${arquivos.length} comandos` });

                const campos = arquivos.map(arquivo => {
                    const cmd = require(`../${categoriaSelecionada}/${arquivo}`);
                    return {
                        name: `/${cmd.name}`,
                        value: cmd.description || "Sem descrição",
                        inline: true
                    };
                });

                // Discord limita a 25 fields, vamos truncar se necessário ou apenas listar nomes se forem muitos
                if (campos.length <= 25) {
                    categoryEmbed.addFields(campos);
                } else {
                    const desc = campos.map(c => `**${c.name}**: ${c.value}`).join('\n');
                    categoryEmbed.setDescription(desc.substring(0, 4096));
                }

                await i.update({ embeds: [categoryEmbed], components: [row] });
            });

            collector.on('end', () => {
                const disabledRow = new Discord.MessageActionRow()
                    .addComponents(
                        new Discord.MessageSelectMenu()
                            .setCustomId('menu_help_disabled')
                            .setPlaceholder('Menu expirado')
                            .setDisabled(true)
                            .addOptions([{ label: 'Expirado', value: 'expired' }])
                    );
                interaction.editReply({ components: [disabledRow] }).catch(() => {});
            });

        } catch (err) {
            console.error(err);
            interaction.reply({ content: "Erro ao carregar menu de ajuda.", ephemeral: true });
        }
    }
};
