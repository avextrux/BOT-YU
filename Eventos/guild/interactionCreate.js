const { Events, EmbedBuilder } = require("discord.js");
const client = require("../../index");
const modalHandlers = require("./modals");
const logger = require("../../Utils/logger");
const { statusEmbed } = require("../../Utils/embeds");
const { withErrorBoundary, ensureDeferred, replyOrEdit } = require("../../Utils/commandKit");

module.exports = (client) => {
    client.on(Events.InteractionCreate, async (interaction) => {
        try {
            // Modais
            if (interaction.isModalSubmit()) {
                const handler = modalHandlers?.[interaction.customId];
                if (!handler) return;
                try {
                    await handler(client, interaction);
                } catch (err) {
                    logger.error("Modal", `Error processing modal ${interaction.customId}: ${err.message}`);
                    replyOrEdit(interaction, {
                        embeds: [new EmbedBuilder().setColor("Red").setTitle("Erro").setDescription("Erro ao processar formulário.")],
                        ephemeral: true
                    }).catch(() => {});
                }
                return;
            }

            // Comandos Slash
            if (interaction.isChatInputCommand()) {
                if (interaction.inGuild && !interaction.inGuild()) {
                    return replyOrEdit(interaction, {
                        embeds: [new EmbedBuilder().setColor("Red").setTitle("Comando").setDescription("Este comando só pode ser usado em servidores.")],
                        ephemeral: true
                    }).catch(() => {});
                }

                const cmd = client.slashCommands.get(interaction.commandName);

                if (!cmd) {
                    return replyOrEdit(interaction, {
                        embeds: [new EmbedBuilder().setColor("Red").setTitle("Erro").setDescription("Comando não encontrado (desatualizado).")],
                        ephemeral: true
                    }).catch(() => {});
                }

                if (!interaction.member) {
                    interaction.member = interaction.guild?.members?.cache?.get(interaction.user.id) || null;
                }

                const exec = withErrorBoundary(async () => {
                    // Auto-defer inteligente
                    if (cmd.autoDefer) {
                        const ephemeral = typeof cmd.autoDefer === "object" ? Boolean(cmd.autoDefer.ephemeral) : Boolean(cmd.ephemeralDefault);
                        await ensureDeferred(interaction, { ephemeral });
                    }

                    // Fallback timer para defer se o comando demorar
                    let timer = null;
                    if (!cmd.autoDefer) {
                        timer = setTimeout(() => {
                            if (!interaction.deferred && !interaction.replied) {
                                ensureDeferred(interaction, { ephemeral: Boolean(cmd.ephemeralDefault) }).catch(() => {});
                            }
                        }, 2500);
                    }

                    try {
                        await cmd.run(client, interaction);
                    } finally {
                        if (timer) clearTimeout(timer);
                    }
                }, { name: cmd.name });

                await exec(client, interaction, cmd);
            }
        } catch (err) {
            logger.error("Interaction", `Global interaction error: ${err.message}`, { stack: err.stack });
        }
    });
};
