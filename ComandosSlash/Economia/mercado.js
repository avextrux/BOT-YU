const Discord = require("discord.js");
const { formatMoney, debitWalletIfEnough, creditWallet, errorEmbed } = require("../../Utils/economy");
const { ensureEconomyAllowed } = require("../../Utils/economyGuard");

const DEFAULT_OWNER_ID = process.env.CENTRAL_BANK_OWNER_ID || "589646045756129301";

function isAdminMember(interaction) {
    return (
        interaction.member?.permissions?.has("ADMINISTRATOR") ||
        interaction.member?.permissions?.has("MANAGE_GUILD")
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
    type: "CHAT_INPUT",
    options: [
        { name: "listar", description: "Lista anúncios ativos", type: "SUB_COMMAND" },
        {
            name: "anunciar",
            description: "Cria um anúncio de venda",
            type: "SUB_COMMAND",
            options: [
                { name: "titulo", description: "Título do anúncio", type: "STRING", required: true },
                { name: "preco", description: "Preço por unidade", type: "INTEGER", required: true },
                { name: "quantidade", description: "Estoque (1 a 999)", type: "INTEGER", required: true },
                { name: "descricao", description: "Descrição (opcional)", type: "STRING", required: false },
            ],
        },
        {
            name: "comprar",
            description: "Compra de um anúncio",
            type: "SUB_COMMAND",
            options: [
                { name: "id", description: "ID do anúncio", type: "STRING", required: true },
                { name: "quantidade", description: "Quantidade", type: "INTEGER", required: true },
            ],
        },
        {
            name: "cancelar",
            description: "Cancela um anúncio (vendedor/admin)",
            type: "SUB_COMMAND",
            options: [{ name: "id", description: "ID do anúncio", type: "STRING", required: true }],
        },
        { name: "minhas", description: "Lista seus anúncios", type: "SUB_COMMAND" },
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

                const embed = new Discord.MessageEmbed()
                    .setTitle("🛍️ Mercado — Anúncios Ativos")
                    .setColor("BLURPLE")
                    .setDescription(offers.length ? "Use `/mercado comprar id:XXXX quantidade:1`" : "Nenhum anúncio ativo.");

                for (const o of offers) {
                    embed.addField(
                        `${o.offerId} • ${o.title}`,
                        `Vendedor: <@${o.sellerId}>\nPreço: ${formatMoney(o.price)}\nEstoque: ${o.stock}\n${o.description ? o.description.slice(0, 180) : ""}`.trim(),
                        false
                    );
                }

                return interaction.reply({ embeds: [embed] });
            }

            if (sub === "minhas") {
                const offers = await client.marketOfferdb
                    .find({ guildID: interaction.guildId, sellerId: interaction.user.id, active: true })
                    .sort({ createdAt: -1 })
                    .limit(15)
                    .lean();

                const embed = new Discord.MessageEmbed()
                    .setTitle("📌 Mercado — Meus Anúncios")
                    .setColor("BLURPLE")
                    .setDescription(offers.length ? "Use `/mercado cancelar id:XXXX` para remover." : "Você não tem anúncios ativos.");

                for (const o of offers) {
                    embed.addField(
                        `${o.offerId} • ${o.title}`,
                        `Preço: ${formatMoney(o.price)} • Estoque: ${o.stock}`,
                        false
                    );
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

                const embed = new Discord.MessageEmbed()
                    .setTitle("✅ Anúncio criado")
                    .setColor("GREEN")
                    .addField("ID", offerId, true)
                    .addField("Preço", formatMoney(price), true)
                    .addField("Estoque", String(stock), true)
                    .addField("Título", title, false);

                if (description) embed.addField("Descrição", description, false);

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

                offer.stock = Math.max(0, Math.floor((offer.stock || 0) - qty));
                if (offer.stock === 0) offer.active = false;
                await offer.save();

                const embed = new Discord.MessageEmbed()
                    .setTitle("🛒 Compra concluída")
                    .setColor("GREEN")
                    .addFields(
                        { name: "Anúncio", value: `${id} • ${offer.title}`, inline: false },
                        { name: "Vendedor", value: `<@${offer.sellerId}>`, inline: true },
                        { name: "Quantidade", value: String(qty), inline: true },
                        { name: "Total", value: formatMoney(total), inline: true }
                    );

                return interaction.reply({ embeds: [embed] });
            }
        } catch (err) {
            console.error(err);
            interaction.reply({ content: "Erro no mercado.", ephemeral: true }).catch(() => {});
        }
    },
};

