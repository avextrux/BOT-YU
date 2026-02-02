const client = require("../../index");
const Discord = require("discord.js");

function getVoteCount(votes, userId) {
    if (!votes) return 0;
    if (typeof votes.get === "function") return votes.get(userId) || 0;
    return votes[userId] || 0;
}

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

async function finalizeElections() {
    try {
        if (!client.guildEconomydb) return;
        const now = Date.now();
        const actives = await client.guildEconomydb.find({ "election.active": true, "election.endsAt": { $gt: 0, $lte: now } }).limit(50);

        for (const eco of actives) {
            const candidates = eco.election.candidates || [];
            let winner = null;
            let best = -1;
            const results = candidates
                .map((id, idx) => {
                    const paid = getVoteCount(eco.election.paidVotes, id);
                    const free = getVoteCount(eco.election.votes, id);
                    return { id, votes: free + paid, paid, idx };
                })
                .sort((a, b) => (b.votes - a.votes) || (a.idx - b.idx));

            for (const r of results) {
                const v = r.votes;
                if (v > best) {
                    best = v;
                    winner = r.id;
                }
            }
            if (winner) {
                eco.policy.presidentId = winner;
            }
            eco.election.active = false;
            eco.election.endsAt = 0;
            await eco.save().catch(() => {});

            const channelId = eco.election.announceChannelId;
            if (channelId) {
                const top = results.slice(0, 10);
                const placar = top.length
                    ? top.map((r, i) => `**${i + 1}.** <@${r.id}> — **${r.votes}** voto(s) (${r.paid} comprados)`).join("\n")
                    : "-";

                const embed = new Discord.MessageEmbed()
                    .setTitle("🏁 Resultado da Eleição")
                    .setColor("BLURPLE")
                    .addField("Vencedor", winner ? `<@${winner}>` : "Sem candidatos", false)
                    .addField("Placar (Top 10)", placar, false)
                    .setFooter({ text: `Total de votantes: ${(eco.election?.voters || []).length}` });

                const content = eco.election.pingEveryone ? "@everyone" : undefined;
                await trySendToChannel(channelId, { content, embeds: [embed] });
            }
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

