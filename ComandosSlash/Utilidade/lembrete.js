const Discord = require("discord.js");
const { replyOrEdit } = require("../../Utils/commandKit");

function getStore(client) {
    if (!client._reminderStore) {
        client._reminderStore = {
            items: new Map(),
            userCounts: new Map(),
        };
    }
    return client._reminderStore;
}

function decCount(store, userId) {
    const cur = store.userCounts.get(userId) || 0;
    const next = cur - 1;
    if (next <= 0) store.userCounts.delete(userId);
    else store.userCounts.set(userId, next);
}

function incCount(store, userId) {
    const cur = store.userCounts.get(userId) || 0;
    store.userCounts.set(userId, cur + 1);
}

module.exports = {
    name: "lembrete",
    description: "Crie um lembrete (em minutos)",
    type: "CHAT_INPUT",
    options: [
        {
            name: "minutos",
            description: "De 1 a 720 (12h)",
            type: "INTEGER",
            required: true
        },
        {
            name: "mensagem",
            description: "O que você quer lembrar?",
            type: "STRING",
            required: true
        }
    ],
    run: async (client, interaction) => {
        try {
            const MAX_TOTAL = 1000;
            const MAX_PER_USER = 5;
            const minutes = interaction.options.getInteger("minutos");
            const message = interaction.options.getString("mensagem").trim();

            if (!minutes || minutes < 1 || minutes > 720) {
                return replyOrEdit(interaction, { content: "❌ Minutos inválidos (1 a 720).", ephemeral: true });
            }
            if (!message) {
                return replyOrEdit(interaction, { content: "❌ Mensagem inválida.", ephemeral: true });
            }

            const ms = minutes * 60 * 1000;
            const store = getStore(client);
            const total = store.items.size;
            const userTotal = store.userCounts.get(interaction.user.id) || 0;
            if (total >= MAX_TOTAL) {
                return replyOrEdit(interaction, { content: "❌ Limite global de lembretes atingido. Tente novamente mais tarde.", ephemeral: true });
            }
            if (userTotal >= MAX_PER_USER) {
                return replyOrEdit(interaction, { content: `❌ Você atingiu o limite de ${MAX_PER_USER} lembretes ativos.`, ephemeral: true });
            }

            const id = `${interaction.user.id}:${Date.now()}`;

            const embed = new Discord.EmbedBuilder()
                .setTitle("⏰ Lembrete criado")
                .setColor("Blurple")
                .addFields(
                    { name: "Em", value: `${minutes} minuto(s)`, inline: true },
                    { name: "Mensagem", value: message.slice(0, 1024), inline: false }
                );

            await replyOrEdit(interaction, { embeds: [embed], ephemeral: true });
            incCount(store, interaction.user.id);

            const timeout = setTimeout(async () => {
                const existing = store.items.get(id);
                if (existing) {
                    store.items.delete(id);
                    decCount(store, existing.userId);
                }
                const ping = `<@${interaction.user.id}>`;
                const remindEmbed = new Discord.EmbedBuilder()
                    .setTitle("⏰ Lembrete")
                    .setColor("Green")
                    .setDescription(message);

                const ch = interaction.channel;
                if (ch?.send) {
                    ch.send({ content: ping, embeds: [remindEmbed] }).catch(() => {});
                } else {
                    interaction.user?.send?.({ content: ping, embeds: [remindEmbed] }).catch(() => {});
                }
            }, ms);

            store.items.set(id, { timeout, userId: interaction.user.id, createdAt: Date.now() });
        } catch (err) {
            console.error(err);
            replyOrEdit(interaction, { content: "Erro ao criar lembrete.", ephemeral: true }).catch(() => {});
        }
    }
};

