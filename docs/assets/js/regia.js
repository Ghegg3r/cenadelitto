/*
 * Collegamento alla regia, lato schermo. Due modi:
 *
 *   - ONLINE: lo schermo è aperto con "#regia=<codice>" (link da scripts/regia-online.js).
 *     I comandi arrivano dal telefono via internet (ponte.js), cifrati con il codice.
 *     Il codice resta salvato su questo portatile; "#regia=off" lo dimentica.
 *   - LOCALE: il sito è servito da scripts/regia.js sul portatile (nessun internet).
 *
 * Senza regia lo schermo resta pilotabile da tastiera come sempre. In regia i giocatori
 * usano Bacheca, Timeline e Archivio; il resto lo comanda il telefono.
 */
(function () {
  'use strict';

  var CHIAVE_CODICE = 'cena.regia.codice';
  var hashIniziale = location.hash;  // va letto subito: lo schermo poi lo sostituisce con "#1"

  var coda = Promise.resolve();       // i comandi si eseguono uno alla volta, nell'ordine
  var esito = null;
  var timerStato, ultimoInviato = '';
  var trasporto = null;               // { invia(stato), locale: bool }

  function leggi(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function scrivi(k, v) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* bloccato */ } }

  function codiceOnline() {
    var m = /regia=([^&]+)/.exec(hashIniziale);
    if (m && m[1] === 'off') { scrivi(CHIAVE_CODICE, null); return null; }
    var c = m && Ponte.codiceValido(m[1]);
    if (c) { scrivi(CHIAVE_CODICE, c); return c; }
    return Ponte.codiceValido(leggi(CHIAVE_CODICE));
  }

  function fotografia() {
    var s = Schermo.stato();
    var media = Schermo.vista(3);
    var prossimo = Schermo.prossimoEpisodio();
    return {
      vista: Schermo.corrente(),
      viste: [1, 2, 3, 4, 5].filter(Schermo.vista).map(function (n) { return { n: n, nome: Schermo.vista(n).nome }; }),
      episodio: s.episodio,
      titolo: s.titoli[s.episodio] || '',
      prossimo: prossimo ? prossimo.n : null,
      media: media ? media.elenco() : [],
      inOnda: media ? media.inOnda() : null,
      audioAttivo: !navigator.userActivation || navigator.userActivation.hasBeenActive
    };
  }

  // Manda lo stato solo se è cambiato (online ogni messaggio conta), o se forzato.
  function inviaStato(forza) {
    clearTimeout(timerStato);
    timerStato = setTimeout(function () {
      var f = fotografia();
      var firma = JSON.stringify(f, function (k, v) { return k === 'aggiornato' ? undefined : v; });
      if (!forza && !esito && firma === ultimoInviato) return;
      ultimoInviato = firma;
      f.esito = esito;
      esito = null;
      trasporto.invia(f);
    }, forza === true ? 0 : 250);
  }

  async function esegui(c) {
    switch (c.tipo) {
      case 'ciao':
        inviaStato(true);
        return;
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
          esito = { tipo: 'sblocca', ok: true, episodio: Schermo.stato().episodio,
            messaggio: 'Episodio ' + Schermo.stato().episodio + ' aperto' };
          // Solo la regia locale tiene le passphrase (in RAM) per ripristinare dopo una ricarica;
          // online le ricorda la console del telefono.
          if (trasporto.locale) esito.passphrase = c.passphrase;
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

  function ricevi(c) {
    if (c.tipo === 'battito') return;
    coda = coda.then(function () { return esegui(c); });
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

  function entraInRegia() {
    Schermo.attivaRegia();
    chiediClic();
    Schermo.ascolta(inviaStato);
  }

  async function avviaOnline(codice) {
    var ponte = await Ponte.apri(codice, 'schermo', ricevi, function (ok) {
      document.body.classList.toggle('regia-scollegata', !ok);
      if (ok) inviaStato(true);   // appena (ri)collegato, la console deve sapere che ci siamo
    });
    trasporto = {
      locale: false,
      invia: function (f) { ponte.invia({ tipo: 'stato', stato: f }).catch(function () { ultimoInviato = ''; }); }
    };
    entraInRegia();
  }

  function avviaLocale() {
    trasporto = {
      locale: true,
      invia: function (f) {
        fetch('regia/stato', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f) })
          .catch(function () { ultimoInviato = ''; });
      }
    };
    entraInRegia();
    var flusso = new EventSource('regia/schermo');
    flusso.onmessage = function (e) { ricevi(JSON.parse(e.data)); };
    flusso.onopen = function () { inviaStato(true); };
  }

  async function avvia() {
    await Schermo.pronto;
    var codice = codiceOnline();
    if (codice) {
      if (window.crypto && crypto.subtle) await avviaOnline(codice);
      return;
    }
    try {
      var r = await fetch('regia/ping', { cache: 'no-store' });
      if (r.ok && (await r.json()).regia) avviaLocale();
    } catch (e) { /* nessuna regia: si usa la tastiera */ }
  }

  avvia();
})();
