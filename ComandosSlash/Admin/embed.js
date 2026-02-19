const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const logger = require("../../Utils/logger");
const { replyOrEdit, requireUserPerms } = require("../../Utils/commandKit");
const { statusEmbed } = require("../../Utils/embeds");

module.exports = {
    name: "embed",
    description: "Crie uma embed personalizada",
    type: 'CHAT_INPUT',
    autoDefer: { ephemeral: true },
    options: [
        { name: "titulo", description: "Título da embed", type: "STRING", required: true },
        { name: "descricao", description: "Descrição da embed", type: "STRING", required: true },
        { name: "cor", description: "Cor (HEX ou nome)", type: "STRING", required: false },
        { name: "imagem", description: "URL da imagem", type: "STRING", required: false },
        { name: "footer", description: "Texto do rodapé", type: "STRING", required: false },
        { name: "canal", description: "Canal onde enviar (opcional)", type: "CHANNEL", required: false }
    ],
    run: async (client, interaction) => {
        try {
            const uPerm = requireUserPerms(interaction, PermissionFlagsBits.ManageMessages, { message: "❌ Sem permissão." });
            if (!uPerm.ok) return replyOrEdit(interaction, uPerm.payload);

            const titulo = interaction.options.getString("titulo");
            const descricao = interaction.options.getString("descricao");
            const corInput = interaction.options.getString("cor");
            const imagem = interaction.options.getString("imagem");
            const footer = interaction.options.getString("footer");
            const canal = interaction.options.getChannel("canal") || interaction.channel;

            if (!canal || typeof canal.send !== "function") {
                return replyOrEdit(interaction, { embeds: [statusEmbed("error", "Canal inválido para enviar embed.", { title: "Embed" })], ephemeral: true });
            }

            const me = interaction.guild?.members?.me || (interaction.guild ? await interaction.guild.members.fetchMe().catch(() => null) : null);
            const perms = canal.permissionsFor(me);
            if (!perms?.has([PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) {
                return replyOrEdit(interaction, { embeds: [statusEmbed("error", "Eu não tenho permissão para enviar mensagens/embeds nesse canal.", { title: "Embed" })], ephemeral: true });
            }

            let cor = "Blue";
            if (corInput) {
                const v = corInput.trim();
                if (/^#?[0-9a-fA-F]{6}$/.test(v)) {
                    cor = v.startsWith("#") ? v : `#${v}`;
                } else {
                    cor = v.toUpperCase(); // Colors like "RED" still work if uppercase strings, but v14 prefers PascalCase enum or hex
                    // Mapping common ones just in case
                    const map = { VERMELHO: "Red", AZUL: "Blue", VERDE: "Green", AMARELO: "Yellow", LARANJA: "Orange", ROXO: "Purple", BRANCO: "White", PRETO: "Black" };
                    if (map[cor]) cor = map[cor];
                }
            }

            const embed = new EmbedBuilder()
                .setTitle(titulo)
                .setDescription(descricao);
            try {
                embed.setColor(cor);
            } catch {
                embed.setColor("Blue");
            }

            if (imagem) embed.setImage(imagem);
            if (footer) embed.setFooter({ text: footer });

            await canal.send({ embeds: [embed] });
            return replyOrEdit(interaction, { embeds: [statusEmbed("success", "Embed enviada!", { title: "Embed" })], ephemeral: true });
        } catch (err) {
            logger.error("Erro ao enviar embed", { error: String(err?.message || err) });
            replyOrEdit(interaction, { embeds: [statusEmbed("error", "Erro ao enviar embed.", { title: "Embed" })], ephemeral: true }).catch(() => {});
        }
    }
};
