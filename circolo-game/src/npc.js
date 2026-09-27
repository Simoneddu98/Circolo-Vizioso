// Personaggi: animazione idle di ciascuno (clip indicata da userData.idle_clip nel glb), azioni una tantum
// (la versata del barista) e battute quando il giocatore si avvicina. Battute per ruolo (userData.npc_action):
// "serve" usa CONFIG.npcActions.serve, gli altri (anziani al tavolo) CONFIG.npc.
import * as THREE from 'three';

// Clip condivise tra più personaggi (gli anziani Meshy: esportate una volta, sulle ossa del primo). Il caricatore
// glTF rende unici i nomi dei nodi (mixamorigHips, mixamorigHips_1, ...): per ogni personaggio le tracce vengono
// rinominate sulle ossa del suo sottoalbero, confrontando il nome senza il suffisso _N. Copie create alla prima richiesta.
function retarget(npc, clips) {
  const local = new Map();
  npc.traverse((o) => { const base = o.name.replace(/_\d+$/, ''); if (!local.has(base)) local.set(base, o.name); });
  const names = new Set(local.values());
  const cache = new Map();
  return {
    get(name) {
      if (cache.has(name)) return cache.get(name);
      const clip = clips.get(name);
      let out = clip ?? null;
      if (clip && !clip.tracks.every((t) => names.has(THREE.PropertyBinding.parseTrackName(t.name).nodeName))) {
        out = clip.clone();
        for (const t of out.tracks) {
          const p = THREE.PropertyBinding.parseTrackName(t.name);
          const to = local.get(p.nodeName.replace(/_\d+$/, ''));
          if (to && to !== p.nodeName) t.name = `${to}.${p.propertyName}${p.propertyIndex ? `[${p.propertyIndex}]` : ''}`;
        }
      }
      cache.set(name, out);
      return out;
    },
  };
}

export class NPCManager {
  constructor(root, animations, config, ui) {
    this.cfg = config.npc;
    this.config = config;
    this.ui = ui;
    this.npcs = [];
    this.lastLine = new Map();
    this.lastTime = -Infinity;
    this.clock = 0;
    root.traverse((o) => { if (o.userData.npc === true) this.npcs.push(o); });
    this.npcs.sort((a, b) => a.name.localeCompare(b.name));
    const clips = new Map(animations.map((a) => [a.name, a]));
    let elder = 0;
    for (const o of this.npcs) {
      const role = config.npcActions[o.userData.npc_action];
      o.userData.lineSet = role ?? this.cfg;
      o.userData.displayName = o.userData.npc_name
        ? (role?.titleFormat ?? '{name}').replace('{name}', o.userData.npc_name)
        : (role ? role.names[0] : this.cfg.names[elder++ % this.cfg.names.length]);
      // Un'imbardata oltre ±90° letta dal glb può diventare (180°, y, 180°) negli angoli di Eulero: chi poi lo gira
      // cambiando solo rotation.y (routine, dialoghi) lo farebbe guardare dalla parte opposta. Si riscrive come sola
      // rotazione attorno all'asse verticale, ricavata dalla direzione in cui guarda davvero.
      const f = new THREE.Vector3(0, 0, 1).applyQuaternion(o.quaternion);
      o.rotation.set(0, Math.atan2(f.x, f.z), 0);
      o.userData.baseRotY = o.rotation.y;
      o.userData.phase = Math.random() * 10;
      o.userData.worldPos = o.getWorldPosition(new THREE.Vector3());
      const own = retarget(o, clips);
      const clip = own.get(o.userData.idle_clip);
      if (!clip) continue;
      const mixer = new THREE.AnimationMixer(o);
      const idle = mixer.clipAction(clip);
      idle.setLoop(THREE.LoopRepeat, Infinity).play();
      idle.time = Math.random() * clip.duration;        // ognuno respira e gioca per conto suo
      mixer.addEventListener('finished', (e) => {
        if (e.action === o.userData.anim.once) this._backToIdle(o);
      });
      o.userData.anim = { mixer, idle, once: null, clips: own };
    }
    this.animated = this.npcs.some((o) => o.userData.anim);
    for (const o of this.npcs) if ((this.cfg.hiddenUntilMinigame ?? []).includes(o.userData.npc_action)) o.visible = false;
  }

  // Suona una clip una volta (es. NPC_Barista_Pour) e torna all'idle. Restituisce la durata in secondi.
  playOnce(npc, clipName, fade = 0.3) {
    const a = npc.userData.anim;
    const clip = a?.clips.get(clipName);
    if (!clip) return 0;
    const act = a.mixer.clipAction(clip);
    act.reset().setLoop(THREE.LoopOnce, 1);
    act.clampWhenFinished = true;
    act.play();
    a.idle.crossFadeTo(act, fade, false);
    a.once = act;
    return clip.duration;
  }

  _backToIdle(npc, fade = 0.4) {
    const a = npc.userData.anim;
    if (!a?.once) return;
    a.idle.reset().play();
    a.once.crossFadeTo(a.idle, fade, false);
    a.once = null;
  }

  stopAction(npc) {
    const a = npc?.userData.anim;
    if (!a?.once) return;
    a.once.stop();
    a.once = null;
    a.idle.reset().setEffectiveWeight(1).play();
  }

  // Cambia la clip in loop (per esempio seduto -> in piedi); restituisce il nome della clip precedente
  // fade > 0: dissolvenza tra le due clip (per esempio seduto -> in piedi)
  setLoop(npc, clipName, timeScale = 1, fade = 0) {
    const a = npc.userData.anim;
    const clip = a?.clips.get(clipName);
    if (!clip) return null;
    const prev = a.idle.getClip().name;
    const act = a.mixer.clipAction(clip);
    if (act === a.idle) return prev;
    a.once?.stop(); a.once = null;
    act.reset().setLoop(THREE.LoopRepeat, Infinity).play();
    act.timeScale = timeScale;
    act.time = Math.random() * clip.duration;
    if (fade > 0) act.crossFadeFrom(a.idle, fade, false);
    else a.idle.stop();
    a.idle = act;
    return prev;
  }

  say(npc, text) {
    this.lastTime = this.clock;
    text = this.decorate?.(npc, text) ?? text;
    this.ui.subtitle(npc.userData.displayName, text, this.cfg.subtitleDuration);
  }

  update(dt, playerPos, talk = true) {
    this.clock += dt;
    for (const o of this.npcs) {
      if (o.userData.routine) o.getWorldPosition(o.userData.worldPos);   // chi si muove: posizione aggiornata per le battute
      const a = o.userData.anim;
      if (a) a.mixer.update(dt);
      else {                                   // nessuna clip: respiro e micro-rotazione del busto
        const t = this.clock + o.userData.phase;
        o.rotation.y = o.userData.baseRotY + Math.sin(t * 0.5) * this.cfg.idleSway;
        o.scale.y = 1 + Math.sin(t * 1.3) * 0.006;
      }
    }
    if (!talk || this.clock - this.lastTime < this.cfg.minPause) return;
    const near = this.npcs.filter((o) => {
      const p = o.userData.worldPos;
      const range = o.userData.lineSet.talkDistance ?? this.cfg.talkDistance;
      return o.visible && !o.userData.anim?.once && Math.hypot(p.x - playerPos.x, p.z - playerPos.z) <= range;
    });
    if (!near.length) return;
    const speaker = near[Math.floor(Math.random() * near.length)];   // parla uno a caso tra quelli vicini
    const lines = speaker.userData.lineSet.lines;
    const last = this.lastLine.get(lines) ?? -1;
    let i;
    do { i = Math.floor(Math.random() * lines.length); } while (i === last && lines.length > 1);
    this.lastLine.set(lines, i);
    this.say(speaker, lines[i]);
  }

  reset() {
    this.lastTime = -Infinity;
    for (const o of this.npcs) this.stopAction(o);
    this.ui.subtitle(null);
  }
}
