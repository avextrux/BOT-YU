const { MessageEmbed, Permissions } = require("discord.js");
const logger = require("../../Utils/logger");
const { replyOrEdit, requireUserPerms, requireBotPerms } = require("../../Utils/commandKit");
const { statusEmbed } = require("../../Utils/embeds");

module.exports = {
    name: "loja-admin",
    description: "Gerencie os itens da loja (Apenas Moderadores)",
    type: "CHAT_INPUT",
    autoDefer: { ephemeral: true },
    options: [
        {
            name: "criar",
            description: "Adicionar um novo item à loja",
            type: "SUB_COMMAND",
            options: [
                { name: "id", description: "ID único do item (sem espaços, ex: vip_gold)", type: "STRING", required: true },
                { name: "nome", description: "Nome visível do item", type: "STRING", required: true },
                { name: "preco", description: "Preço do item", type: "NUMBER", required: true },
                { name: "descricao", description: "Descrição do item", type: "STRING", required: false },
                { name: "cargo", description: "Cargo para dar ao comprador (opcional)", type: "ROLE", required: false }
            ]
        },
        {
            name: "remover",
            description: "Remover um item da loja",
            type: "SUB_COMMAND",
            options: [
                { name: "id", description: "ID do item a remover", type: "STRING", required: true }
            ]
        },
        {
            name: "editar",
            description: "Editar o preço de um item",
            type: "SUB_COMMAND",
            options: [
                { name: "id", description: "ID do item a editar", type: "STRING", required: true },
                { name: "novo_preco", description: "Novo preço", type: "NUMBER", required: true }
            ]
        }
    ],
    run: async (client, interaction) => {
        try {
            if (!client.shopdb) return replyOrEdit(interaction, { embeds: [statusEmbed("error", "Banco da loja indisponível.", { title: "Loja" })], ephemeral: true });

            const uPerm = requireUserPerms(interaction, Permissions.FLAGS.MANAGE_GUILD, { message: "Você precisa da permissão **Gerenciar Servidor** para usar este comando." });
            if (!uPerm.ok) return replyOrEdit(interaction, uPerm.payload);
            const bPerm = await requireBotPerms(interaction, [Permissions.FLAGS.SEND_MESSAGES, Permissions.FLAGS.EMBED_LINKS], { message: "Eu não tenho permissão para enviar mensagens/embeds neste servidor." });
            if (!bPerm.ok) return replyOrEdit(interaction, bPerm.payload);

            const subCmd = interaction.options.getSubcommand();
            const guildID = interaction.guild.id;

            if (subCmd === "criar") {
                const itemID = interaction.options.getString("id").toLowerCase().replace(/\s/g, "_").replace(/[^a-z0-9_-]/g, "").slice(0, 40);
                const name = interaction.options.getString("nome");
                const price = interaction.options.getNumber("preco");
                const description = interaction.options.getString("descricao") || "Sem descrição.";
                const role = interaction.options.getRole("cargo");
                if (!itemID) return replyOrEdit(interaction, { embeds: [statusEmbed("error", "ID inválido.", { title: "Loja" })], ephemeral: true });
                if (!Number.isFinite(price) || price <= 0) return replyOrEdit(interaction, { embeds: [statusEmbed("error", "Preço inválido.", { title: "Loja" })], ephemeral: true });

                const exists = await client.shopdb.findOne({ guildID, itemID });
                if (exists) {
                    return replyOrEdit(interaction, { embeds: [statusEmbed("error", `Já existe um item com o ID \`${itemID}\`. Use outro ID.`, { title: "Loja" })], ephemeral: true });
                }

                const newItem = new client.shopdb({
                    guildID,
                    itemID,
                    name,
                    price,
                    description,
                    roleID: role ? role.id : null
                });

                await newItem.save();

                const embed = new MessageEmbed()
                    .setTitle("✅ Item Criado!")
                    .setColor("GREEN")
                    .addFields(
                        { name: "ID", value: `\`${itemID}\``, inline: true },
                        { name: "Nome", value: name, inline: true },
                        { name: "Preço", value: `R$ ${Math.floor(price)}`, inline: true },
                        { name: "Cargo", value: role ? role.toString() : "Nenhum", inline: true }
                    );

                return replyOrEdit(interaction, { embeds: [embed], ephemeral: true });

            } else if (subCmd === "remover") {
                const itemID = interaction.options.getString("id").toLowerCase();

                const deleted = await client.shopdb.findOneAndDelete({ guildID, itemID });

                if (!deleted) {
                    return replyOrEdit(interaction, { embeds: [statusEmbed("error", `Não encontrei nenhum item com o ID \`${itemID}\`.`, { title: "Loja" })], ephemeral: true });
                }

                return replyOrEdit(interaction, { embeds: [statusEmbed("success", `Item \`${itemID}\` removido da loja com sucesso.`, { title: "Loja" })], ephemeral: true });

            } else if (subCmd === "editar") {
                const itemID = interaction.options.getString("id").toLowerCase();
                const newPrice = interaction.options.getNumber("novo_preco");
                if (!Number.isFinite(newPrice) || newPrice <= 0) return replyOrEdit(interaction, { embeds: [statusEmbed("error", "Novo preço inválido.", { title: "Loja" })], ephemeral: true });

                const item = await client.shopdb.findOne({ guildID, itemID });

                if (!item) {
                    return replyOrEdit(interaction, { embeds: [statusEmbed("error", `Não encontrei nenhum item com o ID \`${itemID}\`.`, { title: "Loja" })], ephemeral: true });
                }

                item.price = newPrice;
                await item.save();

                return replyOrEdit(interaction, { embeds: [statusEmbed("success", `Preço do item \`${itemID}\` atualizado para **R$ ${Math.floor(newPrice)}**.`, { title: "Loja" })], ephemeral: true });
            }

        } catch (err) {
            logger.error("Erro ao gerenciar loja", { error: String(err?.message || err) });
            replyOrEdit(interaction, { embeds: [statusEmbed("error", "Erro ao gerenciar loja.", { title: "Erro" })], ephemeral: true }).catch(() => {});
        }
    }
};
