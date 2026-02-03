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
          const isAdminMember =
              interaction.member?.permissions?.has("ADMINISTRATOR") ||
              interaction.member?.permissions?.has("MANAGE_GUILD");
          if (!isAdminMember) return interaction.reply({ content: "❌ Apenas administradores.", ephemeral: true });
          await interaction.deferReply({ ephemeral: true }).catch(() => {});
          const chId = interaction.fields.getTextInputValue('channel_id');
          const g = await client.blackMarketGuilddb.getOrCreate(interaction.guildId);
          if (!g.announce) g.announce = { channelId: null, pingEveryone: false, policeRoleId: null, alertPolice: true };
          g.announce.channelId = chId;
          await g.save();
          return interaction.editReply({ content: `✅ Canal de anúncios definido para <#${chId}>.` });
      }

      if (interaction.customId === 'cfg_modal_police_role') {
          const isAdminMember =
              interaction.member?.permissions?.has("ADMINISTRATOR") ||
              interaction.member?.permissions?.has("MANAGE_GUILD");
          if (!isAdminMember) return interaction.reply({ content: "❌ Apenas administradores.", ephemeral: true });
          await interaction.deferReply({ ephemeral: true }).catch(() => {});
          const roleIdRaw = String(interaction.fields.getTextInputValue('police_role_id') || "").trim();
          const roleId = roleIdRaw && /^\d{16,25}$/.test(roleIdRaw) ? roleIdRaw : null;

          const g = await client.blackMarketGuilddb.getOrCreate(interaction.guildId);
          if (!g.announce) g.announce = { channelId: null, pingEveryone: false, policeRoleId: null, alertPolice: true };
          g.announce.policeRoleId = roleId;
          await g.save();
          return interaction.editReply({ content: roleId ? `✅ Cargo da polícia definido: <@&${roleId}>.` : "✅ Cargo da polícia removido." });
      }

      if (interaction.customId === 'cfg_modal_probs') {
          const isAdminMember =
              interaction.member?.permissions?.has("ADMINISTRATOR") ||
              interaction.member?.permissions?.has("MANAGE_GUILD");
          if (!isAdminMember) return interaction.reply({ content: "❌ Apenas administradores.", ephemeral: true });
          await interaction.deferReply({ ephemeral: true }).catch(() => {});
          const clamp01 = (n, fallback) => {
              const v = Number(n);
              if (!Number.isFinite(v)) return fallback;
              return Math.max(0, Math.min(1, v));
          };

          const discount = clamp01(parseFloat(interaction.fields.getTextInputValue('prob_discount')) / 100, 0.05);
          const raid = clamp01(parseFloat(interaction.fields.getTextInputValue('prob_raid')) / 100, 0.05);
          const shortage = clamp01(parseFloat(interaction.fields.getTextInputValue('prob_shortage')) / 100, 0.05);
          const surplus = clamp01(parseFloat(interaction.fields.getTextInputValue('prob_surplus')) / 100, 0.05);
          const checkpointOp = clamp01(parseFloat(interaction.fields.getTextInputValue('prob_checkpoint_op')) / 100, 0.03);

          const g = await client.blackMarketGuilddb.getOrCreate(interaction.guildId);
          if (!g.config) g.config = {};
          g.config.eventProbs = { 
              discount, 
              raid, 
              shortage, 
              surplus,
              checkpointOp,
          };
          await g.save();
          return interaction.editReply({ content: "✅ Probabilidades atualizadas." });
      }

      if (interaction.customId === 'cfg_modal_eco') {
          const isAdminMember =
              interaction.member?.permissions?.has("ADMINISTRATOR") ||
              interaction.member?.permissions?.has("MANAGE_GUILD");
          if (!isAdminMember) return interaction.reply({ content: "❌ Apenas administradores.", ephemeral: true });
          await interaction.deferReply({ ephemeral: true }).catch(() => {});
          const decay = parseFloat(interaction.fields.getTextInputValue('eco_decay'));
          const patrol = parseFloat(interaction.fields.getTextInputValue('eco_patrol')) / 100;
          const cooldownMin = parseFloat(interaction.fields.getTextInputValue('eco_cooldown_min'));

          const g = await client.blackMarketGuilddb.getOrCreate(interaction.guildId);
          if (!g.config) g.config = {};
          g.config.heatDecayPerHour = isNaN(decay) ? 4 : decay;
          g.config.patrolBaseChance = isNaN(patrol) ? 0.08 : patrol;
          g.config.eventCooldownMs = isNaN(cooldownMin) ? (g.config.eventCooldownMs || 10 * 60 * 1000) : Math.max(0, Math.floor(cooldownMin * 60 * 1000));
          await g.save();
          return interaction.editReply({ content: "✅ Configurações econômicas atualizadas." });
      }

      if (interaction.customId === 'cfg_modal_activity') {
          const isAdminMember =
              interaction.member?.permissions?.has("ADMINISTRATOR") ||
              interaction.member?.permissions?.has("MANAGE_GUILD");
          if (!isAdminMember) return interaction.reply({ content: "❌ Apenas administradores.", ephemeral: true });
          await interaction.deferReply({ ephemeral: true }).catch(() => {});
          const l2 = parseFloat(interaction.fields.getTextInputValue('act_level2'));
          const l3 = parseFloat(interaction.fields.getTextInputValue('act_level3'));
          const l4 = parseFloat(interaction.fields.getTextInputValue('act_level4'));

          const clampInt = (n, fallback) => {
              const v = Math.floor(Number(n));
              if (!Number.isFinite(v)) return fallback;
              return Math.max(0, Math.min(100000, v));
          };

          const g = await client.blackMarketGuilddb.getOrCreate(interaction.guildId);
          if (!g.config) g.config = {};
          g.config.activityRequirements = {
              level2: clampInt(l2, 50),
              level3: clampInt(l3, 200),
              level4: clampInt(l4, 500),
          };
          await g.save();
          return interaction.editReply({ content: "✅ Desafios de atividade atualizados." });
      }

      if (interaction.customId === 'cfg_modal_rep') {
          const isAdminMember =
              interaction.member?.permissions?.has("ADMINISTRATOR") ||
              interaction.member?.permissions?.has("MANAGE_GUILD");
          if (!isAdminMember) return interaction.reply({ content: "❌ Apenas administradores.", ephemeral: true });
          await interaction.deferReply({ ephemeral: true }).catch(() => {});

          const enabledRaw = String(interaction.fields.getTextInputValue('rep_enabled') || "").toLowerCase().trim();
          const enabled = ["sim", "s", "true", "1", "on"].includes(enabledRaw) ? true : ["nao", "não", "n", "false", "0", "off"].includes(enabledRaw) ? false : true;
          const price = Math.max(1, Math.floor(Number(interaction.fields.getTextInputValue('rep_price')) || 120));
          const maxPerDay = Math.max(0, Math.floor(Number(interaction.fields.getTextInputValue('rep_max')) || 250));

          const g = await client.blackMarketGuilddb.getOrCreate(interaction.guildId);
          if (!g.config) g.config = {};
          g.config.repShop = { enabled, pricePerRep: price, maxPerDay };
          await g.save();
          return interaction.editReply({ content: "✅ Loja de reputação atualizada." });
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
