/*
 * Vista 2 — TIMELINE: dove si trovava ciascuno, fascia per fascia.
 * Il cuore del gioco: due personaggi nella stessa stanza nella stessa fascia
 * accendono di rosso entrambe le celle e alzano il contatore delle contraddizioni.
 *
 * Clic (o frecce + Invio) per scrivere in una cella. Invio salva, Tab salva e
 * passa alla fascia successiva, Esc annulla, Canc svuota la cella selezionata.
 * Ctrl+Maiusc+Backspace azzera tutta la timeline (chiede conferma); in regia solo dal telefono.
 */
(function () {
  'use strict';

  var CHIAVE = 'cena.timeline.v1';
  var IGNOTI = ['', 'boh', 'non so', 'non lo so', 'non ricordo', 'ignoto', 'nessuno', 'xx'];
  var ARTICOLI = /^(in|nel|nella|nello|nell|negli|nelle|al|alla|allo|all|ai|alle|sul|sulla|sullo|sull|dal|dalla|dallo|dall|il|lo|la|l|i|gli|le)\s+/;

  var stato, radice, griglia, contatore, numero, dettaglio;
  var dati = {};
  var mappaLuoghi = [];          // [chiave normalizzata, nome canonico], dalla più lunga
  var celle = [];                // celle[r][c] -> elemento
  var cursore = { r: 0, c: 0 };
  var inModifica = null;
  var ultimoConteggio = 0;

  /* ---------- memoria ---------- */

  function carica() {
    try { dati = JSON.parse(localStorage.getItem(CHIAVE)) || {}; } catch (e) { dati = {}; }
  }

  function salva() {
    try { localStorage.setItem(CHIAVE, JSON.stringify(dati)); } catch (e) { /* storage pieno o bloccato */ }
  }

  function chiave(r, c) { return stato.cast[r].nome + '|' + stato.config.fasce[c]; }

  /* ---------- riconoscimento delle stanze ---------- */

  function normalizza(t) {
    t = String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/['’`]/g, ' ').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
    var prima;
    do { prima = t; t = t.replace(ARTICOLI, ''); } while (t !== prima);
    return t;
  }

  function preparaLuoghi() {
    mappaLuoghi = [];
    stato.luoghi.forEach(function (l) {
      [l.nome].concat(l.alias || []).forEach(function (a) { mappaLuoghi.push([normalizza(a), l.nome]); });
    });
    mappaLuoghi.sort(function (a, b) { return b[0].length - a[0].length; });
  }

  // "nella biblioteca", "Biblioteca!", "biblioteca piano terra" -> Biblioteca.
  // Una stanza non in elenco si confronta comunque, per testo normalizzato.
  function risolvi(testo) {
    var grezzo = (testo || '').trim();
    if (!grezzo) return { tipo: 'vuoto' };
    var n = normalizza(grezzo);
    if (IGNOTI.indexOf(n) !== -1) return { tipo: 'ignoto', etichetta: grezzo };
    var spaziato = ' ' + n + ' ';
    for (var i = 0; i < mappaLuoghi.length; i++) {
      if (spaziato.indexOf(' ' + mappaLuoghi[i][0] + ' ') !== -1) {
        return { tipo: 'luogo', chiave: normalizza(mappaLuoghi[i][1]), etichetta: mappaLuoghi[i][1] };
      }
    }
    return { tipo: 'luogo', chiave: n, etichetta: grezzo };
  }

  function contraddizioni() {
    var celleRosse = {}, fasceRosse = {}, gruppi = [];
    stato.config.fasce.forEach(function (f, c) {
      var perStanza = {};
      stato.cast.forEach(function (p, r) {
        var x = risolvi(dati[chiave(r, c)]);
        if (x.tipo !== 'luogo') return;
        (perStanza[x.chiave] = perStanza[x.chiave] || { etichetta: x.etichetta, righe: [] }).righe.push(r);
      });
      Object.keys(perStanza).forEach(function (k) {
        var g = perStanza[k];
        if (g.righe.length < 2) return;
        fasceRosse[c] = true;
        g.righe.forEach(function (r) { celleRosse[r + ',' + c] = true; });
        gruppi.push({ fascia: f, stanza: g.etichetta, nomi: g.righe.map(function (r) { return stato.cast[r].nome; }) });
      });
    });
    return { celle: celleRosse, fasce: fasceRosse, gruppi: gruppi };
  }

  /* ---------- disegno ---------- */

  function costruisci() {
    griglia.textContent = '';
    griglia.style.setProperty('--fasce', stato.config.fasce.length);
    griglia.style.setProperty('--persone', stato.cast.length);
    griglia.appendChild(Schermo.el('div', 'tl-angolo'));
    stato.config.fasce.forEach(function (f) { griglia.appendChild(Schermo.el('div', 'tl-fascia', f)); });
    celle = stato.cast.map(function (p, r) {
      griglia.appendChild(Schermo.el('div', 'tl-nome', p.nome));
      return stato.config.fasce.map(function (f, c) {
        var cella = Schermo.el('div', 'tl-cella');
        cella.addEventListener('click', function () { if (!inModifica) { sposta(r, c); apri(); } });
        griglia.appendChild(cella);
        return cella;
      });
    });
    aggiorna();
  }

  function aggiorna() {
    var esito = contraddizioni();
    var nomi = griglia.querySelectorAll('.tl-nome');
    var fasce = griglia.querySelectorAll('.tl-fascia');
    var righeRosse = {};

    celle.forEach(function (riga, r) {
      riga.forEach(function (cella, c) {
        if (cella === inModifica) return;
        var x = risolvi(dati[chiave(r, c)]);
        var rossa = !!esito.celle[r + ',' + c];
        if (rossa) righeRosse[r] = true;
        cella.textContent = x.tipo === 'vuoto' ? '' : x.etichetta;
        cella.className = 'tl-cella' + (x.tipo === 'ignoto' ? ' ignota' : '') + (rossa ? ' rossa' : '') +
          (r === cursore.r && c === cursore.c ? ' cursore' : '');
      });
    });
    nomi.forEach(function (n, r) { n.classList.toggle('rossa', !!righeRosse[r]); });
    fasce.forEach(function (f, c) { f.classList.toggle('rossa', !!esito.fasce[c]); });

    var n = esito.gruppi.length;
    numero.textContent = n;
    contatore.classList.toggle('attivo', n > 0);
    if (n > ultimoConteggio) {
      contatore.classList.remove('timbro');
      void contatore.offsetWidth; // riavvia l'effetto timbro
      contatore.classList.add('timbro');
    }
    ultimoConteggio = n;

    dettaglio.textContent = '';
    esito.gruppi.forEach(function (g) {
      var p = Schermo.el('p');
      p.appendChild(Schermo.el('b', null, g.fascia + ' · ' + g.stanza));
      p.appendChild(document.createTextNode(' — ' + g.nomi.join(', ')));
      dettaglio.appendChild(p);
    });
  }

  /* ---------- modifica ---------- */

  function sposta(r, c) {
    cursore.r = Math.max(0, Math.min(stato.cast.length - 1, r));
    cursore.c = Math.max(0, Math.min(stato.config.fasce.length - 1, c));
    aggiorna();
  }

  function apri() {
    var cella = celle[cursore.r][cursore.c];
    var k = chiave(cursore.r, cursore.c);
    inModifica = cella;
    cella.className = 'tl-cella in-modifica';
    cella.textContent = '';
    var input = Schermo.el('input');
    input.setAttribute('list', 'tl-luoghi');
    input.setAttribute('autocomplete', 'off');
    input.spellcheck = false;
    input.value = dati[k] || '';
    cella.appendChild(input);
    input.focus();
    input.select();

    var chiuso = false;
    function chiudi(conferma, poi) {
      if (chiuso) return;
      chiuso = true;
      if (conferma) {
        var v = input.value.trim();
        if (v) dati[k] = v; else delete dati[k];
        salva();
      }
      inModifica = null;
      aggiorna();
      if (poi) poi();
    }
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); chiudi(true, function () { sposta(cursore.r + 1, cursore.c); }); }
      else if (e.key === 'Escape') { e.preventDefault(); chiudi(false); }
      else if (e.key === 'Tab') {
        e.preventDefault();
        var dc = e.shiftKey ? -1 : 1;
        chiudi(true, function () {
          var c = cursore.c + dc;
          if (c >= 0 && c < stato.config.fasce.length) { sposta(cursore.r, c); apri(); }
        });
      }
    });
    input.addEventListener('blur', function () { chiudi(true); });
  }

  function azzera() {
    dati = {};
    salva();
    ultimoConteggio = 0;
    aggiorna();
  }

  function tasto(e) {
    if (inModifica) return false;
    var mosse = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    if (mosse[e.key]) { sposta(cursore.r + mosse[e.key][0], cursore.c + mosse[e.key][1]); return true; }
    if (e.key === 'Enter') { apri(); return true; }
    if (e.key === 'Delete' || (e.key === 'Backspace' && !e.ctrlKey)) {
      delete dati[chiave(cursore.r, cursore.c)];
      salva();
      aggiorna();
      return true;
    }
    if (e.key === 'Backspace' && e.ctrlKey && e.shiftKey) {
      if (!Schermo.inRegia() && confirm('Azzerare tutta la timeline?')) azzera();
      return true;
    }
    return false;
  }

  Schermo.registra(2, {
    nome: 'Timeline',
    giocatori: true,
    comandi: { azzera: function () { azzera(); } },
    init: function (el, s) {
      stato = s;
      radice = el;
      carica();
      preparaLuoghi();

      var barra = radice.appendChild(Schermo.el('div', 'tl-barra'));
      dettaglio = barra.appendChild(Schermo.el('div', 'tl-dettaglio'));
      contatore = barra.appendChild(Schermo.el('div', 'tl-contatore'));
      contatore.appendChild(Schermo.el('span', 'etichetta', 'Contraddizioni'));
      numero = contatore.appendChild(Schermo.el('span', 'tl-numero', '0'));

      griglia = radice.appendChild(Schermo.el('div', 'timeline'));
      var lista = radice.appendChild(Schermo.el('datalist'));
      lista.id = 'tl-luoghi';
      stato.luoghi.forEach(function (l) { var o = Schermo.el('option'); o.value = l.nome; lista.appendChild(o); });

      costruisci();
      ultimoConteggio = contraddizioni().gruppi.length;
      aggiorna();

      // Se la timeline viene modificata da un'altra finestra dello stesso portatile.
      window.addEventListener('storage', function (e) { if (e.key === CHIAVE) { carica(); aggiorna(); } });
    },
    tasto: tasto
  });
})();
