const { MessageEmbed, Permissions } = require("discord.js");

module.exports = {
    name: "kick",
    description: "Expulsa um membro do servidor.",
    type: "CHAT_INPUT",
    options: [
        {
            name: "usuario",
            description: "O usuário a ser expulso",
            type: "USER",
            required: true,
        },
        {
            name: "motivo",
            description: "Motivo da expulsão",
            type: "STRING",
            required: false,
        }
    ],
    run: async (client, interaction) => {
        try {
            if (!interaction.member.permissions.has(Permissions.FLAGS.KICK_MEMBERS)) {
                return interaction.reply({ content: "Você não tem permissão para expulsar membros.", ephemeral: true });
            }

            const user = interaction.options.getUser("usuario");
            const reason = interaction.options.getString("motivo") || "Nenhum motivo especificado";
            const member = interaction.guild.members.cache.get(user.id);

            if (!member) {
                return interaction.reply({ content: "Usuário não encontrado no servidor.", ephemeral: true });
            }

            if (!member.kickable) {
                return interaction.reply({ content: "Não consigo expulsar este usuário. Ele pode ter um cargo superior ao meu.", ephemeral: true });
            }

            await member.kick(reason);

            const embed = new MessageEmbed()
                .setTitle("👢 Usuário Expulso")
                .setColor("ORANGE")
                .addFields(
                    { name: "Usuário", value: `${user.tag} (${user.id})`, inline: true },
                    { name: "Moderador", value: interaction.user.tag, inline: true },
                    { name: "Motivo", value: reason }
                )
                .setTimestamp();

            interaction.reply({ embeds: [embed] });

        } catch (err) {
            console.error(err);
            interaction.reply({ content: "Ocorreu um erro ao tentar expulsar o usuário.", ephemeral: true });
        }
    },
};
