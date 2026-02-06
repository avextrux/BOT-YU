const { Events } = require("discord.js");
const client = require("../../index");
const logger = require("../../Utils/logger");

let lastDbErrorAt = 0;
const buffer = new Map();
let flushing = false;

function bump(userId, inc = 1) {
    if (!userId) return;
    const cur = buffer.get(userId) || 0;
    buffer.set(userId, cur + inc);
}

async function flush() {
    if (flushing) return;
    if (!client.userdb) return;
    if (buffer.size === 0) return;
    flushing = true;
    const entries = Array.from(buffer.entries());
    buffer.clear();

    try {
        const ops = entries.map(([userId, count]) => ({
            updateOne: {
                filter: { userID: userId },
                update: { $inc: { "economia.stats.messagesSent": Math.max(1, Math.floor(count || 0)) } },
                upsert: true,
            },
        }));
        const CHUNK = 500;
        for (let i = 0; i < ops.length; i += CHUNK) {
            await client.userdb.bulkWrite(ops.slice(i, i + CHUNK), { ordered: false });
        }
    } catch (err) {
        for (const [userId, count] of entries) bump(userId, count);
        const now = Date.now();
        if (now - lastDbErrorAt > 30000) {
            lastDbErrorAt = now;
            logger.error("MessageBatch", `Failed to flush message stats: ${err.message}`, { stack: err.stack });
        }
    } finally {
        flushing = false;
    }
}

setInterval(() => {
    flush().catch((err) => {
        logger.error("MessageBatch", `Interval flush error: ${err.message}`);
    });
}, 10 * 1000);

module.exports = (client) => {
    client.on(Events.MessageCreate, async (message) => {
        if (!message || !message.guild) return;
        if (message.author?.bot) return;
        if (!client.userdb) return;

        try {
            bump(message.author.id, 1);
            if (buffer.size > 5000) flush().catch((err) => logger.error("MessageBatch", `Overflow flush error: ${err.message}`));
        } catch (err) {
            const now = Date.now();
            if (now - lastDbErrorAt > 30000) {
                lastDbErrorAt = now;
                logger.error("MessageEvent", `Error bumping message count: ${err.message}`);
            }
        }
    });
};
