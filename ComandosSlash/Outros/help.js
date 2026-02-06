const { 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    StringSelectMenuBuilder, 
    ButtonStyle, 
    PermissionFlagsBits 
} = require("discord.js");
const fs = require("fs");
const path = require("path");
const { replyOrEdit } = require("../../Utils/commandKit");
const { applyWDAFooter } = require("../../Utils/embeds");

// Cache global para evitar readdirSync a cada comando
let commandCache = null;

function loadCommandCache() {
    if (commandCache) return commandCache;

    const root = path.resolve(__dirname, "..", "..");
    const commandsRoot = path.join(root, "ComandosSlash");
    
    function safeReadDir(p) {
        try {
            return fs.readdirSync(p);
        } catch {
            return [];
        }
    }

    const categories = safeReadDir(commandsRoot).filter((d) => {
        try {
            return fs.statSync(path.join(commandsRoot, d)).isDirectory();
        } catch {
            return false;
        }
    }).sort((a, b) => a.localeCompare(b, "pt-BR"));

    const commandsMap = new Map();

    for (const cat of categories) {
        const dir = path.join(commandsRoot, cat);
        const files = safeReadDir(dir).filter((f) => f.endsWith(".js")).sort((a, b) => a.localeCompare(b, "pt-BR"));
        const cmds = [];
        
        for (const f of files) {
            try {
                const filePath = path.join(dir, f);
                // Evita deletar cache se não for reload explícito
                const mod = require(filePath);
                if (mod && mod.name) {
                    cmds.push({ ...mod, _fileName: f });
                }
            } catch (e) {
                console.error(`Erro ao carregar comando ${f}:`, e);
            }
        }
        commandsMap.set(cat, cmds);
    }

    commandCache = { categories, commandsMap, commandsRoot };
    return commandCache;
}

module.exports = {
    name: "help",
    description: "Hub de ajuda e guias do servidor",
    type: 1, // CHAT_INPUT
    autoDefer: { ephemeral: true },
    run: async (client, interaction) => {
        try {
            const cache = loadCommandCache();
            
            const safe = async (p) => {
                try {
                    return await p;
                } catch (e) {
                    if (e?.code === 10062 || e?.code === 40060) return null;
                    throw e;
                }
            };

            const hasAdminPerm =
                interaction.member?.permissions?.has(PermissionFlagsBits.Administrator) ||
                interaction.member?.permissions?.has(PermissionFlagsBits.ManageGuild);

            function padLine(s = "") {
                return String(s).replace(/\r?\n/g, " ").trim();
            }

            function flattenOptions(options) {
                if (!Array.isArray(options)) return [];
                const subs = [];
                for (const opt of options) {
                    if (!opt) continue;
                    if (opt.type === 1) { // SUB_COMMAND
                        subs.push({ type: "sub", name: opt.name, description: opt.description || "", options: opt.options || [] });
                    } else if (opt.type === 2) { // SUB_COMMAND_GROUP
                        const groupName = opt.name;
                        const groupOptions = Array.isArray(opt.options) ? opt.options : [];
                        for (const sub of groupOptions) {
                            if (!sub || sub.type !== 1) continue;
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
                    // Mapeia tipos numéricos para string se necessário, ou usa genérico
                    const req = o.required ? "" : "?";
                    parts.push(`${o.name}${req}`);
                }
                return parts.length ? ` ${parts.join(" ")}` : "";
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

            function buildCascadeForCategory(categoryName) {
                const cmds = cache.commandsMap.get(categoryName) || [];
                const lines = [];
                for (const cmd of cmds) {
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

            const embedHome = new EmbedBuilder()
                .setTitle("📚 Central de Ajuda")
                .setColor("Blurple")
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

            const homeRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId("help_home_event").setLabel("Evento Submundo").setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId("help_home_cmds").setLabel("Comandos").setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId("help_home_admin").setLabel("Admin").setStyle(ButtonStyle.Secondary).setDisabled(!hasAdminPerm)
            );

            await interaction.editReply({ embeds: [embedHome], components: [homeRow] });
            const msg = await interaction.fetchReply();

            const backRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId("help_back_home").setLabel("Voltar").setStyle(ButtonStyle.Secondary)
            );

            // Arquivos de hub são estáticos, mas referenciam arquivos. 
            // Vamos confiar que existem no cache ou no disco.
            const eventHubs = [
                { id: "mercadonegro", label: "Mercado Negro", value: "hub_mercadonegro", emoji: "💣", file: "mercadonegro.js" },
                { id: "faccao", label: "Facções", value: "hub_faccao", emoji: "🏴", file: "faccao.js" },
                { id: "policia", label: "Polícia", value: "hub_policia", emoji: "👮", file: "policia.js" },
                { id: "eleicao", label: "Eleições", value: "hub_eleicao", emoji: "🗳️", file: "eleicao.js" },
                { id: "bancocentral", label: "Banco Central", value: "hub_bancocentral", emoji: "🏦", file: "bancocentral.js" },
                { id: "config_evento", label: "Config Evento (ADM)", value: "hub_config_evento", emoji: "🛠️", file: "config_evento.js" },
            ];

            const hubSelect = new StringSelectMenuBuilder()
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

            const hubRow = new ActionRowBuilder().addComponents(hubSelect);

            const generalSelect = new StringSelectMenuBuilder()
                .setCustomId("help_select_category_general")
                .setPlaceholder("Escolha uma categoria...")
                .addOptions(
                    cache.categories
                        .filter((c) => String(c).toLowerCase() !== "admin")
                        .map((c) => ({
                            label: c,
                            value: `cat_${c}`,
                            emoji: categoryEmoji(c),
                            description: `Comandos de ${c}`,
                        }))
                        .slice(0, 25)
                );

            const generalRow = new ActionRowBuilder().addComponents(generalSelect);

            const adminSelect = new StringSelectMenuBuilder()
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

            const adminRow = new ActionRowBuilder().addComponents(adminSelect);

            const collector = msg.createMessageComponentCollector({ idle: 5 * 60 * 1000 });

            collector.on("collect", async (i) => {
                try {
                    if (i.user.id !== interaction.user.id) return safe(i.reply({ content: "Use /help para abrir seu próprio menu.", ephemeral: true }));
                    await safe(i.deferUpdate());

                    if (i.isButton() && i.customId === "help_back_home") {
                        return safe(i.editReply({ embeds: [embedHome], components: [homeRow] }));
                    }

                    if (i.isButton() && i.customId === "help_home_event") {
                        const e = new EmbedBuilder()
                            .setTitle("💣 Evento Submundo — Guia Rápido")
                            .setColor("DarkRed")
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
                        const e = new EmbedBuilder()
                            .setTitle("🤖 Comandos — Cascata")
                            .setColor("Blue")
                            .setDescription("Escolha uma categoria para ver os comandos em formato cascata.");
                        applyWDAFooter(e);
                        return safe(i.editReply({ embeds: [e], components: [generalRow, backRow] }));
                    }

                    if (i.isButton() && i.customId === "help_home_admin") {
                        if (!hasAdminPerm) return safe(i.followUp({ content: "❌ Apenas administração.", ephemeral: true }));
                        const e = new EmbedBuilder()
                            .setTitle("👑 Admin — Cascata")
                            .setColor("Gold")
                            .setDescription("Escolha uma área para ver comandos em cascata.");
                        applyWDAFooter(e);
                        return safe(i.editReply({ embeds: [e], components: [adminRow, backRow] }));
                    }

                    if (i.isStringSelectMenu() && i.customId === "help_select_category_general") {
                        const cat = String(i.values[0] || "").replace(/^cat_/, "");
                        const text = buildCascadeForCategory(cat);
                        const e = new EmbedBuilder()
                            .setTitle(`${categoryEmoji(cat)} ${cat} — Cascata`)
                            .setColor("Blue")
                            .setDescription(text || "Sem comandos.");
                        applyWDAFooter(e);
                        return safe(i.editReply({ embeds: [e], components: [generalRow, backRow] }));
                    }

                    if (i.isStringSelectMenu() && i.customId === "help_select_category_admin") {
                        if (!hasAdminPerm) return safe(i.followUp({ content: "❌ Apenas administração.", ephemeral: true }));
                        const cat = String(i.values[0] || "").replace(/^acat_/, "");
                        const text = buildCascadeForCategory(cat);
                        const e = new EmbedBuilder()
                            .setTitle(`${categoryEmoji(cat)} ${cat} — Cascata (Staff)`)
                            .setColor("Gold")
                            .setDescription(text || "Sem comandos.");
                        applyWDAFooter(e);
                        return safe(i.editReply({ embeds: [e], components: [adminRow, backRow] }));
                    }

                    if (i.isStringSelectMenu() && i.customId === "help_select_hub") {
                        const value = String(i.values[0] || "");
                        const hub = eventHubs.find((h) => h.value === value);
                        if (!hub) return safe(i.followUp({ content: "❌ HUB inválido.", ephemeral: true }));
                        
                        // Busca comando no cache (pode estar em qualquer categoria)
                        let cmd = null;
                        for (const cmds of cache.commandsMap.values()) {
                            const found = cmds.find(c => c._fileName === hub.file);
                            if (found) {
                                cmd = found;
                                break;
                            }
                        }

                        const actions = normalizeHubActions(cmd);
                        const descLines = [];
                        for (const a of actions) descLines.push(`• ${padLine(a)}`);
                        const e = new EmbedBuilder()
                            .setTitle(`${hub.emoji} /${hub.id} — Ações`)
                            .setColor("DarkButNotBlack")
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
                const disabledRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId("expired").setLabel("Menu expirado").setStyle(ButtonStyle.Secondary).setDisabled(true)
                );
                interaction.editReply({ components: [disabledRow] }).catch(() => {});
            });
        } catch (err) {
            console.error(err);
            replyOrEdit(interaction, { content: "Erro ao carregar menu de ajuda.", ephemeral: true }).catch(() => {});
        }
    }
};
