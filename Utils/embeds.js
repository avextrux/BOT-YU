const Discord = require("./djs");

function colorFor(kind) {
    const k = String(kind || "").toLowerCase();
    if (k === "error") return "RED";
    if (k === "warn") return "ORANGE";
    if (k === "success") return "GREEN";
    return "BLURPLE";
}

function simpleEmbed({ title, description, color }) {
    const e = new Discord.MessageEmbed().setColor(color || "BLURPLE");
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
};
