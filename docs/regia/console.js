/*
 * Console di regia (telefono dell'organizzatore). Due modi, scelti da soli:
 *
 *   - ONLINE (pagina aperta da GitHub Pages): parla con lo schermo via internet (ponte.js),
 *     con il codice di regia che sta nel #frammento del link. La scaletta arriva cifrata
 *     con lo stesso codice (data/scaletta.enc.json).
 *   - LOCALE (pagina servita da scripts/regia.js): stato via /regia/console, comandi via
 *     POST /regia/comando, protetti da PIN.
 *
 * Le passphrase degli episodi non vengono mai salvate sul telefono: online la console le
 * tiene in memoria finché resta aperta, per riaprire gli episodi se lo schermo si ricarica.
 */
(function () {
  'use strict';

  var modo = null;                 // 'online' | 'locale'
  var segreto = null;              // codice di regia (online) o PIN (locale)
  var comanda = null;              // function(comando) -> Promise
  var stato = null, ricevutoAlle = 0, schermoCollegato = false, scaletta = [];
  var fatti = JSON.parse(leggi('regia.fatti') || '[]');
  var chiudiCanale = null;

  // Solo memoria: passphrase degli episodi aperti da questa console, per il ripristino.
  var sbloccate = [], inAttesa = null, ripristinando = false;

  function $(id) { return document.getElementById(id); }
  function el(tag, classe, testo) {
    var e = document.createElement(tag);
    if (classe) e.className = classe;
    if (testo != null) e.textContent = testo;
    return e;
  }
  function leggi(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function scrivi(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage bloccato */ } }

  function formato(s) {
    if (!isFinite(s)) return '0:00';
    s = Math.floor(s);
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  function ora(t) { return new Date(t).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }

  function comandaConAvviso(c) {
    comanda(c).catch(function (err) { avviso(err.message); });
  }

  function avviso(testo) {
    $('avviso').textContent = testo;
    $('avviso').hidden = !testo;
  }

  /* ---------- scaletta ---------- */

  function descriviAzione(a) {
    if (a.vista) {
      var v = stato && stato.viste.find(function (x) { return x.n === a.vista; });
      return v ? v.nome : 'vista ' + a.vista;
    }
    if (a.media) {
      var m = stato && stato.media.find(function (x) { return x.id === a.media; });
      return '▶ ' + (m ? m.titolo : a.media);
    }
    if (a.attendi) return a.attendi + ' s';
    return '';
  }

  async function eseguiPasso(i) {
    var passo = scaletta[i];
    for (var j = 0; j < passo.azioni.length; j++) {
      var a = passo.azioni[j];
      if (a.vista) await comanda({ tipo: 'vista', n: a.vista });
      else if (a.media) await comanda({ tipo: 'media', id: a.media });
      else if (a.attendi) await new Promise(function (ok) { setTimeout(ok, a.attendi * 1000); });
    }
    if (fatti.indexOf(i) === -1) fatti.push(i);
    scrivi('regia.fatti', JSON.stringify(fatti));
    disegnaScaletta();
  }

  function disegnaScaletta() {
    $('sezione-scaletta').hidden = !scaletta.length;
    if (!scaletta.length) return;
    var prossimo = scaletta.findIndex(function (p, i) { return fatti.indexOf(i) === -1; });
    var b = $('prossimo');
    b.disabled = prossimo < 0;
    b.textContent = prossimo < 0 ? 'Scaletta finita' : '▶  ' + scaletta[prossimo].titolo;
    b.onclick = function () {
      b.disabled = true;
      eseguiPasso(prossimo).catch(function (err) { avviso(err.message); }).finally(function () { b.disabled = false; disegnaScaletta(); });
    };
    var ol = $('scaletta');
    ol.textContent = '';
    scaletta.forEach(function (p, i) {
      var li = ol.appendChild(el('li', fatti.indexOf(i) !== -1 ? 'fatto' : ''));
      var bb = li.appendChild(el('button'));
      bb.appendChild(el('span', null, p.titolo));
      bb.appendChild(el('span', 'dettaglio', p.azioni.map(descriviAzione).join(' · ')));
      bb.addEventListener('click', function () { eseguiPasso(i).catch(function (err) { avviso(err.message); }); });
    });
  }

  /* ---------- stato dello schermo ---------- */

  function riceviStato(s) {
    stato = s;
    ricevutoAlle = Date.now();
    schermoCollegato = true;

    var e = s.esito;
    if (e && e.tipo === 'sblocca') {
      if (e.ok && inAttesa) { sbloccate[e.episodio - 2] = inAttesa; inAttesa = null; }
      if (!e.ok) inAttesa = null;
    }
    // Lo schermo si è ricaricato e ha perso episodi che questa console aveva aperto: li riapre.
    if (modo === 'online' && !ripristinando && s.episodio - 1 < sbloccate.length) {
      ripristinando = true;
      for (var i = s.episodio - 1; i < sbloccate.length; i++) {
        if (sbloccate[i]) comanda({ tipo: 'sblocca', passphrase: sbloccate[i], ripristino: true }).catch(function () {});
      }
      setTimeout(function () { ripristinando = false; }, 15000);
    }
    disegna();
  }

  function disegnaOnda() {
    var o = stato && stato.inOnda;
    $('onda').hidden = !o;
    if (!o) return;
    // Lo schermo avvisa solo dei cambiamenti: l'avanzamento si calcola qui.
    var t = o.inPausa || o.finito ? o.tempo : Math.min(o.durata || Infinity, o.tempo + (Date.now() - ricevutoAlle) / 1000);
    $('onda-titolo').textContent = o.titolo;
    $('onda-tempo').textContent = formato(t) + ' / ' + formato(o.durata) + (o.finito ? ' · finito' : o.inPausa ? ' · in pausa' : '');
    $('onda-avanzamento').style.width = (o.durata ? t / o.durata * 100 : 0) + '%';
    $('onda-pausa').textContent = o.inPausa ? 'Play' : 'Pausa';
  }

  function disegna() {
    var c = $('collegamento');
    if (modo === 'online') {
      c.textContent = schermoCollegato ? 'Schermo: segnale delle ' + ora(ricevutoAlle) : 'Schermo: nessun segnale';
    } else {
      c.textContent = schermoCollegato ? 'Schermo collegato' : 'Schermo non collegato';
    }
    c.className = 'collegamento ' + (schermoCollegato ? 'ok' : 'ko');

    if (!schermoCollegato) {
      avviso(modo === 'online'
        ? 'Nessun segnale dallo schermo. Sul portatile apri il link dello schermo, poi premi "Verifica schermo".'
        : 'Lo schermo non è collegato: sul portatile apri http://localhost:8080/');
    } else if (stato && !stato.audioAttivo) avviso('Audio bloccato: clicca una volta sullo schermo del portatile.');
    else if (stato && stato.inOnda && stato.inOnda.errore) avviso(stato.inOnda.errore);
    else avviso('');

    if (!stato) return;
    $('episodio').textContent = 'Episodio ' + stato.episodio + (stato.titolo ? ' · ' + stato.titolo : '');
    var vista = stato.viste.find(function (v) { return v.n === stato.vista; });
    $('vista-attuale').textContent = vista ? 'sullo schermo: ' + vista.nome : '';

    disegnaOnda();

    var ul = $('media');
    ul.textContent = '';
    stato.media.forEach(function (m) {
      var b = ul.appendChild(el('li')).appendChild(el('button'));
      b.appendChild(el('span', null, '▶  ' + m.titolo));
      if (m.sottotitolo) b.appendChild(el('small', null, m.sottotitolo));
      b.addEventListener('click', function () { comandaConAvviso({ tipo: 'media', id: m.id }); });
    });
    if (!stato.media.length) ul.appendChild(el('li', 'vuoto', 'Nessun media disponibile.'));

    var g = $('viste');
    g.textContent = '';
    stato.viste.forEach(function (v) {
      var b = g.appendChild(el('button', v.n === stato.vista ? 'attiva' : '', v.nome));
      b.addEventListener('click', function () { comandaConAvviso({ tipo: 'vista', n: v.n }); });
    });

    $('sblocco-titolo').textContent = stato.prossimo ? 'Sblocca episodio ' + stato.prossimo : 'Episodi: tutti aperti';
    $('sblocco').hidden = !stato.prossimo;
    if (stato.esito && stato.esito.tipo === 'sblocca') {
      var es = $('sblocco-esito');
      es.textContent = stato.esito.messaggio;
      es.className = 'esito ' + (stato.esito.ok ? 'ok' : 'ko');
    }

    disegnaScaletta();
  }

  /* ---------- accesso ---------- */

  function mostraAccesso(messaggio) {
    if (chiudiCanale) chiudiCanale();
    $('console').hidden = true;
    $('accesso').hidden = false;
    $('accesso-etichetta').textContent = modo === 'online'
      ? 'Codice di regia (è nel link della console, dopo il #)'
      : 'PIN (lo stampa il portatile all\'avvio di regia.js)';
    $('pin').inputMode = modo === 'online' ? 'text' : 'numeric';
    $('accesso-esito').textContent = messaggio || '';
    $('accesso-esito').className = 'esito ko';
    $('pin').focus();
  }

  function mostraConsole() {
    $('accesso').hidden = true;
    $('console').hidden = false;
    disegna();
  }

  /* ---------- modo online ---------- */

  async function caricaScaletta() {
    try {
      var r = await fetch('../data/scaletta.enc.json', { cache: 'no-store' });
      if (!r.ok) return;
      scaletta = await Cripta.decifra(await r.json(), segreto);
    } catch (e) { scaletta = []; }
    disegnaScaletta();
  }

  async function collegaOnline() {
    if (!window.crypto || !crypto.subtle) { mostraAccesso('Questa pagina va aperta in https (dal link di GitHub Pages).'); return; }
    var ponte = await Ponte.apri(segreto, 'console', function (m) {
      if (m.tipo === 'stato') riceviStato(m.stato);
    }, function (ok) {
      if (ok) ponte.invia({ tipo: 'ciao' }).catch(function (err) { avviso(err.message); });
      else { $('collegamento').textContent = 'Internet assente, riprovo…'; $('collegamento').className = 'collegamento ko'; }
    });
    chiudiCanale = ponte.chiudi;
    comanda = function (c) {
      if (c.tipo === 'sblocca' && !c.ripristino) inAttesa = c.passphrase;
      return ponte.invia(c);
    };
    $('verifica').hidden = false;
    $('verifica').onclick = function () { comandaConAvviso({ tipo: 'ciao' }); };
    mostraConsole();
    caricaScaletta();
  }

  /* ---------- modo locale ---------- */

  function collegaLocale() {
    var ricevuto = false;
    var flusso = new EventSource('console?pin=' + encodeURIComponent(segreto));
    chiudiCanale = function () { flusso.close(); };
    flusso.onmessage = function (e) {
      ricevuto = true;
      var m = JSON.parse(e.data);
      if (m.tipo === 'scaletta') { scaletta = m.scaletta || []; disegnaScaletta(); return; }
      if (m.tipo === 'stato') {
        if (m.stato) riceviStato(m.stato);
        schermoCollegato = m.schermo;
        disegna();
      }
    };
    flusso.onerror = function () {
      // Risposta 401 (PIN sbagliato): EventSource si chiude e non riprova.
      if (flusso.readyState === EventSource.CLOSED && !ricevuto) { mostraAccesso('PIN errato.'); return; }
      $('collegamento').textContent = 'Portatile irraggiungibile, riprovo…';
      $('collegamento').className = 'collegamento ko';
    };
    comanda = async function (c) {
      var r = await fetch('comando', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Pin': segreto },
        body: JSON.stringify(c)
      });
      if (!r.ok) {
        var e = await r.json().catch(function () { return {}; });
        throw new Error(e.errore || 'Errore ' + r.status);
      }
    };
    mostraConsole();
  }

  function collega() {
    if (modo === 'online') collegaOnline(); else collegaLocale();
  }

  /* ---------- avvio ---------- */

  $('accesso').addEventListener('submit', function (e) {
    e.preventDefault();
    var v = $('pin').value.trim();
    if (modo === 'online' && !Ponte.codiceValido(v)) { mostraAccesso('Codice non valido.'); return; }
    segreto = v;
    scrivi(modo === 'online' ? 'regia.codice' : 'regia.pin', v);
    collega();
  });

  $('sblocco').addEventListener('submit', function (e) {
    e.preventDefault();
    var input = $('passphrase');
    if (!input.value.trim()) return;
    $('sblocco-esito').textContent = 'Verifica…';
    $('sblocco-esito').className = 'esito';
    comanda({ tipo: 'sblocca', passphrase: input.value })
      .then(function () { input.value = ''; })
      .catch(function (err) { $('sblocco-esito').textContent = err.message; $('sblocco-esito').className = 'esito ko'; });
  });

  document.querySelectorAll('[data-comando]').forEach(function (b) {
    b.addEventListener('click', function () {
      var c = { tipo: b.dataset.comando };
      if (b.dataset.secondi) c.secondi = parseInt(b.dataset.secondi, 10);
      comandaConAvviso(c);
    });
  });

  $('azzera').addEventListener('click', function () {
    if (confirm('Azzerare tutta la timeline sullo schermo?')) comandaConAvviso({ tipo: 'azzera-timeline' });
  });

  $('scaletta-azzera').addEventListener('click', function () {
    if (!confirm('Segnare tutti i passi della scaletta come da fare?')) return;
    fatti = [];
    scrivi('regia.fatti', '[]');
    disegnaScaletta();
  });

  setInterval(function () { if (stato && stato.inOnda && !stato.inOnda.inPausa) disegnaOnda(); }, 500);

  async function avvia() {
    try {
      var r = await fetch('ping', { cache: 'no-store' });
      modo = r.ok && (await r.json()).regia ? 'locale' : 'online';
    } catch (e) { modo = 'online'; }

    if (modo === 'online') {
      segreto = Ponte.codiceValido(location.hash.slice(1)) || Ponte.codiceValido(leggi('regia.codice'));
      if (segreto) scrivi('regia.codice', segreto);
    } else {
      segreto = leggi('regia.pin');
    }
    if (segreto) collega(); else mostraAccesso();
  }

  avvia();
})();
