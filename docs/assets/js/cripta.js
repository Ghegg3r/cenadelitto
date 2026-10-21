/*
 * Cripta — cifratura a riposo dei contenuti riservati.
 * AES-GCM 256 con chiave derivata via PBKDF2-SHA256 (SubtleCrypto).
 * Lo stesso file gira nel browser (window.Cripta) e in Node (require).
 */
(function (root) {
  'use strict';

  var ITER_PASSPHRASE = 300000; // passphrase scelte da umani: servono molte iterazioni
  var ITER_CHIAVE = 10000;      // chiavi casuali a 128 bit: lo stretching non serve

  function subtle() {
    if (!root.crypto || !root.crypto.subtle) {
      throw new Error('SubtleCrypto non disponibile (serve https o localhost).');
    }
    return root.crypto.subtle;
  }

  // Le passphrase si digitano al buio, spesso su un telefono che mette la maiuscola
  // da solo: maiuscole, spazi doppi e spazi ai bordi non devono contare.
  function normalizzaPassphrase(p) {
    return String(p).normalize('NFC').trim().toLowerCase().replace(/\s+/g, ' ');
  }

  // Segreto per i contenuti di un episodio. Per le schede personali si aggiunge la
  // chiave del giocatore: chi conosce la passphrase non può aprire le schede altrui.
  function segretoEpisodio(passphrase, chiaveGiocatore) {
    var s = normalizzaPassphrase(passphrase);
    return chiaveGiocatore ? s + '\u0000' + chiaveGiocatore : s;
  }

  function aB64(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i += 0x8000) {
      s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(s);
  }

  function daB64(str) {
    var s = atob(str);
    var out = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }

  function casuale(n) {
    return root.crypto.getRandomValues(new Uint8Array(n));
  }

  // Chiave personale in formato base64url (finisce nel #frammento dell'URL).
  function nuovaChiave() {
    return aB64(casuale(16)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  async function deriva(segreto, salt, iter) {
    var materiale = await subtle().importKey(
      'raw', new TextEncoder().encode(segreto), 'PBKDF2', false, ['deriveKey']);
    return subtle().deriveKey(
      { name: 'PBKDF2', hash: 'SHA-256', salt: salt, iterations: iter },
      materiale, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }

  async function cifra(oggetto, segreto, opzioni) {
    var iter = (opzioni && opzioni.iter) || ITER_PASSPHRASE;
    var salt = casuale(16);
    var iv = casuale(12);
    var chiave = await deriva(segreto, salt, iter);
    var chiaro = new TextEncoder().encode(JSON.stringify(oggetto));
    var cifrato = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv: iv }, chiave, chiaro));
    return { v: 1, alg: 'AES-GCM', kdf: 'PBKDF2-SHA256', iter: iter, salt: aB64(salt), iv: aB64(iv), dati: aB64(cifrato) };
  }

  async function decifra(blob, segreto) {
    if (!blob || blob.v !== 1) throw new Error('Formato cifrato sconosciuto.');
    var chiave = await deriva(segreto, daB64(blob.salt), blob.iter);
    var chiaro;
    try {
      chiaro = await subtle().decrypt({ name: 'AES-GCM', iv: daB64(blob.iv) }, chiave, daB64(blob.dati));
    } catch (e) {
      var err = new Error('Passphrase errata.');
      err.passphraseErrata = true;
      throw err;
    }
    return JSON.parse(new TextDecoder().decode(chiaro));
  }

  var Cripta = {
    ITER_PASSPHRASE: ITER_PASSPHRASE,
    ITER_CHIAVE: ITER_CHIAVE,
    normalizzaPassphrase: normalizzaPassphrase,
    segretoEpisodio: segretoEpisodio,
    nuovaChiave: nuovaChiave,
    cifra: cifra,
    decifra: decifra
  };

  root.Cripta = Cripta;
  if (typeof module === 'object' && module.exports) module.exports = Cripta;
})(typeof globalThis !== 'undefined' ? globalThis : this);
