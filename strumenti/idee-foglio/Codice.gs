// Circolo Vizioso — archivio delle idee della scatola nera ("La storia", capitolo 3) su un foglio Google.
// Da incollare in un progetto di Google Apps Script (script.google.com) e pubblicare come app web:
// istruzioni passo passo in LEGGIMI.md, nella stessa cartella.
//
// Il foglio si crea da solo la prima volta ("Circolo Vizioso — idee della scatola nera", nel tuo Drive), con le colonne
//   data | domanda | testo | visibile
// Per nascondere un'idea: metti FALSO nella colonna "visibile" (oppure cancella la riga).

const NOME = 'Circolo Vizioso — idee della scatola nera';
const MAX = 160;                 // caratteri massimi di un'idea (come nel gioco)
const ULTIME = 40;               // quante idee per domanda restituisce, le più recenti
const APPROVAZIONE = false;      // true = le nuove idee restano nascoste finché non metti VERO nella colonna "visibile"

// Da eseguire una volta dall'editor (menu Esegui): crea il foglio e chiede i permessi. Nel registro trovi il link.
function prepara() {
  const sh = foglio_();
  Logger.log('Foglio pronto: ' + sh.getParent().getUrl());
}

function foglio_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('FOGLIO');
  let ss = null;
  if (id) { try { ss = SpreadsheetApp.openById(id); } catch (err) { ss = null; } }
  if (!ss) {
    ss = SpreadsheetApp.create(NOME);
    props.setProperty('FOGLIO', ss.getId());
    const sh = ss.getSheets()[0];
    sh.setName('Idee');
    sh.appendRow(['data', 'domanda', 'testo', 'visibile']);
    sh.setFrozenRows(1);
    sh.setColumnWidth(3, 520);
  }
  return ss.getSheetByName('Idee');
}

// pulizia: niente link, niente spazi doppi, al massimo MAX caratteri; niente formule (un testo che inizia con = + - @
// verrebbe letto come formula dal foglio)
function pulisci_(t) {
  let s = String(t || '').replace(/https?:\/\/\S+/gi, '').replace(/\s+/g, ' ').trim().slice(0, MAX);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s;
}

function visibile_(v) {
  return !(v === false || String(v).toUpperCase() === 'FALSE' || String(v).toUpperCase() === 'FALSO');
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

// Lettura: ?domanda=<id> → [{ domanda, testo }] (le più recenti prima, solo quelle visibili)
function doGet(e) {
  const domanda = String((e && e.parameter && e.parameter.domanda) || '');
  const rows = foglio_().getDataRange().getValues().slice(1);
  const out = rows
    .filter((r) => r[2] && (!domanda || r[1] === domanda) && visibile_(r[3]))
    .slice(-ULTIME).reverse()
    .map((r) => ({ domanda: r[1], testo: String(r[2]).replace(/^'/, '') }));
  return json_(out);
}

// Scrittura: corpo JSON { domanda, testo } (il gioco lo manda come testo semplice)
function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    const d = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const domanda = String(d.domanda || '').slice(0, 40);
    const testo = pulisci_(d.testo);
    if (testo.length >= 3 && /^[a-z0-9_-]+$/i.test(domanda)) {
      foglio_().appendRow([new Date(), domanda, testo, !APPROVAZIONE]);
      return json_({ ok: true });
    }
    return json_({ ok: false });
  } finally {
    lock.releaseLock();
  }
}
