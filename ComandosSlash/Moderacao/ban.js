const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const logger = require("../../Utils/logger");
const { replyOrEdit, requireUserPerms, requireBotPerms } = require("../../Utils/commandKit");
const { statusEmbed } = require("../../Utils/embeds");

module.exports = {
    name: "ban",
    description: "Banir um membro do servidor.",
    type: "CHAT_INPUT",
    autoDefer: { ephemeral: true },
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
            const uPerm = requireUserPerms(interaction, PermissionFlagsBits.BanMembers, { message: "Você não tem permissão para banir membros." });
            if (!uPerm.ok) return replyOrEdit(interaction, uPerm.payload);
            const bPerm = await requireBotPerms(interaction, PermissionFlagsBits.BanMembers, { message: "Eu não tenho permissão para banir membros." });
            if (!bPerm.ok) return replyOrEdit(interaction, bPerm.payload);

            const user = interaction.options.getUser("usuario");
            const reason = interaction.options.getString("motivo") || "Nenhum motivo especificado";
            const member = interaction.guild.members.cache.get(user.id);

            if (user.id === interaction.user.id) return replyOrEdit(interaction, { embeds: [statusEmbed("error", "Você não pode se banir.", { title: "Ban" })], ephemeral: true });
            if (user.id === interaction.client.user.id) return replyOrEdit(interaction, { embeds: [statusEmbed("error", "Eu não posso me banir.", { title: "Ban" })], ephemeral: true });

            if (member) {
                const modTop = interaction.member?.roles?.highest?.position ?? 0;
                const targetTop = member.roles?.highest?.position ?? 0;
                if (modTop <= targetTop && interaction.guild?.ownerId !== interaction.user.id) {
                    return replyOrEdit(interaction, { embeds: [statusEmbed("error", "Você não pode banir alguém com cargo igual/maior que o seu.", { title: "Ban" })], ephemeral: true });
                }
            }

            // Se o membro estiver no servidor, verifica se é banível
            if (member && !member.bannable) {
                return replyOrEdit(interaction, { embeds: [statusEmbed("error", "Não consigo banir este usuário. Ele pode ter um cargo superior ao meu.", { title: "Ban" })], ephemeral: true });
            }

            await interaction.guild.members.ban(user.id, { reason: reason });

            const embed = new EmbedBuilder()
                .setTitle("🔨 Usuário Banido")
                .setColor("Red")
                .addFields(
                    { name: "Usuário", value: `${user.tag} (${user.id})`, inline: true },
                    { name: "Moderador", value: interaction.user.tag, inline: true },
                    { name: "Motivo", value: reason }
                )
                .setTimestamp();

            return replyOrEdit(interaction, { embeds: [embed], ephemeral: true });

        } catch (err) {
            logger.error("Erro ao banir usuário", { error: String(err?.message || err) });
            replyOrEdit(interaction, { embeds: [statusEmbed("error", "Ocorreu um erro ao tentar banir o usuário.", { title: "Ban" })], ephemeral: true }).catch(() => {});
        }
    },
};
