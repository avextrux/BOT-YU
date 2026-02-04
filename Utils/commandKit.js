const { safe } = require("./interactions");
const { statusEmbed } = require("./embeds");
const logger = require("./logger");

function hasReplied(interaction) {
    return Boolean(interaction?.deferred || interaction?.replied);
}

async function replyOrEdit(interaction, payload) {
    if (!interaction) return null;
    if (hasReplied(interaction)) return safe(interaction.editReply(payload));
    return safe(interaction.reply(payload));
}

async function ensureDeferred(interaction, { ephemeral = false } = {}) {
    if (!interaction || hasReplied(interaction)) return null;
    return safe(interaction.deferReply({ ephemeral: Boolean(ephemeral) }));
}

function requireUserPerms(interaction, perms, { message } = {}) {
    const list = Array.isArray(perms) ? perms : [perms];
    const ok = interaction?.member?.permissions?.has(list);
    if (ok) return { ok: true };
    return {
        ok: false,
        payload: { embeds: [statusEmbed("error", message || "Você não tem permissão para usar este comando.", { title: "Permissão" })], ephemeral: true },
    };
}

async function requireBotPerms(interaction, perms, { message, channel } = {}) {
    const list = Array.isArray(perms) ? perms : [perms];
    const me = interaction?.guild?.me || (interaction?.guild ? await interaction.guild.members.fetch(interaction.client.user.id).catch(() => null) : null);
    const ch = channel || interaction?.channel;
    const channelPerms = me && ch?.permissionsFor ? ch.permissionsFor(me) : null;
    const ok = channelPerms ? channelPerms.has(list) : me?.permissions?.has(list);
    if (ok) return { ok: true };
    return {
        ok: false,
        payload: { embeds: [statusEmbed("error", message || "Eu não tenho permissão suficiente para executar isto.", { title: "Permissão" })], ephemeral: true },
    };
}

function withErrorBoundary(runFn, { name } = {}) {
    return async (client, interaction, cmd) => {
        try {
            return await runFn(client, interaction, cmd);
        } catch (err) {
            logger.error("Erro em comando", {
                name: name || cmd?.name || interaction?.commandName,
                guildId: interaction?.guildId,
                userId: interaction?.user?.id,
                error: String(err?.message || err),
            });
            return replyOrEdit(interaction, { embeds: [statusEmbed("error", "Ocorreu um erro ao executar este comando.", { title: "Erro" })], ephemeral: true });
        }
    };
}

module.exports = {
    hasReplied,
    replyOrEdit,
    ensureDeferred,
    requireUserPerms,
    requireBotPerms,
    withErrorBoundary,
};
