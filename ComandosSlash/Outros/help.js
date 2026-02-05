const Discord = require("../../Utils/djs");
const fs = require("fs");
const path = require("path");
const { replyOrEdit } = require("../../Utils/commandKit");
const { applyWDAFooter } = require("../../Utils/embeds");

module.exports = {
    name: "help",
    description: "Hub de ajuda e guias do servidor",
    type: "CHAT_INPUT",
    autoDefer: { ephemeral: true },
    run: async (client, interaction) => {
        try {
            const safe = async (p) => {
                try {
                    return await p;
                } catch (e) {
                    if (e?.code === 10062 || e?.code === 40060) return null;
                    throw e;
                }
            };

            const root = path.resolve(__dirname, "..", "..");
            const commandsRoot = path.join(root, "ComandosSlash");

            const hasAdminPerm =
                interaction.member?.permissions?.has("ADMINISTRATOR") ||
                interaction.member?.permissions?.has("MANAGE_GUILD");

            function safeReadDir(p) {
                try {
                    return fs.readdirSync(p);
                } catch {
                    return [];
                }
            }

            function padLine(s = "") {
                return String(s).replace(/\r?\n/g, " ").trim();
            }

            function flattenOptions(options) {
                if (!Array.isArray(options)) return [];
                const subs = [];
                for (const opt of options) {
                    if (!opt) continue;
                    if (opt.type === "SUB_COMMAND") {
                        subs.push({ type: "sub", name: opt.name, description: opt.description || "", options: opt.options || [] });
                    } else if (opt.type === "SUB_COMMAND_GROUP") {
                        const groupName = opt.name;
                        const groupOptions = Array.isArray(opt.options) ? opt.options : [];
                        for (const sub of groupOptions) {
                            if (!sub || sub.type !== "SUB_COMMAND") continue;
                            subs.push({ type: "groupSub", group: groupName, name: sub.name, description: sub.description || "", options: sub.options || [] });
                        }
                    }
                }
                return subs;
            }

            function optionSignature(opts) {
                if (!Array.isArray(opts) || opts.length === 0) return "";
                const parts = [];
                for (const o of opts) {
                    if (!o || !o.name) continue;
                    const t = (o.type || "").toLowerCase();
                    const req = o.required ? "" : "?";
                    parts.push(`${o.name}${req}:${t || "arg"}`);
                }
                return parts.length ? ` ${parts.join(" ")}` : "";
            }

            function loadCommand(filePath) {
                try {
                    delete require.cache[require.resolve(filePath)];
                    const mod = require(filePath);
                    if (!mod || !mod.name) return null;
                    return mod;
                } catch {
                    return null;
                }
            }

            function normalizeHubActions(cmd) {
                if (!cmd) return [];
                if (Array.isArray(cmd.hubActions)) return cmd.hubActions.filter(Boolean).map(String);
                if (cmd.hub && Array.isArray(cmd.hub.actions)) return cmd.hub.actions.filter(Boolean).map(String);
                return [];
            }

            function categoryEmoji(name) {
                const n = String(name || "").toLowerCase();
                if (n === "economia") return "💵";
                if (n === "diversao") return "🎲";
                if (n === "interacao") return "🤝";
                if (n === "utilidade") return "🛠️";
                if (n === "loja") return "🛒";
                if (n === "moderacao") return "🛡️";
                if (n === "outros") return "🌐";
                if (n === "admin") return "👑";
                return "📁";
            }

            const categories = safeReadDir(commandsRoot).filter((d) => {
                try {
                    return fs.statSync(path.join(commandsRoot, d)).isDirectory();
                } catch {
                    return false;
                }
            });

            categories.sort((a, b) => a.localeCompare(b, "pt-BR"));

            function buildCascadeForCategory(categoryName) {
                const dir = path.join(commandsRoot, categoryName);
                const files = safeReadDir(dir).filter((f) => f.endsWith(".js")).sort((a, b) => a.localeCompare(b, "pt-BR"));
                const lines = [];
                for (const f of files) {
                    const cmd = loadCommand(path.join(dir, f));
                    if (!cmd) continue;
                    lines.push(`/${cmd.name} — ${padLine(cmd.description || "Sem descrição")}`);
                    const hubActions = normalizeHubActions(cmd);
                    if (hubActions.length) {
                        lines.push(`  • HUB: ${hubActions.slice(0, 8).map((x) => padLine(x)).join(" | ")}${hubActions.length > 8 ? " | ..." : ""}`);
                    }
                    const subs = flattenOptions(cmd.options);
                    for (const s of subs) {
                        const base = `/${cmd.name}`;
                        const full = s.type === "groupSub" ? `${base} ${s.group} ${s.name}` : `${base} ${s.name}`;
                        const sig = optionSignature(s.options);
                        lines.push(`  • ${full}${sig} — ${padLine(s.description || "Sem descrição")}`);
                    }
                }
                const text = lines.join("\n");
                if (text.length <= 3800) return text;
                return text.slice(0, 3770) + "\n...\n(Use o arquivo docs/COMANDOS.txt para ver tudo.)";
            }

            const embedHome = new Discord.MessageEmbed()
                .setTitle("📚 Central de Ajuda")
                .setColor("BLURPLE")
                .setDescription(
                    [
                        "Escolha o que você quer ver:",
                        "💣 Evento Submundo (guias + hubs + eventos)",
                        "🤖 Comandos (em cascata por categoria)",
                        hasAdminPerm ? "👑 Admin (painel staff)" : "👑 Admin (bloqueado)",
                    ].join("\n")
                )
                .setThumbnail(client.user.displayAvatarURL())
                .setFooter({ text: `WDA • Direitos reservados • Solicitado por ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() });

            const homeRow = new Discord.ActionRowBuilder().addComponents(
                new Discord.ButtonBuilder().setCustomId("help_home_event").setLabel("Evento Submundo").setStyle("DANGER"),
                new Discord.ButtonBuilder().setCustomId("help_home_cmds").setLabel("Comandos").setStyle("PRIMARY"),
                new Discord.ButtonBuilder().setCustomId("help_home_admin").setLabel("Admin").setStyle("SECONDARY").setDisabled(!hasAdminPerm)
            );

            await interaction.editReply({ embeds: [embedHome], components: [homeRow] });
            const msg = await interaction.fetchReply();

            const backRow = new Discord.ActionRowBuilder().addComponents(
                new Discord.ButtonBuilder().setCustomId("help_back_home").setLabel("Voltar").setStyle("SECONDARY")
            );

            const eventHubs = [
                { id: "mercadonegro", label: "Mercado Negro", value: "hub_mercadonegro", emoji: "💣", file: path.join(commandsRoot, "Economia", "mercadonegro.js") },
                { id: "faccao", label: "Facções", value: "hub_faccao", emoji: "🏴", file: path.join(commandsRoot, "Economia", "faccao.js") },
                { id: "policia", label: "Polícia", value: "hub_policia", emoji: "👮", file: path.join(commandsRoot, "Economia", "policia.js") },
                { id: "eleicao", label: "Eleições", value: "hub_eleicao", emoji: "🗳️", file: path.join(commandsRoot, "Economia", "eleicao.js") },
                { id: "bancocentral", label: "Banco Central", value: "hub_bancocentral", emoji: "🏦", file: path.join(commandsRoot, "Economia", "bancocentral.js") },
                { id: "config_evento", label: "Config Evento (ADM)", value: "hub_config_evento", emoji: "🛠️", file: path.join(commandsRoot, "Admin", "config_evento.js") },
            ];

            const hubSelect = new Discord.StringSelectMenuBuilder()
                .setCustomId("help_select_hub")
                .setPlaceholder("Ver ações de um HUB...")
                .addOptions(
                    eventHubs.map((h) => ({
                        label: h.label,
                        value: h.value,
                        emoji: h.emoji,
                        description: `Ações do /${h.id}`,
                    }))
                );

            const hubRow = new Discord.ActionRowBuilder().addComponents(hubSelect);

            const generalSelect = new Discord.StringSelectMenuBuilder()
                .setCustomId("help_select_category_general")
                .setPlaceholder("Escolha uma categoria...")
                .addOptions(
                    categories
                        .filter((c) => String(c).toLowerCase() !== "admin")
                        .map((c) => ({
                            label: c,
                            value: `cat_${c}`,
                            emoji: categoryEmoji(c),
                            description: `Comandos de ${c}`,
                        }))
                        .slice(0, 25)
                );

            const generalRow = new Discord.ActionRowBuilder().addComponents(generalSelect);

            const adminSelect = new Discord.StringSelectMenuBuilder()
                .setCustomId("help_select_category_admin")
                .setPlaceholder("Escolha uma área (staff)...")
                .addOptions(
                    ["Admin", "Moderacao", "Economia"].map((c) => ({
                        label: c,
                        value: `acat_${c}`,
                        emoji: categoryEmoji(c),
                        description: `Cascata de ${c}`,
                    }))
                );

            const adminRow = new Discord.ActionRowBuilder().addComponents(adminSelect);

            const collector = msg.createMessageComponentCollector({ idle: 5 * 60 * 1000 });

            collector.on("collect", async (i) => {
                try {
                    if (i.user.id !== interaction.user.id) return safe(i.reply({ content: "Use /help para abrir seu próprio menu.", ephemeral: true }));
                    await safe(i.deferUpdate());

                    if (i.isButton() && i.customId === "help_back_home") {
                        return safe(i.editReply({ embeds: [embedHome], components: [homeRow] }));
                    }

                    if (i.isButton() && i.customId === "help_home_event") {
                        const e = new Discord.MessageEmbed()
                            .setTitle("💣 Evento Submundo — Guia Rápido")
                            .setColor("DARK_RED")
                            .setDescription(
                                [
                                    "Dois lados: **Mercado Negro** vs **Polícia**.",
                                    "Você entra jogando: use os hubs abaixo.",
                                    "",
                                    "Eventos aleatórios: **Raid**, **Escassez**, **Superávit**, **Leilão**.",
                                    "Admin pode ajustar chances em `/config_evento`.",
                                ].join("\n")
                            );
                        applyWDAFooter(e);
                        return safe(i.editReply({ embeds: [e], components: [hubRow, backRow] }));
                    }

                    if (i.isButton() && i.customId === "help_home_cmds") {
                        const e = new Discord.MessageEmbed()
                            .setTitle("🤖 Comandos — Cascata")
                            .setColor("BLUE")
                            .setDescription("Escolha uma categoria para ver os comandos em formato cascata.");
                        applyWDAFooter(e);
                        return safe(i.editReply({ embeds: [e], components: [generalRow, backRow] }));
                    }

                    if (i.isButton() && i.customId === "help_home_admin") {
                        if (!hasAdminPerm) return safe(i.followUp({ content: "❌ Apenas administração.", ephemeral: true }));
                        const e = new Discord.MessageEmbed()
                            .setTitle("👑 Admin — Cascata")
                            .setColor("GOLD")
                            .setDescription("Escolha uma área para ver comandos em cascata.");
                        applyWDAFooter(e);
                        return safe(i.editReply({ embeds: [e], components: [adminRow, backRow] }));
                    }

                    if (i.isStringSelectMenu?.() && i.customId === "help_select_category_general") {
                        const cat = String(i.values[0] || "").replace(/^cat_/, "");
                        const text = buildCascadeForCategory(cat);
                        const e = new Discord.MessageEmbed()
                            .setTitle(`${categoryEmoji(cat)} ${cat} — Cascata`)
                            .setColor("BLUE")
                            .setDescription(text || "Sem comandos.");
                        applyWDAFooter(e);
                        return safe(i.editReply({ embeds: [e], components: [generalRow, backRow] }));
                    }

                    if (i.isStringSelectMenu?.() && i.customId === "help_select_category_admin") {
                        if (!hasAdminPerm) return safe(i.followUp({ content: "❌ Apenas administração.", ephemeral: true }));
                        const cat = String(i.values[0] || "").replace(/^acat_/, "");
                        const text = buildCascadeForCategory(cat);
                        const e = new Discord.MessageEmbed()
                            .setTitle(`${categoryEmoji(cat)} ${cat} — Cascata (Staff)`)
                            .setColor("GOLD")
                            .setDescription(text || "Sem comandos.");
                        applyWDAFooter(e);
                        return safe(i.editReply({ embeds: [e], components: [adminRow, backRow] }));
                    }

                    if (i.isStringSelectMenu?.() && i.customId === "help_select_hub") {
                        const value = String(i.values[0] || "");
                        const hub = eventHubs.find((h) => h.value === value);
                        if (!hub) return safe(i.followUp({ content: "❌ HUB inválido.", ephemeral: true }));
                        const cmd = loadCommand(hub.file);
                        const actions = normalizeHubActions(cmd);
                        const descLines = [];
                        for (const a of actions) descLines.push(`• ${padLine(a)}`);
                        const e = new Discord.MessageEmbed()
                            .setTitle(`${hub.emoji} /${hub.id} — Ações`)
                            .setColor("DARK_BUT_NOT_BLACK")
                            .setDescription(descLines.length ? descLines.join("\n").slice(0, 3900) : "Sem ações cadastradas.");
                        applyWDAFooter(e);
                        return safe(i.editReply({ embeds: [e], components: [hubRow, backRow] }));
                    }
                } catch (err) {
                    console.error(err);
                    i.followUp({ content: "Erro ao abrir o menu.", ephemeral: true }).catch(() => {});
                }
            });

            collector.on("end", () => {
                const disabledRow = new Discord.ActionRowBuilder().addComponents(
                    new Discord.ButtonBuilder().setCustomId("expired").setLabel("Menu expirado").setStyle("SECONDARY").setDisabled(true)
                );
                interaction.editReply({ components: [disabledRow] }).catch(() => {});
            });
        } catch (err) {
            console.error(err);
            replyOrEdit(interaction, { content: "Erro ao carregar menu de ajuda.", ephemeral: true }).catch(() => {});
        }
    }
};
