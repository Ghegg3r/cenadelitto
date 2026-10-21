#!/usr/bin/env node
/*
 * Regia della serata: gira sul portatile collegato alla TV.
 *
 *   node scripts/regia.js [porta]
 *
 * - Serve il sito da docs/ (nessuna connessione internet necessaria).
 * - Serve la console di regia (cartella regia/) al telefono dell'organizzatore.
 * - Fa da tramite: comandi telefono -> schermo, stato schermo -> telefono (Server-Sent Events).
 *
 * Sicurezza: i comandi richiedono il PIN (salvato in locale/regia.json). Lo schermo si
 * collega solo da questo stesso portatile: nessun altro può ascoltare le passphrase.
 * Le passphrase restano solo in memoria (per ripristinare gli episodi se lo schermo
 * si ricarica) e spariscono quando chiudi questo programma.
 */
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const nodeCrypto = require('node:crypto');
const { statico } = require('./serve.js');
const { DOCS, LOCALE, RADICE, leggiJson, scriviJson } = require('./comune.js');

const PORTA = parseInt(process.argv[2] || '8080', 10);
const CARTELLA_REGIA = path.join(RADICE, 'regia');
const FILE_CONFIG = path.join(LOCALE, 'regia.json');
const FILE_SCALETTA = path.join(LOCALE, 'scaletta.json');

// PIN stabile tra un avvio e l'altro, così il telefono non lo chiede ogni volta.
let config = fs.existsSync(FILE_CONFIG) ? leggiJson(FILE_CONFIG) : {};
if (!/^\d{6}$/.test(config.pin || '')) {
  config.pin = String(nodeCrypto.randomInt(0, 1000000)).padStart(6, '0');
  scriviJson(FILE_CONFIG, config);
}

const schermi = new Set();
const console_ = new Set();
const sblocchi = [];          // passphrase già usate, solo in RAM
let ultimoStato = null;

function locale(req) {
  const ip = req.socket.remoteAddress || '';
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

function pinValido(pin) {
  const a = Buffer.from(String(pin || ''));
  const b = Buffer.from(config.pin);
  return a.length === b.length && nodeCrypto.timingSafeEqual(a, b);
}

function scaletta() {
  if (!fs.existsSync(FILE_SCALETTA)) return [];
  try { return JSON.parse(fs.readFileSync(FILE_SCALETTA, 'utf8')); }
  catch (e) { console.error('! locale/scaletta.json non valido: ' + e.message); return []; }
}

function invia(clienti, dati) {
  const riga = `data: ${JSON.stringify(dati)}\n\n`;
  for (const r of clienti) r.write(riga);
}

function apriFlusso(req, res, insieme) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
  res.write('retry: 1500\n\n');
  insieme.add(res);
  req.on('close', () => { insieme.delete(res); avvisaConsole(); });
}

function avvisaConsole() {
  invia(console_, { tipo: 'stato', schermo: schermi.size > 0, stato: ultimoStato });
}

function leggiCorpo(req) {
  return new Promise((ok, ko) => {
    let s = '';
    req.on('data', c => { s += c; if (s.length > 1e6) req.destroy(); });
    req.on('end', () => { try { ok(JSON.parse(s || '{}')); } catch (e) { ko(e); } });
  });
}

function json(res, codice, dati) {
  res.writeHead(codice, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(dati));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = decodeURIComponent(url.pathname);

  if (!p.startsWith('/regia/')) { statico(DOCS, p, req, res); return; }
  const azione = p.slice('/regia/'.length);

  if (azione === 'ping') { json(res, 200, { regia: true }); return; }

  // Lo schermo: solo da questo portatile.
  if (azione === 'schermo') {
    if (!locale(req)) { res.writeHead(403).end(); return; }
    apriFlusso(req, res, schermi);
    for (const passphrase of sblocchi) res.write(`data: ${JSON.stringify({ tipo: 'sblocca', passphrase, ripristino: true })}\n\n`);
    avvisaConsole();
    return;
  }
  if (azione === 'stato' && req.method === 'POST') {
    if (!locale(req)) { res.writeHead(403).end(); return; }
    try { ultimoStato = await leggiCorpo(req); } catch (e) { json(res, 400, {}); return; }
    if (ultimoStato.esito && ultimoStato.esito.tipo === 'sblocca' && ultimoStato.esito.ok && ultimoStato.esito.passphrase) {
      if (!sblocchi.includes(ultimoStato.esito.passphrase)) sblocchi.push(ultimoStato.esito.passphrase);
    }
    if (ultimoStato.esito) delete ultimoStato.esito.passphrase;
    avvisaConsole();
    json(res, 200, {});
    return;
  }

  // La console del telefono.
  if (azione === 'console') {
    if (!pinValido(url.searchParams.get('pin'))) { res.writeHead(401).end(); return; }
    apriFlusso(req, res, console_);
    res.write(`data: ${JSON.stringify({ tipo: 'scaletta', scaletta: scaletta() })}\n\n`);
    avvisaConsole();
    return;
  }
  if (azione === 'comando' && req.method === 'POST') {
    if (!pinValido(req.headers['x-pin'])) { json(res, 401, { errore: 'PIN errato' }); return; }
    let comando;
    try { comando = await leggiCorpo(req); } catch (e) { json(res, 400, { errore: 'JSON non valido' }); return; }
    if (!schermi.size) { json(res, 409, { errore: 'Schermo non collegato' }); return; }
    invia(schermi, comando);
    json(res, 200, { ok: true });
    return;
  }

  statico(CARTELLA_REGIA, '/' + azione, req, res);
});

server.listen(PORTA, '0.0.0.0', () => {
  const indirizzi = Object.values(os.networkInterfaces()).flat()
    .filter(i => i && i.family === 'IPv4' && !i.internal).map(i => i.address);
  console.log('\n  REGIA ATTIVA\n');
  console.log(`  Schermo (su questo portatile):  http://localhost:${PORTA}/`);
  for (const ip of indirizzi) console.log(`  Console (dal telefono):         http://${ip}:${PORTA}/regia/`);
  console.log(`  PIN della console:              ${config.pin}`);
  console.log(`  Scaletta:                       ${fs.existsSync(FILE_SCALETTA) ? 'locale/scaletta.json' : 'nessuna (facoltativa)'}`);
  console.log('\n  Ctrl+C per chiudere.\n');
});

// Le connessioni aperte non devono impedire la chiusura con Ctrl+C.
setInterval(() => { invia(schermi, { tipo: 'battito' }); for (const r of console_) r.write(': battito\n\n'); }, 15000).unref();
