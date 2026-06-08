const router = require('express').Router();
const bcrypt = require('bcrypt');

const { BCRYPT_ROUNDS } = require('../config/env');
const { supabase }      = require('../services/supabase');
const asyncHandler      = require('../utils/asyncHandler');
const { generateUserId, validatePw, validateName } = require('../utils/validators');

// Register
router.post('/register', asyncHandler(async (req, res) => {
    const { name, password } = req.body;
    if (!validateName(name))
        return res.status(400).json({ error: "Name must be 2+ characters." });
    if (!validatePw(password))
        return res.status(400).json({ error: "Password must be 6-128 characters." });

    const userId = generateUserId();
    const hashed = await bcrypt.hash(password, BCRYPT_ROUNDS);

    const { error } = await supabase.from('televault_users').insert({
        user_id: userId, name: name.trim().slice(0, 50),
        password: hashed, is_connected: false, created_at: new Date().toISOString()
    });

    if (error) {
        if (error.code === '23505')
            return res.status(400).json({ error: "Username already exists. Try another." });
        throw error;
    }

    res.json({ success: true, userId, name: name.trim() });
}));

// Login — accepts name OR userId
router.post('/login', asyncHandler(async (req, res) => {
    const { identifier, password } = req.body;
    if (!identifier || !password)
        return res.status(400).json({ error: "Missing credentials." });

    let { data: user } = await supabase
        .from('televault_users')
        .select('user_id, name, password, is_connected, channel_id, auth_method')
        .eq('user_id', identifier)
        .maybeSingle();

    if (!user) {
        const { data } = await supabase
            .from('televault_users')
            .select('user_id, name, password, is_connected, channel_id, auth_method')
            .eq('name', identifier)
            .maybeSingle();
        user = data;
    }

    if (!user) return res.status(401).json({ error: "Invalid credentials." });
    
    // Block password login for OTP users
    if (user.auth_method === 'otp') {
        return res.status(403).json({ 
            error: 'OTP_ACCOUNT',
            message: 'This account uses OTP login.' 
        });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: "Invalid credentials." });

    res.json({
        success: true, 
        userId: user.user_id, 
        name: user.name,
        isConnected: user.is_connected,
        storageMode: 'bot'
    });
}));

module.exports = router;