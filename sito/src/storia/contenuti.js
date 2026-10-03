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
    { goal: 'continua', text: 'Fine del quarto capitolo: sei in strada. Guardati intorno' },
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
    fuori: 'Eccoci. Senti che aria? Le foto più belle stanno sempre fuori dalla porta.',
  },
  esciLabel: 'Apri la porta ed esci',
  strada: {
    url: `./assets/strada.glb?v=${ASSET_VERSION}`,
    origine: [-200, 0, 0],                  // lontano dal circolo, come il cinema e la stanzetta
    nascondi: ['Cube223'],                  // il cubo che avvolge la scena di Blender: il cielo è lo sfondo
    limiti: [-19, 15, -8.2, 8.2],           // x min, x max, z min, z max (marciapiedi e carreggiata)
    alberi: [[4.6, -4.5], [-4.6, -4.5], [14.1, -4.5], [-14, -4.6], [4.6, 4.5], [-4.6, 4.4], [13.9, 4.5], [-14, 4.5]],   // tronchi
    arrivo: [9.0, -6.6],                    // sul marciapiede nord, tra due alberi, lontano da pali e cestini
    guarda: [9.0, 4],
    kappa: [10.2, -5.3],                     // dove compare Kappa, poco dopo di te
    cielo: 0x9db8d8, luce: 1.4, sole: 1.6,
    lontano: 140,                           // distanza di disegno in strada (nel circolo basta molto meno)
    titolo: 'Fuori',
    arrivoHint: 'Sei fuori dal circolo. Per adesso la storia finisce qui: guardati intorno.',
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
