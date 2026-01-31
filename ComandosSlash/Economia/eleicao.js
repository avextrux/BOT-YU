const Discord = require("discord.js");

module.exports = {
    name: "eleicao",
    description: "Eleições para presidente econômico",
    type: "CHAT_INPUT",
    options: [
        { name: "status", description: "Mostra eleição ativa", type: "SUB_COMMAND" },
        {
            name: "iniciar",
            description: "Inicia eleição (admin)",
            type: "SUB_COMMAND",
            options: [{ name: "duracao_min", description: "Duração em minutos", type: "INTEGER", required: true }],
        },
        { name: "candidatar", description: "Se candidata", type: "SUB_COMMAND" },
        {
            name: "votar",
            description: "Vota em um candidato",
            type: "SUB_COMMAND",
            options: [{ name: "usuario", description: "Candidato", type: "USER", required: true }],
        },
        { name: "encerrar", description: "Encerra eleição (admin)", type: "SUB_COMMAND" },
    ],
    run: async (client, interaction) => {
        try {
            const sub = interaction.options.getSubcommand();
            const eco = await client.guildEconomydb.getOrCreate(interaction.guildId);
            if (!eco.election) eco.election = { active: false, endsAt: 0, candidates: [], votes: {}, voters: [] };
            if (!eco.policy) eco.policy = {};

            if (sub === "status") {
                const candidates = eco.election.candidates || [];
                const embed = new Discord.MessageEmbed()
                    .setTitle("🗳️ Eleição")
                    .setColor("BLURPLE")
                    .setDescription(
                        eco.election.active
                            ? `✅ Eleição ativa até <t:${Math.floor((eco.election.endsAt || 0) / 1000)}:R>`
                            : "- Nenhuma eleição ativa."
                    )
                    .addFields({
                        name: "Candidatos",
                        value: candidates.length ? candidates.map((id) => `<@${id}>`).join("\n") : "-",
                        inline: false,
                    });
                return interaction.reply({ embeds: [embed] });
            }

            if (sub === "iniciar") {
                const isAdmin = interaction.member.permissions.has("MANAGE_GUILD");
                if (!isAdmin) return interaction.reply({ content: "❌ Apenas admin pode iniciar eleição.", ephemeral: true });
                const mins = Math.max(1, Math.min(120, interaction.options.getInteger("duracao_min") || 10));
                eco.election.active = true;
                eco.election.endsAt = Date.now() + mins * 60 * 1000;
                eco.election.candidates = [];
                eco.election.votes = {};
                eco.election.voters = [];
                await eco.save();
                return interaction.reply({ content: `✅ Eleição iniciada por **${mins} min**. Use \/eleicao candidatar e \/eleicao votar.` });
            }

            if (sub === "encerrar") {
                const isAdmin = interaction.member.permissions.has("MANAGE_GUILD");
                if (!isAdmin) return interaction.reply({ content: "❌ Apenas admin pode encerrar eleição.", ephemeral: true });
                eco.election.endsAt = 0;
                eco.election.active = false;
                await eco.save();
                return interaction.reply({ content: "✅ Eleição encerrada. (Se quiser eleger automaticamente, use /eleicao status após o watcher.)" });
            }

            if (!eco.election.active || Date.now() > (eco.election.endsAt || 0)) {
                eco.election.active = false;
                await eco.save().catch(() => {});
                return interaction.reply({ content: "❌ Não há eleição ativa.", ephemeral: true });
            }

            if (sub === "candidatar") {
                if (eco.election.candidates.includes(interaction.user.id)) {
                    return interaction.reply({ content: "❌ Você já é candidato.", ephemeral: true });
                }
                eco.election.candidates.push(interaction.user.id);
                await eco.save();
                return interaction.reply({ content: "✅ Candidatura registrada." });
            }

            if (sub === "votar") {
                const cand = interaction.options.getUser("usuario");
                if (!eco.election.candidates.includes(cand.id)) {
                    return interaction.reply({ content: "❌ Esse usuário não é candidato.", ephemeral: true });
                }
                if (eco.election.voters.includes(interaction.user.id)) {
                    return interaction.reply({ content: "❌ Você já votou nesta eleição.", ephemeral: true });
                }
                eco.election.voters.push(interaction.user.id);
                const current = (eco.election.votes?.get ? eco.election.votes.get(cand.id) : eco.election.votes?.[cand.id]) || 0;
                if (eco.election.votes?.set) eco.election.votes.set(cand.id, current + 1);
                else eco.election.votes[cand.id] = current + 1;
                await eco.save();
                return interaction.reply({ content: `✅ Voto computado em ${cand}.`, ephemeral: true });
            }

        } catch (err) {
            console.error(err);
            interaction.reply({ content: "Erro na eleição.", ephemeral: true }).catch(() => {});
        }
    }
};

