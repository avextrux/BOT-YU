const Discord = require("discord.js");
const { ensureEconomyAllowed } = require("../../Utils/economyGuard");
const { formatMoney, debitWalletIfEnough, creditWallet, errorEmbed } = require("../../Utils/economy");
const { DISTRICTS } = require("../../Utils/blackMarketEngine");
const { ensureTerritories, applyCriminalInfluence, territoryIdFor } = require("../../Utils/territoryEngine");
const { bumpRate } = require("../../Utils/antiCheat");

const LIMITS = {
    nameMin: 3,
    nameMax: 24,
    tagMin: 2,
    tagMax: 5,
    maxMembers: 30,
};

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

function isAdmin(interaction) {
    return (
        interaction.member?.permissions?.has("ADMINISTRATOR") ||
        interaction.member?.permissions?.has("MANAGE_GUILD")
    );
}

function parseUserId(raw) {
    const s = String(raw || "").trim();
    const m = s.match(/^<@!?(\d+)>$/);
    if (m) return m[1];
    const only = s.match(/^(\d{16,25})$/);
    if (only) return only[1];
    return null;
}

function normalizeSpaces(s) {
    return String(s || "")
        .replace(/\s+/g, " ")
        .trim();
}

function normalizeFactionName(raw) {
    const name = normalizeSpaces(raw);
    return name;
}

function normalizeTag(raw) {
    const tag = String(raw || "")
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "")
        .trim();
    return tag;
}

function parseAmount(raw) {
    const n = Number(String(raw || "").replace(/\./g, "").replace(/,/g, "."));
    if (!Number.isFinite(n)) return 0;
    return Math.floor(n);
}

async function safe(promise) {
    try {
        return await promise;
    } catch (e) {
        if (e?.code === 10062 || e?.code === 40060) return null;
        throw e;
    }
}

async function promptOneLine(interactionLike, { prompt, timeMs = 60000 }) {
    if (!interactionLike.channel || typeof interactionLike.channel.awaitMessages !== "function") return null;
    await interactionLike.followUp({ content: prompt, ephemeral: true }).catch(() => {});
    const filter = (m) => m.author?.id === interactionLike.user.id;
    const collected = await interactionLike.channel.awaitMessages({ filter, max: 1, time: timeMs });
    const msg = collected.first();
    if (!msg) return null;
    const value = msg.content;
    msg.delete().catch(() => {});
    return value;
}

async function findFactionByInput(client, guildId, raw) {
    const q = normalizeSpaces(raw);
    if (!q) return { faction: null, candidates: [] };
    if (/^F_/i.test(q)) {
        const faction = await client.factiondb.findOne({ guildID: guildId, factionId: q.trim() }).lean();
        return { faction: faction || null, candidates: [] };
    }

    const tagQ = normalizeTag(q);
    if (tagQ.length >= LIMITS.tagMin && tagQ.length <= LIMITS.tagMax) {
        const candidates = await client.factiondb
            .find({ guildID: guildId, side: "criminal", tag: new RegExp(`^${tagQ}$`, "i") })
            .sort({ rep: -1 })
            .limit(5)
            .lean();
        if (candidates.length === 1) return { faction: candidates[0], candidates: [] };
        return { faction: null, candidates };
    }

    const candidates = await client.factiondb
        .find({ guildID: guildId, side: "criminal", name: new RegExp(`^${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") })
        .sort({ rep: -1 })
        .limit(5)
        .lean();
    if (candidates.length === 1) return { faction: candidates[0], candidates: [] };
    return { faction: null, candidates };
}

async function getMyFaction(client, guildId, userId) {
    const u = await client.blackMarketUserdb.getOrCreate(guildId, userId);
    const factionId = u.faction?.factionId || null;
    if (!factionId) return { user: u, faction: null };
    const f = await client.factiondb.findOne({ guildID: guildId, factionId }).lean();
    return { user: u, faction: f };
}

function districtsText() {
    return DISTRICTS.map((d) => `• **${d.id}** — ${d.name}`).join("\n");
}

module.exports = {
    name: "faccao",
    description: "Hub de facções: gangues do submundo e territórios",
    type: "CHAT_INPUT",
    hubActions: [
        "Minha facção — status e membros",
        "Listar facções — top facções do servidor",
        "Territórios — controle territorial por distrito",
        "Criar facção — criar sua gangue (nome e tag)",
        "Entrar em facção — entrar por ID/tag/nome",
        "Sair da facção — sair da sua gangue",
        "Comprar influência — dinheiro -> influência",
        "Depositar no cofre — carteira -> cofre da facção",
        "Pagar membro (cofre) — líder paga alguém com o cofre",
        "Transferir liderança — líder passa liderança",
        "Expulsar membro — líder remove alguém",
        "Deletar facção — líder/admin apaga facção",
    ],
    run: async (client, interaction) => {
        try {
            if (!client.factiondb || !client.blackMarketUserdb || !client.territorydb || !client.userdb) {
                return interaction.reply({ content: "❌ Banco do evento indisponível.", ephemeral: true });
            }

            const gate = await ensureEconomyAllowed(client, interaction, interaction.user.id);
            if (!gate.ok) return interaction.reply({ embeds: [gate.embed], ephemeral: true });

            await ensureTerritories(client, interaction.guildId);

            const menu = new Discord.MessageSelectMenu()
                .setCustomId("faccao_hub_action")
                .setPlaceholder("Selecionar comando...")
                .addOptions([
                    { label: "🏴 Minha facção", value: "minha", description: "Ver status e membros" },
                    { label: "📜 Listar facções", value: "listar", description: "Top facções do servidor" },
                    { label: "🗺️ Territórios", value: "territorios", description: "Controle territorial" },
                    { label: "➕ Criar facção", value: "criar", description: "Criar facção (nome/tag)" },
                    { label: "✅ Entrar em facção", value: "entrar", description: "Entrar por ID/tag/nome" },
                    { label: "🚪 Sair da facção", value: "sair", description: "Sair da sua facção" },
                    { label: "📈 Comprar influência", value: "influenciar", description: "Dinheiro -> influência" },
                    { label: "🏦 Depositar no cofre", value: "depositar", description: "Carteira -> cofre" },
                    { label: "💸 Pagar membro (cofre)", value: "pagar", description: "Líder: pagar alguém com o cofre" },
                    { label: "👑 Transferir liderança", value: "transferir", description: "Líder: passar liderança" },
                    { label: "🧹 Expulsar membro", value: "expulsar", description: "Líder: remover alguém" },
                    { label: "🗑️ Deletar facção", value: "deletar", description: "Líder/Admin: apagar facção" },
                ]);

            const row = new Discord.MessageActionRow().addComponents(menu);

            const { user: startUser, faction: startFaction } = await getMyFaction(client, interaction.guildId, interaction.user.id);
            const home = new Discord.MessageEmbed()
                .setTitle("🏴 HUB DE FACÇÕES")
                .setColor("DARK_BUT_NOT_BLACK")
                .setDescription("Escolha uma ação no menu. Se o bot pedir algo, você digita e a mensagem é apagada.")
                .addField(
                    "Sua facção",
                    startFaction
                        ? `**${startFaction.name}** ${startFaction.tag ? `[\`${startFaction.tag}\`]` : ""}\nID: \`${startFaction.factionId}\`\nLíder: <@${startFaction.leaderId}>`
                        : "Você ainda não está em uma facção.",
                    false
                )
                .addField("Territórios", "Use a opção **Territórios** para ver quem domina cada distrito.", false)
                .setFooter({ text: `Seu status no evento é salvo no servidor. Heat/rep vem do /mercadonegro.` });

            const msg = await interaction.reply({ embeds: [home], components: [row], fetchReply: true, ephemeral: true });

            const collector = msg.createMessageComponentCollector({ componentType: "SELECT_MENU", idle: 120000 });

            collector.on("collect", async (i) => {
                try {
                    if (i.user.id !== interaction.user.id) return safe(i.reply({ content: "❌ Esse menu é do autor do comando.", ephemeral: true }));
                    const action = i.values[0];
                    await safe(i.deferUpdate());

                    if (action === "listar") {
                        const list = await client.factiondb
                            .find({ guildID: interaction.guildId, side: "criminal" })
                            .sort({ rep: -1 })
                            .limit(10)
                            .lean();
                        const lines = list.length
                            ? list.map((f, idx) => `**${idx + 1}.** **${f.name}** ${f.tag ? `[\`${f.tag}\`]` : ""} — ID: \`${f.factionId}\` • membros ${f.members?.length || 0}`).join("\n")
                            : "Nenhuma facção criada ainda.";
                        const e = new Discord.MessageEmbed().setTitle("🏴 Facções do Submundo").setColor("DARK_BUT_NOT_BLACK").setDescription(lines);
                        return safe(i.editReply({ embeds: [e], components: [row] }));
                    }

                    if (action === "territorios") {
                        const { user } = await getMyFaction(client, interaction.guildId, interaction.user.id);
                        const myFactionId = user.faction?.factionId || null;
                        const ts = await client.territorydb.find({ guildID: interaction.guildId }).lean();
                        const lines = ts
                            .map((t) => {
                                const owner = t.ownerFactionId ? `🏴 \`${t.ownerFactionId}\`` : "👮 Estado";
                                const mine = myFactionId ? (t.influence?.[myFactionId] || 0) : 0;
                                const police = Math.floor(t.policeInfluence || 0);
                                return `• **${t.name}** — dono: ${owner} • sua influência: **${mine}** • polícia: **${police}**`;
                            })
                            .join("\n")
                            .slice(0, 3900);
                        const e = new Discord.MessageEmbed().setTitle("🗺️ Territórios").setColor("BLURPLE").setDescription(lines || "-");
                        return safe(i.editReply({ embeds: [e], components: [row] }));
                    }

                    if (action === "minha") {
                        const { user, faction } = await getMyFaction(client, interaction.guildId, interaction.user.id);
                        if (!user.faction?.factionId) return safe(i.followUp({ content: "❌ Você não está em facção.", ephemeral: true }));
                        if (!faction) return safe(i.followUp({ content: "❌ Sua facção não existe mais.", ephemeral: true }));
                        const f = await client.factiondb.findOne({ guildID: interaction.guildId, factionId: faction.factionId });
                        if (!f) return safe(i.followUp({ content: "❌ Sua facção não existe mais.", ephemeral: true }));
                        const members = (f.members || []).slice(0, 20).map((m) => `<@${m.userId}>`).join("\n") || "-";
                        const e = new Discord.MessageEmbed()
                            .setTitle(`🏴 ${f.name}${f.tag ? ` [${f.tag}]` : ""}`)
                            .setColor("DARK_BUT_NOT_BLACK")
                            .addField("ID", `\`${f.factionId}\``, true)
                            .addField("Líder", `<@${f.leaderId}>`, true)
                            .addField("Membros (Top 20)", members, false)
                            .addField("Cofre", formatMoney(f.treasury || 0), true)
                            .addField("Reputação", String(f.rep || 0), true);
                        return safe(i.editReply({ embeds: [e], components: [row] }));
                    }

                    if (action === "criar") {
                        const { user } = await getMyFaction(client, interaction.guildId, interaction.user.id);
                        if (user.faction?.factionId) return safe(i.followUp({ content: "❌ Você já está em uma facção.", ephemeral: true }));
                        const raw = await promptOneLine(i, { prompt: "Digite: `Nome da facção | TAG` (ou só o nome).", timeMs: 60000 });
                        if (!raw) return safe(i.followUp({ content: "⏳ Tempo esgotado.", ephemeral: true }));
                        const parts = raw.split("|").map((x) => x.trim()).filter(Boolean);
                        const name = normalizeFactionName(parts[0] || "");
                        const tag = parts[1] ? normalizeTag(parts[1]) : "";
                        if (name.length < LIMITS.nameMin || name.length > LIMITS.nameMax) {
                            return safe(i.followUp({ embeds: [errorEmbed(`❌ Nome inválido (${LIMITS.nameMin} a ${LIMITS.nameMax}).`)], ephemeral: true }));
                        }
                        if (tag && (tag.length < LIMITS.tagMin || tag.length > LIMITS.tagMax)) {
                            return safe(i.followUp({ embeds: [errorEmbed(`❌ Tag inválida (${LIMITS.tagMin} a ${LIMITS.tagMax}).`)], ephemeral: true }));
                        }

                        const sameName = await client.factiondb.findOne({ guildID: interaction.guildId, name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") }).select({ _id: 1 }).lean();
                        if (sameName) return safe(i.followUp({ content: "❌ Já existe uma facção com esse nome.", ephemeral: true }));
                        if (tag) {
                            const sameTag = await client.factiondb.findOne({ guildID: interaction.guildId, tag: new RegExp(`^${tag}$`, "i") }).select({ _id: 1 }).lean();
                            if (sameTag) return safe(i.followUp({ content: "❌ Já existe uma facção com essa TAG.", ephemeral: true }));
                        }

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
                                const msg = String(e?.message || "");
                                if (msg.includes("guildID_1_name_1")) return safe(i.followUp({ content: "❌ Já existe uma facção com esse nome.", ephemeral: true }));
                                if (msg.includes("factionId_1")) return safe(i.followUp({ content: "❌ Tente novamente (ID da facção colidiu).", ephemeral: true }));
                                return safe(i.followUp({ content: "❌ Já existe uma facção com esses dados.", ephemeral: true }));
                            }
                            throw e;
                        }

                        const now = Date.now();
                        const userRes = await client.blackMarketUserdb.updateOne(
                            { guildID: interaction.guildId, userID: interaction.user.id, "faction.factionId": null },
                            { $set: { faction: { factionId, joinedAt: now } } }
                        );
                        if (!userRes?.modifiedCount) {
                            await client.factiondb.deleteOne({ guildID: interaction.guildId, factionId }).catch(() => {});
                            return safe(i.followUp({ content: "❌ Não consegui concluir a criação (você entrou em outra facção no meio do processo).", ephemeral: true }));
                        }

                        return safe(i.followUp({ content: `✅ Facção criada: **${name}**${tag ? ` [\`${tag}\`]` : ""}\nID: \`${factionId}\``, ephemeral: true }));
                    }

                    if (action === "entrar") {
                        const { user } = await getMyFaction(client, interaction.guildId, interaction.user.id);
                        if (user.faction?.factionId) return safe(i.followUp({ content: "❌ Você já está em uma facção.", ephemeral: true }));
                        const input = await promptOneLine(i, { prompt: "Digite o **ID**, **TAG** ou **nome exato** da facção.", timeMs: 60000 });
                        if (!input) return safe(i.followUp({ content: "⏳ Tempo esgotado.", ephemeral: true }));

                        const resolved = await findFactionByInput(client, interaction.guildId, input);
                        if (resolved.candidates?.length) {
                            const lines = resolved.candidates
                                .map((f) => `• **${f.name}** ${f.tag ? `[\`${f.tag}\`]` : ""} — ID: \`${f.factionId}\``)
                                .join("\n")
                                .slice(0, 1500);
                            return safe(i.followUp({ content: `🔎 Encontrei mais de uma facção. Use o **ID** para entrar:\n${lines}`, ephemeral: true }));
                        }
                        if (!resolved.faction) return safe(i.followUp({ content: "❌ Facção não encontrada. Use **/faccao → Listar facções** para pegar o ID.", ephemeral: true }));

                        const now = Date.now();
                        const updated = await client.factiondb.findOneAndUpdate(
                            {
                                guildID: interaction.guildId,
                                factionId: resolved.faction.factionId,
                                side: "criminal",
                                "members.userId": { $ne: interaction.user.id },
                                $expr: { $lt: [{ $size: "$members" }, LIMITS.maxMembers] },
                            },
                            { $push: { members: { userId: interaction.user.id, role: "member", joinedAt: now } } },
                            { new: true }
                        );

                        if (!updated) {
                            const current = await client.factiondb.findOne({ guildID: interaction.guildId, factionId: resolved.faction.factionId }).lean();
                            if (!current) return safe(i.followUp({ content: "❌ Facção não existe mais.", ephemeral: true }));
                            if ((current.members || []).some((m) => m.userId === interaction.user.id)) return safe(i.followUp({ content: "❌ Você já é membro dessa facção.", ephemeral: true }));
                            if ((current.members || []).length >= LIMITS.maxMembers) return safe(i.followUp({ content: `❌ Facção cheia (máx. ${LIMITS.maxMembers}).`, ephemeral: true }));
                            return safe(i.followUp({ content: "❌ Não consegui entrar agora. Tente novamente.", ephemeral: true }));
                        }

                        const userRes = await client.blackMarketUserdb.updateOne(
                            { guildID: interaction.guildId, userID: interaction.user.id, "faction.factionId": null },
                            { $set: { faction: { factionId: updated.factionId, joinedAt: now } } }
                        );
                        if (!userRes?.modifiedCount) {
                            await client.factiondb.updateOne(
                                { guildID: interaction.guildId, factionId: updated.factionId },
                                { $pull: { members: { userId: interaction.user.id } } }
                            ).catch(() => {});
                            return safe(i.followUp({ content: "❌ Não consegui concluir a entrada (sua facção mudou no meio do processo).", ephemeral: true }));
                        }

                        return safe(i.followUp({ content: `✅ Você entrou na facção **${updated.name}**.`, ephemeral: true }));
                    }

                    if (action === "sair") {
                        const { user, faction } = await getMyFaction(client, interaction.guildId, interaction.user.id);
                        const myFactionId = user.faction?.factionId || null;
                        if (!myFactionId) return safe(i.followUp({ content: "❌ Você não está em facção.", ephemeral: true }));
                        const f = await client.factiondb.findOne({ guildID: interaction.guildId, factionId: myFactionId });
                        if (!f) {
                            await client.blackMarketUserdb.updateOne(
                                { guildID: interaction.guildId, userID: interaction.user.id },
                                { $set: { "faction.factionId": null, "faction.joinedAt": 0 } }
                            ).catch(() => {});
                            return safe(i.followUp({ content: "✅ Você saiu da facção.", ephemeral: true }));
                        }
                        if (f.leaderId === interaction.user.id) {
                            return safe(i.followUp({ content: "❌ Você é líder. Transfira a liderança antes de sair.", ephemeral: true }));
                        }
                        await client.factiondb
                            .updateOne({ guildID: interaction.guildId, factionId: myFactionId }, { $pull: { members: { userId: interaction.user.id } } })
                            .catch(() => {});
                        await client.blackMarketUserdb
                            .updateOne({ guildID: interaction.guildId, userID: interaction.user.id }, { $set: { "faction.factionId": null, "faction.joinedAt": 0 } })
                            .catch(() => {});
                        return safe(i.followUp({ content: `✅ Você saiu da facção${faction?.name ? ` **${faction.name}**` : ""}.`, ephemeral: true }));
                    }

                    if (action === "influenciar") {
                        const { user } = await getMyFaction(client, interaction.guildId, interaction.user.id);
                        const myFactionId = user.faction?.factionId || null;
                        if (!myFactionId) return safe(i.followUp({ content: "❌ Você precisa estar em uma facção.", ephemeral: true }));

                        if (client.blackMarketGuilddb) {
                            const g = await client.blackMarketGuilddb.getOrCreate(interaction.guildId);
                            const req = g.config?.activityRequirements || {};
                            const needed = Math.max(0, Math.floor(req.level2 ?? 50));
                            const mainUser = await client.userdb.getOrCreate(interaction.user.id);
                            const msgCount = Math.max(0, Math.floor(mainUser.economia?.stats?.messagesSent || 0));
                            if (needed > 0 && msgCount < needed) {
                                return safe(i.followUp({ content: `🔒 Desafio de atividade: envie **${needed} mensagens** no chat para comprar influência. (Atual: ${msgCount})`, ephemeral: true }));
                            }
                        }

                        const raw = await promptOneLine(i, { prompt: `Digite: \`distrito pontos\`\n\nDistritos:\n${districtsText()}\n\nExemplo: \`central 10\``, timeMs: 60000 });
                        if (!raw) return safe(i.followUp({ content: "⏳ Tempo esgotado.", ephemeral: true }));
                        const [districtId, ptsRaw] = raw.trim().split(/\s+/);
                        const points = Math.max(1, Math.min(50, Math.floor(Number(ptsRaw) || 0)));
                        if (!districtId || !Number.isFinite(points) || points <= 0) return safe(i.followUp({ content: "❌ Formato inválido.", ephemeral: true }));

                        const rate = bumpRate(user, { windowMs: 60 * 1000, maxInWindow: 4, lockMs: 2 * 60 * 1000 });
                        if (!rate.ok) {
                            await user.save().catch(() => {});
                            return safe(i.followUp({ content: `⛔ Muitas ações seguidas. Tente <t:${Math.floor((rate.lockedUntil || 0) / 1000)}:R>.`, ephemeral: true }));
                        }

                        const territory = await client.territorydb.findOne({ territoryId: territoryIdFor(interaction.guildId, districtId) }).select({ _id: 1 }).lean();
                        if (!territory) return safe(i.followUp({ content: "❌ Território inválido.", ephemeral: true }));

                        const cost = points * 200;
                        const paid = await debitWalletIfEnough(client.userdb, interaction.user.id, cost, "faction_influence_buy", { guildId: interaction.guildId, districtId, points });
                        if (!paid) return safe(i.followUp({ content: `❌ Você precisa de ${formatMoney(cost)} na carteira.`, ephemeral: true }));

                        const t = await applyCriminalInfluence(client, interaction.guildId, districtId, myFactionId, points * 3);
                        if (!t) return safe(i.followUp({ content: "❌ Território indisponível.", ephemeral: true }));

                        const f = await client.factiondb.findOne({ guildID: interaction.guildId, factionId: myFactionId });
                        if (f) {
                            f.rep = Math.floor((f.rep || 0) + points);
                            f.treasury = Math.floor((f.treasury || 0) + Math.floor(cost * 0.15));
                            await f.save().catch(() => {});
                        }

                        return safe(i.followUp({ content: `✅ Influência aplicada em **${t.name}**. Custo: ${formatMoney(cost)}.`, ephemeral: true }));
                    }

                    if (action === "depositar") {
                        const { user } = await getMyFaction(client, interaction.guildId, interaction.user.id);
                        const myFactionId = user.faction?.factionId || null;
                        if (!myFactionId) return safe(i.followUp({ content: "❌ Você precisa estar em uma facção.", ephemeral: true }));

                        const raw = await promptOneLine(i, { prompt: "Digite o valor para depositar no cofre (ex.: 1000).", timeMs: 60000 });
                        if (!raw) return safe(i.followUp({ content: "⏳ Tempo esgotado.", ephemeral: true }));
                        const amount = Math.max(1, Math.min(1_000_000_000_000, parseAmount(raw)));
                        if (!Number.isFinite(amount) || amount <= 0) return safe(i.followUp({ content: "❌ Valor inválido.", ephemeral: true }));

                        const paid = await debitWalletIfEnough(client.userdb, interaction.user.id, amount, "faction_treasury_deposit", { guildId: interaction.guildId, factionId: myFactionId });
                        if (!paid) return safe(i.followUp({ content: `❌ Você precisa de ${formatMoney(amount)} na carteira.`, ephemeral: true }));

                        await client.factiondb.updateOne({ guildID: interaction.guildId, factionId: myFactionId }, { $inc: { treasury: amount } }).catch(() => {});
                        return safe(i.followUp({ content: `✅ Depósito no cofre: **${formatMoney(amount)}**.`, ephemeral: true }));
                    }

                    if (action === "pagar") {
                        const { user } = await getMyFaction(client, interaction.guildId, interaction.user.id);
                        const myFactionId = user.faction?.factionId || null;
                        if (!myFactionId) return safe(i.followUp({ content: "❌ Você não está em facção.", ephemeral: true }));
                        const f = await client.factiondb.findOne({ guildID: interaction.guildId, factionId: myFactionId });
                        if (!f) return safe(i.followUp({ content: "❌ Facção não encontrada.", ephemeral: true }));
                        if (f.leaderId !== interaction.user.id && !isAdmin(interaction)) return safe(i.followUp({ content: "❌ Apenas líder/admin pode pagar pelo cofre.", ephemeral: true }));

                        const raw = await promptOneLine(i, { prompt: "Digite: `@usuario valor` (ex.: `@Fulano 1500`).", timeMs: 60000 });
                        if (!raw) return safe(i.followUp({ content: "⏳ Tempo esgotado.", ephemeral: true }));
                        const parts = raw.trim().split(/\s+/);
                        const targetId = parseUserId(parts[0]);
                        const amount = Math.max(1, Math.min(1_000_000_000_000, parseAmount(parts[1])));
                        if (!targetId || !Number.isFinite(amount) || amount <= 0) return safe(i.followUp({ content: "❌ Formato inválido.", ephemeral: true }));

                        const updatedFaction = await client.factiondb.findOneAndUpdate(
                            { guildID: interaction.guildId, factionId: myFactionId, treasury: { $gte: amount } },
                            { $inc: { treasury: -amount } },
                            { new: true }
                        );
                        if (!updatedFaction) return safe(i.followUp({ content: "❌ Cofre insuficiente para esse pagamento.", ephemeral: true }));

                        await creditWallet(client.userdb, targetId, amount, "faction_treasury_payout", { guildId: interaction.guildId, factionId: myFactionId, by: interaction.user.id }).catch(() => {});
                        return safe(i.followUp({ content: `✅ Pagamento feito: <@${targetId}> recebeu **${formatMoney(amount)}** do cofre.`, ephemeral: true }));
                    }

                    if (action === "transferir") {
                        const { user } = await getMyFaction(client, interaction.guildId, interaction.user.id);
                        const myFactionId = user.faction?.factionId || null;
                        if (!myFactionId) return safe(i.followUp({ content: "❌ Você não está em facção.", ephemeral: true }));

                        const raw = await promptOneLine(i, { prompt: "Digite o @ do novo líder (ou ID).", timeMs: 60000 });
                        if (!raw) return safe(i.followUp({ content: "⏳ Tempo esgotado.", ephemeral: true }));
                        const targetId = parseUserId(raw);
                        if (!targetId) return safe(i.followUp({ content: "❌ Usuário inválido.", ephemeral: true }));
                        if (targetId === interaction.user.id) return safe(i.followUp({ content: "❌ Você já é o líder.", ephemeral: true }));

                        const updated = await client.factiondb.findOneAndUpdate(
                            { guildID: interaction.guildId, factionId: myFactionId, leaderId: interaction.user.id, "members.userId": targetId },
                            [
                                {
                                    $set: {
                                        leaderId: targetId,
                                        members: {
                                            $map: {
                                                input: "$members",
                                                as: "m",
                                                in: {
                                                    $mergeObjects: [
                                                        "$$m",
                                                        {
                                                            role: {
                                                                $cond: [
                                                                    { $eq: ["$$m.userId", targetId] },
                                                                    "leader",
                                                                    {
                                                                        $cond: [{ $eq: ["$$m.userId", interaction.user.id] }, "member", "$$m.role"],
                                                                    },
                                                                ],
                                                            },
                                                        },
                                                    ],
                                                },
                                            },
                                        },
                                    },
                                },
                            ],
                            { new: true }
                        );

                        if (!updated) {
                            const f = await client.factiondb.findOne({ guildID: interaction.guildId, factionId: myFactionId }).lean();
                            if (!f) return safe(i.followUp({ content: "❌ Facção não encontrada.", ephemeral: true }));
                            if (f.leaderId !== interaction.user.id) return safe(i.followUp({ content: "❌ Apenas o líder pode transferir liderança.", ephemeral: true }));
                            return safe(i.followUp({ content: "❌ Essa pessoa não é membro da facção.", ephemeral: true }));
                        }

                        return safe(i.followUp({ content: `✅ Liderança transferida para <@${targetId}>.`, ephemeral: true }));
                    }

                    if (action === "expulsar") {
                        const { user } = await getMyFaction(client, interaction.guildId, interaction.user.id);
                        const myFactionId = user.faction?.factionId || null;
                        if (!myFactionId) return safe(i.followUp({ content: "❌ Você não está em facção.", ephemeral: true }));
                        const f = await client.factiondb.findOne({ guildID: interaction.guildId, factionId: myFactionId });
                        if (!f) return safe(i.followUp({ content: "❌ Facção não encontrada.", ephemeral: true }));
                        if (f.leaderId !== interaction.user.id) return safe(i.followUp({ content: "❌ Apenas o líder pode expulsar.", ephemeral: true }));

                        const raw = await promptOneLine(i, { prompt: "Digite o @ (ou ID) do membro para expulsar.", timeMs: 60000 });
                        if (!raw) return safe(i.followUp({ content: "⏳ Tempo esgotado.", ephemeral: true }));
                        const targetId = parseUserId(raw);
                        if (!targetId) return safe(i.followUp({ content: "❌ Usuário inválido.", ephemeral: true }));
                        if (targetId === interaction.user.id) return safe(i.followUp({ content: "❌ Você não pode expulsar você mesmo.", ephemeral: true }));
                        if (!(f.members || []).some((m) => m.userId === targetId)) return safe(i.followUp({ content: "❌ Essa pessoa não é membro da facção.", ephemeral: true }));

                        const res = await client.factiondb.updateOne(
                            { guildID: interaction.guildId, factionId: myFactionId, "members.userId": targetId },
                            { $pull: { members: { userId: targetId } } }
                        );
                        if (!res?.modifiedCount) return safe(i.followUp({ content: "❌ Não consegui expulsar agora. Tente novamente.", ephemeral: true }));
                        await client.blackMarketUserdb.updateOne({ guildID: interaction.guildId, userID: targetId }, { $set: { "faction.factionId": null, "faction.joinedAt": 0 } }).catch(() => {});
                        return safe(i.followUp({ content: `✅ <@${targetId}> foi expulso da facção.`, ephemeral: true }));
                    }

                    if (action === "deletar") {
                        const { user } = await getMyFaction(client, interaction.guildId, interaction.user.id);
                        const myFactionId = user.faction?.factionId || null;
                        if (!myFactionId) return safe(i.followUp({ content: "❌ Você não está em facção.", ephemeral: true }));
                        const f = await client.factiondb.findOne({ guildID: interaction.guildId, factionId: myFactionId });
                        if (!f) return safe(i.followUp({ content: "❌ Facção não encontrada.", ephemeral: true }));
                        if (f.leaderId !== interaction.user.id && !isAdmin(interaction)) return safe(i.followUp({ content: "❌ Apenas líder/admin pode deletar.", ephemeral: true }));

                        const confirm = await promptOneLine(i, { prompt: `Digite **DELETAR ${f.factionId}** para confirmar.`, timeMs: 60000 });
                        if (!confirm) return safe(i.followUp({ content: "⏳ Tempo esgotado.", ephemeral: true }));
                        if (confirm.trim() !== `DELETAR ${f.factionId}`) return safe(i.followUp({ content: "❌ Confirmação inválida.", ephemeral: true }));

                        await client.factiondb.deleteOne({ guildID: interaction.guildId, factionId: f.factionId }).catch(() => {});
                        await client.blackMarketUserdb.updateMany({ guildID: interaction.guildId, "faction.factionId": f.factionId }, { $set: { "faction.factionId": null, "faction.joinedAt": 0 } }).catch(() => {});
                        return safe(i.followUp({ content: "✅ Facção deletada.", ephemeral: true }));
                    }
                } catch (err) {
                    console.error(err);
                    i.followUp({ content: "Erro ao executar ação de facção.", ephemeral: true }).catch(() => {});
                }
            });

            collector.on("end", () => {
                const disabledMenu = menu.setDisabled(true).setPlaceholder("Menu expirado");
                const disabledRow = new Discord.MessageActionRow().addComponents(disabledMenu);
                interaction.editReply({ components: [disabledRow] }).catch(() => {});
            });
        } catch (err) {
            console.error(err);
            interaction.reply({ content: "Erro na facção.", ephemeral: true }).catch(() => {});
        }
    },
};
