const Discord = require("discord.js");
const { ensureEconomyAllowed } = require("../../Utils/economyGuard");
const { formatMoney, creditWallet } = require("../../Utils/economy");
const { getPolice, isChief, isOfficer } = require("../../Utils/police");
const { DISTRICTS } = require("../../Utils/blackMarketEngine");
const { syncMissions, parseMissionId, missionTitle, missionRewards, applyMissionProgress } = require("../../Utils/blackMarketMissions");
const { ensureTerritories, applyPoliceInfluence } = require("../../Utils/territoryEngine");
const { safe, promptOneLine, promptModal } = require("../../Utils/interactions");
const logger = require("../../Utils/logger");
const { replyOrEdit } = require("../../Utils/commandKit");

function canAdmin(interaction) {
    return (
        interaction.member?.permissions?.has("ADMINISTRATOR") ||
        interaction.member?.permissions?.has("MANAGE_GUILD")
    );
}

function parseUserId(raw) {
    const s = String(raw || "").trim();
    const m = s.match(/^<@!?(\d+)>$/);
    if (m) return m[1];
    const only = s.match(/^(\d{16,25})$/);
    if (only) return only[1];
    return null;
}

function getOfficerStats(police, userId) {
    if (!police.officerStats) police.officerStats = new Map();
    const map = police.officerStats;
    const cur = typeof map.get === "function" ? map.get(userId) : map[userId];
    const base = cur || { seizuresValue: 0, seizuresCount: 0, casesClosed: 0, patrols: 0, checkpoints: 0, xp: 0, lastActionAt: 0 };
    if (typeof map.set === "function") map.set(userId, base);
    else map[userId] = base;
    return base;
}

function setOfficerStats(police, userId, stats) {
    if (!police.officerStats) police.officerStats = new Map();
    if (typeof police.officerStats.set === "function") police.officerStats.set(userId, stats);
    else police.officerStats[userId] = stats;
}

function districtsText() {
    return DISTRICTS.map((d) => `• **${d.id}** — ${d.name}`).join("\n");
}

module.exports = {
    name: "policia",
    description: "Hub da Polícia: patrulhas, checkpoints, casos, ranking e missões",
    type: "CHAT_INPUT",
    autoDefer: { ephemeral: true },
    hubActions: [
        "Status — chefe, oficiais e seu status",
        "Candidatar — entrar para a polícia",
        "Sair da polícia — deixar a corporação",
        "Pedidos (chefe) — ver pendentes",
        "Aceitar pedido (chefe) — aprovar candidato",
        "Recusar pedido (chefe) — recusar candidato",
        "Definir chefe (ADM) — admin define chefe",
        "Patrulhar — buscar pistas e casos",
        "Checkpoint — aumenta interceptações",
        "Alertas — assaltos/tráfico/lavagem em andamento",
        "Intervir — tentar interromper (por ID do caso)",
        "Casos — listar abertos",
        "Ver caso — detalhes",
        "Investigar caso — avançar progresso",
        "Capturar caso — fechar e apreender",
        "Missões — missões policiais",
        "Resgatar missão — pegar recompensa",
        "Ranking — melhores policiais",
    ],
    run: async (client, interaction) => {
        try {
            if (!client.policedb || !client.policeCasedb || !client.blackMarketGuilddb || !client.blackMarketUserdb || !client.guildEconomydb || !client.userdb) {
                return replyOrEdit(interaction, { content: "❌ Banco do evento indisponível.", ephemeral: true });
            }

            const police = await getPolice(client, interaction.guildId);
            if (!police) return replyOrEdit(interaction, { content: "❌ DB de polícia indisponível.", ephemeral: true });

            const menu = new Discord.MessageSelectMenu()
                .setCustomId("policia_hub_action")
                .setPlaceholder("Selecionar comando...")
                .addOptions([
                    { label: "Status", value: "status", description: "Chefe, oficiais e seu status" },
                    { label: "Candidatar", value: "candidatar", description: "Entrar para a polícia" },
                    { label: "Sair da polícia", value: "sair", description: "Deixar a corporação" },
                    { label: "Pedidos (chefe)", value: "pedidos", description: "Ver pedidos pendentes" },
                    { label: "Aceitar pedido (chefe)", value: "aceitar", description: "Aprovar candidato" },
                    { label: "Recusar pedido (chefe)", value: "recusar", description: "Recusar candidato" },
                    { label: "Definir chefe (ADM)", value: "definir_chefe", description: "Admin define o chefe" },
                    { label: "Patrulhar", value: "patrulhar", description: "Buscar pistas e casos" },
                    { label: "Checkpoint", value: "checkpoint", description: "Aumenta interceptações" },
                    { label: "Alertas", value: "alertas", description: "Crimes em andamento" },
                    { label: "Intervir", value: "intervir", description: "Tentar interromper um alerta" },
                    { label: "Casos", value: "casos", description: "Lista casos abertos" },
                    { label: "Ver caso", value: "caso_ver", description: "Detalhes do caso" },
                    { label: "Investigar caso", value: "caso_investigar", description: "Avançar progresso" },
                    { label: "Capturar caso", value: "caso_capturar", description: "Fechar caso e apreender" },
                    { label: "Missões", value: "missoes", description: "Missões policiais" },
                    { label: "Resgatar missão", value: "resgatar", description: "Pegar recompensa" },
                    { label: "Ranking", value: "ranking", description: "Melhores policiais" },
                ]);

            const row = new Discord.MessageActionRow().addComponents(menu);

            const isMeOfficer = isOfficer(police, interaction.user.id);
            const home = new Discord.MessageEmbed()
                .setTitle("👮 HUB DA POLÍCIA")
                .setColor("BLURPLE")
                .setDescription("Escolha uma ação no menu. Se eu pedir algo, você digita e a mensagem é apagada.")
                .addField("Chefe", police.chiefId ? `<@${police.chiefId}>` : "—", true)
                .addField("Oficiais", String((police.officers || []).length), true)
                .addField("Seu status", isMeOfficer ? "✅ Polícia" : "⚠️ Civil", true);

            await replyOrEdit(interaction, { embeds: [home], components: [row], ephemeral: true });
            const msg = await interaction.fetchReply();
            const collector = msg.createMessageComponentCollector({ componentType: Discord.ComponentType?.StringSelect || "SELECT_MENU", idle: 10 * 60 * 1000 });

            collector.on("collect", async (i) => {
                try {
                    if (i.user.id !== interaction.user.id) return safe(i.reply({ content: "❌ Esse menu é do autor do comando.", ephemeral: true }));
                    const action = i.values[0];
                    if (action === "sair") {
                        const pol = await getPolice(client, interaction.guildId);
                        const meIsChief = isChief(pol, interaction.user.id);
                        const meIsOfficer = isOfficer(pol, interaction.user.id);
                        if (!meIsOfficer) return safe(i.reply({ content: "❌ Você não é policial.", ephemeral: true }));
                        if (meIsChief) return safe(i.reply({ content: "❌ O Chefe não pode sair. Transfira a chefia ou peça ao Admin.", ephemeral: true }));

                        const res = await promptModal(i, {
                            title: "Sair da Polícia",
                            customIdPrefix: "policia_sair",
                            timeMs: 45000,
                            inputs: [
                                {
                                    id: "confirm",
                                    label: "Digite SAIR para confirmar",
                                    placeholder: "SAIR",
                                    required: true,
                                    maxLength: 16,
                                },
                            ],
                        });

                        if (!res) return null;
                        const { modalInteraction, values } = res;
                        const confirm = String(values.confirm || "").trim().toUpperCase();
                        await safe(modalInteraction.deferReply({ ephemeral: true }));
                        if (confirm !== "SAIR") return safe(modalInteraction.editReply({ content: "❌ Cancelado." }));

                        const polNow = await getPolice(client, interaction.guildId);
                        if (!polNow) return safe(modalInteraction.editReply({ content: "❌ Polícia indisponível no momento." }));
                        if (isChief(polNow, interaction.user.id)) return safe(modalInteraction.editReply({ content: "❌ O Chefe não pode sair. Transfira a chefia ou peça ao Admin." }));
                        polNow.officers = (polNow.officers || []).filter((id) => id !== interaction.user.id);
                        await polNow.save().catch(() => {});
                        return safe(modalInteraction.editReply({ content: "✅ Você saiu da Polícia." }));
                    }

                    await safe(i.deferUpdate());

                    const gate = await ensureEconomyAllowed(client, interaction, interaction.user.id);
                    if (!gate.ok) return safe(i.followUp({ embeds: [gate.embed], ephemeral: true }));

                    const pol = await getPolice(client, interaction.guildId);
                    const meIsChief = isChief(pol, interaction.user.id);
                    const meIsOfficer = isOfficer(pol, interaction.user.id);

                    if (action === "status") {
                        const st = getOfficerStats(pol, interaction.user.id);
                        const e = new Discord.MessageEmbed()
                            .setTitle("👮 Status da Polícia")
                            .setColor("BLURPLE")
                            .addField("Chefe", pol.chiefId ? `<@${pol.chiefId}>` : "—", true)
                            .addField("Oficiais", String((pol.officers || []).length), true)
                            .addField("Você", meIsOfficer ? "✅ Polícia" : "⚠️ Civil", true)
                            .addField("Seus stats", `Apreensão: ${formatMoney(st.seizuresValue || 0)}\nCasos: ${st.casesClosed || 0}\nPatrulhas: ${st.patrols || 0}`, false);
                        return safe(i.editReply({ embeds: [e], components: [row] }));
                    }

                    if (action === "definir_chefe") {
                        if (!canAdmin(interaction)) return safe(i.followUp({ content: "❌ Apenas admin pode definir chefe.", ephemeral: true }));
                        const raw = await promptOneLine(i, { prompt: "Digite o @ (ou ID) do chefe.", timeMs: 60000 });
                        if (!raw) return safe(i.followUp({ content: "⏳ Tempo esgotado.", ephemeral: true }));
                        const id = parseUserId(raw);
                        if (!id) return safe(i.followUp({ content: "❌ Usuário inválido.", ephemeral: true }));
                        pol.chiefId = id;
                        if (!Array.isArray(pol.officers)) pol.officers = [];
                        if (!pol.officers.includes(id)) pol.officers.push(id);
                        await pol.save().catch(() => {});
                        return safe(i.followUp({ content: `✅ Chefe definido: <@${id}>.`, ephemeral: true }));
                    }

                    if (action === "candidatar") {
                        if (!pol.chiefId) return safe(i.followUp({ content: "❌ Ainda não existe chefe. Admin precisa definir.", ephemeral: true }));
                        if (meIsOfficer) return safe(i.followUp({ content: "❌ Você já é polícia.", ephemeral: true }));
                        const existing = (pol.requests || []).find((r) => r.userId === interaction.user.id && r.status === "pending");
                        if (existing) return safe(i.followUp({ content: "⏳ Você já tem um pedido pendente.", ephemeral: true }));
                        const reason = await promptOneLine(i, { prompt: "Digite em 1 linha por que você deve ser polícia (opcional).", timeMs: 60000 });
                        pol.requests = (pol.requests || []).slice(-50);
                        pol.requests.push({ at: Date.now(), userId: interaction.user.id, reason: (reason || "").slice(0, 140), status: "pending", decidedAt: 0, decidedBy: null });
                        await pol.save().catch(() => {});
                        return safe(i.followUp({ content: "✅ Pedido enviado. Aguarde o chefe/aprovação.", ephemeral: true }));
                    }

                    if (["pedidos", "aceitar", "recusar"].includes(action)) {
                        if (!meIsChief && !canAdmin(interaction)) return safe(i.followUp({ content: "❌ Apenas chefe/admin.", ephemeral: true }));
                    }

                    if (action === "pedidos") {
                        const pend = (pol.requests || []).filter((r) => r.status === "pending").slice(-15);
                        const lines = pend.length
                            ? pend.map((r) => `• <@${r.userId}> — <t:${Math.floor((r.at || 0) / 1000)}:R>\n  ${r.reason || "-"}`).join("\n")
                            : "Nenhum pedido pendente.";
                        const e = new Discord.MessageEmbed().setTitle("📨 Pedidos Pendentes").setColor("BLURPLE").setDescription(lines.slice(0, 3900));
                        return safe(i.editReply({ embeds: [e], components: [row] }));
                    }

                    if (action === "aceitar") {
                        const raw = await promptOneLine(i, { prompt: "Digite o @ (ou ID) do candidato para aceitar.", timeMs: 60000 });
                        if (!raw) return safe(i.followUp({ content: "⏳ Tempo esgotado.", ephemeral: true }));
                        const id = parseUserId(raw);
                        if (!id) return safe(i.followUp({ content: "❌ Usuário inválido.", ephemeral: true }));
                        if (!Array.isArray(pol.officers)) pol.officers = [];
                        if (!pol.officers.includes(id)) pol.officers.push(id);
                        pol.requests = (pol.requests || []).map((r) => (r.userId === id && r.status === "pending" ? { ...r, status: "accepted", decidedAt: Date.now(), decidedBy: interaction.user.id } : r));
                        await pol.save().catch(() => {});
                        return safe(i.followUp({ content: `✅ <@${id}> aceito como policial.`, ephemeral: true }));
                    }

                    if (action === "recusar") {
                        const raw = await promptOneLine(i, { prompt: "Digite o @ (ou ID) do candidato para recusar.", timeMs: 60000 });
                        if (!raw) return safe(i.followUp({ content: "⏳ Tempo esgotado.", ephemeral: true }));
                        const id = parseUserId(raw);
                        if (!id) return safe(i.followUp({ content: "❌ Usuário inválido.", ephemeral: true }));
                        pol.requests = (pol.requests || []).map((r) => (r.userId === id && r.status === "pending" ? { ...r, status: "rejected", decidedAt: Date.now(), decidedBy: interaction.user.id } : r));
                        await pol.save().catch(() => {});
                        return safe(i.followUp({ content: `✅ <@${id}> recusado.`, ephemeral: true }));
                    }

                    if (["patrulhar", "checkpoint", "alertas", "intervir", "casos", "caso_ver", "caso_investigar", "caso_capturar", "missoes", "resgatar", "ranking"].includes(action)) {
                        if (!meIsOfficer) return safe(i.followUp({ content: "❌ Você não é polícia. Use **Candidatar** e aguarde aprovação.", ephemeral: true }));
                    }

                    if (action === "ranking") {
                        const map = pol.officerStats || new Map();
                        const entries = typeof map.entries === "function" ? Array.from(map.entries()) : Object.entries(map);
                        const top = entries
                            .map(([id, s]) => ({ id, s }))
                            .sort((a, b) => (Number(b.s.seizuresValue || 0) - Number(a.s.seizuresValue || 0)) || (Number(b.s.casesClosed || 0) - Number(a.s.casesClosed || 0)))
                            .slice(0, 10);
                        const lines = top.length
                            ? top.map((x, idx) => `**${idx + 1}.** <@${x.id}> — ${formatMoney(x.s.seizuresValue || 0)} apreendidos • ${x.s.casesClosed || 0} casos`).join("\n")
                            : "Sem dados ainda.";
                        const e = new Discord.MessageEmbed().setTitle("🏆 Ranking da Polícia").setColor("BLURPLE").setDescription(lines);
                        return safe(i.editReply({ embeds: [e], components: [row] }));
                    }

                    if (action === "casos") {
                        const list = await client.policeCasedb.find({ guildID: interaction.guildId, status: "open" }).sort({ createdAt: -1 }).limit(10).lean();
                        const lines = list.length
                            ? list.map((c) => `• **${c.caseId}** — suspeito <@${c.suspectId}> • ${c.progress || 0}% • ${formatMoney(c.estimatedValue || 0)}`).join("\n")
                            : "Nenhum caso aberto.";
                        const e = new Discord.MessageEmbed().setTitle("🗂️ Casos Abertos").setColor("BLURPLE").setDescription(lines);
                        return safe(i.editReply({ embeds: [e], components: [row] }));
                    }

                    if (action === "caso_ver") {
                        const idRaw = await promptOneLine(i, { prompt: "Digite o ID do caso (ex.: CASEABC123).", timeMs: 60000 });
                        if (!idRaw) return safe(i.followUp({ content: "⏳ Tempo esgotado.", ephemeral: true }));
                        const id = idRaw.trim().toUpperCase();
                        const c = await client.policeCasedb.findOne({ guildID: interaction.guildId, caseId: id });
                        if (!c) return safe(i.followUp({ content: "❌ Caso não encontrado.", ephemeral: true }));
                        const last = (c.evidence || []).slice(-6).map((e) => `• ${e.kind} <t:${Math.floor((e.at || 0) / 1000)}:R>`).join("\n") || "-";
                        const e = new Discord.MessageEmbed()
                            .setTitle(`🗂️ Caso ${c.caseId}`)
                            .setColor("DARK_BUT_NOT_BLACK")
                            .setDescription(`Suspeito: <@${c.suspectId}>\nStatus: **${c.status}**\nProgresso: **${c.progress || 0}%**`)
                            .addField("Valor estimado", formatMoney(c.estimatedValue || 0), true)
                            .addField("Risco", `${c.riskScore || 0}/100`, true)
                            .addField("Evidências recentes", last, false);
                        return safe(i.editReply({ embeds: [e], components: [row] }));
                    }

                    if (action === "caso_investigar") {
                        const idRaw = await promptOneLine(i, { prompt: "Digite o ID do caso para investigar.", timeMs: 60000 });
                        if (!idRaw) return safe(i.followUp({ content: "⏳ Tempo esgotado.", ephemeral: true }));
                        const id = idRaw.trim().toUpperCase();
                        const c = await client.policeCasedb.findOne({ guildID: interaction.guildId, caseId: id, status: "open" });
                        if (!c) return safe(i.followUp({ content: "❌ Caso não encontrado ou já encerrado.", ephemeral: true }));

                        const u = await client.blackMarketUserdb.getOrCreate(interaction.guildId, interaction.user.id);
                        const g = await client.blackMarketGuilddb.getOrCreate(interaction.guildId);
                        syncMissions(g, u);
                        const now = Date.now();
                        const cd = u.cooldowns?.patrol || 0;
                        if (now < cd) return safe(i.followUp({ content: `⏳ Investigação disponível <t:${Math.floor(cd / 1000)}:R>.`, ephemeral: true }));
                        u.cooldowns.patrol = now + 6 * 60 * 1000;

                        const inc = Math.floor(10 + Math.random() * 18);
                        c.progress = Math.min(100, Math.floor((c.progress || 0) + inc));
                        c.evidence.push({ at: now, kind: "analysis", by: interaction.user.id, data: { note: "cruzamento de dados" } });
                        c.evidence = c.evidence.slice(-50);
                        await c.save().catch(() => {});

                        applyMissionProgress(u, { side: "police", type: "patrol", delta: 1 });
                        await u.save().catch(() => {});
                        await g.save().catch(() => {});

                        const st = getOfficerStats(pol, interaction.user.id);
                        st.xp = Math.floor((st.xp || 0) + 12);
                        st.lastActionAt = now;
                        setOfficerStats(pol, interaction.user.id, st);
                        await pol.save().catch(() => {});

                        return safe(i.followUp({ content: `🔎 Caso **${c.caseId}** agora está em **${c.progress}%**.`, ephemeral: true }));
                    }

                    if (action === "caso_capturar") {
                        const idRaw = await promptOneLine(i, { prompt: "Digite o ID do caso para capturar.", timeMs: 60000 });
                        if (!idRaw) return safe(i.followUp({ content: "⏳ Tempo esgotado.", ephemeral: true }));
                        const id = idRaw.trim().toUpperCase();
                        const c = await client.policeCasedb.findOne({ guildID: interaction.guildId, caseId: id, status: "open" });
                        if (!c) return safe(i.followUp({ content: "❌ Caso não encontrado ou já encerrado.", ephemeral: true }));
                        if ((c.progress || 0) < 80) return safe(i.followUp({ content: "❌ Progresso insuficiente para capturar (mínimo 80%).", ephemeral: true }));

                        const now = Date.now();
                        const successChance = Math.min(0.92, 0.35 + (c.progress || 0) / 120);
                        const success = Math.random() < successChance;
                        if (!success) {
                            c.progress = Math.max(0, Math.floor((c.progress || 0) - 10));
                            c.evidence.push({ at: now, kind: "failed_capture", by: interaction.user.id, data: { note: "escapou" } });
                            c.evidence = c.evidence.slice(-50);
                            await c.save().catch(() => {});
                            return safe(i.followUp({ content: `❌ Falhou. Caso **${c.caseId}** caiu para **${c.progress}%**.`, ephemeral: true }));
                        }

                        const seizedValue = Math.floor((c.estimatedValue || 0) * (0.30 + Math.random() * 0.20));
                        const reward = Math.max(150, Math.floor(seizedValue * 0.15 + 150));

                        const eco = await client.guildEconomydb.getOrCreate(interaction.guildId);
                        if (!eco.policy) eco.policy = {};
                        if (eco.policy.treasury === undefined || eco.policy.treasury === null) eco.policy.treasury = 0;
                        const paid = Math.min(reward, Math.floor(eco.policy.treasury || 0));
                        eco.policy.treasury = Math.floor((eco.policy.treasury || 0) - paid);
                        await eco.save().catch(() => {});

                        if (paid > 0) await creditWallet(client.userdb, interaction.user.id, paid, "police_bounty", { guildId: interaction.guildId, caseId: c.caseId, seizedValue }).catch(() => {});

                        const tdb = await client.userdb.getOrCreate(c.suspectId);
                        if (!tdb.economia.restrictions) tdb.economia.restrictions = { bannedUntil: 0, blackMarketBannedUntil: 0, casinoBannedUntil: 0 };
                        const mins = 20 + Math.floor(Math.min(60, seizedValue / 200));
                        tdb.economia.restrictions.blackMarketBannedUntil = Math.max(tdb.economia.restrictions.blackMarketBannedUntil || 0, now + mins * 60 * 1000);
                        await tdb.save().catch(() => {});

                        c.status = "closed";
                        c.resolvedAt = now;
                        c.resolution = { kind: "capture", by: interaction.user.id, reward: paid, seizedValue };
                        c.evidence.push({ at: now, kind: "capture", by: interaction.user.id, data: { successChance, mins } });
                        c.evidence = c.evidence.slice(-50);
                        await c.save().catch(() => {});

                        const st = getOfficerStats(pol, interaction.user.id);
                        st.seizuresValue = Math.floor((st.seizuresValue || 0) + seizedValue);
                        st.seizuresCount = Math.floor((st.seizuresCount || 0) + 1);
                        st.casesClosed = Math.floor((st.casesClosed || 0) + 1);
                        st.xp = Math.floor((st.xp || 0) + 40);
                        st.lastActionAt = now;
                        setOfficerStats(pol, interaction.user.id, st);
                        await pol.save().catch(() => {});

                        await ensureTerritories(client, interaction.guildId);
                        const districtId = (c.evidence || []).slice().reverse().find((e) => e?.data?.districtId)?.data?.districtId || "central";
                        await applyPoliceInfluence(client, interaction.guildId, districtId, 14).catch(() => {});

                        const bmGuild = await client.blackMarketGuilddb.getOrCreate(interaction.guildId);
                        const bmUser = await client.blackMarketUserdb.getOrCreate(interaction.guildId, interaction.user.id);
                        syncMissions(bmGuild, bmUser);
                        applyMissionProgress(bmUser, { side: "police", type: "capture", delta: 1 });
                        await bmGuild.save().catch(() => {});
                        await bmUser.save().catch(() => {});

                        return safe(i.followUp({ content: `✅ Captura feita. Suspeito banido por **${mins} min**. Apreensão: **${formatMoney(seizedValue)}**. Recompensa paga: **${formatMoney(paid)}**.`, ephemeral: true }));
                    }

                    if (action === "checkpoint") {
                        const raw = await promptOneLine(i, { prompt: `Digite o distrito do checkpoint:\n${districtsText()}\n\nExemplo: \`central\``, timeMs: 60000 });
                        if (!raw) return safe(i.followUp({ content: "⏳ Tempo esgotado.", ephemeral: true }));
                        const districtId = raw.trim().toLowerCase();
                        if (!DISTRICTS.some((d) => d.id === districtId)) return safe(i.followUp({ content: "❌ Distrito inválido.", ephemeral: true }));

                        const g = await client.blackMarketGuilddb.getOrCreate(interaction.guildId);
                        if (!g.config) g.config = {};
                        if (!g.checkpoints) g.checkpoints = [];
                        const now = Date.now();
                        const max = Math.max(1, Math.floor(g.config.maxCheckpoints || 3));
                        const list = (g.checkpoints || []).filter((c) => (c.activeUntil || 0) > now);
                        if (list.length >= max) return safe(i.followUp({ content: `❌ Limite de checkpoints ativos atingido (${max}).`, ephemeral: true }));
                        const duration = Math.max(5 * 60 * 1000, Math.floor(g.config.checkpointDurationMs || 20 * 60 * 1000));
                        g.checkpoints = list.concat([{ districtId, createdAt: now, activeUntil: now + duration, placedBy: interaction.user.id }]).slice(-20);
                        await g.save().catch(() => {});

                        const u = await client.blackMarketUserdb.getOrCreate(interaction.guildId, interaction.user.id);
                        const cd = u.cooldowns?.checkpoint || 0;
                        if (now < cd) return safe(i.followUp({ content: `⏳ Checkpoint disponível <t:${Math.floor(cd / 1000)}:R>.`, ephemeral: true }));
                        u.cooldowns.checkpoint = now + 12 * 60 * 1000;
                        syncMissions(g, u);
                        applyMissionProgress(u, { side: "police", type: "checkpoint", delta: 1 });
                        await u.save().catch(() => {});

                        const st = getOfficerStats(pol, interaction.user.id);
                        st.checkpoints = Math.floor((st.checkpoints || 0) + 1);
                        st.xp = Math.floor((st.xp || 0) + 15);
                        st.lastActionAt = now;
                        setOfficerStats(pol, interaction.user.id, st);
                        await pol.save().catch(() => {});

                        return safe(i.followUp({ content: `✅ Checkpoint colocado em **${districtId}** por **${Math.floor(duration / 60000)} min**.`, ephemeral: true }));
                    }

                    if (action === "alertas") {
                        const now = Date.now();
                        const list = await client.policeCasedb
                            .find({
                                guildID: interaction.guildId,
                                status: "open",
                                hotUntil: { $gt: now },
                                kind: { $in: ["robbery", "trafficking", "laundering"] },
                            })
                            .sort({ hotUntil: 1 })
                            .limit(15)
                            .lean();

                        const kindName = (k) => (k === "robbery" ? "Assalto" : k === "trafficking" ? "Tráfico" : k === "laundering" ? "Lavagem" : k);
                        const lines = list.length
                            ? list
                                  .map((c) => {
                                      const district = (DISTRICTS.find((d) => d.id === c.districtId) || {}).name || (c.districtId || "—");
                                      return `• **${c.caseId}** — ${kindName(c.kind)} • **${district}** • suspeito <@${c.suspectId}> • termina <t:${Math.floor((c.hotUntil || 0) / 1000)}:R> • ${formatMoney(c.estimatedValue || 0)}`;
                                  })
                                  .join("\n")
                            : "Nenhum alerta ativo agora.";

                        const e = new Discord.MessageEmbed().setTitle("🚨 Alertas em Andamento").setColor("RED").setDescription(lines.slice(0, 3900));
                        return safe(i.editReply({ embeds: [e], components: [row] }));
                    }

                    if (action === "intervir") {
                        const raw = await promptOneLine(i, { prompt: "Digite o ID do caso (ex.: CASEABC123).", timeMs: 60000 });
                        if (!raw) return safe(i.followUp({ content: "⏳ Tempo esgotado.", ephemeral: true }));
                        const caseId = raw.trim().toUpperCase();
                        const now = Date.now();

                        const c = await client.policeCasedb.findOne({ guildID: interaction.guildId, caseId, status: "open" });
                        if (!c) return safe(i.followUp({ content: "❌ Caso não encontrado ou já encerrado.", ephemeral: true }));
                        if ((c.hotUntil || 0) <= now) return safe(i.followUp({ content: "❌ Esse alerta já expirou.", ephemeral: true }));

                        const districtId = c.districtId || "central";
                        const g = await client.blackMarketGuilddb.getOrCreate(interaction.guildId);
                        const patrolIntensity = Math.max(0, Math.min(1, Number(g.patrol?.intensity || 0.35)));
                        const checkpointActive = (g.checkpoints || []).some((cp) => cp.districtId === districtId && (cp.activeUntil || 0) > now);

                        const base = c.kind === "robbery" ? 0.62 : c.kind === "trafficking" ? 0.52 : 0.58;
                        const chance = Math.max(0.05, Math.min(0.9, base + patrolIntensity * 0.22 + (checkpointActive ? 0.12 : 0)));
                        const success = Math.random() < chance;

                        if (!success) {
                            c.evidence.push({ at: now, kind: "intervention_failed", by: interaction.user.id, data: { chance } });
                            c.evidence = c.evidence.slice(-50);
                            await c.save().catch(() => {});
                            return safe(i.followUp({ content: `❌ Intervenção falhou. Chance: ${(chance * 100).toFixed(0)}%.`, ephemeral: true }));
                        }

                        const suspect = await client.userdb.getOrCreate(c.suspectId);
                        const dirty = Math.max(0, Math.floor(suspect.economia?.dirtyMoney || 0));
                        const target = Math.max(0, Math.floor(c.estimatedValue || 0));
                        const seized = Math.max(0, Math.min(dirty, Math.max(1, Math.floor(target * 0.9))));

                        if (seized > 0) {
                            await client.userdb.updateOne({ userID: c.suspectId }, { $inc: { "economia.dirtyMoney": -seized } }).catch(() => {});
                        }

                        const mins = 12;
                        const until = now + mins * 60 * 1000;
                        await client.userdb.updateOne(
                            { userID: c.suspectId },
                            { $set: { "economia.restrictions.blackMarketBannedUntil": Math.max(Number(suspect.economia?.restrictions?.blackMarketBannedUntil || 0), until) } }
                        ).catch(() => {});

                        const reward = Math.max(0, Math.floor(seized * 0.25));
                        if (reward > 0) await creditWallet(client.userdb, interaction.user.id, reward, "police_intervention_reward", { guildId: interaction.guildId, caseId }).catch(() => {});

                        c.status = "closed";
                        c.resolvedAt = now;
                        c.resolution = { kind: "intercepted", by: interaction.user.id, reward, seizedValue: seized };
                        c.evidence.push({ at: now, kind: "intercepted", by: interaction.user.id, data: { seized, reward } });
                        c.evidence = c.evidence.slice(-50);
                        await c.save().catch(() => {});

                        const st = getOfficerStats(pol, interaction.user.id);
                        st.seizuresValue = Math.floor((st.seizuresValue || 0) + seized);
                        st.casesClosed = Math.floor((st.casesClosed || 0) + 1);
                        st.xp = Math.floor((st.xp || 0) + 18);
                        st.lastActionAt = now;
                        setOfficerStats(pol, interaction.user.id, st);
                        await pol.save().catch(() => {});

                        return safe(i.followUp({ content: `✅ Intervenção bem-sucedida. Apreendido: **${formatMoney(seized)}** (dinheiro sujo). Recompensa: **${formatMoney(reward)}**. Suspeito banido do Submundo por **${mins} min**.`, ephemeral: true }));
                    }

                    if (action === "patrulhar") {
                        const u = await client.blackMarketUserdb.getOrCreate(interaction.guildId, interaction.user.id);
                        const g = await client.blackMarketGuilddb.getOrCreate(interaction.guildId);
                        syncMissions(g, u);
                        const now = Date.now();
                        const cd = u.cooldowns?.patrol || 0;
                        if (now < cd) return safe(i.followUp({ content: `⏳ Patrulha disponível <t:${Math.floor(cd / 1000)}:R>.`, ephemeral: true }));
                        u.cooldowns.patrol = now + 7 * 60 * 1000;

                        const suspects = await client.blackMarketUserdb.find({ guildID: interaction.guildId, "heat.level": { $gte: 15 } }).sort({ "heat.level": -1 }).limit(20).lean();
                        const pick = suspects.length ? suspects[Math.floor(Math.random() * suspects.length)] : null;

                        const st = getOfficerStats(pol, interaction.user.id);
                        st.patrols = Math.floor((st.patrols || 0) + 1);
                        st.xp = Math.floor((st.xp || 0) + 10);
                        st.lastActionAt = now;
                        setOfficerStats(pol, interaction.user.id, st);
                        await pol.save().catch(() => {});

                        applyMissionProgress(u, { side: "police", type: "patrol", delta: 1 });
                        await u.save().catch(() => {});
                        await g.save().catch(() => {});
                        await ensureTerritories(client, interaction.guildId);
                        await applyPoliceInfluence(client, interaction.guildId, DISTRICTS[Math.floor(Math.random() * DISTRICTS.length)].id, 4).catch(() => {});

                        if (!pick) return safe(i.followUp({ content: "🚓 Patrulha concluída. Nada relevante hoje.", ephemeral: true }));

                        const chance = Math.min(0.75, 0.15 + (pick.heat?.level || 0) / 120);
                        const found = Math.random() < chance;
                        if (!found) return safe(i.followUp({ content: "🚓 Patrulha concluída. Nenhuma pista concreta.", ephemeral: true }));

                        const suspectMain = await client.userdb.getOrCreate(pick.userID);
                        const dirty = Math.max(0, Math.floor(suspectMain.economia?.dirtyMoney || 0));
                        if (dirty > 0 && Math.random() < 0.55) {
                            const seized = Math.max(1, Math.floor(dirty * (0.15 + Math.random() * 0.25)));
                            await client.userdb.updateOne({ userID: pick.userID }, { $inc: { "economia.dirtyMoney": -seized } }).catch(() => {});
                            const st2 = getOfficerStats(pol, interaction.user.id);
                            st2.seizuresValue = Math.floor((st2.seizuresValue || 0) + seized);
                            st2.xp = Math.floor((st2.xp || 0) + 12);
                            setOfficerStats(pol, interaction.user.id, st2);
                            await pol.save().catch(() => {});
                            return safe(i.followUp({ content: `🧾 Patrulha encontrou dinheiro sujo com <@${pick.userID}> e apreendeu **${formatMoney(seized)}**.`, ephemeral: true }));
                        }

                        const existing = await client.policeCasedb.findOne({ guildID: interaction.guildId, status: "open", suspectId: pick.userID }).sort({ createdAt: -1 });
                        if (existing) {
                            existing.progress = Math.min(100, Math.floor((existing.progress || 0) + 10 + chance * 20));
                            existing.evidence.push({ at: now, kind: "clue", by: interaction.user.id, data: { hint: "movimentação suspeita" } });
                            existing.evidence = existing.evidence.slice(-50);
                            await existing.save().catch(() => {});
                            return safe(i.followUp({ content: `🕵️ Pista encontrada. Caso **${existing.caseId}** agora está em **${existing.progress}%**.`, ephemeral: true }));
                        }

                        const caseId = `CASE${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
                        const districtId = pick.lastCrime?.districtId || "central";
                        await client.policeCasedb.create({
                            guildID: interaction.guildId,
                            caseId,
                            createdAt: now,
                            status: "open",
                            kind: "case",
                            districtId,
                            hotUntil: 0,
                            suspectId: pick.userID,
                            assignedTo: interaction.user.id,
                            progress: Math.floor(20 + chance * 30),
                            riskScore: Math.floor(chance * 100),
                            estimatedValue: Math.floor(500 + chance * 1500),
                            evidence: [{ at: now, kind: "clue", by: interaction.user.id, data: { hint: "relatos e pegadas", districtId } }],
                        });
                        return safe(i.followUp({ content: `🗂️ Novo caso aberto: **${caseId}** (suspeito: <@${pick.userID}>).`, ephemeral: true }));
                    }

                    if (action === "missoes") {
                        const g = await client.blackMarketGuilddb.getOrCreate(interaction.guildId);
                        const u = await client.blackMarketUserdb.getOrCreate(interaction.guildId, interaction.user.id);
                        syncMissions(g, u);
                        await g.save().catch(() => {});
                        await u.save().catch(() => {});
                        const now = Date.now();
                        const list = (u.missions || []).filter((m) => (m.resetsAt || 0) > now && String(m.missionId || "").includes(":police:"));
                        const lines = list
                            .slice(0, 10)
                            .map((m) => {
                                const def = parseMissionId(m.missionId);
                                const rewards = missionRewards(def);
                                const done = (m.progress || 0) >= (m.goal || def?.goal || 0);
                                const status = m.claimed ? "✅ resgatado" : done ? "🎁 pronto" : `${m.progress || 0}/${m.goal || def?.goal || 0}`;
                                return `• \`${m.missionId}\` — ${missionTitle(def)}\n  Progresso: **${status}** • Recompensa: **${formatMoney(rewards.money)}**`;
                            })
                            .join("\n")
                            .slice(0, 3900);
                        const e = new Discord.MessageEmbed().setTitle("📌 Missões Policiais").setColor("BLURPLE").setDescription(lines || "Nenhuma missão disponível.");
                        return safe(i.editReply({ embeds: [e], components: [row] }));
                    }

                    if (action === "resgatar") {
                        const g = await client.blackMarketGuilddb.getOrCreate(interaction.guildId);
                        const u = await client.blackMarketUserdb.getOrCreate(interaction.guildId, interaction.user.id);
                        syncMissions(g, u);
                        const id = await promptOneLine(i, { prompt: "Cole o ID da missão (da lista).", timeMs: 60000 });
                        if (!id) return safe(i.followUp({ content: "⏳ Tempo esgotado.", ephemeral: true }));
                        const m = (u.missions || []).find((x) => x.missionId === id.trim());
                        if (!m) return safe(i.followUp({ content: "❌ Missão não encontrada.", ephemeral: true }));
                        if (m.claimed) return safe(i.followUp({ content: "❌ Missão já resgatada.", ephemeral: true }));
                        const def = parseMissionId(m.missionId);
                        if (!def || def.side !== "police") return safe(i.followUp({ content: "❌ Missão inválida.", ephemeral: true }));
                        const goal = m.goal || def.goal || 0;
                        if ((m.progress || 0) < goal) return safe(i.followUp({ content: "❌ Missão ainda não concluída.", ephemeral: true }));

                        const rewards = missionRewards(def);
                        const eco = await client.guildEconomydb.getOrCreate(interaction.guildId);
                        if (!eco.policy) eco.policy = {};
                        if (eco.policy.treasury === undefined || eco.policy.treasury === null) eco.policy.treasury = 0;
                        const paid = Math.min(rewards.money, Math.floor(eco.policy.treasury || 0));
                        eco.policy.treasury = Math.floor((eco.policy.treasury || 0) - paid);
                        await eco.save().catch(() => {});
                        if (paid > 0) await creditWallet(client.userdb, interaction.user.id, paid, "police_mission_reward", { guildId: interaction.guildId, missionId: m.missionId }).catch(() => {});
                        m.claimed = true;
                        await u.save().catch(() => {});
                        return safe(i.followUp({ content: `✅ Missão resgatada: **${formatMoney(paid)}**.`, ephemeral: true }));
                    }
                } catch (err) {
                    logger.error("Erro no hub da Polícia", { error: String(err?.message || err) });
                    safe(i.followUp({ content: "Erro no hub da Polícia.", ephemeral: true })).catch(() => {});
                }
            });

            collector.on("end", () => {
                const disabledMenu = menu.setDisabled(true).setPlaceholder("Menu expirado");
                const disabledRow = new Discord.MessageActionRow().addComponents(disabledMenu);
                interaction.editReply({ components: [disabledRow] }).catch(() => {});
            });
        } catch (err) {
            logger.error("Erro na polícia", { error: String(err?.message || err) });
            replyOrEdit(interaction, { content: "Erro na polícia.", ephemeral: true }).catch(() => {});
        }
    },
};

