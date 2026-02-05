const djs = require("discord.js");

function toPascalFromUpperSnake(s) {
    return String(s)
        .toLowerCase()
        .split("_")
        .filter(Boolean)
        .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
        .join("");
}

function toUpperSnakeFromPascal(s) {
    return String(s)
        .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
        .replace(/__/g, "_")
        .toUpperCase();
}

function withAliases(base) {
    const out = base;

    if (!out.Permissions && out.PermissionsBitField?.Flags) {
        const flags = out.PermissionsBitField.Flags;
        const compat = { ...flags };
        for (const k of Object.keys(flags)) {
            compat[toUpperSnakeFromPascal(k)] = flags[k];
        }
        out.Permissions = { FLAGS: compat };
    }

    if (out.PermissionsBitField?.resolve && out.PermissionsBitField?.Flags) {
        const origResolve = out.PermissionsBitField.resolve.bind(out.PermissionsBitField);
        out.PermissionsBitField.resolve = (permission) => {
            if (typeof permission === "string") {
                const key = permission.trim();
                if (key && key === key.toUpperCase()) {
                    const pascal = toPascalFromUpperSnake(key);
                    if (out.PermissionsBitField.Flags[pascal]) return origResolve(pascal);
                }
            }
            return origResolve(permission);
        };
    }

    if (!out.MessageEmbed && out.EmbedBuilder) {
        class MessageEmbed extends out.EmbedBuilder {
            setColor(color) {
                if (typeof color === "string" && out.Colors) {
                    const key = color.trim();
                    if (key && key === key.toUpperCase()) {
                        const pascal = toPascalFromUpperSnake(key);
                        if (out.Colors[pascal] !== undefined) return super.setColor(out.Colors[pascal]);
                    }
                }
                return super.setColor(color);
            }

            addField(name, value, inline = false) {
                return this.addFields({ name: String(name), value: String(value), inline: Boolean(inline) });
            }
        }
        out.MessageEmbed = MessageEmbed;
    }

    if (!out.MessageActionRow && out.ActionRowBuilder) out.MessageActionRow = out.ActionRowBuilder;
    if (!out.MessageButton && out.ButtonBuilder) {
        class MessageButton extends out.ButtonBuilder {
            setStyle(style) {
                if (typeof style === "string" && out.ButtonStyle) {
                    const s = style.toUpperCase();
                    const map = {
                        PRIMARY: out.ButtonStyle.Primary,
                        SECONDARY: out.ButtonStyle.Secondary,
                        SUCCESS: out.ButtonStyle.Success,
                        DANGER: out.ButtonStyle.Danger,
                        LINK: out.ButtonStyle.Link,
                    };
                    if (map[s] !== undefined) return super.setStyle(map[s]);
                }
                return super.setStyle(style);
            }
        }
        out.MessageButton = MessageButton;
    }
    if (!out.MessageSelectMenu && out.StringSelectMenuBuilder) out.MessageSelectMenu = out.StringSelectMenuBuilder;
    if (!out.Modal && out.ModalBuilder) out.Modal = out.ModalBuilder;
    if (!out.TextInputComponent && out.TextInputBuilder) {
        class TextInputComponent extends out.TextInputBuilder {
            setStyle(style) {
                if (typeof style === "string" && out.TextInputStyle) {
                    const s = style.toUpperCase();
                    const map = {
                        SHORT: out.TextInputStyle.Short,
                        PARAGRAPH: out.TextInputStyle.Paragraph,
                    };
                    if (map[s] !== undefined) return super.setStyle(map[s]);
                }
                return super.setStyle(style);
            }
        }
        out.TextInputComponent = TextInputComponent;
    }

    if (out.BaseInteraction?.prototype && out.MessageFlags?.Ephemeral !== undefined) {
        const flag = out.MessageFlags.Ephemeral;
        const normalize = (options) => {
            if (!options || typeof options !== "object") return options;
            if (!("ephemeral" in options)) return options;
            const ephemeral = Boolean(options.ephemeral);
            const { ephemeral: _e, ...rest } = options;
            if (!ephemeral) return rest;
            const existing = rest.flags;
            const flags = existing === undefined ? flag : (Array.isArray(existing) ? existing.concat([flag]) : existing | flag);
            return { ...rest, flags };
        };

        const stripForEdit = (options) => {
            if (!options || typeof options !== "object") return options;
            const { fetchReply, flags, ...rest } = options;
            return rest;
        };

        const wrapReply = (obj) => {
            const fn = obj.reply;
            if (typeof fn !== "function") return;
            if (fn.__compatWrapped) return;
            const wrapped = function (options, ...rest) {
                const wantsFetch = Boolean(options?.fetchReply);
                const normalized = normalize(options);

                if (this?.deferred && !this?.replied && typeof this.editReply === "function") {
                    const payload = stripForEdit(normalized);
                    const p = this.editReply(payload);
                    return wantsFetch && typeof this.fetchReply === "function" ? Promise.resolve(p).then(() => this.fetchReply()) : p;
                }

                if (this?.replied && typeof this.followUp === "function") {
                    const payload = stripForEdit(normalized);
                    const p = this.followUp(payload);
                    return wantsFetch && typeof this.fetchReply === "function" ? Promise.resolve(p).then(() => this.fetchReply()) : p;
                }

                return fn.call(this, normalized, ...rest);
            };
            wrapped.__compatWrapped = true;
            obj.reply = wrapped;
        };

        const wrapSimple = (obj, method) => {
            const fn = obj[method];
            if (typeof fn !== "function") return;
            if (fn.__compatWrapped) return;
            const wrapped = function (options, ...rest) {
                return fn.call(this, normalize(options), ...rest);
            };
            wrapped.__compatWrapped = true;
            obj[method] = wrapped;
        };

        wrapReply(out.BaseInteraction.prototype);
        wrapSimple(out.BaseInteraction.prototype, "deferReply");
        wrapSimple(out.BaseInteraction.prototype, "followUp");
    }

    return out;
}

module.exports = withAliases(djs);
