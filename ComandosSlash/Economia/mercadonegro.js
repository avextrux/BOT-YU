const Discord = require("discord.js");
const { getRandomGifUrl } = require("../../Utils/giphy");
const { ensureEconomyAllowed } = require("../../Utils/economyGuard");
const { formatMoney, debitWalletIfEnough, creditWallet, errorEmbed } = require("../../Utils/economy");
const { bumpRate } = require("../../Utils/antiCheat");
const { DISTRICTS, ITEMS, VENDORS, REP_LEVELS, computeRepLevel, getRepLevelName, ensureVendorState, computeDynamicPrice, computeInterceptChance, addInventory, removeInventory, decayHeat, updateDemandEma } = require("../../Utils/blackMarketEngine");
const { syncMissions, applyMissionProgress, parseMissionId, missionTitle, missionRewards } = require("../../Utils/blackMarketMissions");
const { ensureTerritories, applyCriminalInfluence, applyPoliceInfluence } = require("../../Utils/territoryEngine");

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

async function promptOneLine(interaction, { prompt, timeMs = 60000 }) {
    if (!interaction.channel || typeof interaction.channel.awaitMessages !== "function") return null;
    await interaction.followUp({ content: prompt, ephemeral: true }).catch(() => {});
    const filter = (m) => m.author?.id === interaction.user.id;
    const collected = await interaction.channel.awaitMessages({ filter, max: 1, time: timeMs });
    const msg = collected.first();
    if (!msg) return null;
    const value = msg.content;
    msg.delete().catch(() => {});
    return value;
}

async function getGuildEvent(client, guildId) {
    const g = await client.blackMarketGuilddb.getOrCreate(guildId);
    if (!g.config) g.config = {};
    if (!g.heat) g.heat = { level: 0, lastUpdateAt: 0 };
    if (!g.patrol) g.patrol = { intensity: 0.35, lastTickAt: 0 };
    if (!g.checkpoints) g.checkpoints = [];
    if (!g.announce) g.announce = { channelId: null, pingEveryone: false };
    ensureVendorState(g);
    return g;
}

async function getUserEvent(client, guildId, userId) {
    const u = await client.blackMarketUserdb.getOrCreate(guildId, userId);
    if (!u.reputation) u.reputation = { score: 0, level: 0, lastUpdateAt: 0 };
    if (!u.heat) u.heat = { level: 0, lastUpdateAt: 0 };
    if (!u.inventory) u.inventory = new Map();
    if (!u.stats) u.stats = { criminalProfit: 0, criminalRuns: 0, seizedCount: 0, seizedValue: 0 };
    if (!u.cooldowns) u.cooldowns = { blackmarket: 0, patrol: 0, checkpoint: 0 };
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
    hubActions: [
        "Status (reputação, heat e patrulha)",
        "Vendedores (NPCs) — estoque e preços",
        "Comprar item — negociar mercadoria ilícita",
        "Vender item — vender mercadoria ilícita",
        "Inventário — seus itens ilícitos",
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
                return interaction.reply({ content: "❌ Banco do evento indisponível.", ephemeral: true });
            }

            const bmGuild = await getGuildEvent(client, interaction.guildId);
            const bmUser = await getUserEvent(client, interaction.guildId, interaction.user.id);
            const rep = ensureRep(bmUser);

            const menu = new Discord.MessageSelectMenu()
                .setCustomId("mercadonegro_hub_action")
                .setPlaceholder("Selecionar comando...")
                .addOptions([
                    { label: "Status", value: "status", description: "Reputação, heat e patrulha" },
                    { label: "Vendedores (NPCs)", value: "vendedores", description: "Estoque e preços" },
                    { label: "Comprar item", value: "comprar_item", description: "Comprar mercadoria ilícita" },
                    { label: "Vender item", value: "vender_item", description: "Vender mercadoria ilícita" },
                    { label: "Inventário", value: "inventario", description: "Seus itens ilícitos" },
                    { label: "Missões", value: "missoes", description: "Diárias e semanais" },
                    { label: "Resgatar missão", value: "resgatar", description: "Pegar recompensa" },
                    { label: "Ranking", value: "ranking", description: "Lucro do submundo" },
                    { label: "Caixa ilegal (cassino)", value: "caixa", description: "Aposta arriscada" },
                    { label: "Configurar anúncios (ADM)", value: "config", description: "Canal e ping" },
                    { label: "Ativar/desativar (ADM)", value: "toggle", description: "Liga/desliga o evento" },
                ]);

            const row = new Discord.MessageActionRow().addComponents(menu);

            const home = new Discord.MessageEmbed()
                .setTitle("💣 HUB DO MERCADO NEGRO")
                .setColor("DARK_BUT_NOT_BLACK")
                .setDescription("Escolha no menu. Se eu pedir algo, você digita e a mensagem é apagada.")
                .addField("Evento", bmGuild.active ? "✅ Ativo" : "⚠️ Desativado", true)
                .addField("Reputação", `**${rep.name}** (${rep.score} pts)`, true)
                .addField("Heat", `**${Math.floor(bmUser.heat.level || 0)}**`, true)
                .addField("Dica", "Comece em **Vendedores (NPCs)** → **Comprar item**.", false);

            const msg = await interaction.reply({ embeds: [home], components: [row], fetchReply: true, ephemeral: true });

            const collector = msg.createMessageComponentCollector({ componentType: "SELECT_MENU", idle: 120000 });
            collector.on("collect", async (i) => {
                try {
                    if (i.user.id !== interaction.user.id) return i.reply({ content: "❌ Esse menu é do autor do comando.", ephemeral: true });
                    const action = i.values[0];

                    const gate = await ensureEconomyAllowed(client, interaction, interaction.user.id);
                    if (!gate.ok) return i.reply({ embeds: [gate.embed], ephemeral: true });

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
                    if (bmBan && now < bmBan && ["comprar_item", "vender_item", "resgatar"].includes(action)) {
                        return i.reply({ content: `⛔ Você está banido do Mercado Negro até <t:${Math.floor(bmBan / 1000)}:R>.`, ephemeral: true });
                    }
                    if (casinoBan && now < casinoBan && action === "caixa") {
                        return i.reply({ content: `⛔ Você está banido do Cassino até <t:${Math.floor(casinoBan / 1000)}:R>.`, ephemeral: true });
                    }

                    if (action === "status") {
                        const repNow = ensureRep(u);
                        const patrolPct = Math.floor((g.patrol?.intensity || 0.35) * 100);
                        const discountUntil = Number(g.config.discountUntil || 0);
                        const discText = discountUntil > now ? `✅ Leilão ativo até <t:${Math.floor(discountUntil / 1000)}:R> (x${Number(g.config.discountMultiplier || 1).toFixed(2)})` : "—";

                        const e = new Discord.MessageEmbed()
                            .setTitle("💣 Status do Submundo")
                            .setColor("DARK_BUT_NOT_BLACK")
                            .setDescription(g.active ? "✅ Evento ativo." : "⚠️ Evento desativado (admin pode ativar).")
                            .addField("Reputação", `**${repNow.name}** (${repNow.score} pts)`, true)
                            .addField("Heat", `**${Math.floor(u.heat.level || 0)}**`, true)
                            .addField("Patrulha (servidor)", `**${patrolPct}%**`, true)
                            .addField("Evento relâmpago", discText, false);
                        return i.update({ embeds: [e], components: [row] });
                    }

                    if (action === "vendedores") {
                        const repNow = ensureRep(u);
                        ensureVendorState(g);
                        const embed = new Discord.MessageEmbed()
                            .setTitle("🕶️ NPCs do Mercado Negro")
                            .setColor("BLURPLE")
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
                            embed.addField(`${name} (${vd.vendorId})`, `Reabastece: ${restock}\n${lines.join("\n").slice(0, 900)}`, false);
                        }

                        return i.update({ embeds: [embed], components: [row] });
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
                        const e = new Discord.MessageEmbed()
                            .setTitle("🎒 Inventário Ilícito")
                            .setColor("DARK_BUT_NOT_BLACK")
                            .setDescription(lines.length ? lines.join("\n") : "Você não tem itens ilícitos.")
                            .addField("Reputação", `**${repNow.name}** (${repNow.score} pts)`, true)
                            .addField("Heat", `**${Math.floor(u.heat.level || 0)}**`, true);
                        return i.update({ embeds: [e], components: [row] });
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
                        return i.update({ embeds: [e], components: [row] });
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
                        const e = new Discord.MessageEmbed()
                            .setTitle("📌 Missões (Diárias e Semanais)")
                            .setColor("GOLD")
                            .setDescription(lines || "Nenhuma missão disponível.")
                            .setFooter({ text: "Use “Resgatar missão” e cole o ID da missão" });
                        return i.update({ embeds: [e], components: [row] });
                    }

                    if (action === "resgatar") {
                        const id = await promptOneLine(interaction, { prompt: "Cole o ID da missão (exatamente como aparece na lista).", timeMs: 60000 });
                        if (!id) return i.reply({ content: "⏳ Tempo esgotado.", ephemeral: true });
                        const m = (u.missions || []).find((x) => x.missionId === id.trim());
                        if (!m) return i.reply({ content: "❌ Missão não encontrada.", ephemeral: true });
                        if (m.claimed) return i.reply({ content: "❌ Essa missão já foi resgatada.", ephemeral: true });
                        const def = parseMissionId(m.missionId);
                        if (!def) return i.reply({ content: "❌ Missão inválida.", ephemeral: true });
                        const goal = m.goal || def.goal || 0;
                        if ((m.progress || 0) < goal) return i.reply({ content: "❌ Missão ainda não concluída.", ephemeral: true });

                        const rewards = missionRewards(def);
                        await creditWallet(client.userdb, interaction.user.id, rewards.money, "mission_reward", { guildId: interaction.guildId, missionId: m.missionId }).catch(() => {});
                        if (def.side === "criminal") {
                            u.reputation.score = Math.floor((u.reputation.score || 0) + (rewards.rep || 0));
                            ensureRep(u);
                        }
                        m.claimed = true;
                        await u.save().catch(() => {});
                        return i.reply({ content: `✅ Missão resgatada: **${formatMoney(rewards.money)}**${rewards.rep ? ` +${rewards.rep} rep` : ""}.`, ephemeral: true });
                    }

                    if (action === "toggle") {
                        if (!isAdmin(interaction)) return i.reply({ content: "❌ Apenas admin.", ephemeral: true });
                        g.active = !g.active;
                        ensureVendorState(g);
                        if (!g.config.dailyResetAt) g.config.dailyResetAt = Date.now() + 24 * 60 * 60 * 1000;
                        if (!g.config.weeklyResetAt) g.config.weeklyResetAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
                        await g.save().catch(() => {});
                        return i.reply({ content: g.active ? "✅ Evento do Mercado Negro ativado." : "✅ Evento do Mercado Negro desativado.", ephemeral: true });
                    }

                    if (action === "config") {
                        if (!isAdmin(interaction)) return i.reply({ content: "❌ Apenas admin.", ephemeral: true });
                        const raw = await promptOneLine(interaction, { prompt: "Digite: `#canal ping` (ping = on/off). Exemplo: `#anuncios-evento off`", timeMs: 60000 });
                        if (!raw) return i.reply({ content: "⏳ Tempo esgotado.", ephemeral: true });
                        const parts = raw.trim().split(/\s+/);
                        const channelMention = parts[0] || "";
                        const pingRaw = (parts[1] || "off").toLowerCase();
                        const m = channelMention.match(/^<#(\d+)>$/);
                        if (!m) return i.reply({ content: "❌ Canal inválido. Use #canal.", ephemeral: true });
                        g.announce.channelId = m[1];
                        g.announce.pingEveryone = ["on", "sim", "true", "1"].includes(pingRaw);
                        await g.save().catch(() => {});
                        return i.reply({ content: `✅ Anúncios configurados: <#${g.announce.channelId}>${g.announce.pingEveryone ? " com @everyone" : ""}.`, ephemeral: true });
                    }

                    if (!g.active && ["comprar_item", "vender_item", "caixa"].includes(action)) {
                        return i.reply({ content: "⚠️ O evento está desativado no servidor.", ephemeral: true });
                    }

                    if ((u.antiCheat?.lockedUntil || 0) > now) {
                        return i.reply({ content: `⛔ Rate limit: tente novamente <t:${Math.floor((u.antiCheat.lockedUntil || 0) / 1000)}:R>.`, ephemeral: true });
                    }

                    if (action === "comprar_item") {
                        const rate = bumpRate(u, { windowMs: 60 * 1000, maxInWindow: 5, lockMs: 2 * 60 * 1000 });
                        if (!rate.ok) {
                            await u.save().catch(() => {});
                            return i.reply({ content: `⛔ Muitas ações seguidas. Tente <t:${Math.floor((rate.lockedUntil || 0) / 1000)}:R>.`, ephemeral: true });
                        }

                        const repNow = ensureRep(u);
                        const raw = await promptOneLine(interaction, {
                            prompt: `Digite: \`NPC ITEM QTD [distrito]\`\n\nNPCs:\n${vendorsText()}\n\nDistritos:\n${districtsText()}\n\nExemplo: \`RATO CIGS 5 central\``,
                            timeMs: 60000,
                        });
                        if (!raw) return i.reply({ content: "⏳ Tempo esgotado.", ephemeral: true });
                        const parts = raw.trim().split(/\s+/);
                        const vendorId = (parts[0] || "").toUpperCase();
                        const itemId = (parts[1] || "").toUpperCase();
                        const qty = Math.max(1, Math.min(50, parseIntSafe(parts[2]) || 0));
                        const district = pickDistrict(parts[3]);
                        if (!vendorId || !itemId || !qty) return i.reply({ content: "❌ Formato inválido.", ephemeral: true });

                        const item = ITEMS[itemId];
                        if (!item) return i.reply({ content: "❌ Item inválido. Veja em “Vendedores (NPCs)”.", ephemeral: true });
                        if (repNow.level < item.minLevel) return i.reply({ content: `🔒 Você precisa de reputação: **${itemUnlockName(item.minLevel)}**.`, ephemeral: true });

                        const mainUser = await client.userdb.getOrCreate(interaction.user.id);
                        const msgCount = Math.max(0, Math.floor(mainUser.economia?.stats?.messagesSent || 0));
                        const req = g.config?.activityRequirements || {};
                        const lvl2 = Math.max(0, Math.floor(req.level2 ?? 50));
                        const lvl3 = Math.max(0, Math.floor(req.level3 ?? 200));
                        const lvl4 = Math.max(0, Math.floor(req.level4 ?? 500));
                        const needed = item.minLevel >= 4 ? lvl4 : item.minLevel >= 3 ? lvl3 : item.minLevel >= 2 ? lvl2 : 0;
                        if (needed > 0 && msgCount < needed) {
                            return i.reply({
                                content: `🔒 Requisito de atividade: envie **${needed} mensagens** no chat para negociar itens deste nível. (Atual: ${msgCount})`,
                                ephemeral: true,
                            });
                        }

                        const vendor = (g.vendors || []).find((v) => v.vendorId === vendorId);
                        const vendorCatalog = VENDORS.find((v) => v.vendorId === vendorId);
                        if (!vendor || !vendorCatalog) return i.reply({ content: "❌ NPC inválido.", ephemeral: true });

                        const stock = vendor.stock || new Map();
                        const current = typeof stock.get === "function" ? Number(stock.get(itemId) || 0) : Number(stock[itemId] || 0);
                        if (current < qty) return i.reply({ content: `❌ Estoque insuficiente. Disponível: ${current}.`, ephemeral: true });

                        const priceInfo = computeDynamicPrice({ guildDoc: g, userDoc: u, itemId, districtId: district.id, side: "buy" });
                        const total = Math.floor(priceInfo.buyPriceRaw * qty);

                        const paid = await debitWalletIfEnough(client.userdb, interaction.user.id, total, "blackmarket_buy", { guildId: interaction.guildId, itemId, qty, vendorId, district: district.id });
                        if (!paid) return i.reply({ content: `❌ Saldo insuficiente para pagar ${formatMoney(total)}.`, ephemeral: true });

                        const { chance, checkpointActive } = computeInterceptChance({ guildDoc: g, userDoc: u, item, districtId: district.id, totalValue: total });
                        const intercepted = Math.random() < chance;

                        if (typeof stock.set === "function") stock.set(itemId, Math.max(0, Math.floor(current - qty)));
                        else stock[itemId] = Math.max(0, Math.floor(current - qty));
                        vendor.stock = stock;
                        updateDemandEma(g, itemId, qty);
                        g.heat.level = Math.max(0, Math.floor((g.heat.level || 0) + Math.ceil(chance * 8)));
                        g.heat.lastUpdateAt = Date.now();

                        u.stats.criminalRuns = Math.floor((u.stats.criminalRuns || 0) + 1);
                        applyMissionProgress(u, { side: "criminal", type: "buy", itemId, delta: qty });
                        applyMissionProgress(u, { side: "criminal", type: "runs", delta: 1 });

                        await ensureTerritories(client, interaction.guildId);

                        if (intercepted) {
                            u.heat.level = Math.max(0, Math.floor((u.heat.level || 0) + Math.ceil(chance * 15)));
                            u.stats.seizedCount = Math.floor((u.stats.seizedCount || 0) + 1);
                            u.stats.seizedValue = Math.floor((u.stats.seizedValue || 0) + total);
                            u.reputation.score = Math.max(0, Math.floor((u.reputation.score || 0) - Math.ceil(20 + chance * 40)));
                            ensureRep(u);

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

                            await g.save().catch(() => {});
                            await u.save().catch(() => {});
                            return i.reply({ content: `🚨 Interceptado no **${district.name}**. Mercadoria apreendida e **ban econômico** aplicado. (- reputação)`, ephemeral: true });
                        }

                        addInventory(u, itemId, qty);
                        u.reputation.score = Math.floor((u.reputation.score || 0) + Math.ceil(10 + chance * 25));
                        ensureRep(u);
                        u.stats.criminalProfit = Math.floor((u.stats.criminalProfit || 0) - total);

                        if (u.faction?.factionId) {
                            const infl = Math.ceil(qty * (3 + item.risk * 8));
                            await applyCriminalInfluence(client, interaction.guildId, district.id, u.faction.factionId, infl).catch(() => {});
                        }

                        await g.save().catch(() => {});
                        await u.save().catch(() => {});
                        return i.reply({ content: `✅ Compra no **${district.name}**: **${qty}x ${item.name}** por **${formatMoney(total)}**. Risco: **${Math.floor(chance * 100)}%**.`, ephemeral: true });
                    }

                    if (action === "vender_item") {
                        const rate = bumpRate(u, { windowMs: 60 * 1000, maxInWindow: 5, lockMs: 2 * 60 * 1000 });
                        if (!rate.ok) {
                            await u.save().catch(() => {});
                            return i.reply({ content: `⛔ Muitas ações seguidas. Tente <t:${Math.floor((rate.lockedUntil || 0) / 1000)}:R>.`, ephemeral: true });
                        }

                        const raw = await promptOneLine(interaction, { prompt: `Digite: \`ITEM QTD [distrito]\`\n\nDistritos:\n${districtsText()}\n\nExemplo: \`CIGS 5 central\``, timeMs: 60000 });
                        if (!raw) return i.reply({ content: "⏳ Tempo esgotado.", ephemeral: true });
                        const parts = raw.trim().split(/\s+/);
                        const itemId = (parts[0] || "").toUpperCase();
                        const qty = Math.max(1, Math.min(50, parseIntSafe(parts[1]) || 0));
                        const district = pickDistrict(parts[2]);
                        if (!itemId || !qty) return i.reply({ content: "❌ Formato inválido.", ephemeral: true });

                        const item = ITEMS[itemId];
                        if (!item) return i.reply({ content: "❌ Item inválido.", ephemeral: true });

                        const mainUser = await client.userdb.getOrCreate(interaction.user.id);
                        const msgCount = Math.max(0, Math.floor(mainUser.economia?.stats?.messagesSent || 0));
                        const req = g.config?.activityRequirements || {};
                        const lvl2 = Math.max(0, Math.floor(req.level2 ?? 50));
                        const lvl3 = Math.max(0, Math.floor(req.level3 ?? 200));
                        const lvl4 = Math.max(0, Math.floor(req.level4 ?? 500));
                        const needed = item.minLevel >= 4 ? lvl4 : item.minLevel >= 3 ? lvl3 : item.minLevel >= 2 ? lvl2 : 0;
                        if (needed > 0 && msgCount < needed) {
                            return i.reply({
                                content: `🔒 Requisito de atividade: envie **${needed} mensagens** no chat para negociar itens deste nível. (Atual: ${msgCount})`,
                                ephemeral: true,
                            });
                        }

                        const ok = removeInventory(u, itemId, qty);
                        if (!ok) return i.reply({ content: "❌ Você não tem essa quantidade no inventário ilícito.", ephemeral: true });

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
                            return i.reply({ content: `🚨 Venda interceptada no **${district.name}**. Mercadoria apreendida e **ban do Mercado Negro** aplicado.`, ephemeral: true });
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
                        return i.reply({ content: `✅ Venda no **${district.name}**: **${qty}x ${item.name}** por **${formatMoney(total)}**. Risco: **${Math.floor(chance * 100)}%**.`, ephemeral: true });
                    }

                    if (action === "caixa") {
                        const rate = bumpRate(u, { windowMs: 60 * 1000, maxInWindow: 6, lockMs: 2 * 60 * 1000 });
                        if (!rate.ok) {
                            await u.save().catch(() => {});
                            return i.reply({ content: `⛔ Rate limit: tente <t:${Math.floor((rate.lockedUntil || 0) / 1000)}:R>.`, ephemeral: true });
                        }
                        const raw = await promptOneLine(interaction, { prompt: "Digite o valor da aposta (ex.: 1000).", timeMs: 60000 });
                        if (!raw) return i.reply({ content: "⏳ Tempo esgotado.", ephemeral: true });
                        const bet = Math.floor(Number(raw.replace(/\./g, "").replace(/,/g, ".")));
                        if (!Number.isFinite(bet) || bet <= 0) return i.reply({ embeds: [errorEmbed("❌ Aposta inválida.")], ephemeral: true });

                        const debited = await debitWalletIfEnough(client.userdb, interaction.user.id, bet, "blackmarket_bet", { guild: interaction.guildId });
                        if (!debited) return i.reply({ embeds: [errorEmbed("❌ Saldo insuficiente na carteira.")], ephemeral: true });

                        const outcome = rollOutcome();
                        const userdb = await client.userdb.findOne({ userID: interaction.user.id });
                        if (!userdb.economia.restrictions) userdb.economia.restrictions = { bannedUntil: 0 };

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
                            userdb.economia.restrictions.bannedUntil = Date.now() + mins * 60 * 1000;
                            userdb.economia.transactions.push({
                                at: Date.now(),
                                type: "blackmarket_ban",
                                walletDelta: 0,
                                bankDelta: 0,
                                meta: { bet, mins },
                            });
                            userdb.economia.transactions = userdb.economia.transactions.slice(-50);
                            await userdb.save();
                            resultText = `⛔ Você foi banido do sistema econômico por **${mins} minutos**.`;
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
                        const e = new Discord.MessageEmbed()
                            .setTitle("💣 Mercado Negro — Caixa Ilegal")
                            .setColor(color)
                            .setDescription(resultText)
                            .addFields({ name: "Saldo", value: formatMoney(updated2.economia.money || 0), inline: true })
                            .setImage(gif);

                        return i.update({ embeds: [e], components: [row] });
                    }
                } catch (err) {
                    console.error(err);
                    i.reply({ content: "Erro no hub do Mercado Negro.", ephemeral: true }).catch(() => {});
                }
            });

            collector.on("end", () => {
                const disabledMenu = menu.setDisabled(true).setPlaceholder("Menu expirado");
                const disabledRow = new Discord.MessageActionRow().addComponents(disabledMenu);
                interaction.editReply({ components: [disabledRow] }).catch(() => {});
            });
        } catch (err) {
            console.error(err);
            interaction.reply({ content: "Erro no mercado negro.", ephemeral: true }).catch(() => {});
        }
    },
};

