const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

function levelValue(name) {
    const key = String(name || "").toLowerCase();
    return LEVELS[key] || LEVELS.info;
}

const currentLevel = levelValue(process.env.LOG_LEVEL || "info");

function safeJson(v) {
    try {
        return JSON.stringify(v);
    } catch {
        return "\"[unserializable]\"";
    }
}

function write(level, message, meta) {
    const lv = levelValue(level);
    if (lv < currentLevel) return;
    const ts = new Date().toISOString();
    const base = `[${ts}] ${String(level).toUpperCase()}: ${String(message || "")}`;
    const line = meta ? `${base} ${safeJson(meta)}` : base;
    if (lv >= LEVELS.error) console.error(line);
    else if (lv >= LEVELS.warn) console.warn(line);
    else console.log(line);
}

function child(context) {
    const ctx = context && typeof context === "object" ? context : {};
    return {
        debug: (msg, meta) => write("debug", msg, meta ? { ...ctx, ...meta } : ctx),
        info: (msg, meta) => write("info", msg, meta ? { ...ctx, ...meta } : ctx),
        warn: (msg, meta) => write("warn", msg, meta ? { ...ctx, ...meta } : ctx),
        error: (msg, meta) => write("error", msg, meta ? { ...ctx, ...meta } : ctx),
    };
}

module.exports = {
    debug: (msg, meta) => write("debug", msg, meta),
    info: (msg, meta) => write("info", msg, meta),
    warn: (msg, meta) => write("warn", msg, meta),
    error: (msg, meta) => write("error", msg, meta),
    child,
};
