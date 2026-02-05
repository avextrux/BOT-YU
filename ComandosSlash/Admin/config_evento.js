const Discord = require("discord.js");
const { replyOrEdit } = require("../../Utils/commandKit");
const { applyWDAFooter } = require("../../Utils/embeds");

module.exports = {
    name: "config_evento",
    description: "Hub de Configuração do Evento Submundo (ADM)",
    type: "CHAT_INPUT",
    autoDefer: { ephemeral: true },
    hubActions: [
        "Geral — ativar/desativar, canal e @everyone",
        "Probabilidades — raid/escassez/superávit/leilão/checkpoints",
        "Economia & Heat — decay, patrulha base, bônus checkpoint",
        "Reputação — loja de reputação do submundo",
    ],
    run: async (client, interaction) => {
        try {
            if (!interaction.member.permissions.has("ADMINISTRATOR") && !interaction.member.permissions.has("MANAGE_GUILD")) {
                return replyOrEdit(interaction, { content: "❌ Apenas administradores.", ephemeral: true });
            }

            const safe = async (p) => {
                try {
                    return await p;
                } catch (e) {
                    if (e?.code === 10062 || e?.code === 40060) return null;
                    throw e;
                }
            };

            const getSettings = async () => {
                const g = await client.blackMarketGuilddb.getOrCreate(interaction.guildId);
                if (!g.config) g.config = {};
                if (!g.config.eventProbs) g.config.eventProbs = { discount: 0.05, raid: 0.05, shortage: 0.05, surplus: 0.05, checkpointOp: 0.03 };
                if (!g.config.eventCooldownMs) g.config.eventCooldownMs = 10 * 60 * 1000;
                if (!g.config.eventCooldownUntil) g.config.eventCooldownUntil = 0;
                if (!g.config.heatDecayPerHour) g.config.heatDecayPerHour = 4;
                if (!g.config.patrolBaseChance) g.config.patrolBaseChance = 0.08;
                if (!g.config.checkpointBonus) g.config.checkpointBonus = 0.12;
                if (!g.config.activityRequirements) g.config.activityRequirements = { level2: 50, level3: 200, level4: 500 };
                if (!g.config.repShop) g.config.repShop = { enabled: true, pricePerRep: 120, maxPerDay: 250 };
                if (!g.announce) g.announce = { channelId: null, pingEveryone: false, policeRoleId: null, alertPolice: true };
                if (typeof g.announce.alertPolice !== "boolean") g.announce.alertPolice = true;
                if (typeof g.announce.policeRoleId === "undefined") g.announce.policeRoleId = null;
                return g;
            };

            let cached = await getSettings();

            const menu = new Discord.MessageSelectMenu()
                .setCustomId("config_evento_menu")
                .setPlaceholder("Selecione uma categoria de configuração...")
                .addOptions([
                    { label: "Geral", value: "general", description: "Ativar/Desativar, Canal de Anúncios", emoji: "⚙️" },
                    { label: "Probabilidades de Eventos", value: "probs", description: "Ajustar chance de Raid, Promoção, etc.", emoji: "🎲" },
                    { label: "Economia & Heat", value: "economy", description: "Decaimento de Heat, Patrulha Base", emoji: "💰" },
                    { label: "Desafios", value: "activity", description: "Requisitos de mensagens para itens por nível", emoji: "🏁" },
                    { label: "Reputação (Loja)", value: "rep", description: "Preço e limite diário de reputação", emoji: "⭐" },
                ]);

            const row = new Discord.MessageActionRow().addComponents(menu);

            const embed = new Discord.MessageEmbed()
                .setTitle("🛠️ Configuração: Evento Submundo")
                .setColor("DARK_BUT_NOT_BLACK")
                .setDescription("Use o menu abaixo para configurar o evento.")
                .addFields(
                    { name: "Estado", value: cached.active ? "✅ Ativo" : "❌ Desativado", inline: true },
                    { name: "Canal", value: cached.announce?.channelId ? `<#${cached.announce.channelId}>` : "Não definido", inline: true },
                    { name: "Ping @everyone", value: cached.announce?.pingEveryone ? "Sim" : "Não", inline: true }
                );
            applyWDAFooter(embed);

            await interaction.editReply({ embeds: [embed], components: [row] });
            const msg = await interaction.fetchReply();

            const collector = msg.createMessageComponentCollector({ componentType: Discord.ComponentType?.StringSelect || "SELECT_MENU", idle: 10 * 60 * 1000 });

            collector.on('collect', async i => {
                if (i.user.id !== interaction.user.id) return safe(i.reply({ content: "Menu pessoal.", ephemeral: true }));
                await safe(i.deferUpdate());
                const action = i.values[0];
                cached = await getSettings();
                const g = cached;

                if (action === "general") {
                    const rowGen = new Discord.MessageActionRow().addComponents(
                        new Discord.MessageButton().setCustomId("cfg_toggle_active").setLabel(g.active ? "Desativar Evento" : "Ativar Evento").setStyle(g.active ? "DANGER" : "SUCCESS"),
                        new Discord.MessageButton().setCustomId("cfg_toggle_ping").setLabel("Toggle @everyone").setStyle("SECONDARY"),
                        new Discord.MessageButton().setCustomId("cfg_set_channel").setLabel("Definir Canal (ID)").setStyle("PRIMARY"),
                        new Discord.MessageButton().setCustomId("cfg_toggle_police_alert").setLabel(g.announce.alertPolice ? "Alertas Polícia: ON" : "Alertas Polícia: OFF").setStyle("SECONDARY"),
                        new Discord.MessageButton().setCustomId("cfg_set_police_role").setLabel("Cargo Polícia (ID)").setStyle("PRIMARY")
                    );
                    return safe(i.editReply({ content: "**Configuração Geral**", embeds: [], components: [rowGen] }));
                }

                if (action === "probs") {
                    const p = g.config.eventProbs;
                    const desc = [
                        `**Desconto (Promoção):** ${(p.discount * 100).toFixed(1)}%`,
                        `**Raid Policial:** ${(p.raid * 100).toFixed(1)}%`,
                        `**Escassez (Item some):** ${(p.shortage * 100).toFixed(1)}%`,
                        `**Superávit (Item barato):** ${(p.surplus * 100).toFixed(1)}%`,
                        `**Operação de Checkpoints:** ${((p.checkpointOp || 0) * 100).toFixed(1)}%`
                    ].join("\n");

                    const rowProbs = new Discord.MessageActionRow().addComponents(
                        new Discord.MessageButton().setCustomId("cfg_edit_probs").setLabel("Editar Probabilidades").setStyle("PRIMARY")
                    );

                    const e = new Discord.MessageEmbed()
                        .setTitle("🎲 Probabilidades de Eventos (por Tick)")
                        .setColor("BLUE")
                        .setDescription(desc + "\n\n*O Tick ocorre a cada 1 minuto.*");
                    
                    return safe(i.editReply({ embeds: [e], components: [row, rowProbs] }));
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
                    
                    return safe(i.editReply({ embeds: [e], components: [row, rowEco] }));
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

                    return safe(i.editReply({ embeds: [e], components: [row, rowAct] }));
                }

                if (action === "rep") {
                    const r = g.config.repShop || { enabled: true, pricePerRep: 120, maxPerDay: 250 };
                    const desc = [
                        `**Ativo:** ${r.enabled ? "Sim" : "Não"}`,
                        `**Preço por 1 rep:** ${Math.max(1, Math.floor(r.pricePerRep || 120))}`,
                        `**Limite por dia:** ${Math.max(0, Math.floor(r.maxPerDay || 0))} rep`,
                    ].join("\n");

                    const rowRep = new Discord.MessageActionRow().addComponents(
                        new Discord.MessageButton().setCustomId("cfg_edit_rep").setLabel("Editar Loja de Reputação").setStyle("PRIMARY")
                    );

                    const e = new Discord.MessageEmbed()
                        .setTitle("⭐ Loja de Reputação")
                        .setColor("GOLD")
                        .setDescription(desc);

                    return safe(i.editReply({ embeds: [e], components: [row, rowRep] }));
                }
            });

            // Button Collector for sub-actions
            const btnCollector = msg.createMessageComponentCollector({ componentType: Discord.ComponentType?.Button || "BUTTON", idle: 10 * 60 * 1000 });
            
            btnCollector.on('collect', async i => {
                if (i.user.id !== interaction.user.id) return safe(i.reply({ content: "Menu pessoal.", ephemeral: true }));

                if (i.customId === "cfg_toggle_active") {
                    await safe(i.deferReply({ ephemeral: true }));
                    const g = await getSettings();
                    g.active = !g.active;
                    await g.save();
                    cached = g;
                    return safe(i.editReply({ content: `✅ Evento ${g.active ? "ATIVADO" : "DESATIVADO"}.` }));
                }

                if (i.customId === "cfg_toggle_ping") {
                    await safe(i.deferReply({ ephemeral: true }));
                    const g = await getSettings();
                    g.announce.pingEveryone = !g.announce.pingEveryone;
                    await g.save();
                    cached = g;
                    return safe(i.editReply({ content: `✅ Ping @everyone: ${g.announce.pingEveryone ? "ON" : "OFF"}.` }));
                }

                if (i.customId === "cfg_set_channel") {
                    const modal = new Discord.Modal().setCustomId("cfg_modal_channel").setTitle("Definir Canal");
                    const input = new Discord.TextInputComponent().setCustomId("channel_id").setLabel("ID do Canal").setStyle("SHORT").setRequired(true);
                    modal.addComponents(new Discord.MessageActionRow().addComponents(input));
                    await safe(i.showModal(modal));
                }

                if (i.customId === "cfg_toggle_police_alert") {
                    await safe(i.deferReply({ ephemeral: true }));
                    const g = await getSettings();
                    g.announce.alertPolice = !g.announce.alertPolice;
                    await g.save();
                    cached = g;
                    return safe(i.editReply({ content: `✅ Alertas para polícia: ${g.announce.alertPolice ? "ON" : "OFF"}.` }));
                }

                if (i.customId === "cfg_set_police_role") {
                    const modal = new Discord.Modal().setCustomId("cfg_modal_police_role").setTitle("Cargo da Polícia");
                    const input = new Discord.TextInputComponent().setCustomId("police_role_id").setLabel("ID do cargo (vazio = nenhum)").setStyle("SHORT").setRequired(false);
                    modal.addComponents(new Discord.MessageActionRow().addComponents(input));
                    await safe(i.showModal(modal));
                }

                if (i.customId === "cfg_edit_probs") {
                    const modal = new Discord.Modal().setCustomId("cfg_modal_probs").setTitle("Probabilidades (0-100)");
                    const p = cached.config.eventProbs;
                    
                    modal.addComponents(
                        new Discord.MessageActionRow().addComponents(new Discord.TextInputComponent().setCustomId("prob_discount").setLabel("Desconto %").setValue((p.discount*100).toString()).setStyle("SHORT")),
                        new Discord.MessageActionRow().addComponents(new Discord.TextInputComponent().setCustomId("prob_raid").setLabel("Raid %").setValue((p.raid*100).toString()).setStyle("SHORT")),
                        new Discord.MessageActionRow().addComponents(new Discord.TextInputComponent().setCustomId("prob_shortage").setLabel("Escassez %").setValue((p.shortage*100).toString()).setStyle("SHORT")),
                        new Discord.MessageActionRow().addComponents(new Discord.TextInputComponent().setCustomId("prob_surplus").setLabel("Superávit %").setValue((p.surplus*100).toString()).setStyle("SHORT")),
                        new Discord.MessageActionRow().addComponents(new Discord.TextInputComponent().setCustomId("prob_checkpoint_op").setLabel("Checkpoint %").setValue(((p.checkpointOp || 0)*100).toString()).setStyle("SHORT"))
                    );
                    await safe(i.showModal(modal));
                }

                if (i.customId === "cfg_edit_eco") {
                    const modal = new Discord.Modal().setCustomId("cfg_modal_eco").setTitle("Economia");
                    const c = cached.config;
                    
                    modal.addComponents(
                        new Discord.MessageActionRow().addComponents(new Discord.TextInputComponent().setCustomId("eco_decay").setLabel("Heat Decay / Hora").setValue(c.heatDecayPerHour.toString()).setStyle("SHORT")),
                        new Discord.MessageActionRow().addComponents(new Discord.TextInputComponent().setCustomId("eco_patrol").setLabel("Patrulha Base %").setValue((c.patrolBaseChance*100).toString()).setStyle("SHORT")),
                        new Discord.MessageActionRow().addComponents(new Discord.TextInputComponent().setCustomId("eco_cooldown_min").setLabel("Cooldown de Eventos (min)").setValue(String(Math.max(0, Math.floor((c.eventCooldownMs || 0) / 60000)))).setStyle("SHORT"))
                    );
                    await safe(i.showModal(modal));
                }

                if (i.customId === "cfg_edit_activity") {
                    const modal = new Discord.Modal().setCustomId("cfg_modal_activity").setTitle("Desafios");
                    const a = cached.config.activityRequirements || { level2: 50, level3: 200, level4: 500 };

                    modal.addComponents(
                        new Discord.MessageActionRow().addComponents(new Discord.TextInputComponent().setCustomId("act_level2").setLabel("Nível 2+ (mensagens)").setValue(String(Math.max(0, Math.floor(a.level2 || 0)))).setStyle("SHORT")),
                        new Discord.MessageActionRow().addComponents(new Discord.TextInputComponent().setCustomId("act_level3").setLabel("Nível 3+ (mensagens)").setValue(String(Math.max(0, Math.floor(a.level3 || 0)))).setStyle("SHORT")),
                        new Discord.MessageActionRow().addComponents(new Discord.TextInputComponent().setCustomId("act_level4").setLabel("Nível 4+ (mensagens)").setValue(String(Math.max(0, Math.floor(a.level4 || 0)))).setStyle("SHORT"))
                    );
                    await safe(i.showModal(modal));
                }

                if (i.customId === "cfg_edit_rep") {
                    const modal = new Discord.Modal().setCustomId("cfg_modal_rep").setTitle("Loja de Reputação");
                    const r = cached.config.repShop || { enabled: true, pricePerRep: 120, maxPerDay: 250 };

                    modal.addComponents(
                        new Discord.MessageActionRow().addComponents(new Discord.TextInputComponent().setCustomId("rep_enabled").setLabel("Ativo? (sim/nao)").setValue(r.enabled ? "sim" : "nao").setStyle("SHORT")),
                        new Discord.MessageActionRow().addComponents(new Discord.TextInputComponent().setCustomId("rep_price").setLabel("Preço por 1 rep").setValue(String(Math.max(1, Math.floor(r.pricePerRep || 120)))).setStyle("SHORT")),
                        new Discord.MessageActionRow().addComponents(new Discord.TextInputComponent().setCustomId("rep_max").setLabel("Limite por dia (rep)").setValue(String(Math.max(0, Math.floor(r.maxPerDay || 0)))).setStyle("SHORT"))
                    );
                    await safe(i.showModal(modal));
                }
            });

        } catch (err) {
            console.error(err);
            replyOrEdit(interaction, { content: "Erro na configuração.", ephemeral: true }).catch(() => {});
        }
    }
};
