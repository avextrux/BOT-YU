const { getOrCreate } = require("../../Database/user");

module.exports = {
    name: "messageCreate",
    run: async (client, message) => {
        if (message.author.bot || !message.guild) return;

        try {
            // Incrementar contador de mensagens (com um pequeno cooldown/cache seria melhor, mas direto é mais seguro para "real time")
            // Vamos fazer um "debounce" simples na memória para não espancar o banco?
            // Para simplicidade, vamos usar update direto com $inc, que é atômico e rápido.
            
            await client.userdb.updateOne(
                { userID: message.author.id },
                { $inc: { "economia.stats.messagesSent": 1 } },
                { upsert: true }
            );

        } catch (err) {
            console.error("Erro ao contar mensagem:", err);
        }
    }
};
