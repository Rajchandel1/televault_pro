const cache = new Map();
const MAX   = 1000;

module.exports = {
    get: (key) => cache.get(key),
    set: (key, value) => {
        if (cache.size > MAX) cache.clear();
        cache.set(key, value);
    },
    delete: (key) => cache.delete(key),
};