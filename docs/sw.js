/*
 * Service worker: dopo il primo caricamento il sito funziona senza rete.
 *
 * - Pagine, script, stili e dati: prima la rete (al massimo 3 secondi, il wifi della casa
 *   è lento, non solo assente), poi la copia in cache. Così dopo un aggiornamento non si
 *   mescolano mai file vecchi e nuovi.
 * - Immagini, audio e video: dalla cache se ci sono (sono pesanti e non cambiano nome),
 *   altrimenti dalla rete.
 */
'use strict';

var CACHE = 'cena-delitto';
var ATTESA_RETE = 3000;
var PESANTI = /\.(svg|png|jpe?g|webp|gif|mp4|webm|mp3|m4a|ogg|wav)$/i;

self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });

self.addEventListener('fetch', function (e) {
  var req = e.request;
  var url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  // I canali della regia sono in tempo reale: mai dalla cache.
  if (url.pathname.indexOf('/regia/') !== -1) return;

  // Video e audio chiedono pezzi del file (Range): si servono dalla copia intera in cache.
  if (req.headers.has('range')) {
    e.respondWith(rispondiRange(req));
    return;
  }
  e.respondWith(PESANTI.test(url.pathname) ? primaCache(req) : primaRete(req));
});

function chiaveDi(req) { return req.url.split('#')[0]; }

function salva(cache, req, risposta) {
  if (risposta.ok && risposta.status === 200) cache.put(chiaveDi(req), risposta.clone());
  return risposta;
}

function primaRete(req) {
  return caches.open(CACHE).then(function (cache) {
    var dallaRete = fetch(req).then(function (r) { return salva(cache, req, r); });
    var scaduto = new Promise(function (ok) { setTimeout(ok, ATTESA_RETE); });
    return Promise.race([dallaRete.catch(function () { return null; }), scaduto]).then(function (r) {
      if (r) return r;
      return cache.match(chiaveDi(req), { ignoreVary: true }).then(function (inCache) {
        if (inCache) return inCache;
        // Niente in cache: si aspetta comunque la rete, se mai risponde.
        return dallaRete.catch(function () {
          return new Response('Offline e non ancora in cache.', { status: 503 });
        });
      });
    });
  });
}

function primaCache(req) {
  return caches.open(CACHE).then(function (cache) {
    return cache.match(chiaveDi(req), { ignoreVary: true }).then(function (inCache) {
      return inCache || fetch(req).then(function (r) { return salva(cache, req, r); });
    });
  });
}

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
