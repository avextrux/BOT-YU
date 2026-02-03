const Discord = require("discord.js");
const { ensureEconomyAllowed } = require("../../Utils/economyGuard");
const { formatMoney, debitWalletIfEnough, errorEmbed } = require("../../Utils/economy");
const { DISTRICTS } = require("../../Utils/blackMarketEngine");
const { ensureTerritories, applyCriminalInfluence, territoryIdFor } = require("../../Utils/territoryEngine");
const { bumpRate } = require("../../Utils/antiCheat");

function toChoice(list) {
    return list.slice(0, 25).map((d) => ({ name: d.name, value: d.id }));
}

function genFactionId(guildId) {
    return `F_${guildId}_${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
}

async function generateUniqueFactionId(client, guildId) {
    for (let i = 0; i < 12; i++) {
        const id = genFactionId(guildId);
        const exists = await client.factiondb.findOne({ guildID: guildId, factionId: id }).select({ _id: 1 }).lean();
        if (!exists) return id;
    }
    return `F_${guildId}_${Date.now().toString(36).toUpperCase()}`;
}

module.exports = {
    name: "faccao",
    description: "Gangues do submundo: formar facções e disputar território",
    type: "CHAT_INPUT",
    options: [
        { name: "listar", description: "Lista facções do servidor", type: "SUB_COMMAND" },
        { name: "territorios", description: "Mostra controle territorial", type: "SUB_COMMAND" },
        { name: "sair", description: "Sai da sua facção", type: "SUB_COMMAND" },
        {
            name: "criar",
            description: "Cria uma facção criminosa",
            type: "SUB_COMMAND",
            options: [
                { name: "nome", description: "Nome (3 a 24)", type: "STRING", required: true },
                { name: "tag", description: "Tag (opcional, 2 a 5)", type: "STRING", required: false },
            ],
        },
        {
            name: "entrar",
            description: "Entra em uma facção",
            type: "SUB_COMMAND",
            options: [{ name: "id", description: "ID da facção", type: "STRING", required: true }],
        },
        {
            name: "info",
            description: "Mostra info de uma facção",
            type: "SUB_COMMAND",
            options: [{ name: "id", description: "ID da facção (opcional)", type: "STRING", required: false }],
        },
        {
            name: "influenciar",
            description: "Compra influência em um território (dinheiro -> influência)",
            type: "SUB_COMMAND",
            options: [
                { name: "distrito", description: "Distrito", type: "STRING", required: true, choices: toChoice(DISTRICTS) },
                { name: "pontos", description: "Pontos de influência (1 a 50)", type: "INTEGER", required: true },
            ],
        },
    ],
    run: async (client, interaction) => {
        try {
            const sub = interaction.options.getSubcommand();
            if (!client.factiondb || !client.blackMarketUserdb || !client.territorydb || !client.userdb) {
                return interaction.reply({ content: "❌ Banco do evento indisponível.", ephemeral: true });
            }

            const gate = await ensureEconomyAllowed(client, interaction, interaction.user.id);
            if (!gate.ok) return interaction.reply({ embeds: [gate.embed], ephemeral: true });

            await ensureTerritories(client, interaction.guildId);

            const u = await client.blackMarketUserdb.getOrCreate(interaction.guildId, interaction.user.id);
            const myFactionId = u.faction?.factionId || null;

            if (sub === "listar") {
                const list = await client.factiondb.find({ guildID: interaction.guildId, side: "criminal" }).sort({ rep: -1 }).limit(10).lean();
                const lines = list.length
                    ? list.map((f, i) => `**${i + 1}.** **${f.name}** ${f.tag ? `[\`${f.tag}\`]` : ""} — ID: \`${f.factionId}\` • membros ${f.members?.length || 0}`).join("\n")
                    : "Nenhuma facção criada ainda.";
                const e = new Discord.MessageEmbed().setTitle("🏴 Facções do Submundo").setColor("DARK_BUT_NOT_BLACK").setDescription(lines);
                return interaction.reply({ embeds: [e], ephemeral: true });
            }

            if (sub === "territorios") {
                const ts = await client.territorydb.find({ guildID: interaction.guildId }).lean();
                const lines = ts
                    .map((t) => {
                        const owner = t.ownerFactionId ? `🏴 \`${t.ownerFactionId}\`` : "👮 Estado";
                        const mine = myFactionId ? (t.influence?.[myFactionId] || (typeof t.influence?.get === "function" ? t.influence.get(myFactionId) : 0) || 0) : 0;
                        const police = Math.floor(t.policeInfluence || 0);
                        return `• **${t.name}** — dono: ${owner} • sua influência: **${mine}** • polícia: **${police}**`;
                    })
                    .join("\n")
                    .slice(0, 3900);
                const e = new Discord.MessageEmbed().setTitle("🗺️ Territórios").setColor("BLURPLE").setDescription(lines || "-");
                return interaction.reply({ embeds: [e], ephemeral: true });
            }

            if (sub === "criar") {
                if (myFactionId) return interaction.reply({ embeds: [errorEmbed("❌ Você já está em uma facção. Use `/faccao sair`.")], ephemeral: true });
                const name = (interaction.options.getString("nome") || "").trim();
                const tag = (interaction.options.getString("tag") || "").trim();
                if (name.length < 3 || name.length > 24) return interaction.reply({ embeds: [errorEmbed("❌ Nome inválido (3 a 24).")], ephemeral: true });
                if (tag && (tag.length < 2 || tag.length > 5)) return interaction.reply({ embeds: [errorEmbed("❌ Tag inválida (2 a 5).")], ephemeral: true });

                const factionId = await generateUniqueFactionId(client, interaction.guildId);
                try {
                    await client.factiondb.create({
                        guildID: interaction.guildId,
                        factionId,
                        createdAt: Date.now(),
                        name,
                        tag,
                        side: "criminal",
                        leaderId: interaction.user.id,
                        members: [{ userId: interaction.user.id, role: "leader", joinedAt: Date.now() }],
                        treasury: 0,
                        rep: 0,
                        territories: [],
                    });
                } catch (e) {
                    if (String(e?.code) === "11000") {
                        return interaction.reply({ content: "❌ Já existe uma facção com esse nome neste servidor.", ephemeral: true });
                    }
                    throw e;
                }
                u.faction = { factionId, joinedAt: Date.now() };
                await u.save().catch(() => {});
                return interaction.reply({ content: `✅ Facção criada: **${name}** (ID: \`${factionId}\`).`, ephemeral: true });
            }

            if (sub === "entrar") {
                if (myFactionId) return interaction.reply({ content: "❌ Você já está em uma facção.", ephemeral: true });
                const id = String(interaction.options.getString("id") || "").trim();
                const now = Date.now();
                const updated = await client.factiondb.findOneAndUpdate(
                    {
                        guildID: interaction.guildId,
                        factionId: id,
                        side: "criminal",
                        "members.userId": { $ne: interaction.user.id },
                        $expr: { $lt: [{ $size: "$members" }, 30] },
                    },
                    { $push: { members: { userId: interaction.user.id, role: "member", joinedAt: now } } },
                    { new: true }
                );
                if (!updated) {
                    const exists = await client.factiondb.findOne({ guildID: interaction.guildId, factionId: id, side: "criminal" }).lean();
                    if (!exists) return interaction.reply({ content: "❌ Facção não encontrada.", ephemeral: true });
                    if ((exists.members || []).some((m) => m.userId === interaction.user.id)) return interaction.reply({ content: "❌ Você já está nessa facção.", ephemeral: true });
                    if ((exists.members || []).length >= 30) return interaction.reply({ content: "❌ Facção cheia (limite 30).", ephemeral: true });
                    return interaction.reply({ content: "❌ Não consegui entrar agora (tente novamente).", ephemeral: true });
                }

                u.faction = { factionId: updated.factionId, joinedAt: now };
                await u.save().catch(() => {});
                return interaction.reply({ content: `✅ Você entrou na facção **${updated.name}**.`, ephemeral: true });
            }

            if (sub === "sair") {
                if (!myFactionId) return interaction.reply({ content: "❌ Você não está em facção.", ephemeral: true });
                const f = await client.factiondb.findOne({ guildID: interaction.guildId, factionId: myFactionId });
                if (!f) {
                    u.faction = { factionId: null, joinedAt: 0 };
                    await u.save().catch(() => {});
                    return interaction.reply({ content: "✅ Você saiu da facção.", ephemeral: true });
                }
                if (f.leaderId === interaction.user.id) return interaction.reply({ content: "❌ Líder não pode sair. Transfira liderança (futuro) ou peça para um admin remover.", ephemeral: true });
                f.members = (f.members || []).filter((m) => m.userId !== interaction.user.id);
                await f.save().catch(() => {});
                u.faction = { factionId: null, joinedAt: 0 };
                await u.save().catch(() => {});
                return interaction.reply({ content: "✅ Você saiu da facção.", ephemeral: true });
            }

            if (sub === "info") {
                const id = (interaction.options.getString("id") || myFactionId || "").trim();
                if (!id) return interaction.reply({ content: "❌ Informe um ID ou entre em uma facção.", ephemeral: true });
                const f = await client.factiondb.findOne({ guildID: interaction.guildId, factionId: id });
                if (!f) return interaction.reply({ content: "❌ Facção não encontrada.", ephemeral: true });
                const members = (f.members || []).slice(0, 15).map((m) => `<@${m.userId}>`).join("\n") || "-";
                const e = new Discord.MessageEmbed()
                    .setTitle(`🏴 ${f.name}${f.tag ? ` [${f.tag}]` : ""}`)
                    .setColor("DARK_BUT_NOT_BLACK")
                    .addField("ID", `\`${f.factionId}\``, true)
                    .addField("Líder", `<@${f.leaderId}>`, true)
                    .addField("Membros (Top 15)", members, false)
                    .addField("Cofre", formatMoney(f.treasury || 0), true)
                    .addField("Reputação", String(f.rep || 0), true);
                return interaction.reply({ embeds: [e], ephemeral: true });
            }

            if (sub === "influenciar") {
                if (!myFactionId) return interaction.reply({ content: "❌ Você precisa estar em uma facção para influenciar.", ephemeral: true });
                const points = Math.max(1, Math.min(50, Math.floor(interaction.options.getInteger("pontos") || 1)));
                const districtId = interaction.options.getString("distrito");
                const rate = bumpRate(u, { windowMs: 60 * 1000, maxInWindow: 4, lockMs: 2 * 60 * 1000 });
                if (!rate.ok) {
                    await u.save().catch(() => {});
                    return interaction.reply({ content: `⛔ Muitas ações seguidas. Tente <t:${Math.floor((rate.lockedUntil || 0) / 1000)}:R>.`, ephemeral: true });
                }
                const cost = points * 200;
                const territory = await client.territorydb.findOne({ territoryId: territoryIdFor(interaction.guildId, districtId) }).select({ _id: 1 }).lean();
                if (!territory) return interaction.reply({ content: "❌ Território inválido.", ephemeral: true });
                const paid = await debitWalletIfEnough(client.userdb, interaction.user.id, cost, "faction_influence_buy", { guildId: interaction.guildId, districtId, points });
                if (!paid) return interaction.reply({ content: `❌ Você precisa de ${formatMoney(cost)} na carteira.`, ephemeral: true });

                const t = await applyCriminalInfluence(client, interaction.guildId, districtId, myFactionId, points * 3);
                if (!t) return interaction.reply({ content: "❌ Território indisponível.", ephemeral: true });

                const f = await client.factiondb.findOne({ guildID: interaction.guildId, factionId: myFactionId });
                if (f) {
                    f.rep = Math.floor((f.rep || 0) + points);
                    f.treasury = Math.floor((f.treasury || 0) + Math.floor(cost * 0.15));
                    await f.save().catch(() => {});
                }

                return interaction.reply({ content: `✅ Influência aplicada em **${t.name}**. Custo: ${formatMoney(cost)}.`, ephemeral: true });
            }
        } catch (err) {
            console.error(err);
            interaction.reply({ content: "Erro na facção.", ephemeral: true }).catch(() => {});
        }
    },
};
