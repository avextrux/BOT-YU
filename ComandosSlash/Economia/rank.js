const Discord = require("discord.js");
const { formatMoney } = require("../../Utils/economy");

module.exports = {
    name: "rank",
    description: "rank dos maiores dinheiros",
    type: 'CHAT_INPUT',
    run: async (client, interaction) => {
     
     // Adicionado deferReply para evitar timeout em bancos grandes
     await interaction.deferReply();

     try {
         const top = await client.userdb.aggregate([
             {
                 $project: {
                     userID: 1,
                     total: { $add: ["$economia.money", "$economia.banco"] },
                 },
             },
             { $sort: { total: -1 } },
             { $limit: 10 },
         ]);

         const rankList = top
             .map((u, i) => {
                 const userTag = client.users.cache.get(u.userID)?.tag || `Usuário (${u.userID})`;
                 return `#${i + 1} | 👥 **${userTag}** (💸 ${formatMoney(u.total || 0)})`;
             })
             .join("\n> ");

         interaction.editReply({embeds: [new Discord.MessageEmbed()
         .setTitle(`📊 • Rank dos mais ricos da Economia!`)
         .setColor("a5d7ff")
         .setDescription(rankList ? `> ${rankList}` : "Ninguém no rank ainda.")
         .setTimestamp()
              ]})
     } catch (err) {
         console.error(err);
         interaction.editReply({ content: "Erro ao carregar o rank." });
     }

    }
}
