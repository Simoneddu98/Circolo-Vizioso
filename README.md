# Circolo Vizioso

Gioco in prima persona nel browser (three.js): una sera al circolo, tra il bancone di Nicola, la partita in TV,
i vecchi che giocano a carte, Cronico, Rafka, Kappa, Zugo e Lyuce, e i minigiochi (freccette, biliardo,
biliardino, scopa, slot). Si entra in due modi: **La serata** (la storia in cinque brani dell'EP *Circolo Vizioso*, un gioco per
brano) oppure **Gioco libero** (tutto sbloccato). Dettagli in `circolo-game/NOTES-minigames.md`.

## Pubblicare

La cartella **`sito/`** è il sito statico pronto: nessuna dipendenza e nessun comando di build.

- **Vercel**: importa il repository e basta: il `vercel.json` nella radice pubblica la cartella `sito/`
  (nessun comando di build) con le intestazioni di cache. Se in Vercel imposti *Root Directory* = `sito`, vale invece
  `sito/vercel.json`, con le stesse regole.
- **Netlify**: *Base directory* = `sito` (usa `sito/netlify.toml`), oppure trascina la cartella su
  https://app.netlify.com/drop.

Gli asset hanno la versione nell'URL (`?v=`, `sito/src/version.js`): dopo una nuova pubblicazione il browser scarica
sempre i file nuovi.

## Struttura

| Cartella | Contenuto |
| --- | --- |
| `sito/` | il sito da pubblicare (generato da `scripts/build_site.sh`) |
| `circolo-game/` | il gioco in sviluppo: `index.html`, `src/`, `assets/` compressi, `vendor/` (three.js), test dei minigiochi |
| `scripts/` | costruzione della scena in Blender (`build_circolo.py`), personaggi (`humans.py`, `meshy_chars.py`), minigiochi, compressione (`pack_assets.sh`), sito (`build_site.sh`) |
| `textures/`, `asset-props/` | texture di legno (Poly Haven, CC0) e reflex Nikon D7100 (Blend Swap #77959, CC0) |
| `circolo-blender/` | primo prototipo della scena in Blender |

Non sono nel repository (troppo pesanti): i modelli Meshy dei personaggi (`asset-meshy/`), i modelli Blender
completi (`asset-blender-completi/`), la build di Blender (`build/`) e le cartelle di consegna.

## Lavorare in locale

```bash
cd circolo-game && python3 -m http.server 8000     # poi http://localhost:8000/?debug=1
npm test                                           # logica dei minigiochi
```

Ricostruire la scena (serve Blender 5 e gli asset locali):

```bash
/Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python scripts/build_circolo.py -- --no-render
zsh scripts/pack_assets.sh      # comprime i glb in circolo-game/assets e aggiorna la versione
zsh scripts/build_site.sh       # rigenera sito/ e controlla che non manchi nessun file
```

Dettagli sui minigiochi, i personaggi e le routine in `circolo-game/NOTES-minigames.md`.
