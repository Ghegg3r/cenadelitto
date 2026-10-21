/*
 * Vista 1 — BACHECA: le prove degli episodi già sbloccati.
 * Frecce per scegliere un reperto, Invio (o clic) per ingrandirlo.
 */
(function () {
  'use strict';

  var radice, griglia, elenco = [], scelto = -1;

  function disposizione(n) {
    if (n <= 4) return { col: Math.max(n, 3), righe: 1 };
    if (n <= 8) return { col: 4, righe: 2 };
    if (n <= 12) return { col: 4, righe: 3 };
    if (n <= 15) return { col: 5, righe: 3 };
    return { col: 6, righe: Math.ceil(n / 6) };
  }

  function perIngrandimento(p) {
    return { img: p.img, etichetta: 'Reperto ' + p.id, titolo: p.titolo, testo: p.didascalia,
      meta: 'Rinvenuto alle ' + p.ora + (p.luogo ? ' · ' + p.luogo : '') };
  }

  function apri(i) { Schermo.ingrandisci(elenco.map(perIngrandimento), i); }

  function evidenzia() {
    Array.prototype.forEach.call(griglia.children, function (c, i) {
      c.classList.toggle('scelto', i === scelto);
    });
  }

  function render(stato) {
    elenco = stato.prove.filter(function (p) { return p.episodio <= stato.episodio; });
    var d = disposizione(elenco.length);
    griglia.style.setProperty('--colonne', d.col);
    griglia.style.setProperty('--righe', d.righe);
    griglia.dataset.densita = d.righe;
    griglia.textContent = '';

    if (!elenco.length) {
      griglia.appendChild(Schermo.el('p', 'vuoto', 'Nessuna prova ancora.'));
      return;
    }
    elenco.forEach(function (p, i) {
      var c = Schermo.el('article', 'reperto');
      if (stato.episodio > 1 && p.episodio === stato.episodio) c.classList.add('nuovo');
      var img = Schermo.el('img');
      img.src = p.img;
      img.alt = p.titolo;
      c.appendChild(Schermo.el('div', 'reperto-foto')).appendChild(img);
      var t = c.appendChild(Schermo.el('div', 'reperto-testo'));
      t.appendChild(Schermo.el('p', 'etichetta accento', 'Reperto ' + p.id));
      t.appendChild(Schermo.el('h2', null, p.titolo));
      t.appendChild(Schermo.el('p', 'reperto-didascalia', p.didascalia));
      t.appendChild(Schermo.el('p', 'reperto-ora', 'ore ' + p.ora + (p.luogo ? ' · ' + p.luogo : '')));
      c.addEventListener('click', function () { scelto = i; evidenzia(); apri(i); });
      griglia.appendChild(c);
    });
    if (scelto >= elenco.length) scelto = -1;
    evidenzia();
  }

  function tasto(e) {
    if (!elenco.length) return false;
    var col = parseInt(griglia.style.getPropertyValue('--colonne'), 10);
    var passi = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: col, ArrowUp: -col };
    if (passi[e.key] !== undefined) {
      scelto = scelto < 0 ? 0 : Math.min(elenco.length - 1, Math.max(0, scelto + passi[e.key]));
      evidenzia();
      return true;
    }
    if (e.key === 'Enter' && scelto >= 0) { apri(scelto); return true; }
    if (e.key === 'Escape') { scelto = -1; evidenzia(); return true; }
    return false;
  }

  Schermo.registra(1, {
    nome: 'Bacheca',
    giocatori: true,
    init: function (el) {
      radice = el;
      griglia = radice.appendChild(Schermo.el('div', 'bacheca'));
    },
    render: render,
    tasto: tasto
  });
})();
