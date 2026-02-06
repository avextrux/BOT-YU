const { Events, EmbedBuilder } = require("discord.js");
const Contract = require("../../Database/contract");
const logger = require("../../Utils/logger");

module.exports = (client) => {
    client.on(Events.ClientReady, async () => {
        // Checar contratos a cada 10 min
        setInterval(async () => {
            try {
                const now = Date.now();
                // Atrasado e não resolvido
                const overdue = await Contract.find({
                    status: "active",
                    dueAt: { $lt: now, $gt: 0 }
                });

                if (!overdue || overdue.length === 0) return;

                logger.info("Contracts", `Found ${overdue.length} overdue contracts.`);

                for (const c of overdue) {
                    try {
                        const fine = c.fine || 0;
                        const partyA = c.partyA; // quem deve cumprir
                        const partyB = c.partyB; // beneficiário

                        // Pega users
                        const userA = await client.userdb.findOne({ userID: partyA });
                        const userB = await client.userdb.findOne({ userID: partyB });

                        const escrowA = c.escrow?.a || 0;
                        const escrowB = c.escrow?.b || 0;

                        // Se A falhou, ele perde escrowA e paga multa. B recebe escrowB de volta + multa (se A tiver) + escrowA.
                        // Simplificando: A perde tudo que pôs. B recebe tudo de volta + multa tirada de A.
                        // Mas "multa" geralmente sai da conta de A além do escrow.

                        // Lógica:
                        // A não cumpriu.
                        // A perde escrowA.
                        // B recebe escrowB (de volta) + escrowA (indenização) + multa (se possível).

                        const refundB = escrowB + escrowA;
                        let finePaid = 0;

                        if (userA && fine > 0) {
                            if (userA.economia.money >= fine) {
                                userA.economia.money -= fine;
                                finePaid = fine;
                            } else {
                                finePaid = userA.economia.money;
                                userA.economia.money = 0;
                            }
                            // A perde reputação? opcional
                        }

                        // Paraleliza os saves dos usuários
                        const updates = [];

                        if (userA) {
                            updates.push(userA.save());
                        }

                        if (userB) {
                            userB.economia.money += (refundB + finePaid);
                            updates.push(userB.save());
                        }

                        await Promise.all(updates);

                        // Marca contrato como falho
                        c.status = "failed";
                        c.completion.aConfirmed = false;
                        c.completion.bConfirmed = false;
                        await c.save();

                        // Notificar na DM ou canal logs se possível
                        // Tentar achar usuario no cache
                        const discordUserA = await client.users.fetch(partyA).catch(() => null);
                        const discordUserB = await client.users.fetch(partyB).catch(() => null);

                        const embed = new EmbedBuilder()
                            .setTitle("📜 Contrato Expirado/Falhado")
                            .setColor("Red")
                            .setDescription(`O contrato **${c.title}** venceu e a Parte A não cumpriu.`)
                            .addFields(
                                { name: "ID", value: `\`${String(c._id).slice(-6)}\``, inline: true },
                                { name: "Multa Aplicada", value: `R$ ${finePaid}`, inline: true },
                                { name: "Repasse à Parte B", value: `R$ ${refundB + finePaid}`, inline: true }
                            )
                            .setTimestamp();

                        if (discordUserA) discordUserA.send({ embeds: [embed] }).catch(() => { });
                        if (discordUserB) discordUserB.send({ embeds: [embed] }).catch(() => { });

                        logger.info("Contracts", `Contract ${c._id} failed. Fine applied.`);

                    } catch (err) {
                        logger.error("Contracts", `Error processing contract ${c._id}: ${err.message}`);
                    }
                }

            } catch (err) {
                logger.error("Contracts", `Error in contract loop: ${err.message}`);
            }
        }, 10 * 60 * 1000);
    });
};

