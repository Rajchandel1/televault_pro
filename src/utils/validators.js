const sanitizePhone = (phone) => {
    if (!phone || typeof phone !== 'string') return null;
    let clean = phone.trim().replace(/\s+/g, '').replace(/[^\d+]/g, '');
    if (!clean.startsWith('+')) clean = '+' + clean;
    if (!/^\+\d{7,15}$/.test(clean)) return null;
    return clean;
};

const validateOTP = (v) =>
    !!v && typeof v === 'string' && /^\d{4,6}$/.test(v.trim());

const validatePassword = (v) =>
    !!v && typeof v === 'string' && v.length >= 6 && v.length <= 128;

module.exports = { sanitizePhone, validateOTP, validatePassword };