const Discord = require("discord.js");

const TYPES = {
    recessao: { name: "Recessão", multiplier: 0.7 },
    boom: { name: "Boom econômico", multiplier: 1.3 },
    inflacao: { name: "Inflação", multiplier: 1.0 },
    blackout: { name: "Blackout", multiplier: 0.0 },
};

module.exports = {
    name: "crise",
    description: "Eventos globais que afetam o servidor",
    type: "CHAT_INPUT",
    options: [
        { name: "status", description: "Mostra crise ativa", type: "SUB_COMMAND" },
        {
            name: "iniciar",
            description: "Inicia uma crise (admin)",
            type: "SUB_COMMAND",
            options: [
                {
                    name: "tipo",
                    description: "Tipo de crise",
                    type: "STRING",
                    required: true,
                    choices: [
                        { name: "Recessão", value: "recessao" },
                        { name: "Boom econômico", value: "boom" },
                        { name: "Inflação", value: "inflacao" },
                        { name: "Blackout", value: "blackout" },
                    ],
                },
                { name: "duracao_horas", description: "Duração em horas", type: "NUMBER", required: true },
            ],
        },
        { name: "encerrar", description: "Encerra crise (admin)", type: "SUB_COMMAND" },
    ],
    run: async (client, interaction) => {
        try {
            const sub = interaction.options.getSubcommand();
            const eco = await client.guildEconomydb.getOrCreate(interaction.guildId);
            if (!eco.crisis) eco.crisis = {};

            if (sub === "status") {
                const embed = new Discord.MessageEmbed()
                    .setTitle("🌍 Crises Globais")
                    .setColor("DARK_BUT_NOT_BLACK")
                    .setDescription(
                        eco.crisis.active
                            ? `✅ **${eco.crisis.type || "evento"}** até <t:${Math.floor((eco.crisis.endsAt || 0) / 1000)}:R>\nMultiplicador: **x${(eco.crisis.multiplier || 1).toFixed(2)}**`
                            : "- Nenhuma crise ativa."
                    );
                return interaction.reply({ embeds: [embed] });
            }

            const isAdmin = interaction.member.permissions.has("MANAGE_GUILD");
            if (!isAdmin) return interaction.reply({ content: "❌ Apenas admin pode gerenciar crises.", ephemeral: true });

            if (sub === "encerrar") {
                eco.crisis.active = false;
                eco.crisis.type = null;
                eco.crisis.endsAt = 0;
                eco.crisis.multiplier = 1.0;
                eco.crisis.blackoutUntil = 0;
                await eco.save();
                return interaction.reply({ content: "✅ Crise encerrada." });
            }

            const type = interaction.options.getString("tipo");
            const hours = Math.floor(interaction.options.getNumber("duracao_horas"));
            if (!TYPES[type]) return interaction.reply({ content: "❌ Tipo inválido.", ephemeral: true });
            if (!Number.isFinite(hours) || hours <= 0 || hours > 72) return interaction.reply({ content: "❌ Duração inválida (1 a 72h).", ephemeral: true });

            const now = Date.now();
            eco.crisis.active = true;
            eco.crisis.type = TYPES[type].name;
            eco.crisis.endsAt = now + hours * 60 * 60 * 1000;
            eco.crisis.multiplier = TYPES[type].multiplier;
            eco.crisis.blackoutUntil = type === "blackout" ? eco.crisis.endsAt : 0;
            await eco.save();

            return interaction.reply({ content: `✅ Crise iniciada: **${TYPES[type].name}** por **${hours}h**.` });
        } catch (err) {
            console.error(err);
            interaction.reply({ content: "Erro na crise.", ephemeral: true }).catch(() => {});
        }
    }
};

