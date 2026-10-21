/*
 * Service worker: dopo il primo caricamento il sito funziona senza rete.
 * Strategia stale-while-revalidate: risponde subito dalla cache (il wifi della
 * casa è lento, non solo assente) e aggiorna in background quando la rete c'è.
 */
'use strict';

var CACHE = 'cena-delitto';

self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  // Video e audio chiedono pezzi del file (Range): si servono dalla copia intera in cache.
  if (req.headers.has('range')) {
    e.respondWith(rispondiRange(req));
    return;
  }

  e.respondWith(caches.open(CACHE).then(function (cache) {
    var chiave = req.url.split('#')[0];
    return cache.match(chiave, { ignoreVary: true }).then(function (inCache) {
      var dallaRete = fetch(req).then(function (risposta) {
        if (risposta.ok && risposta.status === 200) cache.put(chiave, risposta.clone());
        return risposta;
      });
      if (inCache) {
        dallaRete.catch(function () {});
        return inCache;
      }
      return dallaRete.catch(function () {
        return new Response('Offline e non ancora in cache.', { status: 503 });
      });
    });
  }));
});

function rispondiRange(req) {
  return caches.open(CACHE).then(function (cache) {
    return cache.match(req.url.split('#')[0], { ignoreVary: true });
  }).then(function (inCache) {
    if (!inCache) return fetch(req);
    return inCache.arrayBuffer().then(function (buf) {
      var m = /bytes=(\d*)-(\d*)/.exec(req.headers.get('range') || '');
      var totale = buf.byteLength;
      var inizio = m && m[1] ? parseInt(m[1], 10) : 0;
      var fine = m && m[2] ? Math.min(parseInt(m[2], 10), totale - 1) : totale - 1;
      if (m && !m[1] && m[2]) { inizio = Math.max(0, totale - parseInt(m[2], 10)); fine = totale - 1; }
      return new Response(buf.slice(inizio, fine + 1), {
        status: 206,
        headers: {
          'Content-Type': inCache.headers.get('Content-Type') || 'application/octet-stream',
          'Content-Range': 'bytes ' + inizio + '-' + fine + '/' + totale,
          'Content-Length': String(fine - inizio + 1),
          'Accept-Ranges': 'bytes'
        }
      });
    });
  });
}
