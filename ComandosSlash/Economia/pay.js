const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require("discord.js");
const { getRandomGifUrl } = require("../../Utils/giphy");
const { formatMoney, debitWalletIfEnough, creditWallet, errorEmbed } = require("../../Utils/economy");
const { ensureEconomyAllowed } = require("../../Utils/economyGuard");
const logger = require("../../Utils/logger");
const { replyOrEdit, replyOrEditFetch } = require("../../Utils/commandKit");

module.exports = {
    name: "pay",
    description: "Transfira dinheiro para outro usuário",
    type: 1, // CHAT_INPUT
    autoDefer: { ephemeral: false },
    options: [
        {
            name: "usuario",
            description: "Usuário que receberá o dinheiro",
            type: 6, // USER
            required: true
        },
        {
            name: "quantia",
            description: "Valor a ser transferido",
            type: 10, // NUMBER
            required: true
        }
    ],
    run: async (client, interaction) => {
        try {
            await interaction.deferReply().catch(() => {});

            const gate = await ensureEconomyAllowed(client, interaction, interaction.user.id);
            if (!gate.ok) return replyOrEdit(interaction, { embeds: [gate.embed], ephemeral: true });
            
            const receiver = interaction.options.getUser("usuario");
            const amount = Math.floor(interaction.options.getNumber("quantia"));

            // Validações básicas
            if (receiver.id === interaction.user.id) {
                return replyOrEdit(interaction, { 
                    embeds: [new EmbedBuilder().setColor("Red").setDescription("❌ Você não pode transferir dinheiro para si mesmo.")], 
                    ephemeral: true 
                });
            }

            if (amount <= 0) {
                return replyOrEdit(interaction, { 
                    embeds: [new EmbedBuilder().setColor("Red").setDescription("❌ O valor da transferência deve ser maior que zero.")], 
                    ephemeral: true 
                });
            }

            if (receiver.bot) {
                return replyOrEdit(interaction, { 
                    embeds: [new EmbedBuilder().setColor("Red").setDescription("❌ Você não pode transferir dinheiro para bots.")], 
                    ephemeral: true 
                });
            }

            // Busca dados do pagador
            const payerDb = await client.userdb.getOrCreate(interaction.user.id);
            
            if (payerDb.economia.money < amount) {
                return replyOrEdit(interaction, { 
                    embeds: [new EmbedBuilder().setColor("Red").setDescription(`❌ Saldo insuficiente na carteira.\n💵 Você tem: **${formatMoney(payerDb.economia.money)}**`)], 
                    ephemeral: true 
                });
            }

            const gif =
                (await getRandomGifUrl("money transfer", { rating: "pg-13" }).catch(() => null)) ||
                "https://media.giphy.com/media/3o6gDWzmAzrpi5DQU8/giphy.gif";

            // Confirmação da transação
            const confirmEmbed = new EmbedBuilder()
                .setTitle("💸 Confirmação de Transferência")
                .setColor("Yellow")
                .setDescription(`Você está prestes a transferir **${formatMoney(amount)}** para ${receiver}.\n\nClique em ✅ para confirmar ou ❌ para cancelar.`)
                .setImage(gif)
                .setFooter({ text: "WDA • Direitos reservados • Expira em 30s." });

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder().setCustomId('confirm_pay').setLabel('Confirmar').setStyle(ButtonStyle.Success).setEmoji('✅'),
                    new ButtonBuilder().setCustomId('cancel_pay').setLabel('Cancelar').setStyle(ButtonStyle.Danger).setEmoji('❌')
                );

            const msg = await replyOrEditFetch(interaction, { embeds: [confirmEmbed], components: [row] });
            if (!msg) return;

            const collector = msg.createMessageComponentCollector({ 
                componentType: ComponentType.Button,
                filter: i => i.user.id === interaction.user.id, 
                time: 30000, 
                max: 1 
            });

            collector.on('collect', async i => {
                if (i.customId === 'confirm_pay') {
                    await i.deferUpdate();

                    const debited = await debitWalletIfEnough(
                        client.userdb,
                        interaction.user.id,
                        amount,
                        "pay_out",
                        { to: receiver.id, channel: interaction.channelId }
                    );

                    if (!debited) {
                        return interaction.editReply({ embeds: [errorEmbed("❌ Saldo insuficiente na hora da confirmação.")], components: [] });
                    }

                    const credited = await creditWallet(
                        client.userdb,
                        receiver.id,
                        amount,
                        "pay_in",
                        { from: interaction.user.id, channel: interaction.channelId }
                    );

                    if (!credited) {
                        await creditWallet(
                            client.userdb,
                            interaction.user.id,
                            amount,
                            "pay_refund",
                            { reason: "credit_failed", to: receiver.id, channel: interaction.channelId }
                        ).catch(() => {});
                        return interaction.editReply({ embeds: [errorEmbed("❌ Falha ao completar a transferência. O valor foi estornado.")], components: [] });
                    }

                    const successGif =
                        (await getRandomGifUrl("anime money", { rating: "pg-13" }).catch(() => null)) ||
                        gif;

                    const successEmbed = new EmbedBuilder()
                        .setTitle("✅ Transferência Concluída")
                        .setColor("Green")
                        .setDescription(`💸 **${interaction.user.tag}** enviou **${formatMoney(amount)}** para **${receiver.tag}**.`)
                        .setImage(successGif)
                        .setTimestamp();

                    await interaction.editReply({ embeds: [successEmbed], components: [] });
                } else {
                    await i.update({ embeds: [new EmbedBuilder().setColor("Red").setDescription("❌ Transferência cancelada.")], components: [] });
                }
            });

            collector.on('end', collected => {
                if (collected.size === 0) {
                    interaction.editReply({ embeds: [new EmbedBuilder().setColor("Red").setDescription("⏰ Tempo esgotado. Transferência cancelada.")], components: [] }).catch(() => {});
                }
            });

        } catch (err) {
            logger.error("Erro ao processar pagamento", { error: String(err?.message || err) });
            replyOrEdit(interaction, { content: "Erro ao processar pagamento.", ephemeral: true }).catch(() => {});
        }
    }
};
