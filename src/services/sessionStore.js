class SessionStore {
    constructor(ttlMs = 60 * 60 * 1000) {
        this.store   = new Map();
        this.ttl     = ttlMs;
        this.cleanup = setInterval(() => this._evictExpired(), 15 * 60 * 1000);
    }

    set(key, value) {
        this.store.set(key, { value, expiresAt: Date.now() + this.ttl });
    }

    get(key) {
        const entry = this.store.get(key);
        if (!entry) return null;
        if (Date.now() > entry.expiresAt) {
            this._disconnectEntry(entry);
            this.store.delete(key);
            return null;
        }
        entry.expiresAt = Date.now() + this.ttl;
        return entry.value;
    }

    delete(key) {
        const entry = this.store.get(key);
        if (entry) this._disconnectEntry(entry);
        this.store.delete(key);
    }

    _disconnectEntry(entry) {
        try { entry.value?.client?.disconnect(); } catch {}
    }

    _evictExpired() {
        const now = Date.now();
        for (const [key, entry] of this.store.entries()) {
            if (now > entry.expiresAt) {
                this._disconnectEntry(entry);
                this.store.delete(key);
            }
        }
    }

    destroy() {
        clearInterval(this.cleanup);
        for (const [, entry] of this.store.entries()) {
            this._disconnectEntry(entry);
        }
        this.store.clear();
    }
}

module.exports = { SessionStore };