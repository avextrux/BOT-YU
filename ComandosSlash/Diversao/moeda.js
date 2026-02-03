const Discord = require("discord.js");
const { ensureEconomyAllowed } = require("../../Utils/economyGuard");

module.exports = {
    name: "moeda",
    description: "Jogue cara ou coroa e aposte seu dinheiro!",
    type: 'CHAT_INPUT',
    options: [
        {
            name: "escolha",
            description: "Escolha Cara ou Coroa",
            type: "STRING",
            required: true,
            choices: [
                { name: "Cara", value: "cara" },
                { name: "Coroa", value: "coroa" }
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
            const escolha = interaction.options.getString("escolha");
            const aposta = Math.floor(interaction.options.getNumber("aposta") || 0);

            let userdb;
            
            // Se houver aposta, verifica saldo
            if (aposta > 0) {
                const ok = await ensureEconomyAllowed(client, interaction, interaction.user.id);
                if (!ok) return;
                userdb = await client.userdb.getOrCreate(interaction.user.id);
                
                if (userdb.economia.money < aposta) {
                    return interaction.reply({ 
                        embeds: [new Discord.MessageEmbed().setColor("RED").setDescription(`❌ Você não tem **R$ ${aposta}** na carteira para apostar.`)], 
                        ephemeral: true 
                    });
                }
            }

            const resultado = Math.random() < 0.5 ? "cara" : "coroa";
            const ganhou = escolha === resultado;

            const embed = new Discord.MessageEmbed()
                .setTitle("🪙 Cara ou Coroa")
                .setThumbnail(resultado === "cara" ? "https://i.imgur.com/8QeJ7Hk.png" : "https://i.imgur.com/Hu3w8Wp.png") // Imagens genéricas de moeda
                .addFields(
                    { name: "Sua Escolha", value: capitalize(escolha), inline: true },
                    { name: "Resultado", value: capitalize(resultado), inline: true }
                );

            if (aposta > 0) {
                if (ganhou) {
                    userdb.economia.money += aposta;
                    embed.setColor("GREEN");
                    embed.setDescription(`🎉 **Parabéns!** Você ganhou **R$ ${aposta}**!`);
                } else {
                    userdb.economia.money -= aposta;
                    embed.setColor("RED");
                    embed.setDescription(`😢 **Que pena!** Você perdeu **R$ ${aposta}**.`);
                }
                await userdb.save();
            } else {
                embed.setColor(ganhou ? "GREEN" : "RED");
                embed.setDescription(ganhou ? "🎉 Você acertou!" : "😢 Você errou!");
                embed.setFooter({ text: "Use /moeda [escolha] [aposta] para valer dinheiro!" });
            }

            interaction.reply({ embeds: [embed] });

        } catch (err) {
            console.error(err);
            interaction.reply({ content: "Erro ao jogar a moeda.", ephemeral: true });
        }
    }
};

function capitalize(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
}
