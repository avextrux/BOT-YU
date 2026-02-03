const Discord = require("discord.js");
const mongo = require("mongoose");
const fs = require("fs");

const client = new Discord.Client({ intents: 32767 });

module.exports = client;

let config = {};
try {
    config = require("./Config.json");
} catch (e) {
    console.warn("⚠️ Config.json não encontrado. Usando variáveis de ambiente (BOT_TOKEN / MONGO_URL).");
}

// Carregamento de Banco de Dados com Tratamento de Erro
try {
    client.userdb = require("./Database/user.js");
    client.shopdb = require("./Database/shop.js");
    client.contractdb = require("./Database/contract.js");
    client.guildEconomydb = require("./Database/guildEconomy.js");
    client.playerBankdb = require("./Database/playerBank.js");
    client.policedb = require("./Database/police.js");
    client.marketOfferdb = require("./Database/marketOffer.js");
    client.blackMarketGuilddb = require("./Database/blackMarketGuild.js");
    client.blackMarketUserdb = require("./Database/blackMarketUser.js");
    client.policeCasedb = require("./Database/policeCase.js");
    client.factiondb = require("./Database/faction.js");
    client.territorydb = require("./Database/territory.js");
} catch (e) {
    console.error("❌ Erro ao carregar Schemas do Banco de Dados:", e);
}

client.slashCommands = new Discord.Collection();

// Handler Principal
require("./Handler")(client);

const mongoUrl = process.env.MONGO_URL || process.env.MONGODB_URI || config.MongoURL;
const botToken = process.env.BOT_TOKEN || process.env.DISCORD_TOKEN || config.BotToken;

client.MongoConnect = () => {
    if (!mongoUrl) {
        return Promise.reject(new Error("MongoURL ausente. Configure MONGO_URL/MONGODB_URI ou Config.json."));
    }
    return mongo.connect(mongoUrl);
};

if (!botToken) {
    console.error("❌ BOT_TOKEN/DISCORD_TOKEN ausente. Configure a variável de ambiente ou o Config.json.");
} else {
    client.login(botToken).catch(err => {
        console.error("❌ Erro ao logar o bot. Verifique o TOKEN (BOT_TOKEN/DISCORD_TOKEN ou Config.json).", err);
    });
}

// --- ANTI-CRASH SYSTEM ---
// Previne que o bot desligue sozinho em caso de erros não tratados

process.on('unhandledRejection', (reason, p) => {
    const code = reason?.code || reason?.error?.code;
    if (code === 10062 || code === 40060) return;
    console.error(' [ANTI-CRASH] Unhandled Rejection/Catch');
    console.error(reason, p);
});

process.on('uncaughtException', (err, origin) => {
    console.error(' [ANTI-CRASH] Uncaught Exception/Catch');
    console.error(err, origin);
});

process.on('uncaughtExceptionMonitor', (err, origin) => {
    console.error(' [ANTI-CRASH] Uncaught Exception Monitor');
    console.error(err, origin);
});
