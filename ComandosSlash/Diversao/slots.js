const { EmbedBuilder } = require("discord.js");
const { ensureEconomyAllowed } = require("../../Utils/economyGuard");
const logger = require("../../Utils/logger");
const { replyOrEdit } = require("../../Utils/commandKit");

module.exports = {
    name: "slots",
    description: "Jogue no caça-níqueis (Cassino)",
    type: 1, // CHAT_INPUT
    autoDefer: { ephemeral: true },
    options: [
        {
            name: "aposta",
            description: "Valor da aposta",
            type: 10, // NUMBER
            required: true
        }
    ],
    run: async (client, interaction) => {
        try {
            await interaction.deferReply({ ephemeral: true }).catch(() => {});

            const gate = await ensureEconomyAllowed(client, interaction, interaction.user.id);
            if (!gate.ok) return replyOrEdit(interaction, { embeds: [gate.embed], ephemeral: true });
            
            const aposta = Math.floor(interaction.options.getNumber("aposta"));

            if (aposta <= 0) return replyOrEdit(interaction, { content: "❌ Aposta inválida.", ephemeral: true });

            // Recarrega user para garantir saldo atualizado
            const userdb = await client.userdb.getOrCreate(interaction.user.id);
            if (userdb.economia.money < aposta) return replyOrEdit(interaction, { content: "❌ Dinheiro insuficiente.", ephemeral: true });

            // Emojis do slot
            const slots = ["🍇", "🍒", "🍋", "🍊", "🍉", "💎", "7️⃣"];
            const s1 = slots[Math.floor(Math.random() * slots.length)];
            const s2 = slots[Math.floor(Math.random() * slots.length)];
            const s3 = slots[Math.floor(Math.random() * slots.length)];

            let win = 0;
            let multiplicador = 0;

            if (s1 === s2 && s2 === s3) {
                if (s1 === "7️⃣") multiplicador = 10;
                else if (s1 === "💎") multiplicador = 7;
                else multiplicador = 5;
            } else if (s1 === s2 || s2 === s3 || s1 === s3) {
                multiplicador = 1.5; // Par vale 1.5x
            }

            win = Math.floor(aposta * multiplicador);

            const embed = new EmbedBuilder()
                .setTitle("🎰 Cassino Slots")
                .setDescription(`**[ ${s1} | ${s2} | ${s3} ]**`)
                .setColor(win > 0 ? "Gold" : "Red");

            if (win > 0) {
                userdb.economia.money += (win - aposta); // Subtrai a aposta e soma o prêmio total (lucro real = win - aposta) -> ERRADO. 
                // Se aposta 100 e ganha 150 (1.5x), lucro é 50. Saldo final = Saldo - 100 + 150.
                // A lógica aqui deve ser: Debita aposta, depois soma prêmio.
                // Mas o código original fazia: userdb.economia.money += (win - aposta); 
                // Isso assume que a aposta NÃO foi debitada antes. 
                // Se win=0, ele faz userdb.economia.money -= aposta;
                // Vamos manter a lógica original corrigida:
                // Se ganhou: Saldo = Saldo + (win - aposta) [Lucro Líquido]
                // Se perdeu: Saldo = Saldo - aposta [Prejuízo]
                // Correção: Se win > aposta, lucro é win - aposta. Se win < aposta, prejuízo.
                
                // Melhor abordagem: Debita aposta sempre. Soma prêmio se houver.
                // userdb.economia.money -= aposta;
                // userdb.economia.money += win;
                // No original:
                // if (win > 0) money += (win - aposta) -> Lucro líquido adicionado
                // else money -= aposta -> Aposta subtraída
                // Está correto matematicamente se win for o valor TOTAL retornado.
                
                embed.addFields({ name: "Resultado", value: `🎉 **JACKPOT!** Você ganhou **R$ ${win}**!` });
            } else {
                userdb.economia.money -= aposta;
                embed.addFields({ name: "Resultado", value: "💸 Você perdeu tudo." });
            }

            await userdb.save();
            return replyOrEdit(interaction, { embeds: [embed], ephemeral: true });

        } catch (err) {
            logger.error("Erro no cassino (slots)", { error: String(err?.message || err) });
            replyOrEdit(interaction, { content: "Erro no cassino.", ephemeral: true }).catch(() => {});
        }
    }
};
