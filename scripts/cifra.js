#!/usr/bin/env node
/*
 * Cifra i contenuti di un episodio per lo schermo centrale.
 *
 *   node scripts/cifra.js locale/episodio-2.json "passphrase dell'episodio 2"
 *     -> docs/data/episodio-2.enc.json
 *
 * Il file in chiaro deve stare fuori da docs/ (di norma in locale/, ignorata da git).
 * Struttura del file in chiaro: { "titolo", "prove": [], "media": [], "archivio": { "chat", "galleria", "note" } }
 *
 * Immagini, audio e video degli episodi futuri non devono stare in chiaro in docs/:
 * nel JSON scrivi "@file:img/foto.jpg" (percorso relativo al JSON) e il file viene
 * incorporato dentro il pacchetto cifrato.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { Cripta, DOCS, RADICE, argomenti, esci, dentro, leggiJson, scriviJson } = require('./comune.js');

const TIPI = {
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.gif': 'image/gif', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4',
  '.ogg': 'audio/ogg', '.wav': 'audio/wav'
};

function incorpora(valore, cartella, usati) {
  if (typeof valore === 'string' && valore.startsWith('@file:')) {
    const file = path.resolve(cartella, valore.slice(6));
    if (!fs.existsSync(file)) esci(`File non trovato: ${valore}`);
    const tipo = TIPI[path.extname(file).toLowerCase()];
    if (!tipo) esci(`Tipo di file non supportato: ${valore}`);
    usati.push(path.relative(RADICE, file));
    return `data:${tipo};base64,${fs.readFileSync(file).toString('base64')}`;
  }
  if (Array.isArray(valore)) return valore.map(v => incorpora(v, cartella, usati));
  if (valore && typeof valore === 'object') {
    return Object.fromEntries(Object.entries(valore).map(([k, v]) => [k, incorpora(v, cartella, usati)]));
  }
  return valore;
}

async function main() {
  const { opz, posizionali } = argomenti(process.argv.slice(2));
  const [ingresso, passphrase] = posizionali;
  if (!ingresso || !passphrase) {
    esci('Uso: node scripts/cifra.js locale/episodio-2.json "passphrase" [--out docs/data/episodio-2.enc.json]');
  }
  if (dentro(DOCS, ingresso)) esci('Il file in chiaro è dentro docs/: verrebbe pubblicato. Spostalo in locale/.');
  if (Cripta.normalizzaPassphrase(passphrase).length < 12) {
    console.warn('! Passphrase corta: chiunque può scaricare il file cifrato e provarne a milioni. Meglio 3-4 parole a caso.');
  }

  const base = path.basename(ingresso).replace(/\.json$/i, '');
  const uscita = path.resolve(typeof opz.out === 'string' ? opz.out : path.join(DOCS, 'data', base + '.enc.json'));
  if (!dentro(DOCS, uscita)) esci('L\'uscita deve stare dentro docs/.');

  const chiaro = leggiJson(path.resolve(ingresso));
  const usati = [];
  const pacchetto = incorpora(chiaro, path.dirname(path.resolve(ingresso)), usati);
  const blob = await Cripta.cifra(pacchetto, Cripta.segretoEpisodio(passphrase));

  // Controllo di andata e ritorno prima di scrivere.
  const verifica = await Cripta.decifra(blob, Cripta.segretoEpisodio(passphrase));
  if (JSON.stringify(verifica) !== JSON.stringify(pacchetto)) esci('Verifica fallita: il file non è stato scritto.');

  scriviJson(uscita, blob);
  const kb = Math.round(fs.statSync(uscita).size / 1024);
  console.log(`✓ ${path.relative(RADICE, uscita)} (${kb} KB)`);
  if (usati.length) console.log(`  incorporati: ${usati.join(', ')}`);
  console.log('  Il file in chiaro resta dov\'è: non committarlo.');
}

main().catch(e => esci(e.stack || e.message));
