const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const commandsRoot = path.join(root, "ComandosSlash");
const outDir = path.join(root, "docs");
const outFile = path.join(outDir, "COMANDOS.txt");

function safeReadDir(p) {
    try {
        return fs.readdirSync(p);
    } catch {
        return [];
    }
}

function padLine(s = "") {
    return String(s).replace(/\r?\n/g, " ").trim();
}

function flattenOptions(options) {
    if (!Array.isArray(options)) return [];
    const subs = [];
    for (const opt of options) {
        if (!opt) continue;
        if (opt.type === "SUB_COMMAND") {
            subs.push({
                type: "sub",
                name: opt.name,
                description: opt.description || "",
                options: opt.options || [],
            });
        } else if (opt.type === "SUB_COMMAND_GROUP") {
            const groupName = opt.name;
            const groupOptions = Array.isArray(opt.options) ? opt.options : [];
            for (const sub of groupOptions) {
                if (!sub || sub.type !== "SUB_COMMAND") continue;
                subs.push({
                    type: "groupSub",
                    group: groupName,
                    name: sub.name,
                    description: sub.description || "",
                    options: sub.options || [],
                });
            }
        }
    }
    return subs;
}

function optionSignature(opts) {
    if (!Array.isArray(opts) || opts.length === 0) return "";
    const parts = [];
    for (const o of opts) {
        if (!o || !o.name) continue;
        const t = (o.type || "").toLowerCase();
        const req = o.required ? "" : "?";
        parts.push(`${o.name}${req}:${t || "arg"}`);
    }
    return parts.length ? ` ${parts.join(" ")}` : "";
}

function normalizeHubActions(cmd) {
    if (!cmd) return [];
    if (Array.isArray(cmd.hubActions)) return cmd.hubActions.filter(Boolean).map(String);
    if (cmd.hub && Array.isArray(cmd.hub.actions)) return cmd.hub.actions.filter(Boolean).map(String);
    return [];
}

function loadCommand(filePath) {
    try {
        delete require.cache[require.resolve(filePath)];
        const mod = require(filePath);
        if (!mod || !mod.name) return null;
        return mod;
    } catch {
        return null;
    }
}

function main() {
    const categories = safeReadDir(commandsRoot).filter((d) => fs.statSync(path.join(commandsRoot, d)).isDirectory());
    categories.sort((a, b) => a.localeCompare(b, "pt-BR"));

    const lines = [];
    lines.push("BOT-YU — LISTA DE COMANDOS");
    lines.push(`Gerado em: ${new Date().toLocaleString("pt-BR")}`);
    lines.push("");
    lines.push("Como organizar no servidor (sugestão):");
    lines.push("- Canal #anuncios-evento: anúncios e atrações");
    lines.push("- Canal #campanha: propaganda, debates, memes");
    lines.push("- Canal #economia: prints de /work /daily /loja /banco");
    lines.push("- Canal #suporte-bot: dúvidas e /help");
    lines.push("");
    lines.push("Legenda:");
    lines.push("- arg? = opcional");
    lines.push("- arg = obrigatório");
    lines.push("");

    for (const category of categories) {
        const dir = path.join(commandsRoot, category);
        const files = safeReadDir(dir).filter((f) => f.endsWith(".js"));
        files.sort((a, b) => a.localeCompare(b, "pt-BR"));

        lines.push(`== ${category.toUpperCase()} ==`);

        for (const f of files) {
            const full = path.join(dir, f);
            const cmd = loadCommand(full);
            if (!cmd) continue;

            const base = `/${cmd.name}`;
            const desc = padLine(cmd.description || "Sem descrição");
            lines.push(`${base} — ${desc}`);

            const hubActions = normalizeHubActions(cmd);
            if (hubActions.length) {
                lines.push(`  - HUB (ações):`);
                for (const a of hubActions.slice(0, 30)) {
                    lines.push(`    • ${padLine(a)}`);
                }
                if (hubActions.length > 30) lines.push(`    • ... (+${hubActions.length - 30})`);
            }

            const subs = flattenOptions(cmd.options);
            if (subs.length) {
                for (const s of subs) {
                    const subName = s.type === "groupSub" ? `${base} ${s.group} ${s.name}` : `${base} ${s.name}`;
                    const sig = optionSignature(s.options);
                    lines.push(`  - ${subName}${sig} — ${padLine(s.description) || "Sem descrição"}`);
                }
            }
            lines.push("");
        }

        lines.push("");
    }

    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(outFile, lines.join("\n"), "utf8");
    process.stdout.write(`OK: ${path.relative(root, outFile)}\n`);
}

main();

