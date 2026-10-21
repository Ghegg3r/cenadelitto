#!/usr/bin/env node
/*
 * Genera le schede personali da locale/personaggi.json (file privato, fuori dal repo).
 *
 *   node scripts/build-schede.js --ep2 "passphrase 2" --ep3 "passphrase 3" [--base https://utente.github.io/repo/]
 *
 * Per ogni personaggio scrive docs/s/<slug>/index.html, che contiene SOLO testo cifrato:
 *   - episodio 1: cifrato con la chiave personale del giocatore (nel #frammento del link);
 *   - episodi 2+: cifrati con passphrase dell'episodio + chiave personale.
 * Se ometti la passphrase di un episodio, il blocco già cifrato di quell'episodio
 * viene riusato così com'è (utile per correggere un refuso dell'episodio 1).
 *
 * Scrive anche:
 *   - docs/data/cast.json   solo nomi e ruoli, per la timeline dello schermo centrale;
 *   - locale/schede.md      nome -> slug -> link completo da consegnare (privato).
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const nodeCrypto = require('node:crypto');
const { Cripta, DOCS, LOCALE, argomenti, esci, leggiJson, scriviJson } = require('./comune.js');

const SORGENTE = path.join(LOCALE, 'personaggi.json');
const CARTELLA_SCHEDE = path.join(DOCS, 's');
const ALFABETO = 'abcdefghjkmnpqrstuvwxyz23456789'; // niente 0/o, 1/l/i: si dettano senza equivoci
const FORMA_SLUG = /^[a-z0-9]{12}$/;

function nuovoSlug() {
  let s = '';
  for (let i = 0; i < 12; i++) s += ALFABETO[nodeCrypto.randomInt(ALFABETO.length)];
  return s;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// Il JSON dentro <script type="application/json"> non deve poter chiudere il tag.
function jsonInHtml(dati) {
  return JSON.stringify(dati).replace(/</g, '\\u003c');
}

function bloccoEsistente(slug, n) {
  const file = path.join(CARTELLA_SCHEDE, slug, 'index.html');
  if (!fs.existsSync(file)) return null;
  const m = /<script type="application\/json" id="fascicolo">([\s\S]*?)<\/script>/.exec(fs.readFileSync(file, 'utf8'));
  if (!m) return null;
  const ep = JSON.parse(m[1]).episodi.find(e => e.n === n);
  return ep ? ep.blob : null;
}

// Una passphrase sbagliata qui renderebbe le schede inapribili la sera stessa:
// se l'episodio è già cifrato per lo schermo centrale, deve aprirsi con la stessa.
async function verificaPassphrase(n, passphrase) {
  const file = path.join(DOCS, 'data', `episodio-${n}.enc.json`);
  if (!fs.existsSync(file)) {
    console.warn(`! docs/data/episodio-${n}.enc.json non esiste ancora: non posso verificare la passphrase dell'episodio ${n}.`);
    return;
  }
  try { await Cripta.decifra(leggiJson(file), Cripta.segretoEpisodio(passphrase)); }
  catch (e) { esci(`La passphrase dell'episodio ${n} non apre docs/data/episodio-${n}.enc.json. Refuso? (Le schede non sono state toccate.)`); }
}

function pagina(slug, episodi) {
  return `<!doctype html>
<html lang="it">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="robots" content="noindex,nofollow">
  <meta name="referrer" content="no-referrer">
  <meta name="theme-color" content="#0d0b0a">
  <title>Fascicolo riservato</title>
  <link rel="stylesheet" href="../../assets/css/scheda.css">
</head>
<body>
  <div id="app"><p class="attesa">Apertura del fascicolo…</p></div>
  <script type="application/json" id="fascicolo">${jsonInHtml({ slug, episodi })}</script>
  <script src="../../assets/js/cripta.js"></script>
  <script src="../../assets/js/offline.js"></script>
  <script src="../../assets/js/scheda.js"></script>
</body>
</html>
`;
}

async function main() {
  const { opz } = argomenti(process.argv.slice(2));
  if (!fs.existsSync(SORGENTE)) esci('Manca locale/personaggi.json (vedi README).');
  const sorgente = leggiJson(SORGENTE);
  const titoli = Object.fromEntries((sorgente.episodi || []).map(e => [e.n, e.titolo]));
  const numeri = [...new Set(sorgente.personaggi.flatMap(p => Object.keys(p.episodi).map(Number)))].sort((a, b) => a - b);
  if (numeri[0] !== 1) esci('Ogni personaggio deve avere almeno l\'episodio 1.');

  // Slug e chiavi: si generano una volta sola e poi non cambiano più.
  let modificato = false;
  const usati = new Set();
  for (const p of sorgente.personaggi) {
    if (!p.slug || usati.has(p.slug)) { do { p.slug = nuovoSlug(); } while (usati.has(p.slug)); modificato = true; }
    if (!FORMA_SLUG.test(p.slug)) esci(`Slug non valido per ${p.nome}: ${p.slug}`);
    if (!p.chiave) { p.chiave = Cripta.nuovaChiave(); modificato = true; }
    usati.add(p.slug);
  }

  const passphrase = {};
  for (const n of numeri.filter(n => n > 1)) {
    const p = opz['ep' + n] || process.env['CENA_EP' + n];
    if (typeof p === 'string' && p.trim()) {
      passphrase[n] = p;
      await verificaPassphrase(n, p);
    }
  }

  // Prima si cifra tutto in memoria: se qualcosa manca, nessun file viene toccato.
  const pagine = [];
  for (const p of sorgente.personaggi) {
    const episodi = [];
    for (const n of numeri) {
      const contenuto = p.episodi[String(n)];
      if (!contenuto) continue;
      let blob;
      if (n === 1) {
        blob = await Cripta.cifra({ nome: p.nome, ruolo: p.ruolo || '', episodio: { ...contenuto, titolo: titoli[1] } },
          p.chiave, { iter: Cripta.ITER_CHIAVE });
      } else if (passphrase[n]) {
        blob = await Cripta.cifra({ ...contenuto, titolo: titoli[n] }, Cripta.segretoEpisodio(passphrase[n], p.chiave));
      } else {
        blob = bloccoEsistente(p.slug, n);
        if (!blob) esci(`Serve la passphrase dell'episodio ${n} (--ep${n} "...") per creare la scheda di ${p.nome}.`);
      }
      episodi.push({ n, blob });
    }
    pagine.push({ p, html: pagina(p.slug, episodi) });
  }

  if (modificato) scriviJson(SORGENTE, sorgente);

  fs.mkdirSync(CARTELLA_SCHEDE, { recursive: true });
  for (const { p, html } of pagine) {
    fs.mkdirSync(path.join(CARTELLA_SCHEDE, p.slug), { recursive: true });
    fs.writeFileSync(path.join(CARTELLA_SCHEDE, p.slug, 'index.html'), html);
  }

  // Schede di personaggi tolti o rinominati: via, altrimenti resterebbero online.
  for (const d of fs.readdirSync(CARTELLA_SCHEDE)) {
    if (FORMA_SLUG.test(d) && !usati.has(d)) {
      fs.rmSync(path.join(CARTELLA_SCHEDE, d), { recursive: true });
      console.log(`- rimossa scheda orfana s/${d}/`);
    }
  }

  scriviJson(path.join(DOCS, 'data', 'cast.json'), sorgente.personaggi.map(p => ({ nome: p.nome, ruolo: p.ruolo || '' })));

  const base = typeof opz.base === 'string' ? opz.base.replace(/\/?$/, '/') : '';
  const righe = sorgente.personaggi.map(p =>
    `| ${p.nome} | \`${p.slug}\` | ${base}s/${p.slug}/#${p.chiave} |`);
  fs.writeFileSync(path.join(LOCALE, 'schede.md'),
`# Schede personali — PRIVATO, non committare

Ogni link contiene dopo il \`#\` la chiave personale del giocatore: senza quella la scheda non si apre.
Consegna ciascun link solo al suo giocatore (QR stampato, messaggio privato).
${base ? '' : '\n> Rilancia con `--base https://<utente>.github.io/<repo>/` per avere i link completi.\n'}
| Personaggio | Slug | Link |
|---|---|---|
${righe.join('\n')}
`);

  console.log(`✓ ${pagine.length} schede in docs/s/`);
  console.log('✓ docs/data/cast.json');
  console.log('✓ locale/schede.md (elenco privato dei link)');
  const riusati = numeri.filter(n => n > 1 && !passphrase[n]);
  if (riusati.length) console.log(`! Episodi ${riusati.join(', ')}: riusati i blocchi cifrati esistenti (nessuna passphrase passata).`);
}

main().catch(e => esci(e.stack || e.message));
