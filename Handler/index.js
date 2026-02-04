const fs = require("fs");
const logger = require("../Utils/logger");
const Discord = require("../Utils/djs");

function pick(obj, keys) {
    const out = {};
    for (const k of keys) {
        if (obj?.[k] !== undefined) out[k] = obj[k];
    }
    return out;
}

function toSlashData(cmd) {
    const data = pick(cmd, ["name", "description", "options", "type", "defaultPermission", "dmPermission"]);
    if (data.type !== undefined) data.type = normalizeCommandType(data.type);
    if (Array.isArray(data.options)) data.options = normalizeOptions(data.options);
    return data;
}

function validateCommandShape(cmd) {
    const missing = [];
    if (!cmd || typeof cmd !== "object") missing.push("module");
    if (!cmd?.name || typeof cmd.name !== "string") missing.push("name");
    if (!cmd?.description || typeof cmd.description !== "string") missing.push("description");
    if (!cmd?.type || (typeof cmd.type !== "string" && typeof cmd.type !== "number")) missing.push("type");
    if (typeof cmd?.run !== "function") missing.push("run");
    return missing;
}

function normalizeCommandType(type) {
    if (typeof type === "number") return type;
    const t = String(type || "").toUpperCase();
    if (t === "CHAT_INPUT") return 1;
    if (t === "USER") return 2;
    if (t === "MESSAGE") return 3;
    return 1;
}

function normalizeOptionType(type) {
    if (typeof type === "number") return type;
    const t = String(type || "").toUpperCase();
    const map = {
        SUB_COMMAND: 1,
        SUB_COMMAND_GROUP: 2,
        STRING: 3,
        INTEGER: 4,
        BOOLEAN: 5,
        USER: 6,
        CHANNEL: 7,
        ROLE: 8,
        MENTIONABLE: 9,
        NUMBER: 10,
        ATTACHMENT: 11,
    };
    return map[t] || 3;
}

function normalizeOptions(options) {
    return options.map((opt) => {
        const o = { ...opt };
        if (o.type !== undefined) o.type = normalizeOptionType(o.type);
        if (Array.isArray(o.options)) o.options = normalizeOptions(o.options);
        return o;
    });
}

module.exports = async (client) => {
    //====Handler das Slash====\\
    const SlashsArray = [];
    const SlashsData = [];

    // Carregar Slash Commands
    try {
        const pastas = fs.readdirSync('./ComandosSlash/');
        for (const subpasta of pastas) {
            const arquivos = fs.readdirSync(`./ComandosSlash/${subpasta}/`).filter(arquivo => arquivo.endsWith('.js'));
            
            for (const arquivo of arquivos) {
                try {
                    const comando = require(`../ComandosSlash/${subpasta}/${arquivo}`);
                    const missing = validateCommandShape(comando);
                    if (missing.length) {
                        logger.warn("Comando inválido (shape)", { file: `${subpasta}/${arquivo}`, missing });
                        continue;
                    }

                    if (client.slashCommands.has(comando.name)) {
                        logger.warn("Comando duplicado (override)", { name: comando.name, file: `${subpasta}/${arquivo}` });
                    }
                    client.slashCommands.set(comando.name, comando);
                    SlashsArray.push(comando);
                    SlashsData.push(toSlashData(comando));
                } catch (e) {
                    logger.error("Falha ao carregar comando", { file: `${subpasta}/${arquivo}`, error: String(e?.message || e) });
                }
            }
        }
    } catch (e) {
        logger.error("Falha ao ler diretório ComandosSlash", { error: String(e?.message || e) });
    }

    client.on(Discord.Events?.ClientReady || "ready", async () => {
        try {
            const scope = String(process.env.SLASH_REGISTER_SCOPE || "guild").toLowerCase();
            logger.info("Iniciando registro de comandos", { count: SlashsArray.length, scope });
            
            // Estratégia de Registro Robusta:
            // Tenta registrar na guilda atual para desenvolvimento instantâneo.
            // Se falhar (bot não estiver em guildas ou sem permissão), tenta global.
            
            const guilds = client.guilds.cache;

            if (scope === "global") {
                await client.application.commands.set(SlashsData);
                logger.info("Comandos registrados globalmente", { count: SlashsArray.length });
                return;
            }

            if (guilds.size <= 0) {
                logger.warn("Bot não está em nenhuma guilda ainda. Aguardando entrada...");
                return;
            }

            guilds.forEach(async (guild) => {
                try {
                    await guild.commands.set(SlashsData);
                    logger.info("Comandos registrados na guilda", { guild: guild.name, guildId: guild.id });
                } catch (e) {
                    logger.error("Falha ao registrar comandos na guilda", { guild: guild.name, guildId: guild.id, error: String(e?.message || e) });
                }
            });

        } catch (e) {
            logger.error("Falha no processo de registro de comandos", { error: String(e?.message || e) });
        }
    });

    //====Handler dos Eventos====\\
    try {
        if (fs.existsSync('./Eventos/')) {
            const pastasEventos = fs.readdirSync('./Eventos/');
            for (const subpasta of pastasEventos) {
                if (fs.lstatSync(`./Eventos/${subpasta}`).isDirectory()) {
                    const arquivos = fs.readdirSync(`./Eventos/${subpasta}/`).filter(arquivo => arquivo.endsWith('.js'));
                    
                    for (const arquivo of arquivos) {
                        try {
                            require(`../Eventos/${subpasta}/${arquivo}`);
                        } catch (e) {
                            logger.error("Falha ao carregar evento", { file: `${subpasta}/${arquivo}`, error: String(e?.message || e) });
                        }
                    }
                }
            }
        }
    } catch (e) {
        logger.error("Falha ao ler diretório Eventos", { error: String(e?.message || e) });
    }
};
