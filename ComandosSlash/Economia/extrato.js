const Discord = require("discord.js");
const { formatMoney } = require("../../Utils/economy");

function typeLabel(t) {
    const map = {
        daily: "📅 Daily",
        work: "🔨 Work",
        deposit: "🏦 Depósito",
        withdraw: "💸 Saque",
        pay_out: "📤 Pay",
        pay_in: "📥 Pay",
        pay_refund: "↩️ Estorno",
    };
    return map[t] || `🧾 ${t || "tx"}`;
}

function fmtDelta(n) {
    const v = Math.floor(n || 0);
    if (v === 0) return "0";
    return v > 0 ? `+${formatMoney(v)}` : `-${formatMoney(Math.abs(v))}`;
}

module.exports = {
    name: "extrato",
    description: "Mostra suas últimas movimentações",
    type: 'CHAT_INPUT',
    options: [
        {
            name: "pagina",
            description: "Página do extrato (10 itens por página)",
            type: "INTEGER",
            required: false
        },
    ],
    run: async (client, interaction) => {
        try {
            const pageOpt =
                (interaction.options?.getInteger ? interaction.options.getInteger("pagina") : null) ??
                (interaction.options?.getNumber ? Math.floor(interaction.options.getNumber("pagina")) : null) ??
                1;
            const page = Math.max(1, Number(pageOpt) || 1);
            const userdb = await client.userdb.getOrCreate(interaction.user.id);
            const listRaw = userdb?.economia?.transactions;
            const list = Array.isArray(listRaw) ? listRaw : [];

            const perPage = 10;
            const start = (page - 1) * perPage;
            const items = list
                .map((it) => (it && typeof it.toObject === "function" ? it.toObject() : it))
                .slice()
                .reverse()
                .slice(start, start + perPage);

            const money = userdb.economia.money || 0;
            const banco = userdb.economia.banco || 0;

            const lines = items.map((it) => {
                const d = new Date(it.at || Date.now());
                const hh = String(d.getHours()).padStart(2, "0");
                const mm = String(d.getMinutes()).padStart(2, "0");
                const wallet = fmtDelta(it.walletDelta);
                const bank = fmtDelta(it.bankDelta);
                return `\`[${hh}:${mm}]\` **${typeLabel(it.type)}** • 💵 ${wallet} • 🏦 ${bank}`;
            });

            const embed = new Discord.MessageEmbed()
                .setTitle("🧾 Extrato")
                .setColor("BLURPLE")
                .setDescription(lines.length ? lines.join("\n") : "Você ainda não tem movimentações.")
                .addFields(
                    { name: "💵 Carteira", value: formatMoney(money), inline: true },
                    { name: "🏦 Banco", value: formatMoney(banco), inline: true },
                    { name: "📄 Página", value: String(page), inline: true }
                )
                .setFooter({ text: "Dica: /depositar, /retirar, /pay e jogos registram no extrato." });

            if (interaction.deferred || interaction.replied) {
                interaction.editReply({ embeds: [embed] }).catch(() => {});
            } else {
                interaction.reply({ embeds: [embed], ephemeral: true }).catch(() => {});
            }
        } catch (err) {
            console.error(err);
            if (interaction.deferred || interaction.replied) {
                interaction.editReply({ content: "Erro ao carregar extrato.", embeds: [], components: [] }).catch(() => {});
            } else {
                interaction.reply({ content: "Erro ao carregar extrato.", ephemeral: true }).catch(() => {});
            }
        }
    }
};

