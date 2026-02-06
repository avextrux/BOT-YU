const { EmbedBuilder } = require("discord.js");
const { getRandomGifUrl } = require("../../Utils/giphy");
const { formatMoney } = require("../../Utils/economy");
const { ensureEconomyAllowed } = require("../../Utils/economyGuard");
const logger = require("../../Utils/logger");
const { replyOrEdit } = require("../../Utils/commandKit");

module.exports = {
    name: "daily",
    description: "Resgate seu prêmio diário",
    type: 1, // CHAT_INPUT
    run: async (client, interaction) => {
        try {
            await interaction.deferReply().catch(() => {});

            const gate = await ensureEconomyAllowed(client, interaction, interaction.user.id);
            if (!gate.ok) return replyOrEdit(interaction, { embeds: [gate.embed], ephemeral: true });
            
            // Recarrega usuário atualizado após ensureEconomyAllowed
            const userdb = await client.userdb.getOrCreate(interaction.user.id);

            if (!userdb.economia.stats) userdb.economia.stats = {};
            if (!Array.isArray(userdb.economia.transactions)) userdb.economia.transactions = [];
            
            const cooldown = 86400000; // 24 horas
            const daily = userdb.cooldowns.daily;
            const now = Date.now();

            if (daily && (now - daily) < cooldown) {
                const time = cooldown - (now - daily);
                const hours = Math.floor(time / 3600000);
                const minutes = Math.floor((time % 3600000) / 60000);
                const seconds = Math.floor((time % 60000) / 1000);

                return replyOrEdit(interaction, {
                    embeds: [new EmbedBuilder()
                        .setTitle("⏳ Calma lá!")
                        .setColor("Red")
                        .setDescription(`Você já pegou seu daily hoje.\nVolte em **${hours}h ${minutes}m ${seconds}s**!`)
                    ],
                    ephemeral: true
                });
            }

            const lastAt = userdb.economia.stats.dailyLastAt || 0;
            const withinTwoDays = lastAt && (now - lastAt) <= 48 * 60 * 60 * 1000;
            const newStreak = withinTwoDays ? (userdb.economia.stats.dailyStreak || 0) + 1 : 1;
            const streakBonus = Math.min(newStreak * 75, 750);

            const base = Math.floor(Math.random() * 1500) + 500;
            const subsidy = gate.guildEco?.policy?.dailySubsidy || 0;
            const mult = gate.guildEco?.crisis?.active ? (gate.guildEco.crisis.multiplier || 1) : 1;
            const bruto = Math.floor((base + streakBonus + subsidy) * mult);
            const taxRate = Math.max(0, Math.min(0.25, gate.guildEco?.policy?.taxRate || 0));
            const tax = Math.floor(bruto * taxRate);
            const premio = Math.max(0, bruto - tax);

            userdb.economia.money += premio;
            userdb.cooldowns.daily = now;
            userdb.economia.stats.dailyStreak = newStreak;
            userdb.economia.stats.dailyLastAt = now;
            userdb.economia.transactions.push({
                at: now,
                type: "daily",
                walletDelta: premio,
                bankDelta: 0,
                meta: { base, streak: newStreak, bonus: streakBonus, subsidy, mult, tax },
            });
            userdb.economia.transactions = userdb.economia.transactions.slice(-50);
            await userdb.save();

            if (tax > 0 && gate.guildEco) {
                // Atualização atômica para evitar race condition na tesouraria
                await client.guildEconomydb.updateOne(
                    { guildID: interaction.guildId },
                    { $inc: { "policy.treasury": tax } }
                ).catch(() => {});
            }

            const gif =
                (await getRandomGifUrl("money reward", { rating: "pg-13" }).catch(() => null)) ||
                "https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif";

            const embed = new EmbedBuilder()
                .setTitle("📅 Prêmio Diário")
                .setColor("Green")
                .setDescription(`Você resgatou seu prêmio diário de hoje!`)
                .addFields(
                    { name: "💰 Ganhou", value: `**${formatMoney(premio)}**`, inline: true },
                    { name: "🔥 Sequência", value: `**${newStreak}**`, inline: true },
                    { name: "🧾 Imposto", value: tax > 0 ? `-${formatMoney(tax)}` : "-", inline: true },
                    { name: "💸 Saldo Atual", value: `**${formatMoney(userdb.economia.money)}**`, inline: true }
                )
                .setThumbnail("https://i.imgur.com/4J5h6X8.png")
                .setImage(gif)
                .setFooter({ text: "Volte amanhã para mais!" });

            replyOrEdit(interaction, { embeds: [embed] });

        } catch (err) {
            logger.error("Erro ao resgatar daily", { error: String(err?.message || err) });
            replyOrEdit(interaction, { content: "Erro ao resgatar daily.", ephemeral: true }).catch(() => {});
        }
    }
};
