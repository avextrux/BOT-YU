const Discord = require("discord.js");

module.exports = {
    name: "config_evento",
    description: "Hub de Configuração do Evento Submundo (ADM)",
    type: "CHAT_INPUT",
    run: async (client, interaction) => {
        try {
            if (!interaction.member.permissions.has("ADMINISTRATOR") && !interaction.member.permissions.has("MANAGE_GUILD")) {
                return interaction.reply({ content: "❌ Apenas administradores.", ephemeral: true });
            }

            const getSettings = async () => {
                const g = await client.blackMarketGuilddb.getOrCreate(interaction.guildId);
                if (!g.config) g.config = {};
                if (!g.config.eventProbs) g.config.eventProbs = { discount: 0.05, raid: 0.05, shortage: 0.05, surplus: 0.05 };
                if (!g.announce) g.announce = { channelId: null, pingEveryone: false };
                return g;
            };

            const g = await getSettings();

            const menu = new Discord.MessageSelectMenu()
                .setCustomId("config_evento_menu")
                .setPlaceholder("Selecione uma categoria de configuração...")
                .addOptions([
                    { label: "Geral", value: "general", description: "Ativar/Desativar, Canal de Anúncios", emoji: "⚙️" },
                    { label: "Probabilidades de Eventos", value: "probs", description: "Ajustar chance de Raid, Promoção, etc.", emoji: "🎲" },
                    { label: "Economia & Heat", value: "economy", description: "Decaimento de Heat, Patrulha Base", emoji: "💰" },
                ]);

            const row = new Discord.MessageActionRow().addComponents(menu);

            const embed = new Discord.MessageEmbed()
                .setTitle("🛠️ Configuração: Evento Submundo")
                .setColor("DARK_BUT_NOT_BLACK")
                .setDescription("Use o menu abaixo para configurar o evento.")
                .addFields(
                    { name: "Estado", value: g.active ? "✅ Ativo" : "❌ Desativado", inline: true },
                    { name: "Canal", value: g.announce?.channelId ? `<#${g.announce.channelId}>` : "Não definido", inline: true },
                    { name: "Ping @everyone", value: g.announce?.pingEveryone ? "Sim" : "Não", inline: true }
                );

            const msg = await interaction.reply({ embeds: [embed], components: [row], fetchReply: true, ephemeral: true });

            const collector = msg.createMessageComponentCollector({ componentType: 'SELECT_MENU', idle: 120000 });

            collector.on('collect', async i => {
                if (i.user.id !== interaction.user.id) return i.reply({ content: "Menu pessoal.", ephemeral: true });
                const action = i.values[0];
                const g = await getSettings();

                if (action === "general") {
                    const rowGen = new Discord.MessageActionRow().addComponents(
                        new Discord.MessageButton().setCustomId("cfg_toggle_active").setLabel(g.active ? "Desativar Evento" : "Ativar Evento").setStyle(g.active ? "DANGER" : "SUCCESS"),
                        new Discord.MessageButton().setCustomId("cfg_toggle_ping").setLabel("Toggle @everyone").setStyle("SECONDARY"),
                        new Discord.MessageButton().setCustomId("cfg_set_channel").setLabel("Definir Canal (ID)").setStyle("PRIMARY")
                    );
                    return i.update({ content: "**Configuração Geral**", components: [rowGen] });
                }

                if (action === "probs") {
                    const p = g.config.eventProbs;
                    const desc = [
                        `**Desconto (Promoção):** ${(p.discount * 100).toFixed(1)}%`,
                        `**Raid Policial:** ${(p.raid * 100).toFixed(1)}%`,
                        `**Escassez (Item some):** ${(p.shortage * 100).toFixed(1)}%`,
                        `**Superávit (Item barato):** ${(p.surplus * 100).toFixed(1)}%`
                    ].join("\n");

                    const rowProbs = new Discord.MessageActionRow().addComponents(
                        new Discord.MessageButton().setCustomId("cfg_edit_probs").setLabel("Editar Probabilidades").setStyle("PRIMARY")
                    );

                    const e = new Discord.MessageEmbed()
                        .setTitle("🎲 Probabilidades de Eventos (por Tick)")
                        .setColor("BLUE")
                        .setDescription(desc + "\n\n*O Tick ocorre a cada 1 minuto.*");
                    
                    return i.update({ embeds: [e], components: [row, rowProbs] });
                }

                if (action === "economy") {
                    const c = g.config;
                    const desc = [
                        `**Heat Decay (por hora):** ${c.heatDecayPerHour}`,
                        `**Patrulha Base:** ${(c.patrolBaseChance * 100).toFixed(1)}%`,
                        `**Bônus Checkpoint:** ${(c.checkpointBonus * 100).toFixed(1)}%`
                    ].join("\n");

                    const rowEco = new Discord.MessageActionRow().addComponents(
                        new Discord.MessageButton().setCustomId("cfg_edit_eco").setLabel("Editar Valores").setStyle("PRIMARY")
                    );

                    const e = new Discord.MessageEmbed()
                        .setTitle("💰 Configuração Econômica")
                        .setColor("GREEN")
                        .setDescription(desc);
                    
                    return i.update({ embeds: [e], components: [row, rowEco] });
                }
            });

            // Button Collector for sub-actions
            const btnCollector = msg.createMessageComponentCollector({ componentType: 'BUTTON', idle: 120000 });
            
            btnCollector.on('collect', async i => {
                if (i.user.id !== interaction.user.id) return i.reply({ content: "Menu pessoal.", ephemeral: true });
                const g = await getSettings();

                if (i.customId === "cfg_toggle_active") {
                    g.active = !g.active;
                    await g.save();
                    return i.reply({ content: `✅ Evento ${g.active ? "ATIVADO" : "DESATIVADO"}.`, ephemeral: true });
                }

                if (i.customId === "cfg_toggle_ping") {
                    g.announce.pingEveryone = !g.announce.pingEveryone;
                    await g.save();
                    return i.reply({ content: `✅ Ping @everyone: ${g.announce.pingEveryone ? "ON" : "OFF"}.`, ephemeral: true });
                }

                if (i.customId === "cfg_set_channel") {
                    const modal = new Discord.Modal().setCustomId("cfg_modal_channel").setTitle("Definir Canal");
                    const input = new Discord.TextInputComponent().setCustomId("channel_id").setLabel("ID do Canal").setStyle("SHORT").setRequired(true);
                    modal.addComponents(new Discord.MessageActionRow().addComponents(input));
                    await i.showModal(modal);
                }

                if (i.customId === "cfg_edit_probs") {
                    const modal = new Discord.Modal().setCustomId("cfg_modal_probs").setTitle("Probabilidades (0-100)");
                    const p = g.config.eventProbs;
                    
                    modal.addComponents(
                        new Discord.MessageActionRow().addComponents(new Discord.TextInputComponent().setCustomId("prob_discount").setLabel("Desconto %").setValue((p.discount*100).toString()).setStyle("SHORT")),
                        new Discord.MessageActionRow().addComponents(new Discord.TextInputComponent().setCustomId("prob_raid").setLabel("Raid %").setValue((p.raid*100).toString()).setStyle("SHORT")),
                        new Discord.MessageActionRow().addComponents(new Discord.TextInputComponent().setCustomId("prob_shortage").setLabel("Escassez %").setValue((p.shortage*100).toString()).setStyle("SHORT")),
                        new Discord.MessageActionRow().addComponents(new Discord.TextInputComponent().setCustomId("prob_surplus").setLabel("Superávit %").setValue((p.surplus*100).toString()).setStyle("SHORT"))
                    );
                    await i.showModal(modal);
                }

                if (i.customId === "cfg_edit_eco") {
                    const modal = new Discord.Modal().setCustomId("cfg_modal_eco").setTitle("Economia");
                    const c = g.config;
                    
                    modal.addComponents(
                        new Discord.MessageActionRow().addComponents(new Discord.TextInputComponent().setCustomId("eco_decay").setLabel("Heat Decay / Hora").setValue(c.heatDecayPerHour.toString()).setStyle("SHORT")),
                        new Discord.MessageActionRow().addComponents(new Discord.TextInputComponent().setCustomId("eco_patrol").setLabel("Patrulha Base %").setValue((c.patrolBaseChance*100).toString()).setStyle("SHORT"))
                    );
                    await i.showModal(modal);
                }
            });

        } catch (err) {
            console.error(err);
            interaction.reply({ content: "Erro na configuração.", ephemeral: true });
        }
    }
};
