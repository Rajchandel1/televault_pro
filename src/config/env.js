const REQUIRED = ['BOT_TOKEN', 'SUPABASE_URL', 'SUPABASE_ANON_KEY'];
REQUIRED.forEach(k => {
    if (!process.env[k]) { console.error(`❌ Missing env: ${k}`); process.exit(1); }
});

module.exports = {
    BOT_TOKEN:     process.env.BOT_TOKEN,
    BOT_USERNAME:  process.env.BOT_USERNAME || 'Clogal_bot',
    SUPABASE_URL:  process.env.SUPABASE_URL,
    SUPABASE_KEY:  process.env.SUPABASE_ANON_KEY,
    PORT:          parseInt(process.env.PORT || '5000', 10),
    APP_URL:       process.env.APP_URL || 'http://localhost:5000',
    FRONTEND_URL:  process.env.FRONTEND_URL || '*',
    IS_PROD:       process.env.NODE_ENV === 'production',
    BCRYPT_ROUNDS: 12,
    MAX_FILE_SIZE: 50 * 1024 * 1024,
};