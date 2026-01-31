const { MessageEmbed } = require("discord.js");
const moment = require("moment");
moment.locale("pt-br");

module.exports = {
    name: "userinfo",
    description: "Mostra informações sobre um usuário.",
    type: "CHAT_INPUT",
    options: [
        {
            name: "usuario",
            description: "O usuário para ver as informações",
            type: "USER",
            required: false,
        },
    ],
    run: async (client, interaction) => {
        try {
            const user = interaction.options.getUser("usuario") || interaction.user;
            const member = interaction.guild.members.cache.get(user.id);

            const embed = new MessageEmbed()
                .setTitle(`ℹ️ Informações de ${user.username}`)
                .setThumbnail(user.displayAvatarURL({ dynamic: true }))
                .setColor("BLUE")
                .addFields(
                    { name: "🆔 ID", value: user.id, inline: true },
                    { name: "🏷️ Tag", value: user.tag, inline: true },
                    { name: "📅 Criado em", value: moment(user.createdAt).format("LL"), inline: true },
                    { name: "📥 Entrou em", value: member ? moment(member.joinedAt).format("LL") : "Não está no servidor", inline: true },
                    { name: "🤖 Bot?", value: user.bot ? "Sim" : "Não", inline: true }
                )
                .setFooter({ text: `Solicitado por ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() });

            if (member && member.roles.cache.size > 0) {
                // Filtra @everyone
                const roles = member.roles.cache.filter(r => r.name !== '@everyone').map(r => r).join(", ") || "Nenhum";
                if (roles.length < 1024) {
                     embed.addFields({ name: "🎭 Cargos", value: roles });
                } else {
                     embed.addFields({ name: "🎭 Cargos", value: "Muitos cargos para listar." });
                }
            }

            interaction.reply({ embeds: [embed] });
        } catch (err) {
            console.error(err);
            interaction.reply({ content: "Erro ao buscar informações do usuário.", ephemeral: true });
        }
    },
};
