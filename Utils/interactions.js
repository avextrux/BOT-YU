const Discord = require("./djs");

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
    const modal = new Discord.Modal().setCustomId(customId).setTitle(String(title || "Formulário").slice(0, 45));
    const rows = [];
    for (const input of inputs || []) {
        const c = new Discord.TextInputComponent()
            .setCustomId(String(input.id).slice(0, 100))
            .setLabel(String(input.label || "Campo").slice(0, 45))
            .setStyle(input.style === "PARAGRAPH" ? "PARAGRAPH" : "SHORT")
            .setRequired(input.required !== false);
        if (input.minLength !== undefined) c.setMinLength(Math.max(0, Math.min(4000, Number(input.minLength) || 0)));
        if (input.maxLength !== undefined) c.setMaxLength(Math.max(1, Math.min(4000, Number(input.maxLength) || 4000)));
        if (input.placeholder) c.setPlaceholder(String(input.placeholder).slice(0, 100));
        rows.push(new Discord.MessageActionRow().addComponents(c));
    }
    modal.addComponents(rows.slice(0, 5));
    return modal;
}

async function promptModal(interaction, { title, inputs, timeMs = 60000, customIdPrefix = "prompt" } = {}) {
    const customId = `${customIdPrefix}:${interaction.user.id}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 7)}`.slice(0, 95);
    const modal = buildModal({ customId, title, inputs });
    await safe(interaction.showModal(modal));

    return await new Promise((resolve) => {
        const client = interaction.client;
        const timer = setTimeout(() => {
            cleanup();
            resolve(null);
        }, timeMs);

        const handler = (i) => {
            if (!i?.isModalSubmit?.()) return;
            if (i.customId !== customId) return;
            if (i.user?.id !== interaction.user.id) return;
            cleanup();
            const values = {};
            for (const input of inputs || []) {
                values[input.id] = i.fields.getTextInputValue(input.id);
            }
            resolve({ modalInteraction: i, values });
        };

        const cleanup = () => {
            clearTimeout(timer);
            client.removeListener("interactionCreate", handler);
        };

        client.on("interactionCreate", handler);
    });
}

module.exports = {
    safe,
    promptOneLine,
    promptModal,
};
