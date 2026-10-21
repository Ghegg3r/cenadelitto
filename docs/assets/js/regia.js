/*
 * Collegamento alla regia (scripts/regia.js), lato schermo.
 * Se il sito non è servito dalla regia (es. GitHub Pages) non fa nulla e lo schermo
 * resta pilotabile da tastiera come sempre. Se lo è, lo schermo entra in modalità
 * regia: i giocatori usano Bacheca, Timeline e Archivio; il resto lo comanda il telefono.
 */
(function () {
  'use strict';

  var coda = Promise.resolve();   // i comandi si eseguono uno alla volta, nell'ordine
  var esito = null;
  var timerStato;

  function inviaStato() {
    clearTimeout(timerStato);
    timerStato = setTimeout(function () {
      var s = Schermo.stato();
      var media = Schermo.vista(3);
      var prossimo = Schermo.prossimoEpisodio();
      var corpo = {
        vista: Schermo.corrente(),
        viste: [1, 2, 3, 4, 5].filter(Schermo.vista).map(function (n) { return { n: n, nome: Schermo.vista(n).nome }; }),
        episodio: s.episodio,
        titolo: s.titoli[s.episodio] || '',
        prossimo: prossimo ? prossimo.n : null,
        media: media ? media.elenco() : [],
        inOnda: media ? media.inOnda() : null,
        audioAttivo: !navigator.userActivation || navigator.userActivation.hasBeenActive,
        esito: esito
      };
      esito = null;
      fetch('regia/stato', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })
        .catch(function () {});
    }, 120);
  }

  async function esegui(c) {
    switch (c.tipo) {
      case 'vista':
        Schermo.mostra(c.n);
        break;
      case 'media':
        Schermo.vista(3).comandi.suona(c.id);
        break;
      case 'media-pausa':
        Schermo.vista(3).comandi.pausa();
        break;
      case 'media-ricomincia':
        Schermo.vista(3).comandi.ricomincia();
        break;
      case 'media-salta':
        Schermo.vista(3).comandi.salta(c.secondi || 0);
        break;
      case 'media-chiudi':
        Schermo.vista(3).comandi.chiudi();
        if (Schermo.corrente() === 3) Schermo.mostra(1);
        break;
      case 'azzera-timeline':
        Schermo.vista(2).comandi.azzera();
        Schermo.avviso('Timeline azzerata');
        break;
      case 'sblocca':
        try {
          await Schermo.sblocca(c.passphrase);
          esito = { tipo: 'sblocca', ok: true, messaggio: 'Episodio ' + Schermo.stato().episodio + ' aperto', passphrase: c.passphrase };
        } catch (err) {
          // Al ripristino dopo una ricarica, i tentativi a vuoto non interessano a nessuno.
          if (!c.ripristino) esito = { tipo: 'sblocca', ok: false, messaggio: err.passphraseErrata ? 'Passphrase errata' : err.message };
        }
        break;
      default:
        return;
    }
    inviaStato();
  }

  // Chrome non fa partire l'audio finché nessuno ha cliccato la pagina almeno una volta.
  function chiediClic() {
    if (!navigator.userActivation || navigator.userActivation.hasBeenActive) return;
    var o = document.createElement('div');
    o.className = 'regia-attiva';
    o.appendChild(Schermo.el('p', 'etichetta accento', 'Regia collegata'));
    o.appendChild(Schermo.el('p', null, 'Clicca una volta qui per abilitare l\'audio.'));
    document.body.appendChild(o);
    function via() { o.remove(); inviaStato(); document.removeEventListener('pointerdown', via, true); }
    document.addEventListener('pointerdown', via, true);
  }

  async function avvia() {
    await Schermo.pronto;
    try {
      var r = await fetch('regia/ping', { cache: 'no-store' });
      if (!r.ok || !(await r.json()).regia) return;
    } catch (e) { return; }

    Schermo.attivaRegia();
    chiediClic();
    Schermo.ascolta(inviaStato);

    var flusso = new EventSource('regia/schermo');
    flusso.onmessage = function (e) {
      var c = JSON.parse(e.data);
      if (c.tipo === 'battito') return;
      coda = coda.then(function () { return esegui(c); });
    };
    flusso.onopen = inviaStato;
    setInterval(inviaStato, 5000);
  }

  avvia();
})();
