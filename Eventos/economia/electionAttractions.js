const client = require("../../index");
const { EmbedBuilder, Events } = require("discord.js");

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

function pickMultiplier() {
    const multipliers = [0.5, 0.6, 0.7, 0.75, 0.8];
    return multipliers[Math.floor(Math.random() * multipliers.length)];
}

async function tick() {
    try {
        if (!client.guildEconomydb) return;
        const now = Date.now();
        const actives = await client.guildEconomydb
            .find({ "election.active": true, "election.endsAt": { $gt: now } })
            .limit(50);

        for (const eco of actives) {
            const shop = eco.election?.voteShop || null;
            if (!shop) continue;
            if (shop.enabled === false) continue;
            if ((shop.boostUntil || 0) > now) continue;

            const cooldownMs = 60 * 60 * 1000;
            if (now - (shop.lastEventAt || 0) < cooldownMs) continue;

            const chance = 0.20;
            if (Math.random() > chance) continue;

            const minutes = 20;
            const mult = pickMultiplier();
            eco.election.voteShop.lastEventAt = now;
            eco.election.voteShop.boostUntil = now + minutes * 60 * 1000;
            eco.election.voteShop.boostMultiplier = mult;
            await eco.save().catch(() => {});

            const embed = new EmbedBuilder()
                .setTitle("🎪 Atração Aleatória: Promoção de Urna!")
                .setColor("Gold")
                .setDescription(
                    [
                        `Por **${minutes} minutos**, a compra de votos está com desconto!`,
                        `Multiplicador de preço: **x${mult}**`,
                        "",
                        "Use: `/eleicao` → **Comprar Votos** (menu)",
                    ].join("\n")
                );

            const channelId = eco.election.announceChannelId;
            const content = eco.election.pingEveryone ? "@everyone" : undefined;
            await trySendToChannel(channelId, { content, embeds: [embed] });
        }
    } catch (err) {
        console.error(err);
    }
}

client.on(Events.ClientReady, () => {
    setInterval(() => {
        tick();
    }, 5 * 60 * 1000);
});

