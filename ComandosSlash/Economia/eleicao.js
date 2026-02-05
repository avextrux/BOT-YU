const Discord = require("discord.js");
const { formatMoney, debitWalletIfEnough } = require("../../Utils/economy");
const logger = require("../../Utils/logger");
const { replyOrEdit } = require("../../Utils/commandKit");
const { applyWDAFooter } = require("../../Utils/embeds");
const { 
    getVoteCount, setVoteCount, deleteVote, getTotalVotes, getSortedResults, 
    getVotePrice, ensureElectionDefaults 
} = require("../../Utils/electionEngine");

function isAdminMember(interaction) {
    return (
        interaction.member?.permissions?.has("ADMINISTRATOR") ||
        interaction.member?.permissions?.has("MANAGE_GUILD")
    );
}

async function safe(promise) {
    try {
        return await promise;
    } catch (e) {
        if (e?.code === 10062 || e?.code === 40060) return null;
        throw e;
    }
}

module.exports = {
    name: "eleicao",
    description: "Hub de Eleições e Política (Votar, Candidatar, Comprar Voto)",
    type: "CHAT_INPUT",
    autoDefer: { ephemeral: true },
    hubActions: [
        "Status & Placar — ver quem está ganhando",
        "Candidatar-se — entrar na disputa",
        "Votar — 1 voto gratuito",
        "Comprar votos — via modal (dinheiro do bot)",
        "Retirar candidatura — desistir",
        "Regras — guia rápido",
        "Admin: Gerenciar — iniciar/encerrar e toggle voteshop",
    ],
    run: async (client, interaction) => {
        try {
            const eco = await client.guildEconomydb.getOrCreate(interaction.guildId);
            if (!eco.policy) eco.policy = {};
            ensureElectionDefaults(eco);

            // Menu Principal
            const menu = new Discord.MessageSelectMenu()
                .setCustomId("eleicao_hub_menu")
                .setPlaceholder("Selecione uma ação eleitoral...")
                .addOptions([
                    { label: "Status & Placar", value: "status", description: "Veja quem está ganhando", emoji: "📊" },
                    { label: "Candidatar-se", value: "candidatar", description: "Entre na disputa presidencial", emoji: "🙋" },
                    { label: "Votar", value: "votar", description: "Escolha seu candidato (grátis)", emoji: "🗳️" },
                    { label: "Comprar Votos", value: "comprar", description: "Use dinheiro para impulsionar", emoji: "💸" },
                    { label: "Retirar Candidatura", value: "sair", description: "Desistir da eleição", emoji: "🏃" },
                    { label: "Regras", value: "regras", description: "Como funciona a democracia aqui", emoji: "📜" },
                    { label: "Admin: Gerenciar", value: "admin_panel", description: "Iniciar/Encerrar/Configurar", emoji: "⚙️" },
                ]);

            const row = new Discord.MessageActionRow().addComponents(menu);

            const active = eco.election.active && Date.now() <= (eco.election.endsAt || 0);
            const candidatesCount = (eco.election.candidates || []).length;
            const votersCount = (eco.election.voters || []).length;

            const embed = new Discord.MessageEmbed()
                .setTitle("🗳️ Central de Eleições")
                .setColor("GOLD")
                .setDescription(active 
                    ? `✅ **Eleição em andamento!**\nTermina <t:${Math.floor((eco.election.endsAt||0)/1000)}:R>.\n\nUse o menu abaixo para votar ou se candidatar.`
                    : "⛔ **Nenhuma eleição ativa no momento.**\nFique atento aos anúncios ou consulte o placar da última edição.")
                .addFields(
                    { name: "Candidatos", value: `${candidatesCount}`, inline: true },
                    { name: "Votos Computados", value: `${votersCount}`, inline: true },
                    { name: "Compra de Votos", value: eco.election.voteShop?.enabled ? "✅ Ativa" : "❌ Desativada", inline: true }
                )
                .setThumbnail("https://cdn-icons-png.flaticon.com/512/927/927253.png");
            applyWDAFooter(embed);

            await replyOrEdit(interaction, { embeds: [embed], components: [row], ephemeral: true });
            const msg = await interaction.fetchReply();

            const collector = msg.createMessageComponentCollector({ componentType: Discord.ComponentType?.StringSelect || "SELECT_MENU", idle: 10 * 60 * 1000 });

            collector.on('collect', async i => {
                if (i.user.id !== interaction.user.id) return safe(i.reply({ content: "Menu pessoal.", ephemeral: true }));
                
                // Refresh DB
                const freshEco = await client.guildEconomydb.getOrCreate(interaction.guildId);
                ensureElectionDefaults(freshEco);
                const isActive = freshEco.election.active && Date.now() <= (freshEco.election.endsAt || 0);

                if (i.customId === "eleicao_admin_select") {
                    await safe(i.deferUpdate());
                    const adminAction = i.values[0];
                    if (!isAdminMember(interaction)) return safe(i.followUp({ content: "❌ Sem permissão.", ephemeral: true }));

                    if (adminAction === "back") {
                        return safe(i.editReply({ content: null, embeds: [embed], components: [row] }));
                    }

                    if (adminAction === "start") {
                        freshEco.election.active = true;
                        freshEco.election.endsAt = Date.now() + 14 * 24 * 60 * 60 * 1000; // 2 semanas
                        freshEco.election.candidates = [];
                        freshEco.election.votes = new Map();
                        freshEco.election.paidVotes = new Map();
                        freshEco.election.voters = [];
                        await freshEco.save();
                        return safe(i.followUp({ content: "✅ Eleição iniciada (2 semanas).", ephemeral: true }));
                    }

                    if (adminAction === "end") {
                        freshEco.election.active = false;
                        await freshEco.save();
                        return safe(i.followUp({ content: "✅ Eleição encerrada manualmente.", ephemeral: true }));
                    }

                    if (adminAction === "toggle_shop") {
                        freshEco.election.voteShop.enabled = !freshEco.election.voteShop.enabled;
                        await freshEco.save();
                        return safe(i.followUp({ content: `✅ Compra de votos: ${freshEco.election.voteShop.enabled ? "ATIVADA" : "DESATIVADA"}.`, ephemeral: true }));
                    }
                    return;
                }

                if (i.customId === "eleicao_hub_menu") {
                    const action = i.values[0];
                    if (action === "comprar") {
                        if (!isActive) return safe(i.reply({ content: "❌ Não há eleição ativa.", ephemeral: true }));
                        const shop = freshEco.election.voteShop || {};
                        if (!shop.enabled) return safe(i.reply({ content: "❌ Compra de votos desativada.", ephemeral: true }));

                        const modal = new Discord.Modal()
                            .setCustomId('eleicao_buy_modal')
                            .setTitle('Compra de Votos');

                        const inputId = new Discord.TextInputComponent()
                            .setCustomId('target_id')
                            .setLabel("ID do Candidato")
                            .setStyle('SHORT')
                            .setRequired(true);

                        const inputQty = new Discord.TextInputComponent()
                            .setCustomId('quantity')
                            .setLabel("Quantidade de Votos")
                            .setStyle('SHORT')
                            .setPlaceholder("Ex: 10")
                            .setRequired(true);

                        const r1 = new Discord.MessageActionRow().addComponents(inputId);
                        const r2 = new Discord.MessageActionRow().addComponents(inputQty);
                        modal.addComponents(r1, r2);

                        await safe(i.showModal(modal));
                        return;
                    }

                    await safe(i.deferUpdate());

                    if (action === "status") {
                        const results = getSortedResults(freshEco.election);
                        const top = results.slice(0, 10);
                        const lines = top.length
                            ? top.map((r, idx) => `**${idx + 1}.** <@${r.id}> — **${r.votes}** votos (${r.paid} pagos)`).join("\n")
                            : "Nenhum voto ainda.";
                        
                        const e = new Discord.MessageEmbed()
                            .setTitle("📊 Placar da Eleição")
                            .setColor("BLURPLE")
                            .setDescription(isActive ? `Termina <t:${Math.floor((freshEco.election.endsAt||0)/1000)}:R>` : "Eleição encerrada.")
                            .addField("Ranking Top 10", lines);
                        
                        return safe(i.editReply({ embeds: [e], components: [row] }));
                    }

                    if (action === "regras") {
                        const e = new Discord.MessageEmbed()
                            .setTitle("📜 Regras Eleitorais")
                            .setColor("WHITE")
                            .setDescription(
                                "1. Cada cidadão tem direito a **1 voto gratuito**.\n" +
                                "2. É permitido **comprar votos** adicionais para qualquer candidato.\n" +
                                "3. O vencedor se torna Presidente Econômico e controla impostos.\n" +
                                "4. Assédio ou spam de campanha resultam em desclassificação."
                            );
                        return safe(i.editReply({ embeds: [e], components: [row] }));
                    }

                    if (action === "candidatar") {
                        if (!isActive) return safe(i.followUp({ content: "❌ Não há eleição ativa.", ephemeral: true }));
                        if (freshEco.election.candidates.includes(i.user.id)) return safe(i.followUp({ content: "⚠️ Você já é candidato.", ephemeral: true }));
                        
                        freshEco.election.candidates.push(i.user.id);
                        await freshEco.save();
                        return safe(i.followUp({ content: "✅ **Parabéns!** Você agora é um candidato oficial.", ephemeral: true }));
                    }

                    if (action === "sair") {
                        if (!freshEco.election.candidates.includes(i.user.id)) return safe(i.followUp({ content: "❌ Você não é candidato.", ephemeral: true }));
                        
                        freshEco.election.candidates = freshEco.election.candidates.filter(id => id !== i.user.id);
                        deleteVote(freshEco.election.votes, i.user.id);
                        deleteVote(freshEco.election.paidVotes, i.user.id);
                        await freshEco.save();
                        return safe(i.followUp({ content: "🏳️ Você retirou sua candidatura.", ephemeral: true }));
                    }

                    if (action === "votar") {
                        if (!isActive) return safe(i.followUp({ content: "❌ Não há eleição ativa.", ephemeral: true }));
                        if (freshEco.election.voters.includes(i.user.id)) return safe(i.followUp({ content: "❌ Você já gastou seu voto gratuito.", ephemeral: true }));

                        const candidates = freshEco.election.candidates || [];
                        if (candidates.length === 0) return safe(i.followUp({ content: "❌ Não há candidatos.", ephemeral: true }));

                        const options = await Promise.all(candidates.slice(0, 25).map(async id => {
                            const user = await client.users.fetch(id).catch(() => null);
                            return {
                                label: user ? user.username : `ID: ${id}`,
                                value: id,
                                description: "Votar neste candidato",
                                emoji: "👤"
                            };
                        }));

                        const voteRow = new Discord.MessageActionRow().addComponents(
                            new Discord.MessageSelectMenu()
                                .setCustomId("eleicao_vote_select")
                                .setPlaceholder("Escolha seu candidato...")
                                .addOptions(options)
                        );

                        const reply = await safe(i.followUp({ content: "Selecione o candidato para seu VOTO ÚNICO:", components: [voteRow], ephemeral: true, fetchReply: true }));
                        if (!reply) return;
                        
                        const filter = x => x.user.id === i.user.id && x.customId === "eleicao_vote_select";
                        const collectorVote = reply.createMessageComponentCollector({ max: 1, time: 60000 });
                        
                        collectorVote.on('collect', async voteI => {
                            await safe(voteI.deferUpdate());
                            const targetId = voteI.values[0];
                            const eco2 = await client.guildEconomydb.getOrCreate(interaction.guildId);
                            ensureElectionDefaults(eco2);
                            if (eco2.election.voters.includes(i.user.id)) return safe(voteI.followUp({ content: "Já votou.", ephemeral: true }));
                            
                            eco2.election.voters.push(i.user.id);
                            const cur = getVoteCount(eco2.election.votes, targetId);
                            setVoteCount(eco2.election.votes, targetId, cur + 1);
                            await eco2.save();
                            
                            await safe(voteI.editReply({ content: `✅ Voto computado para <@${targetId}>!`, components: [] }));
                        });
                        return;
                    }

                    if (action === "admin_panel") {
                        if (!isAdminMember(interaction)) return safe(i.followUp({ content: "❌ Sem permissão.", ephemeral: true }));
                        
                        const adminRow = new Discord.MessageActionRow().addComponents(
                            new Discord.MessageSelectMenu()
                                .setCustomId("eleicao_admin_select")
                                .setPlaceholder("Ação de Admin...")
                                .addOptions([
                                    { label: "Iniciar Eleição (2 semanas)", value: "start", emoji: "▶️" },
                                    { label: "Encerrar Agora", value: "end", emoji: "⏹️" },
                                    { label: "Alternar Compra de Votos", value: "toggle_shop", emoji: "💰" },
                                    { label: "Voltar", value: "back", emoji: "🔙" }
                                ])
                        );
                        
                        return safe(i.editReply({ content: "**Painel Admin**", embeds: [], components: [adminRow] }));
                    }
                }
            });

        } catch (err) {
            logger.error("Erro no hub de eleições", { error: String(err?.message || err) });
            replyOrEdit(interaction, { content: "Erro no hub de eleições.", embeds: [], components: [], ephemeral: true }).catch(() => {});
        }
    }
};
