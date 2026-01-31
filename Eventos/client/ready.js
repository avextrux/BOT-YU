const client = require("../../index");
const mongo = require("mongoose");

client.on("ready", () => {

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
        client.user.setActivity(activity.name, { 
            type: activity.type, 
            url: activity.url 
        });
    }, 15000); // Troca a cada 15 segundos

    client.user.setStatus('online');
     
    mongo.connection.on('connected', () => {
        console.log('🍃 MongoDB Conectado!');
    });
    
    mongo.connection.on('error', (err) => {
        console.error('🍃 Erro no MongoDB:', err?.message || err);
    });
    
    mongo.connection.on('disconnected', () => {
        console.warn('🍃 MongoDB Desconectado!');
    });

    client.MongoConnect().catch((err) => {
        console.error('🍃 Falha crítica ao conectar no MongoDB:', err?.message || err);
    });

    console.log(`🤖 ${client.user.tag} está online e pronto para servir!`);
});
