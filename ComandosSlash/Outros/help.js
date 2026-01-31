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
            const options = [];

            categorias.forEach(categoria => {
                let emoji = '📁';
                if (categoria.toLowerCase() === 'economia') emoji = '🤑';
                if (categoria.toLowerCase() === 'outros') emoji = '🌐';
                if (categoria.toLowerCase() === 'utilidade') emoji = '🛠️';
                if (categoria.toLowerCase() === 'moderacao') emoji = '🛡️';

                options.push({
                    label: categoria,
                    description: `Comandos da categoria ${categoria}`,
                    emoji: emoji,
                    value: categoria
                });
            });

            if (hasAdminPerm) {
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
