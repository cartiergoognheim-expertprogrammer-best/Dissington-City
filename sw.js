/**
 * Dissington City — sw.js (Service Worker)
 *
 * Caches the app shell for instant load and offline use.
 * Audio files are cached as they play for offline playback.
 * tracks.json is fetched fresh from the network every time.
 */

const CACHE_NAME  = 'dc-shell-v1';
const AUDIO_CACHE = 'dc-audio-v1';

// App shell — cached on install for fast load
// tracks.json intentionally excluded — always fetched live
const SHELL_FILES = [
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

/* ── Install ─────────────────────────────────────── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(SHELL_FILES))
      .then(() => self.skipWaiting())
  );
});

/* ── Activate: clear old caches ──────────────────── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME && k !== AUDIO_CACHE)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

/* ── Fetch ───────────────────────────────────────── */
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  const path = url.pathname;

  // tracks.json — always go to network, never serve from cache
  if (path.endsWith('tracks.json')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Audio files — network first, cache for offline
  if (/\.(mp3|wav|flac|ogg|aac|m4a)$/i.test(path)) {
    event.respondWith(networkFirstAudio(event.request));
    return;
  }

  // App shell — cache first, revalidate in background
  event.respondWith(staleWhileRevalidate(event.request));
});

/* ── Strategies ──────────────────────────────────── */
async function staleWhileRevalidate(request) {
  const cache  = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request).then(response => {
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => null);
  return cached || fetchPromise;
}

async function networkFirstAudio(request) {
  const cache = await caches.open(AUDIO_CACHE);
  try {
    const response = await fetch(request);
    if (response && response.ok && response.status === 200) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    return cached || new Response('Audio unavailable offline', { status: 503 });
  }
}
