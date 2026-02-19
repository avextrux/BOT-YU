const { EmbedBuilder } = require("discord.js");
const { ensureEconomyAllowed } = require("../../Utils/economyGuard");
const logger = require("../../Utils/logger");
const { replyOrEdit } = require("../../Utils/commandKit");

module.exports = {
    name: "moeda",
    description: "Jogue cara ou coroa e aposte seu dinheiro!",
    type: 1, // CHAT_INPUT
    autoDefer: { ephemeral: true },
    options: [
        {
            name: "escolha",
            description: "Escolha Cara ou Coroa",
            type: 3, // STRING
            required: true,
            choices: [
                { name: "Cara", value: "cara" },
                { name: "Coroa", value: "coroa" }
            ]
        },
        {
            name: "aposta",
            description: "Valor para apostar (opcional)",
            type: 10, // NUMBER
            required: false
        }
    ],
    run: async (client, interaction) => {
        try {
            await interaction.deferReply({ ephemeral: true }).catch(() => {});

            const escolha = interaction.options.getString("escolha");
            const aposta = Math.floor(interaction.options.getNumber("aposta") || 0);

            let userdb;
            
            // Se houver aposta, verifica saldo
            if (aposta > 0) {
                const gate = await ensureEconomyAllowed(client, interaction, interaction.user.id);
                if (!gate.ok) return replyOrEdit(interaction, { embeds: [gate.embed], ephemeral: true });
                userdb = await client.userdb.getOrCreate(interaction.user.id);
                
                if (userdb.economia.money < aposta) {
                    return replyOrEdit(interaction, { 
                        embeds: [new EmbedBuilder().setColor("Red").setDescription(`❌ Você não tem **R$ ${aposta}** na carteira para apostar.`)], 
                        ephemeral: true 
                    });
                }
            }

            const resultado = Math.random() < 0.5 ? "cara" : "coroa";
            const ganhou = escolha === resultado;

            const embed = new EmbedBuilder()
                .setTitle("🪙 Cara ou Coroa")
                .setThumbnail(resultado === "cara" ? "https://i.imgur.com/8QeJ7Hk.png" : "https://i.imgur.com/Hu3w8Wp.png") // Imagens genéricas de moeda
                .addFields(
                    { name: "Sua Escolha", value: capitalize(escolha), inline: true },
                    { name: "Resultado", value: capitalize(resultado), inline: true }
                );

            if (aposta > 0) {
                if (ganhou) {
                    userdb.economia.money += aposta;
                    embed.setColor("Green");
                    embed.setDescription(`🎉 **Parabéns!** Você ganhou **R$ ${aposta}**!`);
                } else {
                    userdb.economia.money -= aposta;
                    embed.setColor("Red");
                    embed.setDescription(`😢 **Que pena!** Você perdeu **R$ ${aposta}**.`);
                }
                await userdb.save();
            } else {
                embed.setColor(ganhou ? "Green" : "Red");
                embed.setDescription(ganhou ? "🎉 Você acertou!" : "😢 Você errou!");
                embed.setFooter({ text: "Use /moeda [escolha] [aposta] para valer dinheiro!" });
            }

            return replyOrEdit(interaction, { embeds: [embed], ephemeral: true });

        } catch (err) {
            logger.error("Erro ao jogar moeda", { error: String(err?.message || err) });
            replyOrEdit(interaction, { content: "Erro ao jogar a moeda.", ephemeral: true }).catch(() => {});
        }
    }
};

function capitalize(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
}
