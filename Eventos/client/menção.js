const client = require("../../index");
const { EmbedBuilder } = require("discord.js");

client.on("messageCreate", message => {
 
  if(message.author.bot) return;
  if(!message.guild) return;
  
  if(message.content == `<@${client.user.id}>` || message.content == `<@!${client.user.id}>`){
  
  const embed = new EmbedBuilder()
    .setTitle(`${client.user.username}`)
    .setColor("Blue")
    .setThumbnail(client.user.displayAvatarURL())
    .setDescription(`> **Opa! Bão?** Me chamo \`${client.user.username}\`, se precisar de ajuda use /help`)

   message.reply({embeds: [embed]})
  }
});
