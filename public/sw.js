// public/sw.js — REPLACE COMPLETE
const CACHE_NAME = 'televault-v3'; // Version badhao taaki purana cache clear ho
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/manifest.json',
    '/app.js',
    '/icons/icon-192.png',
    '/icons/icon-512.png'
];

self.addEventListener('install', e => {
    e.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(STATIC_ASSETS))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', e => {
    const url = new URL(e.request.url);

    // ❌ NEVER cache CDN requests (Tailwind, Google Fonts)
    if (url.hostname === 'cdn.tailwindcss.com' ||
        url.hostname === 'fonts.googleapis.com' ||
        url.hostname === 'fonts.gstatic.com') {
        return; // Network only
    }

    // ❌ NEVER cache API calls
    if (url.pathname.startsWith('/api/')) {
        return; // Network only
    }

    // ✅ Cache only our static assets
    if (STATIC_ASSETS.some(asset => url.pathname === asset || url.pathname.endsWith('.js'))) {
        e.respondWith(
            caches.match(e.request)
                .then(cached => cached || fetch(e.request))
        );
        return;
    }

    // Default: network first
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});