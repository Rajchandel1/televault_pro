const pending = new Map();

module.exports = {
    set:    (telegramId, userId) => pending.set(telegramId, userId),
    get:    (telegramId) => pending.get(telegramId),
    delete: (telegramId) => pending.delete(telegramId),
};