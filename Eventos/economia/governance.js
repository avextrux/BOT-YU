const { Events, EmbedBuilder } = require("discord.js");
const logger = require("../../Utils/logger");

function getVoteCount(votes, userId) {
    if (!votes) return 0;
    if (typeof votes.get === "function") return votes.get(userId) || 0;
    return votes[userId] || 0;
}

async function trySendToChannel(client, channelId, payload) {
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

async function finalizeElections(client) {
    try {
        if (!client.guildEconomydb) return;
        const now = Date.now();
        // Aumentado limit e processamento em chunk se necessário
        const actives = await client.guildEconomydb.find({ "election.active": true, "election.endsAt": { $gt: 0, $lte: now } }).limit(100);

        if (!actives || actives.length === 0) return;

        logger.info("Governance", `Finalizing ${actives.length} elections.`);

        // Processa em paralelo
        await Promise.all(actives.map(async (eco) => {
            try {
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
                await eco.save();

                const channelId = eco.election.announceChannelId;
                if (channelId) {
                    const top = results.slice(0, 10);
                    const placar = top.length
                        ? top.map((r, i) => `**${i + 1}.** <@${r.id}> — **${r.votes}** voto(s) (${r.paid} comprados)`).join("\n")
                        : "-";

                    const embed = new EmbedBuilder()
                        .setTitle("🏁 Resultado da Eleição")
                        .setColor("Blurple")
                        .addFields(
                            { name: "Vencedor", value: winner ? `<@${winner}>` : "Sem candidatos", inline: false },
                            { name: "Placar (Top 10)", value: placar, inline: false }
                        )
                        .setFooter({ text: `Total de votantes: ${(eco.election?.voters || []).length}` });

                    const content = eco.election.pingEveryone ? "@everyone" : undefined;
                    await trySendToChannel(client, channelId, { content, embeds: [embed] });
                }
            } catch (err) {
                logger.error("Governance", `Error finalizing election for guild ${eco.guildID}: ${err.message}`);
            }
        }));

    } catch (err) {
        logger.error("Governance", `Error in election loop: ${err.message}`);
    }
}

async function expireCrises(client) {
    try {
        if (!client.guildEconomydb) return;
        const now = Date.now();
        await client.guildEconomydb.updateMany(
            { "crisis.active": true, "crisis.endsAt": { $gt: 0, $lte: now } },
            {
                $set: {
                    "crisis.active": false,
                    "crisis.type": null,
                    "crisis.endsAt": 0,
                    "crisis.multiplier": 1.0,
                    "crisis.blackoutUntil": 0,
                },
            }
        );
    } catch (err) {
        logger.error("Governance", `Error expiring crises: ${err.message}`);
    }
}

module.exports = (client) => {
    client.on(Events.ClientReady, () => {
        setInterval(() => {
            finalizeElections(client);
            expireCrises(client);
        }, 2 * 60 * 1000);
    });
};

