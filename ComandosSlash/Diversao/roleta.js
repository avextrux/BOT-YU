const Discord = require("discord.js");
const { ensureEconomyAllowed } = require("../../Utils/economyGuard");

module.exports = {
    name: "roleta",
    description: "Aposte na roleta (Vermelho, Preto ou Verde)",
    type: 'CHAT_INPUT',
    options: [
        {
            name: "aposta",
            description: "Valor da aposta",
            type: "NUMBER",
            required: true
        },
        {
            name: "cor",
            description: "Escolha a cor",
            type: "STRING",
            required: true,
            choices: [
                { name: "🔴 Vermelho (2x)", value: "vermelho" },
                { name: "⚫ Preto (2x)", value: "preto" },
                { name: "🟢 Verde (14x)", value: "verde" }
            ]
        }
    ],
    run: async (client, interaction) => {
        try {
            const ok = await ensureEconomyAllowed(client, interaction, interaction.user.id);
            if (!ok) return;
            const aposta = Math.floor(interaction.options.getNumber("aposta"));
            const corEscolhida = interaction.options.getString("cor");

            if (aposta <= 0) return interaction.reply({ content: "❌ Aposta inválida.", ephemeral: true });

            const userdb = await client.userdb.getOrCreate(interaction.user.id);
            if (userdb.economia.money < aposta) return interaction.reply({ content: "❌ Dinheiro insuficiente.", ephemeral: true });

            // Lógica da Roleta
            // 0 (Verde), 1-7 (Vermelho), 8-14 (Preto) -> Simplificado
            // Vamos usar probabilidade: 
            // Verde: 1/15 (~6.6%)
            // Vermelho: 7/15 (~46.6%)
            // Preto: 7/15 (~46.6%)
            
            const random = Math.floor(Math.random() * 15);
            let corResultado = "";
            let emoji = "";

            if (random === 0) {
                corResultado = "verde";
                emoji = "🟢";
            } else if (random % 2 === 0) {
                corResultado = "vermelho"; // Pares (exceto 0)
                emoji = "🔴";
            } else {
                corResultado = "preto"; // Ímpares
                emoji = "⚫";
            }

            const ganhou = corEscolhida === corResultado;
            let multiplicador = 0;
            if (ganhou) {
                if (corResultado === "verde") multiplicador = 14;
                else multiplicador = 2;
            }

            const lucro = (aposta * multiplicador) - aposta;

            const embed = new Discord.MessageEmbed()
                .setTitle("🎰 Roleta")
                .addFields(
                    { name: "Sua Aposta", value: `${aposta} no ${corEscolhida.toUpperCase()}`, inline: true },
                    { name: "Resultado", value: `${emoji} ${corResultado.toUpperCase()}`, inline: true }
                );

            if (ganhou) {
                userdb.economia.money += lucro;
                embed.setColor("GREEN");
                embed.setDescription(`🎉 **VITORIA!** Você ganhou **R$ ${aposta * multiplicador}**!`);
            } else {
                userdb.economia.money -= aposta;
                embed.setColor("RED");
                embed.setDescription(`💸 Você perdeu **R$ ${aposta}**.`);
            }

            await userdb.save();
            interaction.reply({ embeds: [embed] });

        } catch (err) {
            console.error(err);
            interaction.reply({ content: "Erro na roleta.", ephemeral: true });
        }
    }
};
