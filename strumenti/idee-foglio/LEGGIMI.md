# Le idee della scatola nera in un foglio Google

Nel capitolo 3 della storia chi gioca scrive le sue idee nella scatola nera. Con questo script le idee di tutti
finiscono in un foglio Google sul tuo Drive (gratis), e ogni giocatore legge quelle degli altri.

Ci vogliono 5 minuti, una volta sola.

## 1. Crea lo script

1. Vai su <https://script.google.com> con il tuo account Google e premi **Nuovo progetto**.
2. Cancella il codice che c'è e incolla tutto il contenuto di `Codice.gs` (questa cartella).
3. In alto rinomina il progetto, per esempio **Circolo Vizioso idee**, e salva (icona del dischetto).

## 2. Crea il foglio e dai i permessi

1. Nella barra in alto scegli la funzione **prepara** e premi **Esegui**.
2. Google chiede l'autorizzazione: **Esamina autorizzazioni** → scegli il tuo account →
   **Avanzate** → **Vai a Circolo Vizioso idee (non sicuro)** → **Consenti**.
   (È "non sicuro" solo perché lo script l'hai scritto tu e non è verificato da Google.)
3. Nel **Registro di esecuzione** compare il link al foglio appena creato:
   *Circolo Vizioso — idee della scatola nera*, con le colonne `data | domanda | testo | visibile`.

## 3. Pubblicalo come app web

1. In alto a destra: **Esegui il deployment** → **Nuovo deployment**.
2. Icona dell'ingranaggio → **App web**.
3. **Esegui come: Me** e **Chi ha accesso: Chiunque**.
4. **Esegui il deployment** e copia l'**URL dell'app web** (finisce con `/exec`).

## 4. Collegalo al gioco

In `circolo-game/src/storia/contenuti.js`, sotto `blackbox`:

```js
archivio: { tipo: 'foglio', url: 'https://script.google.com/macros/s/…/exec' },
```

poi `zsh scripts/build_site.sh` e pubblica. (Oppure manda l'URL a Claude.)

## Controllare le idee

- Apri il foglio: ogni riga è un'idea, con data e domanda.
- **Per nascondere un'idea** metti `FALSO` nella colonna *visibile* (o cancella la riga): sparisce dal gioco subito.
- **Per approvare le idee prima che si vedano**: in `Codice.gs` metti `const APPROVAZIONE = true;` e poi
  **Gestisci deployment** → matita → **Versione: nuova** → **Esegui il deployment**. Le nuove idee arrivano con
  *visibile* = `FALSO` e compaiono nel gioco quando scrivi `VERO`.
- Lo script toglie i link, taglia a 160 caratteri e neutralizza i testi che il foglio leggerebbe come formule.
- Ogni volta che cambi `Codice.gs` serve una nuova versione del deployment (come sopra); l'URL resta lo stesso.
