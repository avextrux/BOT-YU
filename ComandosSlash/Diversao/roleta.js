const Discord = require("discord.js");
const { ensureEconomyAllowed } = require("../../Utils/economyGuard");
const logger = require("../../Utils/logger");
const { replyOrEdit } = require("../../Utils/commandKit");

module.exports = {
    name: "roleta",
    description: "Aposte na roleta (Vermelho, Preto ou Verde)",
    type: 'CHAT_INPUT',
    autoDefer: { ephemeral: true },
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
            const gate = await ensureEconomyAllowed(client, interaction, interaction.user.id);
            if (!gate.ok) return replyOrEdit(interaction, { embeds: [gate.embed], ephemeral: true });
            const aposta = Math.floor(interaction.options.getNumber("aposta"));
            const corEscolhida = interaction.options.getString("cor");

            if (aposta <= 0) return replyOrEdit(interaction, { content: "❌ Aposta inválida.", ephemeral: true });

            const userdb = await client.userdb.getOrCreate(interaction.user.id);
            if (userdb.economia.money < aposta) return replyOrEdit(interaction, { content: "❌ Dinheiro insuficiente.", ephemeral: true });

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
            return replyOrEdit(interaction, { embeds: [embed], ephemeral: true });

        } catch (err) {
            logger.error("Erro na roleta", { error: String(err?.message || err) });
            replyOrEdit(interaction, { content: "Erro na roleta.", ephemeral: true }).catch(() => {});
        }
    }
};
