# Circolo Ricreativo Sardegna

Gioco in prima persona nel browser. Si entra in un circolo ricreativo di quartiere, si gira liberamente, ci si fa versare un bicchiere di rosso dal barista, si fuma una sigaretta presa dal pacchetto sul tavolino e ci si siede a guardare la partita. Il barista e i quattro anziani al tavolo da carte sono animati. Biliardo, biliardino e slot machine sono arredi.

È un sito statico: niente installazioni e niente passaggi di build. Tutti i percorsi sono relativi, quindi la cartella funziona anche dentro una sottocartella di qualsiasi hosting (per esempio `https://miosito.it/giochi/circolo-game/`).

## Comandi

| Tasto | Azione |
|---|---|
| W A S D oppure frecce | Muoversi |
| Mouse | Guardarsi intorno |
| Shift | Camminare più veloce |
| E | Chiedere da bere al barista, prendere il bicchiere o una sigaretta, sedersi e alzarsi |
| Clic sinistro | Con il bicchiere in mano: bere. Con la sigaretta: fare un tiro |
| Esc | Pausa: sensibilità del mouse, oscillazione della camminata, Ricomincia |

Se il browser non concede il blocco del puntatore (succede quando la pagina è dentro un iframe), il gioco passa da solo alla modalità "tieni premuto e trascina per guardarti intorno".

## Provarlo in locale

I moduli JavaScript e i file `.glb` non si caricano aprendo `index.html` con un doppio clic: serve un piccolo server locale. Dalla cartella `circolo-game`:

```bash
python3 -m http.server 8000
```

Poi apri http://localhost:8000 nel browser. In alternativa, con Node installato: `npx serve .`

Aggiungi `?debug=1` all'indirizzo (http://localhost:8000/?debug=1) per vedere i rettangoli di collisione, gli fps e la posizione del giocatore.

## Pubblicarlo

### Netlify (trascinando la cartella)
1. Vai su https://app.netlify.com/drop ed entra con il tuo account.
2. Trascina l'intera cartella `circolo-game` nella pagina.
3. Dopo qualche secondo Netlify ti dà un link pubblico da condividere. Dalle impostazioni del sito puoi cambiare il nome nel link.

### Vercel
1. Installa la riga di comando una volta sola: `npm i -g vercel` (oppure usa `npx vercel`).
2. Dalla cartella `circolo-game` esegui `vercel` e rispondi alle domande: nessun framework ("Other"), nessun comando di build, cartella di output `.`.
3. Per la versione definitiva: `vercel --prod`.

In alternativa: carica la cartella in un repository GitHub e importalo da https://vercel.com/new con le stesse impostazioni.

### GitHub Pages
1. Crea un repository e carica il contenuto di `circolo-game` (con il file `.nojekyll` incluso).
2. Nel repository: Settings → Pages → Build and deployment → Source: "Deploy from a branch", branch `main`, cartella `/ (root)`.
3. Dopo un minuto il gioco è su `https://<utente>.github.io/<repository>/`.

Se il gioco sta in una sottocartella del repository, scegli quella cartella (per esempio `/docs`) oppure apri direttamente `https://<utente>.github.io/<repository>/circolo-game/`.

## Struttura

```
circolo-game/
  index.html          pagina, stili e import map di three.js
  src/
    config.js         tutte le costanti regolabili: velocità, distanze, durate, luci, testi, battute
    main.js           caricamento, luci, stato di gioco, ciclo principale, debug
    player.js         movimento in prima persona, head bob, seduta, ondeggiamento
    collisions.js     collisioni 2D: cerchio del giocatore contro rettangoli orientati
    interactions.js   registro degli interactable + handler "pickup"
    drink.js          handler "serve_drink" (il barista versa) e "pickup_drink" (prendi il bicchiere e bevi)
    smoking.js        handler "smoke": sigaretta in mano, tiri, brace, fumo espirato
    hands.js          mani in prima persona (pose, punti di aggancio, movimenti), disegnate sopra la scena
    tv.js             partita sul maxischermo + handler "look" (sedersi)
    npc.js            personaggi: animazioni dal glb, azioni una tantum, battute per ruolo
    ui.js             interfaccia
  assets/             circolo.glb, circolo_collision.glb, hands.glb (ed eventualmente partita.mp4)
  vendor/three/       three.js 0.186.1 e gli addon usati (licenza MIT)
  vendor/fonts/       Oswald e Source Sans 3 (licenza SIL OFL)
```

## Personalizzare

- **Testi, velocità, battute degli anziani, luci**: tutto in `src/config.js`.
- **Video della partita**: copia un file `partita.mp4` in `assets/` e in `config.js` metti `tv.videoMode: 'on'`. Con `'auto'` il gioco controlla da solo se il file c'è, ma se manca il browser registra un errore 404 in console; per questo il valore predefinito è `'off'` (partita disegnata).
- **Luci**: il glb esportato da Blender ha le intensità in candele, molto alte per three.js. Si regolano con `render.lightScale` e `render.lightMultipliers`.

## Aggiungere un nuovo tipo di interazione

Ogni oggetto del glb con la custom property `interactable = "<tipo>"` viene affidato all'handler registrato con quel nome. Un nuovo modulo si aggiunge senza modificare il resto del codice, per esempio un futuro `src/pool.js` caricato da `index.html`:

```js
// src/pool.js
const handler = {
  range: 2.5,
  label: () => 'Gioca a biliardo',
  action(target, ctx) { /* avvia la partita */ },
  primary(ctx) { return false; },     // clic sinistro; true se l'evento è usato
  update(dt, ctx, targets) {},
  reset(target, ctx) {},
};
const wait = setInterval(() => {
  if (window.circolo?.register) { window.circolo.register('pool', handler); clearInterval(wait); }
}, 100);
```

Se il glb viene caricato prima della registrazione, gli oggetti in attesa vengono consegnati all'handler appena si registra.

## Progressione

Le attività si sbloccano una alla volta: prima ci si siede a guardare la partita, poi si fuma una sigaretta, poi ci si fa versare da bere; a quel punto si sbloccano tutti i giochi insieme. L'ordine e i passi sono in `CONFIG.progression` (`steps` in ordine, `requires` dice quale passo serve a ogni tipo di interazione): per aggiungere un passo o cambiare l'ordine basta modificare la lista. Un oggetto non ancora sbloccato mostra cosa fare prima. La progressione è salvata nel browser; "Ricomincia" la azzera. In debug: `circolo.unlockAll()`.

## Minigiochi

Si avvicina l'oggetto e si preme E: parte una transizione verso la vista del gioco, l'avversario si sposta al suo posto e al termine tutto torna com'era.

| Gioco | Dove | Avversario |
|---|---|---|
| Freccette (301, Giro dell'orologio) | bersaglio sul muro nord | Gavino |
| Scopa | tavolo da carte | Peppino |
| Biliardo (palla 8, pratica) | tavolo da biliardo | Tonino |
| Biliardino | calcio balilla (in esplorazione ci giocano Bachisio e Salvatore) | Nicola |
| Slot machine (gettoni finti) | le due slot | — |

- Codice in `src/minigames/`: `manager.js` (stati, dissolvenze, Esc con conferma, H per le regole, statistiche in localStorage), `util.js`, e una cartella per gioco con la logica pura (`rules.js`, `physics.js`, `ai.js`) separata dalla vista (`view.js`).
- Test della logica: `npm test` (oppure `node --test tests/*.test.mjs`), serve solo Node. Il file `package.json` esiste solo per questo; il gioco resta un sito statico.
- Testi, regole, battute e parametri (difficoltà, potenze, gol, gettoni) in `CONFIG.minigames` di `src/config.js`.
- Stato del lavoro, verifiche e semplificazioni: `NOTES-minigames.md`.

## Personaggi e animazioni

Anziani e barista partono dal corpo maschile realistico del bundle **Human Base Meshes** di Blender Studio (licenza CC0). Lo script `scripts/humans.py` li veste (cardigan, camicia, coppola, baffi; grembiule e barba per il barista), costruisce lo scheletro con pesi automatici e crea le animazioni che finiscono nel glb:

- `NPC_Elder_01_Idle` … `NPC_Elder_04_Idle`: seduti, respirano, guardano le carte, giocano una carta (8 secondi in loop, ognuno parte da un punto diverso);
- `NPC_Barista_Idle`: in piedi dietro il bancone;
- `NPC_Barista_Pour`: prende la bottiglia, versa il vino nel bicchiere, la rimette giù (6,25 s). I tempi (comparsa della bottiglia, inizio e fine del riempimento) sono custom property del nodo `NPC_Barista`, quindi il gioco resta sincronizzato se l'animazione cambia.

Ogni personaggio indica la sua clip con la custom property `idle_clip`; `npc.js` crea un mixer per personaggio. Le battute dipendono dal ruolo (`npc_action`): gli anziani usano `CONFIG.npc`, il barista `CONFIG.npcActions.serve`.

## Scheletri (Rigify)

I personaggi sono rigati con **Rigify** (add-on incluso in Blender): `scripts/humans.py` adatta il metarig umano alle articolazioni del corpo del bundle, comprese le dita di entrambe le mani, genera il rig e applica i pesi automatici. Le pose e le animazioni si danno ai controlli FK; nel glb finiscono solo le ossa di deformazione (`DEF-*`). Per tornare al vecchio scheletro semplice: `USE_RIGIFY = False` in `humans.py`.

## Mani in prima persona

`assets/hands.glb` viene da `scripts/build_hands.py`: mano destra realistica del bundle Human Base Meshes, con un tratto di avambraccio e la manica, in tre pose (`Hand_Relaxed`, `Hand_Glass`, `Hand_Cigarette`) e due punti di aggancio (`Socket_Glass`, `Socket_Cigarette`). Le mani stanno in una scena a parte disegnata dopo quella del circolo con il depth buffer pulito, quindi non entrano mai nel bancone o nei muri. Posizioni e rotazioni (a riposo, verso la bocca) sono in `CONFIG.hands`.

## Rigenerare gli asset e comprimerli

Da `circolo-sardegna-assets/` (servono Blender 5.x e Node):

```bash
/Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python scripts/build_circolo.py
/Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python scripts/build_hands.py
npx @gltf-transform/cli@4 resize build/circolo.glb /tmp/c1.glb --width 1024 --height 1024
npx @gltf-transform/cli@4 webp /tmp/c1.glb /tmp/c2.glb --quality 85
npx @gltf-transform/cli@4 meshopt /tmp/c2.glb circolo-game/assets/circolo.glb
npx @gltf-transform/cli@4 meshopt build/hands.glb circolo-game/assets/hands.glb
cp build/circolo_collision.glb circolo-game/assets/
```

Il glb esce da Blender a circa 33 MB e arriva a circa 4 MB. Non usare `gltf-transform optimize`: unisce e rinomina i nodi, e il gioco li cerca per nome (interactable, personaggi, collisioni). Nota: la quantizzazione di meshopt scrive una scala sui nodi delle mesh; per questo il vino cresce da un perno creato a runtime invece di scalare `Glass_Liquid` direttamente.

## Crediti

Il testo dei crediti è in `CONFIG.ui.credits` e compare nella schermata iniziale.

- "LED TV" di ragstorich (Richard Edwards), CC-BY 3.0
- "Cigarette with Smoke", Blend Swap #80373, CC-BY 3.0
- "Drink Bar assets v.5" di b2przemo, CC-BY 3.0 (marchi di birra rimossi)
- "Dart board with darts" di olesk, CC0
- Personaggi e mani: Human Base Meshes di Blender Studio, CC0
- Texture legno: Poly Haven, CC0
