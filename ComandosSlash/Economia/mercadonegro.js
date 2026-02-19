const Discord = require("../../Utils/djs");
const { getRandomGifUrl } = require("../../Utils/giphy");
const { ensureEconomyAllowed } = require("../../Utils/economyGuard");
const { formatMoney, debitWalletIfEnough, creditWallet, errorEmbed, creditDirtyMoney, debitDirtyMoneyIfEnough } = require("../../Utils/economy");
const { bumpRate } = require("../../Utils/antiCheat");
const { DISTRICTS, ITEMS, VENDORS, REP_LEVELS, computeRepLevel, getRepLevelName, ensureVendorState, computeDynamicPrice, computeInterceptChance, addInventory, removeInventory, decayHeat, updateDemandEma } = require("../../Utils/blackMarketEngine");
const { syncMissions, applyMissionProgress, parseMissionId, missionTitle, missionRewards } = require("../../Utils/blackMarketMissions");
const { ensureTerritories, applyCriminalInfluence, applyPoliceInfluence } = require("../../Utils/territoryEngine");
const { safe, promptOneLine } = require("../../Utils/interactions");
const logger = require("../../Utils/logger");
const { replyOrEdit } = require("../../Utils/commandKit");
const { applyWDAFooter } = require("../../Utils/embeds");

function isAdmin(interaction) {
    return (
        interaction.member?.permissions?.has("ADMINISTRATOR") ||
        interaction.member?.permissions?.has("MANAGE_GUILD")
    );
}

function pickDistrict(id) {
    if (!id) return DISTRICTS[Math.floor(Math.random() * DISTRICTS.length)];
    return DISTRICTS.find((d) => d.id === id) || DISTRICTS[0];
}

function parseIntSafe(v) {
    const n = Math.floor(Number(v));
    return Number.isFinite(n) ? n : null;
}

async function getGuildEvent(client, guildId) {
    const g = await client.blackMarketGuilddb.getOrCreate(guildId);
    if (!g.config) g.config = {};
    if (!g.heat) g.heat = { level: 0, lastUpdateAt: 0 };
    if (!g.patrol) g.patrol = { intensity: 0.35, lastTickAt: 0 };
    if (!g.checkpoints) g.checkpoints = [];
    if (!g.announce) g.announce = { channelId: null, pingEveryone: false, policeRoleId: null, alertPolice: true };
    if (!g.config.crime) g.config.crime = {};
    if (!g.config.crime.robbery) g.config.crime.robbery = { enabled: true, durationMs: 90 * 1000, cooldownMs: 8 * 60 * 1000, minDirty: 250, maxDirty: 1800, alertChance: 0.65 };
    if (!g.config.crime.trafficking) g.config.crime.trafficking = { enabled: true, durationMs: 120 * 1000, cooldownMs: 10 * 60 * 1000, minDirty: 400, maxDirty: 2600, costMin: 200, costMax: 1200, alertChance: 0.75 };
    if (!g.config.crime.laundering) g.config.crime.laundering = { enabled: true, cooldownMs: 6 * 60 * 1000, feePct: 0.18, riskBase: 0.12 };
    ensureVendorState(g);
    return g;
}

async function getUserEvent(client, guildId, userId) {
    const u = await client.blackMarketUserdb.getOrCreate(guildId, userId);
    if (!u.reputation) u.reputation = { score: 0, level: 0, lastUpdateAt: 0 };
    if (!u.heat) u.heat = { level: 0, lastUpdateAt: 0 };
    if (!u.inventory) u.inventory = new Map();
    if (!u.stats) u.stats = { criminalProfit: 0, criminalRuns: 0, seizedCount: 0, seizedValue: 0 };
    if (!u.cooldowns) u.cooldowns = { blackmarket: 0, patrol: 0, checkpoint: 0, robbery: 0, trafficking: 0, laundering: 0 };
    if (!u.lastCrime) u.lastCrime = { at: 0, districtId: null, kind: null };
    if (!u.operation) u.operation = { active: false, kind: null, districtId: null, caseId: null, startedAt: 0, endsAt: 0, dirtyPayout: 0, cleanCost: 0 };
    if (!u.antiCheat) u.antiCheat = { strikes: 0, lockedUntil: 0, windowStartAt: 0, windowCount: 0 };
    return u;
}

function ensureRep(userDoc) {
    const score = Math.floor(Number(userDoc.reputation?.score || 0));
    const level = computeRepLevel(score);
    userDoc.reputation.score = score;
    userDoc.reputation.level = level;
    return { score, level, name: getRepLevelName(level) };
}

function districtsText() {
    return DISTRICTS.map((d) => `• **${d.id}** — ${d.name}`).join("\n");
}

function vendorsText() {
    return VENDORS.map((v) => `• **${v.vendorId}** — ${v.name}`).join("\n");
}

function itemUnlockName(level) {
    return (REP_LEVELS.find((r) => r.level === level) || REP_LEVELS[0]).name;
}

async function createPoliceCaseIfPossible(client, { guildId, suspectId, districtId, itemId, qty, totalValue, chance, checkpointActive }) {
    if (!client.policeCasedb) return;
    const caseId = `CASE${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    await client.policeCasedb
        .create({
            guildID: guildId,
            caseId,
            createdAt: Date.now(),
            status: "open",
            kind: "case",
            districtId: districtId || null,
            hotUntil: 0,
            suspectId,
            progress: Math.floor(20 + chance * 40),
            riskScore: Math.floor(chance * 100),
            estimatedValue: Math.floor(totalValue),
            evidence: [
                {
                    at: Date.now(),
                    kind: "intercept",
                    by: null,
                    data: { districtId, itemId, qty, totalValue: Math.floor(totalValue), chance, checkpointActive },
                },
            ],
        })
        .catch(() => {});
}

async function createHotPoliceCase(client, { guildId, suspectId, kind, districtId, hotUntil, estimatedValue, data }) {
    if (!client.policeCasedb) return null;
    for (let tries = 0; tries < 4; tries++) {
        const caseId = `CASE${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
        try {
            await client.policeCasedb.create({
                guildID: guildId,
                caseId,
                createdAt: Date.now(),
                status: "open",
                kind,
                districtId: districtId || null,
                hotUntil: Math.max(0, Number(hotUntil || 0)),
                suspectId,
                progress: 0,
                riskScore: 0,
                estimatedValue: Math.floor(estimatedValue || 0),
                evidence: [
                    { at: Date.now(), kind: "alert", by: null, data: data || {} },
                ],
            });
            return caseId;
        } catch (e) {
            if (String(e?.code) === "11000") continue;
            return null;
        }
    }
    return null;
}

async function trySendAlert(client, guildDoc, payload) {
    const channelId = guildDoc?.announce?.channelId || null;
    if (!channelId) return false;
    const content = guildDoc.announce?.alertPolice
        ? (guildDoc.announce?.policeRoleId ? `<@&${guildDoc.announce.policeRoleId}>` : (guildDoc.announce?.pingEveryone ? "@everyone" : null))
        : null;
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel || typeof channel.send !== "function") return false;
    await channel.send({ ...(payload || {}), ...(content ? { content } : {}) }).catch(() => {});
    return true;
}

function rollOutcome() {
    const r = Math.random();
    if (r < 0.10) return { type: "lose_all" };
    if (r < 0.25) return { type: "ban" };
    if (r < 0.45) return { type: "small_win", mult: 1.5 };
    if (r < 0.70) return { type: "win", mult: 2.0 };
    if (r < 0.90) return { type: "big_win", mult: 3.0 };
    return { type: "jackpot", mult: 5.0 };
}

module.exports = {
    name: "mercadonegro",
    description: "Hub do Mercado Negro: NPCs, itens, reputação, missões e risco",
    type: "CHAT_INPUT",
    autoDefer: { ephemeral: true },
    hubActions: [
        "Status (reputação, heat e patrulha)",
        "Vendedores (NPCs) — estoque e preços",
        "Comprar item — negociar mercadoria ilícita",
        "Vender item — vender mercadoria ilícita",
        "Inventário — seus itens ilícitos",
        "Comprar reputação — dinheiro -> reputação do submundo",
        "Assalto — ganhar dinheiro sujo (alerta policial)",
        "Tráfico — rota de entrega (alerta policial)",
        "Lavagem (fachada) — igreja/ong/oficina (dinheiro sujo -> limpo)",
        "Missões — diárias e semanais",
        "Resgatar missão — pegar recompensa",
        "Ranking — lucro do submundo",
        "Caixa ilegal (cassino) — aposta arriscada",
        "Configurar anúncios (ADM)",
        "Ativar/desativar evento (ADM)",
    ],
    run: async (client, interaction) => {
        try {
            if (!client.blackMarketGuilddb || !client.blackMarketUserdb || !client.userdb || !client.guildEconomydb) {
                return replyOrEdit(interaction, { content: "❌ Banco do evento indisponível.", ephemeral: true });
            }

            const bmGuild = await getGuildEvent(client, interaction.guildId);
            const bmUser = await getUserEvent(client, interaction.guildId, interaction.user.id);
            const rep = ensureRep(bmUser);

            const menu = new Discord.StringSelectMenuBuilder()
                .setCustomId("mercadonegro_hub_action")
                .setPlaceholder("Selecionar comando...")
                .addOptions([
                    { label: "Status", value: "status", description: "Reputação, heat e patrulha" },
                    { label: "Vendedores (NPCs)", value: "vendedores", description: "Estoque e preços" },
                    { label: "Comprar item", value: "comprar_item", description: "Comprar mercadoria ilícita" },
                    { label: "Vender item", value: "vender_item", description: "Vender mercadoria ilícita" },
                    { label: "Inventário", value: "inventario", description: "Seus itens ilícitos" },
                    { label: "Comprar reputação", value: "comprar_rep", description: "Dinheiro -> reputação" },
                    { label: "Assalto", value: "assalto", description: "Ganhar dinheiro sujo (risco)" },
                    { label: "Tráfico", value: "trafico", description: "Entrega ilícita (risco)" },
                    { label: "Lavagem (fachada)", value: "lavar", description: "Converter dinheiro sujo" },
                    { label: "Missões", value: "missoes", description: "Diárias e semanais" },
                    { label: "Resgatar missão", value: "resgatar", description: "Pegar recompensa" },
                    { label: "Ranking", value: "ranking", description: "Lucro do submundo" },
                    { label: "Caixa ilegal (cassino)", value: "caixa", description: "Aposta arriscada" },
                    { label: "Configurar anúncios (ADM)", value: "config", description: "Canal e ping" },
                    { label: "Ativar/desativar (ADM)", value: "toggle", description: "Liga/desliga o evento" },
                ]);

            const row = new Discord.ActionRowBuilder().addComponents(menu);

            const home = new Discord.EmbedBuilder()
                .setTitle("💣 HUB DO MERCADO NEGRO")
                .setColor("DarkButNotBlack")
                .setDescription("Escolha no menu. Se eu pedir algo, você digita e a mensagem é apagada.")
                .addFields(
                    { name: "Evento", value: bmGuild.active ? "✅ Ativo" : "⚠️ Desativado", inline: true },
                    { name: "Reputação", value: `**${rep.name}** (${rep.score} pts)`, inline: true },
                    { name: "Heat", value: `**${Math.floor(bmUser.heat.level || 0)}**`, inline: true },
                    { name: "Dica", value: "Comece em **Vendedores (NPCs)** → **Comprar item**.", inline: false }
                );
            applyWDAFooter(home);

            await replyOrEdit(interaction, { embeds: [home], components: [row], ephemeral: true });
            const msg = await interaction.fetchReply();

            const collector = msg.createMessageComponentCollector({ componentType: Discord.ComponentType.StringSelect, idle: 5 * 60 * 1000 });
            collector.on("collect", async (i) => {
                try {
                    if (i.user.id !== interaction.user.id) return safe(i.reply({ content: "❌ Esse menu é do autor do comando.", ephemeral: true }));
                    const action = i.values[0];
                    await safe(i.deferUpdate());

                    const gate = await ensureEconomyAllowed(client, interaction, interaction.user.id);
                    if (!gate.ok) return safe(i.followUp({ embeds: [gate.embed], ephemeral: true }));

                    const g = await getGuildEvent(client, interaction.guildId);
                    const u = await getUserEvent(client, interaction.guildId, interaction.user.id);
                    const now = Date.now();

                    const decayed = decayHeat({
                        level: u.heat.level,
                        lastUpdateAt: u.heat.lastUpdateAt,
                        decayPerHour: (g.config.heatDecayPerHour || 4) * 0.6,
                    });
                    u.heat.level = decayed.level;
                    u.heat.lastUpdateAt = decayed.lastUpdateAt;

                    syncMissions(g, u);
                    await g.save().catch(() => {});
                    await u.save().catch(() => {});

                    const mainUser = await client.userdb.getOrCreate(interaction.user.id);
                    if (!mainUser.economia.restrictions) mainUser.economia.restrictions = { bannedUntil: 0, blackMarketBannedUntil: 0, casinoBannedUntil: 0 };
                    const bmBan = Number(mainUser.economia.restrictions.blackMarketBannedUntil || 0);
                    const casinoBan = Number(mainUser.economia.restrictions.casinoBannedUntil || 0);
                    if (bmBan && now < bmBan && ["comprar_item", "vender_item", "comprar_rep", "assalto", "trafico", "lavar", "resgatar"].includes(action)) {
                        return safe(i.followUp({ content: `⛔ Você está banido do Mercado Negro até <t:${Math.floor(bmBan / 1000)}:R>.`, ephemeral: true }));
                    }
                    if (casinoBan && now < casinoBan && action === "caixa") {
                        return safe(i.followUp({ content: `⛔ Você está banido do Cassino até <t:${Math.floor(casinoBan / 1000)}:R>.`, ephemeral: true }));
                    }

                    if (action === "status") {
                        const repNow = ensureRep(u);
                        const patrolPct = Math.floor((g.patrol?.intensity || 0.35) * 100);
                        const discountUntil = Number(g.config.discountUntil || 0);
                        const discText = discountUntil > now ? `✅ Leilão ativo até <t:${Math.floor(discountUntil / 1000)}:R> (x${Number(g.config.discountMultiplier || 1).toFixed(2)})` : "—";
                        const dirty = Math.max(0, Math.floor(mainUser.economia?.dirtyMoney || 0));
                        const op = u.operation || {};
                        const opText = op.active
                            ? `**${String(op.kind || "operação")}** em **${pickDistrict(op.districtId).name}** • termina <t:${Math.floor((op.endsAt || 0) / 1000)}:R>`
                            : "—";

                        const e = new Discord.EmbedBuilder()
                            .setTitle("💣 Status do Submundo")
                            .setColor("DarkButNotBlack")
                            .setDescription(g.active ? "✅ Evento ativo." : "⚠️ Evento desativado (admin pode ativar).")
                            .addFields(
                                { name: "Reputação", value: `**${repNow.name}** (${repNow.score} pts)`, inline: true },
                                { name: "Heat", value: `**${Math.floor(u.heat.level || 0)}**`, inline: true },
                                { name: "Patrulha (servidor)", value: `**${patrolPct}%**`, inline: true },
                                { name: "Dinheiro sujo", value: formatMoney(dirty), inline: true },
                                { name: "Operação", value: opText, inline: false },
                                { name: "Evento relâmpago", value: discText, inline: false }
                            );
                        return safe(i.editReply({ embeds: [e], components: [row] }));
                    }

                    if (action === "vendedores") {
                        const repNow = ensureRep(u);
                        ensureVendorState(g);
                        const embed = new Discord.EmbedBuilder()
                            .setTitle("🕶️ NPCs do Mercado Negro")
                            .setColor("Blurple")
                            .setDescription("Use **Comprar item** e informe `NPC ITEM QTD [distrito]`.");

                        for (const vd of g.vendors || []) {
                            const catalog = VENDORS.find((x) => x.vendorId === vd.vendorId);
                            const name = catalog?.name || vd.name || vd.vendorId;
                            const restock = vd.nextRestockAt ? `<t:${Math.floor(vd.nextRestockAt / 1000)}:R>` : "-";
                            const stock = vd.stock || new Map();
                            const lines = [];
                            const pool = catalog?.pool || [];
                            for (const p of pool) {
                                const item = ITEMS[p.itemId];
                                if (!item) continue;
                                const qty = typeof stock.get === "function" ? Number(stock.get(p.itemId) || 0) : Number(stock[p.itemId] || 0);
                                const locked = repNow.level < item.minLevel ? "🔒" : "✅";
                                const priceInfo = computeDynamicPrice({ guildDoc: g, userDoc: u, itemId: p.itemId, districtId: "central", side: "buy" });
                                const price = priceInfo ? formatMoney(priceInfo.buyPriceRaw) : "-";
                                lines.push(`${locked} **${item.id}** — ${item.name} • ${price} • estoque ${qty}`);
                            }
                            embed.addFields({ name: `${name} (${vd.vendorId})`, value: `Reabastece: ${restock}\n${lines.join("\n").slice(0, 900)}`, inline: false });
                        }

                        return safe(i.editReply({ embeds: [embed], components: [row] }));
                    }

                    if (action === "inventario") {
                        const repNow = ensureRep(u);
                        const inv = u.inventory || new Map();
                        const entries = typeof inv.entries === "function" ? Array.from(inv.entries()) : Object.entries(inv);
                        const lines = entries
                            .filter(([, q]) => Number(q) > 0)
                            .slice(0, 25)
                            .map(([k, q]) => {
                                const item = ITEMS[k];
                                return item ? `• **${item.id}** (${item.name}) — **${q}**` : `• **${k}** — **${q}**`;
                            });
                        const e = new Discord.EmbedBuilder()
                            .setTitle("🎒 Inventário Ilícito")
                            .setColor("DarkButNotBlack")
                            .setDescription(lines.length ? lines.join("\n") : "Você não tem itens ilícitos.")
                            .addFields(
                                { name: "Reputação", value: `**${repNow.name}** (${repNow.score} pts)`, inline: true },
                                { name: "Heat", value: `**${Math.floor(u.heat.level || 0)}**`, inline: true },
                                { name: "Dinheiro sujo", value: formatMoney(Math.max(0, Math.floor(mainUser.economia?.dirtyMoney || 0))), inline: true }
                            );
                        return safe(i.editReply({ embeds: [e], components: [row] }));
                    }

                    if (action === "comprar_rep") {
                        if (!g.config.dailyResetAt) g.config.dailyResetAt = Date.now() + 24 * 60 * 60 * 1000;
                        if (!g.config.repShop) g.config.repShop = { enabled: true, pricePerRep: 120, maxPerDay: 250 };
                        if (!u.stats) u.stats = {};

                        const shop = g.config.repShop;
                        if (!shop.enabled) return safe(i.followUp({ content: "❌ Compra de reputação está desativada.", ephemeral: true }));

                        const now2 = Date.now();
                        if (!u.stats.repBoughtResetAt || now2 >= u.stats.repBoughtResetAt) {
                            u.stats.repBoughtToday = 0;
                            u.stats.repBoughtResetAt = g.config.dailyResetAt;
                        }
                        const bought = Math.max(0, Math.floor(u.stats.repBoughtToday || 0));
                        const maxPerDay = Math.max(0, Math.floor(shop.maxPerDay || 0));
                        const remaining = Math.max(0, maxPerDay - bought);
                        if (remaining <= 0) {
                            return safe(i.followUp({ content: `⛔ Limite diário atingido. Volta em <t:${Math.floor((u.stats.repBoughtResetAt || 0) / 1000)}:R>.`, ephemeral: true }));
                        }

                        const raw = await promptOneLine(i, { prompt: `Quantos pontos de reputação comprar? (1-${remaining})`, timeMs: 60000 });
                        if (!raw) return safe(i.followUp({ content: "⏳ Tempo esgotado.", ephemeral: true }));
                        const points = Math.max(1, Math.floor(Number(String(raw).replace(/\./g, "").replace(/,/g, ".")) || 0));
                        if (!Number.isFinite(points) || points <= 0 || points > remaining) return safe(i.followUp({ content: "❌ Quantidade inválida.", ephemeral: true }));

                        const pricePerRep = Math.max(1, Math.floor(shop.pricePerRep || 120));
                        const cost = Math.floor(points * pricePerRep);
                        const paid = await debitWalletIfEnough(client.userdb, interaction.user.id, cost, "blackmarket_rep_buy", { guildId: interaction.guildId, points });
                        if (!paid) return safe(i.followUp({ content: `❌ Você precisa de ${formatMoney(cost)} na carteira.`, ephemeral: true }));

                        ensureRep(u);
                        u.reputation.score = Math.floor((u.reputation.score || 0) + points);
                        u.stats.repBoughtToday = bought + points;
                        u.stats.repBoughtResetAt = g.config.dailyResetAt;
                        ensureRep(u);
                        await u.save().catch(() => {});
                        await g.save().catch(() => {});

                        return safe(i.followUp({ content: `✅ Você comprou **${points} rep** por ${formatMoney(cost)}.`, ephemeral: true }));
                    }

                    if (action === "assalto") {
                        const cfg = g.config.crime?.robbery || {};
                        if (!cfg.enabled) return safe(i.followUp({ content: "❌ Assaltos estão desativados.", ephemeral: true }));

                        if (u.operation?.active) {
                            if (u.operation.kind === "robbery") {
                                const endsAt = Number(u.operation.endsAt || 0);
                                if (now < endsAt) {
                                    return safe(i.followUp({ content: `⏳ Assalto em andamento. Termina <t:${Math.floor(endsAt / 1000)}:R>.`, ephemeral: true }));
                                }

                                let blocked = false;
                                if (u.operation.caseId && client.policeCasedb) {
                                    const c = await client.policeCasedb.findOne({ guildID: interaction.guildId, caseId: u.operation.caseId }).lean();
                                    if (c && c.status !== "open") blocked = true;
                                }

                                if (blocked) {
                                    u.operation = { active: false, kind: null, districtId: null, caseId: null, startedAt: 0, endsAt: 0, dirtyPayout: 0, cleanCost: 0 };
                                    await u.save().catch(() => {});
                                    return safe(i.followUp({ content: "🚨 Assalto interrompido pela polícia. Você fugiu de mãos vazias.", ephemeral: true }));
                                }

                                const payout = Math.max(0, Math.floor(u.operation.dirtyPayout || 0));
                                if (payout > 0) await creditDirtyMoney(client.userdb, interaction.user.id, payout, "robbery_payout", { guildId: interaction.guildId, districtId: u.operation.districtId, caseId: u.operation.caseId }).catch(() => {});
                                u.stats.criminalProfit = Math.floor((u.stats.criminalProfit || 0) + payout);
                                u.stats.criminalRuns = Math.floor((u.stats.criminalRuns || 0) + 1);
                                u.heat.level = Math.min(100, Math.floor((u.heat.level || 0) + 8));
                                u.operation = { active: false, kind: null, districtId: null, caseId: null, startedAt: 0, endsAt: 0, dirtyPayout: 0, cleanCost: 0 };
                                await u.save().catch(() => {});
                                return safe(i.followUp({ content: `✅ Assalto concluído. Você ganhou **${formatMoney(payout)}** de dinheiro sujo.`, ephemeral: true }));
                            }

                            return safe(i.followUp({ content: "⚠️ Você já está em outra operação. Finalize primeiro.", ephemeral: true }));
                        }

                        const cd = Number(u.cooldowns?.robbery || 0);
                        if (now < cd) return safe(i.followUp({ content: `⏳ Assalto disponível <t:${Math.floor(cd / 1000)}:R>.`, ephemeral: true }));

                        const raw = await promptOneLine(i, { prompt: `Digite: \`distrito alvo\`\n\nAlvos: LOJA | ATM | CASA | CAMINHAO\n\nDistritos:\n${districtsText()}\n\nEx: \`central loja\``, timeMs: 60000 });
                        if (!raw) return safe(i.followUp({ content: "⏳ Tempo esgotado.", ephemeral: true }));
                        const [districtRaw, targetRaw] = raw.trim().split(/\s+/);
                        const district = pickDistrict((districtRaw || "").toLowerCase());
                        const target = String(targetRaw || "loja").toLowerCase();

                        const durationMs = Math.max(20_000, Math.floor(Number(cfg.durationMs || 90_000)));
                        const minDirty = Math.max(50, Math.floor(Number(cfg.minDirty || 250)));
                        const maxDirty = Math.max(minDirty, Math.floor(Number(cfg.maxDirty || 1800)));
                        const payout = Math.floor(minDirty + Math.random() * (maxDirty - minDirty + 1));
                        const hotUntil = now + durationMs;

                        const willAlert = Math.random() < Math.max(0, Math.min(1, Number(cfg.alertChance ?? 0.65)));
                        const caseId = willAlert
                            ? await createHotPoliceCase(client, {
                                  guildId: interaction.guildId,
                                  suspectId: interaction.user.id,
                                  kind: "robbery",
                                  districtId: district.id,
                                  hotUntil,
                                  estimatedValue: payout,
                                  data: { districtId: district.id, target, payout },
                              })
                            : null;

                        if (caseId) {
                            const embedAlert = new Discord.EmbedBuilder()
                                .setTitle("🚨 ALERTA: Assalto em andamento")
                                .setColor("Red")
                                .setDescription(`Distrito: **${district.name}**\nCaso: **${caseId}**\nTempo: <t:${Math.floor(hotUntil / 1000)}:R>`);
                            await trySendAlert(client, g, { embeds: [embedAlert] });
                        }

                        u.cooldowns.robbery = now + Math.max(0, Math.floor(Number(cfg.cooldownMs || 0)));
                        u.lastCrime = { at: now, districtId: district.id, kind: "robbery" };
                        u.operation = { active: true, kind: "robbery", districtId: district.id, caseId: caseId || null, startedAt: now, endsAt: hotUntil, dirtyPayout: payout, cleanCost: 0 };
                        await u.save().catch(() => {});
                        return safe(i.followUp({ content: `🚨 Assalto iniciado em **${district.name}**. Finaliza <t:${Math.floor(hotUntil / 1000)}:R>.${caseId ? ` (Caso: **${caseId}**)` : ""}`, ephemeral: true }));
                    }

                    if (action === "trafico") {
                        const cfg = g.config.crime?.trafficking || {};
                        if (!cfg.enabled) return safe(i.followUp({ content: "❌ Tráfico está desativado.", ephemeral: true }));

                        if (u.operation?.active) {
                            if (u.operation.kind === "trafficking") {
                                const endsAt = Number(u.operation.endsAt || 0);
                                if (now < endsAt) {
                                    return safe(i.followUp({ content: `⏳ Tráfico em andamento. Termina <t:${Math.floor(endsAt / 1000)}:R>.`, ephemeral: true }));
                                }

                                let blocked = false;
                                if (u.operation.caseId && client.policeCasedb) {
                                    const c = await client.policeCasedb.findOne({ guildID: interaction.guildId, caseId: u.operation.caseId }).lean();
                                    if (c && c.status !== "open") blocked = true;
                                }

                                if (blocked) {
                                    u.operation = { active: false, kind: null, districtId: null, caseId: null, startedAt: 0, endsAt: 0, dirtyPayout: 0, cleanCost: 0 };
                                    await u.save().catch(() => {});
                                    return safe(i.followUp({ content: "🚨 A rota foi interrompida pela polícia. Carga perdida.", ephemeral: true }));
                                }

                                const payout = Math.max(0, Math.floor(u.operation.dirtyPayout || 0));
                                if (payout > 0) await creditDirtyMoney(client.userdb, interaction.user.id, payout, "trafficking_payout", { guildId: interaction.guildId, districtId: u.operation.districtId, caseId: u.operation.caseId }).catch(() => {});
                                u.stats.criminalProfit = Math.floor((u.stats.criminalProfit || 0) + payout);
                                u.stats.criminalRuns = Math.floor((u.stats.criminalRuns || 0) + 1);
                                u.heat.level = Math.min(100, Math.floor((u.heat.level || 0) + 10));
                                u.operation = { active: false, kind: null, districtId: null, caseId: null, startedAt: 0, endsAt: 0, dirtyPayout: 0, cleanCost: 0 };
                                await u.save().catch(() => {});
                                return safe(i.followUp({ content: `✅ Tráfico concluído. Você ganhou **${formatMoney(payout)}** de dinheiro sujo.`, ephemeral: true }));
                            }
                            return safe(i.followUp({ content: "⚠️ Você já está em outra operação. Finalize primeiro.", ephemeral: true }));
                        }

                        const cd = Number(u.cooldowns?.trafficking || 0);
                        if (now < cd) return safe(i.followUp({ content: `⏳ Tráfico disponível <t:${Math.floor(cd / 1000)}:R>.`, ephemeral: true }));

                        const raw = await promptOneLine(i, { prompt: `Digite: \`distrito carga\`\n\nCargas: DROGAS | ARMAS | CIGARROS | ORO\n\nDistritos:\n${districtsText()}\n\nEx: \`porto drogas\``, timeMs: 60000 });
                        if (!raw) return safe(i.followUp({ content: "⏳ Tempo esgotado.", ephemeral: true }));
                        const [districtRaw, cargoRaw] = raw.trim().split(/\s+/);
                        const district = pickDistrict((districtRaw || "").toLowerCase());
                        const cargo = String(cargoRaw || "drogas").toLowerCase();

                        const durationMs = Math.max(30_000, Math.floor(Number(cfg.durationMs || 120_000)));
                        const minDirty = Math.max(80, Math.floor(Number(cfg.minDirty || 400)));
                        const maxDirty = Math.max(minDirty, Math.floor(Number(cfg.maxDirty || 2600)));
                        const costMin = Math.max(0, Math.floor(Number(cfg.costMin || 200)));
                        const costMax = Math.max(costMin, Math.floor(Number(cfg.costMax || 1200)));
                        const cost = Math.floor(costMin + Math.random() * (costMax - costMin + 1));
                        const payout = Math.floor(minDirty + Math.random() * (maxDirty - minDirty + 1));
                        const hotUntil = now + durationMs;

                        if (cost > 0) {
                            const paid = await debitWalletIfEnough(client.userdb, interaction.user.id, cost, "trafficking_buyin", { guildId: interaction.guildId, cargo, districtId: district.id });
                            if (!paid) return safe(i.followUp({ content: `❌ Você precisa de ${formatMoney(cost)} na carteira para iniciar.`, ephemeral: true }));
                        }

                        const willAlert = Math.random() < Math.max(0, Math.min(1, Number(cfg.alertChance ?? 0.75)));
                        const caseId = willAlert
                            ? await createHotPoliceCase(client, {
                                  guildId: interaction.guildId,
                                  suspectId: interaction.user.id,
                                  kind: "trafficking",
                                  districtId: district.id,
                                  hotUntil,
                                  estimatedValue: payout,
                                  data: { districtId: district.id, cargo, payout },
                              })
                            : null;

                        if (caseId) {
                            const embedAlert = new Discord.MessageEmbed()
                                .setTitle("🚨 ALERTA: Tráfico em andamento")
                                .setColor("ORANGE")
                                .setDescription(`Distrito: **${district.name}**\nCaso: **${caseId}**\nTempo: <t:${Math.floor(hotUntil / 1000)}:R>`);
                            await trySendAlert(client, g, { embeds: [embedAlert] });
                        }

                        u.cooldowns.trafficking = now + Math.max(0, Math.floor(Number(cfg.cooldownMs || 0)));
                        u.lastCrime = { at: now, districtId: district.id, kind: "trafficking" };
                        u.operation = { active: true, kind: "trafficking", districtId: district.id, caseId: caseId || null, startedAt: now, endsAt: hotUntil, dirtyPayout: payout, cleanCost: cost };
                        await u.save().catch(() => {});
                        return safe(i.followUp({ content: `📦 Rota iniciada em **${district.name}** (carga: **${cargo}**). Finaliza <t:${Math.floor(hotUntil / 1000)}:R>.${caseId ? ` (Caso: **${caseId}**)` : ""}`, ephemeral: true }));
                    }

                    if (action === "lavar") {
                        const cfg = g.config.crime?.laundering || {};
                        if (!cfg.enabled) return safe(i.followUp({ content: "❌ Lavagem está desativada.", ephemeral: true }));

                        const cd = Number(u.cooldowns?.laundering || 0);
                        if (now < cd) return safe(i.followUp({ content: `⏳ Lavagem disponível <t:${Math.floor(cd / 1000)}:R>.`, ephemeral: true }));

                        const raw = await promptOneLine(i, { prompt: "Digite: `fachada valor`\n\nFachadas: IGREJA | ONG | OFICINA | LOJA | BARBEARIA\n\nEx: `igreja 5000`", timeMs: 60000 });
                        if (!raw) return safe(i.followUp({ content: "⏳ Tempo esgotado.", ephemeral: true }));
                        const parts = raw.trim().split(/\s+/);
                        const front = String(parts[0] || "").toLowerCase();
                        const amount = Math.max(1, Math.floor(Number(String(parts[1] || "").replace(/\./g, "").replace(/,/g, ".")) || 0));
                        if (!front || !Number.isFinite(amount) || amount <= 0) return safe(i.followUp({ content: "❌ Formato inválido.", ephemeral: true }));

                        const dirtyBal = Math.max(0, Math.floor(mainUser.economia?.dirtyMoney || 0));
                        if (dirtyBal < amount) return safe(i.followUp({ content: `❌ Você tem apenas ${formatMoney(dirtyBal)} de dinheiro sujo.`, ephemeral: true }));

                        const feePct = Math.max(0, Math.min(0.9, Number(cfg.feePct ?? 0.18)));
                        const clean = Math.max(0, Math.floor(amount * (1 - feePct)));
                        const patrol = Math.max(0, Math.min(1, Number(g.patrol?.intensity || 0)));
                        const heat = Math.max(0, Math.min(100, Math.floor(u.heat.level || 0)));
                        const risk = Math.max(0, Math.min(0.95, Number(cfg.riskBase ?? 0.12) + patrol * 0.45 + heat / 220));

                        u.cooldowns.laundering = now + Math.max(0, Math.floor(Number(cfg.cooldownMs || 0)));

                        if (Math.random() < risk) {
                            await debitDirtyMoneyIfEnough(client.userdb, interaction.user.id, amount, "laundering_seized", { guildId: interaction.guildId, front }).catch(() => {});
                            const mins = 15;
                            const until = now + mins * 60 * 1000;
                            await client.userdb.updateOne(
                                { userID: interaction.user.id },
                                { $set: { "economia.restrictions.blackMarketBannedUntil": Math.max(Number(mainUser.economia?.restrictions?.blackMarketBannedUntil || 0), until) } }
                            ).catch(() => {});
                            const caseId = await createHotPoliceCase(client, {
                                guildId: interaction.guildId,
                                suspectId: interaction.user.id,
                                kind: "laundering",
                                districtId: u.lastCrime?.districtId || null,
                                hotUntil: now + 60 * 1000,
                                estimatedValue: amount,
                                data: { front, amount },
                            });
                            if (caseId) {
                                const embedAlert = new Discord.MessageEmbed()
                                    .setTitle("🚨 ALERTA: Lavagem suspeita")
                                    .setColor("DARK_RED")
                                    .setDescription(`Caso: **${caseId}**\nValor: **${formatMoney(amount)}**\nTempo: 1 minuto`);
                                await trySendAlert(client, g, { embeds: [embedAlert] });
                            }
                            await u.save().catch(() => {});
                            return safe(i.followUp({ content: `🚔 Lavagem descoberta. Você perdeu **${formatMoney(amount)}** e levou **ban do Submundo** por 15 min.`, ephemeral: true }));
                        }

                        const deb = await debitDirtyMoneyIfEnough(client.userdb, interaction.user.id, amount, "laundering_convert", { guildId: interaction.guildId, front });
                        if (!deb) return safe(i.followUp({ content: "❌ Não consegui debitar o dinheiro sujo agora. Tente novamente.", ephemeral: true }));
                        if (clean > 0) await creditWallet(client.userdb, interaction.user.id, clean, "laundering_clean", { guildId: interaction.guildId, front, amount }).catch(() => {});
                        u.heat.level = Math.max(0, Math.floor((u.heat.level || 0) - 6));
                        await u.save().catch(() => {});
                        return safe(i.followUp({ content: `✅ Lavagem concluída via **${front}**. Recebido limpo: **${formatMoney(clean)}** (taxa ${(feePct * 100).toFixed(0)}%).`, ephemeral: true }));
                    }

                    if (action === "ranking") {
                        const top = await client.blackMarketUserdb
                            .find({ guildID: interaction.guildId })
                            .sort({ "stats.criminalProfit": -1 })
                            .limit(10)
                            .lean();
                        const lines = top.length
                            ? top.map((uu, idx) => `**${idx + 1}.** <@${uu.userID}> — ${formatMoney(uu.stats?.criminalProfit || 0)} lucro • ${uu.stats?.criminalRuns || 0} runs`).join("\n")
                            : "Sem dados ainda.";
                        const e = new Discord.MessageEmbed().setTitle("🏴 Ranking do Submundo").setColor("DARK_BUT_NOT_BLACK").setDescription(lines);
                        return safe(i.editReply({ embeds: [e], components: [row] }));
                    }

                    if (action === "missoes") {
                        const now2 = Date.now();
                        const list = (u.missions || []).filter((m) => (m.resetsAt || 0) > now2);
                        const lines = list
                            .slice(0, 12)
                            .map((m) => {
                                const def = parseMissionId(m.missionId);
                                const title = missionTitle(def);
                                const rewards = missionRewards(def);
                                const done = (m.progress || 0) >= (m.goal || def?.goal || 0);
                                const status = m.claimed ? "✅ resgatado" : done ? "🎁 pronto" : `${m.progress || 0}/${m.goal || def?.goal || 0}`;
                                return `• \`${m.missionId}\` — ${title}\n  Progresso: **${status}** • Recompensa: **${formatMoney(rewards.money)}**${rewards.rep ? ` +${rewards.rep} rep` : ""}`;
                            })
                            .join("\n")
                            .slice(0, 3900);
                        const e = new Discord.EmbedBuilder()
                            .setTitle("📌 Missões (Diárias e Semanais)")
                            .setColor("Gold")
                            .setDescription(lines || "Nenhuma missão disponível.")
                            .setFooter({ text: "Use “Resgatar missão” e cole o ID da missão" });
                        return safe(i.editReply({ embeds: [e], components: [row] }));
                    }

                    if (action === "resgatar") {
                        const id = await promptOneLine(i, { prompt: "Cole o ID da missão (exatamente como aparece na lista).", timeMs: 60000 });
                        if (!id) return safe(i.followUp({ content: "⏳ Tempo esgotado.", ephemeral: true }));
                        const m = (u.missions || []).find((x) => x.missionId === id.trim());
                        if (!m) return safe(i.followUp({ content: "❌ Missão não encontrada.", ephemeral: true }));
                        if (m.claimed) return safe(i.followUp({ content: "❌ Essa missão já foi resgatada.", ephemeral: true }));
                        const def = parseMissionId(m.missionId);
                        if (!def) return safe(i.followUp({ content: "❌ Missão inválida.", ephemeral: true }));
                        const goal = m.goal || def.goal || 0;
                        if ((m.progress || 0) < goal) return safe(i.followUp({ content: "❌ Missão ainda não concluída.", ephemeral: true }));

                        const rewards = missionRewards(def);
                        await creditWallet(client.userdb, interaction.user.id, rewards.money, "mission_reward", { guildId: interaction.guildId, missionId: m.missionId }).catch(() => {});
                        if (def.side === "criminal") {
                            u.reputation.score = Math.floor((u.reputation.score || 0) + (rewards.rep || 0));
                            ensureRep(u);
                        }
                        m.claimed = true;
                        await u.save().catch(() => {});
                        return safe(i.followUp({ content: `✅ Missão resgatada: **${formatMoney(rewards.money)}**${rewards.rep ? ` +${rewards.rep} rep` : ""}.`, ephemeral: true }));
                    }

                    if (action === "toggle") {
                        if (!isAdmin(interaction)) return safe(i.followUp({ content: "❌ Apenas admin.", ephemeral: true }));
                        g.active = !g.active;
                        ensureVendorState(g);
                        if (!g.config.dailyResetAt) g.config.dailyResetAt = Date.now() + 24 * 60 * 60 * 1000;
                        if (!g.config.weeklyResetAt) g.config.weeklyResetAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
                        await g.save().catch(() => {});
                        return safe(i.followUp({ content: g.active ? "✅ Evento do Mercado Negro ativado." : "✅ Evento do Mercado Negro desativado.", ephemeral: true }));
                    }

                    if (action === "config") {
                        if (!isAdmin(interaction)) return safe(i.followUp({ content: "❌ Apenas admin.", ephemeral: true }));
                        const raw = await promptOneLine(i, { prompt: "Digite: `#canal ping` (ping = on/off). Exemplo: `#anuncios-evento off`", timeMs: 60000 });
                        if (!raw) return safe(i.followUp({ content: "⏳ Tempo esgotado.", ephemeral: true }));
                        const parts = raw.trim().split(/\s+/);
                        const channelMention = parts[0] || "";
                        const pingRaw = (parts[1] || "off").toLowerCase();
                        const m = channelMention.match(/^<#(\d+)>$/);
                        if (!m) return safe(i.followUp({ content: "❌ Canal inválido. Use #canal.", ephemeral: true }));
                        g.announce.channelId = m[1];
                        g.announce.pingEveryone = ["on", "sim", "true", "1"].includes(pingRaw);
                        await g.save().catch(() => {});
                        return safe(i.followUp({ content: `✅ Anúncios configurados: <#${g.announce.channelId}>${g.announce.pingEveryone ? " com @everyone" : ""}.`, ephemeral: true }));
                    }

                    if (!g.active && ["comprar_item", "vender_item", "caixa"].includes(action)) {
                        return safe(i.followUp({ content: "⚠️ O evento está desativado no servidor.", ephemeral: true }));
                    }

                    if ((u.antiCheat?.lockedUntil || 0) > now) {
                        return safe(i.followUp({ content: `⛔ Rate limit: tente novamente <t:${Math.floor((u.antiCheat.lockedUntil || 0) / 1000)}:R>.`, ephemeral: true }));
                    }

                    if (action === "comprar_item") {
                        const rate = bumpRate(u, { windowMs: 60 * 1000, maxInWindow: 5, lockMs: 2 * 60 * 1000 });
                        if (!rate.ok) {
                            await u.save().catch(() => {});
                            return safe(i.followUp({ content: `⛔ Muitas ações seguidas. Tente <t:${Math.floor((rate.lockedUntil || 0) / 1000)}:R>.`, ephemeral: true }));
                        }

                        const repNow = ensureRep(u);
                        const raw = await promptOneLine(i, {
                            prompt: `Digite: \`NPC ITEM QTD [distrito]\`\n\nNPCs:\n${vendorsText()}\n\nDistritos:\n${districtsText()}\n\nExemplo: \`RATO CIGS 5 central\``,
                            timeMs: 60000,
                        });
                        if (!raw) return safe(i.followUp({ content: "⏳ Tempo esgotado.", ephemeral: true }));
                        const parts = raw.trim().split(/\s+/);
                        const vendorId = (parts[0] || "").toUpperCase();
                        const itemId = (parts[1] || "").toUpperCase();
                        const qty = Math.max(1, Math.min(50, parseIntSafe(parts[2]) || 0));
                        const district = pickDistrict(parts[3]);
                        if (!vendorId || !itemId || !qty) return safe(i.followUp({ content: "❌ Formato inválido.", ephemeral: true }));

                        const item = ITEMS[itemId];
                        if (!item) return safe(i.followUp({ content: "❌ Item inválido. Veja em “Vendedores (NPCs)”.", ephemeral: true }));
                        if (repNow.level < item.minLevel) return safe(i.followUp({ content: `🔒 Você precisa de reputação: **${itemUnlockName(item.minLevel)}**.`, ephemeral: true }));

                        const mainUser = await client.userdb.getOrCreate(interaction.user.id);
                        const msgCount = Math.max(0, Math.floor(mainUser.economia?.stats?.messagesSent || 0));
                        const req = g.config?.activityRequirements || {};
                        const lvl2 = Math.max(0, Math.floor(req.level2 ?? 50));
                        const lvl3 = Math.max(0, Math.floor(req.level3 ?? 200));
                        const lvl4 = Math.max(0, Math.floor(req.level4 ?? 500));
                        const needed = item.minLevel >= 4 ? lvl4 : item.minLevel >= 3 ? lvl3 : item.minLevel >= 2 ? lvl2 : 0;
                        if (needed > 0 && msgCount < needed) {
                            return safe(i.followUp({
                                content: `🔒 Requisito de atividade: envie **${needed} mensagens** no chat para negociar itens deste nível. (Atual: ${msgCount})`,
                                ephemeral: true,
                            }));
                        }

                        const vendor = (g.vendors || []).find((v) => v.vendorId === vendorId);
                        const vendorCatalog = VENDORS.find((v) => v.vendorId === vendorId);
                        if (!vendor || !vendorCatalog) return safe(i.followUp({ content: "❌ NPC inválido.", ephemeral: true }));

                        const stock = vendor.stock || new Map();
                        const current = typeof stock.get === "function" ? Number(stock.get(itemId) || 0) : Number(stock[itemId] || 0);
                        if (current < qty) return safe(i.followUp({ content: `❌ Estoque insuficiente. Disponível: ${current}.`, ephemeral: true }));

                        const priceInfo = computeDynamicPrice({ guildDoc: g, userDoc: u, itemId, districtId: district.id, side: "buy" });
                        const total = Math.floor(priceInfo.buyPriceRaw * qty);

                        const paid = await debitWalletIfEnough(client.userdb, interaction.user.id, total, "blackmarket_buy", { guildId: interaction.guildId, itemId, qty, vendorId, district: district.id });
                        if (!paid) return safe(i.followUp({ content: `❌ Saldo insuficiente para pagar ${formatMoney(total)}.`, ephemeral: true }));

                        // Tenta decrementar estoque atomicamente
                        // Como o vendor está dentro de um array no documento do Guild, o update é complexo
                        // Solução: Filtra pelo ID e vendorId e decrementa se estoque >= qty
                        const stockUpdate = await client.blackMarketGuilddb.updateOne(
                            { 
                                guildID: interaction.guildId, 
                                "vendors.vendorId": vendorId,
                                // Gambiarra: Mongoose Map não suporta query direta fácil em array de subdocs com map
                                // Vamos confiar na verificação anterior + optimistic concurrency control se possível
                                // Mas aqui vamos usar o método 'safe' de recarregar e salvar se falhar, ou aceitar o risco menor
                                // Melhor: Atualizar o documento 'g' que já temos e salvar, mas com verificação de versão se habilitado
                            },
                            {
                                $inc: { [`vendors.$.stock.${itemId}`]: -qty }
                            }
                        ).catch(() => null);

                        // Se updateOne falhar (ex: documento não encontrado), faz fallback para save()
                        // Mas para garantir atomicidade real, precisaríamos de transaction (MongoDB 4.0+)
                        
                        // Recarrega guild para garantir sync
                        // g = await getGuildEvent(client, interaction.guildId); 
                        // Otimização: decrementa local e salva, assumindo que só esse processo mexe nesse vendor agora (lock lógico seria ideal)
                        
                        // Atualiza local para UI
                        if (typeof stock.set === "function") stock.set(itemId, Math.max(0, Math.floor(current - qty)));
                        else stock[itemId] = Math.max(0, Math.floor(current - qty));
                        vendor.stock = stock;
                        
                        // Atualiza Demand EMA
                        updateDemandEma(g, itemId, qty);
                        g.heat.level = Math.max(0, Math.floor((g.heat.level || 0) + Math.ceil(chance * 8)));
                        g.heat.lastUpdateAt = Date.now();
                        await g.save().catch(() => {});

                        const { chance, checkpointActive } = computeInterceptChance({ guildDoc: g, userDoc: u, item, districtId: district.id, totalValue: total });
                        const intercepted = Math.random() < chance;

                        // Atualiza stats do usuário atomicamente
                        const userInc = { "stats.criminalRuns": 1 };
                        if (intercepted) {
                            userInc["stats.seizedCount"] = 1;
                            userInc["stats.seizedValue"] = total;
                            userInc["reputation.score"] = -Math.ceil(20 + chance * 40);
                            userInc["heat.level"] = Math.ceil(chance * 15);
                        } else {
                            userInc["reputation.score"] = Math.ceil(10 + chance * 25);
                            userInc["heat.level"] = Math.ceil(chance * 8); // Menos heat se sucesso
                            // Inventário: usar $inc no map
                            userInc[`inventory.${itemId}`] = qty;
                            userInc["stats.criminalProfit"] = -total; // Gasto
                        }

                        await client.blackMarketUserdb.updateOne(
                            { guildID: interaction.guildId, userID: interaction.user.id },
                            { $inc: userInc }
                        );
                        
                        // Recarrega user para continuar fluxo
                        const uUpdated = await getUserEvent(client, interaction.guildId, interaction.user.id);
                        applyMissionProgress(uUpdated, { side: "criminal", type: "buy", itemId, delta: qty });
                        applyMissionProgress(uUpdated, { side: "criminal", type: "runs", delta: 1 });
                        await uUpdated.save().catch(() => {});

                        await ensureTerritories(client, interaction.guildId);

                        if (intercepted) {
                            const userdb = await client.userdb.getOrCreate(interaction.user.id);
                            if (!userdb.economia.restrictions) userdb.economia.restrictions = { bannedUntil: 0, blackMarketBannedUntil: 0, casinoBannedUntil: 0 };
                            const mins = 10 + Math.floor(chance * 20);
                            userdb.economia.restrictions.blackMarketBannedUntil = Math.max(userdb.economia.restrictions.blackMarketBannedUntil || 0, Date.now() + mins * 60 * 1000);
                            await userdb.save().catch(() => {});

                            await createPoliceCaseIfPossible(client, {
                                guildId: interaction.guildId,
                                suspectId: interaction.user.id,
                                districtId: district.id,
                                itemId,
                                qty,
                                totalValue: total,
                                chance,
                                checkpointActive,
                            });
                            await applyPoliceInfluence(client, interaction.guildId, district.id, 8).catch(() => {});

                            return safe(i.followUp({ content: `🚨 Interceptado no **${district.name}**. Mercadoria apreendida e **ban do Mercado Negro** aplicado. (- reputação)`, ephemeral: true }));
                        }

                        // Sucesso
                        if (uUpdated.faction?.factionId) {
                            const infl = Math.ceil(qty * (3 + item.risk * 8));
                            await applyCriminalInfluence(client, interaction.guildId, district.id, uUpdated.faction.factionId, infl).catch(() => {});
                        }

                        return safe(i.followUp({ content: `✅ Compra no **${district.name}**: **${qty}x ${item.name}** por **${formatMoney(total)}**. Risco: **${Math.floor(chance * 100)}%**.`, ephemeral: true }));

                    }

                    if (action === "vender_item") {
                        const rate = bumpRate(u, { windowMs: 60 * 1000, maxInWindow: 5, lockMs: 2 * 60 * 1000 });
                        if (!rate.ok) {
                            await u.save().catch(() => {});
                            return safe(i.followUp({ content: `⛔ Muitas ações seguidas. Tente <t:${Math.floor((rate.lockedUntil || 0) / 1000)}:R>.`, ephemeral: true }));
                        }

                        const raw = await promptOneLine(i, { prompt: `Digite: \`ITEM QTD [distrito]\`\n\nDistritos:\n${districtsText()}\n\nExemplo: \`CIGS 5 central\``, timeMs: 60000 });
                        if (!raw) return safe(i.followUp({ content: "⏳ Tempo esgotado.", ephemeral: true }));
                        const parts = raw.trim().split(/\s+/);
                        const itemId = (parts[0] || "").toUpperCase();
                        const qty = Math.max(1, Math.min(50, parseIntSafe(parts[1]) || 0));
                        const district = pickDistrict(parts[2]);
                        if (!itemId || !qty) return safe(i.followUp({ content: "❌ Formato inválido.", ephemeral: true }));

                        const item = ITEMS[itemId];
                        if (!item) return safe(i.followUp({ content: "❌ Item inválido.", ephemeral: true }));

                        const mainUser = await client.userdb.getOrCreate(interaction.user.id);
                        const msgCount = Math.max(0, Math.floor(mainUser.economia?.stats?.messagesSent || 0));
                        const req = g.config?.activityRequirements || {};
                        const lvl2 = Math.max(0, Math.floor(req.level2 ?? 50));
                        const lvl3 = Math.max(0, Math.floor(req.level3 ?? 200));
                        const lvl4 = Math.max(0, Math.floor(req.level4 ?? 500));
                        const needed = item.minLevel >= 4 ? lvl4 : item.minLevel >= 3 ? lvl3 : item.minLevel >= 2 ? lvl2 : 0;
                        if (needed > 0 && msgCount < needed) {
                            return safe(i.followUp({
                                content: `🔒 Requisito de atividade: envie **${needed} mensagens** no chat para negociar itens deste nível. (Atual: ${msgCount})`,
                                ephemeral: true,
                            }));
                        }

                        const ok = removeInventory(u, itemId, qty);
                        if (!ok) return safe(i.followUp({ content: "❌ Você não tem essa quantidade no inventário ilícito.", ephemeral: true }));

                        const priceInfo = computeDynamicPrice({ guildDoc: g, userDoc: u, itemId, districtId: district.id, side: "sell" });
                        const total = Math.floor(priceInfo.sellPriceRaw * qty);

                        const { chance, checkpointActive } = computeInterceptChance({ guildDoc: g, userDoc: u, item, districtId: district.id, totalValue: total });
                        const intercepted = Math.random() < chance;

                        updateDemandEma(g, itemId, qty);
                        g.heat.level = Math.max(0, Math.floor((g.heat.level || 0) + Math.ceil(chance * 6)));
                        g.heat.lastUpdateAt = Date.now();

                        u.stats.criminalRuns = Math.floor((u.stats.criminalRuns || 0) + 1);
                        applyMissionProgress(u, { side: "criminal", type: "sell", itemId, delta: qty });
                        applyMissionProgress(u, { side: "criminal", type: "runs", delta: 1 });

                        await ensureTerritories(client, interaction.guildId);

                        if (intercepted) {
                            u.heat.level = Math.max(0, Math.floor((u.heat.level || 0) + Math.ceil(chance * 12)));
                            u.stats.seizedCount = Math.floor((u.stats.seizedCount || 0) + 1);
                            u.stats.seizedValue = Math.floor((u.stats.seizedValue || 0) + total);
                            u.reputation.score = Math.max(0, Math.floor((u.reputation.score || 0) - Math.ceil(15 + chance * 35)));
                            ensureRep(u);

                            const userdb = await client.userdb.getOrCreate(interaction.user.id);
                            if (!userdb.economia.restrictions) userdb.economia.restrictions = { bannedUntil: 0, blackMarketBannedUntil: 0, casinoBannedUntil: 0 };
                            const mins = 8 + Math.floor(chance * 18);
                            userdb.economia.restrictions.blackMarketBannedUntil = Math.max(userdb.economia.restrictions.blackMarketBannedUntil || 0, Date.now() + mins * 60 * 1000);
                            await userdb.save().catch(() => {});

                            await createPoliceCaseIfPossible(client, {
                                guildId: interaction.guildId,
                                suspectId: interaction.user.id,
                                districtId: district.id,
                                itemId,
                                qty,
                                totalValue: total,
                                chance,
                                checkpointActive,
                            });
                            await applyPoliceInfluence(client, interaction.guildId, district.id, 7).catch(() => {});

                            await g.save().catch(() => {});
                            await u.save().catch(() => {});
                            return safe(i.followUp({ content: `🚨 Venda interceptada no **${district.name}**. Mercadoria apreendida e **ban do Mercado Negro** aplicado.`, ephemeral: true }));
                        }

                        await creditWallet(client.userdb, interaction.user.id, total, "blackmarket_sell", { guildId: interaction.guildId, itemId, qty, district: district.id }).catch(() => {});
                        u.reputation.score = Math.floor((u.reputation.score || 0) + Math.ceil(8 + chance * 18));
                        ensureRep(u);
                        u.stats.criminalProfit = Math.floor((u.stats.criminalProfit || 0) + total);

                        if (u.faction?.factionId) {
                            const infl = Math.ceil(qty * (2 + item.risk * 7));
                            await applyCriminalInfluence(client, interaction.guildId, district.id, u.faction.factionId, infl).catch(() => {});
                        }

                        await g.save().catch(() => {});
                        await u.save().catch(() => {});
                        return safe(i.followUp({ content: `✅ Venda no **${district.name}**: **${qty}x ${item.name}** por **${formatMoney(total)}**. Risco: **${Math.floor(chance * 100)}%**.`, ephemeral: true }));
                    }

                    if (action === "caixa") {
                        const rate = bumpRate(u, { windowMs: 60 * 1000, maxInWindow: 6, lockMs: 2 * 60 * 1000 });
                        if (!rate.ok) {
                            await u.save().catch(() => {});
                            return safe(i.followUp({ content: `⛔ Rate limit: tente <t:${Math.floor((rate.lockedUntil || 0) / 1000)}:R>.`, ephemeral: true }));
                        }
                        const raw = await promptOneLine(i, { prompt: "Digite o valor da aposta (ex.: 1000).", timeMs: 60000 });
                        if (!raw) return safe(i.followUp({ content: "⏳ Tempo esgotado.", ephemeral: true }));
                        const bet = Math.floor(Number(raw.replace(/\./g, "").replace(/,/g, ".")));
                        if (!Number.isFinite(bet) || bet <= 0) return safe(i.followUp({ embeds: [errorEmbed("❌ Aposta inválida.")], ephemeral: true }));

                        const debited = await debitWalletIfEnough(client.userdb, interaction.user.id, bet, "blackmarket_bet", { guild: interaction.guildId });
                        if (!debited) return safe(i.followUp({ embeds: [errorEmbed("❌ Saldo insuficiente na carteira.")], ephemeral: true }));

                        const outcome = rollOutcome();
                        const userdb = await client.userdb.getOrCreate(interaction.user.id);
                        if (!userdb.economia.restrictions) userdb.economia.restrictions = { bannedUntil: 0, blackMarketBannedUntil: 0, casinoBannedUntil: 0 };

                        let resultText = "";
                        let color = "GREY";
                        let gifQuery = "black market";

                        if (outcome.type === "lose_all") {
                            const lost = userdb.economia.money || 0;
                            userdb.economia.money = 0;
                            userdb.economia.transactions.push({
                                at: Date.now(),
                                type: "blackmarket_lose_all",
                                walletDelta: -lost,
                                bankDelta: 0,
                                meta: { bet },
                            });
                            userdb.economia.transactions = userdb.economia.transactions.slice(-50);
                            await userdb.save();
                            resultText = `🚨 A polícia te pegou no flagra. Você perdeu **TUDO** da carteira (**${formatMoney(lost)}**).`;
                            color = "RED";
                            gifQuery = "police caught";
                        } else if (outcome.type === "ban") {
                            const mins = 60;
                            userdb.economia.restrictions.casinoBannedUntil = Date.now() + mins * 60 * 1000;
                            userdb.economia.transactions.push({
                                at: Date.now(),
                                type: "blackmarket_ban",
                                walletDelta: 0,
                                bankDelta: 0,
                                meta: { bet, mins },
                            });
                            userdb.economia.transactions = userdb.economia.transactions.slice(-50);
                            await userdb.save();
                            resultText = `⛔ Você foi banido do **Cassino** por **${mins} minutos**.`;
                            color = "DARK_RED";
                            gifQuery = "police siren";
                        } else {
                            const win = Math.floor(bet * outcome.mult);
                            await creditWallet(client.userdb, interaction.user.id, win, "blackmarket_win", { bet, mult: outcome.mult }).catch(() => {});
                            resultText = `💰 Negócio fechado. Você recebeu **${formatMoney(win)}**.`;
                            color = "GREEN";
                            gifQuery = "money deal";
                        }

                        const gif =
                            (await getRandomGifUrl(gifQuery, { rating: "pg-13" }).catch(() => null)) ||
                            "https://media.giphy.com/media/3o6gDWzmAzrpi5DQU8/giphy.gif";

                        const updated2 = await client.userdb.getOrCreate(interaction.user.id);
                        const e = new Discord.EmbedBuilder()
                            .setTitle("💣 Mercado Negro — Caixa Ilegal")
                            .setColor(color === "GREY" ? "Grey" : color === "RED" ? "Red" : color === "DARK_RED" ? "DarkRed" : "Green")
                            .setDescription(resultText)
                            .addFields({ name: "Saldo", value: formatMoney(updated2.economia.money || 0), inline: true })
                            .setImage(gif);

                        return safe(i.editReply({ embeds: [e], components: [row] }));
                    }
                } catch (err) {
                    logger.error("Erro no hub do Mercado Negro", { error: String(err?.message || err), stack: err?.stack ? String(err.stack).slice(0, 1800) : undefined });
                    safe(i.followUp({ content: "Erro no hub do Mercado Negro.", ephemeral: true })).catch(() => {});
                }
            });

            collector.on("end", () => {
                const disabledMenu = menu.setDisabled(true).setPlaceholder("Menu expirado");
                const disabledRow = new Discord.ActionRowBuilder().addComponents(disabledMenu);
                interaction.editReply({ components: [disabledRow] }).catch(() => {});
            });
        } catch (err) {
            logger.error("Erro no mercado negro", { error: String(err?.message || err), stack: err?.stack ? String(err.stack).slice(0, 1800) : undefined });
            replyOrEdit(interaction, { content: "Erro no mercado negro.", ephemeral: true }).catch(() => {});
        }
    },
};

