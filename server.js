require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');
const path    = require('path');

const { IS_PROD, PORT, FRONTEND_URL } = require('./src/config/env');
const { applyRateLimiters }           = require('./src/middleware/rateLimiter');
const { errorHandler }                = require('./src/errors/errorHandler');
const { activeClients, otpSessions }  = require('./src/services/telegram');

const authRoutes   = require('./src/routes/auth');
const mediaRoutes  = require('./src/routes/media');
const folderRoutes = require('./src/routes/folders');

const app = express();

// ─── GLOBAL MIDDLEWARE ────────────────────────────────────────────

app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: {
        useDefaults: true,
        directives: {
            defaultSrc: ["'self'"],

            // ✅ Tailwind CDN + inline handlers allow
            scriptSrc: [
                "'self'",
                "'unsafe-inline'",
                "https://cdn.tailwindcss.com"
            ],

            // ✅ MOST IMPORTANT — inline onclick handlers ke liye
            scriptSrcAttr: [
                "'unsafe-inline'"
            ],

            scriptSrcElem: [
                "'self'",
                "'unsafe-inline'",
                "https://cdn.tailwindcss.com"
            ],

            styleSrc: [
                "'self'",
                "'unsafe-inline'",
                "https://fonts.googleapis.com"
            ],

            fontSrc: [
                "'self'",
                "https://fonts.gstatic.com",
                "data:"
            ],

            imgSrc: [
                "'self'",
                "data:",
                "blob:",
                "https:"
            ],

            mediaSrc: [
                "'self'",
                "blob:",
                "data:",
                "https:"
            ],

            connectSrc: [
                "'self'",
                "http://localhost:5000",
                "http://127.0.0.1:5000",
                "https://*.supabase.co",
                process.env.FRONTEND_URL || ""
            ].filter(Boolean)
        }
    }
}));

app.use(cors({
    origin:         IS_PROD ? (FRONTEND_URL || '*') : '*',
    methods:        ['GET', 'POST', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '10mb' }));

// ─── STATIC FILES ─────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ─── RATE LIMITERS ────────────────────────────────────────────────
applyRateLimiters(app);

// ─── HEALTH CHECK ─────────────────────────────────────────────────
app.get('/api/health', (req, res) =>
    res.json({ status: 'ok', version: '2.1.0', timestamp: new Date().toISOString() })
);

// ─── ROUTES ───────────────────────────────────────────────────────
app.use('/api', authRoutes);
app.use('/api', mediaRoutes);
app.use('/api', folderRoutes);

// ─── SPA FALLBACK ─────────────────────────────────────────────────
app.get('*', (req, res) => {
    if (!req.path.startsWith('/api/')) {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    }
});

// ─── ERROR HANDLER ────────────────────────────────────────────────
app.use(errorHandler);

// ─── START ────────────────────────────────────────────────────────
const server = app.listen(PORT, () =>
    console.log(`✅ TeleVault v2.1 on http://localhost:${PORT} [${IS_PROD ? 'PROD' : 'DEV'}]`)
);

// ─── GRACEFUL SHUTDOWN ────────────────────────────────────────────
const shutdown = async (signal) => {
    console.log(`\n[${signal}] Shutting down...`);
    otpSessions.destroy();
    activeClients.destroy();
    server.close(() => { console.log("✅ Closed."); process.exit(0); });
    setTimeout(() => process.exit(1), 10000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('uncaughtException',  e => console.error('[Uncaught]', e));
process.on('unhandledRejection', e => console.error('[Unhandled]', e));