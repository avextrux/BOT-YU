const { EmbedBuilder } = require("discord.js");
const { formatMoney, parseAmountInput, debitWalletIfEnough, creditWallet, errorEmbed } = require("../../Utils/economy");
const { ensureEconomyAllowed } = require("../../Utils/economyGuard");
const logger = require("../../Utils/logger");
const { replyOrEdit } = require("../../Utils/commandKit");

function normId(s) {
    return String(s).trim().toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 16);
}

module.exports = {
    name: "banco",
    description: "Bancos privados controlados por jogadores",
    type: 1, // CHAT_INPUT
    autoDefer: { ephemeral: true },
    options: [
        {
            name: "criar",
            description: "Cria um banco privado",
            type: 1, // SUB_COMMAND
            options: [
                { name: "id", description: "ID curto do banco", type: 3, required: true }, // STRING
                { name: "nome", description: "Nome do banco", type: 3, required: true }, // STRING
            ],
        },
        {
            name: "info",
            description: "Mostra info de um banco",
            type: 1, // SUB_COMMAND
            options: [{ name: "id", description: "ID do banco", type: 3, required: true }], // STRING
        },
        {
            name: "depositar",
            description: "Deposita no banco privado",
            type: 1, // SUB_COMMAND
            options: [
                { name: "id", description: "ID do banco", type: 3, required: true }, // STRING
                { name: "quantia", description: "Valor (ou tudo/metade)", type: 3, required: true }, // STRING
            ],
        },
        {
            name: "retirar",
            description: "Retira do banco privado",
            type: 1, // SUB_COMMAND
            options: [
                { name: "id", description: "ID do banco", type: 3, required: true }, // STRING
                { name: "quantia", description: "Valor (ou tudo/metade)", type: 3, required: true }, // STRING
            ],
        },
        {
            name: "emprestimo_pedir",
            description: "Pede um empréstimo ao banco",
            type: 1, // SUB_COMMAND
            options: [
                { name: "id", description: "ID do banco", type: 3, required: true }, // STRING
                { name: "valor", description: "Valor do empréstimo", type: 10, required: true }, // NUMBER
                { name: "dias", description: "Prazo em dias", type: 4, required: true }, // INTEGER
            ],
        },
        {
            name: "emprestimo_pagar",
            description: "Paga seu empréstimo (total ou parcial)",
            type: 1, // SUB_COMMAND
            options: [
                { name: "id", description: "ID do banco", type: 3, required: true }, // STRING
                { name: "valor", description: "Valor a pagar", type: 10, required: true }, // NUMBER
            ],
        },
    ],
    run: async (client, interaction) => {
        try {
            // AutoDefer já é cuidado pelo interactionCreate.js se configurado
            // Mas para segurança extra em comandos pesados:
            if (!interaction.deferred && !interaction.replied) await interaction.deferReply({ ephemeral: true }).catch(() => {});

            const sub = interaction.options.getSubcommand();
            const guildID = interaction.guildId;
            const now = Date.now();

            if (sub === "criar") {
                const id = normId(interaction.options.getString("id"));
                const nome = interaction.options.getString("nome").slice(0, 40);
                if (!id) return replyOrEdit(interaction, { embeds: [errorEmbed("❌ ID inválido.")], ephemeral: true });

                const exists = await client.playerBankdb.findOne({ guildID, bankID: id });
                if (exists) return replyOrEdit(interaction, { embeds: [errorEmbed("❌ Já existe um banco com esse ID.")], ephemeral: true });

                const bank = await client.playerBankdb.create({
                    guildID,
                    bankID: id,
                    name: nome,
                    ownerId: interaction.user.id,
                    createdAt: now,
                    reserves: 0,
                    depositInterestRate: 0,
                    loanInterestRate: 0.15,
                    feeRate: 0.01,
                    deposits: {},
                    loans: [],
                });

                const embed = new EmbedBuilder()
                    .setTitle("🏦 Banco criado")
                    .setColor("Green")
                    .setDescription(`Banco **${bank.name}** criado com ID \`${bank.bankID}\`.`)
                    .addFields(
                        { name: "Dono", value: `${interaction.user}`, inline: true },
                        { name: "Reservas", value: formatMoney(bank.reserves), inline: true }
                    );
                return replyOrEdit(interaction, { embeds: [embed], ephemeral: true });
            }

            const id = normId(interaction.options.getString("id"));
            const bank = await client.playerBankdb.findOne({ guildID, bankID: id });
            if (!bank) return replyOrEdit(interaction, { embeds: [errorEmbed("❌ Banco não encontrado.")], ephemeral: true });

            if (sub === "info") {
                const myDep = (bank.deposits?.get ? bank.deposits.get(interaction.user.id) : bank.deposits?.[interaction.user.id]) || 0;
                const myLoan = (bank.loans || []).find((l) => l.borrowerId === interaction.user.id && l.remaining > 0);
                const embed = new EmbedBuilder()
                    .setTitle(`🏦 ${bank.name}`)
                    .setColor("Blurple")
                    .addFields(
                        { name: "ID", value: `\`${bank.bankID}\``, inline: true },
                        { name: "Dono", value: `<@${bank.ownerId}>`, inline: true },
                        { name: "Reservas", value: formatMoney(bank.reserves), inline: true },
                        { name: "Sua conta", value: formatMoney(myDep), inline: true },
                        { name: "Taxa", value: `${Math.floor((bank.feeRate || 0) * 100)}%`, inline: true },
                        { name: "Juros empréstimo", value: `${Math.floor((bank.loanInterestRate || 0) * 100)}%`, inline: true },
                        { name: "Seu empréstimo", value: myLoan ? `${formatMoney(myLoan.remaining)} (vence <t:${Math.floor(myLoan.dueAt / 1000)}:R>)` : "-", inline: false }
                    );
                return replyOrEdit(interaction, { embeds: [embed], ephemeral: true });
            }

            const gate = await ensureEconomyAllowed(client, interaction, interaction.user.id);
            if (!gate.ok) return replyOrEdit(interaction, { embeds: [gate.embed], ephemeral: true });
            const userdb = gate.userdb;

            if (sub === "depositar") {
                const carteira = userdb.economia.money || 0;
                const parsed = parseAmountInput(interaction.options.getString("quantia"), { max: carteira });
                if (!parsed) return replyOrEdit(interaction, { embeds: [errorEmbed("❌ Valor inválido.")], ephemeral: true });
                let amount = 0;
                if (parsed.kind === "all") amount = carteira;
                if (parsed.kind === "half") amount = Math.floor(carteira / 2);
                if (parsed.kind === "number") amount = parsed.value;
                if (amount <= 0) return replyOrEdit(interaction, { embeds: [errorEmbed("❌ Você não tem saldo para depositar.")], ephemeral: true });

                const fee = Math.floor(amount * Math.max(0, Math.min(0.05, bank.feeRate || 0)));
                const net = amount - fee;

                const debited = await debitWalletIfEnough(client.userdb, interaction.user.id, amount, "playerbank_deposit", { bank: bank.bankID });
                if (!debited) return replyOrEdit(interaction, { embeds: [errorEmbed("❌ Saldo insuficiente.")], ephemeral: true });

                const update = await client.playerBankdb.findOneAndUpdate(
                    { guildID, bankID: id },
                    {
                        $inc: { reserves: net, [`deposits.${interaction.user.id}`]: net },
                    },
                    { new: true }
                );

                if (!update) {
                    await creditWallet(client.userdb, interaction.user.id, amount, "playerbank_refund", { reason: "bank_update_failed", bank: id }).catch(() => {});
                    return replyOrEdit(interaction, { embeds: [errorEmbed("❌ Falha ao depositar. Valor estornado.")], ephemeral: true });
                }

                const embed = new EmbedBuilder()
                    .setTitle("🏦 Depósito no banco privado")
                    .setColor("Green")
                    .setDescription(`Você depositou **${formatMoney(net)}** em **${update.name}**.${fee ? `\nTaxa: **${formatMoney(fee)}**` : ""}`)
                    .addFields({ name: "Reservas do banco", value: formatMoney(update.reserves), inline: true });
                return replyOrEdit(interaction, { embeds: [embed], ephemeral: true });
            }

            if (sub === "retirar") {
                const myDep = (bank.deposits?.get ? bank.deposits.get(interaction.user.id) : bank.deposits?.[interaction.user.id]) || 0;
                const parsed = parseAmountInput(interaction.options.getString("quantia"), { max: myDep });
                if (!parsed) return replyOrEdit(interaction, { embeds: [errorEmbed("❌ Valor inválido.")], ephemeral: true });
                let amount = 0;
                if (parsed.kind === "all") amount = myDep;
                if (parsed.kind === "half") amount = Math.floor(myDep / 2);
                if (parsed.kind === "number") amount = parsed.value;
                if (amount <= 0) return replyOrEdit(interaction, { embeds: [errorEmbed("❌ Você não tem saldo nesse banco.")], ephemeral: true });
                if (bank.reserves < amount) return replyOrEdit(interaction, { embeds: [errorEmbed("❌ O banco não tem reservas suficientes (corrida bancária!).")], ephemeral: true });

                const update = await client.playerBankdb.findOneAndUpdate(
                    { guildID, bankID: id, reserves: { $gte: amount }, [`deposits.${interaction.user.id}`]: { $gte: amount } },
                    {
                        $inc: { reserves: -amount, [`deposits.${interaction.user.id}`]: -amount },
                    },
                    { new: true }
                );

                if (!update) return replyOrEdit(interaction, { embeds: [errorEmbed("❌ Falha ao retirar (saldo/reservas mudaram).")], ephemeral: true });

                await creditWallet(client.userdb, interaction.user.id, amount, "playerbank_withdraw", { bank: id }).catch(() => {});

                const embed = new EmbedBuilder()
                    .setTitle("🏦 Saque do banco privado")
                    .setColor("Green")
                    .setDescription(`Você retirou **${formatMoney(amount)}** de **${update.name}**.`)
                    .addFields({ name: "Reservas do banco", value: formatMoney(update.reserves), inline: true });
                return replyOrEdit(interaction, { embeds: [embed], ephemeral: true });
            }

            if (sub === "emprestimo_pedir") {
                const value = Math.floor(interaction.options.getNumber("valor"));
                const days = Math.max(1, Math.min(30, interaction.options.getInteger("dias")));
                if (!Number.isFinite(value) || value <= 0) return replyOrEdit(interaction, { embeds: [errorEmbed("❌ Valor inválido.")], ephemeral: true });
                const existing = (bank.loans || []).find((l) => l.borrowerId === interaction.user.id && l.remaining > 0);
                if (existing) return replyOrEdit(interaction, { embeds: [errorEmbed("❌ Você já tem um empréstimo ativo neste banco.")], ephemeral: true });
                if (bank.reserves < value) return replyOrEdit(interaction, { embeds: [errorEmbed("❌ O banco não tem reservas para esse empréstimo.")], ephemeral: true });

                const rate = Math.max(0, Math.min(0.5, bank.loanInterestRate || 0.15));
                const due = now + days * 24 * 60 * 60 * 1000;
                const total = Math.floor(value * (1 + rate));

                const update = await client.playerBankdb.findOneAndUpdate(
                    { guildID, bankID: id, reserves: { $gte: value } },
                    {
                        $inc: { reserves: -value },
                        $push: { loans: { borrowerId: interaction.user.id, principal: value, interestRate: rate, createdAt: now, dueAt: due, remaining: total } },
                    },
                    { new: true }
                );

                if (!update) return replyOrEdit(interaction, { embeds: [errorEmbed("❌ Falha ao emitir empréstimo.")], ephemeral: true });

                await creditWallet(client.userdb, interaction.user.id, value, "playerbank_loan", { bank: id, total, dueAt: due }).catch(() => {});

                const embed = new EmbedBuilder()
                    .setTitle("📄 Empréstimo aprovado")
                    .setColor("Gold")
                    .setDescription(`Você recebeu **${formatMoney(value)}**.\nTotal a pagar: **${formatMoney(total)}**\nVence: <t:${Math.floor(due / 1000)}:R>`)
                    .addFields({ name: "Banco", value: update.name, inline: true });
                return replyOrEdit(interaction, { embeds: [embed], ephemeral: true });
            }

            if (sub === "emprestimo_pagar") {
                const pay = Math.floor(interaction.options.getNumber("valor"));
                if (!Number.isFinite(pay) || pay <= 0) return replyOrEdit(interaction, { embeds: [errorEmbed("❌ Valor inválido.")], ephemeral: true });

                const bankFresh = await client.playerBankdb.findOne({ guildID, bankID: id });
                const loan = (bankFresh.loans || []).find((l) => l.borrowerId === interaction.user.id && l.remaining > 0);
                if (!loan) return replyOrEdit(interaction, { embeds: [errorEmbed("❌ Você não tem empréstimo ativo nesse banco.")], ephemeral: true });

                const amount = Math.min(pay, loan.remaining);
                const debited = await debitWalletIfEnough(client.userdb, interaction.user.id, amount, "playerbank_loan_pay", { bank: id });
                if (!debited) return replyOrEdit(interaction, { embeds: [errorEmbed("❌ Saldo insuficiente.")], ephemeral: true });

                const updated = await client.playerBankdb.findOneAndUpdate(
                    { guildID, bankID: id, "loans.borrowerId": interaction.user.id, "loans.remaining": { $gt: 0 } },
                    {
                        $inc: { reserves: amount },
                        $set: { "loans.$.remaining": Math.max(0, loan.remaining - amount) },
                    },
                    { new: true }
                );

                if (!updated) {
                    await creditWallet(client.userdb, interaction.user.id, amount, "playerbank_refund", { reason: "loan_update_failed", bank: id }).catch(() => {});
                    return replyOrEdit(interaction, { embeds: [errorEmbed("❌ Falha ao registrar pagamento. Valor estornado.")], ephemeral: true });
                }

                const loanNow = (updated.loans || []).find((l) => l.borrowerId === interaction.user.id && l.createdAt === loan.createdAt);
                const remaining = loanNow ? loanNow.remaining : 0;

                const embed = new EmbedBuilder()
                    .setTitle("✅ Pagamento recebido")
                    .setColor("Green")
                    .setDescription(`Você pagou **${formatMoney(amount)}**. Restante: **${formatMoney(remaining)}**.`)
                    .addFields({ name: "Banco", value: updated.name, inline: true });
                return replyOrEdit(interaction, { embeds: [embed], ephemeral: true });
            }

        } catch (err) {
            logger.error("Erro no banco privado", { error: String(err?.message || err) });
            replyOrEdit(interaction, { embeds: [errorEmbed("Erro no banco privado.")], ephemeral: true }).catch(() => {});
        }
    }
};

