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
                label: "Evento: Grande Eleição",
                description: "Como funciona, duração e comandos principais",
                emoji: "🗳️",
                value: "__EVENT_ELECTION__"
            });

            if (hasAdminPerm) {
                options.push({
                    label: "Evento (ADM)",
                    description: "Comandos do evento (apenas administração)",
                    emoji: "🎪",
                    value: "__EVENT_ADMIN__"
                });
                options.push({
                    label: "ADM",
                    description: "Comandos administrativos (eleição/política/crises)",
                    emoji: "👑",
                    value: "__ADM__"
                });
            }

            const row = new Discord.MessageActionRow()
                .addComponents(
                    new Discord.MessageSelectMenu()
                        .setCustomId('menu_help')
                        .setPlaceholder('Selecione uma categoria...')
                        .addOptions(options)
                );

            const msg = await interaction.reply({ embeds: [embed], components: [row], fetchReply: true });

            const collector = msg.createMessageComponentCollector({ componentType: 'SELECT_MENU', idle: 60000 });

            collector.on('collect', async i => {
                if (i.user.id !== interaction.user.id) {
                    return i.reply({ content: `Apenas ${interaction.user} pode usar este menu.`, ephemeral: true });
                }

                const categoriaSelecionada = i.values[0];

                if (categoriaSelecionada === "__EVENT_ELECTION__") {
                    const now = Date.now();
                    const endsAt = now + 14 * 24 * 60 * 60 * 1000;
                    const eventEmbed = new Discord.MessageEmbed()
                        .setTitle("🗳️ Grande Eleição — Evento do Servidor (2 semanas)")
                        .setColor("GOLD")
                        .setDescription(
                            [
                                "A Grande Eleição define o **Presidente Econômico** do servidor.",
                                "Durante o evento, os candidatos fazem campanha e a comunidade vota.",
                                "",
                                `⏳ Duração sugerida: **2 semanas** (ex.: de agora até <t:${Math.floor(endsAt / 1000)}:f>).`,
                            ].join("\n")
                        )
                        .addFields(
                            {
                                name: "Como participar",
                                value: [
                                    "• `/eleicao candidatar` para entrar na disputa",
                                    "• `/eleicao votar usuario:@candidato` para votar (1 voto por pessoa)",
                                    "• `/eleicao status` para ver candidatos e tempo restante",
                                    "• `/politica status` para ver o presidente e regras econômicas atuais",
                                ].join("\n"),
                                inline: false,
                            },
                            {
                                name: "Regras básicas",
                                value: [
                                    "• Campanha respeitosa (sem spam/assédio)",
                                    "• Sem compra de votos / golpes / ameaças",
                                    "• Quebrou regra: sujeito a punição da moderação",
                                ].join("\n"),
                                inline: false,
                            }
                        )
                        .setFooter({ text: "Dica: admin pode anunciar o evento no canal do servidor." });

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
                        .setTitle("🎪 Grande Eleição — Painel ADM")
                        .setColor("DARK_GOLD")
                        .setDescription("Comandos de administração do evento (visível apenas para ADM).")
                        .addFields(
                            {
                                name: "Configuração",
                                value: [
                                    "• `/eleicao configurar canal:#canal ping_everyone:true|false`",
                                    "• `/eleicao anunciar_evento canal:#canal ping_everyone:true|false`",
                                    "• `/eleicao configurar_voteshop ativado:true|false preco_base:500 incremento:50`",
                                ].join("\n"),
                                inline: false,
                            },
                            {
                                name: "Operação",
                                value: [
                                    "• `/eleicao iniciar duracao_min:20160` (2 semanas) ou mais",
                                    "• `/eleicao encerrar` (fecha e anuncia resultado)",
                                    "• `/eleicao forcar_atracao` (promoção relâmpago)",
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
                                name: "Contexto econômico",
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
