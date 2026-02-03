const Discord = require("discord.js");

module.exports = {
    name: "config_evento",
    description: "Hub de Configuração do Evento Submundo (ADM)",
    type: "CHAT_INPUT",
    hubActions: [
        "Geral — ativar/desativar, canal e @everyone",
        "Probabilidades — raid/escassez/superávit/leilão",
        "Economia & Heat — decay, patrulha base, bônus checkpoint",
    ],
    run: async (client, interaction) => {
        try {
            if (!interaction.member.permissions.has("ADMINISTRATOR") && !interaction.member.permissions.has("MANAGE_GUILD")) {
                return interaction.reply({ content: "❌ Apenas administradores.", ephemeral: true });
            }

            const getSettings = async () => {
                const g = await client.blackMarketGuilddb.getOrCreate(interaction.guildId);
                if (!g.config) g.config = {};
                if (!g.config.eventProbs) g.config.eventProbs = { discount: 0.05, raid: 0.05, shortage: 0.05, surplus: 0.05 };
                if (!g.config.eventCooldownMs) g.config.eventCooldownMs = 10 * 60 * 1000;
                if (!g.config.eventCooldownUntil) g.config.eventCooldownUntil = 0;
                if (!g.config.heatDecayPerHour) g.config.heatDecayPerHour = 4;
                if (!g.config.patrolBaseChance) g.config.patrolBaseChance = 0.08;
                if (!g.config.checkpointBonus) g.config.checkpointBonus = 0.12;
                if (!g.config.activityRequirements) g.config.activityRequirements = { level2: 50, level3: 200, level4: 500 };
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
                    { label: "Desafios", value: "activity", description: "Requisitos de mensagens para itens por nível", emoji: "🏁" },
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
                        `**Bônus Checkpoint:** ${(c.checkpointBonus * 100).toFixed(1)}%`,
                        `**Cooldown de Eventos:** ${Math.max(0, Math.floor((c.eventCooldownMs || 0) / 60000))} min`
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

                if (action === "activity") {
                    const a = g.config.activityRequirements || { level2: 50, level3: 200, level4: 500 };
                    const desc = [
                        `**Nível 2+:** ${Math.max(0, Math.floor(a.level2 || 0))} mensagens`,
                        `**Nível 3+:** ${Math.max(0, Math.floor(a.level3 || 0))} mensagens`,
                        `**Nível 4+:** ${Math.max(0, Math.floor(a.level4 || 0))} mensagens`,
                    ].join("\n");

                    const rowAct = new Discord.MessageActionRow().addComponents(
                        new Discord.MessageButton().setCustomId("cfg_edit_activity").setLabel("Editar Desafios").setStyle("PRIMARY")
                    );

                    const e = new Discord.MessageEmbed()
                        .setTitle("🏁 Desafios de Atividade")
                        .setColor("DARK_AQUA")
                        .setDescription(desc);

                    return i.update({ embeds: [e], components: [row, rowAct] });
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
                        new Discord.MessageActionRow().addComponents(new Discord.TextInputComponent().setCustomId("eco_patrol").setLabel("Patrulha Base %").setValue((c.patrolBaseChance*100).toString()).setStyle("SHORT")),
                        new Discord.MessageActionRow().addComponents(new Discord.TextInputComponent().setCustomId("eco_cooldown_min").setLabel("Cooldown de Eventos (min)").setValue(String(Math.max(0, Math.floor((c.eventCooldownMs || 0) / 60000)))).setStyle("SHORT"))
                    );
                    await i.showModal(modal);
                }

                if (i.customId === "cfg_edit_activity") {
                    const modal = new Discord.Modal().setCustomId("cfg_modal_activity").setTitle("Desafios");
                    const a = g.config.activityRequirements || { level2: 50, level3: 200, level4: 500 };

                    modal.addComponents(
                        new Discord.MessageActionRow().addComponents(new Discord.TextInputComponent().setCustomId("act_level2").setLabel("Nível 2+ (mensagens)").setValue(String(Math.max(0, Math.floor(a.level2 || 0)))).setStyle("SHORT")),
                        new Discord.MessageActionRow().addComponents(new Discord.TextInputComponent().setCustomId("act_level3").setLabel("Nível 3+ (mensagens)").setValue(String(Math.max(0, Math.floor(a.level3 || 0)))).setStyle("SHORT")),
                        new Discord.MessageActionRow().addComponents(new Discord.TextInputComponent().setCustomId("act_level4").setLabel("Nível 4+ (mensagens)").setValue(String(Math.max(0, Math.floor(a.level4 || 0)))).setStyle("SHORT"))
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
