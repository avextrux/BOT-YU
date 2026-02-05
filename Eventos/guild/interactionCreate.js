const client = require("../../index");
const modalHandlers = require("./modals");
const logger = require("../../Utils/logger");
const { statusEmbed } = require("../../Utils/embeds");
const { withErrorBoundary, ensureDeferred, replyOrEdit } = require("../../Utils/commandKit");

client.on("interactionCreate", async (interaction) => {
  
  if (interaction.isModalSubmit()) {
      const handler = modalHandlers?.[interaction.customId];
      if (!handler) return;
      try {
          await handler(client, interaction);
      } catch (err) {
          logger.error("Erro ao processar modal", { customId: interaction.customId, error: String(err?.message || err) });
          replyOrEdit(interaction, { embeds: [statusEmbed("error", "Erro ao processar formulário.", { title: "Erro" })], ephemeral: true }).catch(() => {});
      }
  }

  if (interaction.isChatInputCommand?.() || interaction.isCommand?.()) {
    if (interaction.inGuild && !interaction.inGuild()) {
      return replyOrEdit(interaction, { embeds: [statusEmbed("error", "Este comando só pode ser usado em servidores.", { title: "Comando" })], ephemeral: true }).catch(() => {});
    }

    const cmd = client.slashCommands.get(interaction.commandName);

    if (!cmd) {
      if (interaction.deferred || interaction.replied) {
        return interaction.editReply({ embeds: [statusEmbed("error", "Comando não encontrado (desatualizado).", { title: "Erro" })] }).catch(() => {});
      }
      return interaction.reply({ embeds: [statusEmbed("error", "Comando não encontrado (desatualizado).", { title: "Erro" })], ephemeral: true }).catch(() => {});
    }
    
    if (!interaction.member) {
      interaction["member"] = interaction.guild?.members?.cache?.get(interaction.user.id) || null;
    }

    const exec = withErrorBoundary(async () => {
        const ephemeralDefault = Boolean(cmd.ephemeralDefault);
        const shouldDeferQuickly = !cmd.autoDefer;
        const timer = shouldDeferQuickly
            ? setTimeout(() => {
                  if (interaction.deferred || interaction.replied) return;
                  ensureDeferred(interaction, { ephemeral: ephemeralDefault }).catch(() => {});
              }, 1200)
            : null;

        if (cmd.autoDefer) {
            const ephemeral = typeof cmd.autoDefer === "object" ? Boolean(cmd.autoDefer.ephemeral) : Boolean(cmd.ephemeralDefault);
            await ensureDeferred(interaction, { ephemeral });
        }
        try {
            return await cmd.run(client, interaction);
        } finally {
            if (timer) clearTimeout(timer);
        }
    }, { name: cmd.name });

    await exec(client, interaction, cmd);
    
  }

});
