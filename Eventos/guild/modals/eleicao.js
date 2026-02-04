const { debitWalletIfEnough, formatMoney } = require("../../../Utils/economy");
const { ensureElectionDefaults, getVotePrice, setVoteCount, getVoteCount } = require("../../../Utils/electionEngine");

async function handleEleicaoBuyModal(client, interaction) {
    const targetRaw = interaction.fields.getTextInputValue("target_id");
    const quantityRaw = interaction.fields.getTextInputValue("quantity");

    const targetId = String(targetRaw || "").replace(/[<@!>]/g, "");
    const targetUser = await client.users.fetch(targetId).catch(() => null);
    if (!targetUser) return interaction.reply({ content: "❌ Usuário não encontrado.", ephemeral: true });

    const qty = Math.floor(Number(quantityRaw));
    if (!qty || qty <= 0 || qty > 100) return interaction.reply({ content: "❌ Quantidade inválida (1-100).", ephemeral: true });

    const eco = await client.guildEconomydb.getOrCreate(interaction.guildId);
    ensureElectionDefaults(eco);

    if (!eco.election.active) return interaction.reply({ content: "❌ Eleição encerrada.", ephemeral: true });
    if (!eco.election.candidates.includes(targetUser.id)) return interaction.reply({ content: "❌ Este usuário não é candidato.", ephemeral: true });

    let total = 0;
    for (let i = 0; i < qty; i++) {
        total += getVotePrice(eco.election);
        eco.election.voteShop.sold = Math.max(0, Math.floor(eco.election.voteShop.sold || 0)) + 1;
    }

    const updated = await debitWalletIfEnough(
        client.userdb,
        interaction.user.id,
        total,
        "vote_buy",
        { guildId: interaction.guildId, candidateId: targetUser.id, quantity: qty }
    );

    if (!updated) {
        eco.election.voteShop.sold = Math.max(0, Math.floor(eco.election.voteShop.sold || 0) - qty);
        return interaction.reply({ content: `❌ Você precisa de ${formatMoney(total)} para comprar ${qty} votos.`, ephemeral: true });
    }

    eco.policy.treasury = Math.floor((eco.policy.treasury || 0) + total);
    const currentPaid = getVoteCount(eco.election.paidVotes, targetUser.id);
    setVoteCount(eco.election.paidVotes, targetUser.id, currentPaid + qty);
    await eco.save();

    return interaction.reply({ content: `✅ Compra realizada! **${qty} votos** para ${targetUser.tag}. Custo: ${formatMoney(total)}.`, ephemeral: true });
}

module.exports = {
    eleicao_buy_modal: handleEleicaoBuyModal,
};
