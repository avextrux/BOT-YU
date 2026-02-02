const client = require("../../index");
const { DISTRICTS } = require("../../Utils/blackMarketEngine");

function pickDistrict() {
    return DISTRICTS[Math.floor(Math.random() * DISTRICTS.length)].id;
}

async function tick() {
    try {
        if (!client.blackMarketGuilddb || !client.policedb) return;
        const now = Date.now();
        const guilds = await client.blackMarketGuilddb.find({ active: true }).limit(100);

        for (const g of guilds) {
            const police = await client.policedb.findOne({ guildID: g.guildID }).lean();
            if (!police?.officers?.length) continue;

            const cfg = g.config || {};
            const max = Math.max(1, Math.floor(cfg.maxCheckpoints || 3));
            const duration = Math.max(5 * 60 * 1000, Math.floor(cfg.checkpointDurationMs || 20 * 60 * 1000));
            const list = Array.isArray(g.checkpoints) ? g.checkpoints.filter((c) => (c.activeUntil || 0) > now) : [];
            if (list.length >= max) continue;

            const patrol = Math.max(0.05, Math.min(0.95, Number(g.patrol?.intensity || 0.35)));
            const chance = 0.10 + patrol * 0.15;
            if (Math.random() > chance) continue;

            const districtId = pickDistrict();
            g.checkpoints = list.concat([{ districtId, createdAt: now, activeUntil: now + duration, placedBy: null }]).slice(-20);
            await g.save().catch(() => {});
        }
    } catch (err) {
        console.error(err);
    }
}

client.on("ready", () => {
    setInterval(() => {
        tick();
    }, 5 * 60 * 1000);
});

