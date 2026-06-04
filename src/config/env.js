const REQUIRED = ['TELEGRAM_API_ID', 'TELEGRAM_API_HASH', 'SUPABASE_URL', 'SUPABASE_ANON_KEY'];

REQUIRED.forEach(key => {
    if (!process.env[key]) {
        console.error(`❌ Missing env var: ${key}`);
        process.exit(1);
    }
});

module.exports = {
    API_ID:        parseInt(process.env.TELEGRAM_API_ID, 10),
    API_HASH:      process.env.TELEGRAM_API_HASH,
    PORT:          parseInt(process.env.PORT || '5000', 10),
    BCRYPT_ROUNDS: 12,
    MAX_FILE_SIZE: 50 * 1024 * 1024, // 50MB
    IS_PROD:       process.env.NODE_ENV === 'production',
    FRONTEND_URL:  process.env.FRONTEND_URL || '*',
    SUPABASE_URL:  process.env.SUPABASE_URL,
    SUPABASE_KEY:  process.env.SUPABASE_ANON_KEY,
};