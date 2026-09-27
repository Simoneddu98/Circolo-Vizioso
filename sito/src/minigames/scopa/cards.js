// Facce delle carte napoletane disegnate su canvas: disegni originali, semplici e riconoscibili.
// Valore in piccolo negli angoli per la leggibilità; figure stilizzate (fante, cavallo, re).
import * as THREE from 'three';

const W = 160, H = 240;
const COL = { denari: '#c8962a', coppe: '#b3262e', spade: '#2b5aa8', bastoni: '#3f7a2e' };
const FIG = { 8: 'Fante', 9: 'Cavallo', 10: 'Re' };

function suitSymbol(g, suit, x, y, s) {
  g.save();
  g.translate(x, y);
  g.scale(s, s);
  g.lineWidth = 2;
  g.strokeStyle = '#3a2410';
  if (suit === 'denari') {                         // moneta con due anelli e un rombo
    g.fillStyle = COL.denari; g.beginPath(); g.arc(0, 0, 12, 0, Math.PI * 2); g.fill(); g.stroke();
    g.beginPath(); g.arc(0, 0, 7.5, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#9b3b1d'; g.beginPath(); g.moveTo(0, -4); g.lineTo(4, 0); g.lineTo(0, 4); g.lineTo(-4, 0); g.closePath(); g.fill();
  } else if (suit === 'coppe') {                   // coppa: calice, stelo, piede
    g.fillStyle = COL.coppe;
    g.beginPath(); g.moveTo(-11, -11); g.quadraticCurveTo(-10, 3, 0, 4); g.quadraticCurveTo(10, 3, 11, -11); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#e0b040'; g.fillRect(-2, 4, 4, 6); g.strokeRect(-2, 4, 4, 6);
    g.beginPath(); g.ellipse(0, 12, 8, 3, 0, 0, Math.PI * 2); g.fill(); g.stroke();
  } else if (suit === 'spade') {                   // spada in verticale
    g.fillStyle = '#c9d4e4';
    g.beginPath(); g.moveTo(0, -14); g.lineTo(3.5, -9); g.lineTo(3, 6); g.lineTo(-3, 6); g.lineTo(-3.5, -9); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = COL.spade; g.fillRect(-9, 6, 18, 3.5); g.strokeRect(-9, 6, 18, 3.5);
    g.fillStyle = '#6b4a22'; g.fillRect(-2, 9.5, 4, 5.5); g.beginPath(); g.arc(0, 16, 2.5, 0, Math.PI * 2); g.fill();
  } else {                                         // bastone nodoso in diagonale
    g.rotate(-0.5);
    g.fillStyle = '#7b5125';
    g.beginPath(); g.moveTo(-3, 14); g.lineTo(-4.5, -8); g.quadraticCurveTo(0, -16, 4.5, -8); g.lineTo(3, 14); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = COL.bastoni;
    for (const [px, py] of [[-5, -2], [5, 3], [-4, 8]]) { g.beginPath(); g.ellipse(px, py, 3.2, 1.8, 0.4, 0, Math.PI * 2); g.fill(); }
  }
  g.restore();
}

// posizioni dei semi per i valori da 1 a 7 (frazioni della carta)
const PIPS = {
  1: [[0.5, 0.5]], 2: [[0.5, 0.3], [0.5, 0.7]], 3: [[0.5, 0.25], [0.5, 0.5], [0.5, 0.75]],
  4: [[0.33, 0.3], [0.67, 0.3], [0.33, 0.7], [0.67, 0.7]], 5: [[0.33, 0.27], [0.67, 0.27], [0.5, 0.5], [0.33, 0.73], [0.67, 0.73]],
  6: [[0.33, 0.25], [0.67, 0.25], [0.33, 0.5], [0.67, 0.5], [0.33, 0.75], [0.67, 0.75]],
  7: [[0.33, 0.22], [0.67, 0.22], [0.5, 0.36], [0.33, 0.5], [0.67, 0.5], [0.33, 0.78], [0.67, 0.78]],
};

function figure(g, card) {
  const c = COL[card.suit];
  const cx = W / 2;
  g.fillStyle = '#f3e3c3'; g.fillRect(24, 40, W - 48, H - 80);
  g.strokeStyle = c; g.lineWidth = 2; g.strokeRect(24, 40, W - 48, H - 80);
  // corpo stilizzato: mantello a trapezio, testa, copricapo diverso per ogni figura
  g.fillStyle = c;
  g.beginPath(); g.moveTo(cx - 34, 178); g.lineTo(cx - 20, 108); g.lineTo(cx + 20, 108); g.lineTo(cx + 34, 178); g.closePath(); g.fill();
  g.fillStyle = '#e8c49a'; g.beginPath(); g.arc(cx, 92, 15, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#3a2410'; g.lineWidth = 1.5; g.stroke();
  g.fillStyle = '#3a2410'; g.fillRect(cx - 6, 90, 3, 3); g.fillRect(cx + 3, 90, 3, 3);
  if (card.rank === 10) {                          // re: corona
    g.fillStyle = '#e0b040';
    g.beginPath(); g.moveTo(cx - 15, 80); g.lineTo(cx - 15, 66); g.lineTo(cx - 7, 74); g.lineTo(cx, 62); g.lineTo(cx + 7, 74); g.lineTo(cx + 15, 66); g.lineTo(cx + 15, 80); g.closePath(); g.fill(); g.stroke();
  } else if (card.rank === 9) {                    // cavallo: testa di cavallo stilizzata accanto al cavaliere
    g.fillStyle = '#8a5a2b';
    g.beginPath(); g.moveTo(cx + 22, 150); g.lineTo(cx + 30, 118); g.lineTo(cx + 44, 112); g.lineTo(cx + 50, 124); g.lineTo(cx + 38, 128); g.lineTo(cx + 36, 150); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#3a2410'; g.fillRect(cx - 16, 72, 32, 7);
  } else {                                         // fante: berretto con piuma
    g.fillStyle = '#3a2410'; g.beginPath(); g.ellipse(cx, 78, 17, 6, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#e0b040'; g.lineWidth = 3; g.beginPath(); g.moveTo(cx + 10, 76); g.quadraticCurveTo(cx + 26, 60, cx + 20, 52); g.stroke();
  }
  suitSymbol(g, card.suit, cx, 146, 1.2);
  g.fillStyle = '#3a2410'; g.font = '600 15px Oswald, Arial Narrow, sans-serif'; g.textAlign = 'center';
  g.fillText(FIG[card.rank].toUpperCase(), cx, 196);
}

export function drawCard(card) {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#fbf4e4'; g.fillRect(0, 0, W, H);
  g.strokeStyle = COL[card.suit]; g.lineWidth = 6; g.strokeRect(5, 5, W - 10, H - 10);
  if (card.rank >= 8) figure(g, card);
  else for (const [fx, fy] of PIPS[card.rank]) suitSymbol(g, card.suit, fx * W, 36 + fy * (H - 72), card.rank === 1 ? 2.6 : 1.25);
  // valore negli angoli (e sotto, capovolto)
  g.fillStyle = COL[card.suit];
  g.font = '700 30px Oswald, Arial Narrow, sans-serif';
  g.textAlign = 'center';
  g.fillText(String(card.rank), 22, 38);
  g.save(); g.translate(W - 22, H - 38); g.rotate(Math.PI); g.fillText(String(card.rank), 0, 0); g.restore();
  return c;
}

export function drawBack() {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#7a1c22'; g.fillRect(0, 0, W, H);
  g.strokeStyle = '#e8d3a0'; g.lineWidth = 5; g.strokeRect(8, 8, W - 16, H - 16);
  g.strokeStyle = 'rgba(232,211,160,0.45)'; g.lineWidth = 1.5;
  for (let i = -H; i < W + H; i += 14) { g.beginPath(); g.moveTo(i, 14); g.lineTo(i + H, H - 14); g.stroke(); g.beginPath(); g.moveTo(i + H, 14); g.lineTo(i, H - 14); g.stroke(); }
  g.fillStyle = '#e8d3a0'; g.beginPath(); g.arc(W / 2, H / 2, 22, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#7a1c22'; g.font = '700 22px Oswald, sans-serif'; g.textAlign = 'center'; g.fillText('C', W / 2, H / 2 + 8);
  return c;
}

const tex = (canvas) => { const t = new THREE.CanvasTexture(canvas); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };

// Mesh di una carta: fronte e retro, faccia verso +Z nello spazio locale
export class CardFactory {
  constructor(size = [0.058, 0.09]) {
    this.geo = new THREE.PlaneGeometry(size[0], size[1]);
    this.back = new THREE.MeshStandardMaterial({ map: tex(drawBack()), roughness: 0.7 });
    this.faces = new Map();
  }
  make(card) {
    let m = this.faces.get(card.id);
    if (!m) { m = new THREE.MeshStandardMaterial({ map: tex(drawCard(card)), roughness: 0.65, emissive: 0x000000 }); this.faces.set(card.id, m); }
    const g = new THREE.Group();
    const front = new THREE.Mesh(this.geo, m.clone());
    front.material.map = m.map;
    const back = new THREE.Mesh(this.geo, this.back);
    back.rotation.y = Math.PI;
    front.userData.cardId = card.id;
    back.userData.cardId = card.id;
    g.add(front, back);
    g.userData = { card, front };
    return g;
  }
  dispose() {
    this.geo.dispose(); this.back.map.dispose(); this.back.dispose();
    for (const m of this.faces.values()) { m.map.dispose(); m.dispose(); }
  }
}
