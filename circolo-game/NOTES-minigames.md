# Minigiochi — stato del lavoro

Aggiornato: 26 settembre 2026. Per riprendere: leggi questo file, poi `src/minigames/manager.js` e `src/minigames/darts/`.

## Checklist

### Fase 0 — stato del progetto
- [x] Gioco three.js statico (`circolo-game/`), scena generata da `scripts/build_circolo.py` (Blender 5.2 headless; l'MCP di Blender non era collegato).
- [x] Registro delle interazioni (`interactions.register(type, handler)`), NPC animati, mani in prima persona, debug API (`?debug=1`).
- [x] Biliardo e biliardino dei modelli 07/09 erano già a parti separate (non fusi): palle, triangolo e stecca rimossi; aste, manopole e omini esclusi e ricostruiti.
- [x] Il vecchio bersaglio (olesk, CC0) è stato sostituito da un bersaglio regolamentare geometrico nella stessa posizione (muro nord, x 2.8).

### Fase 1 — Blender (`scripts/minigames_prep.py`, chiamato da `build_circolo.py`)
- [x] Biliardo: `POOL_Surface` (raycast: panno a 0.80 m, campo 2.17 × 1.05 m), `POOL_Pocket_1…6` (radius 0.060/0.065), `POOL_HeadSpot`, `POOL_FootSpot`, `CAM_Pool_Top`, `CAM_Pool_Spectate`, `POOL_OpponentSpot` (Tonino).
- [x] Biliardino: 8 aste `FOOSBALL_Rod_<A|B>_<GK|DEF|MID|ATT>` con omini (1-2-5-3 per squadra, ordine italiano), extras `travel`, `figures`, `figure_offsets`, `leg`, `axis_gltf`; `FOOSBALL_Field` (1.16 × 0.70), `FOOSBALL_Goal_A/B` (width 0.20: il modello non ha l'apertura della porta, valore standard), `CAM_Foosball_Player`, `CAM_Foosball_Top`, `FOOSBALL_OpponentSpot` (Nicola).
- [x] Freccette: bersaglio regolamentare (451 mm, centro a 1.73 m, 20 settori, fili, numeri), cabinet in noce con ante aperte e lavagnette, `DARTS_Board` (Z uscente, Y verso il 20; extras con i raggi e l'ordine), `DARTS_ThrowLine` a 2.37 m + striscia `Darts_Oche`, `DARTS_Dart_1…3` (start_hidden), `CAM_Darts_Throw`, `DARTS_OpponentSpot` (Gavino). Corridoio di tiro libero da collider (controllo nel report).
- [x] Scopa: `SCOPA_Table`, `SCOPA_Seat_Player/Opponent`, `CAM_Scopa_Seat`, `SCOPA_Deck`, `SCOPA_Pile_Player/Opponent`, `SCOPA_Hand_Opponent`, `SCOPA_TableArea` (size), `SCOPA_Spectator_1` (Efisio). Le carte decorative del tavolo sono l'oggetto `Card_Table_Cards` (hide_during = scopa).
- [x] NPC: `npc_name` Efisio, Tonino, Peppino, Gavino (sedie 1-4) e Nicola (barista); clip `NPC_Elder_XX_Stand` + `stand_lift` per gli anziani che si alzano.
- [x] Dita della mano destra per barista e anziani (ossa dai face set del bundle): il barista stringe la bottiglia, gli anziani tengono le carte tra pollice e indice; ricerca automatica della presa senza compenetrazioni (valori nel report).
- [x] Rese QA dai marcatori: `build/qa_mg_*.png`.

### Architettura
- [x] `src/minigames/manager.js`: stati ESPLORAZIONE → INGRESSO → GIOCO → RISULTATO → USCITA, dissolvenza 0.8 s, pointer lock, Esc con conferma, H regole, rivincita, ritorno nel punto di partenza, avversario spostato e riportato, statistiche in localStorage (try/catch).
- [x] `src/minigames/util.js`: marcatori camera (correzione degli assi glTF), piani di gioco robusti alla compressione meshopt, suoni Web Audio, statistiche.
- [x] `package.json` (`"type": "module"`) solo per `npm test` / `node --test tests/*.test.mjs`.

### Giochi (tutti giocabili e provati nel browser, 35/35 test con `npm test`)
- [x] **Freccette** — `rules.js`, `view.js`: 301 contro Gavino e Giro dell'orologio; mira con oscillazione, respiro trattenuto, potenza con zona ideale, volo balistico, freccetta in mano durante la mira. Test 8.
- [x] **Scopa** — `rules.js`, `ai.js`, `cards.js` (carte napoletane originali su canvas), `view.js`: contro Peppino (normale o facile), ventaglio in mano, scelta della presa, animazioni, carta di traverso per la scopa, tabella di fine smazzata, commenti degli altri anziani; Efisio si alza e guarda. Test 10 (1000 partite simulate).
- [x] **Biliardo** — `physics.js`, `rules.js`, `ai.js`, `view.js`: palla 8 contro Tonino e pratica; stecca, linea tratteggiata e ghost ball, bianca in mano, vista T dall'alto (lampada nascosta), suoni. Test 7 (2000 tiri alla massima potenza).
- [x] **Biliardino** — `physics.js`, `ai.js`, `view.js`: contro Nicola a 5 gol; asta attiva automatica (quella che raggiunge la palla, dal lato della propria porta) con luce sull'impugnatura, rotella/1-4, tiro caricato, omini alzati col destro, vista C. Test 6 (2000 tiri a 8 m/s).
- [x] **Slot machine** (aggiunta su richiesta) — `rules.js`, `view.js`: gettoni finti, tre rulli su una texture canvas posata sulla finestra dei rulli del modello (marcatore `SLOTS_Reels_N`), puntata 1-3, incasso con Invio, record = massimo di gettoni. Ritorno teorico ~92%. Test 4.

## Feedback del 27 settembre 2026 (seconda tornata)
- [x] Biliardino: tolta la pallina statica del modello (`Pallina`); spinta anti-stallo dopo 1,2 s di palla quasi ferma (verso il centro e l'asta più vicina) + rimessa dopo 4 s; asta attiva = quella che raggiunge davvero la palla.
- [x] Biliardino giocato dagli NPC: Bachisio (rossi) e Salvatore (blu) ai lati lunghi; partita dimostrativa con fisica e IA (`foosball/demo.js`), braccia portate sulle impugnature con IK a due ossa dopo l'animazione (sinistra su portiere/difesa, destra su centrocampo/attacco). Quando giochi tu si spostano di 45 cm e guardano (`FOOSBALL_Spectator_1/2`). Perni e palla condivisi in `foosball/rig.js`.
- [x] Scopa: mano delle carte alzata a petto con il palmo verso il viso, dita unite (chiusura della divaricazione del modello), pollice che preme, ventaglio che sporge sopra le dita.
- [x] Biliardo: stecca a 6 cm dalla bianca mentre si mira, arretra fino a 26 cm caricando, colpo animato con velocità proporzionale alla forza; la bianca parte al contatto.
- [x] Barista: posa intermedia "ritira la mano sopra il bancone" prima di scendere e dopo la versata; controllo automatico su tutti i fotogrammi: 0 vertici di mano/avambraccio dentro il bancone.
- [x] Slot: la mano in prima persona (nuova posa `Hand_Point`, polpastrello `Socket_Fingertip`) preme i pulsanti veri del modello (verde gira, giallo puntata, rosso incassa) e infila i gettoni nella gettoniera; 50 gettoni in tasca, crediti nella macchina, incasso nella vaschetta.
- [x] Slot: la placca fotografica dei gettoni (un quad con la foto di una gettoniera) è sostituita da una gettoniera modellata (placca cromata, feritoia, targhetta).
- [x] Progressione: `CONFIG.progression` (passi in ordine + interazioni che richiedono un passo). Ora: partita → sigaretta → bicchiere → tutti i giochi. Le interazioni bloccate mostrano cosa fare prima; gli obiettivi successivi compaiono solo quando si sbloccano; salvataggio in localStorage; `circolo.unlockAll()` in debug.

## Mani con Rigify (27 settembre 2026)
- [x] Tutti i personaggi (quattro anziani, barista, due giocatori del biliardino) usano un rig **Rigify** generato in `humans._rig_rigify`: metarig umano adattato alle articolazioni misurate sul corpo (colonna, braccia, gambe e le quattro articolazioni di ogni dito di **entrambe** le mani; le dita sinistre trovate specchiando i face set destri), rig generato, pesi automatici sulle ossa DEF (0 vertici senza peso). Le pose usano i controlli FK (IK_FK = 1) tramite una mappa di nomi logici (`RIGIFY_CTRL`), quindi il codice delle pose è rimasto quello.
- [x] Nel glb vanno solo le 69 ossa di deformazione per personaggio (`export_def_bones`); il gestore glTF campiona le animazioni dei controlli.
- [x] Barista: presa per dito — la bottiglia si appoggia al palmo, poi ogni dito si chiude finché tocca il vetro senza attraversarlo (indice e medio 70%, anulare e mignolo 100%).
- [x] Anziani: mano sinistra rilassata sul tavolo (prima era un blocco rigido); mano delle carte con deformazione morbida alle nocche.
- [x] Giocatori del biliardino: pugni chiusi sulle impugnature, IK a runtime sulle ossa DEF (lunghezze e assi misurati sul rig).
- [x] Mani in prima persona (`build_hands.py`): corpo intero rigato con Rigify, dita in posa, mesh cotta e ritagliata a mano + avambraccio; stessi socket di prima.
- [x] Scopa: durante la partita Peppino non tiene più il ventaglio (le sue carte sono quelle sul tavolo).
- Nota Blender 5: `mesh.materials.clear()` azzera gli indici materiale delle facce: assegnare gli slot prima della geometria.

## Giocatori del biliardino solo durante il minigioco (27 settembre 2026)
- [x] Bachisio e Salvatore non ci sono in esplorazione (`CONFIG.npc.hiddenUntilMinigame`), il loro collider è ignorato (`collisions.ignorePattern`) e il tavolo resta fermo senza palla. Quando parte il biliardino compaiono in piedi in fondo al tavolo, ai lati di Nicola (`FOOSBALL_Spectator_1/2`), e spariscono all'uscita.
- La partita dimostrativa con le mani sulle impugnature resta disponibile con `CONFIG.minigames.games.foosball.demoInExploration = true`, ma la presa non è ancora precisa: l'IK porta il polso all'altezza giusta senza controllare la rotazione della mano attorno all'avambraccio, quindi il foro del pugno non è centrato sull'impugnatura.

## Cronico, il padrone di casa (27 settembre 2026)
- [x] Modello Meshy con texture (`asset-meshy/cronico_full`), importato da `scripts/meshy_chars.py`: riduzione a ~16k facce con UV, altezza 1,80 m, articolazioni misurate sulla geometria (sezioni in A-pose, braccio lungo la linea spalla -> punta delle dita, dita lungo la mano), rig Rigify (`humans.rig_from_joints`), 0 vertici senza peso. Clip `NPC_Cronico_Idle` e `NPC_Cronico_Talk`.
- [x] In scena accanto alla porta, rivolto all'ingresso (`npc_action: host`, `interactable: talk`).
- [x] Dialoghi a scelta (`src/dialogue.js`, testi in `CONFIG.dialogues`): benvenuto con tre risposte, giro del circolo (Nicola, gli anziani, come funziona la serata, i giochi, la storia del circolo), promemoria dei passi finché i giochi sono bloccati, sfida quando si sbloccano. Tasti 1-9 o clic, Esc per chiudere; mentre parla Cronico usa la clip Talk.
- [x] Sfide: `challenge:darts` / `challenge:pool` avviano il minigioco con Cronico al posto dell'avversario abituale (`opts.opponent`), con battute proprie (`CONFIG.minigames.opponents.Cronico`); a fine partita torna all'ingresso.
- [x] Cronico con rig e animazioni di Meshy (pacchetto "Rigged biped", `asset-meshy/cronico_rig`): scheletro Mixamo a 23 ossa, 7 clip (`NPC_Cronico_Idle/Walk/Run/Talk/Agree/ThumbUp/Gesture`), camminata sul posto; radice a scala 1 sopra l'armatura in centimetri (`meshy_chars.build_cronico_meshy`). Senza quel pacchetto la build usa il modello con texture rigato con Rigify.
- [x] Routine (`src/routine.js`, passi in `CONFIG.routines.cronico`): dopo il primo dialogo va al bancone e ordina a Nicola (che risponde), guarda la partita ed esulta, scherza con Peppino al tavolo da carte, torna all'ingresso, e ricomincia. Percorso lungo i marcatori `CRONICO_Spot_*` / `CRONICO_Way_*` del glb, verificato senza attraversare arredi. Si ferma e si gira verso il giocatore quando ci si parla; durante una sfida la routine aspetta.
- [ ] Cronico non ha collider (si muove): il giocatore gli passa attraverso.
- [ ] In attesa degli export con texture di Silver Sentinel (anziani) e Barista (Nicola).

## Verifiche fatte nel browser (27 settembre 2026)
Per ogni gioco: E all'oggetto, schermata iniziale, partita completa fino al risultato, Rivincita, Esc con conferma, Esci, ritorno esatto al punto di partenza, avversario riportato al suo posto con l'animazione originale, movimento e interazioni funzionanti dopo l'uscita. Zero errori e zero warning in console. Fps 56-60 durante biliardo e biliardino.

## Semplificazioni rispetto al prompt
- Biliardino: la rimessa scatta dopo 4 s di palla ferma anche quando in teoria un piede potrebbe raggiungerla (con il controllo solo geometrico la palla restava bloccata tra due aste per sempre).
- Biliardo: le sponde si interrompono alle ganasce delle buche; una palla che supera la linea dei centri delle buche è imbucata (nessuna palla può uscire dal tavolo).
- Scopa: se solo un giocatore ha tutti e quattro i semi, la primiera è sua.
- Barista: le dita stringono la bottiglia solo in parte (la posa della versata ha il palmo quasi verso il basso).

## Miglioramenti consigliati
1. Posa di presa vera per il barista (palmo verso la bottiglia) ora che le dita esistono.
2. Sostituire la compressione meshopt con Draco (o escludere i pezzi dei minigiochi) per non dover aggirare lo spostamento delle origini.
3. Effetti (rotazione) nel biliardo e passaggi tra aste dell'IA del biliardino.

Per i test nel browser con la scheda in background usare `circolo.advance(sec)` (passo fisso, disegna un frame);
dopo una modifica ai moduli forzare il ricaricamento (`fetch(file, {cache: 'reload'})` e poi `location.reload()`).

## Note tecniche importanti
- **Compressione meshopt**: la quantizzazione scrive scala e traslazione sui nodi che contengono una mesh (o sposta la mesh in un nodo figlio). Mai usare la posizione/scala di un nodo mesh come dato: per i piani usare il bounding box + extras `size`; per le aste del biliardino `axis_gltf`; per le freccette la punta dal bounding box della geometria (vedi `darts/view.js::_dartTemplate`).
- **Assi**: un empty "camera" Blender (sguardo -Z, alto +Y) in three.js guarda lungo -Y locale con l'alto su -Z: `markerCamera()` applica la rotazione X -90°. Il bersaglio in coordinate locali three.js: x = destra, -z = verso il 20, +y = uscente.
- I minigiochi da aggiungere vanno importati in `main.js` (c'è il commento al posto degli import).

## Accoglienza iniziale (Cronico)

- Cronico parte a ~2,2 m davanti allo spawn (`SPAWN_XY` in `build_circolo.py`), girato verso l'ingresso.
- Con "Entra nel circolo" la visuale si gira verso di lui e dopo `CONFIG.intro.delay` secondi si apre da solo il dialogo `benvenuto`, senza pointer lock: il cursore serve per le risposte.
- Il nodo `guida` spiega i comandi minimi: WASD, Shift, mouse, E o clic, numeri nei dialoghi, Esc.
- La routine (`startAfter: 'benvenuto'`) parte quando il dialogo si chiude.
- La clip Idle di Meshy è corretta in build (`meshy_chars.IDLE_FIX`): spalle più basse e mani ai lati delle cosce, non dietro.

## Anziani Meshy (Elderly Man)

- Un solo modello (`asset-meshy/elder_rig`, Rigged biped Meshy) per i sei anziani: Efisio, Tonino, Peppino e Gavino al tavolo da carte, Bachisio e Salvatore in giro. Stessa mesh e texture; altezze leggermente diverse (`ELDER_CAST` in `build_circolo.py`).
- Clip `NPC_Elder_Sit`, `NPC_Elder_Walk` (Meshy), `NPC_Elder_Stand` e `NPC_Elder_Talk` (ricavate in `meshy_chars.build_elders_meshy`).
  - La clip seduta è centrata sulla sedia.
  - Ha le cosce più strette e più basse (`SIT_FIX`): i piedi toccano terra e non quelli dei vicini.
  - Ha il movimento attenuato (`SIT_DAMP`): l'originale scivola in avanti ed entrerebbe nel tavolo.
- Le clip sono esportate una sola volta (sul primo anziano). `npc.js` le riaggancia alle ossa di ciascun personaggio per nome (i nomi dei nodi glTF hanno il suffisso `_N`).
- Routine (`CONFIG.routines`):
  - `efisio` e `tonino`: si alzano (`rise`), girano tra bancone, TV, biliardo, biliardino e freccette, poi tornano a sedersi (`sit`).
  - `bachisio` e `salvatore`: girano per il circolo e ora sono sempre visibili.
  - Punti e passaggi: `ELDER_Spot_*` e `ELDER_Way_*`.
- La camminata è rallentata alla velocità della routine (`walk_speed` misurata sulla clip).
- Gli asset esterni vengono cercati in Download oppure, se non ci sono, in `consegna/sviluppatore-circolo/asset-esterni/`.
- Il controllo `intersections` resta `false` per due contatti della posa seduta: il sedere sul sedile e le cosce che sfiorano la fascia sotto il piano del tavolo (nascoste).

## Bancone, soldi, Rafka, schermata iniziale

- **Nicola** (Meshy "Barista", `meshy_chars.build_meshy_char`): clip Idle (ricavata, braccia lungo i fianchi con `BARISTA_FIX`), Talk, Walk e Drink (Stand_and_Drink). Ogni tanto beve un sorso da un bicchierino (`CONFIG.bar.sipEvery`).
- **Ordinazione** (`src/bar.js`):
  - "Ordina da bere" porta la camera su `CAM_Bar_Order`, con il menu `CONFIG.bar.drinks` (mirto 3,50 €, birretta 3 €, grappa 4 €, cocktail 10 €).
  - Nicola prende la bottiglia del drink (dallo scaffale, oppure birra e shaker costruiti in JS) e versa. Il braccio destro segue la bottiglia con un'IK a due ossa sopra l'animazione.
  - Colore e livello del liquido cambiano con il drink. Poi il bicchiere si prende dal bancone.
  - Chi è vicino alla camera del bancone viene nascosto durante l'ordinazione (`hideNear`).
- **Portafoglio** (`src/wallet.js`, `CONFIG.money`):
  - Euro del gioco, salvati nel browser; 25 € all'inizio.
  - Prezzi: biliardino e freccette 1 €, biliardo 2 € (`price` di ogni gioco, pagato a ogni partita e rivincita). La slot cambia gli euro in gettoni da 0,50 € (fino a 20) e li restituisce all'uscita.
  - Quando il saldo è sotto il prezzo più basso compare "Hai finito i soldi" e si ricomincia la serata.
- **Donazioni** (`CONFIG.donations`): spente. Con `enabled: true` e i link (Stripe/PayPal) compaiono "Ricarica crediti" nella schermata finale e "Offri da bere" nel menu del bancone.
- **Sigaretta**: la offre Cronico nel dialogo (nodo `sigaretta`, azione `give:cigarette`); il pacchetto sul tavolino è solo decorazione (`CONFIG.smoking.fromCronico`). Le condizioni dei dialoghi accettano `&` (`match&!cigarettes`).
- **Rafka** (Meshy "Bearded man"):
  - Clip: Idle, Talk (Stand_and_Chat), Walk, Wave.
  - Parte accanto al bancone vicino a Cronico. La prima volta che ti vede saluta con la mano (`greet` nella routine `rafka`), poi gira tra bancone, freccette, biliardino e TV.
  - Nel dialogo dà consigli e ti sfida a biliardino o freccette.
- **Schermata iniziale**: logo "Benvenuti al Circolo Vizioso" (`assets/logo.webp`, trasparente) su fondo nero.

## Kappa, Zucco, Lyuce e camminate senza sovrapposizioni

- **Chi c'è:** Bachisio e Salvatore sono stati tolti. Restano i quattro vecchi del tavolo (tutti e quattro ogni tanto si alzano a bere, in momenti diversi). Nuovi: Kappa (fotografa), Zucco (videomaker) e Lyuce (stylist).
- **Modelli:** Meshy, via `build_meshy_char`.
  - Lyuce: la clip Talk sono i gesti del busto di Red_Carpet_Walk.
- **Reflex** (Nikon D7100, Blend Swap #77959, CC0; `asset-props/nikon`): ridotta a circa 3.200 triangoli con materiali semplici. Nel glb è `Prop_Camera`, nascosta; `src/camerawork.js` ne fa una copia a testa.
- **Foto e video** (passo `{ act: 'photo' | 'video' }` nella routine):
  - posa con IK sopra l'animazione (`src/ik.js`, condiviso con la versata del barista);
  - `solveHinge` orienta braccio e avambraccio con l'asse del gomito preso dall'animazione, quindi nessuna torsione;
  - `orientHand` controlla il palmo: la mano sinistra sostiene l'obiettivo con il palmo in su, la destra impugna il lato destro del corpo macchina;
  - misure in `CONFIG.camerawork`; per Kappa flash e scatto sonoro.
- **Commenti di Lyuce:** il passo `{ comment: 'any' | [nomi] }` si gira verso il più vicino entro 3,2 m e commenta il suo outfit; l'altro risponde (`CONFIG.stylist.lines`).
- **Camminate** (`src/routine.js`):
  - chi cammina tiene la destra, aggira chi è fermo e non passa rasente;
  - scivola lungo i mobili con le collisioni del giocatore;
  - un punto di sosta occupato non si raggiunge: si aspetta, poi si passa oltre;
  - se non avanza per 1,5 s salta il passaggio e per 2 s ignora gli ostacoli.
- **Punti di sosta:**
  - al bancone ci si ferma a 36 cm dal banco e chi passa usa la corsia R1-R2;
  - la corsia centrale è a y -0,05, lontana da chi guarda la TV dietro le sedie;
  - Cronico si ferma al bancone accanto a chi ordina, non sopra.
- **Verifica su 15 minuti simulati:**
  - nessuno entra nei mobili e nessuno resta bloccato;
  - tutti completano i loro giri;
  - sotto 0,35 m in tutto 3,5 secondi, cioè passaggi brevi.
- **Scopa:** se Peppino è al bancone quando parte la partita, torna subito a sedersi (`seated` nel minigioco, `sitNow` nella routine).
- **Collisioni dei personaggi:** tutti i box sono ignorati tranne quello di Nicola, perché gli altri si muovono.

## Telefono e tablet

- `src/touch.js` si attiva sui dispositivi touch (senza mouse), oppure con `?touch=1` nell'indirizzo; `?touch=0` lo spegne.
- **Esplorazione:**
  - levetta a sinistra, che compare dove si appoggia il pollice (spinta a fondo = corsa);
  - trascinare a destra per guardarsi intorno;
  - tocco veloce = l'azione a schermo (parla, ordina, siediti, gioca, bevi, fai un tiro);
  - si possono toccare anche la scritta dell'azione e il suggerimento "Bevi" / "Fai un tiro";
  - pulsante II per la pausa.
- **Minigiochi:**
  - trascinare = muovere il mouse (mira, aste, bilia); in scopa si toccano le carte;
  - i pulsanti a schermo sono in `CONFIG.minigames.games.<id>.touch.buttons` (`mouse`: tasto del mouse tenuto, `key`: tasto, `wheel`: rotella, `main`: il pulsante grande);
  - regole e suggerimenti touch sono in `touch.controls` e `touch.hint`.
- **Rendering:** sul telefono risoluzione massima 1,25, ombre 512 px, niente antialias (`CONFIG.touch`).
- **Pagina:**
  - niente zoom né scorrimento;
  - schermo intero e orizzontale all'ingresso (dove il browser lo permette);
  - in verticale compare l'invito a girare il telefono;
  - su schermi bassi (sotto 520 px) dialoghi, bancone, pannelli e schermata iniziale sono compatti.

## La serata a brani (modalità storia) e il gioco libero (27 settembre 2026)

Punto di ripristino prima di questo lavoro: tag git `prima-della-serata` (commit 57f0428).

- **Schermata iniziale:** due pulsanti. *La serata* = la storia a brani; *Gioco libero* = tutto sbloccato come a serata finita (nessun obiettivo, niente salvataggi della progressione, routine di tutti partite subito).
- **Codice:** `src/serata/` — `contenuti.js` (tutti i testi, i tempi, le domande, i menu, le scatole nere: si regola lì), `director.js` (regia), un file per gioco (`cinema.js`, `cibo.js`, `blackbox.js`, `cometiva.js`, `bicchiere.js`), `spettacolo.js` (finale), `cibo3d.js` (cibo sul tavolino), `overlay.js` (interfaccia comune e musica), `regole.js` (logica pura, provata da `tests/serata.test.mjs`).
- **Passi** (`SERATA.passi`, salvati in `circolo.progress.serata.v1`): Nicola spiega posto, gente, giochi e regole → ci si presenta a Cronico, Rafka, Kappa, Zucco, Lyuce (contatore nell'obiettivo) → Cronico ti viene a prendere → 5 brani → ritorno al tavolino → spettacolo → libero.
- **Inviti:** il personaggio raggiunge il giocatore camminando (`userData.directed`: la sua routine si ferma), parla (nodo `*_invito`), con "Andiamo" dissolvenza e si va al posto del gioco (`SERATA.posti`). Se chiudi il dialogo senza partire te lo ripropone; se ti allontani ti segue.
- **Durante un gioco:** giocatore fermo, cursore libero, pulsanti a schermo e tasti numerici; clic sulla scena = un tiro di sigaretta; Esc = pausa (anche la musica). Obiettivi nascosti e sottotitoli in alto a sinistra (`body.srt-on`).
- **Brani:** durata in `SERATA.brani.<id>.durata`; con `audio` (mp3 in `assets/musica/`) la durata è quella del file e il brano suona in sottofondo.
  1. *Cinema*: quiz sul maxischermo (canvas 1024×576 al posto della partita, `tv.setOverride`), 12 s a domanda, punti + velocità + serie.
  2. *Fumo*: Rafka (Bologna, le sigarette di Cronico; da qui in poi "Posso dire?" nel 40% delle sue frasi). Si prende la sigaretta dal pacchetto sul tavolino (`CONFIG.smoking.fromCronico = false`), ci si siede, si ordina per il tavolo: volantino → composizione → telefonata al numero del volantino (prefisso 051) → orario. Punti: richiesta rispettata, numero giusto al primo colpo, velocità, orario, consegna prima della fine del brano. Il cibo arriva sul tavolino (`cibo3d.js`: hamburger e bibita da `assets/cibo.glb`, pizza e kebab costruiti con gli ingredienti scelti; c'è anche il telefono).
  3. *Black Box*: Lyuce; una scatola nera compare sul tavolino, si prende con E. Inizio e fine noti: scegliere cosa è successo in mezzo, o mettere in ordine i passaggi.
  4. *Come ti va*: Kappa; in mezzo alla sala, otto microgiochi a rotazione sempre più veloci per 3:30.
  5. *Mezzo pieno*: Zucco, al bancone; tre bicchieri (pieno, mezzo pieno, mezzo vuoto) mescolati sempre più veloci, 2 minuti.
- **Finale:** torni al tavolino, prendi una sigaretta, "Siediti e goditi lo spettacolo": tutti (tranne Nicola) si mettono in fila e girano attorno al biliardo (`SERATA.spettacolo.anello`), prima camminando poi correndo; poi il logo "Benvenuti al Circolo Vizioso" e la scheda della serata.
- **Punti:** a fine serata diventano euro (1 € ogni 250 punti, massimo 40) da spendere nel circolo, più titolo (`titoloDellaSerata` in `contenuti.js`), record e testo da condividere con la riga dell'EP (`SERATA.ep`).
- **Asset:** `asset-props/cibo/` contiene gli script Blender che hanno prodotto `cibo.glb` dal cheeseburger (Blend Swap #73900, CC0) e dall'iPhone 5s; compressione con `gltf-transform merge` + `meshopt`.
