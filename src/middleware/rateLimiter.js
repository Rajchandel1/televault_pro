const rateLimit = require('express-rate-limit');

module.exports = (app) => {
    app.use('/api/register', rateLimit({ windowMs: 15*60*1000, max: 5 }));
    app.use('/api/login',    rateLimit({ windowMs: 15*60*1000, max: 10 }));
    app.use('/api/upload',   rateLimit({ windowMs: 60*1000,    max: 30 }));
    app.use('/api/',         rateLimit({ windowMs: 60*1000,    max: 120 }));
};