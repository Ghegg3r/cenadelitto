# Progetto: sito per una cena con delitto

## Contesto
Sito di supporto a una cena con delitto dal vivo, 12 giocatori, sera del 30 ottobre 2026.
NON è un gioco digitale: la serata si gioca parlandosi in faccia. Il sito è un oggetto
di scena. Se una funzionalità tiene la gente col naso nello schermo, è sbagliata.

## Due superfici, ruoli che non si sovrappongono mai
1. SCHERMO CENTRALE — proiettato, visibile a tutti, pilotato da una persona sola.
   Contiene solo il MONDO OGGETTIVO: prove, orari, referti, video, foto trovate.
   Mai segreti, mai informazioni di un singolo personaggio.
2. SCHEDA PERSONALE — aperta dal telefono di ogni giocatore, un URL diverso a testa.
   Contiene solo il SEGRETO DI QUEL GIOCATORE: fascicolo, bugie, missioni.

## Vincoli tecnici
- Sito statico puro. HTML + CSS + JS vanilla. Nessun framework, nessun build step,
  nessun backend, nessun database, nessuna dipendenza npm.
- Deploy su GitHub Pages da cartella /docs.
- Deve funzionare offline dopo il primo caricamento (la casa ha wifi pessimo).
- Lo schermo centrale gira su un portatile collegato a una TV: layout pensato per
  1920x1080 visto da 3 metri. Testo grande, contrasto alto.
- Le schede personali girano su telefoni: mobile-first, leggibili a luce bassa.

## Vincolo di sicurezza (il più importante)
Un sito statico è interamente ispezionabile: chiunque può aprire i sorgenti o
indovinare un URL. Quindi:
- La soluzione del caso NON entra mai nel repository. Nemmeno commentata.
- I contenuti degli episodi successivi al primo devono essere cifrati a riposo
  (vedi Prompt 4) e sbloccabili solo con una passphrase che dà l'organizzatore la sera stessa.
  Né la passphrase né il testo in chiaro di quei contenuti vanno mai committati.
- Ogni scheda personale sta su un URL con slug casuale lungo, e non esiste nessun
  indice che elenchi le schede (niente link, niente sitemap, niente elenco in JS/JSON pubblico).

## Decisioni di architettura (già implementate)
- Tutto ciò che è privato vive in `locale/` (ignorata da git): `personaggi.json` (fonte delle
  schede: slug + segreti di tutti = l'indice vietato, quindi non può stare in docs/),
  `episodio-N.json` in chiaro, `schede.md` (elenco link), media degli episodi futuri.
- Le schede in `docs/s/<slug>/` contengono SOLO testo cifrato, nome compreso. Ep. 1 cifrato
  con la chiave personale del giocatore, che sta nel `#frammento` del link; ep. 2+ con
  passphrase dell'episodio + chiave personale. Così il repo può essere pubblico.
- Crittografia unica in `docs/assets/js/cripta.js`, usata sia dal browser sia dagli script Node.
- Offline: `docs/sw.js` stale-while-revalidate; ogni pagina mette in cache solo i propri file
  (`offline.js`), mai un elenco globale che nomini le schede.
- Script: `scripts/build-schede.js`, `scripts/cifra.js`, `scripts/serve.js`. Istruzioni nel README.

## Stile
Halloween, ma sobrio: non cartoonesco. Carta invecchiata, macchina da scrivere,
fascicolo di polizia. Palette scura, un solo accento caldo. Niente zucche animate.
