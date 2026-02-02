const Discord = require("discord.js");
const { getRandomGifUrl } = require("../../Utils/giphy");
const { formatMoney, creditWallet } = require("../../Utils/economy");
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
    description: "Polícia econômica: coletar pistas contra um suspeito",
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
            const chance = suspicious ? 0.70 : 0.20;
            const found = Math.random() < chance;

            const gifQuery = found ? "police investigation" : "police search";
            const gif =
                (await getRandomGifUrl(gifQuery, { rating: "pg-13" }).catch(() => null)) ||
                "https://media.giphy.com/media/26BRBupaJvXQy1m7S/giphy.gif";

            const embed = new Discord.MessageEmbed()
                .setTitle("🕵️ Investigação")
                .setColor(found ? "GREEN" : "GREY")
                .setImage(gif);

            if (!found) {
                embed.setDescription(`❌ Nada concreto encontrado contra ${target}.`);
                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            if (!client.policeCasedb) {
                embed.setDescription(`✅ Pistas encontradas contra ${target}, mas o banco de casos não está disponível.`);
                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            const existing = await client.policeCasedb.findOne({ guildID: interaction.guildId, status: "open", suspectId: target.id }).sort({ createdAt: -1 });
            const inc = Math.floor(15 + chance * 25);
            const estimated = Math.floor(500 + chance * 2000);
            let caseId = "";
            let progress = 0;

            if (existing) {
                existing.progress = Math.min(100, Math.floor((existing.progress || 0) + inc));
                existing.estimatedValue = Math.max(existing.estimatedValue || 0, estimated);
                existing.evidence.push({ at: now, kind: "investigation", by: interaction.user.id, data: { suspicious } });
                existing.evidence = existing.evidence.slice(-50);
                await existing.save().catch(() => {});
                caseId = existing.caseId;
                progress = existing.progress;
            } else {
                caseId = `CASE${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
                await client.policeCasedb.create({
                    guildID: interaction.guildId,
                    caseId,
                    createdAt: now,
                    status: "open",
                    suspectId: target.id,
                    assignedTo: interaction.user.id,
                    progress: Math.floor(25 + chance * 25),
                    riskScore: Math.floor(chance * 100),
                    estimatedValue: estimated,
                    evidence: [{ at: now, kind: "investigation", by: interaction.user.id, data: { suspicious } }],
                });
                progress = Math.floor(25 + chance * 25);
            }

            const eco = await client.guildEconomydb.getOrCreate(interaction.guildId);
            if (!eco.policy) eco.policy = {};
            if (eco.policy.treasury === undefined || eco.policy.treasury === null) eco.policy.treasury = 0;
            const reward = suspicious ? 250 : 100;
            const paid = Math.min(reward, Math.floor(eco.policy.treasury || 0));
            eco.policy.treasury = Math.floor((eco.policy.treasury || 0) - paid);
            await eco.save().catch(() => {});
            if (paid > 0) await creditWallet(client.userdb, interaction.user.id, paid, "police_clue_reward", { guildId: interaction.guildId, caseId }).catch(() => {});

            embed.setDescription(
                `✅ Pistas encontradas contra ${target}.\n` +
                `🗂️ Caso: **${caseId}**\n` +
                `📈 Progresso: **${progress}%**\n` +
                `💰 Recompensa (tesouro): **${formatMoney(paid)}**`
            );

            return interaction.reply({ embeds: [embed], ephemeral: true });
        } catch (err) {
            console.error(err);
            interaction.reply({ content: "Erro ao investigar.", ephemeral: true }).catch(() => {});
        }
    }
};

