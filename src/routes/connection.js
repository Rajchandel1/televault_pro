const router = require('express').Router();

const { supabase }            = require('../services/supabase');
const { bot }                 = require('../services/telegram');
const asyncHandler            = require('../utils/asyncHandler');
const { normalizeChannelId }  = require('../utils/normalizers');

// Connection status
router.get('/connection-status', asyncHandler(async (req, res) => {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: "Missing userId." });

    const { data: user, error } = await supabase
        .from('televault_users')
        .select('is_connected, channel_id')
        .eq('user_id', userId).maybeSingle();

    if (error) throw error;
    if (!user) return res.status(404).json({ error: "User not found." });
    res.json({ isConnected: user.is_connected });
}));

// User info (for settings)
router.get('/me', asyncHandler(async (req, res) => {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: "Missing userId." });

    const { data: user, error } = await supabase
        .from('televault_users')
        .select('user_id, name, is_connected, channel_id, created_at')
        .eq('user_id', userId).maybeSingle();

    if (error) throw error;
    if (!user) return res.status(404).json({ error: "User not found." });

    // Mask channel ID for security — show only last 4 digits
    const maskedChannel = user.channel_id
        ? '••••' + String(user.channel_id).slice(-4)
        : null;

    res.json({
        userId:        user.user_id,
        name:          user.name,
        isConnected:   user.is_connected,
        storageMasked: maskedChannel,
        createdAt:     user.created_at
    });
}));

// Set channel
router.post('/set-channel', asyncHandler(async (req, res) => {
    const { userId, channelId } = req.body;
    if (!userId || !channelId) return res.status(400).json({ error: "Missing parameters." });

    const raw = String(channelId).trim();
    
    // Generate possible formats to try
    const candidates = [];
    
    if (raw.startsWith('@')) {
        candidates.push(raw);
    } else if (raw.includes('t.me/')) {
        candidates.push('@' + raw.split('t.me/')[1].replace(/\//g, '').trim());
    } else if (/^-100\d+$/.test(raw)) {
        candidates.push(raw);
    } else if (/^-\d+$/.test(raw)) {
        // Try as-is (group) and with -100 (channel)
        candidates.push(raw);
        candidates.push('-100' + raw.slice(1));
    } else if (/^\d+$/.test(raw)) {
        // Try -100 prefix and negative
        candidates.push('-100' + raw);
        candidates.push('-' + raw);
    } else {
        candidates.push(raw);
    }

    console.log(`[Channel Setup] Trying IDs:`, candidates);

    let workingId = null;
    let lastError = '';

    for (const id of candidates) {
        try {
            const testMsg = await bot.api.sendMessage(id, "🔐 TeleVault vault initialized!");
            await bot.api.deleteMessage(id, testMsg.message_id).catch(() => {});
            workingId = id;
            console.log(`[Channel Setup] ✅ Working ID: ${id}`);
            break;
        } catch (err) {
            lastError = err.message;
            console.log(`[Channel Setup] ❌ Failed ${id}: ${err.message}`);
        }
    }

    if (!workingId) {
        if (lastError.includes('chat not found'))
            return res.status(400).json({ error: "Channel/group not found. Check the ID." });
        if (lastError.includes('CHAT_WRITE_FORBIDDEN') ||
            lastError.includes('not enough rights') ||
            lastError.includes('not a member'))
            return res.status(400).json({ error: "Bot is not admin. Add @Clogal_bot as admin first." });
        return res.status(400).json({ error: "Cannot access. Check ID and bot permissions." });
    }

    const { error } = await supabase.from('televault_users')
        .update({ channel_id: workingId, is_connected: true })
        .eq('user_id', userId);
    if (error) throw error;

    res.json({ success: true });
}));

module.exports = router;