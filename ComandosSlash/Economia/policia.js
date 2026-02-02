const Discord = require("discord.js");
const { getPolice, isChief } = require("../../Utils/police");
const { ensureEconomyAllowed } = require("../../Utils/economyGuard");
const { formatMoney, creditWallet } = require("../../Utils/economy");
const { DISTRICTS } = require("../../Utils/blackMarketEngine");
const { syncMissions, parseMissionId, missionTitle, missionRewards, applyMissionProgress } = require("../../Utils/blackMarketMissions");
const { ensureTerritories, applyPoliceInfluence } = require("../../Utils/territoryEngine");

function embed(color, title, desc) {
    return new Discord.MessageEmbed().setColor(color).setTitle(title).setDescription(desc);
}

function canManage(interaction, police) {
    const isAdmin = interaction.member.permissions.has("MANAGE_GUILD");
    return isAdmin || isChief(police, interaction.user.id);
}

function canOperate(interaction, police) {
    const isAdmin = interaction.member.permissions.has("MANAGE_GUILD") || interaction.member.permissions.has("ADMINISTRATOR");
    return isAdmin || (police?.officers || []).includes(interaction.user.id) || police?.chiefId === interaction.user.id;
}

function toChoice(list) {
    return list.slice(0, 25).map((d) => ({ name: d.name, value: d.id }));
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

function genId(prefix = "CASE") {
    return `${prefix}${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

module.exports = {
    name: "policia",
    description: "Sistema de polícia econômica",
    type: "CHAT_INPUT",
    options: [
        {
            name: "definir_chefe",
            description: "Define o chefe de polícia (admin)",
            type: "SUB_COMMAND",
            options: [{ name: "usuario", description: "Chefe", type: "USER", required: true }],
        },
        {
            name: "candidatar",
            description: "Envia candidatura para polícia",
            type: "SUB_COMMAND",
            options: [{ name: "motivo", description: "Por que você quer ser polícia?", type: "STRING", required: false }],
        },
        {
            name: "pedidos",
            description: "Vê pedidos pendentes (chefe/admin)",
            type: "SUB_COMMAND",
        },
        {
            name: "aceitar",
            description: "Aceita candidatura (chefe/admin)",
            type: "SUB_COMMAND",
            options: [{ name: "usuario", description: "Candidato", type: "USER", required: true }],
        },
        {
            name: "recusar",
            description: "Recusa candidatura (chefe/admin)",
            type: "SUB_COMMAND",
            options: [{ name: "usuario", description: "Candidato", type: "USER", required: true }],
        },
        {
            name: "remover",
            description: "Remove policial (chefe/admin)",
            type: "SUB_COMMAND",
            options: [{ name: "usuario", description: "Policial", type: "USER", required: true }],
        },
        {
            name: "patrulhar",
            description: "Faz uma patrulha e tenta encontrar pistas",
            type: "SUB_COMMAND",
            options: [{ name: "distrito", description: "Distrito da patrulha", type: "STRING", required: false, choices: toChoice(DISTRICTS) }],
        },
        {
            name: "checkpoint",
            description: "Coloca um checkpoint estratégico",
            type: "SUB_COMMAND",
            options: [{ name: "distrito", description: "Distrito do checkpoint", type: "STRING", required: true, choices: toChoice(DISTRICTS) }],
        },
        {
            name: "casos",
            description: "Lista casos abertos do submundo",
            type: "SUB_COMMAND",
        },
        {
            name: "caso_ver",
            description: "Vê detalhes de um caso",
            type: "SUB_COMMAND",
            options: [{ name: "id", description: "ID do caso", type: "STRING", required: true }],
        },
        {
            name: "caso_investigar",
            description: "Avança a investigação de um caso",
            type: "SUB_COMMAND",
            options: [{ name: "id", description: "ID do caso", type: "STRING", required: true }],
        },
        {
            name: "caso_capturar",
            description: "Finaliza um caso e tenta capturar o suspeito",
            type: "SUB_COMMAND",
            options: [{ name: "id", description: "ID do caso", type: "STRING", required: true }],
        },
        {
            name: "ranking",
            description: "Ranking dos policiais mais eficientes",
            type: "SUB_COMMAND",
        },
        {
            name: "missoes",
            description: "Mostra missões policiais",
            type: "SUB_COMMAND",
        },
        {
            name: "missao_resgatar",
            description: "Resgata missão policial concluída",
            type: "SUB_COMMAND",
            options: [{ name: "id", description: "ID da missão", type: "STRING", required: true }],
        },
        {
            name: "status",
            description: "Mostra status da polícia",
            type: "SUB_COMMAND",
            options: [{ name: "usuario", description: "Usuário", type: "USER", required: false }],
        },
    ],
    run: async (client, interaction) => {
        try {
            const sub = interaction.options.getSubcommand();
            const police = await getPolice(client, interaction.guildId);
            if (!police) return interaction.reply({ content: "Erro: policia db não disponível.", ephemeral: true });

            if (sub === "ranking") {
                const map = police.officerStats || new Map();
                const entries = typeof map.entries === "function" ? Array.from(map.entries()) : Object.entries(map);
                const top = entries
                    .map(([id, s]) => ({ id, s }))
                    .sort((a, b) => (Number(b.s.seizuresValue || 0) - Number(a.s.seizuresValue || 0)) || (Number(b.s.casesClosed || 0) - Number(a.s.casesClosed || 0)))
                    .slice(0, 10);
                const lines = top.length
                    ? top.map((x, i) => `**${i + 1}.** <@${x.id}> — ${formatMoney(x.s.seizuresValue || 0)} apreendidos • ${x.s.casesClosed || 0} casos`).join("\n")
                    : "Sem dados ainda.";
                const e = new Discord.MessageEmbed()
                    .setTitle("🏆 Ranking da Polícia")
                    .setColor("BLURPLE")
                    .setDescription(lines);
                return interaction.reply({ embeds: [e] });
            }

            if (sub === "missoes" || sub === "missao_resgatar") {
                const gate = await ensureEconomyAllowed(client, interaction, interaction.user.id);
                if (!gate.ok) return interaction.reply({ embeds: [gate.embed], ephemeral: true });
                if (!canOperate(interaction, police)) return interaction.reply({ content: "❌ Você não é polícia.", ephemeral: true });
                if (!client.blackMarketGuilddb || !client.blackMarketUserdb) return interaction.reply({ content: "❌ Banco do evento indisponível.", ephemeral: true });

                const g = await client.blackMarketGuilddb.getOrCreate(interaction.guildId);
                const u = await client.blackMarketUserdb.getOrCreate(interaction.guildId, interaction.user.id);
                syncMissions(g, u);
                await g.save().catch(() => {});

                if (sub === "missoes") {
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
                    const e = new Discord.MessageEmbed()
                        .setTitle("📌 Missões Policiais")
                        .setColor("BLURPLE")
                        .setDescription(lines || "Nenhuma missão disponível.")
                        .setFooter({ text: "Use /policia missao_resgatar id:<missionId>" });
                    await u.save().catch(() => {});
                    return interaction.reply({ embeds: [e], ephemeral: true });
                }

                const id = String(interaction.options.getString("id") || "").trim();
                const m = (u.missions || []).find((x) => x.missionId === id);
                if (!m) return interaction.reply({ content: "❌ Missão não encontrada.", ephemeral: true });
                if (m.claimed) return interaction.reply({ content: "❌ Essa missão já foi resgatada.", ephemeral: true });
                const def = parseMissionId(m.missionId);
                if (!def || def.side !== "police") return interaction.reply({ content: "❌ Missão inválida.", ephemeral: true });
                const goal = m.goal || def.goal || 0;
                if ((m.progress || 0) < goal) return interaction.reply({ content: "❌ Missão ainda não concluída.", ephemeral: true });

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
                return interaction.reply({ content: `✅ Missão resgatada: **${formatMoney(paid)}**.`, ephemeral: true });
            }

            if (sub === "definir_chefe") {
                const isAdmin = interaction.member.permissions.has("MANAGE_GUILD");
                if (!isAdmin) return interaction.reply({ embeds: [embed("RED", "❌ Sem permissão", "Apenas admin pode definir o chefe.")], ephemeral: true });
                const u = interaction.options.getUser("usuario");
                if (u.bot) return interaction.reply({ embeds: [embed("RED", "❌ Inválido", "Não pode definir bot como chefe.")], ephemeral: true });
                police.chiefId = u.id;
                if (!Array.isArray(police.officers)) police.officers = [];
                if (!police.officers.includes(u.id)) police.officers.push(u.id);
                await police.save();
                return interaction.reply({ embeds: [embed("GREEN", "👮 Chefe definido", `Chefe de polícia: ${u}`)] });
            }

            if (sub === "status") {
                const u = interaction.options.getUser("usuario") || interaction.user;
                const role = police.chiefId === u.id ? "Chefe" : (police.officers || []).includes(u.id) ? "Polícia" : "Civil";
                const pending = (police.requests || []).some((r) => r.userId === u.id && r.status === "pending");
                const embedObj = new Discord.MessageEmbed()
                    .setTitle("👮 Polícia Econômica")
                    .setColor("BLURPLE")
                    .setDescription(`${u}\nCargo: **${role}**${pending ? "\n🕓 Pedido pendente." : ""}`)
                    .addFields(
                        { name: "Chefe", value: police.chiefId ? `<@${police.chiefId}>` : "-", inline: true },
                        { name: "Policiais", value: String((police.officers || []).length), inline: true }
                    );
                return interaction.reply({ embeds: [embedObj], ephemeral: u.id !== interaction.user.id });
            }

            if (["patrulhar", "checkpoint", "casos", "caso_ver", "caso_investigar", "caso_capturar"].includes(sub)) {
                const gate = await ensureEconomyAllowed(client, interaction, interaction.user.id);
                if (!gate.ok) return interaction.reply({ embeds: [gate.embed], ephemeral: true });
                if (!canOperate(interaction, police)) {
                    return interaction.reply({ content: "❌ Você não é polícia. Use `/policia candidatar` e aguarde aprovação.", ephemeral: true });
                }
            }

            if (sub === "patrulhar") {
                const bmUser = client.blackMarketUserdb ? await client.blackMarketUserdb.getOrCreate(interaction.guildId, interaction.user.id) : null;
                const bmGuild = client.blackMarketGuilddb ? await client.blackMarketGuilddb.getOrCreate(interaction.guildId) : null;
                const now = Date.now();
                const cd = bmUser?.cooldowns?.patrol || 0;
                if (bmUser && now < cd) return interaction.reply({ content: `⏳ Patrulha disponível <t:${Math.floor(cd / 1000)}:R>.`, ephemeral: true });
                if (bmUser) {
                    bmUser.cooldowns.patrol = now + 7 * 60 * 1000;
                    if (bmGuild) syncMissions(bmGuild, bmUser);
                    await bmUser.save().catch(() => {});
                    await bmGuild?.save().catch(() => {});
                }

                const districtId = interaction.options.getString("distrito") || DISTRICTS[Math.floor(Math.random() * DISTRICTS.length)].id;
                const suspects = client.blackMarketUserdb
                    ? await client.blackMarketUserdb.find({ guildID: interaction.guildId, "heat.level": { $gte: 15 } }).sort({ "heat.level": -1 }).limit(20).lean()
                    : [];
                const pick = suspects.length ? suspects[Math.floor(Math.random() * suspects.length)] : null;

                const stats = getOfficerStats(police, interaction.user.id);
                stats.patrols = Math.floor((stats.patrols || 0) + 1);
                stats.xp = Math.floor((stats.xp || 0) + 10);
                stats.lastActionAt = now;
                setOfficerStats(police, interaction.user.id, stats);
                await police.save().catch(() => {});

                if (bmUser) {
                    applyMissionProgress(bmUser, { side: "police", type: "patrol", delta: 1 });
                    await bmUser.save().catch(() => {});
                }

                if (!pick || !client.policeCasedb) {
                    return interaction.reply({ content: `🚓 Patrulha no distrito **${districtId}** concluída. Nenhuma pista relevante hoje.`, ephemeral: true });
                }

                const chance = Math.min(0.75, 0.15 + (pick.heat?.level || 0) / 120);
                const found = Math.random() < chance;
                if (!found) return interaction.reply({ content: `🚓 Patrulha no distrito **${districtId}** concluída. Nenhuma pista concreta.`, ephemeral: true });

                const existing = await client.policeCasedb.findOne({ guildID: interaction.guildId, status: "open", suspectId: pick.userID }).sort({ createdAt: -1 });
                if (existing) {
                    existing.progress = Math.min(100, Math.floor((existing.progress || 0) + 10 + chance * 20));
                    existing.evidence.push({ at: now, kind: "clue", by: interaction.user.id, data: { districtId, hint: "movimentação suspeita" } });
                    existing.evidence = existing.evidence.slice(-50);
                    await existing.save().catch(() => {});
                    return interaction.reply({ content: `🕵️ Pista encontrada. Caso **${existing.caseId}** avançou para **${existing.progress}%**.`, ephemeral: true });
                }

                const caseId = genId("CASE");
                await client.policeCasedb.create({
                    guildID: interaction.guildId,
                    caseId,
                    createdAt: now,
                    status: "open",
                    suspectId: pick.userID,
                    assignedTo: interaction.user.id,
                    progress: Math.floor(20 + chance * 30),
                    riskScore: Math.floor(chance * 100),
                    estimatedValue: Math.floor(500 + chance * 1500),
                    evidence: [{ at: now, kind: "clue", by: interaction.user.id, data: { districtId, hint: "relatos e pegadas" } }],
                });

                return interaction.reply({ content: `🗂️ Novo caso aberto: **${caseId}** (suspeito: <@${pick.userID}>).`, ephemeral: true });
            }

            if (sub === "checkpoint") {
                const bmGuild = client.blackMarketGuilddb ? await client.blackMarketGuilddb.getOrCreate(interaction.guildId) : null;
                if (!bmGuild) return interaction.reply({ content: "❌ Banco do evento indisponível.", ephemeral: true });
                const bmUser = client.blackMarketUserdb ? await client.blackMarketUserdb.getOrCreate(interaction.guildId, interaction.user.id) : null;
                const now = Date.now();
                const cd = bmUser?.cooldowns?.checkpoint || 0;
                if (bmUser && now < cd) return interaction.reply({ content: `⏳ Checkpoint disponível <t:${Math.floor(cd / 1000)}:R>.`, ephemeral: true });

                const districtId = interaction.options.getString("distrito");
                const cfg = bmGuild.config || {};
                const max = Math.max(1, Math.floor(cfg.maxCheckpoints || 3));
                const list = Array.isArray(bmGuild.checkpoints) ? bmGuild.checkpoints.filter((c) => (c.activeUntil || 0) > now) : [];
                if (list.length >= max) return interaction.reply({ content: `❌ Limite de checkpoints ativos atingido (${max}).`, ephemeral: true });

                const duration = Math.max(5 * 60 * 1000, Math.floor(cfg.checkpointDurationMs || 20 * 60 * 1000));
                bmGuild.checkpoints = list.concat([{ districtId, createdAt: now, activeUntil: now + duration, placedBy: interaction.user.id }]).slice(-20);
                await bmGuild.save().catch(() => {});

                if (bmUser) {
                    bmUser.cooldowns.checkpoint = now + 12 * 60 * 1000;
                    syncMissions(bmGuild, bmUser);
                    applyMissionProgress(bmUser, { side: "police", type: "checkpoint", delta: 1 });
                    await bmUser.save().catch(() => {});
                }

                const stats = getOfficerStats(police, interaction.user.id);
                stats.checkpoints = Math.floor((stats.checkpoints || 0) + 1);
                stats.xp = Math.floor((stats.xp || 0) + 15);
                stats.lastActionAt = now;
                setOfficerStats(police, interaction.user.id, stats);
                await police.save().catch(() => {});

                return interaction.reply({ content: `✅ Checkpoint colocado em **${districtId}** por **${Math.floor(duration / 60000)} min**.`, ephemeral: true });
            }

            if (sub === "casos") {
                if (!client.policeCasedb) return interaction.reply({ content: "❌ Banco de casos indisponível.", ephemeral: true });
                const list = await client.policeCasedb.find({ guildID: interaction.guildId, status: "open" }).sort({ createdAt: -1 }).limit(10).lean();
                const lines = list.length
                    ? list.map((c) => `• **${c.caseId}** — suspeito <@${c.suspectId}> • ${c.progress || 0}% • ${formatMoney(c.estimatedValue || 0)}`).join("\n")
                    : "Nenhum caso aberto.";
                const e = new Discord.MessageEmbed().setTitle("🗂️ Casos Abertos").setColor("BLURPLE").setDescription(lines);
                return interaction.reply({ embeds: [e], ephemeral: true });
            }

            if (sub === "caso_ver") {
                if (!client.policeCasedb) return interaction.reply({ content: "❌ Banco de casos indisponível.", ephemeral: true });
                const id = String(interaction.options.getString("id") || "").trim().toUpperCase();
                const c = await client.policeCasedb.findOne({ guildID: interaction.guildId, caseId: id });
                if (!c) return interaction.reply({ content: "❌ Caso não encontrado.", ephemeral: true });
                const last = (c.evidence || []).slice(-5).map((e) => `• ${e.kind} <t:${Math.floor((e.at || 0) / 1000)}:R>`).join("\n") || "-";
                const e = new Discord.MessageEmbed()
                    .setTitle(`🗂️ Caso ${c.caseId}`)
                    .setColor("DARK_BUT_NOT_BLACK")
                    .setDescription(`Suspeito: <@${c.suspectId}>\nStatus: **${c.status}**\nProgresso: **${c.progress || 0}%**`)
                    .addField("Valor estimado", formatMoney(c.estimatedValue || 0), true)
                    .addField("Risco", `${c.riskScore || 0}/100`, true)
                    .addField("Evidências recentes", last, false);
                return interaction.reply({ embeds: [e], ephemeral: true });
            }

            if (sub === "caso_investigar") {
                if (!client.policeCasedb) return interaction.reply({ content: "❌ Banco de casos indisponível.", ephemeral: true });
                const bmUser = client.blackMarketUserdb ? await client.blackMarketUserdb.getOrCreate(interaction.guildId, interaction.user.id) : null;
                const now = Date.now();
                const cd = bmUser?.cooldowns?.patrol || 0;
                if (bmUser && now < cd) return interaction.reply({ content: `⏳ Investigação disponível <t:${Math.floor(cd / 1000)}:R>.`, ephemeral: true });
                if (bmUser) {
                    bmUser.cooldowns.patrol = now + 6 * 60 * 1000;
                    await bmUser.save().catch(() => {});
                }

                const id = String(interaction.options.getString("id") || "").trim().toUpperCase();
                const c = await client.policeCasedb.findOne({ guildID: interaction.guildId, caseId: id, status: "open" });
                if (!c) return interaction.reply({ content: "❌ Caso não encontrado ou já encerrado.", ephemeral: true });
                const inc = Math.floor(10 + Math.random() * 18);
                c.progress = Math.min(100, Math.floor((c.progress || 0) + inc));
                c.evidence.push({ at: now, kind: "analysis", by: interaction.user.id, data: { note: "cruzamento de dados" } });
                c.evidence = c.evidence.slice(-50);
                await c.save().catch(() => {});

                const stats = getOfficerStats(police, interaction.user.id);
                stats.xp = Math.floor((stats.xp || 0) + 12);
                stats.lastActionAt = now;
                setOfficerStats(police, interaction.user.id, stats);
                await police.save().catch(() => {});

                return interaction.reply({ content: `🔎 Caso **${c.caseId}** avançou para **${c.progress}%**. ${c.progress >= 100 ? "Use `/policia caso_capturar`." : ""}`, ephemeral: true });
            }

            if (sub === "caso_capturar") {
                if (!client.policeCasedb) return interaction.reply({ content: "❌ Banco de casos indisponível.", ephemeral: true });
                const id = String(interaction.options.getString("id") || "").trim().toUpperCase();
                const c = await client.policeCasedb.findOne({ guildID: interaction.guildId, caseId: id, status: "open" });
                if (!c) return interaction.reply({ content: "❌ Caso não encontrado ou já encerrado.", ephemeral: true });
                if ((c.progress || 0) < 80) return interaction.reply({ content: "❌ Progresso insuficiente para capturar (mínimo 80%).", ephemeral: true });

                const now = Date.now();
                const successChance = Math.min(0.92, 0.35 + (c.progress || 0) / 120);
                const success = Math.random() < successChance;
                if (!success) {
                    c.progress = Math.max(0, Math.floor((c.progress || 0) - 10));
                    c.evidence.push({ at: now, kind: "failed_capture", by: interaction.user.id, data: { note: "escapou" } });
                    c.evidence = c.evidence.slice(-50);
                    await c.save().catch(() => {});
                    return interaction.reply({ content: `❌ A operação falhou. O suspeito escapou. Caso **${c.caseId}** caiu para **${c.progress}%**.`, ephemeral: true });
                }

                const seizedValue = Math.floor((c.estimatedValue || 0) * (0.30 + Math.random() * 0.20));
                const reward = Math.max(150, Math.floor(seizedValue * 0.15 + 150));

                const eco = await client.guildEconomydb.getOrCreate(interaction.guildId);
                if (!eco.policy) eco.policy = {};
                if (eco.policy.treasury === undefined || eco.policy.treasury === null) eco.policy.treasury = 0;
                const paid = Math.min(reward, Math.floor(eco.policy.treasury || 0));
                eco.policy.treasury = Math.floor((eco.policy.treasury || 0) - paid);
                await eco.save().catch(() => {});

                if (paid > 0) {
                    await creditWallet(client.userdb, interaction.user.id, paid, "police_bounty", { guildId: interaction.guildId, caseId: c.caseId, seizedValue }).catch(() => {});
                }

                const tdb = await client.userdb.getOrCreate(c.suspectId);
                if (!tdb.economia.restrictions) tdb.economia.restrictions = { bannedUntil: 0 };
                const mins = 20 + Math.floor(Math.min(60, seizedValue / 200));
                tdb.economia.restrictions.bannedUntil = Math.max(tdb.economia.restrictions.bannedUntil || 0, now + mins * 60 * 1000);
                await tdb.save().catch(() => {});

                c.status = "closed";
                c.resolvedAt = now;
                c.resolution = { kind: "capture", by: interaction.user.id, reward: paid, seizedValue };
                c.evidence.push({ at: now, kind: "capture", by: interaction.user.id, data: { successChance, mins } });
                c.evidence = c.evidence.slice(-50);
                await c.save().catch(() => {});

                const stats = getOfficerStats(police, interaction.user.id);
                stats.seizuresValue = Math.floor((stats.seizuresValue || 0) + seizedValue);
                stats.seizuresCount = Math.floor((stats.seizuresCount || 0) + 1);
                stats.casesClosed = Math.floor((stats.casesClosed || 0) + 1);
                stats.xp = Math.floor((stats.xp || 0) + 40);
                stats.lastActionAt = now;
                setOfficerStats(police, interaction.user.id, stats);
                await police.save().catch(() => {});

                await ensureTerritories(client, interaction.guildId);
                const districtId = (c.evidence || []).slice().reverse().find((e) => e?.data?.districtId)?.data?.districtId || "central";
                await applyPoliceInfluence(client, interaction.guildId, districtId, 14).catch(() => {});

                const bmGuild = client.blackMarketGuilddb ? await client.blackMarketGuilddb.getOrCreate(interaction.guildId) : null;
                const bmUser = client.blackMarketUserdb ? await client.blackMarketUserdb.getOrCreate(interaction.guildId, interaction.user.id) : null;
                if (bmGuild && bmUser) {
                    syncMissions(bmGuild, bmUser);
                    applyMissionProgress(bmUser, { side: "police", type: "capture", delta: 1 });
                    await bmGuild.save().catch(() => {});
                    await bmUser.save().catch(() => {});
                }

                return interaction.reply({
                    content: `✅ Captura efetuada. Suspeito banido por **${mins} min**. Apreensão estimada: **${formatMoney(seizedValue)}**. Recompensa paga: **${formatMoney(paid)}**.`,
                    ephemeral: true,
                });
            }

            if (sub === "candidatar") {
                if (!police.chiefId) {
                    return interaction.reply({ embeds: [embed("YELLOW", "⚠️ Sem chefe", "Ainda não há chefe de polícia. Um admin deve usar `/policia definir_chefe`." )], ephemeral: true });
                }
                if ((police.officers || []).includes(interaction.user.id)) {
                    return interaction.reply({ embeds: [embed("YELLOW", "✅ Você já é polícia", "Você já possui acesso ao /investigar.")], ephemeral: true });
                }
                const exists = (police.requests || []).some((r) => r.userId === interaction.user.id && r.status === "pending");
                if (exists) return interaction.reply({ embeds: [embed("YELLOW", "🕓 Já enviado", "Você já tem um pedido pendente.")], ephemeral: true });

                const reason = (interaction.options.getString("motivo") || "").slice(0, 200);
                police.requests.push({ at: Date.now(), userId: interaction.user.id, reason, status: "pending", decidedAt: 0, decidedBy: null });
                police.requests = police.requests.slice(-50);
                await police.save();

                return interaction.reply({
                    embeds: [embed("GREEN", "📨 Pedido enviado", `Seu pedido foi enviado para o chefe: <@${police.chiefId}>.`)],
                    ephemeral: true,
                });
            }

            if (sub === "pedidos") {
                if (!canManage(interaction, police)) {
                    return interaction.reply({ embeds: [embed("RED", "❌ Sem permissão", "Apenas chefe/admin pode ver pedidos.")], ephemeral: true });
                }

                const pendings = (police.requests || []).filter((r) => r.status === "pending").slice(-10).reverse();
                const lines = pendings.map((r) => {
                    const why = r.reason ? ` — ${r.reason}` : "";
                    return `• <@${r.userId}> <t:${Math.floor((r.at || 0) / 1000)}:R>${why}`;
                });
                const e = new Discord.MessageEmbed()
                    .setTitle("📥 Pedidos de Polícia")
                    .setColor("BLURPLE")
                    .setDescription(lines.length ? lines.join("\n") : "Nenhum pedido pendente.")
                    .setFooter({ text: "Use /policia aceitar ou /policia recusar" });
                return interaction.reply({ embeds: [e], ephemeral: true });
            }

            if (sub === "aceitar" || sub === "recusar") {
                if (!canManage(interaction, police)) {
                    return interaction.reply({ embeds: [embed("RED", "❌ Sem permissão", "Apenas chefe/admin pode decidir.")], ephemeral: true });
                }
                const u = interaction.options.getUser("usuario");
                const req = (police.requests || []).slice().reverse().find((r) => r.userId === u.id && r.status === "pending");
                if (!req) return interaction.reply({ embeds: [embed("YELLOW", "⚠️ Sem pedido", "Não há pedido pendente desse usuário.")], ephemeral: true });
                req.status = sub === "aceitar" ? "accepted" : "rejected";
                req.decidedAt = Date.now();
                req.decidedBy = interaction.user.id;
                if (sub === "aceitar") {
                    if (!Array.isArray(police.officers)) police.officers = [];
                    if (!police.officers.includes(u.id)) police.officers.push(u.id);
                }
                await police.save();
                return interaction.reply({ embeds: [embed("GREEN", "✅ Decisão registrada", `${u} foi ${sub === "aceitar" ? "aceito" : "recusado"}.`)] });
            }

            if (sub === "remover") {
                if (!canManage(interaction, police)) {
                    return interaction.reply({ embeds: [embed("RED", "❌ Sem permissão", "Apenas chefe/admin pode remover.")], ephemeral: true });
                }
                const u = interaction.options.getUser("usuario");
                police.officers = (police.officers || []).filter((id) => id !== u.id);
                if (police.chiefId === u.id) police.chiefId = null;
                await police.save();
                return interaction.reply({ embeds: [embed("GREEN", "👮 Removido", `${u} não faz mais parte da polícia.`)] });
            }

        } catch (err) {
            console.error(err);
            if (interaction.deferred || interaction.replied) {
                interaction.editReply({ content: "Erro na polícia.", embeds: [], components: [] }).catch(() => {});
            } else {
                interaction.reply({ content: "Erro na polícia.", ephemeral: true }).catch(() => {});
            }
        }
    }
};
