/*
 * Schermo centrale — nucleo comune.
 * Carica i dati, tiene lo stato degli episodi sbloccati, smista i tasti alle viste.
 * Ogni vista (vista-*.js) si registra con Schermo.registra(n, {...}).
 */
(function () {
  'use strict';

  var viste = {};
  var corrente = 0;
  var stato = {
    config: null, cast: [], luoghi: [],
    episodio: 1, titoli: {},
    prove: [], media: [],
    archivio: { schede: {}, stato: {}, chat: [], galleria: [], note: [] }
  };

  function $(id) { return document.getElementById(id); }

  function el(tag, classe, testo) {
    var e = document.createElement(tag);
    if (classe) e.className = classe;
    if (testo != null) e.textContent = testo;
    return e;
  }

  function registra(n, vista) { viste[n] = vista; }

  async function caricaJson(url) {
    var r = await fetch(url);
    if (!r.ok) throw new Error(url + ': ' + r.status);
    return r.json();
  }

  /* ---------- episodi ---------- */

  // I contenuti di un episodio si sommano a quelli già presenti.
  function unisci(pacchetto, n) {
    if (pacchetto.titolo) stato.titoli[n] = pacchetto.titolo;
    stato.prove = stato.prove.concat(pacchetto.prove || []);
    stato.media = stato.media.concat(pacchetto.media || []);
    var a = pacchetto.archivio;
    if (!a) return;
    Object.assign(stato.archivio.stato, a.stato || {});
    Object.assign(stato.archivio.schede, a.schede || {});
    (a.chat || []).forEach(function (c) {
      var esistente = stato.archivio.chat.find(function (x) { return x.id === c.id; });
      if (!esistente) { stato.archivio.chat.push(c); return; }
      var messaggi = esistente.messaggi.concat(c.messaggi || []);
      Object.assign(esistente, c);
      esistente.messaggi = messaggi;
    });
    stato.archivio.galleria = stato.archivio.galleria.concat(a.galleria || []);
    stato.archivio.note = stato.archivio.note.concat(a.note || []);
  }

  // Video e immagini grandi arrivano dai pacchetti cifrati come data: URL;
  // si convertono in blob: per non tenere in memoria stringhe enormi.
  async function alleggerisci(valore) {
    if (typeof valore === 'string') {
      if (valore.slice(0, 5) === 'data:' && valore.length > 200000) {
        var blob = await (await fetch(valore)).blob();
        return URL.createObjectURL(blob);
      }
      return valore;
    }
    if (Array.isArray(valore)) {
      for (var i = 0; i < valore.length; i++) valore[i] = await alleggerisci(valore[i]);
    } else if (valore && typeof valore === 'object') {
      for (var k in valore) valore[k] = await alleggerisci(valore[k]);
    }
    return valore;
  }

  function prossimoEpisodio() {
    return stato.config.episodi.find(function (e) { return e.n === stato.episodio + 1; });
  }

  async function sblocca(passphrase) {
    var ep = prossimoEpisodio();
    var blob = await caricaJson(ep.file);
    var pacchetto = await Cripta.decifra(blob, Cripta.segretoEpisodio(passphrase));
    await alleggerisci(pacchetto);
    unisci(pacchetto, ep.n);
    stato.episodio = ep.n;
    aggiornaTestata();
    rendiTutto();
    avviso('Episodio ' + ep.n + (stato.titoli[ep.n] ? ' — ' + stato.titoli[ep.n] : '') + ' aperto');
  }

  /* ---------- interfaccia comune ---------- */

  function aggiornaTestata() {
    $('testata-luogo').textContent = stato.config.luogo + ' · ' + stato.config.data;
    var v = viste[corrente];
    $('testata-titolo').textContent = v ? v.nome : '';
    var t = stato.titoli[stato.episodio];
    $('testata-episodio').textContent = 'Episodio ' + stato.episodio + (t ? ' · ' + t : '');
  }

  function rendiTutto() {
    Object.keys(viste).forEach(function (n) { if (viste[n].render) viste[n].render(stato); });
  }

  function mostra(n) {
    if (!viste[n] || n === corrente) return;
    if (viste[corrente] && viste[corrente].esci) viste[corrente].esci();
    corrente = n;
    document.querySelectorAll('.vista').forEach(function (v) { v.hidden = v.id !== 'vista-' + n; });
    document.body.dataset.vista = n;
    history.replaceState(null, '', '#' + n);
    aggiornaTestata();
    if (viste[n].entra) viste[n].entra();
  }

  var timerAvviso;
  function avviso(testo) {
    var a = $('avviso');
    a.textContent = testo;
    a.hidden = false;
    clearTimeout(timerAvviso);
    timerAvviso = setTimeout(function () { a.hidden = true; }, 4000);
  }

  function rendiTasti() {
    var t = $('tasti');
    t.textContent = '';
    Object.keys(viste).forEach(function (n) {
      var s = el('span', null);
      s.appendChild(el('kbd', null, n));
      s.appendChild(document.createTextNode(' ' + viste[n].nome));
      t.appendChild(s);
    });
    [['S', 'Sblocca episodio'], ['F', 'Schermo intero']].forEach(function (c) {
      var s = el('span', null);
      s.appendChild(el('kbd', null, c[0]));
      s.appendChild(document.createTextNode(' ' + c[1]));
      t.appendChild(s);
    });
  }

  /* ---------- ingrandimento (prove, galleria) ---------- */

  var lista = null, indice = 0;

  function ingrandisci(elementi, i) {
    lista = elementi;
    indice = i;
    rendiIngrandimento();
    $('ingrandimento').hidden = false;
  }

  function rendiIngrandimento() {
    var x = lista[indice];
    $('ingrandimento-img').src = x.img;
    $('ingrandimento-etichetta').textContent = x.etichetta || '';
    $('ingrandimento-titolo').textContent = x.titolo || '';
    $('ingrandimento-testo').textContent = x.testo || '';
    $('ingrandimento-meta').textContent = x.meta || '';
  }

  function chiudiIngrandimento() { $('ingrandimento').hidden = true; lista = null; }

  /* ---------- sblocco ---------- */

  function apriSblocco() {
    var ep = prossimoEpisodio();
    if (!ep) { avviso('Tutti gli episodi sono già aperti'); return; }
    $('sblocco-titolo').textContent = 'Sblocca episodio ' + ep.n;
    $('sblocco-esito').textContent = '';
    $('sblocco-input').value = '';
    $('sblocco').hidden = false;
    $('sblocco-input').focus();
  }

  function chiudiSblocco() {
    $('sblocco-input').value = '';
    $('sblocco').hidden = true;
  }

  function preparaSblocco() {
    $('sblocco-form').addEventListener('submit', async function (e) {
      e.preventDefault();
      var input = $('sblocco-input');
      if (!input.value.trim()) return;
      $('sblocco-esito').textContent = 'Verifica…';
      try {
        await sblocca(input.value);
        chiudiSblocco();
      } catch (err) {
        $('sblocco-esito').textContent = err.passphraseErrata ? 'Passphrase errata.' : 'Errore: ' + err.message;
        input.select();
      }
    });
    $('sblocco-input').addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.preventDefault(); chiudiSblocco(); }
    });
  }

  /* ---------- tastiera e inattività ---------- */

  function inCampoDiTesto(t) {
    return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
  }

  function schermoIntero() {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(function () {});
  }

  function tasti(e) {
    if (inCampoDiTesto(e.target) || e.ctrlKey && !e.shiftKey || e.altKey || e.metaKey) return;
    if (!$('sblocco').hidden) return;
    if (lista) {
      if (e.key === 'Escape') chiudiIngrandimento();
      else if (e.key === 'ArrowRight' && indice < lista.length - 1) { indice++; rendiIngrandimento(); }
      else if (e.key === 'ArrowLeft' && indice > 0) { indice--; rendiIngrandimento(); }
      e.preventDefault();
      return;
    }
    if (/^[1-9]$/.test(e.key) && viste[e.key]) { mostra(parseInt(e.key, 10)); e.preventDefault(); return; }
    if (e.key === 's' || e.key === 'S') { apriSblocco(); e.preventDefault(); return; }
    if (e.key === 'f' || e.key === 'F') { schermoIntero(); e.preventDefault(); return; }
    var v = viste[corrente];
    if (v && v.tasto && v.tasto(e)) e.preventDefault();
  }

  // Cursore e legenda dei tasti spariscono quando nessuno tocca il portatile.
  var timerInattivo;
  function attivita() {
    document.body.classList.remove('inattivo');
    clearTimeout(timerInattivo);
    timerInattivo = setTimeout(function () { document.body.classList.add('inattivo'); }, 3500);
  }

  /* ---------- avvio ---------- */

  function elencoFile() {
    var f = ['./', 'index.html', 'sw.js', 'assets/css/schermo.css',
      'data/config.json', 'data/cast.json', 'data/luoghi.json', 'data/prove.json', 'data/media.json', 'data/archivio.json'];
    document.querySelectorAll('script[src]').forEach(function (s) { f.push(s.getAttribute('src')); });
    stato.config.episodi.forEach(function (e) { if (e.file) f.push(e.file); });
    stato.prove.forEach(function (p) { f.push(p.img); });
    stato.media.forEach(function (m) { f.push(m.src); });
    stato.archivio.galleria.forEach(function (g) { f.push(g.img); });
    return f.filter(function (u) { return u && !/^(data|blob):/.test(u); });
  }

  async function avvia() {
    Offline.registra('sw.js');
    try {
      var r = await Promise.all(['config', 'cast', 'luoghi', 'prove', 'media', 'archivio']
        .map(function (n) { return caricaJson('data/' + n + '.json'); }));
      stato.config = r[0]; stato.cast = r[1]; stato.luoghi = r[2];
      stato.titoli[1] = stato.config.episodi[0].titolo;
      unisci({ prove: r[3], media: r[4], archivio: r[5] }, 1);
    } catch (err) {
      document.querySelector('main').textContent =
        'Dati non caricati (' + err.message + '). Il sito va aperto tramite un server: vedi README.';
      return;
    }

    Object.keys(viste).forEach(function (n) {
      if (viste[n].init) viste[n].init($('vista-' + n), stato, Schermo);
    });
    rendiTasti();
    preparaSblocco();
    $('ingrandimento').addEventListener('click', chiudiIngrandimento);
    document.addEventListener('keydown', tasti);
    ['mousemove', 'mousedown', 'keydown'].forEach(function (t) { document.addEventListener(t, attivita); });
    attivita();

    rendiTutto();
    var iniziale = parseInt(location.hash.slice(1), 10);
    mostra(viste[iniziale] ? iniziale : 1);
    Offline.assicura(elencoFile());
  }

  window.Schermo = { registra: registra, el: el, ingrandisci: ingrandisci, avviso: avviso, mostra: mostra };
  document.addEventListener('DOMContentLoaded', avvia);
})();
