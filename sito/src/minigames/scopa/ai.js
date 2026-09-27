// Avversario della scopa (Peppino): valuta ogni giocata legale con un punteggio euristico.
// Prende il settebello e fa scopa appena può, preferisce denari e sette, evita di lasciare in tavola una somma
// da 1 a 10 (scopa servita all'avversario) e, se non può prendere, scarica la carta meno preziosa.

const W = { card: 1, denaro: 2, seven: 3, settebello: 25, scopa: 30, give: 22, keepSeven: 4 };

function cardValue(c) {
  return W.card + (c.suit === 'denari' ? W.denaro : 0) + (c.rank === 7 ? W.seven : 0) + (c.id === '7D' ? W.settebello : 0);
}

export function evaluate(game, move) {
  const { card, take } = move;
  const lastPlay = game.deck.length === 0 && game.hands[0].length + game.hands[1].length === 1;
  let s = 0;
  let after;
  if (take.length) {
    s += cardValue(card) + take.reduce((a, c) => a + cardValue(c), 0);
    const ids = new Set(take.map((c) => c.id));
    after = game.table.filter((c) => !ids.has(c.id));
    if (!after.length && !lastPlay) s += W.scopa;
  } else {
    s -= cardValue(card);
    if (card.rank === 7) s -= W.keepSeven;
    after = [...game.table, card];
  }
  // tavola che l'avversario può svuotare con una carta sola
  const sum = after.reduce((a, c) => a + c.rank, 0);
  if (after.length && sum <= 10 && !lastPlay) s -= W.give;
  // lasciare in tavola denari o sette li espone
  s -= after.filter((c) => c.rank === 7 || c.suit === 'denari').length * 0.5;
  return s;
}

// difficulty: 'facile' sbaglia la scelta migliore nel 30% dei casi
export function chooseMove(game, { difficulty = 'normale', rng = Math.random } = {}) {
  const moves = game.legalMoves();
  const scored = moves.map((m) => ({ m, s: evaluate(game, m) })).sort((a, b) => b.s - a.s);
  let pick = scored[0];
  if (difficulty === 'facile' && scored.length > 1 && rng() < 0.3) pick = scored[1 + Math.floor(rng() * (scored.length - 1))];
  const opts = game.options(pick.m.card.id);
  const key = (arr) => arr.map((c) => c.id).sort().join();
  const optionIndex = opts.length ? opts.findIndex((o) => key(o) === key(pick.m.take)) : 0;
  return { cardId: pick.m.card.id, optionIndex, take: pick.m.take, score: pick.s };
}
