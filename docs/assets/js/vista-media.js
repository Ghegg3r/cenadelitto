/*
 * Vista 3 — MEDIA: un video o un audio alla volta, a schermo intero.
 * Nessun autoplay: si avvia solo con Spazio (o clic su ▶).
 * Frecce su/giù per scegliere, Invio per portarlo sul palco, Spazio play/pausa,
 * frecce sinistra/destra ±5 s, R ricomincia, Esc torna all'elenco.
 * In regia la vista è riservata: la comanda solo il telefono (comandi.*).
 */
(function () {
  'use strict';

  var radice, lista, palco, player, schedaAudio, titolo, sottotitolo, tempo, durata, avanzamento, invito;
  var elenco = [], scelto = 0, caricato = null, ultimoAvviso = 0, errore = '';

  function formato(s) {
    if (!isFinite(s)) return '0:00';
    s = Math.floor(s);
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  function render(stato) {
    elenco = stato.media.filter(function (m) { return m.episodio <= stato.episodio; });
    lista.textContent = '';
    elenco.forEach(function (m, i) {
      var li = Schermo.el('li');
      li.appendChild(Schermo.el('span', 'etichetta', m.tipo === 'video' ? 'Video' : 'Audio'));
      li.appendChild(Schermo.el('strong', null, m.titolo));
      if (m.sottotitolo) li.appendChild(Schermo.el('span', 'media-sotto', m.sottotitolo));
      if (stato.episodio > 1 && m.episodio === stato.episodio) li.classList.add('nuovo');
      li.addEventListener('click', function () { scegli(i); carica(); });
      lista.appendChild(li);
    });
    if (!elenco.length) lista.appendChild(Schermo.el('li', 'vuoto', 'Nessun filmato.'));
    scegli(Math.min(scelto, Math.max(0, elenco.length - 1)));
  }

  function scegli(i) {
    scelto = i;
    Array.prototype.forEach.call(lista.children, function (li, j) { li.classList.toggle('scelto', j === i); });
  }

  // Porta il file sul palco, fermo all'inizio.
  function carica() {
    var m = elenco[scelto];
    if (!m) return;
    if (caricato !== m) {
      caricato = m;
      player.pause();
      player.src = m.src;
      player.load();
    }
    radice.classList.add('sul-palco');
    radice.classList.toggle('audio', m.tipo !== 'video');
    titolo.textContent = m.titolo;
    sottotitolo.textContent = m.sottotitolo || '';
    aggiornaStato();
  }

  function scendi() {
    player.pause();
    radice.classList.remove('sul-palco');
  }

  function playPausa() {
    if (!radice.classList.contains('sul-palco')) carica();
    if (player.paused) riproduci(); else player.pause();
  }

  function suona(id) {
    var i = elenco.findIndex(function (m) { return m.id === id; });
    if (i < 0) return;
    Schermo.mostra(3);
    scegli(i);
    carica();
    player.currentTime = 0;
    riproduci();
  }

  function riproduci() {
    errore = '';
    player.play().catch(function () {
      errore = "Il browser ha bloccato l'audio: clicca una volta sullo schermo.";
      Schermo.notifica();
    });
  }

  function inOnda() {
    if (!caricato || !radice.classList.contains('sul-palco')) return null;
    return { id: caricato.id, titolo: caricato.titolo, tempo: player.currentTime, durata: player.duration || 0,
      inPausa: player.paused, finito: player.ended, errore: errore };
  }

  function aggiornaStato() {
    tempo.textContent = formato(player.currentTime);
    durata.textContent = formato(player.duration);
    avanzamento.style.width = (player.duration ? player.currentTime / player.duration * 100 : 0) + '%';
    invito.hidden = !player.paused;
    invito.textContent = player.ended ? '↺  R per ricominciare' : '▶  Spazio';
    invito.classList.toggle('in-regia', Schermo.inRegia());
    // La console del telefono segue l'avanzamento, una volta al secondo basta.
    var ora = Date.now();
    if (ora - ultimoAvviso > 900 || player.paused) { ultimoAvviso = ora; Schermo.notifica(); }
  }

  function tasto(e) {
    var sulPalco = radice.classList.contains('sul-palco');
    if (e.key === ' ') { playPausa(); return true; }
    if (!sulPalco) {
      if (e.key === 'ArrowDown' && scelto < elenco.length - 1) { scegli(scelto + 1); return true; }
      if (e.key === 'ArrowUp' && scelto > 0) { scegli(scelto - 1); return true; }
      if (e.key === 'Enter') { carica(); return true; }
      return false;
    }
    if (e.key === 'Escape') { scendi(); return true; }
    if (e.key === 'ArrowRight') { player.currentTime = Math.min(player.duration || 0, player.currentTime + 5); return true; }
    if (e.key === 'ArrowLeft') { player.currentTime = Math.max(0, player.currentTime - 5); return true; }
    if (e.key === 'r' || e.key === 'R') { player.currentTime = 0; aggiornaStato(); return true; }
    return false;
  }

  Schermo.registra(3, {
    nome: 'Media',
    init: function (el) {
      radice = el;
      radice.classList.add('media');
      lista = radice.appendChild(Schermo.el('ol', 'media-elenco'));
      palco = radice.appendChild(Schermo.el('div', 'media-palco'));

      player = palco.appendChild(Schermo.el('video'));
      player.preload = 'auto';
      player.playsInline = true;
      player.autoplay = false;
      schedaAudio = palco.appendChild(Schermo.el('div', 'media-audio'));
      schedaAudio.appendChild(Schermo.el('p', 'etichetta accento', 'Registrazione'));
      titolo = schedaAudio.appendChild(Schermo.el('h2'));
      sottotitolo = schedaAudio.appendChild(Schermo.el('p', 'media-sotto'));

      var barra = palco.appendChild(Schermo.el('div', 'media-barra'));
      tempo = barra.appendChild(Schermo.el('span', null, '0:00'));
      var traccia = barra.appendChild(Schermo.el('div', 'media-traccia'));
      avanzamento = traccia.appendChild(Schermo.el('div', 'media-avanzamento'));
      durata = barra.appendChild(Schermo.el('span', null, '0:00'));
      invito = palco.appendChild(Schermo.el('div', 'media-invito'));

      palco.addEventListener('click', function () { if (!Schermo.inRegia()) playPausa(); });
      ['timeupdate', 'loadedmetadata', 'play', 'pause', 'ended', 'seeked'].forEach(function (t) {
        player.addEventListener(t, aggiornaStato);
      });
    },
    render: render,
    esci: scendi,
    elenco: function () { return elenco.map(function (m) { return { id: m.id, titolo: m.titolo, tipo: m.tipo, sottotitolo: m.sottotitolo || '' }; }); },
    inOnda: inOnda,
    comandi: {
      suona: suona,
      pausa: function () { if (radice.classList.contains('sul-palco')) { if (player.paused) riproduci(); else player.pause(); } },
      ricomincia: function () { player.currentTime = 0; aggiornaStato(); },
      salta: function (s) { player.currentTime = Math.max(0, Math.min(player.duration || 0, player.currentTime + s)); },
      chiudi: scendi
    },
    tasto: tasto
  });
})();
