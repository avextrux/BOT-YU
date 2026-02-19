const { EmbedBuilder } = require("discord.js");

const WDA_FOOTER_TEXT = "WDA • Direitos reservados";

function colorFor(kind) {
    const k = String(kind || "").toLowerCase();
    if (k === "error") return "Red";
    if (k === "warn") return "Orange";
    if (k === "success") return "Green";
    return "Blurple";
}

function applyWDAFooter(embed) {
    if (!embed || typeof embed.setFooter !== "function") return embed;
    embed.setFooter({ text: WDA_FOOTER_TEXT });
    return embed;
}

function simpleEmbed({ title, description, color }) {
    const e = new EmbedBuilder().setColor(color || "Blurple");
    if (title) e.setTitle(String(title).slice(0, 256));
    if (description) e.setDescription(String(description).slice(0, 4096));
    return e;
}

function statusEmbed(kind, text, { title } = {}) {
    return simpleEmbed({ title: title || null, description: text, color: colorFor(kind) });
}

module.exports = {
    simpleEmbed,
    statusEmbed,
    applyWDAFooter,
};
