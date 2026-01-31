const Discord = require("discord.js");

module.exports = {
    name: "sobremim",
    description: "Altere a descrição do seu perfil",
    type: 'CHAT_INPUT',
    options: [
        {
            name: "texto",
            description: "Escreva algo sobre você (máx 150 caracteres)",
            type: "STRING",
            required: true
        },
    ],
    run: async (client, interaction) => {
        try {
            const texto = interaction.options.getString("texto");

            if (texto.length > 150) {
                return interaction.reply({ 
                    embeds: [new Discord.MessageEmbed().setColor("RED").setDescription("❌ O texto deve ter no máximo 150 caracteres.")], 
                    ephemeral: true 
                });
            }

            const userdb = await client.userdb.getOrCreate(interaction.user.id);

            userdb.economia.sobremim = texto;
            await userdb.save();

            const embed = new Discord.MessageEmbed()
                .setTitle(`📝 Perfil Atualizado`)
                .setColor("BLUE")
                .setDescription(`Seu "Sobre Mim" foi alterado com sucesso!`)
                .addFields({ name: "Nova Descrição", value: `*${texto}*` })
                .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
                .setFooter({ text: "Use /perfil para ver como ficou." });

            interaction.reply({ embeds: [embed] });

        } catch (err) {
            console.error(err);
            interaction.reply({ content: "Erro ao atualizar perfil.", ephemeral: true });
        }
    }
};
