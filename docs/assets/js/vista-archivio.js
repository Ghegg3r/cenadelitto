/*
 * Vista 5 — ARCHIVIO: ricostruzione del telefono della vittima.
 * Tre schede interne (CHAT, GALLERIA, NOTE) che si sbloccano con gli episodi;
 * quelle non ancora disponibili restano visibili ma spente.
 * Si pilota col mouse. Tasti: C/G/N per le schede, Esc per tornare indietro,
 * frecce o PagSu/PagGiù per scorrere.
 */
(function () {
  'use strict';

  var SCHEDE = [['chat', 'Chat', 'c'], ['galleria', 'Galleria', 'g'], ['note', 'Note', 'n']];

  var stato, radice, barraStato, app, barraSchede;
  var scheda = 'chat', aperto = null; // aperto: id chat o indice nota

  function el(t, c, x) { return Schermo.el(t, c, x); }

  function disponibile(s) { return (stato.archivio.schede[s] || 1) <= stato.episodio; }
  function visibili(lista) { return lista.filter(function (x) { return (x.episodio || 1) <= stato.episodio; }); }

  function iniziali(nome) {
    var parole = nome.replace(/[^\p{L}\s]/gu, '').trim().split(/\s+/).filter(Boolean);
    if (!parole.length) return '#';
    return (parole[0][0] + (parole[1] ? parole[1][0] : '')).toUpperCase();
  }

  function testata(titolo, sotto, indietro) {
    var h = el('div', 'tel-testata');
    if (indietro) {
      var b = h.appendChild(el('button', 'tel-indietro', '‹'));
      b.addEventListener('click', indietro);
    }
    var t = h.appendChild(el('div', 'tel-testata-testo'));
    t.appendChild(el('strong', null, titolo));
    if (sotto) t.appendChild(el('span', null, sotto));
    return h;
  }

  /* ---------- chat ---------- */

  function messaggiDi(c) { return visibili(c.messaggi || []); }

  function elencoChat() {
    var f = document.createDocumentFragment();
    f.appendChild(testata('Chat'));
    var ul = f.appendChild(el('ul', 'tel-lista'));
    visibili(stato.archivio.chat).forEach(function (c) {
      var msg = messaggiDi(c).filter(function (m) { return m.testo; });
      var ultimo = msg[msg.length - 1];
      var li = ul.appendChild(el('li', 'tel-chat'));
      li.appendChild(el('span', 'tel-avatar', c.gruppo ? '◆' : iniziali(c.contatto)));
      var centro = li.appendChild(el('div', 'tel-chat-centro'));
      centro.appendChild(el('strong', null, c.contatto));
      var anteprima = centro.appendChild(el('span', 'tel-anteprima'));
      if (c.bozza) {
        anteprima.appendChild(el('em', 'tel-bozza', 'Bozza: '));
        anteprima.appendChild(document.createTextNode(c.bozza));
      } else if (ultimo) {
        anteprima.textContent = (ultimo.da === 'io' ? 'Tu: ' : c.gruppo ? ultimo.da + ': ' : '') + ultimo.testo;
      }
      var dx = li.appendChild(el('div', 'tel-chat-dx'));
      dx.appendChild(el('span', 'tel-ora' + (c.non_letti ? ' accento' : ''), ultimo ? ultimo.ora : ''));
      if (c.non_letti) dx.appendChild(el('span', 'tel-badge', String(c.non_letti)));
      li.addEventListener('click', function () { aperto = c.id; disegna(); });
    });
    return f;
  }

  function conversazione(c) {
    var f = document.createDocumentFragment();
    f.appendChild(testata(c.contatto, c.ultimo_accesso ? 'ultimo accesso ' + c.ultimo_accesso : (c.gruppo ? 'gruppo' : ''),
      function () { aperto = null; disegna(); }));
    var corpo = f.appendChild(el('div', 'tel-messaggi'));
    var msg = messaggiDi(c);
    // I non letti sono gli ultimi N messaggi ricevuti.
    var daSegnare = c.non_letti || 0, primoNonLetto = -1;
    for (var i = msg.length - 1; i >= 0 && daSegnare > 0; i--) {
      if (msg[i].testo && msg[i].da !== 'io') { primoNonLetto = i; daSegnare--; }
    }
    var divisore = null;
    msg.forEach(function (m, i) {
      if (m.giorno) { corpo.appendChild(el('div', 'tel-giorno')).appendChild(el('span', null, m.giorno)); return; }
      if (i === primoNonLetto) {
        divisore = corpo.appendChild(el('div', 'tel-nonletti', c.non_letti + (c.non_letti === 1 ? ' messaggio non letto' : ' messaggi non letti')));
      }
      var mio = m.da === 'io';
      var b = corpo.appendChild(el('div', 'tel-bolla ' + (mio ? 'mia' : 'sua')));
      if (c.gruppo && !mio) b.appendChild(el('span', 'tel-mittente', m.da));
      b.appendChild(el('span', 'tel-testo', m.testo));
      var meta = b.appendChild(el('span', 'tel-meta', m.ora));
      if (mio) meta.appendChild(el('span', 'tel-spunte' + (m.stato === 'letto' ? ' lette' : ''), m.stato === 'inviato' ? ' ✓' : ' ✓✓'));
    });
    var scrivi = f.appendChild(el('div', 'tel-scrivi'));
    var campo = scrivi.appendChild(el('div', 'tel-campo' + (c.bozza ? ' con-bozza' : '')));
    campo.textContent = c.bozza || 'Messaggio';
    if (c.bozza) campo.appendChild(el('span', 'tel-caret'));
    scrivi.appendChild(el('span', 'tel-invia', '➤'));
    requestAnimationFrame(function () {
      corpo.scrollTop = divisore ? divisore.offsetTop - corpo.offsetTop - 40 : corpo.scrollHeight;
    });
    return f;
  }

  /* ---------- galleria ---------- */

  function galleria() {
    var f = document.createDocumentFragment();
    var foto = visibili(stato.archivio.galleria);
    f.appendChild(testata('Galleria', foto.length + (foto.length === 1 ? ' elemento' : ' elementi')));
    var g = f.appendChild(el('div', 'tel-galleria'));
    var perIngrandimento = foto.map(function (x) {
      return { img: x.img, etichetta: 'Galleria · ' + (x.data || ''), titolo: x.titolo || '', testo: x.didascalia || '' };
    });
    foto.forEach(function (x, i) {
      var b = g.appendChild(el('button', 'tel-foto'));
      var img = b.appendChild(el('img'));
      img.src = x.img;
      img.alt = x.titolo || '';
      b.addEventListener('click', function () { Schermo.ingrandisci(perIngrandimento, i); });
    });
    if (!foto.length) g.appendChild(el('p', 'tel-vuoto', 'Nessuna foto.'));
    return f;
  }

  /* ---------- note ---------- */

  function note() {
    var elenco = visibili(stato.archivio.note);
    var f = document.createDocumentFragment();
    if (aperto !== null && elenco[aperto]) {
      var n = elenco[aperto];
      f.appendChild(testata(n.titolo, n.data, function () { aperto = null; disegna(); }));
      f.appendChild(el('div', 'tel-nota', n.testo));
      return f;
    }
    f.appendChild(testata('Note'));
    var ul = f.appendChild(el('ul', 'tel-lista'));
    elenco.forEach(function (n, i) {
      var li = ul.appendChild(el('li', 'tel-nota-voce'));
      li.appendChild(el('strong', null, n.titolo));
      li.appendChild(el('span', 'tel-anteprima', (n.data ? n.data + '  ' : '') + n.testo.split('\n')[0]));
      li.addEventListener('click', function () { aperto = i; disegna(); });
    });
    if (!elenco.length) ul.appendChild(el('li', 'tel-vuoto', 'Nessuna nota.'));
    return f;
  }

  /* ---------- telaio ---------- */

  function disegna() {
    if (!disponibile(scheda)) { scheda = 'chat'; aperto = null; }
    var s = stato.archivio.stato;
    barraStato.textContent = '';
    barraStato.appendChild(el('span', null, s.ora || ''));
    barraStato.appendChild(el('span', null, (s.operatore || '') + '  ▂▄▆  ' + (s.batteria != null ? s.batteria + '%' : '')));

    app.textContent = '';
    if (scheda === 'chat') {
      var c = aperto && stato.archivio.chat.find(function (x) { return x.id === aperto; });
      app.appendChild(c ? conversazione(c) : elencoChat());
    } else if (scheda === 'galleria') {
      app.appendChild(galleria());
    } else {
      app.appendChild(note());
    }

    barraSchede.textContent = '';
    SCHEDE.forEach(function (d) {
      var b = barraSchede.appendChild(el('button', 'tel-scheda'));
      var attiva = disponibile(d[0]);
      b.appendChild(el('span', null, d[1]));
      if (!attiva) {
        b.disabled = true;
        b.appendChild(el('small', null, '🔒 ep. ' + stato.archivio.schede[d[0]]));
      }
      if (d[0] === scheda) b.classList.add('attiva');
      b.addEventListener('click', function () { vai(d[0]); });
    });
  }

  function vai(s) {
    if (!disponibile(s)) return;
    scheda = s;
    aperto = null;
    disegna();
  }

  function scorri(dy) {
    var area = app.querySelector('.tel-messaggi, .tel-lista, .tel-galleria, .tel-nota');
    if (area) area.scrollBy({ top: dy });
  }

  function tasto(e) {
    var k = e.key.toLowerCase();
    for (var i = 0; i < SCHEDE.length; i++) if (k === SCHEDE[i][2]) { vai(SCHEDE[i][0]); return true; }
    if (e.key === 'Escape' && aperto !== null) { aperto = null; disegna(); return true; }
    var passi = { ArrowDown: 120, ArrowUp: -120, PageDown: 600, PageUp: -600 };
    if (passi[e.key]) { scorri(passi[e.key]); return true; }
    return false;
  }

  Schermo.registra(5, {
    nome: 'Archivio',
    init: function (el_, s) {
      stato = s;
      radice = el_;
      radice.classList.add('archivio');

      var info = radice.appendChild(el('aside', 'archivio-info'));
      info.appendChild(el('p', 'etichetta accento', 'Reperto · telefono'));
      info.appendChild(el('h2', null, 'Telefono di ' + (s.archivio.stato.proprietario || 'della vittima')));
      if (s.archivio.stato.modello) info.appendChild(el('p', null, s.archivio.stato.modello));
      if (s.archivio.stato.rinvenuto) info.appendChild(el('p', null, s.archivio.stato.rinvenuto));

      var tel = radice.appendChild(el('div', 'telefono'));
      barraStato = tel.appendChild(el('div', 'tel-stato'));
      app = tel.appendChild(el('div', 'tel-app'));
      barraSchede = tel.appendChild(el('nav', 'tel-schede'));
    },
    render: function () { disegna(); },
    tasto: tasto
  });
})();
