/*
 * Ponte — canale online tra console di regia (telefono) e schermo, via ntfy.sh.
 *
 * ntfy.sh è un servizio pubblico di notifiche: chiunque conosca il nome di un "topic"
 * ne legge i messaggi. Per questo:
 *   - il topic è un hash del codice di regia (dal nome non si risale al codice);
 *   - ogni messaggio è cifrato con il codice (AES-GCM, vedi cripta.js);
 *   - i messaggi non vengono conservati dal servizio (cache=no) e quelli vecchi si scartano.
 * Il codice di regia sta solo nel #frammento dei due link (schermo e console).
 *
 * Il servizio gratuito ha un limite giornaliero di messaggi: si manda qualcosa solo
 * quando cambia, mai a intervalli regolari.
 */
(function () {
  'use strict';

  var SERVIZIO = 'https://ntfy.sh/';
  var ITER = 1000;              // il codice è casuale a 128 bit: lo stretching non serve
  var SCADENZA = 5 * 60 * 1000; // messaggi più vecchi di così: ignorati (ripetizioni)

  async function topicDa(codice) {
    var h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('cena-regia|' + codice)));
    return 'cdr' + Array.prototype.map.call(h.slice(0, 20), function (b) { return b.toString(16).padStart(2, '0'); }).join('');
  }

  /*
   * ruolo: 'schermo' o 'console' (i messaggi propri vengono ignorati).
   * ricevi(messaggio): chiamata per ogni messaggio valido dell'altra parte.
   * collegato(bool): stato della connessione al servizio.
   */
  async function apri(codice, ruolo, ricevi, collegato) {
    var topic = await topicDa(codice);
    var flusso = new EventSource(SERVIZIO + topic + '/sse');

    flusso.onopen = function () { collegato(true); };
    flusso.onerror = function () { collegato(false); };
    flusso.onmessage = async function (e) {
      var m, dati;
      try {
        m = JSON.parse(e.data);
        if (m.event !== 'message') return;
        dati = await Cripta.decifra(JSON.parse(m.message), codice);
      } catch (err) { return; }      // non è nostro o non si decifra: si ignora
      if (dati.da === ruolo || Math.abs(Date.now() - dati.t) > SCADENZA) return;
      ricevi(dati);
    };

    async function invia(messaggio) {
      var corpo = Object.assign({}, messaggio, { da: ruolo, t: Date.now() });
      var blob = await Cripta.cifra(corpo, codice, { iter: ITER });
      var r = await fetch(SERVIZIO + topic + '?cache=no&firebase=no', { method: 'POST', body: JSON.stringify(blob) });
      if (!r.ok) throw new Error(r.status === 429 ? 'Limite di messaggi del servizio raggiunto: riprova tra poco.' : 'Invio fallito (' + r.status + ')');
    }

    return { invia: invia, chiudi: function () { flusso.close(); } };
  }

  // Codice dal frammento dell'URL: "#regia=XXXX" (schermo) o "#XXXX" (console).
  function codiceValido(c) { return /^[A-Za-z0-9_-]{20,}$/.test(c || '') ? c : null; }

  window.Ponte = { apri: apri, codiceValido: codiceValido };
})();
