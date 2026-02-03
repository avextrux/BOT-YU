const client = require("../../index");
const { VENDORS, ITEMS } = require("../../Utils/blackMarketCatalog");
const { ensureVendorState, decayHeat, updateDemandEma } = require("../../Utils/blackMarketEngine");
const Discord = require("discord.js");

async function trySendToChannel(channelId, payload) {
    if (!channelId) return false;
    try {
        const channel =
            client.channels.cache.get(channelId) ||
            (typeof client.channels.fetch === "function" ? await client.channels.fetch(channelId).catch(() => null) : null);
        if (!channel) return false;
        if (typeof channel.send !== "function") return false;
        await channel.send(payload);
        return true;
    } catch {
        return false;
    }
}

function restockVendor(guildDoc, vendorDoc, vendorCatalog) {
    const now = Date.now();
    const stock = vendorDoc.stock || new Map();
    for (const p of vendorCatalog.pool) {
        const cur = typeof stock.get === "function" ? Number(stock.get(p.itemId) || 0) : Number(stock[p.itemId] || 0);
        const target = Math.floor(p.max * (0.5 + Math.random() * 0.5));
        const next = Math.max(cur, target);
        if (typeof stock.set === "function") stock.set(p.itemId, next);
        else stock[p.itemId] = next;
    }
    vendorDoc.stock = stock;
    vendorDoc.nextRestockAt = now + vendorCatalog.restockEveryMs;
    vendorDoc.specialUntil = 0;
}

async function tick() {
    try {
        if (!client.blackMarketGuilddb) return;
        const now = Date.now();
        const guilds = await client.blackMarketGuilddb.find({ active: true }).limit(100);

        for (const g of guilds) {
            if (!g.config) g.config = {};
            ensureVendorState(g);

            if (!g.heat) g.heat = { level: 0, lastUpdateAt: 0 };
            const decayed = decayHeat({ level: g.heat.level, lastUpdateAt: g.heat.lastUpdateAt, decayPerHour: g.config.heatDecayPerHour || 4 });
            g.heat.level = decayed.level;
            g.heat.lastUpdateAt = decayed.lastUpdateAt;

            if (Array.isArray(g.checkpoints) && g.checkpoints.length) {
                g.checkpoints = g.checkpoints.filter((c) => (c.activeUntil || 0) > now).slice(-20);
            }

            if (!g.patrol) g.patrol = { intensity: 0.35, lastTickAt: 0 };
            if (now - (g.patrol.lastTickAt || 0) > 10 * 60 * 1000) {
                const drift = (Math.random() - 0.5) * 0.1;
                g.patrol.intensity = Math.max(0.05, Math.min(0.95, Number(g.patrol.intensity || 0.35) + drift));
                g.patrol.lastTickAt = now;
            }

            for (const v of g.vendors || []) {
                const catalog = VENDORS.find((x) => x.vendorId === v.vendorId);
                if (!catalog) continue;
                if ((v.nextRestockAt || 0) > now) continue;
                restockVendor(g, v, catalog);
                updateDemandEma(g, "CIGS", 0);
            }

            const cfg = g.config || {};
            if (!cfg.eventProbs) cfg.eventProbs = { discount: 0.05, raid: 0.05, shortage: 0.05, surplus: 0.05 };
            if (!cfg.activeEvents) cfg.activeEvents = { raidUntil: 0, shortage: { until: 0 }, surplus: { until: 0 } };

            const activeEvents = cfg.activeEvents;
            const probs = cfg.eventProbs;

            const isEventActive = 
                (cfg.discountUntil || 0) > now || 
                (activeEvents.raidUntil || 0) > now ||
                (activeEvents.shortage?.until || 0) > now ||
                (activeEvents.surplus?.until || 0) > now;

            if (!isEventActive) {
                const roll = Math.random();
                let acc = 0;
                const channelId = g.announce?.channelId;
                const content = g.announce?.pingEveryone ? "@everyone" : undefined;

                // Raid
                acc += (probs.raid || 0.05);
                if (roll < acc) {
                    const duration = 20 * 60 * 1000;
                    activeEvents.raidUntil = now + duration;
                    g.patrol.intensity = Math.min(1.0, (g.patrol.intensity || 0.35) + 0.4);
                    
                    const embed = new Discord.MessageEmbed()
                        .setTitle("🚨 RAID POLICIAL EM ANDAMENTO")
                        .setColor("DARK_RED")
                        .setDescription(`A polícia iniciou uma operação massiva!\n\n👮 **Patrulha:** Aumentada drasticamente.\n📈 **Preços:** +25% (Risco).\n⚠️ **Interceptação:** Muito alta.\n\nDuração: 20 minutos.`);
                    await trySendToChannel(channelId, { content, embeds: [embed] });
                    g.config.activeEvents = activeEvents;
                    await g.save();
                    continue;
                }

                // Shortage
                acc += (probs.shortage || 0.05);
                if (roll < acc) {
                    const keys = Object.keys(ITEMS);
                    const itemKey = keys[Math.floor(Math.random() * keys.length)];
                    const item = ITEMS[itemKey];
                    const duration = 30 * 60 * 1000;
                    
                    activeEvents.shortage = { until: now + duration, itemId: itemKey };
                    
                    const embed = new Discord.MessageEmbed()
                        .setTitle("📉 ESCASSEZ DE MERCADO")
                        .setColor("ORANGE")
                        .setDescription(`Há uma falta de **${item.name}** no mercado.\n\n💰 **Preço:** x2.0 (Dobro).\n\nDuração: 30 minutos.`);
                    await trySendToChannel(channelId, { content, embeds: [embed] });
                    g.config.activeEvents = activeEvents;
                    await g.save();
                    continue;
                }

                // Surplus
                acc += (probs.surplus || 0.05);
                if (roll < acc) {
                    const keys = Object.keys(ITEMS);
                    const itemKey = keys[Math.floor(Math.random() * keys.length)];
                    const item = ITEMS[itemKey];
                    const duration = 30 * 60 * 1000;
                    
                    activeEvents.surplus = { until: now + duration, itemId: itemKey };
                    
                    const embed = new Discord.MessageEmbed()
                        .setTitle("📦 SUPERÁVIT DE ESTOQUE")
                        .setColor("GREEN")
                        .setDescription(`Chegou um carregamento extra de **${item.name}**.\n\n📉 **Preço:** -40% (Desconto).\n\nDuração: 30 minutos.`);
                    await trySendToChannel(channelId, { content, embeds: [embed] });
                    g.config.activeEvents = activeEvents;
                    await g.save();
                    continue;
                }

                // Discount
                acc += (probs.discount || 0.05);
                if (roll < acc) {
                    const minutes = 15;
                    cfg.discountUntil = now + minutes * 60 * 1000;
                    cfg.discountMultiplier = [0.75, 0.8, 0.85][Math.floor(Math.random() * 3)];
                    g.config = cfg;

                    const embed = new Discord.MessageEmbed()
                        .setTitle("🕶️ Evento Relâmpago: Leilão Clandestino")
                        .setColor("DARK_GOLD")
                        .setDescription(
                            [
                                `Por **${minutes} minutos**, os preços do Mercado Negro estão com desconto.`,
                                `Multiplicador: **x${Number(cfg.discountMultiplier || 1).toFixed(2)}**`,
                                "",
                                "Use: `/mercadonegro vendedores` e `/mercadonegro item_comprar`",
                            ].join("\n")
                        );
                    await trySendToChannel(channelId, { content, embeds: [embed] });
                    await g.save();
                    continue;
                }
            }

            await g.save().catch(() => {});
        }
    } catch (err) {
        console.error(err);
    }
}


client.on("ready", () => {
    setInterval(() => {
        tick();
    }, 60 * 1000);
});
