const { MessageEmbed, Permissions } = require("discord.js");

module.exports = {
    name: "ban",
    description: "Banir um membro do servidor.",
    type: "CHAT_INPUT",
    options: [
        {
            name: "usuario",
            description: "O usuário a ser banido",
            type: "USER",
            required: true,
        },
        {
            name: "motivo",
            description: "Motivo do banimento",
            type: "STRING",
            required: false,
        }
    ],
    run: async (client, interaction) => {
        try {
            if (!interaction.member.permissions.has(Permissions.FLAGS.BAN_MEMBERS)) {
                return interaction.reply({ content: "Você não tem permissão para banir membros.", ephemeral: true });
            }

            const user = interaction.options.getUser("usuario");
            const reason = interaction.options.getString("motivo") || "Nenhum motivo especificado";
            const member = interaction.guild.members.cache.get(user.id);

            // Se o membro estiver no servidor, verifica se é banível
            if (member && !member.bannable) {
                return interaction.reply({ content: "Não consigo banir este usuário. Ele pode ter um cargo superior ao meu.", ephemeral: true });
            }

            await interaction.guild.members.ban(user.id, { reason: reason });

            const embed = new MessageEmbed()
                .setTitle("🔨 Usuário Banido")
                .setColor("RED")
                .addFields(
                    { name: "Usuário", value: `${user.tag} (${user.id})`, inline: true },
                    { name: "Moderador", value: interaction.user.tag, inline: true },
                    { name: "Motivo", value: reason }
                )
                .setTimestamp();

            interaction.reply({ embeds: [embed] });

        } catch (err) {
            console.error(err);
            interaction.reply({ content: "Ocorreu um erro ao tentar banir o usuário.", ephemeral: true });
        }
    },
};
