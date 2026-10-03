// La serata a brani (modalità storia): testi, tempi e contenuti dei cinque giochi. Tutto quello che si regola sta qui;
// la logica è in director.js (regia) e nei file dei singoli giochi.
//
// Ogni brano dell'EP è un gioco da un minuto (`gioco`). `audio` è il file del brano (un mp3 nella cartella assets/musica, percorso relativo alla pagina):
// finché è null il gioco usa solo `durata` (secondi) e va in silenzio. Con il file, la durata è quella del file.

export const SERATA = {
  storageKey: 'circolo.serata.v1',          // punti e record, salvati nel browser
  fade: 0.5,
  titoloDurata: 3.5,                        // secondi del titolo del brano a tutto schermo, prima del gioco

  // `gioco` = quanto dura il gioco (secondi): 1 minuto per tutti, anche se il brano è più lungo (con l'audio, il gioco finisce
  // lì e la musica si ferma). Il quinto continua dopo il gioco (`continua`): si cercano le sigarette, ci si siede e c'è lo
  // spettacolo, fino alla fine del brano (`durata`).
  brani: {
    // `regole`: la scheda "Come si gioca" prima di ogni gioco (il tempo parte solo quando premi Inizia)
    cinema: { titoloImg: './assets/titoli/cinema.png', n: 1, titolo: 'Cinema', audio: null, durata: 60, gioco: 60, regole: [
      'Sul maxischermo compare una domanda su un film d\'amore (o un po\' più caldo) con quattro risposte: A, B, C, D.',
      'Rispondi con i tasti 1-4 o A-D, oppure clicca la risposta nei pulsanti in basso.',
      '12 secondi per domanda: più sei veloce più punti fai, e le risposte giuste di fila danno un bonus.'] },
    fumo: { titoloImg: './assets/titoli/fumo.png', n: 2, titolo: 'Fumo', audio: null, durata: 60, gioco: 60, regole: [
      'In alto qualcuno del tavolo ti dice cosa vuole mangiare: leggilo bene.',
      'Scegli il volantino (kebab, pizza o hamburger), componi l\'ordine rispettando la richiesta, poi "Chiama".',
      'Componi sul telefono il numero scritto sul volantino (tastiera o numeri a schermo) e scegli l\'orario.',
      'Punti se rispetti la richiesta, se il numero è giusto al primo colpo e se fai in fretta. Il cibo arriva sul tavolino.'] },
    blackbox: { titoloImg: './assets/titoli/blackbox.png', n: 3, titolo: 'Black Box', audio: null, durata: 60, gioco: 60, regole: [
      'A sinistra c\'è come comincia una storia, a destra come finisce. In mezzo, la scatola nera.',
      '"Cosa è successo in mezzo?": scegli la risposta giusta tra tre (clic o tasti 1-3).',
      '"Metti in ordine": clicca i passaggi dal primo all\'ultimo (un secondo clic lo toglie).',
      'Ogni scatola ha il suo tempo (la barra gialla): più sei veloce più punti fai.'] },
    cometiva: { titoloImg: './assets/titoli/cometiva.png', n: 4, titolo: 'Come ti va', audio: null, durata: 60, gioco: 60, regole: [
      'Arrivano tanti giochini, uno dopo l\'altro. In giallo c\'è scritto cosa fare: leggilo, poi parte la barra del tempo.',
      'Premi la lettera, tocca il bicchiere pieno, ferma la barra nel verde, conta le sigarette, trova l\'intruso...',
      'Si gioca con il mouse (o il dito) sui pulsanti, oppure con la tastiera quando è indicato.',
      'Ogni giochino vinto vale punti, di più se ne vinci tanti di fila. Più vai avanti, più sono veloci.'] },
    bicchiere: { titoloImg: './assets/titoli/bicchiere.png', n: 5, titolo: 'Mezzo pieno', audio: null, durata: 180, gioco: 60, continua: true, regole: [
      'Guarda i tre bicchieri: Nicola ne riempie uno fino a metà (mezzo pieno), Zugo ne beve metà di un altro (mezzo vuoto), il terzo resta pieno.',
      'Poi i bicchieri si mescolano: seguili con gli occhi.',
      'Alla fine clicca prima il mezzo pieno, poi il mezzo vuoto (o tasti 1-3 da sinistra). Ogni giro è più veloce.'] },
  },

  // a fine serata i punti diventano euro da spendere nel circolo: tornano al bancone, alle slot, ai gettoni...
  euroPerPunti: 100,                        // 1 € ogni 100 punti (giochi da un minuto: una serata fa circa 1000 punti)
  euroMax: 40,

  // l'EP (schermata finale e testo da condividere)
  ep: {
    titolo: 'Circolo Vizioso',
    riga: 'Circolo Vizioso è anche un EP. Cinque brani, una serata sola, sempre la stessa.',
    url: null,                              // link al pre-salvataggio / streaming, quando c'è
  },

  ui: {
    scegli: 'Come vuoi passare la serata?',
    storia: 'La serata',
    storiaSub: 'Cinque brani, cinque giochi, una storia',
    libero: 'Gioco libero',
    liberoSub: 'Il circolo aperto, tutto sbloccato',
    liberoGoal: 'Gioco libero: gira, bevi, sfida chi vuoi',
    brano: 'Brano {n}',
    punti: 'punti',
    continua: 'Continua',
    comeSiGioca: 'Come si gioca',
    inizia: 'Inizia (Invio)',
    durata: 'Hai {s} secondi. Il tempo parte quando premi Inizia.',
    risultato: 'Brano {n} · {titolo}',
    totale: 'Punti della serata',
    esc: 'Esc: pausa',
    fine: 'La tua serata',
    euro: 'La casa ti restituisce {euro} da spendere al circolo. Tanto tornano qui.',
    condividi: 'Condividi',
    copiato: 'Copiato negli appunti',
    giocaLibero: 'Resta al circolo',
    record: 'Record della serata: {n} punti',
    condivisione: 'Stasera al Circolo Vizioso ho fatto {punti} punti. Titolo: {titolo}.',
  },

  // Passi della storia, nell'ordine (sostituiscono gli obiettivi in CONFIG.progression quando si gioca la serata)
  passi: [
    { goal: 'nicola', text: 'Parla con Nicola al bancone', locked: 'Prima parla con Nicola al bancone' },
    { goal: 'presentazioni', text: 'Presentati a tutti ({n}/5): Cronico, Rafka, Kappa, Zugo, Lyuce', locked: 'Prima conosci tutti' },
    { goal: 'cinema', text: 'Brano 1 · Cinema: raggiungi Cronico ({dove})', locked: 'Più tardi: adesso c\'è la serata' },
    { goal: 'fumo', text: 'Brano 2 · Fumo: raggiungi Rafka ({dove})', locked: 'Più tardi: adesso c\'è la serata' },
    { goal: 'blackbox', text: 'Brano 3 · Black Box: raggiungi Lyuce ({dove})', locked: 'Più tardi: adesso c\'è la serata' },
    { goal: 'cometiva', text: 'Brano 4 · Come ti va: raggiungi Kappa ({dove})', locked: 'Più tardi: adesso c\'è la serata' },
    { goal: 'bicchiere', text: 'Brano 5 · Mezzo pieno: raggiungi Zugo ({dove})', locked: 'Più tardi: adesso c\'è la serata' },
    { goal: 'spettacolo', text: 'Tavolino in fondo: prendi una sigaretta (E), poi siediti sulla sedia accanto (E)', locked: 'Prima goditi lo spettacolo' },
    { goal: 'games', text: 'Sei libero: gira per il circolo e sfida tutti' },
  ],
  requires: { smoke: 'cinema', minigame: 'spettacolo' },
  // le frasi che il passo corrente mostra mentre qualcuno ti viene a cercare o aspetta che tu faccia qualcosa
  indicazioni: {
    prendiSigaretta: 'Prendi una sigaretta dal tavolino',
    prendiScatola: 'Prendi la scatola nera sul tavolino',
    siediti: 'Al tavolino in fondo: prendi una sigaretta (E), poi siediti sulla sedia (E)',
    spenta: 'Spegni la sigaretta nel posacenere',
    primaSigaretta: 'Prima prendi una sigaretta dal tavolino',
  },
  // chi bisogna conoscere (nodo iniziale del loro dialogo) prima che Cronico ti venga a prendere
  presentazioni: { Cronico: 'benvenuto', Rafka: 'rafka_ciao', Kappa: 'kappa_ciao', Zugo: 'zucco_ciao', Lyuce: 'lyuce_ciao' },
  tiriPrimaDiOrdinare: 2,                   // brano 2: tiri di sigaretta prima che Rafka abbia fame
  attesaCronico: 4,                         // secondi dopo l'ultima presentazione
  // aggiunto alla prima battuta di Rafka, Kappa, Zugo e Lyuce finché non hai conosciuto tutti
  presentazioniCoda: 'Fatti un giro e conosci tutti: tra poco Cronico ti fa partire la prima attività.',

  // chi ti invita a ogni brano, con quale nodo di dialogo. Tutti vanno ad aspettarti in un punto lontano dal giocatore
  // (`attese`, l'obiettivo dice dove) e li raggiungi tu: parlandoci parte l'invito. `chiama` = cosa dicono quando arrivi
  // vicino (entro 3,5 m)
  attese: [
    { x: -2.3, z: 3.2, dove: 'vicino alla porta' },
    { x: 1.6, z: -2.9, dove: 'alle freccette' },
    { x: 4.4, z: -2.7, dove: 'alle slot machine' },
    { x: 2.75, z: 3.3, dove: 'dietro al tavolo da carte' },
    { x: -4.0, z: 1.35, dove: 'in fondo al bancone' },
    { x: -3.7, z: -3.0, dove: 'nell\'angolo sotto il maxischermo' },
  ],
  inviti: {
    cinema: { npc: 'Cronico', nodo: 'cinema_invito', cerca: true, chiama: 'Ohi! Eccoti, finalmente. Vieni, che si comincia.' },
    fumo: { npc: 'Rafka', nodo: 'fumo_invito', cerca: true, chiama: 'Ohi! Eccoti. Vieni qua, che ti devo dire una cosa.' },
    blackbox: { npc: 'Lyuce', nodo: 'bb_invito', cerca: true, chiama: 'Eccoti. Hai un minuto? Vieni.' },
    cometiva: { npc: 'Kappa', nodo: 'ctv_invito', cerca: true, chiama: 'Finalmente! Vieni qui!' },
    bicchiere: { npc: 'Zugo', nodo: 'bic_invito', cerca: true, chiama: 'Fratello! Ti stavo aspettando. Si gode.' },
  },
  // dove si finisce dopo "andiamo" (coordinate del circolo: x verso est, z verso sud; yaw = dove si guarda)
  posti: {
    cinema: { sedia: 'Chair_Screen_02', npc: [0.85, -1.4] },
    fumo: { player: [4.65, 0.8], guarda: [5.4, 0.8], npc: [4.75, 0.05], pitch: -0.95 },
    blackbox: { player: [4.65, 0.8], guarda: [5.4, 0.8], npc: [4.75, 1.55], pitch: -0.95 },
    cometiva: { player: [0.5, -0.35], guarda: [1.7, -0.25], npc: [1.8, -0.25] },
    bicchiere: { player: [-3.74, -0.27], guarda: [-4.8, -0.35], npc: [-3.35, 0.65], pitch: -0.25 },
    // sedia accanto al tavolino (una copia delle sedie della TV): ci si siede per fumare (brano 2) e per lo spettacolo,
    // che si guarda da lì con la visuale fissa sul biliardo, dove parte il giro
    sedia: { pos: [5.45, 0.12], guarda: [0.9, 0.9, 1.2] },
    // il pacchetto di sigarette va nell'angolo del tavolino, lontano da dove arriva il cibo
    pacchetto: [5.56, 0.98],
  },
  battute: {
    cinemaFine: ['Cronico', 'Bravo! I punti li teniamo da parte, a fine serata tornano utili. Adesso fatti un giro e cerca Rafka: ti voleva parlare.'],
    fumoSiediti: ['Rafka', 'Siediti, rilassati. Fatti due tiri con calma, che la serata è lunga.'],
    fumoFame: ['Rafka', 'Posso dire? Ho una fame che non ci vedo. Ordiniamo qualcosa? Il telefono è lì, i volantini pure.'],
    fumoFine: ['Rafka', 'Posso dire? Si è mangiato da re. Quasi come a Bologna. Lyuce ti cercava, sai? Trovala.'],
    bbFine: ['Lyuce', 'Visto? L\'inizio e la fine li conosciamo tutti. È il mezzo che ci frega. Adesso vai da Kappa, che ti tira su.'],
    ctvFine: ['Kappa', 'Sei una macchina! Adesso respira, fatti un giro e poi cerca Zugo.'],
    bicFine: ['Zugo', 'Posso dirti un segreto? Erano lo stesso bicchiere. Dipende da come lo guardi. Da adesso sei libero di circolare e di sfidare tutti. Si gode.'],
    bicLibero: ['Nicola', 'Adesso vai al tavolino in fondo: prenditi una sigaretta, siediti sulla sedia e rilassati. Goditi lo spettacolo.'],
    spettacolo: ['Cronico', 'Tutti in fila! Un giro del circolo, come ogni sera. E come ogni sera, un altro giro.'],
    benvenuti: 'Benvenuti al Circolo Vizioso',
  },
  // Rafka, dal secondo brano in poi, ogni tanto comincia le frasi così
  possoDire: { npc: 'Rafka', prefisso: 'Posso dire? ', probabilita: 0.4, dal: 'cinema' },

  // ------------------------------------------------------------------ Brano 1: quiz sul cinema, sul maxischermo
  cinema: {
    schermo: { scala: 1.75, altezza: 1.4 },  // durante il quiz: quanto si ingrandisce il maxischermo e a che altezza (m) sta il centro
    tempoDomanda: 12,                       // secondi per rispondere
    pausa: 2.2,                             // secondi con la risposta giusta in evidenza
    punti: 100, bonusVelocita: 60, bonusSerie: 20,   // bonus per ogni risposta giusta di fila (dalla seconda)
    commenti: {
      giusta: ['Esatto! Questo l\'ho visto sei volte.', 'Bravo, sei uno da cineforum.', 'Giusta! Nicola, segna.', 'Ohi, lo sapevi davvero?'],
      sbagliata: ['Nooo. Ripassati i film del sabato sera.', 'Sbagliata, ma ti perdono.', 'Mmh, questo film non l\'hai visto.', 'Eh, capita.'],
    },
    // a = risposta giusta (indice), le risposte vengono mescolate a ogni partita
    domande: [
      { q: 'In "Titanic", chi interpreta Jack?', r: ['Leonardo DiCaprio', 'Brad Pitt', 'Johnny Depp', 'Tom Cruise'] },
      { q: 'Chi dirige "Titanic"?', r: ['James Cameron', 'Steven Spielberg', 'Ridley Scott', 'Martin Scorsese'] },
      { q: 'Chi canta "My Heart Will Go On" di "Titanic"?', r: ['Celine Dion', 'Whitney Houston', 'Mariah Carey', 'Laura Pausini'] },
      { q: '"Nessuno mette Baby in un angolo": in che film?', r: ['Dirty Dancing', 'Flashdance', 'Grease', 'Footloose'] },
      { q: 'La scena del vaso al tornio è in...', r: ['Ghost', 'Pretty Woman', 'Il paziente inglese', 'Notting Hill'] },
      { q: 'Chi sono i protagonisti di "Pretty Woman"?', r: ['Julia Roberts e Richard Gere', 'Meg Ryan e Tom Hanks', 'Demi Moore e Patrick Swayze', 'Kim Basinger e Mickey Rourke'] },
      { q: '"9 settimane e ½": chi è la protagonista?', r: ['Kim Basinger', 'Sharon Stone', 'Michelle Pfeiffer', 'Julia Roberts'] },
      { q: 'L\'accavallata più famosa del cinema è di Sharon Stone in...', r: ['Basic Instinct', 'Sliver', 'Casinò', 'Attrazione fatale'] },
      { q: 'In "Notting Hill", che lavoro fa il personaggio di Hugh Grant?', r: ['Il libraio', 'Il barista', 'Il fotografo', 'Il giornalista'] },
      { q: 'In quale città è ambientato "La La Land"?', r: ['Los Angeles', 'New York', 'Parigi', 'Chicago'] },
      { q: 'Chi fa coppia con Ryan Gosling in "La La Land"?', r: ['Emma Stone', 'Rachel McAdams', 'Scarlett Johansson', 'Anne Hathaway'] },
      { q: '"Casablanca": chi è il protagonista maschile?', r: ['Humphrey Bogart', 'Cary Grant', 'Clark Gable', 'James Stewart'] },
      { q: 'Chi fa colazione davanti alla vetrina di Tiffany?', r: ['Audrey Hepburn', 'Marilyn Monroe', 'Grace Kelly', 'Sophia Loren'] },
      { q: 'Il bagno nella Fontana di Trevi con Anita Ekberg è in...', r: ['La dolce vita', 'Vacanze romane', 'Roma', 'La grande bellezza'] },
      { q: 'Chi dirige "La dolce vita"?', r: ['Federico Fellini', 'Michelangelo Antonioni', 'Luchino Visconti', 'Vittorio De Sica'] },
      { q: '"Il tempo delle mele": chi è la protagonista?', r: ['Sophie Marceau', 'Brigitte Bardot', 'Juliette Binoche', 'Isabelle Adjani'] },
      { q: '"Domani è un altro giorno" è l\'ultima battuta di...', r: ['Via col vento', 'Casablanca', 'Colazione da Tiffany', 'Titanic'] },
      { q: 'Come si chiama il protagonista di "Cinquanta sfumature di grigio"?', r: ['Christian Grey', 'Mr. Big', 'Jack Dawson', 'Noah Calhoun'] },
      { q: 'In "Harry, ti presento Sally" la scena più famosa è...', r: ['A tavola in un ristorante', 'Sotto la pioggia', 'Su una nave', 'In ascensore'] },
      { q: 'In "Lilli e il vagabondo", cosa mangiano i due cani?', r: ['Spaghetti con le polpette', 'Una pizza', 'Un hamburger', 'Una torta'] },
      { q: 'Chi dirige "Chiamami col tuo nome"?', r: ['Luca Guadagnino', 'Paolo Sorrentino', 'Gabriele Muccino', 'Ferzan Özpetek'] },
      { q: 'In "Chiamami col tuo nome", quale frutto finisce in una scena famosa?', r: ['Una pesca', 'Una mela', 'Una banana', 'Una fragola'] },
      { q: 'Chi è il protagonista di "Ultimo tango a Parigi"?', r: ['Marlon Brando', 'Al Pacino', 'Robert De Niro', 'Jack Nicholson'] },
      { q: '"Malèna" di Tornatore: chi è la protagonista?', r: ['Monica Bellucci', 'Sophia Loren', 'Ornella Muti', 'Claudia Cardinale'] },
      { q: 'Il finale con i baci tagliati dalla censura è in...', r: ['Nuovo Cinema Paradiso', 'La vita è bella', 'Il postino', 'Mediterraneo'] },
      { q: '"Take My Breath Away" è la canzone d\'amore di...', r: ['Top Gun', 'Flashdance', 'Ghost', 'Dirty Dancing'] },
      { q: 'In "Grease", chi interpreta Danny?', r: ['John Travolta', 'Patrick Swayze', 'Richard Gere', 'Kevin Bacon'] },
      { q: 'Il bacio sotto la pioggia di "Le pagine della nostra vita" è con Ryan Gosling e...', r: ['Rachel McAdams', 'Emma Stone', 'Keira Knightley', 'Natalie Portman'] },
      { q: '"Unchained Melody" suona nella scena d\'amore di...', r: ['Ghost', 'Titanic', 'Top Gun', 'Pretty Woman'] },
      { q: '"Eyes Wide Shut": chi lo dirige?', r: ['Stanley Kubrick', 'Francis Ford Coppola', 'David Lynch', 'Brian De Palma'] },
      { q: '"Moulin Rouge!": chi è la protagonista?', r: ['Nicole Kidman', 'Cate Blanchett', 'Naomi Watts', 'Kate Winslet'] },
      { q: 'In "Vacanze romane", Audrey Hepburn gira Roma in...', r: ['Vespa', 'Carrozza', 'Tram', 'Bicicletta'] },
      { q: '"Il diario di Bridget Jones": chi è Bridget?', r: ['Renée Zellweger', 'Hugh Grant', 'Meg Ryan', 'Sandra Bullock'] },
      { q: 'In "Romeo + Giulietta" di Baz Luhrmann, Romeo è...', r: ['Leonardo DiCaprio', 'Orlando Bloom', 'Heath Ledger', 'Jude Law'] },
      { q: '"Io ballo da sola" di Bertolucci è ambientato in...', r: ['Toscana', 'Sardegna', 'Sicilia', 'Puglia'] },
    ].map((d) => ({ ...d, a: 0 })),
  },

  // ------------------------------------------------------------------ Brano 2: fumo e cibo (volantini e telefono)
  // Ogni ordine è una richiesta di qualcuno del tavolo. Si sceglie il locale, si compone, si chiama il numero del
  // volantino e si sceglie l'orario. Punti: richiesta rispettata, numero giusto al primo colpo, velocità, orario giusto,
  // e un bonus se il cibo arriva prima che finisca il brano.
  cibo: {
    orologio: { inizio: 20 * 60 + 40, minutiPerSecondo: 1 },   // 20:40, un minuto del gioco ogni secondo: in un minuto di gioco si arriva alle 21:40 e gli ordini arrivano
    orari: [15, 30, 45, 60],                // minuti da adesso
    punti: { ordine: 60, rispettata: 60, violata: -40, numero: 40, velocita: 60, orario: 40, arrivato: 30 },
    tempoVelocita: 20,                      // sotto questi secondi per ordine il bonus velocità è pieno, poi cala
    // immagine opzionale per ogni volantino (una webp nella cartella assets/volantini): se c'è, sostituisce quello disegnato
    locali: [
      { id: 'kebab', nome: 'Mezzaluna Kebab', motto: 'Aperto finché c\'è fame', tel: '051 482 916', colore: '#c8341c', fondo: '#fbe7b5', immagine: null,
        basi: [{ id: 'piadina', nome: 'Piadina' }, { id: 'panino', nome: 'Panino' }, { id: 'piatto', nome: 'Piatto' }],
        carni: [{ id: 'pollo', nome: 'Pollo', tag: ['carne'] }, { id: 'vitello', nome: 'Vitello', tag: ['carne'] }, { id: 'falafel', nome: 'Falafel', tag: ['veg'] }],
        extra: [{ id: 'cipolla', nome: 'Cipolla', tag: ['cipolla'] }, { id: 'pomodoro', nome: 'Pomodoro', tag: [] }, { id: 'insalata', nome: 'Insalata', tag: [] },
          { id: 'peperoncino', nome: 'Peperoncino', tag: ['piccante'] }, { id: 'yogurt', nome: 'Salsa yogurt', tag: ['salsa'] },
          { id: 'salsapiccante', nome: 'Salsa piccante', tag: ['salsa', 'piccante'] }, { id: 'patatine', nome: 'Patatine dentro', tag: [] }, { id: 'feta', nome: 'Feta', tag: ['formaggio'] }] },
      { id: 'pizza', nome: 'Pizzeria Da Tore', motto: 'Forno a legna dal 1987', tel: '051 237 540', colore: '#1f6b3a', fondo: '#fff4e0', immagine: null,
        basi: [{ id: 'margherita', nome: 'Margherita', tag: ['formaggio'] }, { id: 'rossa', nome: 'Rossa (marinara)', tag: [] }, { id: 'bianca', nome: 'Bianca', tag: ['formaggio'] }],
        carni: [{ id: 'salsiccia', nome: 'Salsiccia', tag: ['carne'] }, { id: 'prosciutto', nome: 'Prosciutto', tag: ['carne'] }, { id: 'nessuna', nome: 'Niente carne', tag: ['veg'] }],
        extra: [{ id: 'funghi', nome: 'Funghi', tag: [] }, { id: 'cipolla', nome: 'Cipolla', tag: ['cipolla'] }, { id: 'nduja', nome: '\'Nduja', tag: ['piccante', 'carne'] },
          { id: 'olive', nome: 'Olive', tag: [] }, { id: 'bufala', nome: 'Bufala', tag: ['formaggio'] }, { id: 'patatine', nome: 'Patatine', tag: [] },
          { id: 'peperoni', nome: 'Peperoni', tag: [] }, { id: 'gorgonzola', nome: 'Gorgonzola', tag: ['formaggio'] }] },
      { id: 'burger', nome: 'Bun Vizioso', motto: 'Hamburgeria di quartiere', tel: '051 690 173', colore: '#1d2f6b', fondo: '#ffe66b', immagine: null,
        basi: [{ id: 'classico', nome: 'Pane classico' }, { id: 'nero', nome: 'Pane nero' }, { id: 'senza', nome: 'Senza pane (insalata)' }],
        carni: [{ id: 'manzo', nome: 'Manzo', tag: ['carne'] }, { id: 'pollo', nome: 'Pollo fritto', tag: ['carne'] }, { id: 'veg', nome: 'Burger vegetale', tag: ['veg'] }],
        extra: [{ id: 'cheddar', nome: 'Cheddar', tag: ['formaggio'] }, { id: 'bacon', nome: 'Bacon', tag: ['carne'] }, { id: 'cipolla', nome: 'Cipolla caramellata', tag: ['cipolla'] },
          { id: 'jalapenos', nome: 'Jalapeños', tag: ['piccante'] }, { id: 'insalata', nome: 'Insalata', tag: [] }, { id: 'pomodoro', nome: 'Pomodoro', tag: [] },
          { id: 'bbq', nome: 'Salsa BBQ', tag: ['salsa'] }, { id: 'maionese', nome: 'Maionese', tag: ['salsa'] }] },
    ],
    // richieste del tavolo: quando: 'presto' = uno dei primi due orari, 'tardi' = uno degli ultimi due
    richieste: [
      { chi: 'Tu', testo: 'E tu? Ordina quello che vuoi, ma presto: hai fame.', quando: 'presto' },
      { chi: 'Rafka', testo: 'Posso dire? Io voglio un kebab. Piccante. Ma piccante vero.', locale: 'kebab', serve: ['piccante'] },
      { chi: 'Kappa', testo: 'Niente carne per me! E con almeno tre cose sopra.', evita: ['carne'], almeno: 3 },
      { chi: 'Zugo', testo: 'Cipolla. Tanta cipolla. Si gode.', serve: ['cipolla'] },
      { chi: 'Lyuce', testo: 'Niente salse, per carità: la camicia è di seta. E niente cipolla.', evita: ['salsa', 'cipolla'] },
      { chi: 'Cronico', testo: 'Formaggio, tanto formaggio. Sul mio conto. Ma dopo la partita, non prima.', serve: ['formaggio'], quando: 'tardi' },
      { chi: 'Nicola', testo: 'Pure a me qualcosa, che stasera non ho cenato. Una pizza, basta che sia veloce.', locale: 'pizza', quando: 'presto' },
      { chi: 'Peppino', testo: 'Per me un hamburger. Senza cose piccanti, che poi non dormo.', locale: 'burger', evita: ['piccante'] },
    ],
    consegna: ['Consegna per il Circolo Vizioso!', 'Ordine per il circolo, chi paga?', 'È arrivato! Ancora caldo.'],
  },

  // ------------------------------------------------------------------ Brano 3: la scatola nera
  // Si sa com'è iniziata e com'è finita: si indovina cosa è successo in mezzo. 'scegli': la risposta giusta è la
  // prima (vengono mescolate); 'ordina': i passaggi sono già nell'ordine giusto (vengono mescolati).
  blackbox: {
    tempo: 22,                              // secondi per scatola (il tempo di leggere inizio, fine e risposte)
    punti: 100, puntiOrdine: 150, bonusVelocita: 50,
    commenti: {
      giusta: ['Esatto. Visto che le cose non succedono per caso?', 'Brava testa.', 'Giusto. E tu come ci sei arrivato?'],
      sbagliata: ['No. Ma il bello è chiederselo.', 'Sbagliato, ma adesso lo sai.', 'Non proprio. Il mezzo è sempre la parte difficile.'],
    },
    scatole: [
      { tipo: 'scegli', inizio: 'Un bruco si chiude in un bozzolo.', fine: 'Una farfalla vola via.',
        r: ['Dentro la crisalide il suo corpo si trasforma', 'Il bruco si mangia una farfalla', 'Un bambino li scambia di nascosto'] },
      { tipo: 'scegli', inizio: 'Uva appena vendemmiata.', fine: 'Vino in bottiglia.',
        r: ['I lieviti trasformano lo zucchero in alcol', 'Si aggiunge alcol all\'uva', 'L\'uva resta al sole finché diventa vino'] },
      { tipo: 'scegli', inizio: 'Acqua di mare nelle saline.', fine: 'Sale sulla tavola.',
        r: ['Il sole fa evaporare l\'acqua e il sale resta', 'Il sale si pesca con le reti', 'L\'acqua gela e diventa sale'] },
      { tipo: 'scegli', inizio: 'Luce bianca che entra in un prisma.', fine: 'Un arcobaleno sul muro.',
        r: ['Ogni colore si piega in modo diverso e la luce si apre', 'Il prisma è dipinto a colori', 'Il muro riflette i colori della stanza'] },
      { tipo: 'scegli', inizio: 'Un lampo sopra il paese.', fine: 'Il tuono arriva qualche secondo dopo.',
        r: ['La luce viaggia molto più veloce del suono', 'Il tuono parte dopo il lampo', 'Il vento rallenta il tuono'] },
      { tipo: 'scegli', inizio: 'Alle 21 dici: "Stasera resto a casa".', fine: 'Alle 3 sei al circolo a giocare a biliardino.',
        r: ['Un messaggio: "solo una birra, dieci minuti"', 'Hai perso le chiavi di casa', 'Il circolo ti è venuto a prendere in macchina'] },
      { tipo: 'scegli', inizio: 'Giuri: "Mai più slot".', fine: 'Sei senza gettoni.',
        r: ['"Solo un gettone, per vedere se paga"', 'Qualcuno ti ha rubato i gettoni', 'La slot si è rotta e li ha mangiati'] },
      { tipo: 'scegli', inizio: 'Lunedì: "Da oggi dieta".', fine: 'Mercoledì: kebab con doppia salsa.',
        r: ['Una giornata storta e il volantino sul tavolo', 'Il kebab era in offerta per legge', 'La dieta finiva il mercoledì'] },
      { tipo: 'scegli', inizio: 'Un sasso cade in uno stagno.', fine: 'Cerchi arrivano fino a riva.',
        r: ['Le onde partono dal punto in cui è caduto', 'I pesci si spaventano e nuotano in tondo', 'Il vento disegna i cerchi'] },
      { tipo: 'ordina', inizio: 'Chicchi di caffè verdi.', fine: 'Un espresso al bancone di Nicola.',
        r: ['Si tostano', 'Si macinano', 'L\'acqua calda ci passa in pressione'] },
      { tipo: 'ordina', inizio: 'Un seme di grano sotto terra.', fine: 'Pane caldo.',
        r: ['Germoglia e cresce la spiga', 'I chicchi diventano farina', 'L\'impasto lievita e va in forno'] },
      { tipo: 'ordina', inizio: 'Litighi con un amico per una sciocchezza.', fine: 'Vi offrite da bere al bancone.',
        r: ['Ognuno resta sulle sue per giorni', 'Uno scrive: "ci vediamo al circolo?"', 'Una partita a biliardino rompe il ghiaccio'] },
      { tipo: 'ordina', inizio: 'Un\'idea alle 2 di notte.', fine: 'Un EP che esce.',
        r: ['La scrivi sulle note del telefono', 'La suoni finché non ti convince', 'Registri, mixi e rifai tutto tre volte'] },
      { tipo: 'ordina', inizio: 'Latte appena munto.', fine: 'Pecorino sardo stagionato.',
        r: ['Col caglio diventa cagliata', 'La forma si sala', 'Riposa per mesi in cantina'] },
    ],
  },

  // ------------------------------------------------------------------ Brano 4: tutti i giochi che riesci, in fila
  cometiva: {
    tempoBase: 8,                           // secondi per microgioco all'inizio...
    tempoMin: 5,                            // ...e alla fine (si accelera)
    lettura: 1.2,                           // secondi per leggere cosa fare prima che parta la barra del tempo
    punti: 100, bonusSerie: 15,
    kappa: ['Vai così!', 'Più veloce! Più veloce!', 'Sei una bestia!', 'Non ti fermare!', 'Che riflessi!'],
    colori: [['ROSSO', '#e0402a'], ['VERDE', '#2fa24a'], ['BLU', '#3a6ee8'], ['GIALLO', '#f2c230']],
  },

  // ------------------------------------------------------------------ Brano 5: mezzo pieno o mezzo vuoto?
  bicchiere: {
    scambi: [3, 8],                         // scambi al primo giro e al giro più difficile
    velocita: [0.7, 0.32],                  // secondi per scambio (all'inizio, alla fine)
    mostra: 3.6,                            // secondi per guardare i bicchieri prima che si mescolino
    giriAlMassimo: 5,
    punti: 100, bonusVelocita: 40,
    domande: ['Dov\'è il bicchiere mezzo pieno?', 'E quello mezzo vuoto?'],
    etichette: { pieno: 'Pieno', mezzoPieno: 'Mezzo pieno', mezzoVuoto: 'Mezzo vuoto' },
    zucco: ['Occhio, che Nicola è veloce.', 'Si gode.', 'Slow motion? No, stavolta no.', 'Si Godox.'],
  },

  // ------------------------------------------------------------------ finale: il giro del circolo
  spettacolo: {
    durata: 60,                             // un minuto, dal momento in cui ti siedi (se il quinto brano sta per finire e non ti
                                            // sei ancora seduto, Nicola ti accende una sigaretta e ti ci porta)
    raduno: 12,                             // secondi per mettersi in fila
    passo: [1.0, 6.5],                      // metri al secondo: camminata tranquilla all'inizio, corsa a perdifiato alla fine
    corsaDa: 0.25,                          // frazione del tempo dopo il raduno in cui si comincia ad accelerare
    // anello attorno al biliardo, dove non ci sono ostacoli (x verso est, z verso sud)
    anello: { x: [-2.3, 2.6], z: [0.1, 3.0], raggio: 0.7 },
    chi: ['Cronico', 'Rafka', 'Kappa', 'Zugo', 'Lyuce', 'Efisio', 'Tonino', 'Peppino', 'Gavino'],
    logo: 5,                                // secondi della scritta finale
  },
};

// ------------------------------------------------------------------ titolo di fine serata

// TODO(Simone): il titolo che il circolo ti dà a fine serata, in base ai punti. È la frase che finisce nello screenshot
// e nel testo da condividere, quindi è la voce del progetto: scrivila tu. `punti` è il totale; `brani` ha i punti di
// ogni brano ({ cinema, fumo, blackbox, cometiva, bicchiere }), se vuoi premiare chi è andato forte in uno solo.
// Deve restituire una stringa.
export function titoloDellaSerata(punti, brani) {
  return punti > 0 ? 'Socio del Circolo Vizioso' : 'Di passaggio';
}
