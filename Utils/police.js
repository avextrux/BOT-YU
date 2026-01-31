async function getPolice(client, guildId) {
    if (!client.policedb?.getOrCreate) return null;
    return client.policedb.getOrCreate(guildId);
}

function isChief(police, userId) {
    return !!police?.chiefId && police.chiefId === userId;
}

function isOfficer(police, userId) {
    if (!police) return false;
    if (isChief(police, userId)) return true;
    return Array.isArray(police.officers) && police.officers.includes(userId);
}

module.exports = { getPolice, isChief, isOfficer };

