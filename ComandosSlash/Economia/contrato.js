const Discord = require("discord.js");
const { formatMoney, debitWalletIfEnough, creditWallet, errorEmbed } = require("../../Utils/economy");

function shortId(c) {
    return String(c._id).slice(-6).toUpperCase();
}

function canTouch(contract, userId) {
    return contract.partyA === userId || contract.partyB === userId;
}

function contractEmbed(contract, client) {
    const a = client.users.cache.get(contract.partyA);
    const b = client.users.cache.get(contract.partyB);
    const statusMap = {
        pending: "🕓 Pendente",
        active: "✅ Ativo",
        resolved: "🏁 Finalizado",
        cancelled: "🚫 Cancelado",
    };

    const embed = new Discord.MessageEmbed()
        .setTitle(`📜 ${contract.title || "Contrato"} • #${shortId(contract)}`)
        .setColor(contract.status === "active" ? "GREEN" : contract.status === "pending" ? "YELLOW" : "GREY")
        .setDescription(contract.description?.slice(0, 800) || "-")
        .addFields(
            { name: "Status", value: statusMap[contract.status] || contract.status, inline: true },
            { name: "Partes", value: `${a ? a.tag : contract.partyA} ↔ ${b ? b.tag : contract.partyB}`, inline: false },
            { name: "Escrow A", value: formatMoney(contract.escrow?.a || 0), inline: true },
            { name: "Escrow B", value: formatMoney(contract.escrow?.b || 0), inline: true },
            { name: "Multa", value: formatMoney(contract.fine || 0), inline: true },
        );

    if (contract.dueAt) {
        embed.addFields({ name: "Prazo", value: `<t:${Math.floor(contract.dueAt / 1000)}:R>`, inline: true });
    }

    if (contract.dispute?.active) {
        embed.addFields({
            name: "Arbitragem",
            value: `Votação ativa até <t:${Math.floor(contract.dispute.endsAt / 1000)}:R>\n🅰️ ${contract.dispute.votesA} | 🅱️ ${contract.dispute.votesB}`,
            inline: false,
        });
    }

    return embed;
}

module.exports = {
    name: "contrato",
    description: "Contratos formais entre jogadores",
    type: "CHAT_INPUT",
    options: [
        {
            name: "criar",
            description: "Cria um contrato com escrow e multa",
            type: "SUB_COMMAND",
            options: [
                { name: "usuario", description: "A outra parte", type: "USER", required: true },
                { name: "titulo", description: "Título do contrato", type: "STRING", required: true },
                { name: "descricao", description: "Termos do contrato", type: "STRING", required: true },
                { name: "escrow", description: "Valor travado por cada parte", type: "NUMBER", required: true },
                { name: "multa", description: "Multa em caso de quebra", type: "NUMBER", required: true },
                { name: "prazo_horas", description: "Prazo em horas", type: "NUMBER", required: true },
            ],
        },
        {
            name: "ver",
            description: "Mostra um contrato",
            type: "SUB_COMMAND",
            options: [{ name: "id", description: "ID curto (6) ou ObjectId", type: "STRING", required: true }],
        },
        {
            name: "aceitar",
            description: "Aceita e ativa um contrato pendente",
            type: "SUB_COMMAND",
            options: [{ name: "id", description: "ID curto (6) ou ObjectId", type: "STRING", required: true }],
        },
        {
            name: "cancelar",
            description: "Cancela um contrato pendente (devolve escrow)",
            type: "SUB_COMMAND",
            options: [{ name: "id", description: "ID curto (6) ou ObjectId", type: "STRING", required: true }],
        },
        {
            name: "finalizar",
            description: "Marca o contrato como concluído (precisa das duas partes)",
            type: "SUB_COMMAND",
            options: [{ name: "id", description: "ID curto (6) ou ObjectId", type: "STRING", required: true }],
        },
        {
            name: "arbitragem",
            description: "Abre arbitragem por votação da comunidade",
            type: "SUB_COMMAND",
            options: [
                { name: "id", description: "ID curto (6) ou ObjectId", type: "STRING", required: true },
                { name: "min_votos", description: "Mínimo de votos", type: "INTEGER", required: false },
            ],
        },
    ],
    run: async (client, interaction) => {
        try {
            const sub = interaction.options.getSubcommand();
            const now = Date.now();

            if (sub === "criar") {
                const other = interaction.options.getUser("usuario");
                const title = interaction.options.getString("titulo").slice(0, 64);
                const desc = interaction.options.getString("descricao").slice(0, 1200);
                const escrow = Math.floor(interaction.options.getNumber("escrow"));
                const fine = Math.floor(interaction.options.getNumber("multa"));
                const hours = Math.floor(interaction.options.getNumber("prazo_horas"));

                if (other.bot) return interaction.reply({ embeds: [errorEmbed("❌ Você não pode criar contrato com bots.")], ephemeral: true });
                if (other.id === interaction.user.id) return interaction.reply({ embeds: [errorEmbed("❌ Você não pode criar contrato consigo mesmo.")], ephemeral: true });
                if (!Number.isFinite(escrow) || escrow <= 0) return interaction.reply({ embeds: [errorEmbed("❌ Escrow inválido.")], ephemeral: true });
                if (!Number.isFinite(fine) || fine < 0) return interaction.reply({ embeds: [errorEmbed("❌ Multa inválida.")], ephemeral: true });
                if (!Number.isFinite(hours) || hours <= 0 || hours > 24 * 30) return interaction.reply({ embeds: [errorEmbed("❌ Prazo inválido (1 a 720h).")], ephemeral: true });

                await client.userdb.getOrCreate(interaction.user.id);
                await client.userdb.getOrCreate(other.id);

                const debited = await debitWalletIfEnough(
                    client.userdb,
                    interaction.user.id,
                    escrow,
                    "contract_escrow_a",
                    { with: other.id, title }
                );

                if (!debited) {
                    return interaction.reply({ embeds: [errorEmbed("❌ Saldo insuficiente para travar o escrow.")], ephemeral: true });
                }

                const contract = await client.contractdb.create({
                    guildID: interaction.guildId,
                    createdAt: now,
                    status: "pending",
                    title,
                    description: desc,
                    partyA: interaction.user.id,
                    partyB: other.id,
                    escrow: { a: escrow, b: escrow },
                    fine,
                    dueAt: now + hours * 60 * 60 * 1000,
                    dispute: { active: false, endsAt: 0, votesA: 0, votesB: 0, voters: [], decidedWinner: null },
                    completion: { aConfirmed: false, bConfirmed: false },
                });

                const embed = contractEmbed(contract, client)
                    .setFooter({ text: "A outra parte deve usar /contrato aceitar id:XXXXXX" });

                return interaction.reply({ content: `${other}`, embeds: [embed] });
            }

            if (sub === "ver") {
                const id = interaction.options.getString("id");
                const contract = await client.contractdb.getByShortId(interaction.guildId, id);
                if (!contract) return interaction.reply({ embeds: [errorEmbed("❌ Contrato não encontrado.")], ephemeral: true });
                return interaction.reply({ embeds: [contractEmbed(contract, client)], ephemeral: !canTouch(contract, interaction.user.id) });
            }

            if (sub === "aceitar") {
                const id = interaction.options.getString("id");
                const contract = await client.contractdb.getByShortId(interaction.guildId, id);
                if (!contract) return interaction.reply({ embeds: [errorEmbed("❌ Contrato não encontrado.")], ephemeral: true });
                if (contract.status !== "pending") return interaction.reply({ embeds: [errorEmbed("❌ Este contrato não está pendente.")], ephemeral: true });
                if (contract.partyB !== interaction.user.id) return interaction.reply({ embeds: [errorEmbed("❌ Apenas a parte B pode aceitar.")], ephemeral: true });

                const debited = await debitWalletIfEnough(
                    client.userdb,
                    interaction.user.id,
                    contract.escrow?.b || 0,
                    "contract_escrow_b",
                    { with: contract.partyA, title: contract.title }
                );
                if (!debited) return interaction.reply({ embeds: [errorEmbed("❌ Saldo insuficiente para travar o escrow.")], ephemeral: true });

                contract.status = "active";
                await contract.save();

                return interaction.reply({ embeds: [contractEmbed(contract, client).setColor("GREEN").addFields({ name: "Ativado", value: "✅ Contrato ativo. Se houver quebra, abra /contrato arbitragem." })] });
            }

            if (sub === "cancelar") {
                const id = interaction.options.getString("id");
                const contract = await client.contractdb.getByShortId(interaction.guildId, id);
                if (!contract) return interaction.reply({ embeds: [errorEmbed("❌ Contrato não encontrado.")], ephemeral: true });
                if (contract.status !== "pending") return interaction.reply({ embeds: [errorEmbed("❌ Só dá para cancelar quando está pendente.")], ephemeral: true });
                if (!canTouch(contract, interaction.user.id)) return interaction.reply({ embeds: [errorEmbed("❌ Você não faz parte deste contrato.")], ephemeral: true });

                const refundTo = contract.partyA;
                await creditWallet(client.userdb, refundTo, contract.escrow?.a || 0, "contract_refund", { contract: String(contract._id) }).catch(() => {});

                contract.status = "cancelled";
                await contract.save();

                return interaction.reply({ embeds: [contractEmbed(contract, client).setColor("GREY").addFields({ name: "Cancelado", value: "✅ Escrow devolvido à parte A." })] });
            }

            if (sub === "finalizar") {
                const id = interaction.options.getString("id");
                const contract = await client.contractdb.getByShortId(interaction.guildId, id);
                if (!contract) return interaction.reply({ embeds: [errorEmbed("❌ Contrato não encontrado.")], ephemeral: true });
                if (contract.status !== "active") return interaction.reply({ embeds: [errorEmbed("❌ Só dá para finalizar contrato ativo.")], ephemeral: true });
                if (!canTouch(contract, interaction.user.id)) return interaction.reply({ embeds: [errorEmbed("❌ Você não faz parte deste contrato.")], ephemeral: true });

                if (!contract.completion) contract.completion = { aConfirmed: false, bConfirmed: false };
                if (interaction.user.id === contract.partyA) contract.completion.aConfirmed = true;
                if (interaction.user.id === contract.partyB) contract.completion.bConfirmed = true;

                const both = contract.completion.aConfirmed && contract.completion.bConfirmed;

                if (both) {
                    const aEsc = contract.escrow?.a || 0;
                    const bEsc = contract.escrow?.b || 0;
                    await creditWallet(client.userdb, contract.partyA, aEsc, "contract_release", { contract: String(contract._id) }).catch(() => {});
                    await creditWallet(client.userdb, contract.partyB, bEsc, "contract_release", { contract: String(contract._id) }).catch(() => {});
                    contract.status = "resolved";
                }

                await contract.save();

                const embed = contractEmbed(contract, client)
                    .setColor(both ? "GREEN" : "YELLOW")
                    .addFields({
                        name: "Conclusão",
                        value: both
                            ? "🏁 Ambas as partes confirmaram. Escrows liberados."
                            : `✅ Confirmado. Falta: ${contract.completion.aConfirmed ? "" : "Parte A"}${!contract.completion.aConfirmed && !contract.completion.bConfirmed ? " e " : ""}${contract.completion.bConfirmed ? "" : "Parte B"}`.trim(),
                    });

                return interaction.reply({ embeds: [embed] });
            }

            if (sub === "arbitragem") {
                const id = interaction.options.getString("id");
                const minVotes = Math.max(3, interaction.options.getInteger("min_votos") || 5);
                const contract = await client.contractdb.getByShortId(interaction.guildId, id);
                if (!contract) return interaction.reply({ embeds: [errorEmbed("❌ Contrato não encontrado.")], ephemeral: true });
                if (contract.status !== "active") return interaction.reply({ embeds: [errorEmbed("❌ Só dá para arbitrar contrato ativo.")], ephemeral: true });
                if (!canTouch(contract, interaction.user.id)) return interaction.reply({ embeds: [errorEmbed("❌ Apenas as partes podem abrir arbitragem.")], ephemeral: true });
                if (contract.dispute?.active) return interaction.reply({ embeds: [errorEmbed("❌ Arbitragem já está ativa.")], ephemeral: true });

                contract.dispute.active = true;
                contract.dispute.endsAt = now + 2 * 60 * 1000;
                contract.dispute.votesA = 0;
                contract.dispute.votesB = 0;
                contract.dispute.voters = [];
                contract.dispute.decidedWinner = null;
                await contract.save();

                const btnA = new Discord.MessageButton().setCustomId(`ct_a_${contract._id}`).setLabel("A favor da Parte A").setStyle("PRIMARY");
                const btnB = new Discord.MessageButton().setCustomId(`ct_b_${contract._id}`).setLabel("A favor da Parte B").setStyle("PRIMARY");
                const row = new Discord.MessageActionRow().addComponents(btnA, btnB);

                const embed = contractEmbed(contract, client)
                    .setColor("YELLOW")
                    .addFields({ name: "Votação", value: `Vote usando os botões abaixo. Encerra em 2 minutos. Mínimo: **${minVotes}** votos.` });

                const msg = await interaction.reply({ embeds: [embed], components: [row], fetchReply: true });

                const collector = msg.createMessageComponentCollector({ time: 2 * 60 * 1000 });

                collector.on("collect", async (i) => {
                    try {
                        if (!i.customId.endsWith(String(contract._id))) return;
                        const fresh = await client.contractdb.findOne({ _id: contract._id, guildID: interaction.guildId });
                        if (!fresh?.dispute?.active) {
                            return i.reply({ content: "❌ Arbitragem encerrada.", ephemeral: true }).catch(() => {});
                        }
                        if (fresh.dispute.voters.includes(i.user.id)) {
                            return i.reply({ content: "❌ Você já votou.", ephemeral: true }).catch(() => {});
                        }

                        const pickA = i.customId.startsWith("ct_a_");
                        if (pickA) fresh.dispute.votesA += 1;
                        else fresh.dispute.votesB += 1;
                        fresh.dispute.voters.push(i.user.id);
                        await fresh.save();

                        const updatedEmbed = contractEmbed(fresh, client)
                            .setColor("YELLOW")
                            .addFields({ name: "Votação", value: `🅰️ ${fresh.dispute.votesA} | 🅱️ ${fresh.dispute.votesB}` });
                        await i.update({ embeds: [updatedEmbed] }).catch(() => {});
                    } catch (e) {
                        console.error(e);
                        i.reply({ content: "Erro ao votar.", ephemeral: true }).catch(() => {});
                    }
                });

                collector.on("end", async () => {
                    const fresh = await client.contractdb.findOne({ _id: contract._id, guildID: interaction.guildId }).catch(() => null);
                    if (!fresh?.dispute?.active) return;

                    const totalVotes = (fresh.dispute.votesA || 0) + (fresh.dispute.votesB || 0);
                    if (totalVotes < minVotes) {
                        fresh.dispute.active = false;
                        await fresh.save().catch(() => {});
                        await interaction.editReply({
                            embeds: [contractEmbed(fresh, client).setColor("GREY").addFields({ name: "Arbitragem", value: "❌ Votação insuficiente. Tente novamente depois." })],
                            components: [],
                        }).catch(() => {});
                        return;
                    }

                    const winner = fresh.dispute.votesA >= fresh.dispute.votesB ? fresh.partyA : fresh.partyB;
                    const loser = winner === fresh.partyA ? fresh.partyB : fresh.partyA;

                    const totalEscrow = (fresh.escrow?.a || 0) + (fresh.escrow?.b || 0);
                    const fine = Math.min(fresh.fine || 0, totalEscrow);
                    const winnerGets = totalEscrow;

                    await creditWallet(client.userdb, winner, winnerGets, "contract_win", {
                        contract: String(fresh._id),
                        fine,
                        loser,
                    }).catch(() => {});

                    fresh.status = "resolved";
                    fresh.dispute.active = false;
                    fresh.dispute.decidedWinner = winner;
                    await fresh.save().catch(() => {});

                    await interaction.editReply({
                        embeds: [
                            contractEmbed(fresh, client)
                                .setColor("GREEN")
                                .addFields({
                                    name: "Decisão",
                                    value: `🏁 Vencedor: <@${winner}>\nPerdedor: <@${loser}>\nPagamento: **${formatMoney(winnerGets)}** (escrow total)`
                                }),
                        ],
                        components: [],
                    }).catch(() => {});
                });
            }

        } catch (err) {
            console.error(err);
            if (interaction.deferred || interaction.replied) {
                interaction.editReply({ content: "Erro no contrato.", embeds: [], components: [] }).catch(() => {});
            } else {
                interaction.reply({ content: "Erro no contrato.", ephemeral: true }).catch(() => {});
            }
        }
    }
};

