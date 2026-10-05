// Audio del jukebox, tutto sintetizzato con Web Audio: metronomo e un battito leggero (cassa sul primo e terzo quarto,
// rullante sul secondo e quarto, charleston sugli ottavi) a bpm fissi. Se il brano ha un file audio (`audio` nella
// configurazione del lotto) parte quello al posto del battito e il metronomo si abbassa.
// Il tempo di gioco è l'orologio audio (ctx.currentTime): le note si disegnano e si giudicano su quello.

import { sbloccaAudio, riprovaAlTocco, audioMuto, suAudioMuto } from '../../audiosession.js';

export class Ritmo {
  constructor(cfg) {
    this.cfg = cfg;                                   // { bpm, audio?, audioOffset?, battute, muto? }
    const AC = globalThis.AudioContext ?? globalThis.webkitAudioContext;
    this.ctx = AC ? new AC() : null;
    sbloccaAudio(this.ctx);                            // iPhone: silenzioso e contesto sospeso
    this.t0 = 0;                                       // orologio audio dell'inizio del brano (beat 0)
    this.prossimo = -4;                                // prossimo quarto da programmare (partendo dal conto alla rovescia)
    this.timer = null;
    this.fonte = null;
    this.rumore = null;
    if (this.ctx) {
      const n = this.ctx.sampleRate * 0.5;
      this.rumore = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
      const d = this.rumore.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      this.master = this.ctx.createGain();
      this.master.gain.value = cfg.muto || audioMuto() ? 0 : 0.9; this.spegni = suAudioMuto((m) => { this.master.gain.value = cfg.muto || m ? 0 : 0.9; });          // muto: l'orologio audio corre lo stesso (per le prove)
      this.master.connect(this.ctx.destination);
    }
  }

  get ok() { return !!this.ctx; }
  get beatDur() { return 60 / this.cfg.bpm; }
  // secondi dall'inizio del brano, come li sente chi gioca (tolta la latenza di uscita)
  tempo(offset = 0) { return this.ctx.currentTime - (this.ctx.outputLatency || this.ctx.baseLatency || 0) - this.t0 - offset; }

  async inizia() {
    if (!this.ctx) return;
    sbloccaAudio(this.ctx);
    riprovaAlTocco(this.ctx);
    await Promise.race([this.ctx.resume(), new Promise((r) => setTimeout(r, 800))]);   // su iPhone resume() può non tornare mai
    this.t0 = this.ctx.currentTime + 0.25 + 4 * this.beatDur;      // quattro quarti di conto alla rovescia
    this.prossimo = -4;
    if (this.cfg.audio) this._avviaFile();
    this.timer = setInterval(() => this._programma(), 25);
    this._programma();
  }

  async _avviaFile() {
    try {
      const r = await fetch(this.cfg.audio);
      const buf = await this.ctx.decodeAudioData(await r.arrayBuffer());
      const s = this.ctx.createBufferSource();
      s.buffer = buf; s.connect(this.master);
      s.start(Math.max(this.ctx.currentTime, this.t0 + (this.cfg.audioOffset ?? 0)));
      this.fonte = s;
    } catch { this.cfg = { ...this.cfg, audio: null }; }           // il file non c'è: resta il battito
  }

  _programma() {
    const fine = (this.cfg.battute ?? 32) * 4 + 2;
    while (this.prossimo <= fine && this.t0 + this.prossimo * this.beatDur < this.ctx.currentTime + 0.2) {
      const b = this.prossimo, t = this.t0 + b * this.beatDur;
      const conto = b < 0;
      this._click(t, conto ? (b === -4 ? 1500 : 1000) : (b % 4 === 0 ? 1500 : 1000), conto ? 0.5 : (this.cfg.audio ? 0.12 : 0.2));
      if (!conto && !this.cfg.audio) {
        const k = ((b % 4) + 4) % 4;
        if (k === 0 || k === 2) this._cassa(t);
        if (k === 1 || k === 3) this._rullante(t);
        this._charleston(t + this.beatDur / 2, 0.05);
        this._charleston(t, 0.09);
      }
      this.prossimo++;
    }
  }

  _env(g, t, picco, dur) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(picco, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }

  _click(t, freq, vol) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = 'square'; o.frequency.value = freq;
    this._env(g, t, vol * 0.5, 0.05);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + 0.06);
  }

  _cassa(t) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    this._env(g, t, 0.9, 0.22);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + 0.25);
  }

  _rumore(t, dur, freq, tipo, vol) {
    const s = this.ctx.createBufferSource(), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
    s.buffer = this.rumore; f.type = tipo; f.frequency.value = freq;
    this._env(g, t, vol, dur);
    s.connect(f).connect(g).connect(this.master);
    s.start(t); s.stop(t + dur + 0.02);
  }

  _rullante(t) { this._rumore(t, 0.16, 1800, 'bandpass', 0.35); }
  _charleston(t, vol) { this._rumore(t, 0.05, 7000, 'highpass', vol); }

  // suono del colpo: una nota breve, più alta sulla corsia a destra; più bassa se la nota è mancata
  suona(lane, giudizio) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    const scala = [523.25, 587.33, 659.25, 783.99];
    o.type = giudizio === 'mancato' ? 'sawtooth' : 'triangle';
    o.frequency.value = giudizio === 'mancato' ? 110 : scala[lane] * (giudizio === 'perfetto' ? 2 : 1);
    this._env(g, t, giudizio === 'mancato' ? 0.12 : 0.22, giudizio === 'mancato' ? 0.12 : 0.18);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + 0.22);
  }

  pausa() { return this.ctx?.suspend(); }
  riprendi() { return this.ctx?.resume(); }

  ferma() {
    clearInterval(this.timer);
    this.spegni?.();
    try { this.fonte?.stop(); } catch { /* già fermo */ }
    if (this.ctx && this.ctx.state !== 'closed') this.ctx.close().catch(() => {});   // si può fermare due volte (fine partita, poi Esci)
  }
}
