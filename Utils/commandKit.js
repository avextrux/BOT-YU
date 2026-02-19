const { MessageFlags, PermissionsBitField } = require("discord.js");
const { safe } = require("./interactions");
const { statusEmbed } = require("./embeds");
const logger = require("./logger");

function hasReplied(interaction) {
    return Boolean(interaction?.deferred || interaction?.replied);
}

function stripEphemeral(payload) {
    if (!payload || typeof payload !== "object") return payload;
    if (!("ephemeral" in payload)) return payload;
    const { ephemeral, ...rest } = payload;
    return rest;
}

function normalizeReplyPayload(payload) {
    if (!payload || typeof payload !== "object") return payload;
    // v14 handles ephemeral naturally, but we can ensure flags are set if needed
    if (payload.ephemeral) {
        return { ...payload, flags: MessageFlags.Ephemeral };
    }
    return payload;
}

async function replyOrEdit(interaction, payload) {
    if (!interaction) return null;
    if (hasReplied(interaction)) {
        // Edit cannot change ephemeral state, so strip it to be safe
        return safe(interaction.editReply(stripEphemeral(payload)));
    }
    // Reply can set ephemeral
    return safe(interaction.reply(payload));
}

async function replyOrEditFetch(interaction, payload) {
    await replyOrEdit(interaction, payload);
    if (typeof interaction?.fetchReply !== "function") return null;
    return safe(interaction.fetchReply());
}

async function ensureDeferred(interaction, { ephemeral = false } = {}) {
    if (!interaction || hasReplied(interaction)) return null;
    return safe(interaction.deferReply({ ephemeral }));
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
    const me = interaction?.guild?.members?.me || (interaction?.guild ? await interaction.guild.members.fetchMe().catch(() => null) : null);
    
    if (!me) return { ok: false, payload: { content: "Erro ao verificar permissões do bot.", ephemeral: true } };

    const ch = channel || interaction?.channel;
    const channelPerms = ch?.permissionsFor ? ch.permissionsFor(me) : null;
    const ok = channelPerms ? channelPerms.has(list) : me.permissions.has(list);

    if (ok) return { ok: true };
    return {
        ok: false,
        payload: { embeds: [statusEmbed("error", message || "Eu não tenho permissão suficiente para executar isto.", { title: "Permissão" })], ephemeral: true },
    };
}

function withErrorBoundary(runFn, { name } = {}) {
    return async (client, interaction, cmd) => {
        const startedAt = Date.now();
        try {
            return await runFn(client, interaction, cmd);
        } catch (err) {
            logger.error("Erro em comando", {
                name: name || cmd?.name || interaction?.commandName,
                guildId: interaction?.guildId,
                userId: interaction?.user?.id,
                error: String(err?.message || err),
                stack: err?.stack ? String(err.stack).slice(0, 1800) : undefined,
            });
            return replyOrEdit(interaction, { embeds: [statusEmbed("error", "Ocorreu um erro ao executar este comando.", { title: "Erro" })], ephemeral: true });
        } finally {
            const ms = Date.now() - startedAt;
            if (ms >= 2000) {
                logger.warn("Comando lento", {
                    name: name || cmd?.name || interaction?.commandName,
                    guildId: interaction?.guildId,
                    userId: interaction?.user?.id,
                    ms,
                });
            }
        }
    };
}

module.exports = {
    hasReplied,
    replyOrEdit,
    replyOrEditFetch,
    ensureDeferred,
    requireUserPerms,
    requireBotPerms,
    withErrorBoundary,
};
