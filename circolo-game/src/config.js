// Tutte le costanti regolabili del gioco. Unità: metri, secondi, radianti.
import { ASSET_VERSION } from './version.js';

// ?v=: dopo ogni pubblicazione il browser scarica gli asset nuovi invece di usare quelli in cache
const v = (path) => `${path}?v=${ASSET_VERSION}`;

export const CONFIG = {
  assets: {
    scene: v('./assets/circolo.glb'),
    collision: v('./assets/circolo_collision.glb'),
    video: './assets/partita.mp4',          // opzionale: se manca, lo schermo usa la partita disegnata su canvas
    hands: v('./assets/hands.glb'),            // mani in prima persona (pose: rilassata, bicchiere, sigaretta)
  },

  player: {
    radius: 0.3,
    walkSpeed: 1.4,
    runSpeed: 3.0,
    acceleration: 12,                       // quanto velocemente si raggiunge la velocità desiderata
    eyeHeightFallback: 1.65,                // usato se SPAWN_Player non ha eye_height
    seatedEyeHeight: 1.15,                  // sedie a 45 cm di seduta
    mouseSensitivity: 1.0,                  // moltiplicatore, regolabile dal menu di pausa
    baseLookSpeed: 0.0022,                  // radianti per pixel a sensibilità 1
    pitchLimit: 1.45,
    headBob: true,
    headBobAmplitude: 0.035,
    headBobFrequency: 1.9,                  // passi al secondo camminando (si scala con la velocità)
    maxStepDt: 0.05,
  },

  collisions: {
    ignore: ['COL_Floor', 'COL_Ceiling'],   // non limitano il movimento orizzontale
    ignorePattern: /^COL_NPC_(?!Barista)/,   // tutti i personaggi si muovono (i box resterebbero dove partono), tranne Nicola dietro il bancone
    minHeight: 0.1,                         // un box conta solo se interseca la fascia del corpo
    maxHeight: 1.8,
    iterations: 8,
    // Oggetti del glb principale usati come ripiego se circolo_collision.glb manca o è vuoto.
    fallbackExclude: /^(Floor|Ceiling|Skirting|Flag_|Lamp_|Neon_|LGT_|Glass|Cigarette_Pack|SPAWN_)/,
    roomMargin: 0.02,
  },

  interaction: {
    range: 2.0,
    highlightColor: 0xffc860,
    highlightIntensity: 0.35,
    labels: {
      pickup: 'Raccogli',
      pickup_drink: 'Prendi il bicchiere',
      serve_drink: 'Chiedi da bere',
      order_drink: 'Ordina da bere',
      smoke: 'Prendi una sigaretta',
      look: 'Siediti',
      talk: 'Parla con',
      stand: 'Alzati',
    },
    drink: {
      tiltDuration: 0.5,
      drainDuration: 2.0,
      returnDelay: 0.8,
      swayDuration: 10,
      swayRoll: 0.07,
      swayYaw: 0.05,
      swayPitch: 0.03,
      swayFrequency: 0.45,
      heldOffset: [0.3, -0.25, -0.52],       // posizione del bicchiere rispetto alla camera
    },
  },

  // Mani in prima persona: posizione nello spazio della camera (x destra, y su, z indietro), rotazione in radianti
  // (quarto elemento opzionale: ordine degli angoli di Eulero, default 'XYZ')
  hands: {
    rest: { pos: [0.16, -0.16, -0.42], rot: [0.10, 0.22, -0.10] },
    hidden: { pos: [0.24, -0.62, -0.30], rot: [0.5, 0.2, -0.1] },
    mouthGlass: { pos: [0.02, -0.10, -0.20], rot: [0.95, 0.10, -0.55] },
    mouthCig: { pos: [0.079, -0.07, -0.134], rot: [-0.15, 1.3, 0.35, 'ZYX'] },   // filtro verso la bocca; ordine ZYX = rollio dopo l'imbardata
    showTime: 0.35,
    lightIntensity: 1.6,
    // pressione di pulsanti (slot): orientamento della mano (dita in avanti e un po' in basso) e tempi dei movimenti
    press: { rot: [0.35, 0.35, -0.2], reach: 0.22, push: 0.09 },     // avambraccio che entra dal basso a destra
  },

  serve: {
    // tempi della versata letti dal glb (custom property del barista); qui solo le rifiniture
    streamRadius: 0.004,
    streamColor: 0x5a0a14,
    doneLine: 'Ecco a te. Alla salute!',
  },

  smoking: {
    fromCronico: true,                      // la sigaretta la offre Cronico (dialogo); il pacchetto sul tavolino è decorazione
    puffs: 5,                               // tiri per sigaretta
    toMouth: 0.6,
    hold: 0.9,
    back: 0.6,
    exhale: 2.2,
    emberIdle: 2.0,                         // intensità emissiva della brace
    emberPuff: 9.0,
  },

  items: {
    cigarettes: { name: 'Sigarette', taken: 'Hai acceso una sigaretta', given: 'Cronico ti accende una sigaretta', done: 'Sigaretta finita', empty: 'Il pacchetto è vuoto' },
    glass: { name: 'Bicchiere', taken: 'Bicchiere finito. Gira un po\' la testa…' },
  },

  seat: {
    chairPattern: /^Chair_Screen_/,
    screenName: 'TV_Screen',
    yawLimit: 0.7,
    pitchUp: 0.45,
    pitchDown: 0.35,
    backOffset: 0.05,                       // spostamento degli occhi verso lo schienale
    fov: 50,                                // leggero zoom sullo schermo da seduti
    fovSpeed: 4,
  },

  tv: {
    // 'off'  = partita disegnata su canvas (nessuna richiesta di rete in più)
    // 'auto' = usa assets/partita.mp4 se il server lo trova (se manca, il browser registra un 404 in console)
    // 'on'   = usa sempre il video
    videoMode: 'off',
    canvasWidth: 512,
    canvasHeight: 288,
    fps: 30,
    emissiveIntensity: 1.1,
    homeTeam: 'CAGLIARI',
    awayTeam: 'TORRES',
  },

  npc: {
    talkDistance: 2.0,
    minPause: 8,                            // secondi minimi tra l'inizio di una battuta e la successiva
    subtitleDuration: 4.5,
    names: ['Zio Peppino', 'Efisio', 'Gavino', 'Tziu Tore'],
    lines: [
      'Ohi, giovanotto, qui si gioca a scopa, mica a nascondino!',
      'Quel settebello era mio, lo giuro su mia madre.',
      'Siediti pure a guardare, ma zitto, che porti sfortuna.',
      'Ai miei tempi una partita a biliardo costava cinquanta lire.',
      'Il caffè qui è buono. Il barista un po\' meno.',
      'Tre mesi che perdo a briscola. Tre mesi!',
      'Hai visto la partita ieri? Un rigore così non lo davano nemmeno nel settanta.',
      'Non guardarmi le carte, che poi mi si legge in faccia.',
      'Tocca a te. Tocca a te! Si è addormentato di nuovo.',
      'Bevi con calma, che il vino buono non scappa.',
      'Qui dentro si risolvono i problemi del mondo, ogni sera, fino all\'ora di cena.',
      'Se vinci tu, il prossimo giro lo offri tu. Regola della casa.',
    ],
    idleSway: 0.006,
    // personaggi nascosti in esplorazione: compaiono solo quando parte il minigioco che li usa (come spettatori)
    hiddenUntilMinigame: [],                        // micro-movimento se il glb non ha animazioni (i corpi seduti non devono ruotare molto)
  },

  // Battute per tipo di NPC (custom property npc_action nel glb). "play_cards" usa names/lines qui sopra.
  npcActions: {
    host: {
      names: ['Cronico'],
      talkDistance: 2.4,
      lines: ['Ohi! Vieni, vieni: premi E se vuoi fare due chiacchiere.', 'Benvenuto! Se ti serve una guida, chiedi pure.',
        'Stasera c\'è la partita, il circolo è pieno.', 'Hai già conosciuto Nicola? Il bancone è da quella parte.'],
    },
    photographer: {                        // Kappa
      names: ['Kappa'],
      talkDistance: 2.2,
      lines: ['AAAAAAH, che luce! Fermi tutti.', 'Fermo lì! Ecco... AAAAAAH, perfetta.', 'Al Ciabi queste facce non le trovi, te lo dico io.',
        'Peppino, guarda qui! No, non tu: le carte.', 'AAAAAAH, il biliardo in controluce!', 'Dovevo essere al Ciabi. Però guarda che roba.'],
    },
    videomaker: {                          // Zucco
      names: ['Zucco'],
      talkDistance: 2.2,
      lines: ['Questo è il Circolo Vizioso, gente. Si gode.', 'Nicola, versa piano, che faccio lo slow motion. Si Godox.',
        'Guarda che inquadratura. Si gode.', 'Il biliardino al rallentatore è cinema. Si Godox.', 'Carrellata sul bancone... si gode.'],
    },
    stylist: {                             // Lyuce
      names: ['Lyuce'],
      talkDistance: 2.2,
      lines: ['Tre colori addosso, massimo tre. Ricordatelo.', 'Non è questione di soldi, è questione di proporzioni.',
        'Le scarpe dicono tutto. Tutto.', 'Qui dentro c\'è del potenziale. Nascosto bene, ma c\'è.'],
    },
    wander: {                              // chi si è alzato dal tavolo da carte e gira per il circolo
      names: [],
      talkDistance: 2.0,
      lines: [
        'Mi sgranchisco le gambe, che a quarant\'anni di scopa la schiena si fa sentire.',
        'Guarda come tira quello: con quella stecca non prende neanche il tavolo.',
        'Torno subito al tavolo, eh: Peppino conta le carte quando non guardo.',
        'Un mirto e torno a giocare. Forse due.',
        'Che partita, stasera. Il circolo non era così pieno da anni.',
      ],
    },
    serve: {
      names: ['Nicola, il barista'],
      titleFormat: '{name}, il barista',
      talkDistance: 2.2,
      lines: [
        'Cosa ti servo? Un mirto della casa o un bicchiere di rosso?',
        'Vuoi un bicchiere? Chiedi pure, il primo lo offre la casa.',
        'La partita la teniamo sul maxischermo, ma a volume basso: qui si gioca a carte.',
        'Se cerchi le sigarette, qualcuno le ha lasciate sul tavolino in fondo.',
        'Grappa, mirto, filu \'e ferru: qui c\'è tutto quello che serve per una serata.',
        'Il biliardo si paga al banco. Il calcio balilla no, ma perdi lo stesso.',
      ],
    },
  },

  // Progressione: i passi si sbloccano uno alla volta, nell'ordine della lista. Per cambiare l'ordine o aggiungere
  // passi basta modificare `steps`; `requires` dice quale passo deve essere completato prima di ogni tipo di interazione
  // (i tipi non elencati sono sempre disponibili).
  progression: {
    steps: [
      { goal: 'match', text: 'Siediti a guardare la partita', locked: 'Prima siediti a guardare la partita' },
      { goal: 'cigarettes', text: 'Fatti offrire una sigaretta da Cronico', locked: 'Prima fuma una sigaretta' },
      { goal: 'glass', text: 'Ordina da bere al bancone', locked: 'Prima ordina da bere' },
      { goal: 'games', text: 'Gioca con quelli del circolo: freccette, scopa, biliardo, biliardino, slot' },
    ],
    requires: { smoke: 'match', serve_drink: 'cigarettes', pickup_drink: 'cigarettes', minigame: 'glass' },
    unlockedToast: 'Nuovo obiettivo: {text}',
    storageKey: 'circolo.progress.v1',       // la progressione resta salvata nel browser (se disponibile)
  },

  // Soldi del gioco (euro finti): bar e gettoni. Finiti i soldi si ricomincia la serata.
  money: {
    start: 25,
    label: 'In tasca',
    storageKey: 'circolo.money.v1',
    brokeDelay: 1.5,                        // secondi prima della schermata di fine soldi
    broke: {
      title: 'Hai finito i soldi',
      text: 'Tasche vuote: niente più da bere né gettoni. Nicola ti saluta, i vecchi ridono. Si ricomincia la serata da capo.',
      restart: 'Ricomincia la serata',
    },
  },

  // Donazioni reali (Stripe/PayPal): da attivare quando ci saranno i link. Con enabled: true la schermata di fine soldi
  // mostra "Ricarica crediti" (creditsUrl) e il menu del bancone "Offrimi da bere" (drinkUrl).
  donations: {
    enabled: false,
    creditsUrl: null,
    creditsLabel: 'Ricarica crediti (donazione)',
    drinkUrl: null,
    drinkLabel: 'Offri da bere agli sviluppatori (donazione)',
  },

  // Bancone: menu di Nicola (src/bar.js). color = colore del liquido, fill = livello nel bicchiere (0-1), pour = secondi
  bar: {
    ask: ['Cosa ti servo?', 'Allora, cosa bevi stasera?', 'Dimmi tutto: cosa ti preparo?'],
    note: 'Si paga con i soldi del gioco, al banco.',
    none: 'Niente, grazie',
    notEnough: 'Non ti bastano i soldi',
    takeLabel: 'Prendi il bicchiere',
    served: ['Ecco qua. Sono {price}. Salute!', 'Servito. {price}, alla salute!', 'Ecco a te: {price}. Goditelo.'],
    sipEvery: [40, 75],                     // ogni quanto Nicola beve un sorso (secondi)
    // versata: tempi (s), inclinazione della bottiglia (gradi), collo sul bicchiere e bottiglia dritta accanto (m)
    pour: { reach: 0.9, tilt: 0.8, untilt: 0.5, back: 0.7, tiltStart: 10, tiltPour: 118, neckAbove: 0.07, neckBack: 0.02,
      baseAbove: 0.05, sideOffset: 0.16, palm: 0.075 },   // palm: dal polso al vetro, oltre il raggio della bottiglia
    cameraYaw: -0.22,                       // rotazione della vista del bancone (radianti): il bicchiere lascia spazio al menu
    hideNear: 1.1,                          // chi è più vicino di così alla camera del bancone sparisce durante l'ordinazione
    drinks: [
      { id: 'mirto', name: 'Mirto', price: 3.5, bottle: 'Bottle_Mirto_01', color: 0x3a0a1c, opacity: 0.96, fill: 0.42, pour: 1.4,
        line: 'Mirto della casa, lo fa mia zia a Seulo.' },
      { id: 'birretta', name: 'Birretta', price: 3, bottle: 'beer', color: 0xd99a1a, opacity: 0.88, fill: 0.95, pour: 2.4,
        line: 'Una birretta fresca, subito.' },
      { id: 'grappa', name: 'Grappa', price: 4, bottle: 'Bottle_Grappa_01', color: 0xf1ead2, opacity: 0.45, fill: 0.34, pour: 1.2,
        line: 'Grappa, quella buona. Piano, eh.' },
      { id: 'cocktail', name: 'Cocktail', price: 10, bottle: 'shaker', color: 0xe8561f, opacity: 0.9, fill: 0.85, pour: 2.2,
        line: 'Un cocktail? Stasera fai il signore. Te lo preparo io.' },
    ],
  },

  // Kappa e Zucco con la reflex (src/camerawork.js). Misure nello spazio del personaggio rispetto al centro della
  // macchina C: [destra, su, avanti] in metri. C = osso della testa + forward (avanti) + up (su).
  camerawork: {
    photo: {                                // davanti al viso (scatto guardando lo schermo): gomiti giù, braccia naturali
      forward: 0.3, up: 0.05, side: 0.04, pitch: 0.06, sway: 0.004, raise: 0.7, lower: 0.6, elbowOut: 0.45, elbowBack: -0.1,
      wristR: [0.08, -0.03, -0.15], aimR: [0.035, -0.01, 0.02],     // impugnatura a destra, dita fino al corpo macchina
      wristL: [-0.015, -0.075, -0.12], aimL: [0.0, -0.05, 0.06],    // palmo sotto l'obiettivo
      shotEvery: [0.9, 1.8], flash: 6, hearing: 8,
    },
    video: {                                // all'altezza del petto, un po' più avanti: si guarda lo schermo
      forward: 0.36, up: -0.12, side: 0.04, pitch: 0.12, sway: 0.01, raise: 0.8, lower: 0.7, elbowOut: 0.5, elbowBack: -0.05,
      wristR: [0.08, -0.03, -0.15], aimR: [0.035, -0.01, 0.02],
      wristL: [-0.06, -0.06, -0.13], aimL: [-0.03, -0.045, 0.04],
    },
  },

  // Lyuce, la stylist: commenti sugli outfit degli altri ([sua frase, risposta dell'altro]); 'Elder' = i vecchi del tavolo
  stylist: {
    range: 3.2,                             // commenta chi è entro questa distanza
    replyAfter: 3.2,                        // secondi prima della risposta
    lines: {
      Nicola: [
        ['Nicola, camicia bianca e grembiule marrone: classico, funziona. Però le maniche arrotolale alla stessa altezza, tutte e due.', 'Lyuce, sto versando. Le maniche dopo.'],
        ['Quel grembiule è l\'unica cosa ben stirata del circolo. Complimenti, Nicola.', 'Lo stira mia madre. Glielo dico.'],
      ],
      Cronico: [
        ['Cronico, total black con il cappellino bianco: coraggioso. La catenina la toglierei, o ne metterei una più sottile.', 'La catenina resta. È un portafortuna.'],
        ['Cronico, il nero ti sta bene, ma quel cappellino chiaro ruba tutta l\'attenzione. Scegli: o lui o la barba.', 'Scelgo tutti e due. Sono il padrone di casa.'],
      ],
      Rafka: [
        ['Rafka, camicia a fantasia e pantaloni bianchi: estate piena. Chiudi un bottone in più e sei perfetto.', 'Un bottone? Non esageriamo.'],
        ['Rafka, i ricci sono un capolavoro. Le scarpe bianche però vanno pulite, subito.', 'Dopo il biliardino, promesso.'],
      ],
      Kappa: [
        ['Kappa, il nero per chi fotografa è giusto: nelle foto non ti vedi. Una giacca strutturata però ti darebbe forma.', 'AAAAAAH, grazie! La giacca l\'ho lasciata a casa, pensavo di andare al Ciabi.'],
        ['I capelli raccolti così sono perfetti, Kappa, non toccarli. Il pantalone largo invece accorcialo di due dita.', 'AAAAAAH, due dita! Ci sto.'],
      ],
      Zucco: [
        ['Zucco, camicia marrone sopra la maglia a maniche lunghe: anni novanta, mi piace. I pantaloni kaki però spengono tutto: prova un blu scuro.', 'Blu scuro... si Godox. Ci penso.'],
        ['Zucco, i baffi li approvo. La camicia va stirata, non può andare in video così.', 'È un look documentaristico. Si gode.'],
      ],
      Elder: [
        ['Signori, camicia bianca e pantaloni scuri: eleganza da circolo, niente da dire. Solo, la camicia va dentro i pantaloni.', 'Signorina, alla mia età la camicia fa quello che vuole.'],
        ['Con quella barba bianca e la camicia chiara servirebbe un gilet scuro. Fidatevi: vi dà dieci anni di meno.', 'Dieci anni di meno? Allora me lo compro domani.'],
      ],
    },
  },

  dialogueUi: { bye: 'Ci vediamo dopo.' },

  // Routine di chi si muove per il circolo (vedi src/routine.js). markers = prefisso dei marcatori nel glb.
  routines: {
    // Rafka: saluta con la mano quando ti vede la prima volta, poi gira tra bancone, freccette, biliardino e TV
    rafka: {
      markers: 'ELDER', startAfter: 'benvenuto', startTimeout: 90, walkSpeed: 1.1, hearing: 7,
      greet: { distance: 4.5, clip: 'Wave', say: 'Ohi! Benvenuto! Io sono Rafka, parliamo dopo.', after: 'benvenuto' },
      steps: [
        { wait: [8, 12] },
        { goto: 'Bar2', via: [] },
        { clip: 'Talk', for: 4, say: 'Nicola, la solita!' },
        { reply: 'Nicola', text: 'Birretta per Rafka, arriva.' },
        { wait: [10, 15] },
        { goto: 'Darts', via: ['R', 'Q', 'S', 'TV1'] },
        { wait: [12, 18], say: 'Freccette? Io tiro solo quando ho bevuto il giusto.' },
        { goto: 'Foos', via: ['TV1', 'P'] },
        { clip: 'Talk', for: 5, say: 'Chi gioca a biliardino? Io ci sono.' },
        { wait: [10, 14] },
        { goto: 'TV2', via: ['P', 'TV1'] },
        { wait: [18, 26], say: 'Dai, dai, tira!' },
        { goto: 'Bar4', via: ['TV1', 'S', 'Q', 'R'] },
        { wait: [12, 18] },
      ],
    },
    // anziani (markers ELDER_*): i quattro del tavolo da carte ogni tanto si alzano a bere e poi tornano a sedersi.
    // Passaggi (ELDER_Way_*): K1/K2 davanti al tavolo da carte, P tra biliardo e biliardino, S/Q dietro le sedie della TV,
    // R davanti al bancone. Punti (ELDER_Spot_*): Bar1-3, TV1-3, Darts, Foos, Pool, Seat1-4 (accanto alle sedie).
    efisio: {
      markers: 'ELDER', startTimeout: 25, walkSpeed: 0.95, hearing: 7,
      steps: [
        { say: 'Vado a prendermi un mirto. Non toccate le mie carte.' },
        { rise: 'Seat1' },
        { goto: 'Bar1', via: ['K1', 'P', 'S', 'Q', 'R', 'R1'] },
        { clip: 'Talk', for: 4, say: 'Nicola, un mirto, per favore. Di quello buono.' },
        { reply: 'Nicola', text: 'Subito, Efisio. Quello buono è finito, ti do quello di sempre.' },
        { wait: [6, 9] },
        { goto: 'TV1', via: ['R1', 'R', 'Q', 'S'] },
        { wait: [14, 22], say: 'Ma l\'arbitro dove guarda? Era rigore!' },
        { goto: 'Seat1', via: ['P', 'K1'] },
        { sit: true },
        { say: 'Eccomi. Chi dà le carte?' },
        { wait: [70, 100] },
      ],
    },
    tonino: {
      markers: 'ELDER', startTimeout: 55, walkSpeed: 0.9, hearing: 7,
      steps: [
        { say: 'Aspettatemi, mi sgranchisco le gambe.' },
        { rise: 'Seat2' },
        { goto: 'Pool', via: ['K2', 'K1'] },
        { wait: [12, 18], say: 'Quella la sbagli, te lo dico io.' },
        { goto: 'Foos', via: ['P'] },
        { clip: 'Talk', for: 5 },
        { wait: [6, 10] },
        { goto: 'Bar2', via: ['P', 'S', 'Q', 'R'] },
        { clip: 'Talk', for: 4, say: 'Nicola, un bicchiere di rosso. Quello del paese.' },
        { reply: 'Nicola', text: 'Arriva, Tonino. Non dirlo a tua moglie.' },
        { wait: [8, 12] },
        { goto: 'Seat2', via: ['R', 'Q', 'S', 'P', 'K1', 'K2'] },
        { sit: true },
        { say: 'Allora, a che punto eravamo?' },
        { wait: [90, 120] },
      ],
    },
    peppino: {
      markers: 'ELDER', startTimeout: 150, walkSpeed: 0.85, hearing: 7,
      steps: [
        { say: 'Un momento, che mi serve un goccio di grappa per ragionare.' },
        { rise: 'Seat3' },
        { goto: 'Bar3', via: ['E', 'D', 'R', 'R1', 'R2'] },
        { clip: 'Talk', for: 4, say: 'Nicola, una grappa. Di quella che non vendi.' },
        { reply: 'Nicola', text: 'Peppino, quella la tengo per quando perdi.' },
        { wait: [8, 12], say: 'Io non perdo. Mai.' },
        { goto: 'Seat3', via: ['R2', 'R1', 'R', 'D', 'E'] },
        { sit: true },
        { say: 'Allora, di chi era il turno? Mio, direi.' },
        { wait: [150, 200] },
      ],
    },
    gavino: {
      markers: 'ELDER', startTimeout: 95, walkSpeed: 0.9, hearing: 7,
      steps: [
        { say: 'Mi alzo un attimo, voi non barate.' },
        { rise: 'Seat4' },
        { goto: 'Bar1', via: ['P', 'S', 'Q', 'R', 'R1'] },
        { clip: 'Talk', for: 4, say: 'Nicola, un mirto. E uno per il ragazzo, se passa.' },
        { reply: 'Nicola', text: 'Il ragazzo il mirto se lo paga, Gavino.' },
        { wait: [8, 12] },
        { goto: 'Darts', via: ['R1', 'R', 'Q', 'S', 'TV1'] },
        { wait: [10, 14], say: 'Freccette... ai miei tempi si tirava con il fucile.' },
        { goto: 'Seat4', via: ['TV1', 'P'] },
        { sit: true },
        { say: 'Eccomi. Qualcuno ha toccato le mie carte?' },
        { wait: [120, 170] },
      ],
    },
    // Kappa: fotografa. Scatta al tavolo da carte, al biliardo, dall'ingresso e al bancone.
    kappa: {
      markers: 'ELDER', startTimeout: 20, walkSpeed: 0.95, hearing: 7,
      steps: [
        { act: 'photo', for: 4, say: 'AAAAAAH, che facce! Fermi così, non vi muovete.' },
        { wait: [8, 12] },
        { goto: 'Pool', via: [] },
        { act: 'photo', for: 3, say: 'AAAAAAH, il biliardo con questa luce!' },
        { wait: [6, 10] },
        { goto: 'Door', via: ['E', 'D'] },
        { act: 'photo', for: 3, say: 'Tutto il circolo in un colpo solo. Al Ciabi questa foto non la fai.' },
        { wait: [10, 14] },
        { goto: 'Bar2', via: ['D', 'R'] },
        { say: 'Nicola, posso fotografarti mentre versi?' },
        { reply: 'Nicola', text: 'Basta che mi prendi dal lato buono.' },
        { act: 'photo', for: 3 },
        { wait: [8, 12] },
        { goto: 'CardsPhoto', via: ['R', 'Q', 'S', 'P', 'E'] },
      ],
    },
    // Zucco: videomaker. Riprende la partita, le slot, il biliardino, il biliardo e il bancone.
    zucco: {
      markers: 'ELDER', startTimeout: 15, walkSpeed: 1.0, hearing: 7,
      steps: [
        { act: 'video', for: 7, say: 'Partita del Circolo Vizioso, in diretta. Si gode.' },
        { wait: [6, 10] },
        { goto: 'Slots', via: ['TV1'] },
        { act: 'video', for: 5, say: 'Le luci della slot... si Godox.' },
        { wait: [5, 8] },
        { goto: 'Foos', via: [] },
        { act: 'video', for: 6, say: 'Biliardino al rallentatore. Si gode.' },
        { goto: 'Pool', via: ['P'] },
        { act: 'video', for: 5 },
        { goto: 'Bar1', via: ['P', 'S', 'Q', 'R', 'R1'] },
        { say: 'Nicola, un saluto alla camera!' },
        { reply: 'Nicola', text: 'Ciao mamma!' },
        { act: 'video', for: 4, say: 'Il barista più fotogenico della Sardegna. Si Godox.' },
        { wait: [8, 12] },
        { goto: 'TV2', via: ['R1', 'R', 'Q', 'S', 'TV1'] },
      ],
    },
    // Lyuce: stylist. Gira per il circolo e commenta l'outfit di chi trova vicino (passo comment)
    lyuce: {
      markers: 'ELDER', startTimeout: 30, walkSpeed: 1.0, hearing: 7,
      steps: [
        { comment: 'any' },
        { wait: [6, 10] },
        { goto: 'Bar1', via: ['R2'] },
        { comment: ['Nicola'] },
        { wait: [5, 8] },
        { goto: 'Cards2', via: ['R1', 'R', 'Q', 'S', 'P', 'K1', 'K2'] },
        { comment: ['Elder'] },
        { wait: [8, 12] },
        { goto: 'DartsSide', via: ['K2', 'K1', 'P', 'TV1'] },
        { comment: 'any' },
        { wait: [6, 10] },
        { goto: 'Door', via: ['TV1', 'S', 'Q', 'D'] },
        { comment: 'any' },
        { wait: [6, 10] },
        { goto: 'TV3', via: ['D', 'R', 'R1', 'R2'] },
      ],
    },
    cronico: {
      markers: 'CRONICO',
      startAfter: 'benvenuto',             // parte a fine del dialogo d'accoglienza (o dopo startTimeout secondi)
      startTimeout: 60,
      walkSpeed: 1.15,
      hearing: 7,                          // le sue battute si sentono entro questa distanza
      steps: [
        { once: 'Gesture', say: 'Io faccio un salto al bancone. Ci vediamo in giro!' },
        { goto: 'Bar', via: ['A', 'B'] },
        { clip: 'Talk', for: 3.5, say: 'Nicola! Il solito: un mirto della casa.' },
        { wait: 2.5, reply: 'Nicola', text: 'Subito, Cronico. Lo segno sul tuo conto, eh.' },
        { once: 'Agree', say: 'Sul conto, sul conto... come sempre.' },
        { wait: [6, 9] },
        { goto: 'TV', via: ['B'] },
        { wait: [10, 14], say: 'Dai, dai, tira in porta!' },
        { once: 'ThumbUp', say: 'Gooool! Visto? Te l\'avevo detto!' },
        { wait: [5, 8] },
        { goto: 'Cards', via: ['C', 'D'] },
        { clip: 'Talk', for: 4, say: 'Allora Peppino, chi sta vincendo stasera?' },
        { wait: 3, reply: 'Peppino', text: 'Io, come sempre. Tu pensa alle freccette.' },
        { once: 'Gesture' },
        { wait: [5, 8] },
        { goto: 'Entrance', via: ['E', 'F'] },
        { wait: [15, 25] },
      ],
    },
  },

  // Dialoghi a scelta (vedi src/dialogue.js). Chiave = npc_name del personaggio nel glb.
  // all'inizio il giocatore è di fronte a Cronico, che gli parla da solo (poi comincia la sua routine)
  intro: { npc: 'Cronico', delay: 0.8 },
  dialogues: {
    Cronico: {
      start: [{ if: '!seen:benvenuto', node: 'benvenuto' }, { if: 'match&!cigarettes', node: 'sigaretta' }, { if: 'games', node: 'sfida' }, 'ancora'],
      nodes: {
        benvenuto: { text: 'Ohi, benvenuto al circolo! Io sono Cronico. Qui dentro prima o poi ci passa tutto il paese. È la prima volta che vieni?',
          options: [{ text: 'Sì, è la prima volta. Come funziona qui?', next: 'guida' }, { text: 'Mi hanno parlato bene di questo posto.', next: 'giro2' },
            { text: 'Sono solo di passaggio.', next: 'passaggio' }] },
        // guida minima ai comandi, detta da lui
        guida: { text: 'Semplice: ti muovi con W A S D, Shift per andare più svelto, e ti guardi intorno col mouse. Quando puoi usare qualcosa compare la scritta: premi E o clicca. Con la gente si parla allo stesso modo, e rispondi coi numeri. Esc per fermarti un attimo.',
          options: [{ text: 'E cosa si fa, stasera?', next: 'serata' }, { text: 'Chiaro, grazie.', action: 'end' }] },
        giro: { text: 'Allora ti faccio fare il giro. Al bancone c\'è Nicola: il rosso è buono, il caffè dipende dalla giornata.',
          options: [{ text: 'E quei signori al tavolo?', next: 'vecchi' }, { text: 'Cosa si fa qui la sera?', next: 'serata' }] },
        giro2: { text: 'Ah sì? Scommetto che è stato Tonino, lo racconta a tutti. Vieni, ti presento il circolo.',
          options: [{ text: 'Come funziona qui?', next: 'guida' }, { text: 'Chi c\'è stasera?', next: 'vecchi' }] },
        passaggio: { text: 'Di passaggio... dicono tutti così, poi restano fino alla chiusura. Almeno siediti a vedere la partita.',
          options: [{ text: 'Va bene: come funziona?', next: 'guida' }, { text: 'Ci penso.', action: 'end' }] },
        vecchi: { text: 'Sono Peppino, Tonino, Gavino ed Efisio: giocano a scopa da quarant\'anni e litigano da quarantuno. Peppino dice di non perdere mai. Dice.',
          options: [{ text: 'E che giochi ci sono?', next: 'giochi' }, { text: 'Come si comincia la serata?', next: 'serata' }] },
        serata: { text: 'Qui funziona così: prima ti siedi a guardare la partita, poi vieni da me che ti offro una sigaretta, poi al bancone ordini qualcosa da Nicola. Dopo si gioca: occhio ai soldi, che tra gettoni e cocktail finiscono in fretta.',
          options: [{ text: 'E quali giochi ci sono?', next: 'giochi' }, { text: 'Chi sono quelli al tavolo?', next: 'vecchi' }, { text: 'Perfetto, grazie.', action: 'end' }] },
        giochi: { text: 'Freccette, biliardo, biliardino, scopa e le slot, che però non pagano mai. Quando sei pronto ti sfido io: a freccette sono il migliore del circolo. Più o meno.',
          options: [{ text: 'Raccontami del circolo.', next: 'storia' }, { text: 'Allora a dopo.', action: 'end' }] },
        storia: { text: 'Il circolo l\'ha aperto mio nonno nel sessantotto. Il biliardo è quello originale; il maxischermo no, quello l\'abbiamo preso per i mondiali.',
          options: [{ text: 'Bella storia. A dopo.', action: 'end' }, { text: 'Come si comincia la serata?', next: 'serata' }] },
        ancora: { text: ['Tutto a posto? Ricorda: partita, sigaretta, bicchiere. Poi si gioca.', 'Se ti serve qualcosa chiedi a Nicola, al bancone.',
          'Non farti battere a scopa da Peppino, che poi se ne vanta per un mese.'],
          options: [{ if: 'match&!cigarettes', text: 'Mi offri una sigaretta?', next: 'sigaretta' }, { text: 'Ricordami i comandi.', next: 'guida' }, { text: 'Cosa devo fare?', next: 'serata' }, { text: 'Chi sono quelli al tavolo?', next: 'vecchi' }, { text: 'A dopo.', action: 'end' }] },
        sigaretta: { text: ['Hai visto un po\' di partita? Bravo. Tieni, una sigaretta: te l\'accendo io.', 'Una sigaretta? Offro io, qui si fa così.'],
          options: [{ text: 'Grazie, volentieri.', action: 'give:cigarette' }, { text: 'No, grazie.', action: 'end' }] },
        sfida: { text: ['Allora, ti senti pronto? Una partita a freccette, 301: chi arriva a zero vince.', 'Rivincita? Stavolta niente sconti.',
          'Ho la mano calda stasera. Una sfida?'],
          options: [{ text: 'Accetto: freccette!', action: 'challenge:darts' }, { text: 'Meglio il biliardo.', action: 'challenge:pool' },
            { text: 'Più tardi.', action: 'end' }] },
      },
    },
    Rafka: {
      start: [{ if: '!seen:rafka_ciao', node: 'rafka_ciao' }, { if: 'games', node: 'rafka_sfida' }, 'rafka_ancora'],
      nodes: {
        rafka_ciao: { text: 'Ohi! Tu devi essere quello nuovo. Io sono Rafka: qui dentro ci passo più tempo che a casa. Cronico ti ha già fatto il giro?',
          options: [{ text: 'Sì, mi ha spiegato tutto.', next: 'rafka_bene' }, { text: 'Più o meno.', next: 'rafka_consigli' }] },
        rafka_bene: { text: 'Allora sei in buone mani. Io intanto mi prendo una birretta: Nicola la spina la tratta come un gioiello.',
          options: [{ text: 'Che consigli mi dai?', next: 'rafka_consigli' }, { text: 'A dopo.', action: 'end' }] },
        rafka_consigli: { text: 'Tre regole: al biliardino non si rulla, a scopa non si parla mentre Peppino conta, e i soldi tienili d\'occhio: tra slot e cocktail la serata finisce in fretta.',
          options: [{ text: 'E tu a cosa giochi?', next: 'rafka_gioco' }, { text: 'Grazie, Rafka.', action: 'end' }] },
        rafka_gioco: { text: 'Biliardino, sempre. Quando ti senti pronto sfidami: il gettone lo paghi tu, la gloria me la prendo io.',
          options: [{ text: 'Dopo, promesso.', action: 'end' }] },
        rafka_ancora: { text: ['Tutto bene? Hai ancora qualcosa in tasca?', 'Hai assaggiato il mirto di Nicola? Pericoloso.',
          'Kappa mi ha fatto dieci foto mentre bevevo. Dieci. Mi sa che finisco su una mostra.'],
          options: [{ if: 'games', text: 'Una partita a biliardino?', next: 'rafka_sfida' }, { text: 'Consigli?', next: 'rafka_consigli' },
            { text: 'A dopo.', action: 'end' }] },
        rafka_sfida: { text: ['Biliardino? Ci sto. Il gettone è un euro, a te l\'onore.', 'Rivincita? Stavolta non ti lascio neanche un gol.'],
          options: [{ text: 'Andiamo!', action: 'challenge:foosball' }, { text: 'Meglio le freccette.', action: 'challenge:darts' },
            { text: 'Più tardi.', action: 'end' }] },
      },
    },
    Kappa: {
      start: [{ if: '!seen:kappa_ciao', node: 'kappa_ciao' }, 'kappa_ancora'],
      nodes: {
        kappa_ciao: { text: 'Ciao! Io sono Kappa, faccio foto. Stasera dovevo essere al Ciabi, ma... eccomi qua, al circolo.',
          options: [{ text: 'Il Ciabi?', next: 'kappa_ciabi' }, { text: 'E il circolo com\'è?', next: 'kappa_circolo' }] },
        kappa_ciabi: { text: 'Eh, il Ciabi. Tutti lì stasera: luci bellissime, gente bellissima, le foto le fanno tutti uguali. Io ho sbagliato strada e sono entrata qui. Però...',
          options: [{ text: 'Però?', next: 'kappa_pero' }] },
        kappa_pero: { text: 'AAAAAAH, guarda i vecchi che giocano a carte! Questa luce gialla, le facce, le bottiglie... al Ciabi queste foto non le fai.',
          options: [{ text: 'Fammi vedere le foto.', next: 'kappa_foto' }, { text: 'Ci vediamo dopo.', action: 'end' }] },
        kappa_circolo: { text: 'AAAAAAH, è perfetto! Sembra un set. Nicola al bancone è fotogenico da far paura, e il biliardo ha una luce da film.',
          options: [{ text: 'E il Ciabi?', next: 'kappa_ciabi' }, { text: 'A dopo.', action: 'end' }] },
        kappa_foto: { text: 'Ecco: Peppino che conta le carte, Cronico in controluce, il mirto nel bicchiere. AAAAAAH, questa è bellissima. Se passi davanti all\'obiettivo ti metto nel servizio.',
          options: [{ text: 'Volentieri.', action: 'end' }, { text: 'Meglio di no.', next: 'kappa_no' }] },
        kappa_no: { text: 'Troppo tardi, sei già in tre scatti. AAAAAAH, stai benissimo.' },
        kappa_ancora: { text: ['AAAAAAH, sei tornato! Mettiti vicino al biliardo, che c\'è una luce...', 'Al Ciabi c\'è il pienone, mi scrivono tutti. Io resto qui: qui è più vero.',
          'Zucco mi ha ripresa mentre scattavo. Adesso sono nel suo documentario. AAAAAAH.'],
          options: [{ text: 'Com\'è il Ciabi?', next: 'kappa_ciabi' }, { text: 'Fammi vedere le foto.', next: 'kappa_foto' }, { text: 'A dopo.', action: 'end' }] },
      },
    },
    Zucco: {
      start: [{ if: '!seen:zucco_ciao', node: 'zucco_ciao' }, 'zucco_ancora'],
      nodes: {
        zucco_ciao: { text: 'Fratello! Zucco, videomaker. Sono al Circolo Vizioso e sto girando tutto: le carte, il biliardo, Nicola che versa. Si gode.',
          options: [{ text: 'Cosa stai girando?', next: 'zucco_video' }, { text: 'Perché "si gode"?', next: 'zucco_godox' }] },
        zucco_video: { text: 'Un documentario. Anzi, un reel. Anzi, un documentario in formato reel. Luce calda, facce vere, il mirto che scorre. Si Godox.',
          options: [{ text: 'Si Godox?', next: 'zucco_godox' }, { text: 'Bello. A dopo.', action: 'end' }] },
        zucco_godox: { text: 'Godox, le luci! Io giro solo con le Godox. E qui si gode così tanto che si Godox. Si gode, si Godox: capito?',
          options: [{ text: 'Ho capito. Purtroppo.', next: 'zucco_riprese' }, { text: 'A dopo.', action: 'end' }] },
        zucco_riprese: { text: 'Se vuoi ti riprendo mentre giochi a biliardino: slow motion sul gol, musica epica, dissolvenza sul mirto. Si gode.',
          options: [{ text: 'Magari dopo.', action: 'end' }] },
        zucco_ancora: { text: ['Hai visto la luce sul tavolo da biliardo? Si Godox.', 'Ho girato Peppino che mischia le carte: tre minuti di arte pura. Si gode.',
          'Stasera il Circolo Vizioso esce su tutti i social. Si gode.'],
          options: [{ text: 'Cosa stai girando?', next: 'zucco_video' }, { text: 'Spiegami il Godox.', next: 'zucco_godox' }, { text: 'A dopo.', action: 'end' }] },
      },
    },
    Lyuce: {
      start: [{ if: '!seen:lyuce_ciao', node: 'lyuce_ciao' }, 'lyuce_ancora'],
      nodes: {
        lyuce_ciao: { text: 'Ciao, sono Lyuce, stylist. Tranquillo, non mordo: guardo e basta. E ho già guardato.',
          options: [{ text: 'E cosa hai visto?', next: 'lyuce_tu' }, { text: 'Una stylist, qui?', next: 'lyuce_qui' }] },
        lyuce_qui: { text: 'Anche i circoli hanno bisogno di stile. Guarda Nicola: grembiule perfetto, maniche arrotolate a caso. Io sistemo i dettagli.',
          options: [{ text: 'E di me cosa dici?', next: 'lyuce_tu' }, { text: 'A dopo.', action: 'end' }] },
        lyuce_tu: { text: 'Sinceramente? Hai l\'aria di chi si è vestito al buio. Non è un difetto, è un punto di partenza: colori neutri, una giacca che cada bene, scarpe pulite. Da lì si costruisce.',
          options: [{ text: 'Grazie... credo.', next: 'lyuce_regola' }, { text: 'A me piace come sono.', next: 'lyuce_ok' }] },
        lyuce_ok: { text: 'Ed è giusto così: lo stile parte da lì. Io ti do solo gli attrezzi. Le scarpe però puliscile.' },
        lyuce_regola: { text: 'Figurati. Regola d\'oro: massimo tre colori addosso. Qui dentro la rispetta solo Peppino, e secondo me per caso.' },
        lyuce_elegante: { text: 'Nicola, senza dubbio: divisa pulita, colori giusti. Il resto del circolo lo sto sistemando, un bottone alla volta.' },
        lyuce_ancora: { text: ['Hai visto Zucco? Prima o poi lo convinco a lasciare i kaki.', 'Kappa è l\'unica che si veste per lavorare. Rispetto.',
          'Cronico con quel cappellino... ci sto ancora pensando.'],
          options: [{ text: 'Cosa pensi del mio outfit?', next: 'lyuce_tu' }, { text: 'Chi è il più elegante qui?', next: 'lyuce_elegante' },
            { text: 'A dopo.', action: 'end' }] },
      },
    },
  },

  // Minigiochi: testi comuni, regole, comandi, battute degli avversari (sei per evento)
  minigames: {
    playLabel: 'Gioca a',
    range: 3.0,                           // il bersaglio si avvia anche dalla linea di tiro (2,37 m)
    startLabel: 'Inizia',
    exitLabel: 'Esci',
    rematchLabel: 'Rivincita',
    continueLabel: 'Continua',
    confirmTitle: 'Lasci la partita?',
    confirmText: 'La partita in corso andrà persa.',
    handsBusy: 'Hai le mani occupate: prima finisci quello che hai in mano',
    priceLine: 'Una partita costa {price}.',
    notEnough: 'Non hai abbastanza soldi',
    // avversari che sfidano dal dialogo: battute proprie al posto di quelle dell'avversario abituale
    opponents: {
      Rafka: {
        lines: {
          hit: ['Gol! Te l\'avevo detto.', 'Ajò, questa era imparabile.', 'Portiere di legno, eh.', 'E vai!'],
          miss: ['Uff, per un pelo.', 'L\'asta scivola, giuro.', 'Questa la lascio a te.', 'Distrazione.'],
          win: ['Vinto! Il gettone era ben speso.', 'Il biliardino è casa mia.', 'Rivincita quando vuoi, ma il gettone lo paghi tu.'],
          lose: ['Mi hai battuto! Non dirlo a Zucco, che l\'ha ripreso di sicuro.', 'Va bene, sei forte. Birretta offerta.', 'Rivincita, subito!'],
        },
      },
      Cronico: {
        lines: {
          hit: ['Visto? Mano ferma, occhio da falco.', 'Ecco come si fa al circolo.', 'Questa la segno sulla lavagna.',
            'Ajò, non ti deprimere, capita a tutti di perdere contro di me.', 'Precisione sarda.', 'Te l\'avevo detto che ero forte.'],
          miss: ['Colpa della birra di Nicola.', 'L\'ho fatto apposta, per darti una speranza.', 'Uff, mi è scivolata.',
            'Nessuno ha visto niente, vero?', 'Il vento dalla porta, giuro.', 'Questa non conta.'],
          win: ['Vinto! Benvenuto al circolo, qui si perde così.', 'Il campione resta il campione.', 'Rivincita quando vuoi, ti aspetto.',
            'Non male per essere la prima sera.', 'Il primo giro lo offri tu.', 'Te l\'avevo detto: il migliore del circolo.'],
          lose: ['Mi hai battuto! Stasera sei tu il campione.', 'Complimenti, giochi da veterano.', 'Va bene, va bene: rivincita!',
            'Non dirlo ai vecchi, per favore.', 'Fortuna del principiante, eh.', 'Bravo davvero. Offro io.'],
        },
      },
    },
    newRecord: 'Nuovo record!',
    statsPlayed: 'Partite', statsWon: 'Vinte', statsRecord: 'Record',
    games: {
      slots: {
        touch: {
          hint: 'Gettone · Gira · + / − puntata · Incassa',
          controls: [['Gettone', 'Metti un gettone nella gettoniera'], ['Gira', 'Pulsante verde: gira i rulli'], ['+ / −', 'Cambia la puntata'],
            ['Incassa', 'Pulsante rosso: incassa e chiudi']],
          buttons: [{ label: 'Gira', mouse: 0, main: true }, { label: 'Gettone', mouse: 2 }, { label: '+', key: 'ArrowUp' },
            { label: '−', key: 'ArrowDown' }, { label: 'Incassa', key: 'Enter' }],
        },
        coinPrice: 0.5,                     // euro per gettone
        maxTokens: 20,                      // gettoni cambiati entrando
        name: 'slot machine',
        title: 'Slot machine',
        opponent: 'Nicola',
        intro: 'Entrando cambi i soldi in gettoni da 0,50 € (fino a 20). Quando esci, gettoni e crediti rimasti tornano in tasca.',
        rules: [
          'Metti i gettoni nella gettoniera, poi gira: tre rulli, una linea centrale, da 1 a 3 crediti per giro.',
          'Tre simboli uguali: nuraghe 150, sette 80, BAR 35, campana 20, uva 12, arancia 10, limone e ciliegia 8 (per gettone puntato).',
          'Due ciliegie qualsiasi pagano 3, una ciliegia sul primo rullo paga 2.',
          'Il pulsante rosso incassa: i crediti cadono nella vaschetta e tornano in tasca. Il record è il massimo di gettoni avuti.',
        ],
        controls: [['Clic destro o G', 'Metti un gettone nella gettoniera'], ['Clic o Spazio', 'Pulsante verde: gira i rulli'],
          ['Rotella o frecce su/giù', 'Pulsante giallo: cambia la puntata'], ['Invio', 'Pulsante rosso: incassa e chiudi'], ['H', 'Regole'], ['Esc', 'Esci']],
        hint: 'Destro/G: gettone · clic/Spazio: gira · rotella: puntata · Invio: incassa',
        pocket: 50,
        needCoins: 'Metti prima un gettone (clic destro o G)',
        noPocket: 'Non hai più gettoni in tasca',
        stopTimes: [0.9, 1.3, 1.7],         // secondi prima che si fermi ogni rullo
        cashOut: 'Esci con {n} gettoni',
        broke: 'Gettoni finiti',
        summary: '{spins} giri · massimo raggiunto: {best} gettoni',
        lines: {
          hit: ['Ohi! Guarda che fortuna, stasera offri tu.', 'Tre di fila! Quella macchina non paga mai.', 'Ajò, sei in serata!',
            'Ecco perché la teniamo accesa.', 'Complimenti, ma non abituarti.', 'Un nuraghe così non si vedeva da anni.'],
          miss: ['Niente, riprova.', 'Quella macchinetta mangia gettoni.', 'Pazienza.', 'La prossima è quella buona, dicono tutti.', 'Mischinu.', 'Eh, la casa vince sempre.'],
          win: ['La macchinetta ha vinto, come sempre.', 'Gettoni finiti? Vai a giocare a carte coi vecchi.', 'Te l\'avevo detto che non paga.',
            'Domani ti regalo altri cento gettoni.', 'La fortuna gira, stasera non da te.', 'Almeno erano finti.'],
          lose: ['Incassi e scappi? Furbo.', 'Hai battuto la macchinetta, bravo.', 'Con quei gettoni ci paghi un caffè a tutti.',
            'Fortuna sfacciata, eh.', 'Non tornare troppo presto.', 'Oggi la casa perde, pazienza.'],
        },
      },
      foosball: {
        touch: {
          hint: 'Trascina: muovi l\'asta · Tiro · Alza · ◀ ▶ cambia asta',
          controls: [['Trascina', 'Muovi l\'asta a destra e sinistra'], ['Tiro (tieni premuto)', 'Carica e rilascia per tirare'],
            ['Alza (tieni premuto)', 'Alza gli omini'], ['◀ ▶', 'Cambia asta'], ['Vista', 'Vista dall\'alto']],
          buttons: [{ label: 'Tiro', mouse: 0, main: true }, { label: 'Alza', mouse: 2 }, { label: '▶', wheel: -1 }, { label: '◀', wheel: 1 },
            { label: 'Vista', key: 'KeyC' }],
        },
        price: 1,                           // euro a partita (il gettone)
        name: 'biliardino',
        title: 'Biliardino',
        opponent: 'Nicola',
        intro: 'Calcio balilla all\'italiana: tu i rossi, Nicola i blu. Vince chi arriva per primo a 5 gol.',
        rules: [
          'Controlli un\'asta alla volta: quella più vicina alla palla dal lato della tua porta, indicata dalla luce sull\'impugnatura.',
          'Niente rullate: le aste ruotano al massimo di 90 gradi avanti e indietro.',
          'Dopo un gol la palla riparte dal centro verso chi l\'ha subito. Se resta ferma fuori portata per 4 secondi, rimessa.',
        ],
        controls: [['Mouse orizzontale', 'Fa scorrere l\'asta attiva'], ['Clic sinistro', 'Tiro: più lo tieni premuto (fino a 0,4 s), più è forte'],
          ['Clic destro tenuto', 'Alza gli omini per lasciar passare la palla'], ['Rotella o 1-4', 'Scegli l\'asta: portiere, difesa, centrocampo, attacco'],
          ['C', 'Vista dall\'alto'], ['H', 'Regole'], ['Esc', 'Esci']],
        hint: 'Mouse: scorri l\'asta · clic: tiro · destro: alza gli omini · rotella/1-4: cambia asta · C: vista',
        goals: 5,
        difficulty: 'normale',
        demoInExploration: false,           // true = in esplorazione i due giocatori del circolo giocano tra loro
        slideSensitivity: 0.0012,           // metri di scorrimento per pixel
        maxCharge: 0.4,
        kickSpeed: [14, 38],                // rad/s dell'asta: tiro appena accennato e tiro pieno
        goalYou: 'Gol!',
        goalOpp: 'Gol di Nicola',
        youWin: 'Hai vinto!',
        youLose: 'Ha vinto {name}',
        lines: {
          hit: ['Gooool! Imparabile.', 'Tiro di prima, come Gigi Riva.', 'Ajò, questa non l\'hai vista arrivare.',
            'Il biliardino è il mio mestiere, dopo il caffè.', 'Uno a zero per il bancone.', 'Portiere, sveglia!'],
          miss: ['Bel gol, lo ammetto.', 'Ma dove l\'hai tirata quella?', 'Il mio portiere dormiva.',
            'Aspetta che mi scaldo le mani.', 'Va bene, adesso faccio sul serio.', 'Mischinu a me.'],
          win: ['Cinque! Il biliardino è di Nicola.', 'Vinto! Il prossimo giro lo offri tu.', 'Torna quando ti sei allenato.',
            'Bella partita, ma il bancone vince sempre.', 'Ajò, un\'altra? Tanto non ho clienti.', 'Scrivilo sulla lavagna.'],
          lose: ['Mi hai battuto, complimenti.', 'Bravo, hai polso.', 'Va bene, la rivincita però la voglio.',
            'Non dirlo ai vecchi, se no mi prendono in giro.', 'Hai un bel tiro, lo ammetto.', 'Stasera il mio portiere è in ferie.'],
        },
      },
      pool: {
        touch: {
          hint: 'Trascina per mirare · tieni premuto Tira per la potenza',
          controls: [['Trascina', 'Mira (con la bilia in mano: spostala)'], ['Tira (tieni premuto)', 'Potenza: rilascia per tirare'],
            ['Tira (tocco)', 'Con la bilia in mano: posala'], ['Vista', 'Vista dall\'alto']],
          buttons: [{ label: 'Tira', mouse: 0, main: true }, { label: 'Vista', key: 'KeyT' }],
        },
        price: 2,                           // euro a partita (il gettone)
        name: 'biliardo',
        title: 'Biliardo',
        opponent: 'Tonino',
        intro: 'Palla 8 all\'italiana del circolo: regole semplici, si gioca a turno.',
        rules: [
          'Apertura dal punto di battuta. Il gruppo (piene 1-7 o rigate 9-15) è di chi imbuca per primo dopo l\'apertura.',
          'Si continua a tirare finché si imbuca una propria palla senza fallo.',
          'Fallo: bianca in buca, nessuna palla toccata, prima palla toccata non del proprio gruppo. L\'avversario ha la bianca in mano.',
          'Vince chi imbuca la 8 dopo aver chiuso il proprio gruppo; chi la imbuca prima, o insieme a un fallo, perde.',
        ],
        controls: [['Mouse', 'Ruota la mira attorno alla bianca (più fine mentre carichi)'], ['Clic sinistro tenuto', 'Carica la potenza; rilascia per tirare'],
          ['Bianca in mano', 'Muovi il mouse per spostarla, clic per posarla'], ['T', 'Vista dall\'alto'], ['H', 'Regole'], ['Esc', 'Esci']],
        hint: 'Mouse: mira · tieni premuto il clic per la potenza · T: vista dall\'alto',
        placeHint: 'Bianca in mano: muovi il mouse per spostarla, clic per posarla',
        notFree: 'Troppo vicino a un\'altra palla',
        foul: 'Fallo',
        scratch: 'Bianca in buca: torna sul punto di battuta',
        eightEarly: 'La 8 è andata in buca prima del tempo.',
        youWin: 'Hai vinto!',
        youLose: 'Ha vinto {name}',
        practiceDone: 'Tavolo pulito in {n} tiri',
        difficulty: 'normale',
        fov: 55,
        chargeTime: 1.2,
        cueRest: 0.06,                      // distanza della punta dalla bianca mentre si mira (m)
        cueBack: 0.26,                      // arretramento a potenza piena (m)
        lines: {
          hit: ['Dentro! Quarant\'anni di biliardo, piciocchè.', 'Questa la vedi solo in televisione.', 'Sponda e buca, come ai vecchi tempi.',
            'Tonino non sbaglia, lo sanno tutti.', 'Hai visto che effetto?', 'E una è andata.'],
          miss: ['Il panno è storto, lo dico da anni.', 'Mi ha tremato la mano, colpa del caffè.', 'Ajò, per un pelo.',
            'Questa stecca è da buttare.', 'La buca si è spostata, giuro.', 'Eh, sbagliano anche i campioni.'],
          win: ['Otto in buca, partita finita!', 'Vinto! Il prossimo giro lo offri tu.', 'Ci vuole esperienza, giovanotto.',
            'Bella partita, ma il tavolo è mio.', 'Ajò, rivincita? Tanto vinco ancora.', 'Scrivilo sulla lavagna: Tonino.'],
          lose: ['Mi hai battuto a casa mia, complimenti.', 'Bravo, hai la mano ferma.', 'Va bene, la rivincita però la voglio.',
            'Mischinu a me, stasera non entrava niente.', 'Non dirlo a Peppino.', 'Hai avuto fortuna sull\'ultima.'],
        },
      },
      scopa: {
        touch: {
          hint: 'Tocca una delle tue carte per giocarla',
          controls: [['Tocca una carta', 'La giochi'], ['Tocca le carte della presa', 'Scegli quale presa fare, se ce n\'è più di una']],
        },
        name: 'scopa',
        title: 'Scopa',
        opponent: 'Peppino',
        fov: 40,                            // vista dalla sedia: tavola e carte leggibili
        intro: 'Mazzo napoletano da 40 carte, uno contro uno. Si gioca a 11.',
        rules: [
          'Tre carte a testa e quattro in tavola. A turno si gioca una carta.',
          'Se in tavola c\'è una carta dello stesso valore la prendi (obbligatorio, prima delle somme); altrimenti prendi le carte la cui somma fa il valore giocato.',
          'Svuotare la tavola è scopa: un punto, tranne all\'ultima giocata.',
          'A fine smazzata: un punto per carte (più di 20), denari (più di 5), settebello, primiera, più le scope.',
          'Fante 8, cavallo 9, re 10.',
        ],
        controls: [['Clic su una carta', 'La giochi. Se ci sono più prese, clicca poi la carta della presa che vuoi'], ['H', 'Regole'], ['Esc', 'Esci']],
        hint: 'Clicca una delle tue carte per giocarla',
        chooseHint: 'Più prese possibili: clicca una carta della presa che vuoi (o di nuovo la tua per annullare)',
        handOver: 'Fine smazzata',
        nextHand: 'Smazzata successiva',
        youWin: 'Hai vinto la partita!',
        youLose: 'Ha vinto {name}',
        lines: {
          hit: ['Scopa! Segna, segna.', 'Questa la conosco da sessant\'anni.', 'Ajò, il settebello è mio.', 'Guarda e impara, piciocchè.',
            'Eh, la fortuna aiuta gli anziani.', 'Tzè, troppo facile.'],
          miss: ['Mi è scappata di mano, pazienza.', 'Uff, non ho niente da prendere.', 'Questa la butto, tanto non vale niente.',
            'Mischinu a me, che carte.', 'Aspetta che mi rifaccio.', 'Non guardarmi così, sto pensando.'],
          win: ['Undici! La partita è mia.', 'Hai giocato bene, ma Peppino è Peppino.', 'Torna domani, ti do la rivincita.',
            'Un altro caffè pagato da te, grazie.', 'Ajò, ancora una? Tanto vinco io.', 'Scopa, settebello e partita: serata perfetta.'],
          lose: ['Mi hai battuto, bravo. Ma le carte erano tue.', 'Sessant\'anni di scopa e mi batte un ragazzo.', 'Va bene, va bene, la rivincita però.',
            'Non dirlo a Tonino, per favore.', 'Complimenti, hai la testa per le carte.', 'Stasera non è serata, ecco.'],
        },
        elders: {
          scopa: ['Scopa! E bravo il giovanotto.', 'Peppino, ti sta facendo nero.', 'Uh, questa era bella.'],
          settebello: ['Il settebello! Peppino, svegliati.', 'Ecco, la carta più bella del mazzo.'],
          generic: ['Io quella la tenevo.', 'Attento al settebello, eh.', 'Ai miei tempi si giocava in silenzio.', 'Peppino, conta bene le carte.'],
        },
      },
      darts: {
        touch: {
          hint: 'Trascina per mirare · tieni premuto Tira · Respira per fermare la mano',
          controls: [['Trascina', 'Mira'], ['Tira (tieni premuto)', 'Potenza: rilascia per tirare'], ['Respira', 'Trattieni il respiro: la mano trema meno']],
          buttons: [{ label: 'Tira', mouse: 0, main: true }, { label: 'Respira', mouse: 2 }],
        },
        price: 1,                           // euro a partita (il gettone)
        name: 'freccette',
        title: 'Freccette',
        opponent: 'Gavino',
        intro: 'Bersaglio regolamentare, linea di tiro a 2,37 metri.',
        rules: [
          '301: si parte da 301 e si scala il punteggio di ogni freccetta, tre per turno. Vince chi arriva esattamente a zero.',
          'Se in un turno vai sotto zero il turno è sballato e torni al punteggio di inizio turno.',
          'Anello esterno sottile: doppio. Anello interno sottile: triplo. Centro verde: 25, centro rosso: 50.',
          'Giro dell\'orologio: colpisci in ordine i numeri da 1 a 20, poi il centro, con meno freccette possibile.',
        ],
        controls: [
          ['Mouse', 'Muovi il mirino (oscilla un po\', e di più se tieni la mira a lungo)'],
          ['Clic sinistro tenuto', 'Carica la potenza; rilascia per lanciare. Zona verde = tiro dritto'],
          ['Clic destro', 'Trattieni il respiro: mirino fermo per 2 secondi'],
          ['H', 'Regole'], ['Esc', 'Esci'],
        ],
        hint: 'Mira col mouse · tieni premuto il clic per la potenza · clic destro: trattieni il respiro',
        start: 301,
        doubleOut: false,                   // true = chiusura obbligata con un doppio o il 50
        difficulty: 'normale',
        aiError: { facile: 0.035, normale: 0.022, difficile: 0.013 },   // deviazione standard in metri sul punto mirato
        fov: 24,                            // campo visivo dalla linea di tiro
        aimSensitivity: 0.00045,            // metri sul bersaglio per pixel di mouse
        swayBase: 0.006,
        swayGrowAfter: 3,                   // secondi di mira prima che l'oscillazione cresca
        swayGrowth: 0.5,
        breathHold: 2,
        breathRecover: 5,
        breathFactor: 0.25,
        chargeTime: 1.1,                    // secondi per la carica piena
        idealZone: [0.55, 0.72],
        idealSpeed: 10,                     // m/s alla potenza ideale
        powerWeak: 0.45,                    // sotto la zona: velocità -45% per unità di potenza mancante (cade)
        powerStrong: 0.12,                  // sopra la zona: +12% per unità in più (sale di pochi centimetri)
        missLabel: 'Fuori',
        bust: 'Sballato!',
        youWin: 'Hai vinto!',
        youLose: 'Ha vinto {name}',
        clockTarget: 'Bersaglio',
        dartsUsed: 'Freccette',
        record: 'Record',
        clockDone: 'Giro completato in {n} freccette',
        lines: {
          hit: ['Ohi! Guarda qua, che mano ferma.', 'Tripla! Ai miei tempi la facevo a occhi chiusi.', 'Questa sì che è una freccetta.',
            'Mischineddu tu, adesso vedi come si tira.', 'Lì, dove volevo. Più o meno.', 'Ancora ci vedo bene, eh!'],
          miss: ['Colpa della luce, questa lampada balla.', 'Mi è scivolata, giuro.', 'Ajò, che figura.',
            'Il muro ha preso più punti di me.', 'Questa non conta, stavo parlando.', 'Eh, gli occhiali li ho lasciati a casa.'],
          win: ['Vinto! Il mirto lo offri tu.', 'Gavino non perdona, lo sanno tutti.', 'Torna quando hai fatto pratica, giovanotto.',
            'Bella partita, ma il vecchio ha ancora il braccio.', 'Ajò, un\'altra? Tanto vinco io.', 'Scrivilo sulla lavagna: ha vinto Gavino.'],
          lose: ['Mi hai battuto, e bravo. Stasera non ci vedo.', 'Complimenti, hai la mano di mio nonno.', 'Va bene, va bene, la rivincita però.',
            'Mischinu a me, battuto da un ragazzino.', 'Bravo! Ma non dirlo a Peppino.', 'Hai avuto fortuna. Tanta fortuna.'],
        },
      },
    },
  },

  smoke: {
    count: 22,
    life: 3.6,                              // secondi di vita di ogni sbuffo
    rise: 0.42,                             // metri di salita
    drift: 0.05,
    size: [0.012, 0.09],
    opacity: 0.22,
  },

  // Telefono e tablet (src/touch.js)
  touch: {
    lookSpeed: 1.35,                        // trascinare per guardarsi intorno (moltiplica i pixel)
    stickRadius: 58,                        // corsa della levetta in pixel
    stickArea: 0.42,                        // la levetta nasce se si tocca nella parte sinistra (frazione della larghezza)
    dragSpeed: 1.2,                         // minigiochi: trascinare = muovere il mouse
    tapMove: 12, tapTime: 280,              // tocco veloce: meno di 12 px e 280 ms
    stickHint: 'Muoviti',
    rulesLabel: 'Regole', exitLabel: 'Esci',
    maxPixelRatio: 1.25,                    // risoluzione di rendering sui telefoni (la GPU è più piccola)
    shadowMapSize: 512,
    rotate: { text: 'Gira il telefono in orizzontale per giocare meglio.', ok: 'Continua così' },
    legend: [['Levetta a sinistra', 'Muoviti (spingi a fondo per correre)'], ['Trascina a destra', 'Guardati intorno'],
      ['Tocca', 'Parla, ordina, siediti, gioca, bevi, fai un tiro'], ['II', 'Pausa e impostazioni']],
  },

  render: {
    maxPixelRatio: 1.5,
    exposure: 1.0,
    lightScale: 0.0036,                     // i watt di Blender arrivano come migliaia di candele: li riportiamo in scala
    lightMultipliers: { LGT_Neon: 0.6 },    // correzione per famiglia (prefisso del nome)
    lightFallback: true,
    hemisphereIntensity: 0.06,
    environmentIntensity: 0.07,
    shadowMapSize: 1024,
    shadowCasters: /^(Pool_Table|Lamp_Billiard|Foosball_Table|Chair_|Card_Table|NPC_|Bar_Counter)/,
    fov: 70,
    near: 0.05,
    far: 40,
  },

  ui: {
    title: 'Circolo Vizioso',
    credits: 'Modelli 3D di terzi: "LED TV" di ragstorich (CC-BY 3.0), "Cigarette with Smoke" (Blend Swap #80373, CC-BY 3.0), "Drink Bar assets v.5" di b2przemo (CC-BY 3.0). Bersaglio, freccette, carte e parti mobili dei minigiochi realizzati per il progetto. Personaggi creati con Meshy AI; mani da Human Base Meshes di Blender Studio (CC0). Texture legno da Poly Haven (CC0).',
    subtitle: 'Una sera di campionato. Entra, fai un giro, siediti a guardare la partita.',
    enterLabel: 'Entra nel circolo',
    touchMessage: 'Questo gioco si usa con tastiera e mouse. Apri questo link da un computer per entrare nel circolo.',
    drinkHint: 'Bevi',
    smokeHint: 'Fai un tiro',
    seatedHint: 'Ti sei seduto. Goditi la partita.',
    pointerLockHint: 'Clicca sulla scena per tornare a guardarti intorno',
    dragHint: 'Tieni premuto il tasto sinistro del mouse e trascina per guardarti intorno',
  },
};

// prezzi di tutto quello che si compra (per capire quando si è rimasti senza soldi)
CONFIG.money.prices = () => [...CONFIG.bar.drinks.map((d) => d.price), CONFIG.minigames.games.slots.coinPrice,
  ...Object.values(CONFIG.minigames.games).map((g) => g.price).filter(Boolean)];
