const client = require("../../index");

async function finalizeElections() {
    try {
        if (!client.guildEconomydb) return;
        const now = Date.now();
        const actives = await client.guildEconomydb.find({ "election.active": true, "election.endsAt": { $gt: 0, $lte: now } }).limit(50);

        for (const eco of actives) {
            const candidates = eco.election.candidates || [];
            let winner = null;
            let best = -1;
            for (const id of candidates) {
                const v = (eco.election.votes?.get ? eco.election.votes.get(id) : eco.election.votes?.[id]) || 0;
                if (v > best) {
                    best = v;
                    winner = id;
                }
            }
            if (winner) {
                eco.policy.presidentId = winner;
            }
            eco.election.active = false;
            eco.election.endsAt = 0;
            await eco.save().catch(() => {});
        }
    } catch (err) {
        console.error(err);
    }
}

async function expireCrises() {
    try {
        if (!client.guildEconomydb) return;
        const now = Date.now();
        const actives = await client.guildEconomydb.find({ "crisis.active": true, "crisis.endsAt": { $gt: 0, $lte: now } }).limit(50);
        for (const eco of actives) {
            eco.crisis.active = false;
            eco.crisis.type = null;
            eco.crisis.endsAt = 0;
            eco.crisis.multiplier = 1.0;
            eco.crisis.blackoutUntil = 0;
            await eco.save().catch(() => {});
        }
    } catch (err) {
        console.error(err);
    }
}

client.on("ready", () => {
    setInterval(() => {
        finalizeElections();
        expireCrises();
    }, 30 * 1000);
});

