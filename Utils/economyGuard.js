const { EmbedBuilder } = require("discord.js");

function deny(text) {
    return new EmbedBuilder().setColor("Red").setDescription(text);
}

async function ensureEconomyAllowed(client, interaction, userId) {
    try {
        if (!client.userdb) throw new Error("Database not ready");
        
        const userdb = await client.userdb.getOrCreate(userId);
        if (!userdb.economia.restrictions) userdb.economia.restrictions = { bannedUntil: 0, blackMarketBannedUntil: 0, casinoBannedUntil: 0 };

        const bannedUntil = userdb.economia.restrictions.bannedUntil || 0;
        if (bannedUntil && Date.now() < bannedUntil) {
            return { ok: false, userdb, guildEco: null, embed: deny(`⛔ Você está banido do sistema econômico até <t:${Math.floor(bannedUntil / 1000)}:R>.`) };
        }

        let guildEco = null;
        if (interaction.guildId && client.guildEconomydb?.getOrCreate) {
            guildEco = await client.guildEconomydb.getOrCreate(interaction.guildId);
            const blackoutUntil = guildEco?.crisis?.blackoutUntil || 0;
            if (blackoutUntil && Date.now() < blackoutUntil) {
                return {
                    ok: false,
                    userdb,
                    guildEco,
                    embed: deny(`⚡ Blackout econômico ativo até <t:${Math.floor(blackoutUntil / 1000)}:R>. Ninguém pode ganhar dinheiro agora.`),
                };
            }
        }

        return { ok: true, userdb, guildEco, embed: null };
    } catch (err) {
        console.error("EconomyGuard Error:", err);
        return { 
            ok: false, 
            userdb: null, 
            guildEco: null, 
            embed: deny("❌ Erro ao verificar permissões de economia. Tente novamente.") 
        };
    }
}

module.exports = { ensureEconomyAllowed };

