const Discord = require("discord.js");
const { formatMoney, debitWalletIfEnough } = require("../../Utils/economy");

function getVoteCount(votes, userId) {
    if (!votes) return 0;
    if (typeof votes.get === "function") return votes.get(userId) || 0;
    return votes[userId] || 0;
}

function setVoteCount(votes, userId, value) {
    if (!votes) return;
    if (typeof votes.set === "function") votes.set(userId, value);
    else votes[userId] = value;
}

function deleteVote(votes, userId) {
    if (!votes) return;
    if (typeof votes.delete === "function") votes.delete(userId);
    else delete votes[userId];
}

function getTotalVotes(election, userId) {
    return getVoteCount(election?.votes, userId) + getVoteCount(election?.paidVotes, userId);
}

function getSortedResults(election) {
    const candidates = election?.candidates || [];
    return candidates
        .map((id, idx) => ({ id, votes: getTotalVotes(election, id), paid: getVoteCount(election?.paidVotes, id), idx }))
        .sort((a, b) => (b.votes - a.votes) || (a.idx - b.idx));
}

function getVotePrice(election) {
    const shop = election?.voteShop || {};
    const basePrice = Math.max(1, Math.floor(shop.basePrice || 0));
    const increment = Math.max(0, Math.floor(shop.increment || 0));
    const sold = Math.max(0, Math.floor(shop.sold || 0));
    let price = basePrice + sold * increment;

    const now = Date.now();
    const boostUntil = Math.floor(shop.boostUntil || 0);
    if (boostUntil > now) {
        const mult = Number(shop.boostMultiplier || 1.0);
        if (Number.isFinite(mult) && mult > 0) price = Math.max(1, Math.floor(price * mult));
    }
    return price;
}

function ensureElectionDefaults(eco) {
    if (!eco.election) {
        eco.election = {
            active: false,
            endsAt: 0,
            candidates: [],
            votes: new Map(),
            paidVotes: new Map(),
            voters: [],
            announceChannelId: null,
            pingEveryone: false,
            voteShop: { enabled: true, basePrice: 500, increment: 50, sold: 0, lastEventAt: 0, boostUntil: 0, boostMultiplier: 1.0 },
        };
    }
    if (!eco.election.votes) eco.election.votes = new Map();
    if (!eco.election.paidVotes) eco.election.paidVotes = new Map();
    if (!eco.election.voters) eco.election.voters = [];
    if (eco.election.announceChannelId === undefined) eco.election.announceChannelId = null;
    if (eco.election.pingEveryone === undefined) eco.election.pingEveryone = false;
    if (!eco.election.voteShop) eco.election.voteShop = { enabled: true, basePrice: 500, increment: 50, sold: 0, lastEventAt: 0, boostUntil: 0, boostMultiplier: 1.0 };
    if (eco.election.voteShop.enabled === undefined) eco.election.voteShop.enabled = true;
    if (eco.election.voteShop.basePrice === undefined) eco.election.voteShop.basePrice = 500;
    if (eco.election.voteShop.increment === undefined) eco.election.voteShop.increment = 50;
    if (eco.election.voteShop.sold === undefined) eco.election.voteShop.sold = 0;
    if (eco.election.voteShop.lastEventAt === undefined) eco.election.voteShop.lastEventAt = 0;
    if (eco.election.voteShop.boostUntil === undefined) eco.election.voteShop.boostUntil = 0;
    if (eco.election.voteShop.boostMultiplier === undefined) eco.election.voteShop.boostMultiplier = 1.0;
}

function isAdminMember(interaction) {
    return (
        interaction.member?.permissions?.has("ADMINISTRATOR") ||
        interaction.member?.permissions?.has("MANAGE_GUILD")
    );
}

function hasCentralScope(eco, userId, scope) {
    const ownerId = eco?.centralBank?.ownerId || process.env.CENTRAL_BANK_OWNER_ID || "589646045756129301";
    if (userId === ownerId) return true;
    const managers = eco?.centralBank?.managers || [];
    const entry = managers.find((m) => m.userId === userId);
    if (!entry) return false;
    const scopes = entry.scopes || [];
    return scopes.includes("tudo") || scopes.includes(scope);
}

function buildEventEmbed(guildName) {
    const now = Date.now();
    const endsAt = now + 14 * 24 * 60 * 60 * 1000;
    return new Discord.MessageEmbed()
        .setTitle("🗳️ Grande Eleição — Evento do Servidor (2 semanas)")
        .setColor("GOLD")
        .setDescription(
            [
                `Bem-vindo(a) à **Grande Eleição**${guildName ? ` de **${guildName}**` : ""}!`,
                "Aqui a comunidade escolhe o **Presidente Econômico** do servidor.",
                "",
                `⏳ Duração: **2 semanas** (ex.: até <t:${Math.floor(endsAt / 1000)}:f>).`,
            ].join("\n")
        )
        .addFields(
            {
                name: "Como participar",
                value: [
                    "• `/eleicao candidatar` para entrar na disputa",
                    "• `/eleicao votar usuario:@candidato` para votar (1 voto por pessoa)",
                    "• `/eleicao status` para ver tempo restante e placar",
                    "• `/politica status` para acompanhar o presidente e regras econômicas",
                ].join("\n"),
                inline: false,
            },
            {
                name: "Regras",
                value: [
                    "• Campanha respeitosa (sem spam/assédio)",
                    "• Compra de votos é permitida via `/eleicao comprar_voto`",
                    "• Sem ameaças, golpes ou assédio",
                    "• A moderação pode desclassificar candidatos por má conduta",
                ].join("\n"),
                inline: false,
            }
        )
        .setFooter({ text: "Dica: admin pode configurar um canal para anúncios/resultado." });
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

function buildResultEmbed(eco) {
    const results = getSortedResults(eco.election);
    const winner = results[0] || null;
    const top = results.slice(0, 10);

    const lines = top.length
        ? top.map((r, i) => `**${i + 1}.** <@${r.id}> — **${r.votes}** voto(s) (${r.paid} comprados)`).join("\n")
        : "-";

    const embed = new Discord.MessageEmbed()
        .setTitle("🏁 Resultado da Eleição")
        .setColor("BLURPLE")
        .addField("Vencedor", winner ? `<@${winner.id}>` : "Sem candidatos", false)
        .addField("Placar (Top 10)", lines, false)
        .setFooter({ text: `Total de votantes: ${(eco.election?.voters || []).length}` });

    return { embed, winnerId: winner?.id || null };
}

module.exports = {
    name: "eleicao",
    description: "Eleições para presidente econômico",
    type: "CHAT_INPUT",
    options: [
        { name: "status", description: "Mostra eleição ativa", type: "SUB_COMMAND" },
        {
            name: "iniciar",
            description: "Inicia eleição (admin)",
            type: "SUB_COMMAND",
            options: [{ name: "duracao_min", description: "Duração em minutos", type: "INTEGER", required: true }],
        },
        { name: "candidatar", description: "Se candidata", type: "SUB_COMMAND" },
        { name: "retirar", description: "Retira sua candidatura", type: "SUB_COMMAND" },
        {
            name: "votar",
            description: "Vota em um candidato",
            type: "SUB_COMMAND",
            options: [{ name: "usuario", description: "Candidato", type: "USER", required: true }],
        },
        {
            name: "comprar_voto",
            description: "Compra votos com dinheiro do bot",
            type: "SUB_COMMAND",
            options: [
                { name: "usuario", description: "Candidato", type: "USER", required: true },
                { name: "quantidade", description: "Quantidade (1 a 50)", type: "INTEGER", required: true },
            ],
        },
        { name: "placar", description: "Mostra o placar de votos", type: "SUB_COMMAND" },
        { name: "regras", description: "Mostra regras e guia rápido", type: "SUB_COMMAND" },
        {
            name: "configurar",
            description: "Configura canal de anúncio/resultado (admin)",
            type: "SUB_COMMAND",
            options: [
                { name: "canal", description: "Canal para anúncios", type: "CHANNEL", required: true },
                { name: "ping_everyone", description: "Mencionar @everyone nos anúncios", type: "BOOLEAN", required: false },
            ],
        },
        {
            name: "anunciar_evento",
            description: "Envia embed do evento (admin)",
            type: "SUB_COMMAND",
            options: [
                { name: "canal", description: "Canal do anúncio (opcional)", type: "CHANNEL", required: false },
                { name: "ping_everyone", description: "Mencionar @everyone (opcional)", type: "BOOLEAN", required: false },
            ],
        },
        {
            name: "configurar_voteshop",
            description: "Configura preços da compra de votos (admin)",
            type: "SUB_COMMAND",
            options: [
                { name: "ativado", description: "Ativa/desativa compra de votos", type: "BOOLEAN", required: false },
                { name: "preco_base", description: "Preço do próximo voto", type: "INTEGER", required: false },
                { name: "incremento", description: "Aumento por voto vendido", type: "INTEGER", required: false },
            ],
        },
        {
            name: "forcar_atracao",
            description: "Força uma atração aleatória (admin)",
            type: "SUB_COMMAND",
        },
        { name: "encerrar", description: "Encerra eleição (admin)", type: "SUB_COMMAND" },
    ],
    run: async (client, interaction) => {
        try {
            const sub = interaction.options.getSubcommand();
            const eco = await client.guildEconomydb.getOrCreate(interaction.guildId);
            if (!eco.policy) eco.policy = {};
            ensureElectionDefaults(eco);

            if (sub === "status") {
                const candidates = eco.election.candidates || [];
                const results = getSortedResults(eco.election);
                const top = results.slice(0, 10);
                const placar = top.length
                    ? top.map((r, i) => `**${i + 1}.** <@${r.id}> — **${r.votes}**`).join("\n")
                    : "-";

                const endsAt = eco.election.endsAt || 0;
                const active = eco.election.active && Date.now() <= endsAt;
                const alreadyVoted = (eco.election.voters || []).includes(interaction.user.id);
                const shop = eco.election.voteShop || {};
                const shopEnabled = shop.enabled !== false;
                const priceNow = getVotePrice(eco.election);
                const boostText =
                    (shop.boostUntil || 0) > Date.now()
                        ? `✅ Promoção até <t:${Math.floor((shop.boostUntil || 0) / 1000)}:R> (x${Number(shop.boostMultiplier || 1).toFixed(2)})`
                        : "-";

                const embed = new Discord.MessageEmbed()
                    .setTitle("🗳️ Eleição")
                    .setColor("BLURPLE")
                    .setDescription(
                        active ? `✅ Eleição ativa até <t:${Math.floor(endsAt / 1000)}:R>` : "- Nenhuma eleição ativa."
                    )
                    .addFields(
                        {
                            name: "Candidatos",
                            value: candidates.length ? candidates.map((id) => `<@${id}>`).join("\n") : "-",
                            inline: true,
                        },
                        {
                            name: "Placar (Top 10)",
                            value: placar,
                            inline: true,
                        },
                        {
                            name: "Votantes",
                            value: `${(eco.election.voters || []).length}${alreadyVoted ? " (você já votou)" : ""}`,
                            inline: false,
                        }
                        ,
                        {
                            name: "Compra de votos",
                            value: shopEnabled
                                ? `Ativa • Próximo voto: ${formatMoney(priceNow)} • Vendidos: ${Math.floor(shop.sold || 0)}\nPromoção: ${boostText}`
                                : "Desativada",
                            inline: false,
                        }
                    )
                    .setFooter({
                        text: eco.election.announceChannelId ? `Canal de anúncio configurado: ${eco.election.announceChannelId}` : "Sem canal de anúncio configurado",
                    });
                return interaction.reply({ embeds: [embed] });
            }

            if (sub === "iniciar") {
                const canManage = isAdminMember(interaction) || hasCentralScope(eco, interaction.user.id, "eventos");
                if (!canManage) return interaction.reply({ content: "❌ Apenas admin/dono/gerente do evento pode iniciar eleição.", ephemeral: true });
                const mins = Math.max(1, Math.min(43200, interaction.options.getInteger("duracao_min") || 20160));
                eco.election.active = true;
                eco.election.endsAt = Date.now() + mins * 60 * 1000;
                eco.election.candidates = [];
                eco.election.votes = new Map();
                eco.election.paidVotes = new Map();
                eco.election.voters = [];
                eco.election.voteShop.sold = 0;
                eco.election.voteShop.boostUntil = 0;
                eco.election.voteShop.boostMultiplier = 1.0;
                await eco.save();
                const startedEmbed = new Discord.MessageEmbed()
                    .setTitle("🗳️ Eleição iniciada!")
                    .setColor("GREEN")
                    .setDescription(
                        [
                            `A eleição começou e vai até <t:${Math.floor(eco.election.endsAt / 1000)}:f>.`,
                            "",
                            "✅ Para participar:",
                            "• `/eleicao candidatar`",
                            "• `/eleicao votar usuario:@candidato`",
                            "• `/eleicao comprar_voto usuario:@candidato quantidade:5`",
                            "• `/eleicao status`",
                        ].join("\n")
                    );

                await interaction.reply({ embeds: [startedEmbed] });

                const channelId = eco.election.announceChannelId;
                if (channelId && channelId !== interaction.channelId) {
                    const content = eco.election.pingEveryone ? "@everyone" : undefined;
                    await trySendToChannel(client, channelId, { content, embeds: [startedEmbed] });
                }
                return;
            }

            if (sub === "encerrar") {
                const canManage = isAdminMember(interaction) || hasCentralScope(eco, interaction.user.id, "eventos");
                if (!canManage) return interaction.reply({ content: "❌ Apenas admin/dono/gerente do evento pode encerrar eleição.", ephemeral: true });
                eco.election.active = false;
                eco.election.endsAt = 0;

                const { embed, winnerId } = buildResultEmbed(eco);
                if (winnerId) eco.policy.presidentId = winnerId;

                await eco.save();

                await interaction.reply({ embeds: [embed] });

                const channelId = eco.election.announceChannelId;
                if (channelId && channelId !== interaction.channelId) {
                    const content = eco.election.pingEveryone ? "@everyone" : undefined;
                    await trySendToChannel(client, channelId, { content, embeds: [embed] });
                }
                return;
            }

            if (sub === "regras") {
                const embed = new Discord.MessageEmbed()
                    .setTitle("📜 Regras e Guia Rápido")
                    .setColor("GOLD")
                    .setDescription(
                        [
                            "A eleição escolhe o **Presidente Econômico**.",
                            "",
                            "✅ Guia:",
                            "• `/eleicao candidatar`",
                            "• `/eleicao votar usuario:@candidato`",
                            "• `/eleicao comprar_voto usuario:@candidato quantidade:10`",
                            "• `/eleicao status` / `/eleicao placar`",
                            "",
                            "🧾 Regras:",
                            "• 1 voto por pessoa",
                            "• Compra de votos é permitida (o bot registra no placar)",
                            "• Sem ameaças / golpes / assédio",
                            "• Sem spam de campanha",
                            "• A moderação pode desclassificar e aplicar punições",
                        ].join("\n")
                    );
                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            if (sub === "configurar") {
                const canManage = isAdminMember(interaction) || hasCentralScope(eco, interaction.user.id, "eventos");
                if (!canManage) return interaction.reply({ content: "❌ Apenas admin/dono/gerente do evento pode configurar.", ephemeral: true });
                const channel = interaction.options.getChannel("canal");
                if (!channel || typeof channel.send !== "function") {
                    return interaction.reply({ content: "❌ Selecione um canal de texto válido.", ephemeral: true });
                }
                const ping = interaction.options.getBoolean("ping_everyone");
                eco.election.announceChannelId = channel.id;
                if (ping !== null && ping !== undefined) eco.election.pingEveryone = !!ping;
                await eco.save();
                return interaction.reply({
                    content: `✅ Canal de anúncio configurado para ${channel}${eco.election.pingEveryone ? " com @everyone" : ""}.`,
                    ephemeral: true,
                });
            }

            if (sub === "anunciar_evento") {
                const canManage = isAdminMember(interaction) || hasCentralScope(eco, interaction.user.id, "eventos");
                if (!canManage) return interaction.reply({ content: "❌ Apenas admin/dono/gerente do evento pode anunciar.", ephemeral: true });

                const channelOpt = interaction.options.getChannel("canal");
                const channelId = channelOpt?.id || eco.election.announceChannelId || interaction.channelId;
                const ping = interaction.options.getBoolean("ping_everyone");
                const content = (ping !== null && ping !== undefined ? ping : eco.election.pingEveryone) ? "@everyone" : undefined;
                const embed = buildEventEmbed(interaction.guild?.name);

                const ok = await trySendToChannel(client, channelId, { content, embeds: [embed] });
                if (!ok) return interaction.reply({ content: "❌ Não consegui enviar no canal. Verifique permissões.", ephemeral: true });
                return interaction.reply({ content: "✅ Anúncio do evento enviado.", ephemeral: true });
            }

            if (sub === "configurar_voteshop") {
                const canManage = isAdminMember(interaction) || hasCentralScope(eco, interaction.user.id, "votos");
                if (!canManage) return interaction.reply({ content: "❌ Apenas admin/dono/gerente de votos pode configurar.", ephemeral: true });

                const enabled = interaction.options.getBoolean("ativado");
                const base = interaction.options.getInteger("preco_base");
                const inc = interaction.options.getInteger("incremento");

                if (enabled !== null && enabled !== undefined) eco.election.voteShop.enabled = !!enabled;
                if (base !== null && base !== undefined) eco.election.voteShop.basePrice = Math.max(1, Math.floor(base));
                if (inc !== null && inc !== undefined) eco.election.voteShop.increment = Math.max(0, Math.floor(inc));

                await eco.save();
                return interaction.reply({
                    content: `✅ VoteShop atualizado: ${eco.election.voteShop.enabled ? "ativo" : "desativado"} • base ${formatMoney(eco.election.voteShop.basePrice)} • +${formatMoney(eco.election.voteShop.increment)} por voto.`,
                    ephemeral: true,
                });
            }

            if (sub === "forcar_atracao") {
                const canManage = isAdminMember(interaction) || hasCentralScope(eco, interaction.user.id, "eventos");
                if (!canManage) return interaction.reply({ content: "❌ Apenas admin/dono/gerente do evento pode forçar atrações.", ephemeral: true });

                const minutes = 20;
                const multipliers = [0.5, 0.6, 0.7, 0.75, 0.8];
                const mult = multipliers[Math.floor(Math.random() * multipliers.length)];
                eco.election.voteShop.boostUntil = Date.now() + minutes * 60 * 1000;
                eco.election.voteShop.boostMultiplier = mult;
                await eco.save();

                const embed = new Discord.MessageEmbed()
                    .setTitle("🎪 Atração Relâmpago: Promoção de Urna!")
                    .setColor("GOLD")
                    .setDescription(
                        [
                            `Por **${minutes} minutos**, a compra de votos está com desconto!`,
                            `Multiplicador de preço: **x${mult}**`,
                            "",
                            "Use: `/eleicao comprar_voto usuario:@candidato quantidade:5`",
                        ].join("\n")
                    );

                const channelId = eco.election.announceChannelId || interaction.channelId;
                const content = eco.election.pingEveryone ? "@everyone" : undefined;
                await trySendToChannel(client, channelId, { content, embeds: [embed] });
                return interaction.reply({ content: "✅ Atração iniciada e anunciada.", ephemeral: true });
            }

            if (!eco.election.active || Date.now() > (eco.election.endsAt || 0)) {
                eco.election.active = false;
                await eco.save().catch(() => {});
                return interaction.reply({ content: "❌ Não há eleição ativa.", ephemeral: true });
            }

            if (sub === "candidatar") {
                if (eco.election.candidates.includes(interaction.user.id)) {
                    return interaction.reply({ content: "❌ Você já é candidato.", ephemeral: true });
                }
                eco.election.candidates.push(interaction.user.id);
                await eco.save();
                return interaction.reply({ content: "✅ Candidatura registrada." });
            }

            if (sub === "retirar") {
                if (!eco.election.candidates.includes(interaction.user.id)) {
                    return interaction.reply({ content: "❌ Você não está como candidato.", ephemeral: true });
                }
                eco.election.candidates = (eco.election.candidates || []).filter((id) => id !== interaction.user.id);
                deleteVote(eco.election.votes, interaction.user.id);
                deleteVote(eco.election.paidVotes, interaction.user.id);
                await eco.save();
                return interaction.reply({ content: "✅ Você retirou sua candidatura." });
            }

            if (sub === "votar") {
                const cand = interaction.options.getUser("usuario");
                if (!eco.election.candidates.includes(cand.id)) {
                    return interaction.reply({ content: "❌ Esse usuário não é candidato.", ephemeral: true });
                }
                if (eco.election.voters.includes(interaction.user.id)) {
                    return interaction.reply({ content: "❌ Você já votou nesta eleição.", ephemeral: true });
                }
                eco.election.voters.push(interaction.user.id);
                const current = getVoteCount(eco.election.votes, cand.id);
                setVoteCount(eco.election.votes, cand.id, current + 1);
                await eco.save();
                return interaction.reply({ content: `✅ Voto computado em ${cand}.`, ephemeral: true });
            }

            if (sub === "comprar_voto") {
                const shop = eco.election.voteShop || {};
                if (shop.enabled === false) return interaction.reply({ content: "❌ A compra de votos está desativada.", ephemeral: true });

                const cand = interaction.options.getUser("usuario");
                const qty = Math.max(1, Math.min(50, interaction.options.getInteger("quantidade") || 1));
                if (!eco.election.candidates.includes(cand.id)) {
                    return interaction.reply({ content: "❌ Esse usuário não é candidato.", ephemeral: true });
                }

                let total = 0;
                for (let i = 0; i < qty; i++) {
                    total += getVotePrice(eco.election);
                    eco.election.voteShop.sold = Math.max(0, Math.floor(eco.election.voteShop.sold || 0)) + 1;
                }

                const updated = await debitWalletIfEnough(
                    client.userdb,
                    interaction.user.id,
                    total,
                    "vote_buy",
                    { guildId: interaction.guildId, candidateId: cand.id, quantity: qty }
                );
                if (!updated) {
                    eco.election.voteShop.sold = Math.max(0, Math.floor(eco.election.voteShop.sold || 0) - qty);
                    return interaction.reply({ content: `❌ Você precisa de ${formatMoney(total)} na carteira para comprar ${qty} voto(s).`, ephemeral: true });
                }

                eco.policy.treasury = Math.floor((eco.policy.treasury || 0) + total);
                const currentPaid = getVoteCount(eco.election.paidVotes, cand.id);
                setVoteCount(eco.election.paidVotes, cand.id, currentPaid + qty);
                await eco.save();

                return interaction.reply({
                    content: `✅ Você comprou **${qty}** voto(s) para ${cand}. Total: **${formatMoney(total)}**.`,
                    ephemeral: true,
                });
            }

            if (sub === "placar") {
                const results = getSortedResults(eco.election);
                const lines = results.length
                    ? results.map((r, i) => `**${i + 1}.** <@${r.id}> — **${r.votes}** voto(s) (${r.paid} comprados)`).join("\n").slice(0, 3900)
                    : "-";
                const embed = new Discord.MessageEmbed()
                    .setTitle("📊 Placar da Eleição")
                    .setColor("BLURPLE")
                    .setDescription(`Até <t:${Math.floor((eco.election.endsAt || 0) / 1000)}:R>`)
                    .addField("Ranking", lines, false);
                return interaction.reply({ embeds: [embed] });
            }

        } catch (err) {
            console.error(err);
            interaction.reply({ content: "Erro na eleição.", ephemeral: true }).catch(() => {});
        }
    }
};

