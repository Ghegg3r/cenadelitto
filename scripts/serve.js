#!/usr/bin/env node
/*
 * Server statico di prova per /docs (nessuna dipendenza).
 *   node scripts/serve.js            -> http://localhost:8080
 *   node scripts/serve.js 8080 lan   -> raggiungibile anche dai telefoni sulla stessa rete
 */
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const RADICE = path.join(__dirname, '..', 'docs');
const PORTA = parseInt(process.argv[2] || '8080', 10);
const HOST = process.argv[3] === 'lan' ? '0.0.0.0' : '127.0.0.1';

const TIPI = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4', '.txt': 'text/plain; charset=utf-8'
};

http.createServer((req, res) => {
  let rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.join(RADICE, rel);
  if (!file.startsWith(RADICE)) { res.writeHead(403).end(); return; }

  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain' }).end('404'); return; }
    const tipo = TIPI[path.extname(file).toLowerCase()] || 'application/octet-stream';
    const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
    if (range) {
      const inizio = range[1] ? parseInt(range[1], 10) : 0;
      const fine = range[2] ? Math.min(parseInt(range[2], 10), st.size - 1) : st.size - 1;
      res.writeHead(206, {
        'Content-Type': tipo, 'Accept-Ranges': 'bytes',
        'Content-Range': `bytes ${inizio}-${fine}/${st.size}`, 'Content-Length': fine - inizio + 1
      });
      fs.createReadStream(file, { start: inizio, end: fine }).pipe(res);
      return;
    }
    res.writeHead(200, { 'Content-Type': tipo, 'Content-Length': st.size, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  });
}).listen(PORTA, HOST, () => {
  console.log(`Sito su http://${HOST === '0.0.0.0' ? '<ip-del-portatile>' : 'localhost'}:${PORTA}/  (Ctrl+C per fermare)`);
});
