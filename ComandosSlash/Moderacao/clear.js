const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const logger = require("../../Utils/logger");
const { replyOrEdit, requireUserPerms, requireBotPerms } = require("../../Utils/commandKit");
const { statusEmbed } = require("../../Utils/embeds");

module.exports = {
    name: "clear",
    description: "Limpa mensagens do chat.",
    type: "CHAT_INPUT",
    autoDefer: { ephemeral: true },
    options: [
        {
            name: "quantidade",
            description: "Número de mensagens para apagar (1-100)",
            type: "INTEGER",
            required: true,
            minValue: 1,
            maxValue: 100
        }
    ],
    run: async (client, interaction) => {
        try {
            const uPerm = requireUserPerms(interaction, PermissionFlagsBits.ManageMessages, { message: "Você não tem permissão para usar este comando." });
            if (!uPerm.ok) return replyOrEdit(interaction, uPerm.payload);
            const bPerm = await requireBotPerms(interaction, [PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ReadMessageHistory], { message: "Eu não tenho permissão para limpar mensagens neste canal." });
            if (!bPerm.ok) return replyOrEdit(interaction, bPerm.payload);

            const amount = interaction.options.getInteger("quantidade");
            if (!amount || amount < 1 || amount > 100) return replyOrEdit(interaction, { embeds: [statusEmbed("error", "Quantidade inválida (1-100).", { title: "Clear" })], ephemeral: true });

            const deleted = await interaction.channel.bulkDelete(amount, true);
            const count = deleted?.size ?? amount;

            const embed = new EmbedBuilder()
                .setColor("Green")
                .setDescription(`🧹 **${count}** mensagens foram limpas com sucesso!`);

            return replyOrEdit(interaction, { embeds: [embed], ephemeral: true });

        } catch (err) {
            logger.error("Erro ao limpar mensagens", { error: String(err?.message || err) });
            replyOrEdit(interaction, { embeds: [statusEmbed("error", "Erro ao tentar limpar mensagens. Verifique permissões e se as mensagens não têm mais de 14 dias.", { title: "Clear" })], ephemeral: true }).catch(() => {});
        }
    },
};
