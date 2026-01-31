const Discord = require("discord.js");
const config = require("./Config.json");
const mongo = require("mongoose");
const fs = require("fs");

const client = new Discord.Client({ intents: 32767 });

module.exports = client;

// Carregamento de Banco de Dados com Tratamento de Erro
try {
    client.userdb = require("./Database/user.js");
    client.shopdb = require("./Database/shop.js");
    client.contractdb = require("./Database/contract.js");
    client.guildEconomydb = require("./Database/guildEconomy.js");
    client.playerBankdb = require("./Database/playerBank.js");
    client.policedb = require("./Database/police.js");
} catch (e) {
    console.error("❌ Erro ao carregar Schemas do Banco de Dados:", e);
}

client.slashCommands = new Discord.Collection();

// Handler Principal
require("./Handler")(client);

const mongoUrl = process.env.MONGO_URL || process.env.MONGODB_URI || config.MongoURL;
const botToken = process.env.BOT_TOKEN || process.env.DISCORD_TOKEN || config.BotToken;

client.MongoConnect = () => mongo.connect(mongoUrl);

client.login(botToken).catch(err => {
    console.error("❌ Erro ao logar o bot. Verifique o TOKEN no Config.json.", err);
});

// --- ANTI-CRASH SYSTEM ---
// Previne que o bot desligue sozinho em caso de erros não tratados

process.on('unhandledRejection', (reason, p) => {
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
