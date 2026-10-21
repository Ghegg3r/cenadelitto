# Cena con delitto — oggetto di scena

Sito statico (HTML + CSS + JS vanilla, nessuna dipendenza) per una cena con delitto dal vivo.
Due superfici che non si sovrappongono mai:

- **Schermo centrale** (`docs/index.html`): proiettato sulla TV, pilotato da una persona sola.
  Solo il mondo oggettivo: prove, timeline, video, ora della morte, telefono della vittima.
- **Schede personali** (`docs/s/<slug>/`): una per giocatore, sul suo telefono.
  Solo il segreto di quel giocatore.

Il contesto completo del progetto è in [CLAUDE.md](CLAUDE.md).

## Struttura

```
docs/                       -> pubblicato su GitHub Pages
  index.html                schermo centrale
  s/<slug>/index.html       schede personali (generate, contengono solo testo cifrato)
  assets/css, js, img, media
  data/                     contenuti dell'episodio 1 in chiaro + episodi successivi cifrati
  sw.js                     service worker (offline)
scripts/
  build-schede.js           genera le schede da locale/personaggi.json
  cifra.js                  cifra un episodio per lo schermo centrale
  serve.js                  server di prova locale
locale/                     PRIVATO, ignorato da git: soluzione, episodi in chiaro, elenco link
```

Serve Node 20 o più recente (solo per gli script; il sito non ne ha bisogno).

## Provare in locale

```bash
node scripts/serve.js
```

Poi apri http://localhost:8080/. Il sito non funziona aprendo il file con doppio clic (`file://`).

I telefoni non possono provare le schede via `http://<ip-del-portatile>`: la decifratura
richiede una connessione sicura (https o localhost). Per provarle su un telefono usa il sito
pubblicato su GitHub Pages.

## Schermo centrale: tasti

| Tasto | Azione |
|---|---|
| `1`–`5` | Bacheca · Timeline · Media · Orologio · Archivio |
| `S` | Sblocca l'episodio successivo (chiede la passphrase, mai salvata) |
| `F` | Schermo intero |
| Frecce, `Invio`, `Esc` | Scegli, apri, chiudi (prove, media, galleria) |

**Timeline**: clic su una cella (o frecce + `Invio`), scrivi la stanza, `Invio` salva e scende,
`Tab` salva e passa alla fascia dopo, `Esc` annulla, `Canc` svuota la cella.
`Ctrl+Maiusc+Backspace` azzera tutta la timeline (con conferma): fallo dopo le prove generali.
Le stanze si riconoscono anche scritte in modo diverso ("nella biblioteca", "libreria"):
nomi e sinonimi sono in `docs/data/luoghi.json`. `?`, `boh`, `non so` non contano.

**Media**: frecce su/giù per scegliere, `Invio` lo porta a schermo pieno fermo, `Spazio`
play/pausa, frecce sinistra/destra ±5 s, `R` ricomincia, `Esc` torna all'elenco.

**Archivio**: si usa col mouse. `C`/`G`/`N` per Chat, Galleria, Note; `Esc` torna indietro.

Cursore e legenda dei tasti spariscono da soli dopo qualche secondo di inattività.

Gli episodi sbloccati vivono solo in memoria: se ricarichi la pagina dello schermo centrale,
ripremi `S` e reinserisci le passphrase. La timeline invece resta salvata nel browser.

## Contenuti

| File | Cosa | Pubblico? |
|---|---|---|
| `docs/data/config.json` | luogo, data, ora della morte, fasce orarie, elenco episodi | sì |
| `docs/data/luoghi.json` | stanze e sinonimi per la timeline | sì |
| `docs/data/prove.json` | prove dell'episodio 1 | sì |
| `docs/data/media.json` | video/audio dell'episodio 1 | sì |
| `docs/data/archivio.json` | telefono della vittima, episodio 1 | sì |
| `docs/data/cast.json` | nomi e ruoli (generato da `build-schede.js`) | sì |
| `locale/personaggi.json` | schede personali, tutti gli episodi | **no** |
| `locale/episodio-2.json`, `episodio-3.json` | contenuti futuri dello schermo centrale | **no** |

Ogni prova, media, chat, messaggio, foto e nota ha un campo `"episodio"`: compare solo quando
quell'episodio è sbloccato. Nell'archivio, `"schede": {"chat": 1, "galleria": 2, "note": 3}`
decide quando si accende ciascuna scheda del telefono. Nelle chat: `non_letti` (gli ultimi N
messaggi ricevuti), `bozza` (testo rimasto nel campo di scrittura), `{"giorno": "Oggi"}` come
separatore, `"stato": "letto"` per le spunte, `"gruppo": true` per le chat di gruppo.

## Rigenerare le schede dopo una modifica

1. Modifica `locale/personaggi.json`. Ogni personaggio ha `nome`, `ruolo` e, per ogni episodio,
   `pubblico` (letto ad alta voce, ~30 secondi), `segreto`, `bugia_obbligatoria`, `missioni[]`.
   `slug` e `chiave` si creano da soli al primo giro: **non toccarli dopo aver consegnato i link**.
2. Lancia:

   ```bash
   node scripts/build-schede.js --ep2 "passphrase episodio 2" --ep3 "passphrase episodio 3" --base https://<utente>.github.io/<repo>/
   ```

   - Se ometti `--ep2`/`--ep3`, i blocchi già cifrati di quegli episodi vengono riusati così
     come sono: va bene per correggere l'episodio 1, non se hai cambiato i testi successivi.
   - Se una passphrase non apre l'episodio già cifrato dello schermo centrale, lo script si
     ferma senza toccare niente (protezione dai refusi).
   - In alternativa agli argomenti, puoi usare le variabili d'ambiente `CENA_EP2`, `CENA_EP3`,
     così le passphrase non restano nella cronologia del terminale.
3. Lo script scrive `docs/s/<slug>/index.html`, aggiorna `docs/data/cast.json` e rigenera
   l'**elenco privato dei link** in `locale/schede.md` (nome → slug → link completo).
   Quell'elenco non va mai committato: `locale/` è in `.gitignore`.

Il link di ogni giocatore è `…/s/<slug>/#<chiave>`. La parte dopo `#` è la chiave che apre
la scheda: non arriva mai al server e non sta nel repository. Consegnala solo al suo
giocatore (messaggio privato o QR stampato). Dopo la prima apertura il telefono la ricorda.

## Cifrare un episodio (schermo centrale)

1. Scrivi i contenuti in `locale/episodio-2.json`:

   ```json
   { "titolo": "…", "prove": [], "media": [], "archivio": { "chat": [], "galleria": [], "note": [] } }
   ```

   Immagini, audio e video degli episodi futuri non vanno in `docs/`: mettili in `locale/` e
   nel JSON scrivi `"@file:img/foto.jpg"` (percorso relativo al JSON). Il file viene
   incorporato dentro il pacchetto cifrato.
2. Lancia:

   ```bash
   node scripts/cifra.js locale/episodio-2.json "passphrase episodio 2"
   ```

   Esce `docs/data/episodio-2.enc.json` (AES-GCM 256, chiave da PBKDF2-SHA256 con 300.000
   iterazioni), già verificato con una decifratura di prova.
3. Rigenera le schede con la **stessa** passphrase (vedi sopra): una passphrase per episodio,
   uguale per schermo e telefoni.

Maiuscole e spazi nella passphrase non contano. Scegli 3-4 parole a caso: il file cifrato è
pubblico e chiunque può provare a indovinarla senza limiti.

## Deploy su GitHub Pages

1. Crea un repository su GitHub e fai il push di questa cartella (il `.gitignore` tiene fuori `locale/`).
   Controlla prima con `git status --ignored` che `locale/` compaia tra gli ignorati.
2. Su GitHub: **Settings → Pages → Build and deployment → Deploy from a branch**,
   branch `main`, cartella **`/docs`**. Dopo un minuto il sito è su `https://<utente>.github.io/<repo>/`.
3. Rilancia `build-schede.js` con `--base https://<utente>.github.io/<repo>/` per avere i link
   completi in `locale/schede.md`.

Note:
- `docs/.nojekyll` disattiva Jekyll, che altrimenti potrebbe ignorare alcuni file.
- Il repository può essere pubblico: le cartelle `docs/s/<slug>/` sono visibili, ma contengono
  solo testo cifrato, senza nomi. Ciò che resta in chiaro è solo l'episodio 1 dello schermo
  centrale, che è comunque il mondo oggettivo.
- Ogni pagina ha `<meta name="robots" content="noindex,nofollow">`. Il `robots.txt` in
  `docs/` vale solo se il sito sta alla radice del dominio: su `utente.github.io/repo/` i
  motori leggono quello di `utente.github.io`, quindi la protezione vera è il meta tag.

## Offline

Dopo il primo caricamento con la rete, tutto funziona senza wifi (service worker in `docs/sw.js`).

- **Schermo centrale**: al primo avvio scarica tutto ciò che gli serve, video ed episodi cifrati compresi.
- **Schede**: ogni telefono scarica solo la propria scheda, mai le altre.
- Il sito risponde subito dalla cache e si aggiorna in background quando la rete c'è: dopo una
  modifica pubblicata, ricarica **due volte** per vedere la versione nuova.
- Se sostituisci un video, dagli un nome di file nuovo: i file media in cache non vengono riscaricati.

## Prima della serata

- [ ] Prova lo schermo sulla TV, a 3 metri, con le luci della serata. Soprattutto la timeline.
- [ ] Sul portatile della TV: apri il sito con la rete, passa per tutte e 5 le viste e lancia
      ogni media una volta. Poi stacca il wifi e ricarica: deve funzionare tutto.
- [ ] Azzera la timeline (`Ctrl+Maiusc+Backspace`) dopo le prove.
- [ ] Ogni giocatore apre il suo link almeno una volta con la rete, prima di cena.
- [ ] Sostituisci i contenuti e le passphrase di esempio con quelli veri, poi rigenera e ripubblica.
- [ ] Piano B: fascicoli stampati su carta.
