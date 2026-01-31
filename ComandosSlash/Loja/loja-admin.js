const { MessageEmbed, Permissions } = require("discord.js");

module.exports = {
    name: "loja-admin",
    description: "Gerencie os itens da loja (Apenas Moderadores)",
    type: "CHAT_INPUT",
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
            if (!interaction.member.permissions.has(Permissions.FLAGS.MANAGE_GUILD)) {
                return interaction.reply({ content: "❌ Você precisa da permissão **Gerenciar Servidor** para usar este comando.", ephemeral: true });
            }

            const subCmd = interaction.options.getSubcommand();
            const guildID = interaction.guild.id;

            if (subCmd === "criar") {
                const itemID = interaction.options.getString("id").toLowerCase().replace(/\s/g, "_");
                const name = interaction.options.getString("nome");
                const price = interaction.options.getNumber("preco");
                const description = interaction.options.getString("descricao") || "Sem descrição.";
                const role = interaction.options.getRole("cargo");

                const exists = await client.shopdb.findOne({ guildID, itemID });
                if (exists) {
                    return interaction.reply({ content: `❌ Já existe um item com o ID \`${itemID}\`. Use outro ID.`, ephemeral: true });
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
                        { name: "Preço", value: `R$ ${price}`, inline: true },
                        { name: "Cargo", value: role ? role.toString() : "Nenhum", inline: true }
                    );

                interaction.reply({ embeds: [embed] });

            } else if (subCmd === "remover") {
                const itemID = interaction.options.getString("id").toLowerCase();

                const deleted = await client.shopdb.findOneAndDelete({ guildID, itemID });

                if (!deleted) {
                    return interaction.reply({ content: `❌ Não encontrei nenhum item com o ID \`${itemID}\`.`, ephemeral: true });
                }

                interaction.reply({ content: `✅ Item \`${itemID}\` removido da loja com sucesso.` });

            } else if (subCmd === "editar") {
                const itemID = interaction.options.getString("id").toLowerCase();
                const newPrice = interaction.options.getNumber("novo_preco");

                const item = await client.shopdb.findOne({ guildID, itemID });

                if (!item) {
                    return interaction.reply({ content: `❌ Não encontrei nenhum item com o ID \`${itemID}\`.`, ephemeral: true });
                }

                item.price = newPrice;
                await item.save();

                interaction.reply({ content: `✅ Preço do item \`${itemID}\` atualizado para **R$ ${newPrice}**.` });
            }

        } catch (err) {
            console.error(err);
            interaction.reply({ content: "Erro ao gerenciar loja.", ephemeral: true });
        }
    }
};
