const Discord = require("discord.js");
const { getRandomGifUrl } = require("../../Utils/giphy");
const { formatMoney } = require("../../Utils/economy");
const { ensureEconomyAllowed } = require("../../Utils/economyGuard");
const { getPolice, isOfficer } = require("../../Utils/police");

function hasRecentBlackMarket(userdb, windowMs) {
    const list = Array.isArray(userdb?.economia?.transactions) ? userdb.economia.transactions : [];
    const now = Date.now();
    return list.some((t) => {
        const type = String(t.type || "");
        if (!type.startsWith("blackmarket_")) return false;
        const at = Number(t.at || 0);
        return at > 0 && now - at <= windowMs;
    });
}

module.exports = {
    name: "investigar",
    description: "Polícia econômica: investigue suspeitos do mercado negro",
    type: "CHAT_INPUT",
    options: [
        { name: "usuario", description: "Suspeito", type: "USER", required: true },
    ],
    run: async (client, interaction) => {
        try {
            const gate = await ensureEconomyAllowed(client, interaction, interaction.user.id);
            if (!gate.ok) return interaction.reply({ embeds: [gate.embed], ephemeral: true });

            const police = await getPolice(client, interaction.guildId);
            if (!police?.chiefId) {
                return interaction.reply({ content: "⚠️ Ainda não existe chefe de polícia. Um admin deve usar `/policia definir_chefe`.", ephemeral: true });
            }
            if (!isOfficer(police, interaction.user.id)) {
                return interaction.reply({
                    content: "❌ Você não é da polícia. Use `/policia candidatar` e aguarde aprovação do chefe.",
                    ephemeral: true,
                });
            }

            const target = interaction.options.getUser("usuario");
            if (target.bot) return interaction.reply({ content: "❌ Não investigue bots.", ephemeral: true });
            if (target.id === interaction.user.id) return interaction.reply({ content: "❌ Você não pode se investigar.", ephemeral: true });

            const inv = await client.userdb.getOrCreate(interaction.user.id);
            const now = Date.now();
            const cd = inv.cooldowns.investigar || 0;
            if (now < cd) {
                return interaction.reply({ content: `⏳ Você pode investigar novamente <t:${Math.floor(cd / 1000)}:R>.`, ephemeral: true });
            }

            inv.cooldowns.investigar = now + 10 * 60 * 1000;
            await inv.save();

            const tdb = await client.userdb.getOrCreate(target.id);
            const suspicious = hasRecentBlackMarket(tdb, 30 * 60 * 1000);
            const chance = suspicious ? 0.65 : 0.15;
            const caught = Math.random() < chance;

            const gifQuery = caught ? "police arrest" : "police search";
            const gif =
                (await getRandomGifUrl(gifQuery, { rating: "pg-13" }).catch(() => null)) ||
                "https://media.giphy.com/media/26BRBupaJvXQy1m7S/giphy.gif";

            const embed = new Discord.MessageEmbed()
                .setTitle("🕵️ Investigação")
                .setColor(caught ? "GREEN" : "GREY")
                .setImage(gif);

            if (caught) {
                const mins = suspicious ? 45 : 20;
                if (!tdb.economia.restrictions) tdb.economia.restrictions = { bannedUntil: 0 };
                tdb.economia.restrictions.bannedUntil = Math.max(tdb.economia.restrictions.bannedUntil || 0, now + mins * 60 * 1000);
                tdb.economia.transactions.push({ at: now, type: "police_ban", walletDelta: 0, bankDelta: 0, meta: { by: interaction.user.id, mins } });
                tdb.economia.transactions = tdb.economia.transactions.slice(-50);
                await tdb.save();

                const reward = suspicious ? 500 : 200;
                const u2 = await client.userdb.findOneAndUpdate(
                    { userID: interaction.user.id },
                    {
                        $inc: { "economia.money": reward },
                        $push: {
                            "economia.transactions": {
                                $each: [{ at: now, type: "police_reward", walletDelta: reward, bankDelta: 0, meta: { target: target.id } }],
                                $slice: -50,
                            },
                        },
                    },
                    { new: true }
                );

                embed.setDescription(
                    `✅ Você encontrou provas contra ${target}.\n` +
                        `⛔ Ban econômico: **${mins} min**\n` +
                        `💰 Recompensa: **${formatMoney(reward)}**\n` +
                        `Seu saldo: **${formatMoney(u2.economia.money || 0)}**`
                );
            } else {
                embed.setDescription(`❌ Nada encontrado contra ${target}.`);
            }

            return interaction.reply({ embeds: [embed] });
        } catch (err) {
            console.error(err);
            interaction.reply({ content: "Erro ao investigar.", ephemeral: true }).catch(() => {});
        }
    }
};

