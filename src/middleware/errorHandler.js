const { IS_PROD } = require('../config/env');

module.exports = (err, req, res, _next) => {
    console.error(`[Error] ${req.method} ${req.path}:`, err.message);

    if (err.code === 'LIMIT_FILE_SIZE')
        return res.status(413).json({ error: "File too large. Max 50MB." });
    if (err.message?.includes('Invalid file type'))
        return res.status(415).json({ error: err.message });

    res.status(500).json({
        error: IS_PROD ? "Something went wrong. Please try again." : err.message
    });
};  