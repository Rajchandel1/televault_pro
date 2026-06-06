const helmet = require('helmet');
const cors   = require('cors');
const { IS_PROD, FRONTEND_URL } = require('../config/env');

module.exports = (app) => {
    app.use(helmet({
        crossOriginResourcePolicy: { policy: "cross-origin" },
        contentSecurityPolicy: {
            directives: {
                defaultSrc:    ["'self'"],
                scriptSrc:     ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com"],
                scriptSrcAttr: ["'unsafe-inline'"],
                scriptSrcElem: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com"],
                styleSrc:      ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
                fontSrc:       ["'self'", "https://fonts.gstatic.com"],
                imgSrc:        ["'self'", "data:", "blob:", "https:"],
                mediaSrc:      ["'self'", "blob:", "https:"],
                connectSrc:    ["'self'", "https://*.supabase.co", "http://localhost:5000"]
            }
        }
    }));

    app.use(cors({
        origin:         IS_PROD ? FRONTEND_URL : '*',
        methods:        ['GET', 'POST', 'DELETE'],
        allowedHeaders: ['Content-Type', 'Authorization']
    }));

    // SEO + Performance headers
    app.use((req, res, next) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'SAMEORIGIN');
        res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
        res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
        next();
    });
};