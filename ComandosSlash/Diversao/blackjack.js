const { 
    EmbedBuilder, 
    ButtonBuilder, 
    ActionRowBuilder, 
    ButtonStyle 
} = require("discord.js");
const { getRandomGifUrl } = require("../../Utils/giphy");
const { ensureEconomyAllowed } = require("../../Utils/economyGuard");
const logger = require("../../Utils/logger");
const { replyOrEdit } = require("../../Utils/commandKit");

function createDeck(decks = 4) {
    const ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
    const suits = ["♠️", "♥️", "♦️", "♣️"];
    const deck = [];
    for (let d = 0; d < decks; d++) {
        for (const r of ranks) {
            for (const s of suits) {
                deck.push({ rank: r, suit: s });
            }
        }
    }
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
}

function cardValue(rank) {
    if (rank === "A") return 11;
    if (["K", "Q", "J"].includes(rank)) return 10;
    return Number(rank);
}

function handValue(hand) {
    let total = 0;
    let aces = 0;
    for (const c of hand) {
        const v = cardValue(c.rank);
        total += v;
        if (c.rank === "A") aces++;
    }
    while (total > 21 && aces > 0) {
        total -= 10;
        aces--;
    }
    return total;
}

function isBlackjack(hand) {
    return hand.length === 2 && handValue(hand) === 21;
}

function handText(hand) {
    return hand.map((c) => `${c.rank}${c.suit}`).join(" ");
}

function formatMoney(n) {
    return `R$ ${Math.floor(n)}`;
}

function getGameStore(client) {
    if (!client._blackjackGames) client._blackjackGames = new Map();
    return client._blackjackGames;
}

function gameKey(guildId, userId) {
    return `${guildId}:${userId}`;
}

function actionRow(state) {
    const hit = new ButtonBuilder().setCustomId("bj_hit").setLabel("Pedir").setStyle(ButtonStyle.Primary);
    const stand = new ButtonBuilder().setCustomId("bj_stand").setLabel("Parar").setStyle(ButtonStyle.Success);
    const dbl = new ButtonBuilder().setCustomId("bj_double").setLabel("Dobrar").setStyle(ButtonStyle.Secondary);
    const surr = new ButtonBuilder().setCustomId("bj_surrender").setLabel("Desistir").setStyle(ButtonStyle.Danger);

    if (!state.canDouble) dbl.setDisabled(true);
    if (!state.canSurrender) surr.setDisabled(true);

    return new ActionRowBuilder().addComponents(hit, stand, dbl, surr);
}

function insuranceRow(state) {
    if (!state.canInsurance) return null;
    const yes = new ButtonBuilder().setCustomId("bj_ins_yes").setLabel("Seguro").setStyle(ButtonStyle.Primary);
    const no = new ButtonBuilder().setCustomId("bj_ins_no").setLabel("Sem seguro").setStyle(ButtonStyle.Secondary);
    return new ActionRowBuilder().addComponents(yes, no);
}

function gameEmbed(state, { title = "🃏 Blackjack", revealDealer = false, footer, imageUrl } = {}) {
    const playerVal = handValue(state.player);
    const dealerVal = handValue(state.dealer);
    const dealerHand = revealDealer ? `${handText(state.dealer)} (**${dealerVal}**)` : `${state.dealer[0].rank}${state.dealer[0].suit} ??`;

    const embed = new EmbedBuilder()
        .setTitle(title)
        .setColor("Blurple")
        .addFields(
            { name: "Sua mão", value: `${handText(state.player)} (**${playerVal}**)`, inline: false },
            { name: "Dealer", value: dealerHand, inline: false },
            { name: "Aposta", value: formatMoney(state.bet), inline: true },
            { name: "Seguro", value: state.insuranceBet > 0 ? formatMoney(state.insuranceBet) : "-", inline: true }
        );

    if (footer) embed.setFooter({ text: footer });
    if (imageUrl) embed.setImage(imageUrl);
    return embed;
}

module.exports = {
    name: "blackjack",
    description: "Jogue Blackjack contra o bot (com aposta)",
    type: 1, // CHAT_INPUT
    options: [
        {
            name: "aposta",
            description: "Valor da aposta",
            type: 10, // NUMBER
            required: true
        }
    ],
    run: async (client, interaction) => {
        try {
            const gate = await ensureEconomyAllowed(client, interaction, interaction.user.id);
            if (!gate.ok) return replyOrEdit(interaction, { embeds: [gate.embed], ephemeral: true });
            const aposta = Math.floor(interaction.options.getNumber("aposta"));
            if (!Number.isFinite(aposta) || aposta <= 0) {
                return interaction.reply({ content: "❌ Aposta inválida.", ephemeral: true });
            }

            const store = getGameStore(client);
            const k = gameKey(interaction.guildId, interaction.user.id);
            if (store.has(k)) {
                return interaction.reply({ content: "❌ Você já tem um blackjack em andamento.", ephemeral: true });
            }

            await interaction.deferReply().catch(() => null);
            
            const userdb = await client.userdb.getOrCreate(interaction.user.id);
            if ((userdb.economia.money || 0) < aposta) {
                await interaction.editReply({ content: "❌ Dinheiro insuficiente." }).catch(() => {});
                return;
            }

            userdb.economia.money -= aposta;
            await userdb.save();

            const deck = createDeck(4);
            const state = {
                bet: aposta,
                insuranceBet: 0,
                deck,
                player: [deck.pop(), deck.pop()],
                dealer: [deck.pop(), deck.pop()],
                canDouble: true,
                canSurrender: true,
                canInsurance: false,
                insuranceDecided: false,
            };

            const dealerUpIsAce = state.dealer[0].rank === "A";
            if (dealerUpIsAce) {
                state.canInsurance = true;
            }

            store.set(k, { userId: interaction.user.id, startedAt: Date.now() });

            const dealGif =
                (await getRandomGifUrl("casino blackjack dealing", { rating: "pg-13" }).catch(() => null)) ||
                "https://media.giphy.com/media/l0HlPjezGY8hNpu9i/giphy.gif";

            const initialEmbed = gameEmbed(state, { footer: `Saldo: ${formatMoney(userdb.economia.money)}`, imageUrl: dealGif });

            const rows = [actionRow(state)];
            const ins = insuranceRow(state);
            if (ins) rows.unshift(ins);

            await interaction.editReply({ embeds: [initialEmbed], components: rows });
            const msg = await interaction.fetchReply();

            const collector = msg.createMessageComponentCollector({
                filter: (i) => i.user.id === interaction.user.id,
                time: 90000
            });

            let finished = false;

            async function finish(outcome, { forcedDealerBlackjack = false } = {}) {
                if (finished) return;
                finished = true;
                collector.stop();
                store.delete(k);

                const playerVal = handValue(state.player);
                let dealerVal = handValue(state.dealer);

                const dealerBlackjack = forcedDealerBlackjack || isBlackjack(state.dealer);

                if (!dealerBlackjack) {
                    while (dealerVal < 17) {
                        state.dealer.push(state.deck.pop());
                        dealerVal = handValue(state.dealer);
                    }
                }

                let color = "Grey";
                let resultText = "";
                let payout = 0;
                let insurancePayout = 0;

                const baseBet = state.bet;
                const bj = isBlackjack(state.player);

                if (state.insuranceBet > 0) {
                    if (dealerBlackjack) insurancePayout = state.insuranceBet * 3;
                    else insurancePayout = 0;
                }

                if (outcome === "surrender") {
                    payout = Math.floor(baseBet / 2);
                    color = "Yellow";
                    resultText = `🏳️ Você desistiu e recuperou **${formatMoney(payout)}**.`;
                } else if (playerVal > 21) {
                    payout = 0;
                    color = "Red";
                    resultText = `💥 Você estourou (**${playerVal}**) e perdeu **${formatMoney(baseBet)}**.`;
                } else if (dealerBlackjack) {
                    if (bj) {
                        payout = baseBet;
                        color = "Yellow";
                        resultText = `🤝 Ambos deram blackjack. Você recuperou **${formatMoney(baseBet)}**.`;
                    } else {
                        payout = 0;
                        color = "Red";
                        resultText = `🃏 Dealer deu blackjack. Você perdeu **${formatMoney(baseBet)}**.`;
                    }
                } else if (bj) {
                    const win = Math.floor(baseBet * 2.5);
                    payout = win;
                    color = "Green";
                    resultText = `🎉 **BLACKJACK!** Você ganhou **${formatMoney(win)}**.`;
                } else if (dealerVal > 21) {
                    payout = baseBet * 2;
                    color = "Green";
                    resultText = `🔥 Dealer estourou (**${dealerVal}**). Você ganhou **${formatMoney(payout)}**.`;
                } else if (playerVal > dealerVal) {
                    payout = baseBet * 2;
                    color = "Green";
                    resultText = `✅ Você venceu (**${playerVal}** vs **${dealerVal}**) e ganhou **${formatMoney(payout)}**.`;
                } else if (playerVal === dealerVal) {
                    payout = baseBet;
                    color = "Yellow";
                    resultText = `🤝 Empate (**${playerVal}**). Você recuperou **${formatMoney(baseBet)}**.`;
                } else {
                    payout = 0;
                    color = "Red";
                    resultText = `❌ Você perdeu (**${playerVal}** vs **${dealerVal}**).`;
                }

                const totalReturn = payout + insurancePayout;
                userdb.economia.money += totalReturn;
                await userdb.save();

                const outcomeGifQuery =
                    color === "Green"
                        ? "casino win"
                        : color === "Red"
                        ? "casino lose"
                        : "casino blackjack";

                const outcomeGif =
                    (await getRandomGifUrl(outcomeGifQuery, { rating: "pg-13" }).catch(() => null)) ||
                    (color === "Green"
                        ? "https://media.giphy.com/media/3o6gDWzmAzrpi5DQU8/giphy.gif"
                        : color === "Red"
                        ? "https://media.giphy.com/media/3o7aD2saalBwwftBIY/giphy.gif"
                        : "https://media.giphy.com/media/26BRqBzbnJNg2KZkI/giphy.gif");

                const endEmbed = gameEmbed(state, {
                    title: "🃏 Blackjack - Resultado",
                    revealDealer: true,
                    footer: `Saldo: ${formatMoney(userdb.economia.money)}`,
                    imageUrl: outcomeGif,
                })
                    .setColor(color)
                    .addFields({ name: "Resultado", value: resultText, inline: false });

                if (state.insuranceBet > 0) {
                    endEmbed.addFields({
                        name: "Seguro",
                        value: dealerBlackjack
                            ? `✅ Pagou **${formatMoney(insurancePayout)}**`
                            : `❌ Você perdeu o seguro (**${formatMoney(state.insuranceBet)}**)`,
                        inline: false
                    });
                }

                await interaction.editReply({ embeds: [endEmbed], components: [] });
            }

            const playerVal = handValue(state.player);
            const dealerHasBlackjack = isBlackjack(state.dealer);

            if (!state.canInsurance) {
                state.insuranceDecided = true;
            }

            if (dealerHasBlackjack && !state.canInsurance) {
                await finish("dealer_blackjack", { forcedDealerBlackjack: true });
                return;
            }

            if (playerVal === 21 && !state.canInsurance) {
                await finish("player_blackjack");
                return;
            }

            collector.on("collect", async (i) => {
                if (finished) return;

                if (i.customId === "bj_ins_yes" || i.customId === "bj_ins_no") {
                    await i.deferUpdate();
                    if (!state.canInsurance || state.insuranceDecided) return;

                    state.insuranceDecided = true;
                    state.canInsurance = false;

                    if (i.customId === "bj_ins_yes") {
                        const maxIns = Math.floor(state.bet / 2);
                        if (userdb.economia.money < maxIns) {
                            await interaction.editReply({ content: "❌ Dinheiro insuficiente para o seguro.", components: [actionRow(state)] }).catch(() => {});
                        } else {
                            userdb.economia.money -= maxIns;
                            await userdb.save();
                            state.insuranceBet = maxIns;
                        }
                    }

                    const dealerBlackjackNow = isBlackjack(state.dealer);
                    if (dealerBlackjackNow) {
                        await finish("dealer_blackjack", { forcedDealerBlackjack: true });
                        return;
                    }

                    const updated = gameEmbed(state, { footer: `Saldo: ${formatMoney(userdb.economia.money)}` });
                    await interaction.editReply({ embeds: [updated], components: [actionRow(state)] });
                    return;
                }

                if (state.canInsurance && !state.insuranceDecided) {
                    await i.reply({ content: "❌ Primeiro escolha: Seguro ou Sem seguro.", ephemeral: true }).catch(() => {});
                    return;
                }

                if (i.customId === "bj_hit") {
                    await i.deferUpdate();
                    state.player.push(state.deck.pop());
                    state.canDouble = false;
                    state.canSurrender = false;

                    const v = handValue(state.player);
                    const updated = gameEmbed(state, { footer: `Saldo: ${formatMoney(userdb.economia.money)}` });
                    if (v > 21) updated.setColor("Red");
                    await interaction.editReply({ embeds: [updated], components: [actionRow(state)] });
                    if (v > 21) await finish("bust");
                    return;
                }

                if (i.customId === "bj_double") {
                    await i.deferUpdate();
                    if (!state.canDouble) return;
                    if (userdb.economia.money < state.bet) {
                        await interaction.editReply({ content: "❌ Dinheiro insuficiente para dobrar.", components: [actionRow(state)] }).catch(() => {});
                        return;
                    }

                    userdb.economia.money -= state.bet;
                    await userdb.save();
                    state.bet *= 2;
                    state.player.push(state.deck.pop());
                    state.canDouble = false;
                    state.canSurrender = false;

                    const v = handValue(state.player);
                    const updated = gameEmbed(state, { footer: `Saldo: ${formatMoney(userdb.economia.money)}` });
                    await interaction.editReply({ embeds: [updated], components: [] });
                    if (v > 21) await finish("bust");
                    else await finish("stand");
                    return;
                }

                if (i.customId === "bj_surrender") {
                    await i.deferUpdate();
                    if (!state.canSurrender) return;
                    state.canDouble = false;
                    state.canSurrender = false;
                    await finish("surrender");
                    return;
                }

                if (i.customId === "bj_stand") {
                    await i.deferUpdate();
                    state.canDouble = false;
                    state.canSurrender = false;
                    await finish("stand");
                }
            });

            collector.on("end", async () => {
                if (!finished) {
                    store.delete(k);
                    userdb.economia.money += state.bet;
                    if (state.insuranceBet > 0) userdb.economia.money += state.insuranceBet;
                    await userdb.save().catch(() => {});
                    await interaction.editReply({ content: "⏰ Tempo esgotado. Blackjack cancelado e aposta devolvida.", embeds: [], components: [] }).catch(() => {});
                }
            });
        } catch (err) {
            logger.error("Erro ao iniciar blackjack", { error: String(err?.message || err) });
            const store = getGameStore(client);
            const k = gameKey(interaction.guildId, interaction.user.id);
            store.delete(k);

            replyOrEdit(interaction, { content: "Erro ao iniciar blackjack.", ephemeral: true }).catch(() => {});
        }
    }
};

