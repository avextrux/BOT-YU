function getVoteCount(votes, userId) {
    if (!votes) return 0;
    if (typeof votes.get === "function") return votes.get(userId) || 0;
    return votes[userId] || 0;
}

function setVoteCount(votes, userId, value) {
    if (!votes) return;
    if (typeof votes.set === "function") votes.set(userId, value);
    else votes[userId] = value;
}

function deleteVote(votes, userId) {
    if (!votes) return;
    if (typeof votes.delete === "function") votes.delete(userId);
    else delete votes[userId];
}

function getTotalVotes(election, userId) {
    return getVoteCount(election?.votes, userId) + getVoteCount(election?.paidVotes, userId);
}

function getSortedResults(election) {
    const candidates = election?.candidates || [];
    return candidates
        .map((id, idx) => ({ id, votes: getTotalVotes(election, id), paid: getVoteCount(election?.paidVotes, id), idx }))
        .sort((a, b) => (b.votes - a.votes) || (a.idx - b.idx));
}

function getVotePrice(election) {
    const shop = election?.voteShop || {};
    const basePrice = Math.max(1, Math.floor(shop.basePrice || 0));
    const increment = Math.max(0, Math.floor(shop.increment || 0));
    const sold = Math.max(0, Math.floor(shop.sold || 0));
    let price = basePrice + sold * increment;

    const now = Date.now();
    const boostUntil = Math.floor(shop.boostUntil || 0);
    if (boostUntil > now) {
        const mult = Number(shop.boostMultiplier || 1.0);
        if (Number.isFinite(mult) && mult > 0) price = Math.max(1, Math.floor(price * mult));
    }
    return price;
}

function ensureElectionDefaults(eco) {
    if (!eco.election) {
        eco.election = {
            active: false,
            endsAt: 0,
            candidates: [],
            votes: new Map(),
            paidVotes: new Map(),
            voters: [],
            announceChannelId: null,
            pingEveryone: false,
            voteShop: { enabled: true, basePrice: 500, increment: 50, sold: 0, lastEventAt: 0, boostUntil: 0, boostMultiplier: 1.0 },
        };
    }
    if (eco.election.active === undefined) eco.election.active = false;
    if (eco.election.endsAt === undefined) eco.election.endsAt = 0;
    if (!Array.isArray(eco.election.candidates)) eco.election.candidates = [];
    if (!eco.election.votes) eco.election.votes = new Map();
    if (!eco.election.paidVotes) eco.election.paidVotes = new Map();
    if (!eco.election.voters) eco.election.voters = [];
    if (eco.election.announceChannelId === undefined) eco.election.announceChannelId = null;
    if (eco.election.pingEveryone === undefined) eco.election.pingEveryone = false;
    if (!eco.election.voteShop) eco.election.voteShop = { enabled: true, basePrice: 500, increment: 50, sold: 0, lastEventAt: 0, boostUntil: 0, boostMultiplier: 1.0 };
    if (eco.election.voteShop.enabled === undefined) eco.election.voteShop.enabled = true;
    if (eco.election.voteShop.basePrice === undefined) eco.election.voteShop.basePrice = 500;
    if (eco.election.voteShop.increment === undefined) eco.election.voteShop.increment = 50;
    if (eco.election.voteShop.sold === undefined) eco.election.voteShop.sold = 0;
    if (eco.election.voteShop.lastEventAt === undefined) eco.election.voteShop.lastEventAt = 0;
    if (eco.election.voteShop.boostUntil === undefined) eco.election.voteShop.boostUntil = 0;
    if (eco.election.voteShop.boostMultiplier === undefined) eco.election.voteShop.boostMultiplier = 1.0;
}

module.exports = {
    getVoteCount,
    setVoteCount,
    deleteVote,
    getTotalVotes,
    getSortedResults,
    getVotePrice,
    ensureElectionDefaults
};
