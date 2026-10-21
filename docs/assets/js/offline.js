/*
 * Offline — registra il service worker e mette in cache i file che servono a
 * questa pagina. Nessun elenco globale: ogni pagina dichiara solo i propri file,
 * così nessuna scheda personale compare mai in una lista.
 */
(function () {
  'use strict';

  var CACHE = 'cena-delitto';

  function registra(percorsoSw) {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register(percorsoSw).catch(function () { /* offline o file:// */ });
  }

  // Scarica ora (finché c'è rete) tutto ciò che servirà dopo. Gli URL già in cache
  // non vengono riscaricati: li aggiorna il service worker quando vengono usati.
  async function assicura(urls) {
    if (!('caches' in window)) return;
    try {
      var cache = await caches.open(CACHE);
      for (var i = 0; i < urls.length; i++) {
        var url = new URL(urls[i], location.href).href.split('#')[0];
        if (await cache.match(url)) continue;
        try { await cache.add(url); } catch (e) { /* rete assente: riproverà al prossimo avvio */ }
      }
    } catch (e) { /* storage non disponibile */ }
  }

  window.Offline = { registra: registra, assicura: assicura };
})();
