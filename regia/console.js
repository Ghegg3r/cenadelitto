/*
 * Console di regia (telefono). Parla con scripts/regia.js:
 *   - riceve lo stato dello schermo su /regia/console (Server-Sent Events);
 *   - manda i comandi con POST /regia/comando, firmati col PIN.
 * Le passphrase passano solo di qui verso lo schermo: non vengono salvate sul telefono.
 */
(function () {
  'use strict';

  var pin = leggi('regia.pin');
  var stato = null, schermoCollegato = false, scaletta = [];
  var fatti = JSON.parse(leggi('regia.fatti') || '[]');
  var flusso = null;

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

  /* ---------- comandi ---------- */

  async function comanda(c) {
    var r = await fetch('comando', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Pin': pin },
      body: JSON.stringify(c)
    });
    if (!r.ok) {
      var e = await r.json().catch(function () { return {}; });
      throw new Error(e.errore || 'Errore ' + r.status);
    }
  }

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

  function disegna() {
    var c = $('collegamento');
    c.textContent = schermoCollegato ? 'Schermo collegato' : 'Schermo non collegato';
    c.className = 'collegamento ' + (schermoCollegato ? 'ok' : 'ko');

    if (!schermoCollegato) avviso('Lo schermo non è collegato: sul portatile apri http://localhost:8080/');
    else if (stato && !stato.audioAttivo) avviso('Audio bloccato: clicca una volta sullo schermo del portatile.');
    else if (stato && stato.inOnda && stato.inOnda.errore) avviso(stato.inOnda.errore);
    else avviso('');

    if (!stato) return;
    $('episodio').textContent = 'Episodio ' + stato.episodio + (stato.titolo ? ' · ' + stato.titolo : '');
    var vista = stato.viste.find(function (v) { return v.n === stato.vista; });
    $('vista-attuale').textContent = vista ? 'sullo schermo: ' + vista.nome : '';

    // In onda
    var o = stato.inOnda;
    $('onda').hidden = !o;
    if (o) {
      $('onda-titolo').textContent = o.titolo;
      $('onda-tempo').textContent = formato(o.tempo) + ' / ' + formato(o.durata) + (o.finito ? ' · finito' : o.inPausa ? ' · in pausa' : '');
      $('onda-avanzamento').style.width = (o.durata ? o.tempo / o.durata * 100 : 0) + '%';
      $('onda-pausa').textContent = o.inPausa ? 'Play' : 'Pausa';
    }

    // Media
    var ul = $('media');
    ul.textContent = '';
    stato.media.forEach(function (m) {
      var b = ul.appendChild(el('li')).appendChild(el('button'));
      b.appendChild(el('span', null, '▶  ' + m.titolo));
      if (m.sottotitolo) b.appendChild(el('small', null, m.sottotitolo));
      b.addEventListener('click', function () { comandaConAvviso({ tipo: 'media', id: m.id }); });
    });
    if (!stato.media.length) ul.appendChild(el('li', 'vuoto', 'Nessun media disponibile.'));

    // Viste
    var g = $('viste');
    g.textContent = '';
    stato.viste.forEach(function (v) {
      var b = g.appendChild(el('button', v.n === stato.vista ? 'attiva' : '', v.nome));
      b.addEventListener('click', function () { comandaConAvviso({ tipo: 'vista', n: v.n }); });
    });

    // Episodi
    $('sblocco-titolo').textContent = stato.prossimo ? 'Sblocca episodio ' + stato.prossimo : 'Episodi: tutti aperti';
    $('sblocco').hidden = !stato.prossimo;
    if (stato.esito && stato.esito.tipo === 'sblocca') {
      var e = $('sblocco-esito');
      e.textContent = stato.esito.messaggio;
      e.className = 'esito ' + (stato.esito.ok ? 'ok' : 'ko');
    }

    disegnaScaletta();
  }

  /* ---------- collegamento ---------- */

  function collega() {
    if (flusso) flusso.close();
    var ricevuto = false;
    flusso = new EventSource('console?pin=' + encodeURIComponent(pin));
    flusso.onmessage = function (e) {
      ricevuto = true;
      var m = JSON.parse(e.data);
      if (m.tipo === 'scaletta') { scaletta = m.scaletta || []; disegnaScaletta(); return; }
      if (m.tipo === 'stato') {
        schermoCollegato = m.schermo;
        if (m.stato) stato = m.stato;
        disegna();
      }
    };
    flusso.onerror = function () {
      // Risposta 401 (PIN sbagliato): EventSource si chiude e non riprova.
      if (flusso.readyState === EventSource.CLOSED && !ricevuto) { mostraAccesso('PIN errato.'); return; }
      $('collegamento').textContent = 'Portatile irraggiungibile, riprovo…';
      $('collegamento').className = 'collegamento ko';
    };
    $('accesso').hidden = true;
    $('console').hidden = false;
  }

  function mostraAccesso(messaggio) {
    if (flusso) flusso.close();
    $('console').hidden = true;
    $('accesso').hidden = false;
    $('accesso-esito').textContent = messaggio || '';
    $('accesso-esito').className = 'esito ko';
    $('pin').focus();
  }

  /* ---------- avvio ---------- */

  $('accesso').addEventListener('submit', function (e) {
    e.preventDefault();
    pin = $('pin').value.trim();
    scrivi('regia.pin', pin);
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

  if (pin) collega(); else mostraAccesso();
})();
