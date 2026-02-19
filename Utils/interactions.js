const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require("discord.js");

async function safe(promise) {
    try {
        return await promise;
    } catch (e) {
        if (e?.code === 10062 || e?.code === 40060) return null;
        throw e;
    }
}

async function promptOneLine(interactionLike, { prompt, timeMs = 60000 } = {}) {
    if (!interactionLike?.channel || typeof interactionLike.channel.awaitMessages !== "function") return null;
    await safe(interactionLike.followUp({ content: prompt, ephemeral: true }));
    const filter = (m) => m.author?.id === interactionLike.user?.id;
    const collected = await interactionLike.channel.awaitMessages({ filter, max: 1, time: timeMs });
    const msg = collected.first();
    if (!msg) return null;
    const value = msg.content;
    msg.delete().catch(() => {});
    return value;
}

function buildModal({ customId, title, inputs }) {
    const modal = new ModalBuilder()
        .setCustomId(customId)
        .setTitle(String(title || "Formulário").slice(0, 45));
        
    for (const input of inputs || []) {
        const style = input.style === "PARAGRAPH" ? TextInputStyle.Paragraph : TextInputStyle.Short;
        
        const c = new TextInputBuilder()
            .setCustomId(String(input.id).slice(0, 100))
            .setLabel(String(input.label || "Campo").slice(0, 45))
            .setStyle(style)
            .setRequired(input.required !== false);
            
        if (input.minLength !== undefined) c.setMinLength(Math.max(0, Math.min(4000, Number(input.minLength) || 0)));
        if (input.maxLength !== undefined) c.setMaxLength(Math.max(1, Math.min(4000, Number(input.maxLength) || 4000)));
        if (input.placeholder) c.setPlaceholder(String(input.placeholder).slice(0, 100));
        
        const row = new ActionRowBuilder().addComponents(c);
        modal.addComponents(row);
    }
    return modal;
}

async function promptModal(interaction, { title, inputs, timeMs = 300000, customIdPrefix = "prompt" } = {}) {
    // Unique ID for this specific modal instance
    const uniqueId = `${customIdPrefix}_${interaction.id}_${Date.now()}`;
    const modal = buildModal({ customId: uniqueId, title, inputs });
    
    await interaction.showModal(modal);

    try {
        const submitted = await interaction.awaitModalSubmit({
            filter: (i) => i.customId === uniqueId && i.user.id === interaction.user.id,
            time: timeMs,
        });

        const values = {};
        for (const input of inputs || []) {
            values[input.id] = submitted.fields.getTextInputValue(input.id);
        }
        
        return { modalInteraction: submitted, values };
    } catch (err) {
        // Timeout or error
        return null;
    }
}

module.exports = {
    safe,
    promptOneLine,
    promptModal,
};
