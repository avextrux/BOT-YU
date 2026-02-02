const Discord = require("discord.js");

const DEFAULT_OWNER_ID = process.env.CENTRAL_BANK_OWNER_ID || "589646045756129301";

function isAdminMember(interaction) {
    return (
        interaction.member?.permissions?.has("ADMINISTRATOR") ||
        interaction.member?.permissions?.has("MANAGE_GUILD")
    );
}

function hasCentralScope(eco, userId) {
    const ownerId = eco?.centralBank?.ownerId || DEFAULT_OWNER_ID;
    if (userId === ownerId) return true;
    const managers = eco?.centralBank?.managers || [];
    const entry = managers.find((m) => m.userId === userId);
    if (!entry) return false;
    const scopes = entry.scopes || [];
    return scopes.includes("tudo") || scopes.includes("eventos") || scopes.includes("votos") || scopes.includes("tesouro");
}

module.exports = {
    name: "eventohelp",
    description: "Ajuda administrativa do evento Submundo (somente ADM)",
    type: "CHAT_INPUT",
    run: async (client, interaction) => {
        try {
            const eco = await client.guildEconomydb.getOrCreate(interaction.guildId);
            const allowed = isAdminMember(interaction) || hasCentralScope(eco, interaction.user.id);
            if (!allowed) return interaction.reply({ content: "❌ Apenas administração do servidor pode ver este help.", ephemeral: true });

            const embed = new Discord.MessageEmbed()
                .setTitle("💣 Evento Submundo — Ajuda ADM")
                .setColor("DARK_BUT_NOT_BLACK")
                .setDescription(
                    [
                        "Este painel lista apenas comandos de **administração** do evento Submundo.",
                        "",
                        "Sequência recomendada:",
                        "1) Configurar canal de anúncios do evento",
                        "2) Definir chefe de polícia e abrir candidaturas",
                        "3) Ativar o Mercado Negro",
                        "4) Financiar prêmios e recompensas via Tesouro",
                    ].join("\n")
                )
                .addFields(
                    {
                        name: "Configuração do evento",
                        value: [
                            "• `/mercadonegro configurar canal:#canal ping_everyone:true|false`",
                            "• `/mercadonegro evento_ativar` / `/mercadonegro evento_desativar`",
                            "• `/policia definir_chefe usuario:@Chefe`",
                            "• `/bancocentral configurar_dono usuario:@Dono` (opcional)",
                            "• `/bancocentral gerente_adicionar usuario:@X escopo:(tudo|tesouro|votos|eventos|loja|negocios)`",
                        ].join("\n"),
                        inline: false,
                    },
                    {
                        name: "Operação (polícia)",
                        value: [
                            "• `/policia candidatar` (jogadores pedem entrada)",
                            "• `/policia aceitar|recusar` (chefe/admin)",
                            "• `/policia checkpoint` (interceptações)",
                            "• `/policia casos` (monitorar casos)",
                        ].join("\n"),
                        inline: false,
                    },
                    {
                        name: "Operação (submundo)",
                        value: [
                            "• Facções: `/faccao criar` e `/faccao territorios`",
                            "• Missões: `/mercadonegro missoes` e `/policia missoes`",
                            "• Ranking: `/mercadonegro ranking` e `/policia ranking`",
                        ].join("\n"),
                        inline: false,
                    },
                    {
                        name: "Banco Central (tesouro/prêmios)",
                        value: [
                            "• `/bancocentral status`",
                            "• `/bancocentral depositar valor:1000 motivo:...`",
                            "• `/bancocentral pagar usuario:@X valor:5000 motivo:Premiação`",
                        ].join("\n"),
                        inline: false,
                    },
                    {
                        name: "Contexto econômico",
                        value: [
                            "• `/politica set` (presidente/admin)",
                            "• `/crise iniciar|encerrar` (admin)",
                        ].join("\n"),
                        inline: false,
                    }
                )
                .setFooter({ text: `Dono padrão do Banco Central: ${DEFAULT_OWNER_ID}` });

            return interaction.reply({ embeds: [embed], ephemeral: true });
        } catch (err) {
            console.error(err);
            interaction.reply({ content: "Erro ao abrir help do evento.", ephemeral: true }).catch(() => {});
        }
    },
};

