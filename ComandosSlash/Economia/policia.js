const Discord = require("discord.js");
const { getPolice, isChief } = require("../../Utils/police");

function embed(color, title, desc) {
    return new Discord.MessageEmbed().setColor(color).setTitle(title).setDescription(desc);
}

function canManage(interaction, police) {
    const isAdmin = interaction.member.permissions.has("MANAGE_GUILD");
    return isAdmin || isChief(police, interaction.user.id);
}

module.exports = {
    name: "policia",
    description: "Sistema de polícia econômica",
    type: "CHAT_INPUT",
    options: [
        {
            name: "definir_chefe",
            description: "Define o chefe de polícia (admin)",
            type: "SUB_COMMAND",
            options: [{ name: "usuario", description: "Chefe", type: "USER", required: true }],
        },
        {
            name: "candidatar",
            description: "Envia candidatura para polícia",
            type: "SUB_COMMAND",
            options: [{ name: "motivo", description: "Por que você quer ser polícia?", type: "STRING", required: false }],
        },
        {
            name: "pedidos",
            description: "Vê pedidos pendentes (chefe/admin)",
            type: "SUB_COMMAND",
        },
        {
            name: "aceitar",
            description: "Aceita candidatura (chefe/admin)",
            type: "SUB_COMMAND",
            options: [{ name: "usuario", description: "Candidato", type: "USER", required: true }],
        },
        {
            name: "recusar",
            description: "Recusa candidatura (chefe/admin)",
            type: "SUB_COMMAND",
            options: [{ name: "usuario", description: "Candidato", type: "USER", required: true }],
        },
        {
            name: "remover",
            description: "Remove policial (chefe/admin)",
            type: "SUB_COMMAND",
            options: [{ name: "usuario", description: "Policial", type: "USER", required: true }],
        },
        {
            name: "status",
            description: "Mostra status da polícia",
            type: "SUB_COMMAND",
            options: [{ name: "usuario", description: "Usuário", type: "USER", required: false }],
        },
    ],
    run: async (client, interaction) => {
        try {
            const sub = interaction.options.getSubcommand();
            const police = await getPolice(client, interaction.guildId);
            if (!police) return interaction.reply({ content: "Erro: policia db não disponível.", ephemeral: true });

            if (sub === "definir_chefe") {
                const isAdmin = interaction.member.permissions.has("MANAGE_GUILD");
                if (!isAdmin) return interaction.reply({ embeds: [embed("RED", "❌ Sem permissão", "Apenas admin pode definir o chefe.")], ephemeral: true });
                const u = interaction.options.getUser("usuario");
                if (u.bot) return interaction.reply({ embeds: [embed("RED", "❌ Inválido", "Não pode definir bot como chefe.")], ephemeral: true });
                police.chiefId = u.id;
                if (!Array.isArray(police.officers)) police.officers = [];
                if (!police.officers.includes(u.id)) police.officers.push(u.id);
                await police.save();
                return interaction.reply({ embeds: [embed("GREEN", "👮 Chefe definido", `Chefe de polícia: ${u}`)] });
            }

            if (sub === "status") {
                const u = interaction.options.getUser("usuario") || interaction.user;
                const role = police.chiefId === u.id ? "Chefe" : (police.officers || []).includes(u.id) ? "Polícia" : "Civil";
                const pending = (police.requests || []).some((r) => r.userId === u.id && r.status === "pending");
                const embedObj = new Discord.MessageEmbed()
                    .setTitle("👮 Polícia Econômica")
                    .setColor("BLURPLE")
                    .setDescription(`${u}\nCargo: **${role}**${pending ? "\n🕓 Pedido pendente." : ""}`)
                    .addFields(
                        { name: "Chefe", value: police.chiefId ? `<@${police.chiefId}>` : "-", inline: true },
                        { name: "Policiais", value: String((police.officers || []).length), inline: true }
                    );
                return interaction.reply({ embeds: [embedObj], ephemeral: u.id !== interaction.user.id });
            }

            if (sub === "candidatar") {
                if (!police.chiefId) {
                    return interaction.reply({ embeds: [embed("YELLOW", "⚠️ Sem chefe", "Ainda não há chefe de polícia. Um admin deve usar `/policia definir_chefe`." )], ephemeral: true });
                }
                if ((police.officers || []).includes(interaction.user.id)) {
                    return interaction.reply({ embeds: [embed("YELLOW", "✅ Você já é polícia", "Você já possui acesso ao /investigar.")], ephemeral: true });
                }
                const exists = (police.requests || []).some((r) => r.userId === interaction.user.id && r.status === "pending");
                if (exists) return interaction.reply({ embeds: [embed("YELLOW", "🕓 Já enviado", "Você já tem um pedido pendente.")], ephemeral: true });

                const reason = (interaction.options.getString("motivo") || "").slice(0, 200);
                police.requests.push({ at: Date.now(), userId: interaction.user.id, reason, status: "pending", decidedAt: 0, decidedBy: null });
                police.requests = police.requests.slice(-50);
                await police.save();

                return interaction.reply({
                    embeds: [embed("GREEN", "📨 Pedido enviado", `Seu pedido foi enviado para o chefe: <@${police.chiefId}>.`)],
                    ephemeral: true,
                });
            }

            if (sub === "pedidos") {
                if (!canManage(interaction, police)) {
                    return interaction.reply({ embeds: [embed("RED", "❌ Sem permissão", "Apenas chefe/admin pode ver pedidos.")], ephemeral: true });
                }

                const pendings = (police.requests || []).filter((r) => r.status === "pending").slice(-10).reverse();
                const lines = pendings.map((r) => {
                    const why = r.reason ? ` — ${r.reason}` : "";
                    return `• <@${r.userId}> <t:${Math.floor((r.at || 0) / 1000)}:R>${why}`;
                });
                const e = new Discord.MessageEmbed()
                    .setTitle("📥 Pedidos de Polícia")
                    .setColor("BLURPLE")
                    .setDescription(lines.length ? lines.join("\n") : "Nenhum pedido pendente.")
                    .setFooter({ text: "Use /policia aceitar ou /policia recusar" });
                return interaction.reply({ embeds: [e], ephemeral: true });
            }

            if (sub === "aceitar" || sub === "recusar") {
                if (!canManage(interaction, police)) {
                    return interaction.reply({ embeds: [embed("RED", "❌ Sem permissão", "Apenas chefe/admin pode decidir.")], ephemeral: true });
                }
                const u = interaction.options.getUser("usuario");
                const req = (police.requests || []).slice().reverse().find((r) => r.userId === u.id && r.status === "pending");
                if (!req) return interaction.reply({ embeds: [embed("YELLOW", "⚠️ Sem pedido", "Não há pedido pendente desse usuário.")], ephemeral: true });
                req.status = sub === "aceitar" ? "accepted" : "rejected";
                req.decidedAt = Date.now();
                req.decidedBy = interaction.user.id;
                if (sub === "aceitar") {
                    if (!Array.isArray(police.officers)) police.officers = [];
                    if (!police.officers.includes(u.id)) police.officers.push(u.id);
                }
                await police.save();
                return interaction.reply({ embeds: [embed("GREEN", "✅ Decisão registrada", `${u} foi ${sub === "aceitar" ? "aceito" : "recusado"}.`)] });
            }

            if (sub === "remover") {
                if (!canManage(interaction, police)) {
                    return interaction.reply({ embeds: [embed("RED", "❌ Sem permissão", "Apenas chefe/admin pode remover.")], ephemeral: true });
                }
                const u = interaction.options.getUser("usuario");
                police.officers = (police.officers || []).filter((id) => id !== u.id);
                if (police.chiefId === u.id) police.chiefId = null;
                await police.save();
                return interaction.reply({ embeds: [embed("GREEN", "👮 Removido", `${u} não faz mais parte da polícia.`)] });
            }

        } catch (err) {
            console.error(err);
            if (interaction.deferred || interaction.replied) {
                interaction.editReply({ content: "Erro na polícia.", embeds: [], components: [] }).catch(() => {});
            } else {
                interaction.reply({ content: "Erro na polícia.", ephemeral: true }).catch(() => {});
            }
        }
    }
};

