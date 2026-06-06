const crypto = require('crypto');

module.exports = {
    generateUserId: () => crypto.randomBytes(16).toString('hex'),
    validatePw:     pw => pw && typeof pw === 'string' && pw.length >= 6 && pw.length <= 128,
    validateName:   n  => n && typeof n === 'string' && n.trim().length >= 2,
};