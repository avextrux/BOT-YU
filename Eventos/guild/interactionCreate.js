const client = require("../../index");
const Discord = require("discord.js")
client.on("interactionCreate", async (interaction) => {
  
  if (interaction.isCommand()) {

    const cmd = client.slashCommands.get(interaction.commandName);

    if (!cmd) {
      if (interaction.deferred || interaction.replied) {
        return interaction.editReply({ content: "❌ Comando não encontrado (desatualizado)." }).catch(() => {});
      }
      return interaction.reply({ content: "❌ Comando não encontrado (desatualizado).", ephemeral: true }).catch(() => {});
    }
    
    interaction["member"] = interaction.guild.members.cache.get(interaction.user.id);

      try {
        await cmd.run(client, interaction)
      } catch (err) {
        console.error(err);
        if (interaction.deferred || interaction.replied) {
          interaction.editReply({ content: "❌ Ocorreu um erro ao executar este comando.", embeds: [], components: [] }).catch(() => {});
        } else {
          interaction.reply({ content: "❌ Ocorreu um erro ao executar este comando.", ephemeral: true }).catch(() => {});
        }
      }
    
  }

});
