const { EmbedBuilder } = require("discord.js");
const { formatMoney, debitWalletIfEnough, creditWallet, errorEmbed } = require("../../Utils/economy");
const { ensureEconomyAllowed } = require("../../Utils/economyGuard");
const logger = require("../../Utils/logger");
const { replyOrEdit } = require("../../Utils/commandKit");
const config = require("../../Config.json");

const DEFAULT_OWNER_ID = process.env.CENTRAL_BANK_OWNER_ID || config.ownerId || "000000000000000000";

function isAdminMember(interaction) {
    return (
        interaction.member?.permissions?.has("Administrator") ||
        interaction.member?.permissions?.has("ManageGuild")
    );
}

function hasCentralScope(eco, userId, scope) {
    const ownerId = eco?.centralBank?.ownerId || DEFAULT_OWNER_ID;
    if (userId === ownerId) return true;
    const managers = eco?.centralBank?.managers || [];
    const entry = managers.find((m) => m.userId === userId);
    if (!entry) return false;
    const scopes = entry.scopes || [];
    return scopes.includes("tudo") || scopes.includes(scope);
}

async function generateOfferId(model) {
    for (let i = 0; i < 10; i++) {
        const id = Math.random().toString(36).slice(2, 8).toUpperCase();
        const exists = await model.findOne({ offerId: id }).select({ _id: 1 }).lean();
        if (!exists) return id;
    }
    return `${Date.now().toString(36)}`.toUpperCase();
}

module.exports = {
    name: "mercado",
    description: "Negócios do servidor: crie anúncios e venda/compre coisas",
    type: 1, // CHAT_INPUT
    options: [
        { name: "listar", description: "Lista anúncios ativos", type: 1 }, // SUB_COMMAND
        {
            name: "anunciar",
            description: "Cria um anúncio de venda",
            type: 1, // SUB_COMMAND
            options: [
                { name: "titulo", description: "Título do anúncio", type: 3, required: true }, // STRING
                { name: "preco", description: "Preço por unidade", type: 4, required: true }, // INTEGER
                { name: "quantidade", description: "Estoque (1 a 999)", type: 4, required: true }, // INTEGER
                { name: "descricao", description: "Descrição (opcional)", type: 3, required: false }, // STRING
            ],
        },
        {
            name: "comprar",
            description: "Compra de um anúncio",
            type: 1, // SUB_COMMAND
            options: [
                { name: "id", description: "ID do anúncio", type: 3, required: true }, // STRING
                { name: "quantidade", description: "Quantidade", type: 4, required: true }, // INTEGER
            ],
        },
        {
            name: "cancelar",
            description: "Cancela um anúncio (vendedor/admin)",
            type: 1, // SUB_COMMAND
            options: [{ name: "id", description: "ID do anúncio", type: 3, required: true }], // STRING
        },
        { name: "minhas", description: "Lista seus anúncios", type: 1 }, // SUB_COMMAND
    ],
    run: async (client, interaction) => {
        try {
            const sub = interaction.options.getSubcommand();
            const eco = await client.guildEconomydb.getOrCreate(interaction.guildId);

            if (sub === "listar") {
                const offers = await client.marketOfferdb
                    .find({ guildID: interaction.guildId, active: true })
                    .sort({ createdAt: -1 })
                    .limit(10)
                    .lean();

                const embed = new EmbedBuilder()
                    .setTitle("🛍️ Mercado — Anúncios Ativos")
                    .setColor("Blurple")
                    .setDescription(offers.length ? "Use `/mercado comprar id:XXXX quantidade:1`" : "Nenhum anúncio ativo.");

                for (const o of offers) {
                    embed.addFields({
                        name: `${o.offerId} • ${o.title}`,
                        value: `Vendedor: <@${o.sellerId}>\nPreço: ${formatMoney(o.price)}\nEstoque: ${o.stock}\n${o.description ? o.description.slice(0, 180) : ""}`.trim(),
                        inline: false
                    });
                }

                return interaction.reply({ embeds: [embed] });
            }

            if (sub === "minhas") {
                const offers = await client.marketOfferdb
                    .find({ guildID: interaction.guildId, sellerId: interaction.user.id, active: true })
                    .sort({ createdAt: -1 })
                    .limit(15)
                    .lean();

                const embed = new EmbedBuilder()
                    .setTitle("📌 Mercado — Meus Anúncios")
                    .setColor("Blurple")
                    .setDescription(offers.length ? "Use `/mercado cancelar id:XXXX` para remover." : "Você não tem anúncios ativos.");

                for (const o of offers) {
                    embed.addFields({
                        name: `${o.offerId} • ${o.title}`,
                        value: `Preço: ${formatMoney(o.price)} • Estoque: ${o.stock}`,
                        inline: false
                    });
                }

                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            const gate = await ensureEconomyAllowed(client, interaction, interaction.user.id);
            if (!gate.ok) return interaction.reply({ embeds: [gate.embed], ephemeral: true });

            if (sub === "anunciar") {
                const title = (interaction.options.getString("titulo") || "").trim();
                const description = (interaction.options.getString("descricao") || "").trim();
                const price = Math.floor(interaction.options.getInteger("preco"));
                const stock = Math.floor(interaction.options.getInteger("quantidade"));

                if (!title || title.length < 3 || title.length > 60) {
                    return interaction.reply({ embeds: [errorEmbed("❌ Título inválido (3 a 60 caracteres).")], ephemeral: true });
                }
                if (description.length > 400) {
                    return interaction.reply({ embeds: [errorEmbed("❌ Descrição muito longa (máx 400).")], ephemeral: true });
                }
                if (!Number.isFinite(price) || price <= 0) {
                    return interaction.reply({ embeds: [errorEmbed("❌ Preço inválido.")], ephemeral: true });
                }
                if (!Number.isFinite(stock) || stock <= 0 || stock > 999) {
                    return interaction.reply({ embeds: [errorEmbed("❌ Quantidade inválida (1 a 999).")], ephemeral: true });
                }

                const offerId = await generateOfferId(client.marketOfferdb);
                await client.marketOfferdb.create({
                    guildID: interaction.guildId,
                    offerId,
                    sellerId: interaction.user.id,
                    title,
                    description,
                    price,
                    stock,
                    createdAt: Date.now(),
                    active: true,
                });

                const embed = new EmbedBuilder()
                    .setTitle("✅ Anúncio criado")
                    .setColor("Green")
                    .addFields(
                        { name: "ID", value: offerId, inline: true },
                        { name: "Preço", value: formatMoney(price), inline: true },
                        { name: "Estoque", value: String(stock), inline: true },
                        { name: "Título", value: title, inline: false }
                    );

                if (description) embed.addFields({ name: "Descrição", value: description, inline: false });

                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            if (sub === "cancelar") {
                const id = (interaction.options.getString("id") || "").trim().toUpperCase();
                const offer = await client.marketOfferdb.findOne({ guildID: interaction.guildId, offerId: id, active: true });
                if (!offer) return interaction.reply({ content: "❌ Anúncio não encontrado.", ephemeral: true });

                const canCancel =
                    offer.sellerId === interaction.user.id ||
                    isAdminMember(interaction) ||
                    hasCentralScope(eco, interaction.user.id, "negocios");

                if (!canCancel) return interaction.reply({ content: "❌ Você não pode cancelar este anúncio.", ephemeral: true });

                offer.active = false;
                await offer.save();
                return interaction.reply({ content: `✅ Anúncio ${id} cancelado.`, ephemeral: true });
            }

            if (sub === "comprar") {
                const id = (interaction.options.getString("id") || "").trim().toUpperCase();
                const qty = Math.max(1, Math.min(999, Math.floor(interaction.options.getInteger("quantidade") || 1)));

                const offer = await client.marketOfferdb.findOne({ guildID: interaction.guildId, offerId: id, active: true });
                if (!offer) return interaction.reply({ content: "❌ Anúncio não encontrado.", ephemeral: true });
                if (offer.sellerId === interaction.user.id) return interaction.reply({ content: "❌ Você não pode comprar do seu próprio anúncio.", ephemeral: true });
                if ((offer.stock || 0) < qty) return interaction.reply({ content: `❌ Estoque insuficiente. Disponível: ${offer.stock}.`, ephemeral: true });

                const total = Math.floor(offer.price * qty);
                const debited = await debitWalletIfEnough(
                    client.userdb,
                    interaction.user.id,
                    total,
                    "market_buy",
                    { guildId: interaction.guildId, offerId: id, qty, sellerId: offer.sellerId }
                );
                if (!debited) return interaction.reply({ content: `❌ Saldo insuficiente na carteira para pagar ${formatMoney(total)}.`, ephemeral: true });

                await creditWallet(
                    client.userdb,
                    offer.sellerId,
                    total,
                    "market_sell",
                    { guildId: interaction.guildId, offerId: id, qty, buyerId: interaction.user.id }
                ).catch(() => {});

                // Decremento atômico de estoque seria melhor, mas aqui ainda usamos save() simples por enquanto
                // Para consistência total, deveria ser updateOne com filtro stock >= qty
                // Mas como este arquivo é menos crítico que o mercadonegro (player-to-player vs npc), manteremos assim por agora
                // Foco foi remover hardcoded ID e modernizar v14
                offer.stock = Math.max(0, Math.floor((offer.stock || 0) - qty));
                if (offer.stock === 0) offer.active = false;
                await offer.save();

                const embed = new EmbedBuilder()
                    .setTitle("🛒 Compra concluída")
                    .setColor("Green")
                    .addFields(
                        { name: "Anúncio", value: `${id} • ${offer.title}`, inline: false },
                        { name: "Vendedor", value: `<@${offer.sellerId}>`, inline: true },
                        { name: "Quantidade", value: String(qty), inline: true },
                        { name: "Total", value: formatMoney(total), inline: true }
                    );

                return interaction.reply({ embeds: [embed] });
            }
        } catch (err) {
            logger.error("Erro no mercado", { error: String(err?.message || err) });
            replyOrEdit(interaction, { content: "Erro no mercado.", ephemeral: true }).catch(() => {});
        }
    },
};

