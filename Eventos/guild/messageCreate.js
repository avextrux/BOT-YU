const client = require("../../index");

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
        console.error("Erro ao contar mensagem:", err);
    }
});
