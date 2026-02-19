const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const logger = require("../../Utils/logger");
const { replyOrEdit, requireUserPerms, requireBotPerms } = require("../../Utils/commandKit");
const { statusEmbed } = require("../../Utils/embeds");

module.exports = {
    name: "kick",
    description: "Expulsa um membro do servidor.",
    type: "CHAT_INPUT",
    autoDefer: { ephemeral: true },
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
            const uPerm = requireUserPerms(interaction, PermissionFlagsBits.KickMembers, { message: "Você não tem permissão para expulsar membros." });
            if (!uPerm.ok) return replyOrEdit(interaction, uPerm.payload);
            const bPerm = await requireBotPerms(interaction, PermissionFlagsBits.KickMembers, { message: "Eu não tenho permissão para expulsar membros." });
            if (!bPerm.ok) return replyOrEdit(interaction, bPerm.payload);

            const user = interaction.options.getUser("usuario");
            const reason = interaction.options.getString("motivo") || "Nenhum motivo especificado";
            const member = interaction.guild.members.cache.get(user.id);

            if (!member) {
                return replyOrEdit(interaction, { embeds: [statusEmbed("error", "Usuário não encontrado no servidor.", { title: "Kick" })], ephemeral: true });
            }

            if (user.id === interaction.user.id) return replyOrEdit(interaction, { embeds: [statusEmbed("error", "Você não pode se expulsar.", { title: "Kick" })], ephemeral: true });
            if (user.id === interaction.client.user.id) return replyOrEdit(interaction, { embeds: [statusEmbed("error", "Eu não posso me expulsar.", { title: "Kick" })], ephemeral: true });

            const modTop = interaction.member?.roles?.highest?.position ?? 0;
            const targetTop = member.roles?.highest?.position ?? 0;
            if (modTop <= targetTop && interaction.guild?.ownerId !== interaction.user.id) {
                return replyOrEdit(interaction, { embeds: [statusEmbed("error", "Você não pode expulsar alguém com cargo igual/maior que o seu.", { title: "Kick" })], ephemeral: true });
            }

            if (!member.kickable) {
                return replyOrEdit(interaction, { embeds: [statusEmbed("error", "Não consigo expulsar este usuário. Ele pode ter um cargo superior ao meu.", { title: "Kick" })], ephemeral: true });
            }

            await member.kick(reason);

            const embed = new EmbedBuilder()
                .setTitle("👢 Usuário Expulso")
                .setColor("Orange")
                .addFields(
                    { name: "Usuário", value: `${user.tag} (${user.id})`, inline: true },
                    { name: "Moderador", value: interaction.user.tag, inline: true },
                    { name: "Motivo", value: reason }
                )
                .setTimestamp();

            return replyOrEdit(interaction, { embeds: [embed], ephemeral: true });

        } catch (err) {
            logger.error("Erro ao expulsar usuário", { error: String(err?.message || err) });
            replyOrEdit(interaction, { embeds: [statusEmbed("error", "Ocorreu um erro ao tentar expulsar o usuário.", { title: "Kick" })], ephemeral: true }).catch(() => {});
        }
    },
};
