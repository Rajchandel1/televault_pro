module.exports = {
    normalizeChannelId: (input) => {
        if (!input) return null;
        let v = String(input).trim();
        if (v.startsWith('@')) return v;
        if (v.includes('t.me/')) {
            const u = v.split('t.me/')[1].replace(/\//g, '').trim();
            if (u) return '@' + u;
        }
        if (/^-100\d+$/.test(v)) return v;
        if (/^\d+$/.test(v)) return '-100' + v;
        if (/^-\d+$/.test(v) && !v.startsWith('-100')) return '-100' + v.slice(1);
        return v;
    }
};