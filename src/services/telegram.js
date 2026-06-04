const { TelegramClient, Api } = require("telegram");
const { StringSession }       = require("telegram/sessions");
const { CustomFile }          = require("telegram/client/uploads");
const { API_ID, API_HASH }    = require("../config/env");
const { supabase }            = require("./supabase");
const { SessionStore }        = require("./sessionStore");

// ─── STORES ───────────────────────────────────────────────────────
const otpSessions   = new SessionStore(10 * 60 * 1000);  // 10 min
const activeClients = new SessionStore(60 * 60 * 1000);  // 60 min

// ─── CONNECTION LOCK — prevents AUTH_KEY_DUPLICATED ───────────────
const connectionLocks = new Map();

const withConnectionLock = async (phone, fn) => {
    while (connectionLocks.get(phone)) {
        await new Promise(r => setTimeout(r, 100));
    }
    connectionLocks.set(phone, true);
    try {
        return await fn();
    } finally {
        connectionLocks.delete(phone);
    }
};

// ─── CLIENT FACTORY ───────────────────────────────────────────────
const createTelegramClient = async (sessionString = "") => {
    const client = new TelegramClient(
        new StringSession(sessionString),
        API_ID,
        API_HASH,
        {
            connectionRetries: 3,
            retryDelay: 2000,
            autoReconnect: true,
            useWSS: false,
            maxConcurrentDownloads: 1,
        }
    );
    await client.connect();
    return client;
};

// ─── GET CLIENT — singleton with lock ─────────────────────────────
const getClient = async (cleanPhone) => {
    return withConnectionLock(cleanPhone, async () => {
        // Check cache
        const cached = activeClients.get(cleanPhone);
        if (cached) {
            try {
                if (!cached.client.connected) {
                    console.log(`[Session] Reconnecting ${cleanPhone}...`);
                    await cached.client.connect();
                }
                return cached;
            } catch (err) {
                console.warn(`[Session] Reconnect failed for ${cleanPhone}:`, err.message);
                try { await cached.client.disconnect(); } catch {}
                activeClients.delete(cleanPhone);
            }
        }

        // Restore from DB
        const { data: user, error } = await supabase
            .from('teledrive_users')
            .select('session_string, channel_id, access_hash')
            .eq('phone', cleanPhone)
            .maybeSingle();

        if (error) throw new Error(`Database error: ${error.message}`);
        if (!user)  throw new Error("Session not found. Please log in again.");

        console.log(`[Session] Creating fresh client for ${cleanPhone}...`);
        const client = await createTelegramClient(user.session_string);

        const sessionData = {
            client,
            channelId:  user.channel_id,
            accessHash: user.access_hash
        };

        activeClients.set(cleanPhone, sessionData);
        return sessionData;
    });
};

// ─── HELPERS ──────────────────────────────────────────────────────
const buildInputPeer = (channelId, accessHash) =>
    new Api.InputPeerChannel({
        channelId:  BigInt(channelId),
        accessHash: BigInt(accessHash)
    });

module.exports = {
    otpSessions,
    activeClients,
    createTelegramClient,
    getClient,
    buildInputPeer,
    Api,
    CustomFile,
};