const Module = require("module");

const originalLoad = Module._load;
const djsPath = require.resolve("./Utils/djs");
Module._load = function (request, parent, isMain) {
    if (request === "discord.js" && !String(parent?.filename || "").endsWith("\\Utils\\djs.js")) {
        return originalLoad.call(this, djsPath, parent, isMain);
    }
    return originalLoad.call(this, request, parent, isMain);
};

const Discord = require("./Utils/djs");
const mongo = require("mongoose");
const { getMongoUrl, getBotToken } = require("./Utils/config");
const logger = require("./Utils/logger");

const intents = [
    Discord.GatewayIntentBits.Guilds,
    Discord.GatewayIntentBits.GuildMembers,
    Discord.GatewayIntentBits.GuildMessages,
    Discord.GatewayIntentBits.MessageContent,
];

const client = new Discord.Client({
    intents,
    partials: [Discord.Partials.Channel],
    allowedMentions: { parse: [], repliedUser: false },
    makeCache: Discord.Options?.cacheWithLimits
        ? Discord.Options.cacheWithLimits({
              MessageManager: 0,
              GuildMemberManager: 0,
              PresenceManager: 0,
              ReactionManager: 0,
              ThreadManager: 0,
              ThreadMemberManager: 0,
          })
        : undefined,
    sweepers: Discord.Sweepers?.filterByLifetime
        ? {
              messages: { interval: 5 * 60, filter: Discord.Sweepers.filterByLifetime({ lifetime: 15 * 60 }) },
              users: { interval: 10 * 60, filter: Discord.Sweepers.filterByLifetime({ lifetime: 60 * 60 }) },
          }
        : undefined,
});

module.exports = client;

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
    logger.error("Erro ao carregar Schemas do Banco de Dados", { error: String(e?.message || e) });
}

client.slashCommands = new Discord.Collection();

// Handler Principal
require("./Handler")(client);

const mongoUrl = getMongoUrl();
const botToken = getBotToken();

client.MongoConnect = () => {
    if (!mongoUrl) {
        return Promise.reject(new Error("MongoURL ausente. Configure MONGO_URL/MONGODB_URI ou Config.json."));
    }
    return mongo.connect(mongoUrl);
};

if (!botToken) {
    logger.error("BOT_TOKEN/DISCORD_TOKEN ausente. Configure a variável de ambiente ou o Config.json.");
} else {
    client.login(botToken).catch(err => {
        logger.error("Erro ao logar o bot. Verifique o TOKEN (BOT_TOKEN/DISCORD_TOKEN ou Config.json).", { error: String(err?.message || err) });
    });
}

// --- ANTI-CRASH SYSTEM ---
// Previne que o bot desligue sozinho em caso de erros não tratados

process.on('unhandledRejection', (reason, p) => {
    const code = reason?.code || reason?.error?.code;
    if (code === 10062 || code === 40060) return;
    logger.error("[ANTI-CRASH] Unhandled Rejection/Catch", { reason: String(reason?.message || reason), code });
    logger.error("[ANTI-CRASH] Promise", { promise: String(p) });
});

process.on('uncaughtException', (err, origin) => {
    logger.error("[ANTI-CRASH] Uncaught Exception/Catch", { error: String(err?.message || err), origin: String(origin) });
});

process.on('uncaughtExceptionMonitor', (err, origin) => {
    logger.error("[ANTI-CRASH] Uncaught Exception Monitor", { error: String(err?.message || err), origin: String(origin) });
});
