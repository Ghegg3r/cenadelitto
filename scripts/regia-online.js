#!/usr/bin/env node
/*
 * Regia via internet: prepara i due link della serata.
 *
 *   node scripts/regia-online.js            -> stampa i link (crea il codice la prima volta)
 *   node scripts/regia-online.js --nuovo    -> nuovo codice: i link vecchi smettono di funzionare
 *
 * - Il codice di regia sta in locale/regia.json (privato) e nel #frammento dei due link:
 *   chi ha il link dello schermo o della console può comandare lo schermo.
 * - Se esiste locale/scaletta.json, la cifra con il codice in docs/data/scaletta.enc.json
 *   (da committare): la console online la legge e la decifra.
 * - L'indirizzo del sito si ricava dal remote git (https://<utente>.github.io/<repo>/);
 *   si può forzare con --base.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');
const { Cripta, DOCS, LOCALE, RADICE, argomenti, esci, leggiJson, scriviJson } = require('./comune.js');

const FILE_CONFIG = path.join(LOCALE, 'regia.json');
const FILE_SCALETTA = path.join(LOCALE, 'scaletta.json');
const USCITA_SCALETTA = path.join(DOCS, 'data', 'scaletta.enc.json');

function baseDaGit() {
  try {
    const url = execSync('git remote get-url origin', { cwd: RADICE, encoding: 'utf8' }).trim();
    const m = /github\.com[/:]([^/]+)\/([^/.]+)/.exec(url);
    if (m) return `https://${m[1].toLowerCase()}.github.io/${m[2]}/`;
  } catch (e) { /* nessun remote */ }
  return null;
}

async function main() {
  const { opz } = argomenti(process.argv.slice(2));
  const config = fs.existsSync(FILE_CONFIG) ? leggiJson(FILE_CONFIG) : {};
  if (!config.codice || opz.nuovo) {
    config.codice = Cripta.nuovaChiave();
    scriviJson(FILE_CONFIG, config);
    console.log('✓ Nuovo codice di regia in locale/regia.json');
  }

  if (fs.existsSync(FILE_SCALETTA)) {
    const scaletta = leggiJson(FILE_SCALETTA);
    if (!Array.isArray(scaletta)) esci('locale/scaletta.json deve essere un elenco di passi.');
    scriviJson(USCITA_SCALETTA, await Cripta.cifra(scaletta, config.codice, { iter: 1000 }));
    console.log(`✓ Scaletta (${scaletta.length} passi) cifrata in docs/data/scaletta.enc.json — committala e pubblica`);
  } else if (fs.existsSync(USCITA_SCALETTA)) {
    fs.rmSync(USCITA_SCALETTA);
    console.log('- Nessuna locale/scaletta.json: rimossa docs/data/scaletta.enc.json');
  }

  const base = (typeof opz.base === 'string' ? opz.base : baseDaGit() || '').replace(/\/?$/, '/');
  if (base === '/') esci('Non trovo l\'indirizzo del sito: passa --base https://<utente>.github.io/<repo>/');

  console.log('\n  SCHERMO (sul portatile della TV, una volta; poi se lo ricorda):');
  console.log(`  ${base}#regia=${config.codice}`);
  console.log('\n  CONSOLE (sul tuo telefono; salvala tra i preferiti):');
  console.log(`  ${base}regia/#${config.codice}`);
  console.log('\n  Non condividere questi link: chi li ha può comandare lo schermo.\n');
}

main().catch(e => esci(e.stack || e.message));
