require('dotenv').config();
const express = require('express');
const path    = require('path');

const { PORT, IS_PROD } = require('./src/config/env');
const security          = require('./src/middleware/security');
const rateLimiter       = require('./src/middleware/rateLimiter');
const errorHandler      = require('./src/middleware/errorHandler');
const { startBot }      = require('./src/bot/handlers');

const authRoutes       = require('./src/routes/auth');
const connectionRoutes = require('./src/routes/connection');
const mediaRoutes      = require('./src/routes/media');
const folderRoutes     = require('./src/routes/folders');

const app = express();

// Security & parsing
security(app);
app.use(express.json({ limit: '10mb' }));

// Serve robots.txt and sitemap.xml with proper headers
app.get('/robots.txt', (req, res) => {
    res.type('text/plain');
    res.sendFile(path.join(__dirname, 'public', 'robots.txt'));
});

app.get('/sitemap.xml', (req, res) => {
    res.type('application/xml');
    res.sendFile(path.join(__dirname, 'public', 'sitemap.xml'));
});

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Rate limiting
rateLimiter(app);

// API routes
app.get('/api/health', (req, res) =>
    res.json({ status: 'ok', version: '4.0.0', timestamp: new Date().toISOString() })
);
app.use('/api', authRoutes);
app.use('/api', connectionRoutes);
app.use('/api', mediaRoutes);
app.use('/api', folderRoutes);

// SPA fallback
app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) return;
    const exts = ['.js','.css','.png','.jpg','.ico','.json','.svg','.webp'];
    if (exts.some(e => req.path.endsWith(e))) return res.status(404).send('Not found');
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use(errorHandler);

// Start bot
startBot();

// Start server
app.listen(PORT, () =>
    console.log(`✅ TeleVault v4.0 on http://localhost:${PORT} [${IS_PROD ? 'PROD' : 'DEV'}]`)
);

process.on('uncaughtException',  e => console.error('[Uncaught]', e));
process.on('unhandledRejection', e => console.error('[Unhandled]', e));