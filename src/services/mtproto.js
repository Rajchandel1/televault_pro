const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const { Api } = require('telegram/tl');
const { CustomFile } = require('telegram/client/uploads');
const { supabase } = require('./supabase');
const nodeCrypto = require('node:crypto');
const bcrypt = require('bcrypt');

const API_ID = parseInt(process.env.TELEGRAM_API_ID);
const API_HASH = process.env.TELEGRAM_API_HASH;

if (!API_ID || !API_HASH) {
    console.warn('⚠️ MTProto credentials missing in .env');
}

const clientCache = new Map();
const connectionLocks = new Map();
const otpSessions = new Map();

// Cleanup expired OTP sessions every minute
setInterval(() => {
    const now = Date.now();
    for (const [key, data] of otpSessions.entries()) {
        if (now - data.createdAt > 10 * 60 * 1000) {
            try { data.client.disconnect(); } catch {}
            otpSessions.delete(key);
        }
    }
}, 60 * 1000);

async function createClient(sessionString = '') {
    const client = new TelegramClient(
        new StringSession(sessionString),
        API_ID,
        API_HASH,
        {
            connectionRetries: 3,
            useWSS: false,
            requestRetries: 2,
        }
    );
    await client.connect();
    return client;
}

async function getClient(userId, deviceFingerprint) {
    const key = `${userId}:${deviceFingerprint}`;
    
    if (connectionLocks.has(key)) {
        return await connectionLocks.get(key);
    }
    
    if (clientCache.has(key)) {
        const client = clientCache.get(key);
        try {
            if (client.connected) return client;
            await client.connect();
            return client;
        } catch {
            clientCache.delete(key);
        }
    }
    
    const { data: session, error } = await supabase
        .from('televault_sessions')
        .select('session_string')
        .eq('user_id', userId)
        .eq('device_fingerprint', deviceFingerprint)
        .maybeSingle();
    
    if (error) throw new Error('DB error');
    if (!session?.session_string) {
        throw new Error('NO_SESSION');
    }
    
    const lockPromise = createClient(session.session_string);
    connectionLocks.set(key, lockPromise);
    
    try {
        const client = await lockPromise;
        clientCache.set(key, client);
        
        await supabase
            .from('televault_sessions')
            .update({ last_used: new Date().toISOString() })
            .eq('user_id', userId)
            .eq('device_fingerprint', deviceFingerprint);
        
        return client;
    } finally {
        connectionLocks.delete(key);
    }
}

async function sendOTP(phone) {
    if (otpSessions.has(phone)) {
        const old = otpSessions.get(phone);
        try { await old.client.disconnect(); } catch {}
        otpSessions.delete(phone);
    }
    
    const client = await createClient();
    
    const result = await client.sendCode({
        apiId: API_ID,
        apiHash: API_HASH,
    }, phone);
    
    otpSessions.set(phone, {
        client,
        phoneCodeHash: result.phoneCodeHash,
        createdAt: Date.now(),
    });
    
    return { success: true };
}

async function verifyOTP(phone, code, twoFAPassword, deviceFingerprint, deviceName) {
    const tempSession = otpSessions.get(phone);
    if (!tempSession) throw new Error('OTP_EXPIRED');
    
    try {
        await tempSession.client.invoke(new Api.auth.SignIn({
            phoneNumber: phone,
            phoneCodeHash: tempSession.phoneCodeHash,
            phoneCode: code.trim()
        }));
    } catch (err) {
        if (err.message?.includes('SESSION_PASSWORD_NEEDED')) {
            if (!twoFAPassword) {
                otpSessions.set(phone, { ...tempSession, needs2FA: true });
                throw new Error('TWO_FA_REQUIRED');
            }
            const passwordInfo = await tempSession.client.invoke(new Api.account.GetPassword());
            const passwordCheck = await tempSession.client.computeCheck(passwordInfo, twoFAPassword);
            await tempSession.client.invoke(new Api.auth.CheckPassword({ password: passwordCheck }));
        } else if (err.message?.includes('PHONE_CODE_INVALID')) {
            throw new Error('OTP_INVALID');
        } else if (err.message?.includes('PHONE_CODE_EXPIRED')) {
            throw new Error('OTP_EXPIRED');
        } else {
            throw err;
        }
    }
    
    const sessionString = tempSession.client.session.save();
    const me = await tempSession.client.getMe();
    const telegramUserName = me.firstName || 'User';
    
    let { data: user } = await supabase
        .from('televault_users')
        .select('user_id, name')
        .eq('phone', phone)
        .maybeSingle();
    
    let userId;
    let isNewUser = false;
    let channelId = null;
    
    if (!user) {
        isNewUser = true;
        userId = nodeCrypto.randomBytes(16).toString('hex');
        
        const channelResult = await tempSession.client.invoke(
            new Api.channels.CreateChannel({
                title: '_televault_pro_storage_',
                about: 'TeleVault Pro - Private cloud storage',
                broadcast: true,
                megagroup: false,
            })
        );
        
        channelId = channelResult.chats[0].id.toString();
        
        const placeholderPwd = await bcrypt.hash(
            nodeCrypto.randomBytes(32).toString('hex'),
            12
        );
        
        const { error: createError } = await supabase
            .from('televault_users')
            .insert({
                user_id: userId,
                name: telegramUserName.slice(0, 50),
                phone: phone,
                password: placeholderPwd,
                auth_method: 'otp',
                storage_mode: 'mtproto',
                channel_id: channelId,
                is_connected: true,
                created_at: new Date().toISOString()
            });
        
        if (createError) throw createError;
    } else {
        userId = user.user_id;
        
        const { data: existingUser } = await supabase
            .from('televault_users')
            .select('channel_id')
            .eq('user_id', userId)
            .single();
        
        channelId = existingUser.channel_id;
        
        if (!channelId) {
            const channelResult = await tempSession.client.invoke(
                new Api.channels.CreateChannel({
                    title: '_televault_pro_storage_',
                    about: 'TeleVault Pro storage',
                    broadcast: true,
                    megagroup: false,
                })
            );
            channelId = channelResult.chats[0].id.toString();
            
            await supabase
                .from('televault_users')
                .update({ channel_id: channelId, is_connected: true })
                .eq('user_id', userId);
        }
    }
    
    await supabase
        .from('televault_sessions')
        .upsert({
            user_id: userId,
            device_fingerprint: deviceFingerprint,
            device_name: deviceName,
            session_string: sessionString,
            mtproto_channel_id: channelId,
            last_used: new Date().toISOString(),
        }, {
            onConflict: 'user_id,device_fingerprint'
        });
    
    const key = `${userId}:${deviceFingerprint}`;
    clientCache.set(key, tempSession.client);
    
    otpSessions.delete(phone);
    
    return {
        success: true,
        userId,
        name: telegramUserName,
        isNewUser,
    };
}

async function checkDevice(userId, deviceFingerprint) {
    const { data: session } = await supabase
        .from('televault_sessions')
        .select('id, device_name, last_used')
        .eq('user_id', userId)
        .eq('device_fingerprint', deviceFingerprint)
        .maybeSingle();
    
    return {
        hasSession: !!session,
        deviceName: session?.device_name,
        lastUsed: session?.last_used
    };
}

// Resolve channel entity — required for cross-device access
async function resolveChannel(client, channelId) {
    try {
        // Load dialogs first to populate entity cache
        await client.getDialogs({ limit: 100 });
        
        try {
            const entity = await client.getEntity(BigInt(channelId));
            return entity;
        } catch {
            const numericId = BigInt(channelId.replace('-100', ''));
            const entity = await client.getEntity(numericId);
            return entity;
        }
    } catch (err) {
        console.error('[Channel Resolve]', err.message);
        
        let cleanId = channelId.toString();
        if (cleanId.startsWith('-100')) {
            cleanId = cleanId.substring(4);
        } else if (cleanId.startsWith('-')) {
            cleanId = cleanId.substring(1);
        }
        
        try {
            const result = await client.invoke(
                new Api.channels.GetChannels({
                    id: [new Api.InputChannel({
                        channelId: BigInt(cleanId),
                        accessHash: BigInt(0)
                    })]
                })
            );
            
            if (result.chats && result.chats.length > 0) {
                const channel = result.chats[0];
                return new Api.InputPeerChannel({
                    channelId: channel.id,
                    accessHash: channel.accessHash
                });
            }
        } catch (e) {
            console.error('[Channel Resolve Fallback]', e.message);
        }
        
        throw new Error('CHANNEL_NOT_ACCESSIBLE');
    }
}

async function uploadFile(userId, deviceFingerprint, file, fileName) {
    const client = await getClient(userId, deviceFingerprint);
    
    const { data: session } = await supabase
        .from('televault_sessions')
        .select('mtproto_channel_id')
        .eq('user_id', userId)
        .eq('device_fingerprint', deviceFingerprint)
        .single();
    
    if (!session?.mtproto_channel_id) {
        throw new Error('NO_CHANNEL');
    }
    
    const toUpload = new CustomFile(
        fileName,
        file.size,
        '',
        file.buffer
    );
    
    const uploadedFile = await client.uploadFile({
        file: toUpload,
        workers: 1,
    });
    
    const inputPeer = await resolveChannel(client, session.mtproto_channel_id);
    
    const result = await client.sendFile(inputPeer, {
        file: uploadedFile,
        caption: fileName,
    });
    
    return {
        messageId: result.id,
    };
}

async function downloadFile(userId, deviceFingerprint, messageId) {
    const client = await getClient(userId, deviceFingerprint);
    
    const { data: session } = await supabase
        .from('televault_sessions')
        .select('mtproto_channel_id')
        .eq('user_id', userId)
        .eq('device_fingerprint', deviceFingerprint)
        .single();
    
    if (!session?.mtproto_channel_id) {
        throw new Error('NO_CHANNEL');
    }
    
    const inputPeer = await resolveChannel(client, session.mtproto_channel_id);
    
    const messages = await client.getMessages(
        inputPeer,
        { ids: [parseInt(messageId, 10)] }
    );
    
    if (!messages.length) throw new Error('Not found');
    
    const buffer = await client.downloadMedia(messages[0]);
    return buffer;
}

async function deleteFile(userId, deviceFingerprint, messageId) {
    const client = await getClient(userId, deviceFingerprint);
    
    const { data: session } = await supabase
        .from('televault_sessions')
        .select('mtproto_channel_id')
        .eq('user_id', userId)
        .eq('device_fingerprint', deviceFingerprint)
        .single();
    
    if (!session?.mtproto_channel_id) return;
    
    const inputPeer = await resolveChannel(client, session.mtproto_channel_id);
    
    await client.deleteMessages(
        inputPeer,
        [parseInt(messageId, 10)],
        { revoke: true }
    );
}

async function clearSession(userId, deviceFingerprint) {
    const key = `${userId}:${deviceFingerprint}`;
    
    if (clientCache.has(key)) {
        const client = clientCache.get(key);
        try { await client.disconnect(); } catch {}
        clientCache.delete(key);
    }
    
    await supabase
        .from('televault_sessions')
        .delete()
        .eq('user_id', userId)
        .eq('device_fingerprint', deviceFingerprint);
}

process.on('SIGTERM', async () => {
    console.log('Disconnecting MTProto clients...');
    for (const client of clientCache.values()) {
        try { await client.disconnect(); } catch {}
    }
});

module.exports = {
    sendOTP,
    verifyOTP,
    checkDevice,
    uploadFile,
    downloadFile,
    deleteFile,
    clearSession,
    getClient,
};