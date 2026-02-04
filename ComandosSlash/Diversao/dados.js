const Discord = require("discord.js");
const { ensureEconomyAllowed } = require("../../Utils/economyGuard");
const logger = require("../../Utils/logger");
const { replyOrEdit } = require("../../Utils/commandKit");

module.exports = {
    name: "dados",
    description: "Role os dados (com ou sem aposta)",
    type: 'CHAT_INPUT',
    autoDefer: { ephemeral: true },
    options: [
        {
            name: "lados",
            description: "Quantidade de lados do dado",
            type: "INTEGER",
            required: false,
            choices: [
                { name: "d6", value: 6 },
                { name: "d20", value: 20 },
                { name: "d100", value: 100 }
            ]
        },
        {
            name: "aposta",
            description: "Valor para apostar (opcional)",
            type: "NUMBER",
            required: false
        }
    ],
    run: async (client, interaction) => {
        try {
            const lados = interaction.options.getInteger("lados") || 6;
            const aposta = Math.floor(interaction.options.getNumber("aposta") || 0);
            if (aposta > 0) {
                const gate = await ensureEconomyAllowed(client, interaction, interaction.user.id);
                if (!gate.ok) return replyOrEdit(interaction, { embeds: [gate.embed], ephemeral: true });
            }

            let userdb;
            if (aposta > 0) {
                userdb = await client.userdb.getOrCreate(interaction.user.id);
                if ((userdb.economia.money || 0) < aposta) {
                    return replyOrEdit(interaction, { content: "❌ Dinheiro insuficiente.", ephemeral: true });
                }
            }

            const resultado = Math.floor(Math.random() * lados) + 1;

            const embed = new Discord.MessageEmbed()
                .setTitle("🎲 Dados")
                .setColor("BLURPLE")
                .setDescription(`Você rolou **d${lados}** e tirou **${resultado}**.`);

            if (aposta > 0) {
                const ganhou = resultado === lados;
                const multiplicador = lados === 6 ? 3 : lados === 20 ? 10 : 25;
                if (ganhou) {
                    const premio = aposta * multiplicador;
                    userdb.economia.money += (premio - aposta);
                    embed.setColor("GREEN");
                    embed.addFields({ name: "Resultado", value: `🎉 Saiu **${resultado}**! Você ganhou **R$ ${premio}** (${multiplicador}x).` });
                } else {
                    userdb.economia.money -= aposta;
                    embed.setColor("RED");
                    embed.addFields({ name: "Resultado", value: `💸 Você perdeu **R$ ${aposta}**. Para ganhar, precisa tirar **${lados}**.` });
                }
                await userdb.save();
            }

            return replyOrEdit(interaction, { embeds: [embed], ephemeral: true });
        } catch (err) {
            logger.error("Erro ao rolar dados", { error: String(err?.message || err) });
            replyOrEdit(interaction, { content: "Erro ao rolar dados.", ephemeral: true }).catch(() => {});
        }
    }
};
