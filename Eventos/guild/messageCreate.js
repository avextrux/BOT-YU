const client = require("../../index");
const logger = require("../../Utils/logger");

let lastDbErrorAt = 0;

client.on("messageCreate", async (message) => {
    if (!message || !message.guild) return;
    if (message.author?.bot) return;
    if (!client.userdb) return;

    try {
        await client.userdb.updateOne(
            { userID: message.author.id },
            { $inc: { "economia.stats.messagesSent": 1 } },
            { upsert: true }
        );
    } catch (err) {
        const now = Date.now();
        if (now - lastDbErrorAt > 30000) {
            lastDbErrorAt = now;
            logger.error("Erro ao contar mensagem", { error: String(err?.message || err) });
        }
    }
});
