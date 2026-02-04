function isAdminMember(interaction) {
    return (
        interaction.member?.permissions?.has("ADMINISTRATOR") ||
        interaction.member?.permissions?.has("MANAGE_GUILD")
    );
}

async function cfg_modal_channel(client, interaction) {
    if (!isAdminMember(interaction)) return interaction.reply({ content: "❌ Apenas administradores.", ephemeral: true });
    await interaction.deferReply({ ephemeral: true }).catch(() => {});
    const chId = interaction.fields.getTextInputValue("channel_id");
    const g = await client.blackMarketGuilddb.getOrCreate(interaction.guildId);
    if (!g.announce) g.announce = { channelId: null, pingEveryone: false, policeRoleId: null, alertPolice: true };
    g.announce.channelId = chId;
    await g.save();
    return interaction.editReply({ content: `✅ Canal de anúncios definido para <#${chId}>.` });
}

async function cfg_modal_police_role(client, interaction) {
    if (!isAdminMember(interaction)) return interaction.reply({ content: "❌ Apenas administradores.", ephemeral: true });
    await interaction.deferReply({ ephemeral: true }).catch(() => {});
    const roleIdRaw = String(interaction.fields.getTextInputValue("police_role_id") || "").trim();
    const roleId = roleIdRaw && /^\d{16,25}$/.test(roleIdRaw) ? roleIdRaw : null;

    const g = await client.blackMarketGuilddb.getOrCreate(interaction.guildId);
    if (!g.announce) g.announce = { channelId: null, pingEveryone: false, policeRoleId: null, alertPolice: true };
    g.announce.policeRoleId = roleId;
    await g.save();
    return interaction.editReply({ content: roleId ? `✅ Cargo da polícia definido: <@&${roleId}>.` : "✅ Cargo da polícia removido." });
}

async function cfg_modal_probs(client, interaction) {
    if (!isAdminMember(interaction)) return interaction.reply({ content: "❌ Apenas administradores.", ephemeral: true });
    await interaction.deferReply({ ephemeral: true }).catch(() => {});
    const clamp01 = (n, fallback) => {
        const v = Number(n);
        if (!Number.isFinite(v)) return fallback;
        return Math.max(0, Math.min(1, v));
    };

    const discount = clamp01(parseFloat(interaction.fields.getTextInputValue("prob_discount")) / 100, 0.05);
    const raid = clamp01(parseFloat(interaction.fields.getTextInputValue("prob_raid")) / 100, 0.05);
    const shortage = clamp01(parseFloat(interaction.fields.getTextInputValue("prob_shortage")) / 100, 0.05);
    const surplus = clamp01(parseFloat(interaction.fields.getTextInputValue("prob_surplus")) / 100, 0.05);
    const checkpointOp = clamp01(parseFloat(interaction.fields.getTextInputValue("prob_checkpoint_op")) / 100, 0.03);

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

async function cfg_modal_eco(client, interaction) {
    if (!isAdminMember(interaction)) return interaction.reply({ content: "❌ Apenas administradores.", ephemeral: true });
    await interaction.deferReply({ ephemeral: true }).catch(() => {});
    const decay = parseFloat(interaction.fields.getTextInputValue("eco_decay"));
    const patrol = parseFloat(interaction.fields.getTextInputValue("eco_patrol")) / 100;
    const cooldownMin = parseFloat(interaction.fields.getTextInputValue("eco_cooldown_min"));

    const g = await client.blackMarketGuilddb.getOrCreate(interaction.guildId);
    if (!g.config) g.config = {};
    g.config.heatDecayPerHour = Number.isFinite(decay) ? decay : 4;
    g.config.patrolBaseChance = Number.isFinite(patrol) ? patrol : 0.08;
    g.config.eventCooldownMs = Number.isFinite(cooldownMin) ? Math.max(0, Math.floor(cooldownMin * 60 * 1000)) : (g.config.eventCooldownMs || 10 * 60 * 1000);
    await g.save();
    return interaction.editReply({ content: "✅ Configurações econômicas atualizadas." });
}

async function cfg_modal_activity(client, interaction) {
    if (!isAdminMember(interaction)) return interaction.reply({ content: "❌ Apenas administradores.", ephemeral: true });
    await interaction.deferReply({ ephemeral: true }).catch(() => {});
    const l2 = parseFloat(interaction.fields.getTextInputValue("act_level2"));
    const l3 = parseFloat(interaction.fields.getTextInputValue("act_level3"));
    const l4 = parseFloat(interaction.fields.getTextInputValue("act_level4"));

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

async function cfg_modal_rep(client, interaction) {
    if (!isAdminMember(interaction)) return interaction.reply({ content: "❌ Apenas administradores.", ephemeral: true });
    await interaction.deferReply({ ephemeral: true }).catch(() => {});

    const enabledRaw = String(interaction.fields.getTextInputValue("rep_enabled") || "").toLowerCase().trim();
    const enabled = ["sim", "s", "true", "1", "on"].includes(enabledRaw) ? true : ["nao", "não", "n", "false", "0", "off"].includes(enabledRaw) ? false : true;
    const price = Math.max(1, Math.floor(Number(interaction.fields.getTextInputValue("rep_price")) || 120));
    const maxPerDay = Math.max(0, Math.floor(Number(interaction.fields.getTextInputValue("rep_max")) || 250));

    const g = await client.blackMarketGuilddb.getOrCreate(interaction.guildId);
    if (!g.config) g.config = {};
    g.config.repShop = { enabled, pricePerRep: price, maxPerDay };
    await g.save();
    return interaction.editReply({ content: "✅ Loja de reputação atualizada." });
}

module.exports = {
    cfg_modal_channel,
    cfg_modal_police_role,
    cfg_modal_probs,
    cfg_modal_eco,
    cfg_modal_activity,
    cfg_modal_rep,
};
