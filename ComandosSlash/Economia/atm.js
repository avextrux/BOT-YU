const Discord = require("discord.js");
const { formatMoney } = require("../../Utils/economy");

module.exports = {
    name: "atm",
    description: "Ver a sua carteira ou a de alguém",
    type: 'CHAT_INPUT',
    options: [
        {
            name: "usuario",
            description: "Usuário que você quer ver a atm.",
            type: "USER",
            required: false
        },
    ],
    run: async (client, interaction) => {
        try {
            const user = interaction.options.getUser("usuario") || interaction.user
            
            // Usa o getOrCreate para garantir que não quebre se o usuário for novo
            const userdb = await client.userdb.getOrCreate(user.id);

            const money = userdb.economia.money || 0;
            const banco = userdb.economia.banco || 0;
            const total = money + banco;
            const dailyStreak = userdb.economia?.stats?.dailyStreak || 0;
            const workStreak = userdb.economia?.stats?.workStreak || 0;

            const embed = new Discord.MessageEmbed()
                .setTitle(`💳 Extrato Bancário`)
                .setAuthor({ name: user.tag, iconURL: user.displayAvatarURL({ dynamic: true }) })
                .setColor("GOLD")
                .setThumbnail("https://i.imgur.com/4M7IWwP.png") // Ícone de carteira/banco genérico
                .addFields(
                    { name: "💵 Carteira", value: formatMoney(money), inline: true },
                    { name: "🏦 Banco", value: formatMoney(banco), inline: true },
                    { name: "💰 Patrimônio Total", value: formatMoney(total), inline: false },
                    { name: "📅 Daily (seq.)", value: String(dailyStreak), inline: true },
                    { name: "💼 Work (seq.)", value: String(workStreak), inline: true }
                )
                .setFooter({ text: "Sistema Econômico", iconURL: client.user.displayAvatarURL() })
                .setTimestamp();

            interaction.reply({ embeds: [embed] });
        } catch (err) {
            console.error(err);
            interaction.reply({ content: "Erro ao consultar saldo.", ephemeral: true });
        }
    }
};

function abreviar(number, precision=2) {
    return number.toLocaleString('pt-BR', { notation: 'compact', maximumFractionDigits: precision });
}
