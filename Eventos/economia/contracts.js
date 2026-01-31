const client = require("../../index");

async function processOverdue() {
    try {
        if (!client.contractdb || !client.userdb) return;
        const now = Date.now();

        const overdue = await client.contractdb
            .find({ status: "active", dueAt: { $gt: 0, $lte: now }, "dispute.active": false })
            .limit(50);

        for (const c of overdue) {
            const aOk = !!c.completion?.aConfirmed;
            const bOk = !!c.completion?.bConfirmed;
            if (aOk === bOk) continue;

            const winner = aOk ? c.partyA : c.partyB;
            const loser = aOk ? c.partyB : c.partyA;

            const aEsc = c.escrow?.a || 0;
            const bEsc = c.escrow?.b || 0;
            const loserEsc = winner === c.partyA ? bEsc : aEsc;
            const winnerEsc = winner === c.partyA ? aEsc : bEsc;

            const fine = Math.min(c.fine || 0, loserEsc);
            const loserReturn = Math.max(0, loserEsc - fine);

            await client.userdb.getOrCreate(winner).catch(() => {});
            await client.userdb.getOrCreate(loser).catch(() => {});

            await client.userdb.findOneAndUpdate(
                { userID: winner },
                {
                    $inc: { "economia.money": winnerEsc + fine },
                    $push: {
                        "economia.transactions": {
                            $each: [
                                {
                                    at: now,
                                    type: "contract_auto_win",
                                    walletDelta: winnerEsc + fine,
                                    bankDelta: 0,
                                    meta: { contract: String(c._id), loser },
                                },
                            ],
                            $slice: -50,
                        },
                    },
                }
            );

            await client.userdb.findOneAndUpdate(
                { userID: loser },
                {
                    $inc: { "economia.money": loserReturn },
                    $push: {
                        "economia.transactions": {
                            $each: [
                                {
                                    at: now,
                                    type: "contract_auto_lose",
                                    walletDelta: loserReturn,
                                    bankDelta: 0,
                                    meta: { contract: String(c._id), fine },
                                },
                            ],
                            $slice: -50,
                        },
                    },
                }
            );

            c.status = "resolved";
            c.dispute.decidedWinner = winner;
            c.dispute.active = false;
            await c.save().catch(() => {});
        }
    } catch (err) {
        console.error(err);
    }
}

client.on("ready", () => {
    setInterval(() => {
        processOverdue();
    }, 60 * 1000);
});

