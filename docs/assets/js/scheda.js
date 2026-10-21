/*
 * Scheda personale — gira sul telefono di un solo giocatore.
 *
 * La pagina contiene solo testo cifrato. La chiave del giocatore arriva nel
 * #frammento dell'URL consegnato a mano (il frammento non viene mai inviato al
 * server e non sta nel repository); dopo la prima apertura resta su questo telefono.
 * Gli episodi successivi richiedono in più la passphrase della serata, che non
 * viene mai salvata: si tiene solo in memoria finché la pagina resta aperta.
 */
(function () {
  'use strict';

  var fascicolo = JSON.parse(document.getElementById('fascicolo').textContent);
  var slug = fascicolo.slug;
  var app = document.getElementById('app');
  var chiave = null;
  var aperti = {};      // n -> contenuto decifrato dell'episodio
  var anagrafica = null;
  var corrente = 1;
  var spunte = {};

  function el(tag, classe, testo) {
    var e = document.createElement(tag);
    if (classe) e.className = classe;
    if (testo != null) e.textContent = testo;
    return e;
  }

  function leggi(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function scrivi(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage bloccato */ } }

  /* ---------- sezioni ---------- */

  function sezione(titolo, testo, classe) {
    var s = el('section', 'blocco' + (classe ? ' ' + classe : ''));
    s.appendChild(el('h3', 'etichetta', titolo));
    s.appendChild(el('p', 'testo', testo));
    return s;
  }

  function missioni(n, lista) {
    var s = el('section', 'blocco');
    s.appendChild(el('h3', 'etichetta', 'Missioni'));
    var ul = s.appendChild(el('ul', 'missioni'));
    lista.forEach(function (m, i) {
      var id = n + '-' + i;
      var li = ul.appendChild(el('li'));
      var lab = li.appendChild(el('label'));
      var box = lab.appendChild(el('input'));
      box.type = 'checkbox';
      box.checked = !!spunte[id];
      lab.appendChild(el('span', null, m));
      box.addEventListener('change', function () {
        if (box.checked) spunte[id] = true; else delete spunte[id];
        scrivi('cena.missioni.' + slug, JSON.stringify(spunte));
      });
    });
    return s;
  }

  function contenutoEpisodio(n) {
    var ep = aperti[n];
    var f = document.createDocumentFragment();
    if (ep.segreto) f.appendChild(sezione('Il tuo segreto', ep.segreto));
    if (ep.bugia_obbligatoria) f.appendChild(sezione('Bugia obbligatoria', ep.bugia_obbligatoria, 'bugia'));
    if (ep.missioni && ep.missioni.length) f.appendChild(missioni(n, ep.missioni));
    return f;
  }

  function titoloEpisodio(n) {
    var t = aperti[n] && aperti[n].titolo;
    return 'Episodio ' + n + (t ? ' · ' + t : '');
  }

  function bloccoSigillato(info, primo) {
    var s = el('section', 'sigillato');
    s.appendChild(el('h3', 'etichetta', 'Episodio ' + info.n + ' · sigillato'));
    if (!primo) {
      s.appendChild(el('p', 'nota', 'Si apre dopo l\'episodio ' + (info.n - 1) + '.'));
      return s;
    }
    var form = s.appendChild(el('form'));
    form.autocomplete = 'off';
    var input = form.appendChild(el('input'));
    input.type = 'text';
    input.placeholder = 'Passphrase';
    input.setAttribute('autocapitalize', 'off');
    input.setAttribute('autocorrect', 'off');
    input.setAttribute('autocomplete', 'off');
    input.spellcheck = false;
    input.setAttribute('aria-label', 'Passphrase episodio ' + info.n);
    var bottone = form.appendChild(el('button', null, 'Apri'));
    var esito = s.appendChild(el('p', 'esito'));
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      if (!input.value.trim()) return;
      bottone.disabled = true;
      esito.textContent = 'Apertura…';
      try {
        aperti[info.n] = await Cripta.decifra(info.blob, Cripta.segretoEpisodio(input.value, chiave));
        corrente = info.n;
        disegna();
        window.scrollTo(0, 0);
      } catch (err) {
        esito.textContent = err.passphraseErrata ? 'Passphrase errata. Riprova.' : 'Errore: ' + err.message;
        bottone.disabled = false;
        input.select();
      }
    });
    return s;
  }

  /* ---------- pagina ---------- */

  function disegna() {
    app.textContent = '';

    var testa = app.appendChild(el('header', 'testa'));
    var chi = testa.appendChild(el('div', 'chi'));
    chi.appendChild(el('h1', null, anagrafica.nome));
    if (anagrafica.ruolo) chi.appendChild(el('p', null, anagrafica.ruolo));
    var dico = testa.appendChild(el('button', 'dico', 'Cosa dico di me'));
    dico.addEventListener('click', apriPubblico);

    var corpo = app.appendChild(el('main'));
    corpo.appendChild(el('h2', 'episodio', titoloEpisodio(corrente)));
    corpo.appendChild(contenutoEpisodio(corrente));

    for (var n = corrente - 1; n >= 1; n--) {
      var d = corpo.appendChild(el('details', 'precedente'));
      d.appendChild(el('summary', null, titoloEpisodio(n)));
      d.appendChild(contenutoEpisodio(n));
    }

    var primo = true;
    fascicolo.episodi.forEach(function (info) {
      if (aperti[info.n]) return;
      corpo.appendChild(bloccoSigillato(info, primo));
      primo = false;
    });

    corpo.appendChild(el('p', 'piede', 'Fascicolo riservato. Non mostrarlo a nessuno.'));
  }

  function apriPubblico() {
    var testo = (aperti[corrente] && aperti[corrente].pubblico) || aperti[1].pubblico || '';
    var o = el('div', 'pubblico');
    o.setAttribute('role', 'dialog');
    o.appendChild(el('p', 'etichetta', 'Da leggere ad alta voce'));
    o.appendChild(el('h2', null, anagrafica.nome));
    o.appendChild(el('p', 'testo', testo));
    var chiudi = o.appendChild(el('button', 'chiudi', 'Chiudi'));
    chiudi.addEventListener('click', function () { o.remove(); });
    document.body.appendChild(o);
    chiudi.focus();
  }

  function sigillato(messaggio) {
    app.textContent = '';
    var s = app.appendChild(el('div', 'chiuso'));
    s.appendChild(el('p', 'etichetta', 'Fascicolo sigillato'));
    s.appendChild(el('p', null, messaggio));
  }

  /* ---------- avvio ---------- */

  async function avvia() {
    Offline.registra('../../sw.js');
    Offline.assicura([location.pathname, '../../assets/css/scheda.css',
      '../../assets/js/cripta.js', '../../assets/js/offline.js', '../../assets/js/scheda.js']);

    var dalLink = location.hash.slice(1);
    chiave = dalLink || leggi('cena.chiave.' + slug);
    if (!chiave) { sigillato('Apri il link completo che ti è stato consegnato.'); return; }

    var ep1 = fascicolo.episodi.shift();
    try {
      var dati = await Cripta.decifra(ep1.blob, chiave);
      anagrafica = { nome: dati.nome, ruolo: dati.ruolo };
      aperti[1] = dati.episodio;
    } catch (err) {
      sigillato(err.passphraseErrata
        ? 'Il link non è completo o non è corretto. Riaprilo dal messaggio originale.'
        : 'Errore: ' + err.message);
      return;
    }
    if (dalLink) scrivi('cena.chiave.' + slug, chiave);
    try { spunte = JSON.parse(leggi('cena.missioni.' + slug)) || {}; } catch (e) { spunte = {}; }
    document.title = anagrafica.nome + ' · fascicolo';
    disegna();
  }

  // Il link riaperto su una pagina già aperta cambia solo il frammento: ricarica.
  window.addEventListener('hashchange', function () { location.reload(); });

  avvia();
})();
