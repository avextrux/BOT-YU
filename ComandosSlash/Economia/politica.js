const Discord = require("discord.js");
const { formatMoney } = require("../../Utils/economy");

module.exports = {
    name: "politica",
    description: "Política econômica do servidor",
    type: "CHAT_INPUT",
    options: [
        {
            name: "status",
            description: "Mostra a política atual",
            type: "SUB_COMMAND",
        },
        {
            name: "set",
            description: "Ajusta impostos e bônus (presidente/admin)",
            type: "SUB_COMMAND",
            options: [
                { name: "imposto", description: "0 a 0.25", type: "NUMBER", required: false },
                { name: "salario_minimo", description: "Bônus fixo no /work", type: "NUMBER", required: false },
                { name: "subsidio_daily", description: "Bônus fixo no /daily", type: "NUMBER", required: false },
            ],
        },
    ],
    run: async (client, interaction) => {
        try {
            const sub = interaction.options.getSubcommand();
            const eco = await client.guildEconomydb.getOrCreate(interaction.guildId);
            if (!eco.policy) eco.policy = {};
            if (!eco.crisis) eco.crisis = {};

            if (sub === "status") {
                const pres = eco.policy.presidentId ? `<@${eco.policy.presidentId}>` : "-";
                const crisisText = eco.crisis.active
                    ? `✅ ${eco.crisis.type || "evento"} até <t:${Math.floor((eco.crisis.endsAt || 0) / 1000)}:R> (x${(eco.crisis.multiplier || 1).toFixed(2)})`
                    : "-";

                const embed = new Discord.MessageEmbed()
                    .setTitle("📊 Política Econômica")
                    .setColor("BLURPLE")
                    .addFields(
                        { name: "Presidente", value: pres, inline: true },
                        { name: "Imposto", value: `${Math.floor((eco.policy.taxRate || 0) * 100)}%`, inline: true },
                        { name: "Tesouro", value: formatMoney(eco.policy.treasury || 0), inline: true },
                        { name: "Salário mínimo", value: formatMoney(eco.policy.minWageBonus || 0), inline: true },
                        { name: "Subsídio daily", value: formatMoney(eco.policy.dailySubsidy || 0), inline: true },
                        { name: "Crise/Evento", value: crisisText, inline: false },
                    );

                return interaction.reply({ embeds: [embed] });
            }

            const isAdmin = interaction.member.permissions.has("MANAGE_GUILD");
            const isPresident = eco.policy.presidentId && eco.policy.presidentId === interaction.user.id;
            if (!isAdmin && !isPresident) {
                return interaction.reply({ content: "❌ Apenas o presidente ou admin pode alterar a política.", ephemeral: true });
            }

            const tax = interaction.options.getNumber("imposto");
            const minWage = interaction.options.getNumber("salario_minimo");
            const dailySub = interaction.options.getNumber("subsidio_daily");

            if (tax !== null && tax !== undefined) eco.policy.taxRate = Math.max(0, Math.min(0.25, tax));
            if (minWage !== null && minWage !== undefined) eco.policy.minWageBonus = Math.max(0, Math.floor(minWage));
            if (dailySub !== null && dailySub !== undefined) eco.policy.dailySubsidy = Math.max(0, Math.floor(dailySub));

            await eco.save();

            return interaction.reply({ content: "✅ Política atualizada. Use `/politica status`." });
        } catch (err) {
            console.error(err);
            interaction.reply({ content: "Erro na política.", ephemeral: true }).catch(() => {});
        }
    }
};

