const { IS_PROD }       = require('../config/env');
const { sanitizePhone } = require('../utils/validators');
const { activeClients } = require('../services/telegram');

const errorHandler = (err, req, res, _next) => {
    console.error(`[Error] ${req.method} ${req.path}:`, err.message);

    // Session expired — clear cache
    if (err.message?.includes('AUTH_KEY_UNREGISTERED') ||
        err.message?.includes('AUTH_KEY_DUPLICATED')) {
        const phone = sanitizePhone(
            req.body?.phone || req.body?.phoneNumber || req.query?.phone
        );
        if (phone) activeClients.delete(phone);
        return res.status(401).json({ error: "SESSION_EXPIRED" });
    }

    if (err.code === 'LIMIT_FILE_SIZE')
        return res.status(413).json({ error: "File too large. Max 50MB." });

    if (err.message?.includes('Invalid file type'))
        return res.status(415).json({ error: err.message });

    if (err.message?.includes('PHONE_CODE_INVALID'))
        return res.status(400).json({ error: "Invalid OTP code." });

    if (err.message?.includes('PHONE_CODE_EXPIRED'))
        return res.status(400).json({ error: "OTP expired. Request a new one." });

    if (err.message?.includes('PASSWORD_HASH_INVALID'))
        return res.status(400).json({ error: "Incorrect Telegram 2FA password." });

    if (err.message?.includes('SESSION_PASSWORD_NEEDED'))
        return res.status(400).json({ error: "Telegram 2FA is required." });

    res.status(500).json({
        error: IS_PROD ? "Internal server error." : err.message
    });
};

module.exports = { errorHandler };