const { EmbedBuilder } = require("discord.js");
const moment = require("moment");
moment.locale("pt-br");
const logger = require("../../Utils/logger");
const { replyOrEdit } = require("../../Utils/commandKit");
const { statusEmbed } = require("../../Utils/embeds");

module.exports = {
    name: "serverinfo",
    description: "Mostra informações sobre o servidor.",
    type: "CHAT_INPUT",
    autoDefer: { ephemeral: false },
    run: async (client, interaction) => {
        try {
            const { guild } = interaction;
            const owner = await guild.fetchOwner();

            const embed = new EmbedBuilder()
                .setTitle(`🏰 Informações de ${guild.name}`)
                .setThumbnail(guild.iconURL({ dynamic: true }))
                .setColor("Blue")
                .addFields(
                    { name: "👑 Dono", value: `${owner.user.tag} (${owner.id})`, inline: true },
                    { name: "🆔 ID do Servidor", value: guild.id, inline: true },
                    { name: "📅 Criado em", value: moment(guild.createdAt).format("LL"), inline: true },
                    { name: "👥 Membros", value: `${guild.memberCount}`, inline: true },
                    { name: "💬 Canais", value: `${guild.channels.cache.size}`, inline: true },
                    { name: "🎭 Cargos", value: `${guild.roles.cache.size}`, inline: true },
                    { name: "🚀 Boosts", value: `${guild.premiumSubscriptionCount || 0} (Nível ${guild.premiumTier})`, inline: true }
                )
                .setFooter({ text: `Solicitado por ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() });

            if (guild.banner) {
                embed.setImage(guild.bannerURL({ size: 1024 }));
            }

            return replyOrEdit(interaction, { embeds: [embed] });
        } catch (err) {
            logger.error("Erro ao buscar informações do servidor", { error: String(err?.message || err) });
            replyOrEdit(interaction, { embeds: [statusEmbed("error", "Erro ao buscar informações do servidor.", { title: "Serverinfo" })], ephemeral: true }).catch(() => {});
        }
    },
};
