// "La storia": terza modalità, sperimentale, separata dalla serata (codice in src/storia/, salvataggio a parte).
// Primo capitolo: come nella serata si parla con Nicola e ci si presenta a tutti; poi Cronico ti aspetta alla porta
// d'ingresso, la apri e ti ritrovi in un cinema. Hai un biglietto: trovi il tuo posto, ti siedi, le luci si spengono e
// parte il film (il quiz del cinema sul grande schermo). Finito il film esci dalla porta verde e torni al circolo.

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
    { goal: 'continua', text: 'Fine del terzo capitolo. Il circolo è aperto: gira e gioca' },
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
  ritornoTutti: 'Più tardi la porta si riapre: rientrano tutti, come ogni sera.',
  blackbox: {
    titolo: 'Black Box',
    quante: 3,                              // domande per partita (a caso tra quelle sotto)
    lunghezza: 160,                         // caratteri massimi di un'idea
    placeholder: 'Scrivi la tua idea, in poche parole…',
    invia: 'Lascia la tua idea',
    salta: 'Salta',
    altri: 'Nella scatola ci sono già queste idee:',
    avanti: 'Avanti',
    chiudi: 'Chiudi la scatola',
    tu: 'Tu',
    qualcuno: 'Qualcuno',
    troppoCorta: 'Scrivi almeno qualche parola',
    fine: 'La scatola si richiude. Dentro c\'è anche un pezzo del tuo mezzo.',
    // Archivio online delle idee (null = solo in questo browser). Per raccoglierle davvero: { url, chiave, tabella }
    // di un progetto Supabase con una tabella (id, domanda text, testo text, creato timestamptz default now()) e
    // accesso anonimo in aggiunta e lettura. Vedi src/storia/idee.js.
    archivio: null,
    // semi: le prime idee, dei personaggi del circolo, così la scatola non è mai vuota
    domande: [
      { id: 'ritorno', inizio: 'Ogni sera giuri: «stasera è l\'ultima volta».', fine: 'Ogni sera sei di nuovo qui.',
        domanda: 'Cosa c\'è in mezzo, tra la promessa e il ritorno?',
        semi: [['Cronico', 'La porta. Si apre sempre più facilmente di come si chiude.'], ['Nicola', 'Un bicchiere che si riempie da solo, quando non guardi.'],
          ['Kappa', 'AAAAAAH, la paura di perdermi la foto più bella.']] },
      { id: 'nascita', inizio: 'Nasci.', fine: 'Sei qui, stasera, al circolo.',
        domanda: 'Di tutto quello che è successo in mezzo, cosa ti ha portato davvero qui?',
        semi: [['Peppino', 'Le carte. E un amico che non c\'è più.'], ['Lyuce', 'Una scelta piccola: una porta aperta invece che chiusa.'],
          ['Rafka', 'Posso dire? Bologna. Poi la nostalgia di Bologna.']] },
      { id: 'decisione', inizio: 'Hai un dubbio.', fine: 'Hai deciso.',
        domanda: 'Cosa succede dentro di te, in quel mezzo che non si vede?',
        semi: [['Lyuce', 'Una voce smette di parlare e un\'altra alza il volume.'], ['Zugo', 'Il montaggio: tagli tutto quello che fa paura. Si gode.'],
          ['Gavino', 'Ci dormi sopra. Decide il cuscino.']] },
      { id: 'amici', inizio: 'Non conoscevi nessuno, qui dentro.', fine: 'Li chiami amici.',
        domanda: 'Cosa è successo nel mezzo?',
        semi: [['Cronico', 'Una rivincita persa apposta.'], ['Kappa', 'Una foto venuta male in cui ridevano tutti.'], ['Tonino', 'Un giro offerto. Poi un altro.']] },
      { id: 'notte', inizio: 'Vai a dormire con un pensiero.', fine: 'Ti svegli e hai cambiato idea.',
        domanda: 'Chi ha lavorato nel buio, mentre dormivi?',
        semi: [['Zugo', 'Il regista dei sogni. Lavora gratis.'], ['Efisio', 'La notte porta consiglio, diceva mia madre. A volte porta anche il mal di testa.'],
          ['Rafka', 'Posso dire? Il silenzio.']] },
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
