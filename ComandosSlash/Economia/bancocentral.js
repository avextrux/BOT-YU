const Discord = require("discord.js");
const { formatMoney, creditWallet, debitWalletIfEnough } = require("../../Utils/economy");
const { ensureEconomyAllowed } = require("../../Utils/economyGuard");

const DEFAULT_OWNER_ID = process.env.CENTRAL_BANK_OWNER_ID || "589646045756129301";

function ensureCentralBankDefaults(eco) {
    if (!eco.centralBank) eco.centralBank = {};
    if (!eco.centralBank.ownerId) eco.centralBank.ownerId = DEFAULT_OWNER_ID;
    if (!Array.isArray(eco.centralBank.managers)) eco.centralBank.managers = [];
    if (!eco.policy) eco.policy = {};
    if (eco.policy.treasury === undefined || eco.policy.treasury === null) eco.policy.treasury = 0;
}

function isOwner(userId, eco) {
    return userId === (eco?.centralBank?.ownerId || DEFAULT_OWNER_ID);
}

function isAdminMember(interaction) {
    return (
        interaction.member?.permissions?.has("ADMINISTRATOR") ||
        interaction.member?.permissions?.has("MANAGE_GUILD")
    );
}

function hasScope(userId, eco, scope) {
    if (!eco?.centralBank?.managers?.length) return false;
    const entry = eco.centralBank.managers.find((m) => m.userId === userId);
    if (!entry) return false;
    const scopes = entry.scopes || [];
    return scopes.includes("tudo") || scopes.includes(scope);
}

function canManage(userId, interaction, eco, scope) {
    return isOwner(userId, eco) || isAdminMember(interaction) || hasScope(userId, eco, scope);
}

function normalizeScopes(scopeValue) {
    if (!scopeValue) return [];
    if (scopeValue === "tudo") return ["tudo"];
    return [scopeValue];
}

module.exports = {
    name: "bancocentral",
    description: "Banco Central do servidor (tesouro e gestão do evento)",
    type: "CHAT_INPUT",
    hubActions: [
        "status — ver tesouro e gestão",
        "configurar_dono — definir dono (admin)",
        "gerente_adicionar — dar escopo (admin/dono)",
        "gerente_remover — remover gerente (admin/dono)",
        "pagar — pagar via tesouro (admin/gerente)",
        "depositar — depositar via carteira",
    ],
    options: [
        { name: "status", description: "Mostra o saldo e a gestão", type: "SUB_COMMAND" },
        {
            name: "configurar_dono",
            description: "Define o dono do Banco Central (admin)",
            type: "SUB_COMMAND",
            options: [{ name: "usuario", description: "Usuário dono", type: "USER", required: true }],
        },
        {
            name: "gerente_adicionar",
            description: "Adiciona um gerente e escopo (admin/dono)",
            type: "SUB_COMMAND",
            options: [
                { name: "usuario", description: "Usuário gerente", type: "USER", required: true },
                {
                    name: "escopo",
                    description: "Parte que a pessoa pode gerir",
                    type: "STRING",
                    required: true,
                    choices: [
                        { name: "Tudo", value: "tudo" },
                        { name: "Tesouro (pagamentos)", value: "tesouro" },
                        { name: "Votos (voteshop)", value: "votos" },
                        { name: "Eventos (anúncios/atrações)", value: "eventos" },
                        { name: "Loja/itens", value: "loja" },
                        { name: "Negócios/mercado", value: "negocios" },
                    ],
                },
            ],
        },
        {
            name: "gerente_remover",
            description: "Remove um gerente (admin/dono)",
            type: "SUB_COMMAND",
            options: [{ name: "usuario", description: "Usuário gerente", type: "USER", required: true }],
        },
        {
            name: "pagar",
            description: "Paga um usuário usando o tesouro do servidor",
            type: "SUB_COMMAND",
            options: [
                { name: "usuario", description: "Quem recebe", type: "USER", required: true },
                { name: "valor", description: "Valor (inteiro)", type: "INTEGER", required: true },
                { name: "motivo", description: "Motivo (opcional)", type: "STRING", required: false },
            ],
        },
        {
            name: "depositar",
            description: "Deposita no tesouro usando sua carteira",
            type: "SUB_COMMAND",
            options: [
                { name: "valor", description: "Valor (inteiro)", type: "INTEGER", required: true },
                { name: "motivo", description: "Motivo (opcional)", type: "STRING", required: false },
            ],
        },
    ],
    run: async (client, interaction) => {
        try {
            const sub = interaction.options.getSubcommand();
            const eco = await client.guildEconomydb.getOrCreate(interaction.guildId);
            ensureCentralBankDefaults(eco);

            if (sub === "status") {
                const ownerId = eco.centralBank.ownerId || DEFAULT_OWNER_ID;
                const managers = eco.centralBank.managers || [];
                const list =
                    managers.length > 0
                        ? managers
                            .slice(0, 15)
                            .map((m) => `<@${m.userId}> — ${((m.scopes || []).length ? m.scopes.join(", ") : "sem escopo")}`)
                            .join("\n")
                        : "-";

                const embed = new Discord.MessageEmbed()
                    .setTitle("🏦 Banco Central do Servidor")
                    .setColor("BLURPLE")
                    .addFields(
                        { name: "Dono", value: `<@${ownerId}>`, inline: true },
                        { name: "Tesouro", value: formatMoney(eco.policy.treasury || 0), inline: true },
                        { name: "Gerentes (Top 15)", value: list, inline: false }
                    )
                    .setFooter({ text: "O tesouro acumula impostos e pode financiar eventos/prêmios." });

                return interaction.reply({ embeds: [embed] });
            }

            if (sub === "configurar_dono") {
                if (!isAdminMember(interaction) && !isOwner(interaction.user.id, eco)) {
                    return interaction.reply({ content: "❌ Apenas admin ou dono atual pode alterar.", ephemeral: true });
                }
                const user = interaction.options.getUser("usuario");
                eco.centralBank.ownerId = user.id;
                await eco.save();
                return interaction.reply({ content: `✅ Dono do Banco Central definido para ${user}.`, ephemeral: true });
            }

            if (sub === "gerente_adicionar") {
                if (!isAdminMember(interaction) && !isOwner(interaction.user.id, eco)) {
                    return interaction.reply({ content: "❌ Apenas admin ou dono pode gerenciar gerentes.", ephemeral: true });
                }
                const user = interaction.options.getUser("usuario");
                const scope = interaction.options.getString("escopo");
                const scopesToAdd = normalizeScopes(scope);

                const existing = eco.centralBank.managers.find((m) => m.userId === user.id);
                if (!existing) {
                    eco.centralBank.managers.push({ userId: user.id, scopes: scopesToAdd });
                } else {
                    const cur = new Set(existing.scopes || []);
                    for (const s of scopesToAdd) cur.add(s);
                    existing.scopes = Array.from(cur);
                }
                await eco.save();
                return interaction.reply({ content: `✅ Gerente atualizado: ${user} (${scope}).`, ephemeral: true });
            }

            if (sub === "gerente_remover") {
                if (!isAdminMember(interaction) && !isOwner(interaction.user.id, eco)) {
                    return interaction.reply({ content: "❌ Apenas admin ou dono pode gerenciar gerentes.", ephemeral: true });
                }
                const user = interaction.options.getUser("usuario");
                eco.centralBank.managers = (eco.centralBank.managers || []).filter((m) => m.userId !== user.id);
                await eco.save();
                return interaction.reply({ content: `✅ ${user} removido(a) da gestão do Banco Central.`, ephemeral: true });
            }

            if (sub === "depositar") {
                if (!isOwner(interaction.user.id, eco) && !isAdminMember(interaction)) {
                    const ok = await ensureEconomyAllowed(client, interaction, interaction.user.id);
                    if (!ok) return;
                }
                const amount = Math.max(1, Math.floor(interaction.options.getInteger("valor") || 0));
                const motivo = interaction.options.getString("motivo");
                const updated = await debitWalletIfEnough(
                    client.userdb,
                    interaction.user.id,
                    amount,
                    "central_bank_deposit",
                    { guildId: interaction.guildId, motivo: motivo || null }
                );
                if (!updated) return interaction.reply({ content: `❌ Saldo insuficiente na carteira para depositar ${formatMoney(amount)}.`, ephemeral: true });

                eco.policy.treasury = Math.floor((eco.policy.treasury || 0) + amount);
                await eco.save();
                return interaction.reply({ content: `✅ Depósito efetuado: ${formatMoney(amount)} no tesouro.`, ephemeral: true });
            }

            if (sub === "pagar") {
                if (!canManage(interaction.user.id, interaction, eco, "tesouro")) {
                    return interaction.reply({ content: "❌ Você não tem permissão para pagar pelo tesouro.", ephemeral: true });
                }

                const target = interaction.options.getUser("usuario");
                const amount = Math.max(1, Math.floor(interaction.options.getInteger("valor") || 0));
                const motivo = interaction.options.getString("motivo");

                const infinite = isOwner(interaction.user.id, eco) || isAdminMember(interaction);
                if (!infinite && (eco.policy.treasury || 0) < amount) {
                    return interaction.reply({ content: `❌ Tesouro insuficiente. Saldo: ${formatMoney(eco.policy.treasury || 0)}.`, ephemeral: true });
                }
                if (!infinite) {
                    eco.policy.treasury = Math.floor((eco.policy.treasury || 0) - amount);
                    await eco.save();
                }

                await creditWallet(
                    client.userdb,
                    target.id,
                    amount,
                    "central_bank_payout",
                    { guildId: interaction.guildId, by: interaction.user.id, motivo: motivo || null }
                );

                const embed = new Discord.MessageEmbed()
                    .setTitle("🏦 Pagamento do Banco Central")
                    .setColor("GREEN")
                    .addFields(
                        { name: "Recebedor", value: `${target}`, inline: true },
                        { name: "Valor", value: formatMoney(amount), inline: true },
                        { name: "Autorizado por", value: `${interaction.user}`, inline: true },
                        { name: "Motivo", value: motivo || "-", inline: false }
                    );

                return interaction.reply({ embeds: [embed] });
            }
        } catch (err) {
            console.error(err);
            interaction.reply({ content: "Erro no Banco Central.", ephemeral: true }).catch(() => {});
        }
    },
};
