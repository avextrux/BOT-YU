const { ITEMS } = require("./blackMarketEngine");

function lcg(seed) {
    let s = Math.floor(Number(seed) || 0) >>> 0;
    return () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s;
    };
}

function pick(arr, rnd) {
    if (!arr.length) return null;
    return arr[rnd() % arr.length];
}

function ensureSeedsAndResets(guildDoc) {
    if (!guildDoc.config) guildDoc.config = {};
    if (!guildDoc.mission) guildDoc.mission = { dailySeed: 0, weeklySeed: 0 };
    const now = Date.now();
    if (!guildDoc.config.dailyResetAt) guildDoc.config.dailyResetAt = now + 24 * 60 * 60 * 1000;
    if (!guildDoc.config.weeklyResetAt) guildDoc.config.weeklyResetAt = now + 7 * 24 * 60 * 60 * 1000;
    if (!guildDoc.mission.dailySeed) guildDoc.mission.dailySeed = Math.floor(Math.random() * 1e9);
    if (!guildDoc.mission.weeklySeed) guildDoc.mission.weeklySeed = Math.floor(Math.random() * 1e9);
}

function buildDailyMissions(seed, side) {
    const rnd = lcg(seed + (side === "police" ? 77 : 11));
    const itemKeys = Object.keys(ITEMS);
    const i1 = pick(itemKeys, rnd);
    const i2 = pick(itemKeys, rnd);

    if (side === "police") {
        return [
            { kind: "daily", side, type: "patrol", goal: 3 },
            { kind: "daily", side, type: "checkpoint", goal: 2 },
            { kind: "daily", side, type: "capture", goal: 1 },
        ].map((m) => ({
            missionId: `${m.kind}:${m.side}:${m.type}::${m.goal}`,
            ...m,
        }));
    }

    return [
        { kind: "daily", side, type: "buy", itemId: i1, goal: 10 + (rnd() % 15) },
        { kind: "daily", side, type: "sell", itemId: i2, goal: 6 + (rnd() % 12) },
        { kind: "daily", side, type: "runs", goal: 5 + (rnd() % 6) },
    ].map((m) => ({
        missionId: `${m.kind}:${m.side}:${m.type}:${m.itemId || ""}:${m.goal}`,
        ...m,
    }));
}

function buildWeeklyMissions(seed, side) {
    const rnd = lcg(seed + (side === "police" ? 177 : 111));
    const itemKeys = Object.keys(ITEMS);
    const i1 = pick(itemKeys, rnd);
    const i2 = pick(itemKeys, rnd);

    if (side === "police") {
        return [
            { kind: "weekly", side, type: "patrol", goal: 15 },
            { kind: "weekly", side, type: "capture", goal: 5 },
        ].map((m) => ({
            missionId: `${m.kind}:${m.side}:${m.type}::${m.goal}`,
            ...m,
        }));
    }

    return [
        { kind: "weekly", side, type: "buy", itemId: i1, goal: 60 + (rnd() % 60) },
        { kind: "weekly", side, type: "sell", itemId: i2, goal: 40 + (rnd() % 50) },
    ].map((m) => ({
        missionId: `${m.kind}:${m.side}:${m.type}:${m.itemId || ""}:${m.goal}`,
        ...m,
    }));
}

function syncMissions(guildDoc, userDoc) {
    ensureSeedsAndResets(guildDoc);
    if (!Array.isArray(userDoc.missions)) userDoc.missions = [];
    const now = Date.now();

    const dailyAt = Number(guildDoc.config.dailyResetAt || 0);
    const weeklyAt = Number(guildDoc.config.weeklyResetAt || 0);

    userDoc.missions = userDoc.missions.filter((m) => (m.resetsAt || 0) > now).slice(-30);

    const have = new Set(userDoc.missions.map((m) => m.missionId));

    for (const side of ["criminal", "police"]) {
        const daily = buildDailyMissions(guildDoc.mission.dailySeed, side);
        for (const m of daily) {
            if (have.has(m.missionId)) continue;
            userDoc.missions.push({ missionId: m.missionId, kind: m.kind, progress: 0, goal: m.goal, claimed: false, resetsAt: dailyAt });
            have.add(m.missionId);
        }
        const weekly = buildWeeklyMissions(guildDoc.mission.weeklySeed, side);
        for (const m of weekly) {
            if (have.has(m.missionId)) continue;
            userDoc.missions.push({ missionId: m.missionId, kind: m.kind, progress: 0, goal: m.goal, claimed: false, resetsAt: weeklyAt });
            have.add(m.missionId);
        }
    }
}

function parseMissionId(id) {
    const parts = String(id || "").split(":");
    if (parts.length < 5) return null;
    const [kind, side, type, itemId, goalStr] = parts;
    const goal = Math.max(0, Math.floor(Number(goalStr) || 0));
    return { kind, side, type, itemId: itemId || null, goal };
}

function missionTitle(def) {
    if (!def) return "-";
    if (def.side === "police") {
        if (def.type === "patrol") return `Patrulhar **${def.goal}x**`;
        if (def.type === "checkpoint") return `Colocar **${def.goal} checkpoint(s)**`;
        if (def.type === "capture") return `Capturar **${def.goal} suspeito(s)**`;
    }
    if (def.type === "runs") return `Completar **${def.goal} run(s)** no submundo`;
    if (def.type === "buy") return `Comprar **${def.goal}x** ${ITEMS[def.itemId]?.name || def.itemId}`;
    if (def.type === "sell") return `Vender **${def.goal}x** ${ITEMS[def.itemId]?.name || def.itemId}`;
    return "-";
}

function missionRewards(def) {
    if (!def) return { money: 0, rep: 0 };
    if (def.side === "police") {
        const base = def.kind === "weekly" ? 600 : 180;
        return { money: base + def.goal * 80, rep: 0 };
    }
    const base = def.kind === "weekly" ? 800 : 220;
    const itemBase = def.itemId && ITEMS[def.itemId] ? ITEMS[def.itemId].basePrice : 300;
    const weight = def.type === "sell" ? 0.12 : def.type === "buy" ? 0.10 : 0.08;
    return { money: Math.floor(base + def.goal * itemBase * weight), rep: def.kind === "weekly" ? 120 : 45 };
}

function applyMissionProgress(userDoc, { side, type, itemId = null, delta = 1 }) {
    const now = Date.now();
    if (!Array.isArray(userDoc.missions) || !userDoc.missions.length) return;
    for (const m of userDoc.missions) {
        if (m.claimed) continue;
        if ((m.resetsAt || 0) <= now) continue;
        const def = parseMissionId(m.missionId);
        if (!def) continue;
        if (def.side !== side) continue;
        if (def.type !== type) continue;
        if (def.itemId && itemId && def.itemId !== itemId) continue;
        m.progress = Math.min(m.goal || def.goal || 0, Math.floor((m.progress || 0) + delta));
    }
}

module.exports = {
    ensureSeedsAndResets,
    syncMissions,
    parseMissionId,
    missionTitle,
    missionRewards,
    applyMissionProgress,
};

