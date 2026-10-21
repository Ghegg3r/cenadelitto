/*
 * Vista 4 — OROLOGIO: solo l'ora della morte, per gli stacchi.
 */
(function () {
  'use strict';

  Schermo.registra(4, {
    nome: 'Orologio',
    init: function (el, stato) {
      el.classList.add('orologio');
      el.appendChild(Schermo.el('p', 'etichetta', stato.config.didascalia_morte || 'Ora presunta del decesso'));
      el.appendChild(Schermo.el('p', 'orologio-ora', stato.config.ora_morte));
      el.appendChild(Schermo.el('p', 'orologio-luogo', stato.config.luogo + ' · ' + stato.config.data));
    }
  });
})();
