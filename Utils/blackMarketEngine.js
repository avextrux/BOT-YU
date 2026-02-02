const { DISTRICTS, REP_LEVELS, ITEMS, VENDORS } = require("./blackMarketCatalog");

function getDistrictById(id) {
    return DISTRICTS.find((d) => d.id === id) || DISTRICTS[0];
}

function computeRepLevel(score) {
    const s = Math.floor(Number(score) || 0);
    let lvl = 0;
    for (const r of REP_LEVELS) {
        if (s >= r.minScore) lvl = r.level;
    }
    return lvl;
}

function getRepLevelName(level) {
    return (REP_LEVELS.find((r) => r.level === level) || REP_LEVELS[0]).name;
}

function ensureVendorState(guildDoc) {
    const now = Date.now();
    if (!Array.isArray(guildDoc.vendors)) guildDoc.vendors = [];
    const existingIds = new Set(guildDoc.vendors.map((v) => v.vendorId));

    for (const v of VENDORS) {
        if (!existingIds.has(v.vendorId)) {
            const stock = {};
            for (const p of v.pool) stock[p.itemId] = Math.max(0, Math.floor(p.max * 0.6));
            guildDoc.vendors.push({
                vendorId: v.vendorId,
                name: v.name,
                restockEveryMs: v.restockEveryMs,
                nextRestockAt: now + Math.floor(v.restockEveryMs * 0.8),
                stock,
                specialUntil: 0,
            });
        }
    }
}

function readMapNumber(mapLike, key, fallback = 0) {
    if (!mapLike) return fallback;
    if (typeof mapLike.get === "function") return Number(mapLike.get(key) || fallback);
    return Number(mapLike[key] || fallback);
}

function writeMapNumber(mapLike, key, value) {
    if (!mapLike) return;
    const v = Number(value) || 0;
    if (typeof mapLike.set === "function") mapLike.set(key, v);
    else mapLike[key] = v;
}

function clamp(n, min, max) {
    const v = Number(n);
    if (!Number.isFinite(v)) return min;
    return Math.max(min, Math.min(max, v));
}

function computeDynamicPrice({ guildDoc, userDoc, itemId, districtId, side }) {
    const item = ITEMS[itemId];
    if (!item) return null;

    const cfg = guildDoc.config || {};
    const demand = readMapNumber(guildDoc.demandEma, itemId, 0);
    const demandFactor = clamp(demand, 0, Number(cfg.maxDemandFactor || 1.5));
    const guildHeat = clamp(Number(guildDoc.heat?.level || 0) / 100, 0, Number(cfg.maxHeatFactor || 1.2));
    const userHeat = clamp(Number(userDoc.heat?.level || 0) / 120, 0, 1.0);
    const heatFactor = clamp(guildHeat + userHeat, 0, Number(cfg.maxHeatFactor || 1.2));

    const territoryBonus = 1.0;
    const district = getDistrictById(districtId);
    const districtBias = district.id === "docks" ? 1.05 : district.id === "slums" ? 0.98 : 1.0;

    const now = Date.now();
    const discUntil = Number(cfg.discountUntil || 0);
    const discMult = Number(cfg.discountMultiplier || 1.0);
    const discount = discUntil > now && Number.isFinite(discMult) && discMult > 0 ? discMult : 1.0;

    const raw = item.basePrice * (1 + demandFactor) * (1 + heatFactor) * districtBias * territoryBonus * discount;
    const buyPrice = Math.max(1, Math.floor(raw));
    const sellPrice = Math.max(1, Math.floor(raw * item.buyback));

    return {
        district,
        item,
        buyPrice: side === "buy" ? buyPrice : sellPrice,
        buyPriceRaw: buyPrice,
        sellPriceRaw: sellPrice,
        factors: { demandFactor, heatFactor, districtBias },
    };
}

function computeInterceptChance({ guildDoc, userDoc, item, districtId, totalValue }) {
    const cfg = guildDoc.config || {};
    const base = clamp(Number(item.risk || 0), 0, 0.95);
    const patrolBase = clamp(Number(cfg.patrolBaseChance || 0.08), 0, 0.5);
    const patrol = clamp(Number(guildDoc.patrol?.intensity || 0.35), 0, 1);

    const heat = clamp(Number(userDoc.heat?.level || 0) / 100, 0, 0.75);
    const volume = clamp(Math.log10(Math.max(10, totalValue)) / 10, 0, 0.25);

    const now = Date.now();
    const cps = Array.isArray(guildDoc.checkpoints) ? guildDoc.checkpoints : [];
    const checkpointActive = cps.some((c) => c.districtId === districtId && (c.activeUntil || 0) > now);
    const checkpointBonus = checkpointActive ? clamp(Number(cfg.checkpointBonus || 0.12), 0, 0.5) : 0;

    const chance = clamp(base + patrolBase * patrol + heat + volume + checkpointBonus, 0.02, 0.95);
    return { chance, checkpointActive };
}

function decayHeat({ level, lastUpdateAt, decayPerHour }) {
    const now = Date.now();
    const last = Number(lastUpdateAt || 0);
    if (!last || now <= last) return { level: Math.max(0, Math.floor(level || 0)), lastUpdateAt: now };
    const hours = (now - last) / (60 * 60 * 1000);
    const dec = Math.floor(hours * Math.max(0, Number(decayPerHour || 0)));
    const next = Math.max(0, Math.floor((level || 0) - dec));
    return { level: next, lastUpdateAt: now };
}

function updateDemandEma(guildDoc, itemId, qty) {
    const cfg = guildDoc.config || {};
    const alpha = clamp(Number(cfg.demandEmaAlpha || 0.25), 0.01, 0.9);
    const cur = readMapNumber(guildDoc.demandEma, itemId, 0);
    const impact = clamp(Number(qty) / 20, 0.02, 0.5);
    const next = cur * (1 - alpha) + impact * alpha;
    writeMapNumber(guildDoc.demandEma, itemId, next);
}

function addInventory(userDoc, itemId, qty) {
    const cur = readMapNumber(userDoc.inventory, itemId, 0);
    writeMapNumber(userDoc.inventory, itemId, Math.max(0, Math.floor(cur + qty)));
}

function removeInventory(userDoc, itemId, qty) {
    const cur = readMapNumber(userDoc.inventory, itemId, 0);
    if (cur < qty) return false;
    writeMapNumber(userDoc.inventory, itemId, Math.max(0, Math.floor(cur - qty)));
    return true;
}

function pickDistrictOrDefault(districtId) {
    if (!districtId) return DISTRICTS[Math.floor(Math.random() * DISTRICTS.length)];
    return getDistrictById(districtId);
}

module.exports = {
    DISTRICTS,
    REP_LEVELS,
    ITEMS,
    VENDORS,
    computeRepLevel,
    getRepLevelName,
    ensureVendorState,
    computeDynamicPrice,
    computeInterceptChance,
    decayHeat,
    updateDemandEma,
    addInventory,
    removeInventory,
    pickDistrictOrDefault,
};
