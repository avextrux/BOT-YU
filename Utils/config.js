const path = require("path");

let cachedConfig = null;

function readConfigFile() {
    if (cachedConfig) return cachedConfig;
    try {
        cachedConfig = require(path.join(__dirname, "..", "Config.json"));
    } catch {
        cachedConfig = {};
    }
    if (!cachedConfig || typeof cachedConfig !== "object") cachedConfig = {};
    return cachedConfig;
}

function firstEnv(names) {
    for (const name of names) {
        const v = process.env[name];
        if (typeof v === "string" && v.trim()) return v.trim();
    }
    return null;
}

function firstConfig(keys) {
    const cfg = readConfigFile();
    for (const k of keys) {
        const v = cfg?.[k];
        if (typeof v === "string" && v.trim()) return v.trim();
    }
    return null;
}

function getMongoUrl() {
    return firstEnv(["MONGO_URL", "MONGODB_URI"]) || firstConfig(["MongoURL"]) || null;
}

function getBotToken() {
    return firstEnv(["BOT_TOKEN", "DISCORD_TOKEN"]) || firstConfig(["BotToken"]) || null;
}

function getGiphyKey() {
    return (
        firstEnv(["GIPHY_KEY", "GIPHY_API_KEY", "GIPHY_SDK_KEY"]) ||
        firstConfig(["GiphyKey", "GiphySDKKey", "GiphyApiKey"]) ||
        null
    );
}

module.exports = {
    readConfigFile,
    getMongoUrl,
    getBotToken,
    getGiphyKey,
};
