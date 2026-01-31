const Discord = require("discord.js");
const { getRandomGifUrl } = require("../../Utils/giphy");
const { formatMoney, debitWalletIfEnough, creditWallet, errorEmbed } = require("../../Utils/economy");
const { ensureEconomyAllowed } = require("../../Utils/economyGuard");

function rollOutcome() {
    const r = Math.random();
    if (r < 0.10) return { type: "lose_all" };
    if (r < 0.25) return { type: "ban" };
    if (r < 0.45) return { type: "small_win", mult: 1.5 };
    if (r < 0.70) return { type: "win", mult: 2.0 };
    if (r < 0.90) return { type: "big_win", mult: 3.0 };
    return { type: "jackpot", mult: 5.0 };
}

module.exports = {
    name: "mercadonegro",
    description: "Área ilegal: alto risco, alto retorno",
    type: "CHAT_INPUT",
    options: [
        {
            name: "comprar",
            description: "Compra uma caixa ilegal",
            type: "SUB_COMMAND",
            options: [
                { name: "aposta", description: "Quanto você quer arriscar", type: "NUMBER", required: true },
            ],
        },
        {
            name: "status",
            description: "Mostra seu status no mercado negro",
            type: "SUB_COMMAND",
        },
    ],
    run: async (client, interaction) => {
        try {
            const sub = interaction.options.getSubcommand();

            if (sub === "status") {
                const userdb = await client.userdb.getOrCreate(interaction.user.id);
                const bannedUntil = userdb.economia?.restrictions?.bannedUntil || 0;
                const embed = new Discord.MessageEmbed()
                    .setTitle("💣 Mercado Negro")
                    .setColor("DARK_BUT_NOT_BLACK")
                    .setDescription(
                        bannedUntil && Date.now() < bannedUntil
                            ? `⛔ Ban econômico até <t:${Math.floor(bannedUntil / 1000)}:R>.`
                            : "✅ Sem ban econômico ativo."
                    );
                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            const gate = await ensureEconomyAllowed(client, interaction, interaction.user.id);
            if (!gate.ok) return interaction.reply({ embeds: [gate.embed], ephemeral: true });

            const bet = Math.floor(interaction.options.getNumber("aposta"));
            if (!Number.isFinite(bet) || bet <= 0) {
                return interaction.reply({ embeds: [errorEmbed("❌ Aposta inválida.")], ephemeral: true });
            }

            const debited = await debitWalletIfEnough(client.userdb, interaction.user.id, bet, "blackmarket_bet", { guild: interaction.guildId });
            if (!debited) {
                return interaction.reply({ embeds: [errorEmbed("❌ Saldo insuficiente na carteira.")], ephemeral: true });
            }

            const outcome = rollOutcome();
            const userdb = await client.userdb.findOne({ userID: interaction.user.id });
            if (!userdb.economia.restrictions) userdb.economia.restrictions = { bannedUntil: 0 };

            let resultText = "";
            let color = "GREY";
            let gifQuery = "black market";

            if (outcome.type === "lose_all") {
                const lost = userdb.economia.money || 0;
                userdb.economia.money = 0;
                userdb.economia.transactions.push({
                    at: Date.now(),
                    type: "blackmarket_lose_all",
                    walletDelta: -lost,
                    bankDelta: 0,
                    meta: { bet },
                });
                userdb.economia.transactions = userdb.economia.transactions.slice(-50);
                await userdb.save();
                resultText = `🚨 A polícia te pegou no flagra. Você perdeu **TUDO** da carteira (**${formatMoney(lost)}**).`;
                color = "RED";
                gifQuery = "police caught";
            } else if (outcome.type === "ban") {
                const mins = 60;
                userdb.economia.restrictions.bannedUntil = Date.now() + mins * 60 * 1000;
                userdb.economia.transactions.push({
                    at: Date.now(),
                    type: "blackmarket_ban",
                    walletDelta: 0,
                    bankDelta: 0,
                    meta: { bet, mins },
                });
                userdb.economia.transactions = userdb.economia.transactions.slice(-50);
                await userdb.save();
                resultText = `⛔ Você foi banido do sistema econômico por **${mins} minutos**.`;
                color = "DARK_RED";
                gifQuery = "police siren";
            } else {
                const win = Math.floor(bet * outcome.mult);
                await creditWallet(client.userdb, interaction.user.id, win, "blackmarket_win", { bet, mult: outcome.mult }).catch(() => {});
                resultText = `💰 Negócio fechado. Você recebeu **${formatMoney(win)}**.`;
                color = "GREEN";
                gifQuery = "money deal";
            }

            const gif =
                (await getRandomGifUrl(gifQuery, { rating: "pg-13" }).catch(() => null)) ||
                "https://media.giphy.com/media/3o6gDWzmAzrpi5DQU8/giphy.gif";

            const updated = await client.userdb.getOrCreate(interaction.user.id);
            const embed = new Discord.MessageEmbed()
                .setTitle("💣 Mercado Negro")
                .setColor(color)
                .setDescription(resultText)
                .addFields({ name: "Saldo", value: formatMoney(updated.economia.money || 0), inline: true })
                .setImage(gif);

            return interaction.reply({ embeds: [embed] });
        } catch (err) {
            console.error(err);
            interaction.reply({ content: "Erro no mercado negro.", ephemeral: true }).catch(() => {});
        }
    }
};

