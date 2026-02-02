function bumpRate(userDoc, { windowMs, maxInWindow, lockMs }) {
    const now = Date.now();
    if (!userDoc.antiCheat) userDoc.antiCheat = { strikes: 0, lockedUntil: 0, windowStartAt: 0, windowCount: 0 };

    if ((userDoc.antiCheat.lockedUntil || 0) > now) {
        return { ok: false, lockedUntil: userDoc.antiCheat.lockedUntil };
    }

    const start = Number(userDoc.antiCheat.windowStartAt || 0);
    const count = Number(userDoc.antiCheat.windowCount || 0);

    if (!start || now - start >= windowMs) {
        userDoc.antiCheat.windowStartAt = now;
        userDoc.antiCheat.windowCount = 1;
        return { ok: true };
    }

    const next = count + 1;
    userDoc.antiCheat.windowCount = next;
    if (next <= maxInWindow) return { ok: true };

    userDoc.antiCheat.strikes = Math.floor((userDoc.antiCheat.strikes || 0) + 1);
    userDoc.antiCheat.lockedUntil = now + lockMs;
    return { ok: false, lockedUntil: userDoc.antiCheat.lockedUntil, strikes: userDoc.antiCheat.strikes };
}

module.exports = { bumpRate };

