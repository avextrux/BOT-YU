const Discord = require("discord.js");
const { getRandomGifUrl } = require("../../Utils/giphy");
const { formatMoney, debitWalletIfEnough, creditWallet, errorEmbed } = require("../../Utils/economy");
const { ensureEconomyAllowed } = require("../../Utils/economyGuard");
const { ITEMS, VENDORS, REP_LEVELS, DISTRICTS, computeRepLevel, getRepLevelName, ensureVendorState, computeDynamicPrice, computeInterceptChance, addInventory, removeInventory, pickDistrictOrDefault, decayHeat, updateDemandEma } = require("../../Utils/blackMarketEngine");
const { syncMissions, applyMissionProgress, parseMissionId, missionTitle, missionRewards } = require("../../Utils/blackMarketMissions");
const { ensureTerritories, applyCriminalInfluence, applyPoliceInfluence } = require("../../Utils/territoryEngine");
const { bumpRate } = require("../../Utils/antiCheat");

function rollOutcome() {
    const r = Math.random();
    if (r < 0.10) return { type: "lose_all" };
    if (r < 0.25) return { type: "ban" };
    if (r < 0.45) return { type: "small_win", mult: 1.5 };
    if (r < 0.70) return { type: "win", mult: 2.0 };
    if (r < 0.90) return { type: "big_win", mult: 3.0 };
    return { type: "jackpot", mult: 5.0 };
}

function canAdmin(interaction) {
    return interaction.member?.permissions?.has("ADMINISTRATOR") || interaction.member?.permissions?.has("MANAGE_GUILD");
}

function toChoice(list) {
    return list.slice(0, 25).map((d) => ({ name: d.name, value: d.id }));
}

async function getGuildEvent(client, guildId) {
    if (!client.blackMarketGuilddb) return null;
    const g = await client.blackMarketGuilddb.getOrCreate(guildId);
    if (!g.config) g.config = {};
    if (!g.heat) g.heat = { level: 0, lastUpdateAt: 0 };
    if (!g.patrol) g.patrol = { intensity: 0.35, lastTickAt: 0 };
    if (!g.checkpoints) g.checkpoints = [];
    ensureVendorState(g);
    return g;
}

async function getUserEvent(client, guildId, userId) {
    if (!client.blackMarketUserdb) return null;
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

function genId(prefix = "C") {
    return `${prefix}${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

async function createPoliceCaseIfPossible(client, { guildId, suspectId, districtId, itemId, qty, totalValue, chance, checkpointActive }) {
    if (!client.policeCasedb) return;
    const caseId = genId("CASE");
    await client.policeCasedb.create({
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
    }).catch(() => {});
}

module.exports = {
    name: "mercadonegro",
    description: "Evento do submundo: itens ilícitos, reputação, risco e perseguição",
    type: "CHAT_INPUT",
    options: [
        {
            name: "comprar",
            description: "Abre uma caixa ilegal (cassino clandestino)",
            type: "SUB_COMMAND",
            options: [
                { name: "aposta", description: "Quanto você quer arriscar", type: "NUMBER", required: true },
            ],
        },
        {
            name: "status",
            description: "Mostra seu status no submundo",
            type: "SUB_COMMAND",
        },
        {
            name: "evento_ativar",
            description: "Ativa o evento do mercado negro (admin)",
            type: "SUB_COMMAND",
        },
        {
            name: "evento_desativar",
            description: "Desativa o evento do mercado negro (admin)",
            type: "SUB_COMMAND",
        },
        {
            name: "vendedores",
            description: "Mostra NPCs e inventários atuais",
            type: "SUB_COMMAND",
        },
        {
            name: "item_comprar",
            description: "Compra item ilícito de um NPC",
            type: "SUB_COMMAND",
            options: [
                { name: "npc", description: "NPC vendedor", type: "STRING", required: true, choices: VENDORS.map((v) => ({ name: v.name, value: v.vendorId })) },
                { name: "item", description: "Código do item (ex.: CIGS)", type: "STRING", required: true },
                { name: "quantidade", description: "Quantidade", type: "INTEGER", required: true },
                { name: "distrito", description: "Onde foi a transação (impacta risco)", type: "STRING", required: false, choices: toChoice(DISTRICTS) },
            ],
        },
        {
            name: "item_vender",
            description: "Vende item ilícito (se tiver no inventário)",
            type: "SUB_COMMAND",
            options: [
                { name: "item", description: "Código do item (ex.: CIGS)", type: "STRING", required: true },
                { name: "quantidade", description: "Quantidade", type: "INTEGER", required: true },
                { name: "distrito", description: "Onde foi a transação (impacta risco)", type: "STRING", required: false, choices: toChoice(DISTRICTS) },
            ],
        },
        {
            name: "inventario",
            description: "Mostra seus itens ilícitos",
            type: "SUB_COMMAND",
        },
        {
            name: "configurar",
            description: "Configura canal de anúncios do evento (admin)",
            type: "SUB_COMMAND",
            options: [
                { name: "canal", description: "Canal de anúncios", type: "CHANNEL", required: false },
                { name: "ping_everyone", description: "Mencionar @everyone", type: "BOOLEAN", required: false },
            ],
        },
        {
            name: "ranking",
            description: "Ranking dos maiores criminosos (lucro)",
            type: "SUB_COMMAND",
        },
        {
            name: "missoes",
            description: "Mostra missões diárias e semanais",
            type: "SUB_COMMAND",
        },
        {
            name: "missao_resgatar",
            description: "Resgata recompensa de uma missão concluída",
            type: "SUB_COMMAND",
            options: [{ name: "id", description: "ID da missão", type: "STRING", required: true }],
        },
    ],
    run: async (client, interaction) => {
        try {
            const sub = interaction.options.getSubcommand();
            const bmGuild = await getGuildEvent(client, interaction.guildId);
            const bmUser = await getUserEvent(client, interaction.guildId, interaction.user.id);

            if (sub === "status") {
                const userdb = await client.userdb.getOrCreate(interaction.user.id);
                const bannedUntil = userdb.economia?.restrictions?.bannedUntil || 0;
                const rep = ensureRep(bmUser);
                const now = Date.now();

                const decayed = decayHeat({
                    level: bmUser.heat.level,
                    lastUpdateAt: bmUser.heat.lastUpdateAt,
                    decayPerHour: (bmGuild?.config?.heatDecayPerHour || 4) * 0.6,
                });
                bmUser.heat.level = decayed.level;
                bmUser.heat.lastUpdateAt = decayed.lastUpdateAt;
                await bmUser.save().catch(() => {});

                const embed = new Discord.MessageEmbed()
                    .setTitle("💣 Mercado Negro — Status")
                    .setColor("DARK_BUT_NOT_BLACK")
                    .setDescription(
                        [
                            bmGuild?.active ? "✅ Evento ativo." : "⚠️ Evento desativado (admin pode ativar).",
                            bannedUntil && now < bannedUntil ? `⛔ Ban econômico até <t:${Math.floor(bannedUntil / 1000)}:R>.` : "✅ Sem ban econômico ativo.",
                        ].join("\n")
                    )
                    .addFields(
                        { name: "Reputação", value: `**${rep.name}** (${rep.score} pts)`, inline: true },
                        { name: "Heat", value: `**${Math.floor(bmUser.heat.level || 0)}**`, inline: true },
                        { name: "Patrulha (servidor)", value: `**${Math.floor((bmGuild?.patrol?.intensity || 0.35) * 100)}%**`, inline: true }
                    );

                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            if (sub === "configurar") {
                if (!canAdmin(interaction)) return interaction.reply({ content: "❌ Apenas admin pode configurar.", ephemeral: true });
                if (!bmGuild) return interaction.reply({ content: "❌ Banco do evento indisponível.", ephemeral: true });
                const channel = interaction.options.getChannel("canal");
                const ping = interaction.options.getBoolean("ping_everyone");
                if (!bmGuild.announce) bmGuild.announce = { channelId: null, pingEveryone: false };
                if (channel && typeof channel.send === "function") bmGuild.announce.channelId = channel.id;
                if (ping !== null && ping !== undefined) bmGuild.announce.pingEveryone = !!ping;
                await bmGuild.save().catch(() => {});
                return interaction.reply({ content: `✅ Anúncios do evento: ${bmGuild.announce.channelId ? `<#${bmGuild.announce.channelId}>` : "sem canal"}${bmGuild.announce.pingEveryone ? " (com @everyone)" : ""}.`, ephemeral: true });
            }

            if (sub === "ranking") {
                if (!client.blackMarketUserdb) return interaction.reply({ content: "❌ Banco do evento indisponível.", ephemeral: true });
                const top = await client.blackMarketUserdb
                    .find({ guildID: interaction.guildId })
                    .sort({ "stats.criminalProfit": -1 })
                    .limit(10)
                    .lean();
                const lines = top.length
                    ? top.map((u, i) => `**${i + 1}.** <@${u.userID}> — ${formatMoney(u.stats?.criminalProfit || 0)} lucro • ${u.stats?.criminalRuns || 0} runs`).join("\n")
                    : "Sem dados ainda.";
                const e = new Discord.MessageEmbed().setTitle("🏴 Ranking do Submundo").setColor("DARK_BUT_NOT_BLACK").setDescription(lines);
                return interaction.reply({ embeds: [e] });
            }

            if (sub === "missoes") {
                if (!bmGuild || !bmUser) return interaction.reply({ content: "❌ Banco do evento indisponível.", ephemeral: true });
                syncMissions(bmGuild, bmUser);
                await bmGuild.save().catch(() => {});
                await bmUser.save().catch(() => {});
                const now = Date.now();
                const list = (bmUser.missions || []).filter((m) => (m.resetsAt || 0) > now);

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

                const embed = new Discord.MessageEmbed()
                    .setTitle("📌 Missões (Diárias e Semanais)")
                    .setColor("GOLD")
                    .setDescription(lines || "Nenhuma missão disponível.")
                    .setFooter({ text: "Use /mercadonegro missao_resgatar id:<missionId>" });
                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            if (sub === "missao_resgatar") {
                if (!bmGuild || !bmUser) return interaction.reply({ content: "❌ Banco do evento indisponível.", ephemeral: true });
                syncMissions(bmGuild, bmUser);
                const id = String(interaction.options.getString("id") || "").trim();
                const m = (bmUser.missions || []).find((x) => x.missionId === id);
                if (!m) return interaction.reply({ content: "❌ Missão não encontrada.", ephemeral: true });
                if (m.claimed) return interaction.reply({ content: "❌ Essa missão já foi resgatada.", ephemeral: true });
                const def = parseMissionId(m.missionId);
                if (!def) return interaction.reply({ content: "❌ Missão inválida.", ephemeral: true });
                const goal = m.goal || def.goal || 0;
                if ((m.progress || 0) < goal) return interaction.reply({ content: "❌ Missão ainda não concluída.", ephemeral: true });

                const rewards = missionRewards(def);
                await creditWallet(client.userdb, interaction.user.id, rewards.money, "mission_reward", { guildId: interaction.guildId, missionId: m.missionId }).catch(() => {});
                if (def.side === "criminal") {
                    bmUser.reputation.score = Math.floor((bmUser.reputation.score || 0) + (rewards.rep || 0));
                    ensureRep(bmUser);
                }
                m.claimed = true;
                await bmUser.save().catch(() => {});
                await bmGuild.save().catch(() => {});
                return interaction.reply({ content: `✅ Missão resgatada: **${formatMoney(rewards.money)}**${rewards.rep ? ` +${rewards.rep} rep` : ""}.`, ephemeral: true });
            }

            if (sub === "evento_ativar" || sub === "evento_desativar") {
                if (!canAdmin(interaction)) return interaction.reply({ content: "❌ Apenas admin pode gerenciar o evento.", ephemeral: true });
                if (!bmGuild) return interaction.reply({ content: "❌ Banco do evento indisponível.", ephemeral: true });

                bmGuild.active = sub === "evento_ativar";
                ensureVendorState(bmGuild);
                if (!bmGuild.config.dailyResetAt) {
                    const now = Date.now();
                    const nextDaily = now + 24 * 60 * 60 * 1000;
                    const nextWeekly = now + 7 * 24 * 60 * 60 * 1000;
                    bmGuild.config.dailyResetAt = nextDaily;
                    bmGuild.config.weeklyResetAt = nextWeekly;
                    bmGuild.mission.dailySeed = Math.floor(Math.random() * 1e9);
                    bmGuild.mission.weeklySeed = Math.floor(Math.random() * 1e9);
                }
                await bmGuild.save();
                return interaction.reply({ content: bmGuild.active ? "✅ Evento do Mercado Negro ativado." : "✅ Evento do Mercado Negro desativado." });
            }

            if (sub === "vendedores") {
                if (!bmGuild) return interaction.reply({ content: "❌ Banco do evento indisponível.", ephemeral: true });
                ensureVendorState(bmGuild);
                const rep = ensureRep(bmUser);
                const now = Date.now();

                const embed = new Discord.MessageEmbed()
                    .setTitle("🕶️ NPCs do Mercado Negro")
                    .setColor("BLURPLE")
                    .setDescription("Use `/mercadonegro item_comprar` e informe o **código do item** mostrado abaixo.");

                for (const vd of bmGuild.vendors || []) {
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
                        const locked = rep.level < item.minLevel ? "🔒" : "✅";
                        const priceInfo = computeDynamicPrice({
                            guildDoc: bmGuild,
                            userDoc: bmUser,
                            itemId: p.itemId,
                            districtId: "central",
                            side: "buy",
                        });
                        const price = priceInfo ? formatMoney(priceInfo.buyPriceRaw) : "-";
                        lines.push(`${locked} **${item.id}** — ${item.name} • ${price} • estoque ${qty}`);
                    }
                    embed.addField(`${name}`, `Reabastece: ${restock}\n${lines.join("\n").slice(0, 900)}`, false);
                }

                embed.setFooter({ text: `Sua reputação: ${rep.name} • Heat: ${Math.floor(bmUser.heat.level || 0)} • Servidor: ${Math.floor(bmGuild.heat?.level || 0)}` });
                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            if (sub === "inventario") {
                const rep = ensureRep(bmUser);
                const inv = bmUser.inventory || new Map();
                const entries = typeof inv.entries === "function" ? Array.from(inv.entries()) : Object.entries(inv);
                const lines = entries
                    .filter(([, q]) => Number(q) > 0)
                    .slice(0, 25)
                    .map(([k, q]) => {
                        const item = ITEMS[k];
                        return item ? `• **${item.id}** (${item.name}) — **${q}**` : `• **${k}** — **${q}**`;
                    });
                const embed = new Discord.MessageEmbed()
                    .setTitle("🎒 Inventário Ilícito")
                    .setColor("DARK_BUT_NOT_BLACK")
                    .setDescription(lines.length ? lines.join("\n") : "Você não tem itens ilícitos.")
                    .addField("Reputação", `**${rep.name}** (${rep.score} pts)`, true)
                    .addField("Heat", `**${Math.floor(bmUser.heat.level || 0)}**`, true);
                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            const gate = await ensureEconomyAllowed(client, interaction, interaction.user.id);
            if (!gate.ok) return interaction.reply({ embeds: [gate.embed], ephemeral: true });

            if (!bmGuild?.active) {
                return interaction.reply({ content: "⚠️ O evento do Mercado Negro está desativado no servidor.", ephemeral: true });
            }

            await ensureTerritories(client, interaction.guildId);
            syncMissions(bmGuild, bmUser);

            const now = Date.now();
            if ((bmUser.antiCheat?.lockedUntil || 0) > now) {
                return interaction.reply({ content: `⛔ Você está bloqueado até <t:${Math.floor((bmUser.antiCheat.lockedUntil || 0) / 1000)}:R>.`, ephemeral: true });
            }

            const cd = bmUser.cooldowns.blackmarket || 0;
            if (sub !== "comprar" && now < cd) {
                return interaction.reply({ content: `⏳ Você pode fazer outra transação <t:${Math.floor(cd / 1000)}:R>.`, ephemeral: true });
            }

            const bet = Math.floor(interaction.options.getNumber("aposta"));
            if (sub === "comprar") {
                const rate = bumpRate(bmUser, { windowMs: 60 * 1000, maxInWindow: 6, lockMs: 2 * 60 * 1000 });
                if (!rate.ok) {
                    await bmUser.save().catch(() => {});
                    return interaction.reply({ content: `⛔ Rate limit: tente novamente <t:${Math.floor((rate.lockedUntil || 0) / 1000)}:R>.`, ephemeral: true });
                }
                if (!Number.isFinite(bet) || bet <= 0) {
                    return interaction.reply({ embeds: [errorEmbed("❌ Aposta inválida.")], ephemeral: true });
                }

                const debited = await debitWalletIfEnough(client.userdb, interaction.user.id, bet, "blackmarket_bet", { guild: interaction.guildId });
                if (!debited) {
                    return interaction.reply({ embeds: [errorEmbed("❌ Saldo insuficiente na carteira.")], ephemeral: true });
                }

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

                const updated = await client.userdb.getOrCreate(interaction.user.id);
                const embed = new Discord.MessageEmbed()
                    .setTitle("💣 Mercado Negro — Caixa Ilegal")
                    .setColor(color)
                    .setDescription(resultText)
                    .addFields({ name: "Saldo", value: formatMoney(updated.economia.money || 0), inline: true })
                    .setImage(gif);

                return interaction.reply({ embeds: [embed] });
            }

            if (sub === "item_comprar") {
                const rate = bumpRate(bmUser, { windowMs: 60 * 1000, maxInWindow: 5, lockMs: 2 * 60 * 1000 });
                if (!rate.ok) {
                    await bmUser.save().catch(() => {});
                    return interaction.reply({ content: `⛔ Muitas ações seguidas. Tente <t:${Math.floor((rate.lockedUntil || 0) / 1000)}:R>.`, ephemeral: true });
                }
                const vendorId = interaction.options.getString("npc");
                const itemId = String(interaction.options.getString("item") || "").trim().toUpperCase();
                const qty = Math.max(1, Math.min(50, Math.floor(interaction.options.getInteger("quantidade") || 1)));
                const districtOpt = interaction.options.getString("distrito");
                const district = pickDistrictOrDefault(districtOpt);

                const item = ITEMS[itemId];
                if (!item) return interaction.reply({ content: "❌ Item inválido. Use `/mercadonegro vendedores` para ver os códigos.", ephemeral: true });

                const rep = ensureRep(bmUser);
                if (rep.level < item.minLevel) {
                    const need = (REP_LEVELS.find((r) => r.level === item.minLevel) || REP_LEVELS[0]).name;
                    return interaction.reply({ content: `🔒 Acesso negado. Você precisa de reputação: **${need}**.`, ephemeral: true });
                }

                const vendor = (bmGuild.vendors || []).find((v) => v.vendorId === vendorId);
                const vendorCatalog = VENDORS.find((v) => v.vendorId === vendorId);
                if (!vendor || !vendorCatalog) return interaction.reply({ content: "❌ NPC inválido.", ephemeral: true });

                const stock = vendor.stock || new Map();
                const current = typeof stock.get === "function" ? Number(stock.get(itemId) || 0) : Number(stock[itemId] || 0);
                if (current < qty) return interaction.reply({ content: `❌ Estoque insuficiente. Disponível: ${current}.`, ephemeral: true });

                const priceInfo = computeDynamicPrice({ guildDoc: bmGuild, userDoc: bmUser, itemId, districtId: district.id, side: "buy" });
                const unit = priceInfo.buyPriceRaw;
                const total = Math.floor(unit * qty);

                const paid = await debitWalletIfEnough(client.userdb, interaction.user.id, total, "blackmarket_buy", { guildId: interaction.guildId, itemId, qty, vendorId, district: district.id });
                if (!paid) return interaction.reply({ content: `❌ Saldo insuficiente para pagar ${formatMoney(total)}.`, ephemeral: true });

                const { chance, checkpointActive } = computeInterceptChance({ guildDoc: bmGuild, userDoc: bmUser, item, districtId: district.id, totalValue: total });
                const intercepted = Math.random() < chance;

                if (typeof stock.set === "function") stock.set(itemId, Math.max(0, Math.floor(current - qty)));
                else stock[itemId] = Math.max(0, Math.floor(current - qty));
                vendor.stock = stock;
                updateDemandEma(bmGuild, itemId, qty);
                bmGuild.heat.level = Math.max(0, Math.floor((bmGuild.heat.level || 0) + Math.ceil(chance * 8)));
                bmGuild.heat.lastUpdateAt = Date.now();

                bmUser.cooldowns.blackmarket = Date.now() + 20 * 1000;
                bmUser.stats.criminalRuns = Math.floor((bmUser.stats.criminalRuns || 0) + 1);

                if (intercepted) {
                    bmUser.heat.level = Math.max(0, Math.floor((bmUser.heat.level || 0) + Math.ceil(chance * 15)));
                    bmUser.stats.seizedCount = Math.floor((bmUser.stats.seizedCount || 0) + 1);
                    bmUser.stats.seizedValue = Math.floor((bmUser.stats.seizedValue || 0) + total);
                    bmUser.reputation.score = Math.max(0, Math.floor((bmUser.reputation.score || 0) - Math.ceil(20 + chance * 40)));
                    ensureRep(bmUser);

                    const userdb = await client.userdb.getOrCreate(interaction.user.id);
                    if (!userdb.economia.restrictions) userdb.economia.restrictions = { bannedUntil: 0 };
                    const mins = 10 + Math.floor(chance * 20);
                    userdb.economia.restrictions.bannedUntil = Math.max(userdb.economia.restrictions.bannedUntil || 0, Date.now() + mins * 60 * 1000);
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

                    await bmGuild.save().catch(() => {});
                    await bmUser.save().catch(() => {});
                    return interaction.reply({
                        content: `🚨 Interceptado no **${district.name}**. A mercadoria foi apreendida e você levou **${mins} min** de ban econômico. (- reputação)`,
                        ephemeral: true,
                    });
                }

                addInventory(bmUser, itemId, qty);
                bmUser.reputation.score = Math.floor((bmUser.reputation.score || 0) + Math.ceil(10 + chance * 25));
                ensureRep(bmUser);
                bmUser.stats.criminalProfit = Math.floor((bmUser.stats.criminalProfit || 0) - total);

                applyMissionProgress(bmUser, { side: "criminal", type: "buy", itemId, delta: qty });
                applyMissionProgress(bmUser, { side: "criminal", type: "runs", delta: 1 });
                if (bmUser.faction?.factionId) {
                    const infl = Math.ceil(qty * (3 + item.risk * 8));
                    await applyCriminalInfluence(client, interaction.guildId, district.id, bmUser.faction.factionId, infl).catch(() => {});
                }

                await bmGuild.save().catch(() => {});
                await bmUser.save().catch(() => {});

                return interaction.reply({
                    content: `✅ Compra concluída no **${district.name}**: **${qty}x ${item.name}** por **${formatMoney(total)}**. Risco estimado: **${Math.floor(chance * 100)}%**.`,
                    ephemeral: true,
                });
            }

            if (sub === "item_vender") {
                const rate = bumpRate(bmUser, { windowMs: 60 * 1000, maxInWindow: 5, lockMs: 2 * 60 * 1000 });
                if (!rate.ok) {
                    await bmUser.save().catch(() => {});
                    return interaction.reply({ content: `⛔ Muitas ações seguidas. Tente <t:${Math.floor((rate.lockedUntil || 0) / 1000)}:R>.`, ephemeral: true });
                }
                const itemId = String(interaction.options.getString("item") || "").trim().toUpperCase();
                const qty = Math.max(1, Math.min(50, Math.floor(interaction.options.getInteger("quantidade") || 1)));
                const districtOpt = interaction.options.getString("distrito");
                const district = pickDistrictOrDefault(districtOpt);

                const item = ITEMS[itemId];
                if (!item) return interaction.reply({ content: "❌ Item inválido.", ephemeral: true });

                const ok = removeInventory(bmUser, itemId, qty);
                if (!ok) return interaction.reply({ content: "❌ Você não tem essa quantidade no inventário ilícito.", ephemeral: true });

                const priceInfo = computeDynamicPrice({ guildDoc: bmGuild, userDoc: bmUser, itemId, districtId: district.id, side: "sell" });
                const unit = priceInfo.sellPriceRaw;
                const total = Math.floor(unit * qty);

                const { chance, checkpointActive } = computeInterceptChance({ guildDoc: bmGuild, userDoc: bmUser, item, districtId: district.id, totalValue: total });
                const intercepted = Math.random() < chance;

                updateDemandEma(bmGuild, itemId, qty);
                bmGuild.heat.level = Math.max(0, Math.floor((bmGuild.heat.level || 0) + Math.ceil(chance * 6)));
                bmGuild.heat.lastUpdateAt = Date.now();
                bmUser.cooldowns.blackmarket = Date.now() + 20 * 1000;
                bmUser.stats.criminalRuns = Math.floor((bmUser.stats.criminalRuns || 0) + 1);

                if (intercepted) {
                    bmUser.heat.level = Math.max(0, Math.floor((bmUser.heat.level || 0) + Math.ceil(chance * 12)));
                    bmUser.stats.seizedCount = Math.floor((bmUser.stats.seizedCount || 0) + 1);
                    bmUser.stats.seizedValue = Math.floor((bmUser.stats.seizedValue || 0) + total);
                    bmUser.reputation.score = Math.max(0, Math.floor((bmUser.reputation.score || 0) - Math.ceil(15 + chance * 35)));
                    ensureRep(bmUser);

                    const userdb = await client.userdb.getOrCreate(interaction.user.id);
                    if (!userdb.economia.restrictions) userdb.economia.restrictions = { bannedUntil: 0 };
                    const mins = 8 + Math.floor(chance * 18);
                    userdb.economia.restrictions.bannedUntil = Math.max(userdb.economia.restrictions.bannedUntil || 0, Date.now() + mins * 60 * 1000);
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

                    await bmGuild.save().catch(() => {});
                    await bmUser.save().catch(() => {});
                    return interaction.reply({
                        content: `🚨 Venda interceptada no **${district.name}**. Mercadoria apreendida, sem pagamento e **${mins} min** de ban econômico.`,
                        ephemeral: true,
                    });
                }

                await creditWallet(client.userdb, interaction.user.id, total, "blackmarket_sell", { guildId: interaction.guildId, itemId, qty, district: district.id }).catch(() => {});
                bmUser.reputation.score = Math.floor((bmUser.reputation.score || 0) + Math.ceil(8 + chance * 18));
                ensureRep(bmUser);
                bmUser.stats.criminalProfit = Math.floor((bmUser.stats.criminalProfit || 0) + total);

                applyMissionProgress(bmUser, { side: "criminal", type: "sell", itemId, delta: qty });
                applyMissionProgress(bmUser, { side: "criminal", type: "runs", delta: 1 });
                if (bmUser.faction?.factionId) {
                    const infl = Math.ceil(qty * (2 + item.risk * 7));
                    await applyCriminalInfluence(client, interaction.guildId, district.id, bmUser.faction.factionId, infl).catch(() => {});
                }

                await bmGuild.save().catch(() => {});
                await bmUser.save().catch(() => {});

                return interaction.reply({
                    content: `✅ Venda concluída no **${district.name}**: **${qty}x ${item.name}** por **${formatMoney(total)}**. Risco estimado: **${Math.floor(chance * 100)}%**.`,
                    ephemeral: true,
                });
            }

        } catch (err) {
            console.error(err);
            interaction.reply({ content: "Erro no mercado negro.", ephemeral: true }).catch(() => {});
        }
    }
};
