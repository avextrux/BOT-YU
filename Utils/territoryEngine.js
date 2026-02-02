const { DISTRICTS } = require("./blackMarketEngine");

function territoryIdFor(guildId, districtId) {
    return `${guildId}_${districtId}`;
}

function territoryNameFor(districtId) {
    return (DISTRICTS.find((d) => d.id === districtId) || DISTRICTS[0]).name;
}

async function ensureTerritories(client, guildId) {
    if (!client.territorydb) return [];
    const existing = await client.territorydb.find({ guildID: guildId }).lean();
    const have = new Set(existing.map((t) => t.territoryId));
    const created = [];
    for (const d of DISTRICTS) {
        const id = territoryIdFor(guildId, d.id);
        if (have.has(id)) continue;
        created.push({
            guildID: guildId,
            territoryId: id,
            createdAt: Date.now(),
            name: d.name,
            ownerFactionId: null,
            influence: {},
            policeInfluence: 0,
            lastWarAt: 0,
            bonus: "none",
        });
    }
    if (created.length) await client.territorydb.insertMany(created).catch(() => {});
    return client.territorydb.find({ guildID: guildId });
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

function recomputeOwner(territoryDoc) {
    const infl = territoryDoc.influence || new Map();
    const entries = typeof infl.entries === "function" ? Array.from(infl.entries()) : Object.entries(infl);
    let best = null;
    let bestVal = 0;
    for (const [factionId, val] of entries) {
        const v = Number(val) || 0;
        if (v > bestVal) {
            bestVal = v;
            best = factionId;
        }
    }
    const police = Math.max(0, Math.floor(territoryDoc.policeInfluence || 0));
    if (best && bestVal >= 100 && bestVal >= police + 20) {
        territoryDoc.ownerFactionId = best;
        territoryDoc.bonus = "discount";
        return;
    }
    if (police >= 120) {
        territoryDoc.ownerFactionId = null;
        territoryDoc.bonus = "none";
    }
}

async function applyCriminalInfluence(client, guildId, districtId, factionId, amount) {
    if (!client.territorydb) return null;
    const t = await client.territorydb.findOne({ territoryId: territoryIdFor(guildId, districtId) });
    if (!t) return null;
    const inc = Math.max(0, Math.floor(amount || 0));
    const next = readMapNumber(t.influence, factionId, 0) + inc;
    writeMapNumber(t.influence, factionId, next);
    t.policeInfluence = Math.max(0, Math.floor((t.policeInfluence || 0) - Math.ceil(inc * 0.3)));
    recomputeOwner(t);
    await t.save().catch(() => {});
    return t;
}

async function applyPoliceInfluence(client, guildId, districtId, amount) {
    if (!client.territorydb) return null;
    const t = await client.territorydb.findOne({ territoryId: territoryIdFor(guildId, districtId) });
    if (!t) return null;
    const inc = Math.max(0, Math.floor(amount || 0));
    t.policeInfluence = Math.max(0, Math.floor((t.policeInfluence || 0) + inc));
    const infl = t.influence || new Map();
    const entries = typeof infl.entries === "function" ? Array.from(infl.entries()) : Object.entries(infl);
    for (const [factionId, val] of entries) {
        const v = Math.max(0, Math.floor(Number(val) || 0) - Math.ceil(inc * 0.2));
        writeMapNumber(t.influence, factionId, v);
    }
    recomputeOwner(t);
    await t.save().catch(() => {});
    return t;
}

module.exports = {
    territoryIdFor,
    territoryNameFor,
    ensureTerritories,
    applyCriminalInfluence,
    applyPoliceInfluence,
};

