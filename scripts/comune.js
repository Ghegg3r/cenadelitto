/*
 * Funzioni condivise dagli script (nessuna dipendenza npm).
 * La crittografia è la stessa del sito: docs/assets/js/cripta.js.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

globalThis.crypto ??= require('node:crypto').webcrypto;
const Cripta = require('../docs/assets/js/cripta.js');

const RADICE = path.join(__dirname, '..');
const DOCS = path.join(RADICE, 'docs');
const LOCALE = path.join(RADICE, 'locale');

// --chiave valore  oppure  --chiave=valore
function argomenti(argv) {
  const opz = {}, posizionali = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { posizionali.push(a); continue; }
    const [k, v] = a.slice(2).split(/=(.*)/s);
    if (v !== undefined) opz[k] = v;
    else if (argv[i + 1] !== undefined && !argv[i + 1].startsWith('--')) opz[k] = argv[++i];
    else opz[k] = true;
  }
  return { opz, posizionali };
}

function esci(messaggio) {
  console.error('\n✗ ' + messaggio + '\n');
  process.exit(1);
}

function dentro(cartella, file) {
  const rel = path.relative(cartella, path.resolve(file));
  return !rel.startsWith('..') && !path.isAbsolute(rel);
}

function leggiJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) { esci(`Non riesco a leggere ${path.relative(RADICE, file)}: ${e.message}`); }
}

function scriviJson(file, dati) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(dati, null, 2) + '\n');
}

module.exports = { Cripta, RADICE, DOCS, LOCALE, argomenti, esci, dentro, leggiJson, scriviJson };
