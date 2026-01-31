const Discord = require("discord.js");

module.exports = {
    name: "bicho",
    description: "Jogue no Jogo do Bicho e tente a sorte!",
    type: 'CHAT_INPUT',
    options: [
        {
            name: "aposta",
            description: "Valor da aposta",
            type: "NUMBER",
            required: true
        },
        {
            name: "bicho",
            description: "Escolha o bicho (1-25)",
            type: "INTEGER",
            required: true,
            choices: [
                { name: "01 - Avestruz", value: 1 }, { name: "02 - Águia", value: 2 }, { name: "03 - Burro", value: 3 },
                { name: "04 - Borboleta", value: 4 }, { name: "05 - Cachorro", value: 5 }, { name: "06 - Cabra", value: 6 },
                { name: "07 - Carneiro", value: 7 }, { name: "08 - Camelo", value: 8 }, { name: "09 - Cobra", value: 9 },
                { name: "10 - Coelho", value: 10 }, { name: "11 - Cavalo", value: 11 }, { name: "12 - Elefante", value: 12 },
                { name: "13 - Galo", value: 13 }, { name: "14 - Gato", value: 14 }, { name: "15 - Jacaré", value: 15 },
                { name: "16 - Leão", value: 16 }, { name: "17 - Macaco", value: 17 }, { name: "18 - Porco", value: 18 },
                { name: "19 - Pavão", value: 19 }, { name: "20 - Peru", value: 20 }, { name: "21 - Touro", value: 21 },
                { name: "22 - Tigre", value: 22 }, { name: "23 - Urso", value: 23 }, { name: "24 - Veado", value: 24 },
                { name: "25 - Vaca", value: 25 }
            ]
        }
    ],
    run: async (client, interaction) => {
        try {
            const aposta = Math.floor(interaction.options.getNumber("aposta"));
            const bichoEscolhido = interaction.options.getInteger("bicho");

            if (aposta <= 0) {
                return interaction.reply({ content: "❌ A aposta deve ser maior que 0.", ephemeral: true });
            }

            const userdb = await client.userdb.getOrCreate(interaction.user.id);

            if (userdb.economia.money < aposta) {
                return interaction.reply({ content: `❌ Você não tem R$ ${aposta} na carteira.`, ephemeral: true });
            }

            const bichos = [
                "Avestruz", "Águia", "Burro", "Borboleta", "Cachorro", "Cabra", "Carneiro", "Camelo", "Cobra", "Coelho",
                "Cavalo", "Elefante", "Galo", "Gato", "Jacaré", "Leão", "Macaco", "Porco", "Pavão", "Peru",
                "Touro", "Tigre", "Urso", "Veado", "Vaca"
            ];

            const resultadoIndex = Math.floor(Math.random() * 25);
            const resultadoBicho = bichos[resultadoIndex];
            const resultadoNumero = resultadoIndex + 1;

            const ganhou = resultadoNumero === bichoEscolhido;
            const premio = aposta * 18; // Paga 18x a aposta

            const embed = new Discord.MessageEmbed()
                .setTitle("🎰 Jogo do Bicho")
                .addFields(
                    { name: "Sua Aposta", value: `R$ ${aposta} no **${bichos[bichoEscolhido - 1]}**`, inline: true },
                    { name: "Resultado", value: `Deu **${resultadoBicho}**!`, inline: true }
                );

            if (ganhou) {
                userdb.economia.money += (premio - aposta); // Adiciona lucro
                embed.setColor("GREEN")
                embed.setDescription(`🎉 **DEU NO POSTE!** Você ganhou **R$ ${premio}**!`);
                embed.setThumbnail("https://i.imgur.com/4J5h6X8.png"); // Imagem de dinheiro
            } else {
                userdb.economia.money -= aposta;
                embed.setColor("RED")
                embed.setDescription(`😢 Não foi dessa vez. Tente novamente!`);
            }

            await userdb.save();
            interaction.reply({ embeds: [embed] });

        } catch (err) {
            console.error(err);
            interaction.reply({ content: "Erro ao realizar o jogo.", ephemeral: true });
        }
    }
};
