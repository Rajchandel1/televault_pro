const router = require('express').Router();
const asyncHandler = require('../utils/asyncHandler');
const mtproto = require('../services/mtproto');
const { supabase } = require('../services/supabase');

router.post('/mtproto/send-otp', asyncHandler(async (req, res) => {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: 'Phone required' });
    
    if (!/^\+\d{10,15}$/.test(phone)) {
        return res.status(400).json({ error: 'Invalid format. Use +911234567890' });
    }
    
    try {
        await mtproto.sendOTP(phone);
        res.json({ success: true });
    } catch (err) {
        console.error('[OTP Send]', err.message);
        res.status(500).json({ error: 'Failed to send OTP. Try again.' });
    }
}));

router.post('/mtproto/verify-otp', asyncHandler(async (req, res) => {
    const { phone, code, twoFAPassword, deviceFingerprint, deviceName } = req.body;
    
    if (!phone || !code || !deviceFingerprint) {
        return res.status(400).json({ error: 'Missing params' });
    }
    
    try {
        const result = await mtproto.verifyOTP(
            phone, 
            code, 
            twoFAPassword, 
            deviceFingerprint, 
            deviceName || 'Unknown Device'
        );
        res.json(result);
    } catch (err) {
        console.error('[OTP Verify]', err.message);
        
        if (err.message === 'TWO_FA_REQUIRED') {
            return res.json({ requires2FA: true });
        }
        if (err.message === 'OTP_EXPIRED') {
            return res.status(400).json({ error: 'OTP expired. Send new one.' });
        }
        if (err.message === 'OTP_INVALID') {
            return res.status(400).json({ error: 'Invalid OTP. Try again.' });
        }
        
        res.status(500).json({ error: err.message || 'Verification failed' });
    }
}));

router.get('/mtproto/check-device', asyncHandler(async (req, res) => {
    const { userId, deviceFingerprint } = req.query;
    if (!userId || !deviceFingerprint) {
        return res.status(400).json({ error: 'Missing params' });
    }
    
    const result = await mtproto.checkDevice(userId, deviceFingerprint);
    res.json(result);
}));

router.get('/mtproto/devices', asyncHandler(async (req, res) => {
    const { userId } = req.query;
    
    const { data: devices } = await supabase
        .from('televault_sessions')
        .select('id, device_name, last_used, created_at')
        .eq('user_id', userId)
        .order('last_used', { ascending: false });
    
    res.json({ devices: devices || [] });
}));

router.delete('/mtproto/devices/:id', asyncHandler(async (req, res) => {
    const { userId } = req.body;
    
    await supabase
        .from('televault_sessions')
        .delete()
        .eq('id', req.params.id)
        .eq('user_id', userId);
    
    res.json({ success: true });
}));


// New endpoint in mtproto.js routes
router.post('/mtproto/logout-all', asyncHandler(async (req, res) => {
    const { userId } = req.body;
    
    // Get all sessions
    const { data: sessions } = await supabase
        .from('televault_sessions')
        .select('id, device_fingerprint')
        .eq('user_id', userId);
    
    // Disconnect and delete each
    for (const session of sessions || []) {
        await mtproto.clearSession(userId, session.device_fingerprint);
    }
    
    res.json({ success: true, count: sessions?.length || 0 });
}));
module.exports = router;