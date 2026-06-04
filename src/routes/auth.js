const router = require('express').Router();
const bcrypt = require('bcrypt');

const { BCRYPT_ROUNDS }                     = require('../config/env');
const { asyncHandler }                      = require('../utils/asyncHandler');
const { sanitizePhone, validateOTP, validatePassword } = require('../utils/validators');
const { supabase }                          = require('../services/supabase');
const {
    otpSessions, activeClients,
    createTelegramClient, getClient, Api
} = require('../services/telegram');

// ─── HELPER: Finalize registration ────────────────────────────────
const finalizeRegistration = async (client, cleanPhone, appPassword) => {
    const savedSession = client.session.save();

    const channelResult = await client.invoke(
        new Api.channels.CreateChannel({
            title:     "_televault_secure_storage_",
            about:     "TeleVault Drive — Do not delete.",
            broadcast: true,
            megagroup: false
        })
    );

    const channel    = channelResult.chats[0];
    const channelId  = channel.id.toString();
    const accessHash = channel.accessHash.toString();
    const hashedPw   = await bcrypt.hash(appPassword, BCRYPT_ROUNDS);

    const { error } = await supabase.from('teledrive_users').upsert({
        phone:          cleanPhone,
        password:       hashedPw,
        session_string: savedSession,
        channel_id:     channelId,
        access_hash:    accessHash,
        created_at:     new Date().toISOString()
    }, { onConflict: 'phone' });

    if (error) throw error;
    activeClients.set(cleanPhone, { client, channelId, accessHash });
};

// ─── CHECK USER ───────────────────────────────────────────────────
router.post('/check-user', asyncHandler(async (req, res) => {
    const cleanPhone = sanitizePhone(req.body.phoneNumber);
    if (!cleanPhone) return res.status(400).json({ error: "Invalid phone number." });

    const { data, error } = await supabase
        .from('teledrive_users').select('phone')
        .eq('phone', cleanPhone).maybeSingle();

    if (error) throw error;
    res.json({ exists: !!data });
}));

// ─── SEND OTP ─────────────────────────────────────────────────────
router.post('/send-otp', asyncHandler(async (req, res) => {
    const cleanPhone = sanitizePhone(req.body.phoneNumber);
    if (!cleanPhone) return res.status(400).json({ error: "Invalid phone number." });

    // Cleanup existing
    const existing = otpSessions.get(cleanPhone);
    if (existing?.client) {
        try { await existing.client.disconnect(); } catch {}
        otpSessions.delete(cleanPhone);
    }

    const client = await createTelegramClient();
    const result = await client.sendCode(
        { apiId: require('../config/env').API_ID, apiHash: require('../config/env').API_HASH },
        cleanPhone
    );

    otpSessions.set(cleanPhone, {
        client,
        phoneCodeHash: result.phoneCodeHash,
        step: 'otp'
    });

    console.log(`[OTP] Sent to ${cleanPhone}`);
    res.json({ success: true });
}));

// ─── VERIFY OTP ───────────────────────────────────────────────────
router.post('/verify-otp', asyncHandler(async (req, res) => {
    const { otpCode, password } = req.body;
    const cleanPhone = sanitizePhone(req.body.phoneNumber);

    if (!cleanPhone)                 return res.status(400).json({ error: "Invalid phone number." });
    if (!validateOTP(otpCode))       return res.status(400).json({ error: "Invalid OTP format." });
    if (!validatePassword(password)) return res.status(400).json({ error: "Password must be 6-128 chars." });

    const tempSession = otpSessions.get(cleanPhone);
    if (!tempSession) return res.status(400).json({ error: "OTP expired. Request a new one." });

    try {
        await tempSession.client.invoke(new Api.auth.SignIn({
            phoneNumber:   cleanPhone,
            phoneCodeHash: tempSession.phoneCodeHash,
            phoneCode:     otpCode.trim()
        }));
    } catch (err) {
        if (err.message?.includes('SESSION_PASSWORD_NEEDED')) {
            otpSessions.set(cleanPhone, {
                ...tempSession,
                step:        '2fa',
                appPassword: password
            });
            return res.status(200).json({ requires2FA: true });
        }
        throw err;
    }

    await finalizeRegistration(tempSession.client, cleanPhone, password);
    otpSessions.delete(cleanPhone);
    res.json({ success: true });
}));

// ─── VERIFY 2FA ───────────────────────────────────────────────────
router.post('/verify-2fa', asyncHandler(async (req, res) => {
    const { twoFaPassword } = req.body;
    const cleanPhone        = sanitizePhone(req.body.phoneNumber);

    if (!cleanPhone || !twoFaPassword)
        return res.status(400).json({ error: "Missing parameters." });

    const tempSession = otpSessions.get(cleanPhone);
    if (!tempSession || tempSession.step !== '2fa')
        return res.status(400).json({ error: "Session expired. Start over." });

    const passwordInfo  = await tempSession.client.invoke(new Api.account.GetPassword());
    const passwordCheck = await tempSession.client.computeCheck(passwordInfo, twoFaPassword);
    await tempSession.client.invoke(new Api.auth.CheckPassword({ password: passwordCheck }));

    await finalizeRegistration(tempSession.client, cleanPhone, tempSession.appPassword);
    otpSessions.delete(cleanPhone);
    res.json({ success: true });
}));

// ─── PASSWORD LOGIN ───────────────────────────────────────────────
router.post('/login-password', asyncHandler(async (req, res) => {
    const { password } = req.body;
    const cleanPhone   = sanitizePhone(req.body.phoneNumber);

    if (!cleanPhone)                 return res.status(400).json({ error: "Invalid phone number." });
    if (!validatePassword(password)) return res.status(400).json({ error: "Invalid password." });

    const { data: user, error } = await supabase
        .from('teledrive_users').select('password')
        .eq('phone', cleanPhone).maybeSingle();

    if (error) throw error;
    if (!user)  return res.status(401).json({ error: "Account not found." });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: "Incorrect password." });

    // Warm session in background
    getClient(cleanPhone).catch(e =>
        console.warn(`[Session] Warm failed: ${e.message}`)
    );

    res.json({ success: true });
}));

module.exports = router;