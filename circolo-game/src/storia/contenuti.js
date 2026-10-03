// "La storia": terza modalità, sperimentale, separata dalla serata (codice in src/storia/, salvataggio a parte).
// Primo capitolo: come nella serata si parla con Nicola e ci si presenta a tutti; poi Cronico ti aspetta alla porta
// d'ingresso, la apri e ti ritrovi in un cinema. Hai un biglietto: trovi il tuo posto, ti siedi, le luci si spengono e
// parte il film (il quiz del cinema sul grande schermo). Finito il film esci dalla porta verde e torni al circolo.
import { ASSET_VERSION } from '../version.js';

export const STORIA = {
  storageKey: 'circolo.progress.storia.v1',
  passi: [
    { goal: 'nicola', text: 'Parla con Nicola al bancone', locked: 'Prima parla con Nicola al bancone' },
    { goal: 'presentazioni', text: 'Presentati a tutti ({n}/5): Cronico, Rafka, Kappa, Zugo, Lyuce', locked: 'Prima conosci tutti' },
    { goal: 'porta', text: 'Cronico ti aspetta alla porta d\'ingresso', locked: 'Più tardi: adesso c\'è la storia' },
    { goal: 'biglietto', text: 'Trova il tuo posto: fila {fila}, posto {posto}', locked: 'Più tardi' },
    { goal: 'film', text: 'Goditi il film', locked: 'Più tardi' },
    { goal: 'uscita', text: 'Esci dal cinema: le tende rosse in fondo alla sala', locked: 'Più tardi' },
    // capitolo 2: il fumo
    { goal: 'rafka', text: 'Raggiungi Rafka ({dove})', locked: 'Più tardi' },
    { goal: 'stanzetta', text: 'Apri la porta accanto al maxischermo', locked: 'Più tardi' },
    { goal: 'fumo', text: 'Fumo: prendi una sigaretta, siediti, ordina da mangiare', locked: 'Più tardi' },
    { goal: 'uscita2', text: 'Esci dalla stanzetta', locked: 'Più tardi' },
    // capitolo 3: la scatola nera
    { goal: 'esodo', text: 'Guarda: se ne vanno tutti', locked: 'Più tardi' },
    { goal: 'lyuce', text: 'È rimasta solo Lyuce, accanto al biliardo', locked: 'Più tardi' },
    { goal: 'scatola', text: 'Apri la scatola nera in mezzo al biliardo', locked: 'Più tardi' },
    { goal: 'idee', text: 'Black Box: lascia le tue idee nella scatola', locked: 'Più tardi' },
    { goal: 'rientro', text: 'La porta si riapre: rientrano tutti', locked: 'Più tardi' },
    { goal: 'kappa', text: 'Parla con Kappa, alla porta accanto al tavolo da carte', locked: 'Più tardi' },
    { goal: 'strada', text: 'Apri la porta accanto al tavolo da carte ed esci', locked: 'Più tardi' },
    { goal: 'macchina', text: 'Fai due passi: la tua macchina è parcheggiata più avanti, sulla strada', locked: 'Più tardi' },
    { goal: 'guida', text: 'Torna a casa in macchina, schivando gli ostacoli ({n}%)', locked: 'Più tardi' },
    { goal: 'casa', text: 'Scendi (E) ed entra a casa: il portone con la luce accesa', locked: 'Più tardi' },
    { goal: 'continua', text: 'Fine del quarto capitolo. Casa... è il circolo. Gira e gioca' },
  ],
  requires: { minigame: 'idee', smoke: 'nicola' },
  ui: { label: 'La storia', sub: 'Sperimentale: capitolo 1, il cinema' },
  presentazioni: { Cronico: 'benvenuto', Rafka: 'rafka_ciao', Kappa: 'kappa_ciao', Zugo: 'zucco_ciao', Lyuce: 'lyuce_ciao' },
  presentazioniCoda: 'Fatti un giro e conosci tutti: poi Cronico ti porta in un posto.',
  attesa: 4,                                // secondi dopo l'ultima presentazione

  cronico: {
    porta: [-3.05, 3.35],                   // dove aspetta, accanto alla porta (coordinate del circolo)
    nodo: 'storia_invito',
    chiama: 'Ohi! Vieni qua, alla porta. Ti faccio vedere una cosa.',
    apri: 'Apri tu. Io resto qui: certe cose si guardano da soli.',
    dentro: 'Vai, vai. Cammina e non voltarti.',
  },
  portaLabel: 'Apri la porta',
  buio: 1.6,                                // metri da fare nel buio oltre la soglia prima di ritrovarsi nel cinema
  logo: './assets/titoli/cinema.png',
  logoDurata: 3.5,

  // la sala (src/storia/cinemaroom.js): lontana dal circolo, oltre il piano di taglio della camera
  sala: {
    origine: [80, 0, 0],
    larghezza: 12, profondita: 16, altezza: 5.5,
    schermo: { larghezza: 7.6, altezza: 3.3, y: 2.9 },
    file: { lettere: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'], posti: 10, larghezzaPosto: 0.62, primaZ: -3.6, passo: 1.35 },
    uscita: [4.6, 0, 7.94],                 // porta d'uscita, parete di fondo
    arrivo: [4.6, 6.9],                     // dove ti ritrovi entrando (davanti alla porta, di spalle)
  },
  biglietto: { fila: 'F', posto: 7 },
  item: 'Biglietto',
  postoGiusto: 'Siediti',
  postoSbagliato: 'Fila {fila}, posto {posto}',
  nonTuo: 'Non è il tuo posto: il biglietto dice fila {fila}, posto {posto}.',
  arrivoHint: 'Hai un biglietto in tasca: fila {fila}, posto {posto}. Le file sono scritte ai lati.',
  uscitaLabel: 'Esci dal cinema',
  ritorno: 'Sei di nuovo al circolo. Cronico ti guarda come se niente fosse.',
  cronicoDopo: 'Bello, eh? Il cinema c\'è sempre stato, solo che non lo trova nessuno. La prossima volta ti porto più lontano.',
  // ---- capitolo 2: Rafka ti aspetta in giro, ti chiede di aprire la porta accanto al maxischermo; dietro c'è la stanzetta
  rafka: {
    nodo: 'storia_rafka',
    chiama: 'Posso dire? Eccoti! Vieni qua, che ti devo chiedere una cosa.',
    vai: 'Posso dire? Aprila tu, io ti raggiungo.',
    dentro: 'Posso dire? Benvenuto nella stanzetta. Qui non ci viene mai nessuno: prendi una sigaretta dal tavolo.',
    siediti: 'Siediti, rilassati. Fatti due tiri con calma, che la serata è lunga.',
    fame: 'Posso dire? Ho una fame che non ci vedo. Ordiniamo qualcosa? Il telefono è lì, i volantini pure.',
    fine: 'Posso dire? Si è mangiato da re. Quasi come a Bologna. Andiamo, che di là ci aspettano.',
    dopo: 'Posso dire? Quella stanzetta non la conosce nessuno. Tienitela per te.',
  },
  portaTv: { centro: [0.15, -4.0], larghezza: 0.96, altezza: 2.18 },   // la porta accanto al maxischermo (parete nord)
  fumoLogo: './assets/titoli/fumo.png',
  stanzetta: {
    origine: [140, 0, 0],
    larghezza: 4.4, profondita: 4.0, altezza: 3.0,
    tavolo: [0, -0.4],                      // centro del tavolo
    porta: [1.3],                           // x della porta, sulla parete di fondo (z = profondità/2)
    rafka: [-1.2, -0.2],                    // dove sta Rafka
    poltrona: [-1.55, 1.25, 2.4],
    // poster sulla parete di fronte alla sedia (z = -profondità/2): x del centro, altezza del centro, larghezza (m), un filo storti
    poster: [
      { img: './assets/poster/pratello.webp', x: -0.85, y: 1.75, w: 1.05, storto: 0.02 },
      { img: './assets/poster/foras.webp', x: 0.75, y: 1.7, w: 0.82, storto: -0.025 },
    ],
    posti: [[-0.28, 0.24], [0.3, 0.2], [-0.3, -0.26], [0.02, 0.33]],   // dove arriva il cibo sul tavolo (il centro è del pacchetto)           // poltrona: x, z, verso cui guarda (radianti: verso il tavolo)
  },
  tiri: 2,
  ingresso: 0.75,                           // a quanti metri dalla porta aperta (accanto alla TV) si entra nella stanzetta
  esciStanzetta: 'Esci dalla stanzetta',
  fumoGioco: 60,
  // ---- capitolo 3: se ne vanno tutti dalla porta d'ingresso, resta Lyuce, la scatola nera sul biliardo
  esodo: {
    chi: ['Rafka', 'Kappa', 'Zugo', 'Cronico', 'Efisio', 'Tonino', 'Peppino', 'Gavino', 'Nicola'],   // in quest'ordine
    intervallo: 1.6,                        // secondi tra un'uscita e l'altra
    passo: 1.15,                            // metri al secondo
    giri: { Nicola: [[-5.45, 1.9], [-4.2, 2.3]] },   // Nicola esce da dietro il bancone girandoci attorno
    senzaCollisioni: ['Nicola'],            // (nel circolo c'è il suo ingombro fisso dietro al bancone)
    attesa: 2.5,                            // secondi dopo l'uscita dalla stanzetta prima che si apra la porta
  },
  lyuce: {
    posto: [2.75, 0.15],                    // dove resta ad aspettarti, accanto al biliardo
    nodo: 'storia_bb',
    chiama: 'Sono rimasta io. Vieni, siediti un attimo con i pensieri.',
    vai: 'Vai. La scatola è sul biliardo, in mezzo alla sala. Con calma.',
    dopo: 'Visto? Ognuno ci mette dentro un pezzo di mezzo. Nessuno lo stesso.',
  },
  bbLogo: './assets/titoli/blackbox.png',
  apriScatola: 'Apri la scatola nera',
  ritornoTutti: 'La porta si riapre: rientrano tutti, come ogni sera.',
  // capitolo 4: rientrano tutti dalla porta d'ingresso; Kappa va ad aspettarti alla porta nuova, dove prima c'era il
  // tavolino con le sigarette (accanto al tavolo da carte), e da lì si esce in strada
  rientro: { intervallo: 1.3, attesa: 5 },     // secondi tra un ingresso e l'altro; attesa dopo la scatola
  portaEst: {
    centro: [6.0, 0.42],                    // sul muro est, a filo della parete interna
    larghezza: 0.95, altezza: 2.12,
    // in questa modalità il tavolino con sigarette e posacenere (e la sedia lì accanto) non c'è più
    togli: ['Side_Table', 'Ashtray_Side', 'Cigarette_Pack', 'Cigarette_Lit', 'Serata_Chair'],
    collisioni: ['COL_Side_Table', 'COL_Serata_Chair'],
  },
  kappa: {
    posto: [5.0, -0.8],                     // accanto alla porta nuova
    nodo: 'storia_kappa',
    chiama: 'Ehi! Vieni, ti aspettavo.',
    vai: 'Dai, apri la porta. Io ti seguo tra un attimo.',
    fuori: 'Respira. Senti che aria? Fai due passi, svagati. Ma quella macchina verde laggiù non è la tua?',
  },
  esciLabel: 'Apri la porta ed esci',
  strada: {
    url: `./assets/strada.glb?v=${ASSET_VERSION}`,
    origine: [-200, 0, 0],                  // lontano dal circolo, come il cinema e la stanzetta
    nascondi: ['Material.050'],             // materiali da non disegnare: il cubo che in Blender faceva da cielo
    // il percorso: curvatura di ogni tratto da 40 m (0 = dritto, 1/raggio in metri; + gira verso destra andando verso +x).
    // Si ripete all'infinito. Il primo è il tratto di casa (la porta da cui si esce, il parcheggio): sempre dritto, come
    // tutti quelli dove si può scendere dalla macchina
    tracciato: [0, 1 / 70, 0, -1 / 60, -1 / 75, 0, 1 / 55, 0, -1 / 65, 1 / 80],
    indietro: 1, avanti: 3,                 // tratti disegnati dietro e davanti a chi guida
    // ostacoli per chi cammina, nel tratto dritto: [x, z, mezza larghezza x, mezza larghezza z] (pali, cestini, panchine)
    ostacoli: [[3.23, 7.7, 0.24, 0.27], [-2.82, 7.7, 0.24, 0.27], [-9.97, -7.88, 0.24, 0.27], [18.02, 7.68, 0.24, 0.27],
      [1.53, -4.51, 0.21, 0.71], [17.34, 4.54, 0.21, 0.71], [-8.97, 4.54, 0.21, 0.71], [-1.88, -4.13, 0.66, 0.05],
      [-17.81, -4.51, 0.21, 0.71], [2.49, -4.58, 0.35, 0.35], [18.81, -4.25, 0.22, 0.29], [-16.06, 5.26, 0.26, 0.34],
      [9.03, 4.54, 0.35, 0.35], [8.2, 4.54, 0.35, 0.35]],
    alberi: [[4.6, -4.5], [-4.6, -4.5], [14.1, -4.5], [-14, -4.6], [4.6, 4.5], [-4.6, 4.4], [13.9, 4.5], [-14, 4.5]],   // tronchi
    limiti: [-19.5, 19.5, -8.2, 8.2],       // dove si cammina: x min, x max, z min, z max (il tratto in cui si è)
    porta: [2.9, -8.9], portaLarga: 1.05, portaAlta: 2.2,    // da qui si esce dal circolo: il portone ad arco (facciata nord)
    portaleQualita: 0.6,                    // risoluzione della strada vista dalla porta del circolo (rispetto allo schermo)
    arrivo: [2.9, -8.0],                    // per i salti di prova: appena fuori dalla porta
    guarda: [2.9, 4],
    kappa: [4.2, -7.0],                    // dove compare Kappa, poco dopo di te
    cielo: 0x9db8d8, luce: 1.4, sole: 1.6,
    nebbia: [18, 60],                       // la via sfuma nel cielo tra questi metri: il cielo non la taglia mai
    lontano: 90,                            // distanza di disegno in strada (nel circolo basta molto meno)
    telefono: { avanti: 2, nebbia: [12, 46], lontano: 60, portaleQualita: 0.45 },   // sui telefoni: meno strada da disegnare
    arrivoHint: 'Sei fuori. Prenditi una boccata d\'aria: la tua macchina è parcheggiata più avanti.',
    locale: { porta: [-6.4, -9.0], altezza: 3.3, insegna: 'BAR' },   // il portone con i gradini, marciapiede nord
    casa: 15,                               // il tratto (dritto) dove c'è casa, alla fine del percorso
    casaLabel: 'Apri la porta di casa',
  },
  ctvLogo: './assets/titoli/cometiva.png',
  // la tua macchina: Dodge Challenger del 1970 (assets/macchina.glb), coordinate della strada
  auto: {
    url: `./assets/macchina.glb?v=${ASSET_VERSION}`,
    parcheggio: [-6, 1.9, 0],               // x, z nel tratto di casa, direzione rispetto alla via (0 = verso +x, lato destro)
    quota: -0.2,                            // la carreggiata è 20 cm sotto i marciapiedi
    carreggiata: [-1.55, 1.55],             // dove sta il centro della macchina (oltre: zona morbida di mezzo metro, le ruote restano in strada)
    accelerazione: 10, freno: 16, attrito: 2.4, retro: 6, massima: 28,  // m/s² e m/s (28 m/s ≈ 100 km/h)
    turbo: 40, accelerazioneTurbo: 16,      // con Shift (o TURBO sul telefono): 40 m/s ≈ 145 km/h
    sterzo: 0.55, passo: 2.9,
    volante: 2.6,                           // di quanto gira il volante rispetto alle ruote
    dietro: [6.5, 2.3],                     // telecamera da dietro: distanza e altezza
    guidatore: [-0.4, 1.08, 0.25],          // occhi al posto di guida (modello: x a destra, y su, z indietro)
    inseguimento: 3.2,                      // quanto in fretta la visuale da dietro si rimette dietro la macchina
    sali: 'Apri la macchina',
    portiera: 0.55, portieraAngolo: 1.15,   // secondi per aprire la portiera sinistra, angolo (radianti)
    soloRettilinei: 'Per scendere fermati su un rettilineo.',
    comandi: 'W/S o frecce: gas e freno · A/D: sterzo · Shift: turbo · C: visuale · E: scendi',
    // il percorso fino a casa: casa è nel tratto `arrivo` (dritto), sul portone ad arco come quello da cui sei uscito
    arrivato: 'Eccola. Casa. Finalmente.',
    oltre: 'Casa è rimasta indietro: torna un po\' indietro.',
    // ostacoli in mezzo alla strada: [tratto, metri lungo la via, di traverso, tipo] (cono, barile, transenna)
    ostacoli: [
      [1, 12, 1.2, 'cono'], [1, 14, 1.8, 'cono'], [1, 30, -1.5, 'barile'],
      [2, 10, 0.6, 'transenna'], [2, 26, -1.8, 'cono'], [2, 27.5, -1.2, 'cono'], [2, 29, -0.6, 'cono'],
      [3, 15, 1.5, 'barile'], [3, 22, -1.4, 'barile'], [3, 34, 0.4, 'cono'],
      [4, 8, -1.7, 'transenna'], [4, 20, 1.7, 'transenna'],
      [5, 12, 0, 'barile'], [5, 13, 2.0, 'cono'], [5, 13, -2.0, 'cono'], [5, 30, -1.0, 'transenna'],
      [6, 18, 1.2, 'barile'], [6, 30, -1.6, 'cono'], [6, 31.5, -0.9, 'cono'],
      [7, 10, 1.6, 'transenna'], [7, 26, -1.6, 'transenna'],
      [8, 14, 0.3, 'barile'], [8, 28, -1.8, 'barile'], [8, 29, 1.9, 'barile'],
      [9, 12, 1.0, 'cono'], [9, 13.5, 0.4, 'cono'], [9, 15, -0.2, 'cono'], [9, 32, -1.5, 'transenna'],
      [10, 16, 1.5, 'barile'], [10, 24, -1.5, 'barile'],
      [11, 10, -0.6, 'transenna'], [11, 28, 1.8, 'cono'], [11, 28, -1.8, 'cono'],
      [12, 14, -1.2, 'barile'], [12, 26, 1.2, 'barile'],
      [13, 12, 1.7, 'transenna'], [13, 30, -1.7, 'transenna'],
      [14, 18, 0, 'barile'],
    ],
    casa: 'Casa. ...Ma questa è la porta del circolo?',
    rientro: 'Bentornato. Lo sapevi anche tu: casa è qui. Da qualunque porta entri, finisci sempre qui.',
  },
  blackbox: {
    titolo: 'Black Box',
    quante: 3,                              // domande per partita (a caso tra quelle sotto)
    lunghezza: 160,                         // caratteri massimi di un'idea
    placeholder: 'Scrivi la tua idea, in poche parole…',
    invia: 'Lascia la tua idea',
    salta: 'Salta',
    altri: 'Nella scatola ci sono già le idee di altre persone:',
    vuota: 'Nessun altro ha ancora scritto su questa domanda. La tua idea resta qui, ad aspettare il prossimo.',
    avanti: 'Avanti',
    chiudi: 'Chiudi la scatola',
    tu: 'Tu',
    qualcuno: 'Qualcuno',
    troppoCorta: 'Scrivi almeno qualche parola',
    fine: 'La scatola si richiude. Dentro c\'è anche un pezzo del tuo mezzo.',
    // Archivio online delle idee (null = solo in questo browser). Per raccoglierle in un foglio Google:
    //   archivio: { tipo: 'foglio', url: 'https://script.google.com/macros/s/…/exec' }
    // (lo script e le istruzioni sono in strumenti/idee-foglio/). Vedi src/storia/idee.js.
    archivio: null,
    // domande esistenziali: di ognuna si conosce l'inizio e la fine, il mezzo lo scrive chi gioca. Nessuna risposta già
    // pronta: si leggono solo le idee di altre persone (quando c'è l'archivio online)
    domande: [
      { id: 'lasciare', inizio: 'Un giorno impari a camminare.', fine: 'Un giorno impari ad andartene.',
        domanda: 'Cosa ti ha insegnato, nel mezzo, a lasciare andare?' },
      { id: 'paura', inizio: 'Hai paura di qualcosa.', fine: 'Non ne hai più paura.',
        domanda: 'Cosa è cambiato nel mezzo: tu, o la cosa?' },
      { id: 'sconosciuti', inizio: 'Due persone si guardano per la prima volta.', fine: 'Anni dopo non si riconoscono più.',
        domanda: 'Dove si perde, di solito, una persona?' },
      { id: 'sogno', inizio: 'Da bambino sapevi cosa volevi diventare.', fine: 'Oggi sei quello che sei.',
        domanda: 'Cosa è successo, in mezzo, a quel sogno?' },
      { id: 'ricordo', inizio: 'Un ricordo è nitidissimo.', fine: 'Anni dopo non sai più se è andata davvero così.',
        domanda: 'Chi riscrive i ricordi mentre non guardi?' },
      { id: 'persempre', inizio: 'Dici «per sempre».', fine: 'Finisce.',
        domanda: 'Cosa resta di un «per sempre», quando finisce?' },
      { id: 'casa', inizio: 'Ti senti solo in mezzo a tanta gente.', fine: 'Ti senti a casa accanto a una persona sola.',
        domanda: 'Cosa fa la differenza, nel mezzo?' },
    ],
  },
  film: {
    titolo: 'Il film',
    regole: [
      'Sul grande schermo scorrono domande sui film d\'amore (e un po\' più caldi), con quattro risposte: A, B, C, D.',
      'Rispondi con i tasti 1-4 o A-D, oppure cliccando i pulsanti in basso.',
      '12 secondi a domanda: più sei veloce, più punti fai. Il film dura un minuto.',
    ],
    durata: 60,
  },
};
