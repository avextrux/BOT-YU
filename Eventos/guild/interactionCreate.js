const client = require("../../index");
const Discord = require("discord.js");
const { debitWalletIfEnough, formatMoney } = require("../../Utils/economy");
const { ensureElectionDefaults, getVotePrice, setVoteCount, getVoteCount } = require("../../Utils/electionEngine");

client.on("interactionCreate", async (interaction) => {
  
  if (interaction.isModalSubmit()) {
      if (interaction.customId === 'eleicao_buy_modal') {
        try {
            const targetRaw = interaction.fields.getTextInputValue('target_id');
            const quantityRaw = interaction.fields.getTextInputValue('quantity');
            
            // Tentar resolver usuário
            let targetId = targetRaw.replace(/[<@!>]/g, "");
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

        } catch (err) {
            console.error(err);
            return interaction.reply({ content: "Erro ao processar compra de votos.", ephemeral: true });
        }
      }

      if (interaction.customId === 'cfg_modal_channel') {
          const chId = interaction.fields.getTextInputValue('channel_id');
          const g = await client.blackMarketGuilddb.getOrCreate(interaction.guildId);
          if (!g.announce) g.announce = { channelId: null, pingEveryone: false };
          g.announce.channelId = chId;
          await g.save();
          return interaction.reply({ content: `✅ Canal de anúncios definido para <#${chId}>.`, ephemeral: true });
      }

      if (interaction.customId === 'cfg_modal_probs') {
          const discount = parseFloat(interaction.fields.getTextInputValue('prob_discount')) / 100;
          const raid = parseFloat(interaction.fields.getTextInputValue('prob_raid')) / 100;
          const shortage = parseFloat(interaction.fields.getTextInputValue('prob_shortage')) / 100;
          const surplus = parseFloat(interaction.fields.getTextInputValue('prob_surplus')) / 100;

          const g = await client.blackMarketGuilddb.getOrCreate(interaction.guildId);
          if (!g.config) g.config = {};
          g.config.eventProbs = { 
              discount: isNaN(discount) ? 0.05 : discount, 
              raid: isNaN(raid) ? 0.05 : raid, 
              shortage: isNaN(shortage) ? 0.05 : shortage, 
              surplus: isNaN(surplus) ? 0.05 : surplus 
          };
          await g.save();
          return interaction.reply({ content: "✅ Probabilidades atualizadas.", ephemeral: true });
      }

      if (interaction.customId === 'cfg_modal_eco') {
          const decay = parseFloat(interaction.fields.getTextInputValue('eco_decay'));
          const patrol = parseFloat(interaction.fields.getTextInputValue('eco_patrol')) / 100;

          const g = await client.blackMarketGuilddb.getOrCreate(interaction.guildId);
          if (!g.config) g.config = {};
          g.config.heatDecayPerHour = isNaN(decay) ? 4 : decay;
          g.config.patrolBaseChance = isNaN(patrol) ? 0.08 : patrol;
          await g.save();
          return interaction.reply({ content: "✅ Configurações econômicas atualizadas.", ephemeral: true });
      }
  }

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
