const client = require("../../index");
const mongo = require("mongoose");
const logger = require("../../Utils/logger");
const Discord = require("../../Utils/djs");

client.on(Discord.Events?.ClientReady || "ready", () => {

    const activities = [
        { name: `💸 Gerenciando a economia de ${client.users.cache.size} usuários!`, type: "STREAMING", url: "https://www.twitch.tv/discord" },
        { name: `🎮 Jogando com a sorte`, type: "PLAYING" },
        { name: `🛠️ Use /help para ajuda`, type: "LISTENING" },
        { name: `👀 De olho em ${client.guilds.cache.size} servidores`, type: "WATCHING" },
        { name: `🚀 Versão 2.0 - Mais rápida!`, type: "STREAMING", url: "https://www.twitch.tv/discord" }
    ];

    let i = 0;
    setInterval(() => {
        const activity = activities[i++ % activities.length];
        const typeMap = {
            PLAYING: Discord.ActivityType?.Playing,
            STREAMING: Discord.ActivityType?.Streaming,
            LISTENING: Discord.ActivityType?.Listening,
            WATCHING: Discord.ActivityType?.Watching,
            COMPETING: Discord.ActivityType?.Competing,
        };
        const type = typeMap[String(activity.type || "").toUpperCase()] ?? activity.type;
        client.user.setActivity(activity.name, { 
            type, 
            url: activity.url 
        });
    }, 15000); // Troca a cada 15 segundos

    client.user.setStatus('online');
     
    mongo.connection.on('connected', () => {
        logger.info("MongoDB Conectado");
    });
    
    mongo.connection.on('error', (err) => {
        logger.error("Erro no MongoDB", { error: String(err?.message || err) });
    });
    
    mongo.connection.on('disconnected', () => {
        logger.warn("MongoDB Desconectado");
    });

    client.MongoConnect().catch((err) => {
        logger.error("Falha crítica ao conectar no MongoDB", { error: String(err?.message || err) });
    });

    logger.info("Bot online", { tag: String(client.user.tag) });
});
