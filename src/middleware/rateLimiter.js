const rateLimit = require('express-rate-limit');

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { error: "Too many attempts. Try again later." },
    standardHeaders: true,
    legacyHeaders: false
});

const uploadLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    message: { error: "Upload rate limit exceeded." }
});

const generalLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    message: { error: "Rate limit exceeded." }
});

const applyRateLimiters = (app) => {
    app.use('/api/send-otp',       authLimiter);
    app.use('/api/verify-otp',     authLimiter);
    app.use('/api/verify-2fa',     authLimiter);
    app.use('/api/login-password', authLimiter);
    app.use('/api/upload',         uploadLimiter);
    app.use('/api/',               generalLimiter);
};

module.exports = { applyRateLimiters };