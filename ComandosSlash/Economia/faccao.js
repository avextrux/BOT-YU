const Discord = require("discord.js");
const { ensureEconomyAllowed } = require("../../Utils/economyGuard");
const { formatMoney, debitWalletIfEnough, errorEmbed } = require("../../Utils/economy");
const { DISTRICTS } = require("../../Utils/blackMarketEngine");
const { ensureTerritories, applyCriminalInfluence, territoryIdFor } = require("../../Utils/territoryEngine");
const { bumpRate } = require("../../Utils/antiCheat");

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

async function promptOneLine(interaction, { prompt, timeMs = 60000 }) {
    if (!interaction.channel || typeof interaction.channel.awaitMessages !== "function") return null;
    await interaction.followUp({ content: prompt, ephemeral: true }).catch(() => {});
    const filter = (m) => m.author?.id === interaction.user.id;
    const collected = await interaction.channel.awaitMessages({ filter, max: 1, time: timeMs });
    const msg = collected.first();
    if (!msg) return null;
    const value = msg.content;
    msg.delete().catch(() => {});
    return value;
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
                    { label: "Minha facção", value: "minha", description: "Ver status e membros" },
                    { label: "Listar facções", value: "listar", description: "Top facções do servidor" },
                    { label: "Territórios", value: "territorios", description: "Controle territorial" },
                    { label: "Criar facção", value: "criar", description: "Criar sua gangue" },
                    { label: "Entrar em facção", value: "entrar", description: "Entrar usando ID" },
                    { label: "Sair da facção", value: "sair", description: "Sair da sua gangue" },
                    { label: "Comprar influência", value: "influenciar", description: "Dinheiro -> influência" },
                    { label: "Transferir liderança", value: "transferir", description: "Líder: passar liderança" },
                    { label: "Expulsar membro", value: "expulsar", description: "Líder: remover alguém" },
                    { label: "Deletar facção", value: "deletar", description: "Líder/Admin: apagar facção" },
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
                    if (i.user.id !== interaction.user.id) return i.reply({ content: "❌ Esse menu é do autor do comando.", ephemeral: true });
                    const action = i.values[0];

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
                        return i.update({ embeds: [e], components: [row] });
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
                        return i.update({ embeds: [e], components: [row] });
                    }

                    if (action === "minha") {
                        const { user, faction } = await getMyFaction(client, interaction.guildId, interaction.user.id);
                        if (!user.faction?.factionId) return i.reply({ content: "❌ Você não está em facção.", ephemeral: true });
                        if (!faction) return i.reply({ content: "❌ Sua facção não existe mais.", ephemeral: true });
                        const f = await client.factiondb.findOne({ guildID: interaction.guildId, factionId: faction.factionId });
                        if (!f) return i.reply({ content: "❌ Sua facção não existe mais.", ephemeral: true });
                        const members = (f.members || []).slice(0, 20).map((m) => `<@${m.userId}>`).join("\n") || "-";
                        const e = new Discord.MessageEmbed()
                            .setTitle(`🏴 ${f.name}${f.tag ? ` [${f.tag}]` : ""}`)
                            .setColor("DARK_BUT_NOT_BLACK")
                            .addField("ID", `\`${f.factionId}\``, true)
                            .addField("Líder", `<@${f.leaderId}>`, true)
                            .addField("Membros (Top 20)", members, false)
                            .addField("Cofre", formatMoney(f.treasury || 0), true)
                            .addField("Reputação", String(f.rep || 0), true);
                        return i.update({ embeds: [e], components: [row] });
                    }

                    if (action === "criar") {
                        const { user } = await getMyFaction(client, interaction.guildId, interaction.user.id);
                        if (user.faction?.factionId) return i.reply({ content: "❌ Você já está em uma facção.", ephemeral: true });
                        const raw = await promptOneLine(interaction, { prompt: "Digite: `Nome da facção | TAG` (ou só o nome).", timeMs: 60000 });
                        if (!raw) return i.reply({ content: "⏳ Tempo esgotado.", ephemeral: true });
                        const parts = raw.split("|").map((x) => x.trim()).filter(Boolean);
                        const name = (parts[0] || "").trim();
                        const tag = (parts[1] || "").trim();
                        if (name.length < 3 || name.length > 24) return i.reply({ embeds: [errorEmbed("❌ Nome inválido (3 a 24).")], ephemeral: true });
                        if (tag && (tag.length < 2 || tag.length > 5)) return i.reply({ embeds: [errorEmbed("❌ Tag inválida (2 a 5).")], ephemeral: true });

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
                            if (String(e?.code) === "11000") return i.reply({ content: "❌ Já existe uma facção com esse nome.", ephemeral: true });
                            throw e;
                        }
                        user.faction = { factionId, joinedAt: Date.now() };
                        await user.save().catch(() => {});
                        return i.reply({ content: `✅ Facção criada: **${name}** (ID: \`${factionId}\`).`, ephemeral: true });
                    }

                    if (action === "entrar") {
                        const { user } = await getMyFaction(client, interaction.guildId, interaction.user.id);
                        if (user.faction?.factionId) return i.reply({ content: "❌ Você já está em uma facção.", ephemeral: true });
                        const id = await promptOneLine(interaction, { prompt: "Digite o ID da facção (ex.: `F_...`).", timeMs: 60000 });
                        if (!id) return i.reply({ content: "⏳ Tempo esgotado.", ephemeral: true });
                        const now = Date.now();
                        const updated = await client.factiondb.findOneAndUpdate(
                            {
                                guildID: interaction.guildId,
                                factionId: id.trim(),
                                side: "criminal",
                                "members.userId": { $ne: interaction.user.id },
                                $expr: { $lt: [{ $size: "$members" }, 30] },
                            },
                            { $push: { members: { userId: interaction.user.id, role: "member", joinedAt: now } } },
                            { new: true }
                        );
                        if (!updated) return i.reply({ content: "❌ Não consegui entrar (inexistente/cheia/já membro).", ephemeral: true });
                        user.faction = { factionId: updated.factionId, joinedAt: now };
                        await user.save().catch(() => {});
                        return i.reply({ content: `✅ Você entrou na facção **${updated.name}**.`, ephemeral: true });
                    }

                    if (action === "sair") {
                        const { user, faction } = await getMyFaction(client, interaction.guildId, interaction.user.id);
                        const myFactionId = user.faction?.factionId || null;
                        if (!myFactionId) return i.reply({ content: "❌ Você não está em facção.", ephemeral: true });
                        const f = await client.factiondb.findOne({ guildID: interaction.guildId, factionId: myFactionId });
                        if (!f) {
                            user.faction = { factionId: null, joinedAt: 0 };
                            await user.save().catch(() => {});
                            return i.reply({ content: "✅ Você saiu da facção.", ephemeral: true });
                        }
                        if (f.leaderId === interaction.user.id) {
                            return i.reply({ content: "❌ Você é líder. Transfira a liderança antes de sair.", ephemeral: true });
                        }
                        f.members = (f.members || []).filter((m) => m.userId !== interaction.user.id);
                        await f.save().catch(() => {});
                        user.faction = { factionId: null, joinedAt: 0 };
                        await user.save().catch(() => {});
                        return i.reply({ content: `✅ Você saiu da facção${faction?.name ? ` **${faction.name}**` : ""}.`, ephemeral: true });
                    }

                    if (action === "influenciar") {
                        const { user } = await getMyFaction(client, interaction.guildId, interaction.user.id);
                        const myFactionId = user.faction?.factionId || null;
                        if (!myFactionId) return i.reply({ content: "❌ Você precisa estar em uma facção.", ephemeral: true });

                        const raw = await promptOneLine(interaction, { prompt: `Digite: \`distrito pontos\`\n\nDistritos:\n${districtsText()}\n\nExemplo: \`central 10\``, timeMs: 60000 });
                        if (!raw) return i.reply({ content: "⏳ Tempo esgotado.", ephemeral: true });
                        const [districtId, ptsRaw] = raw.trim().split(/\s+/);
                        const points = Math.max(1, Math.min(50, Math.floor(Number(ptsRaw) || 0)));
                        if (!districtId || !Number.isFinite(points) || points <= 0) return i.reply({ content: "❌ Formato inválido.", ephemeral: true });

                        const rate = bumpRate(user, { windowMs: 60 * 1000, maxInWindow: 4, lockMs: 2 * 60 * 1000 });
                        if (!rate.ok) {
                            await user.save().catch(() => {});
                            return i.reply({ content: `⛔ Muitas ações seguidas. Tente <t:${Math.floor((rate.lockedUntil || 0) / 1000)}:R>.`, ephemeral: true });
                        }

                        const territory = await client.territorydb.findOne({ territoryId: territoryIdFor(interaction.guildId, districtId) }).select({ _id: 1 }).lean();
                        if (!territory) return i.reply({ content: "❌ Território inválido.", ephemeral: true });

                        const cost = points * 200;
                        const paid = await debitWalletIfEnough(client.userdb, interaction.user.id, cost, "faction_influence_buy", { guildId: interaction.guildId, districtId, points });
                        if (!paid) return i.reply({ content: `❌ Você precisa de ${formatMoney(cost)} na carteira.`, ephemeral: true });

                        const t = await applyCriminalInfluence(client, interaction.guildId, districtId, myFactionId, points * 3);
                        if (!t) return i.reply({ content: "❌ Território indisponível.", ephemeral: true });

                        const f = await client.factiondb.findOne({ guildID: interaction.guildId, factionId: myFactionId });
                        if (f) {
                            f.rep = Math.floor((f.rep || 0) + points);
                            f.treasury = Math.floor((f.treasury || 0) + Math.floor(cost * 0.15));
                            await f.save().catch(() => {});
                        }

                        return i.reply({ content: `✅ Influência aplicada em **${t.name}**. Custo: ${formatMoney(cost)}.`, ephemeral: true });
                    }

                    if (action === "transferir") {
                        const { user } = await getMyFaction(client, interaction.guildId, interaction.user.id);
                        const myFactionId = user.faction?.factionId || null;
                        if (!myFactionId) return i.reply({ content: "❌ Você não está em facção.", ephemeral: true });
                        const f = await client.factiondb.findOne({ guildID: interaction.guildId, factionId: myFactionId });
                        if (!f) return i.reply({ content: "❌ Facção não encontrada.", ephemeral: true });
                        if (f.leaderId !== interaction.user.id) return i.reply({ content: "❌ Apenas o líder pode transferir liderança.", ephemeral: true });

                        const raw = await promptOneLine(interaction, { prompt: "Digite o @ do novo líder (ou ID).", timeMs: 60000 });
                        if (!raw) return i.reply({ content: "⏳ Tempo esgotado.", ephemeral: true });
                        const targetId = parseUserId(raw);
                        if (!targetId) return i.reply({ content: "❌ Usuário inválido.", ephemeral: true });
                        if (targetId === interaction.user.id) return i.reply({ content: "❌ Você já é o líder.", ephemeral: true });
                        if (!(f.members || []).some((m) => m.userId === targetId)) return i.reply({ content: "❌ Essa pessoa não é membro da facção.", ephemeral: true });

                        f.leaderId = targetId;
                        f.members = (f.members || []).map((m) => {
                            const asObj = typeof m.toObject === "function" ? m.toObject() : m;
                            if (m.userId === targetId) return { ...asObj, role: "leader" };
                            if (m.userId === interaction.user.id) return { ...asObj, role: "member" };
                            return asObj;
                        });
                        await f.save().catch(() => {});
                        return i.reply({ content: `✅ Liderança transferida para <@${targetId}>.`, ephemeral: true });
                    }

                    if (action === "expulsar") {
                        const { user } = await getMyFaction(client, interaction.guildId, interaction.user.id);
                        const myFactionId = user.faction?.factionId || null;
                        if (!myFactionId) return i.reply({ content: "❌ Você não está em facção.", ephemeral: true });
                        const f = await client.factiondb.findOne({ guildID: interaction.guildId, factionId: myFactionId });
                        if (!f) return i.reply({ content: "❌ Facção não encontrada.", ephemeral: true });
                        if (f.leaderId !== interaction.user.id) return i.reply({ content: "❌ Apenas o líder pode expulsar.", ephemeral: true });

                        const raw = await promptOneLine(interaction, { prompt: "Digite o @ (ou ID) do membro para expulsar.", timeMs: 60000 });
                        if (!raw) return i.reply({ content: "⏳ Tempo esgotado.", ephemeral: true });
                        const targetId = parseUserId(raw);
                        if (!targetId) return i.reply({ content: "❌ Usuário inválido.", ephemeral: true });
                        if (targetId === interaction.user.id) return i.reply({ content: "❌ Você não pode expulsar você mesmo.", ephemeral: true });
                        if (!(f.members || []).some((m) => m.userId === targetId)) return i.reply({ content: "❌ Essa pessoa não é membro da facção.", ephemeral: true });

                        f.members = (f.members || []).filter((m) => m.userId !== targetId);
                        await f.save().catch(() => {});
                        await client.blackMarketUserdb.updateOne({ guildID: interaction.guildId, userID: targetId }, { $set: { "faction.factionId": null, "faction.joinedAt": 0 } }).catch(() => {});
                        return i.reply({ content: `✅ <@${targetId}> foi expulso da facção.`, ephemeral: true });
                    }

                    if (action === "deletar") {
                        const { user } = await getMyFaction(client, interaction.guildId, interaction.user.id);
                        const myFactionId = user.faction?.factionId || null;
                        if (!myFactionId) return i.reply({ content: "❌ Você não está em facção.", ephemeral: true });
                        const f = await client.factiondb.findOne({ guildID: interaction.guildId, factionId: myFactionId });
                        if (!f) return i.reply({ content: "❌ Facção não encontrada.", ephemeral: true });
                        if (f.leaderId !== interaction.user.id && !isAdmin(interaction)) return i.reply({ content: "❌ Apenas líder/admin pode deletar.", ephemeral: true });

                        const confirm = await promptOneLine(interaction, { prompt: `Digite **DELETAR ${f.factionId}** para confirmar.`, timeMs: 60000 });
                        if (!confirm) return i.reply({ content: "⏳ Tempo esgotado.", ephemeral: true });
                        if (confirm.trim() !== `DELETAR ${f.factionId}`) return i.reply({ content: "❌ Confirmação inválida.", ephemeral: true });

                        await client.factiondb.deleteOne({ guildID: interaction.guildId, factionId: f.factionId }).catch(() => {});
                        await client.blackMarketUserdb.updateMany({ guildID: interaction.guildId, "faction.factionId": f.factionId }, { $set: { "faction.factionId": null, "faction.joinedAt": 0 } }).catch(() => {});
                        return i.reply({ content: "✅ Facção deletada.", ephemeral: true });
                    }
                } catch (err) {
                    console.error(err);
                    i.reply({ content: "Erro ao executar ação de facção.", ephemeral: true }).catch(() => {});
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

