/* =====================================================================================
 * Interface du banc d'essai harness/audio.html (hors jeu livré) : un bouton par son, la
 * spatialisation, les sirènes attachées à des véhicules, le moteur piloté au régime, la foule
 * vivante, la météo, les événements de jeu et la voix — le tout sur un contexte de jeu factice.
 * ===================================================================================== */

import type { CrowdPhase, Person, SurfaceKind, Vehicle, VehicleKind, WeatherKind, Settings } from '@/core/contracts';
import { AUDIO_DEBUG_SERVICE, AUDIO_ENGINE_SERVICE, type AudioDebug, type EngineSound, type EngineSoundService } from '../api';
import { allSoundDefs } from '../catalog';
import { engineProfileFor, resolveRpm } from '../engineGraph';
import { createSystems } from '../index';
import { mulberry32 } from '../prng';
import type { AudioSystem } from '../system';
import { createFakeContext, type FakeContext } from './fakeContext';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, parent?: HTMLElement): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  Object.assign(e, props);
  if (parent) parent.appendChild(e);
  return e;
}

function section(parent: HTMLElement, title: string): HTMLElement {
  const s = el('section', {}, parent);
  el('h2', { textContent: title }, s);
  return s;
}

function slider(parent: HTMLElement, label: string, min: number, max: number, value: number, step: number, fmt: (v: number) => string, on: (v: number) => void): HTMLInputElement {
  const l = el('label', {}, parent);
  el('span', { textContent: label }, l);
  const input = el('input', { type: 'range', min: String(min), max: String(max), step: String(step), value: String(value) }, l);
  const out = el('output', { textContent: fmt(value) }, l);
  input.addEventListener('input', () => {
    const v = Number(input.value);
    out.textContent = fmt(v);
    on(v);
  });
  return input;
}

function select<T extends string>(parent: HTMLElement, label: string, options: readonly (readonly [T, string])[], value: T, on: (v: T) => void): HTMLSelectElement {
  const l = el('label', {}, parent);
  el('span', { textContent: label }, l);
  const s = el('select', {}, l);
  for (const [v, text] of options) el('option', { value: v, textContent: text }, s);
  s.value = value;
  el('output', {}, l);
  s.addEventListener('change', () => on(s.value as T));
  return s;
}

function check(parent: HTMLElement, label: string, value: boolean, on: (v: boolean) => void): HTMLInputElement {
  const l = el('label', {}, parent);
  el('span', { textContent: label }, l);
  const c = el('input', { type: 'checkbox', checked: value }, l);
  el('output', {}, l);
  c.addEventListener('change', () => on(c.checked));
  return c;
}

function button(parent: HTMLElement, text: string, on: (b: HTMLButtonElement) => void, sub?: string): HTMLButtonElement {
  const b = el('button', { type: 'button' }, parent);
  b.append(text);
  if (sub) el('small', { textContent: sub }, b);
  b.addEventListener('click', () => on(b));
  return b;
}

export interface Harness {
  fake: FakeContext;
  sys: AudioSystem;
  debug: AudioDebug;
  /** Niveau efficace mesuré en sortie du limiteur (0 si le contexte ne tourne pas). */
  level(): number;
}

export function mountHarness(left: HTMLElement, right: HTMLElement, stateEl: HTMLElement): Harness {
  const fake = createFakeContext(false);
  const { ctx, state } = fake;
  const sys = createSystems()[0] as AudioSystem;
  sys.provide!(ctx);
  void sys.init!(ctx);
  const debug = ctx.require<AudioDebug>(AUDIO_DEBUG_SERVICE);
  const engines = ctx.require<EngineSoundService>(AUDIO_ENGINE_SERVICE);
  const rnd = mulberry32(2024);

  const me = fake.addPerson('crs', 'police', 0, 0);
  me.isPlayer = true;
  state.player.personId = me.id;

  // ── source spatiale ──
  const src = { spatial: false, orbit: true, dist: 8, angle: 0.6, wall: false };
  const pos = (): { x: number; y: number; z: number } => ({ x: Math.sin(src.angle) * src.dist, y: 1.5, z: Math.cos(src.angle) * src.dist });
  const opts = (extra: { loop?: boolean } = {}): { x?: number; y?: number; z?: number; loop?: boolean } =>
    src.spatial ? { ...pos(), ...extra } : { ...extra };

  // ── un bouton par son ──
  const loops = new Map<string, { handle: number; btn: HTMLButtonElement }>();
  const groups = new Map<string, HTMLElement>();
  for (const d of allSoundDefs()) {
    let grid = groups.get(d.group);
    if (!grid) {
      const s = section(left, d.group);
      grid = el('div', { className: 'grid' }, s);
      groups.set(d.group, grid);
    }
    const b = button(grid, d.label, () => ctx.audio.play(d.id, opts()), d.id);
    b.dataset.sound = d.id;
    if (d.sustained) {
      const lb = button(grid, '∞ ' + d.label, (btn) => {
        const cur = loops.get(d.id);
        if (cur) {
          ctx.audio.stop(cur.handle, 0.3);
          loops.delete(d.id);
          btn.classList.remove('on');
        } else {
          loops.set(d.id, { handle: ctx.audio.play(d.id, opts({ loop: true })), btn });
          btn.classList.add('on');
        }
      }, 'boucle');
      lb.dataset.loop = d.id;
    }
  }

  // ── sortie ──
  const out = section(right, 'Sortie');
  const scope = el('canvas', { id: 'scope', width: 336, height: 150 }, out);
  const stats = el('pre', {}, out);
  const vol = (key: keyof Settings, label: string): void => {
    slider(out, label, 0, 1, state.settings[key] as number, 0.01, (v) => Math.round(v * 100) + ' %', (v) => ctx.settings.set(key, v as never));
  };
  vol('volumeMaster', 'Volume général');
  vol('volumeEffects', 'Effets');
  vol('volumeVoices', 'Voix');
  vol('volumeAmbience', 'Ambiance');
  check(out, 'Pause de session', false, (v) => ctx.session.pause(v));

  // ── spatialisation ──
  const sp = section(right, 'Source spatialisée');
  el('p', { className: 'hint', textContent: "Auditeur à l'origine, regard vers le sud (+z). Coché : les boutons jouent le son à la position de la source." }, sp);
  check(sp, 'Spatialiser', false, (v) => (src.spatial = v));
  check(sp, 'Source en orbite', true, (v) => (src.orbit = v));
  slider(sp, 'Distance', 1, 300, src.dist, 1, (v) => v + ' m', (v) => (src.dist = v));
  check(sp, 'Mur (occlusion)', false, (v) => {
    src.wall = v;
    // un mur carré autour de l'auditeur : toute source au-delà de 2 m est masquée
    state.walls = v ? [[-2, 2, 2, 2], [2, 2, 2, -2], [2, -2, -2, -2], [-2, -2, -2, 2]] : [];
  });
  slider(sp, 'Cap de l’auditeur', -180, 180, 0, 5, (v) => v + '°', (v) => (state.player.camYaw = (v * Math.PI) / 180));

  // ── sirènes ──
  const si = section(right, 'Sirènes (attachées à des véhicules)');
  const pass = { on: true };
  check(si, 'Passage à 60 km/h', true, (v) => (pass.on = v));
  const sirenRow = el('div', { className: 'row' }, si);
  const sirenCars: { v: Vehicle; lane: number }[] = [];
  const sirenDefs: [string, VehicleKind, 'police' | 'rescue' | 'medic', 1 | 2][] = [
    ['Police', 'voiture_police', 'police', 1], ['Pompiers', 'camion_pompiers', 'rescue', 1], ['SAMU', 'ambulance', 'medic', 1],
    ['Gendarmerie', 'centaure', 'police', 1], ['Hurleur', 'voiture_police', 'police', 2],
  ];
  sirenDefs.forEach(([label, kind, faction, mode], i) => {
    const v = fake.addVehicle(kind, faction, -100, 10 + i * 4);
    sirenCars.push({ v, lane: 10 + i * 4 });
    const b = button(sirenRow, label, (btn) => {
      v.siren = v.siren === 0 ? mode : 0;
      btn.classList.toggle('on', v.siren !== 0);
      ctx.events.emit('vehicle:siren', { id: v.id, siren: v.siren });
    });
    b.dataset.siren = label;
  });
  const horn = fake.addVehicle('voiture', 'civil', 4, 9);
  button(sirenRow, 'Klaxon (maintenu)', (btn) => {
    horn.cmd.horn = !horn.cmd.horn;
    btn.classList.toggle('on', horn.cmd.horn);
  });
  const canon = fake.addVehicle('canon_eau', 'police', -6, 12);
  const water = { on: false };
  button(sirenRow, 'Canon à eau (tir tenu)', (btn) => {
    water.on = !water.on;
    btn.classList.toggle('on', water.on);
  });

  // ── moteur ──
  const mo = section(right, 'Moteur piloté (service audio.engine)');
  const motor = { kind: 'voiture' as VehicleKind, rpm: 0.1, load: 0.2, sound: null as EngineSound | null, sweep: -1 };
  const car = fake.addVehicle('voiture', 'police', 3, 5);
  const rpmLabel = (v: number): string => Math.round(resolveRpm(v, engineProfileFor(motor.kind))) + ' tr/min';
  select<VehicleKind>(mo, 'Véhicule', [
    ['voiture', 'Voiture (essence)'], ['fourgon_crs', 'Fourgon (diesel)'], ['car_crs', 'Car / poids lourd'],
    ['moto_bravm', 'Moto'], ['scooter', 'Scooter'], ['drone', 'Drone'], ['helicoptere', 'Hélicoptère'],
  ], 'voiture', (v) => {
    motor.kind = v;
    car.kind = v;
    if (motor.sound) {
      motor.sound.dispose();
      motor.sound = engines.create(car.id);
    }
  });
  const rpmInput = slider(mo, 'Régime', 0, 1, motor.rpm, 0.005, rpmLabel, (v) => (motor.rpm = v));
  rpmInput.id = 'rpm';
  slider(mo, 'Charge', 0, 1, motor.load, 0.01, (v) => Math.round(v * 100) + ' %', (v) => (motor.load = v));
  const moRow = el('div', { className: 'row' }, mo);
  const motorBtn = button(moRow, 'Démarrer / couper', (btn) => {
    if (motor.sound) {
      motor.sound.dispose();
      motor.sound = null;
    } else {
      motor.sound = engines.create(car.id);
    }
    btn.classList.toggle('on', motor.sound !== null);
  });
  motorBtn.id = 'motor';
  button(moRow, 'Accélération', () => (motor.sweep = 0));

  // ── foule ──
  const cr = section(right, 'Foule vivante');
  const crowd = { count: 0, anger: 0.1, fear: 0, dist: 0, people: [] as Person[] };
  slider(cr, 'Manifestants', 0, 200, 0, 1, (v) => String(v), (v) => (crowd.count = v)).id = 'crowd-count';
  slider(cr, 'Colère', 0, 1, crowd.anger, 0.01, (v) => v.toFixed(2), (v) => (crowd.anger = v)).id = 'crowd-anger';
  slider(cr, 'Peur', 0, 1, 0, 0.01, (v) => v.toFixed(2), (v) => (crowd.fear = v)).id = 'crowd-fear';
  slider(cr, 'Tension', 0, 1, 0, 0.01, (v) => v.toFixed(2), (v) => (state.director.tension = v));
  slider(cr, 'Distance du cortège', 0, 150, 0, 1, (v) => v + ' m', (v) => (crowd.dist = v));
  const phases: CrowdPhase[] = ['aucune', 'rassemblement', 'depart', 'cortege', 'tension', 'affrontement', 'dispersion', 'apres_manif', 'terminee'];
  select<CrowdPhase>(cr, 'Phase', phases.map((p) => [p, p] as const), 'aucune', (v) => (state.director.phase = v)).id = 'crowd-phase';
  const crRow = el('div', { className: 'row' }, cr);
  const slogans = ['Tous ensemble, tous ensemble, ouais !', 'On ne lâche rien !', 'Résistance ! Résistance !', 'La rue, elle est à nous !'];
  let sloganIndex = 0;
  button(crRow, 'Slogan (crowd:chant)', () => {
    ctx.events.emit('crowd:chant', { x: 0, z: crowd.dist, text: slogans[sloganIndex++ % slogans.length]!, intensity: 0.9 });
  }).id = 'chant';
  const mixEl = el('pre', {}, cr);

  // ── météo, heure ──
  const we = section(right, 'Ville et météo');
  slider(we, 'Heure', 0, 24, state.env.timeOfDay, 0.25, (v) => v.toFixed(2).replace('.', ' h ').replace(' h 25', ' h 15').replace(' h 50', ' h 30').replace(' h 75', ' h 45').replace(' h 00', ' h'), (v) => (state.env.timeOfDay = v));
  slider(we, 'Pluie', 0, 1, 0, 0.01, (v) => v.toFixed(2), (v) => {
    state.env.rain = v;
    state.env.wetness = v;
  }).id = 'rain';
  slider(we, 'Vent', 0, 20, 0, 0.5, (v) => v + ' m/s', (v) => (state.env.windX = v));
  select<WeatherKind>(we, 'Temps', [['clair', 'clair'], ['pluie', 'pluie'], ['orage', 'orage (tonnerre)']], 'clair', (v) => (state.env.weather = v));

  // ── pas ──
  const fo = section(right, 'Pas du joueur');
  const walk = { on: false, speed: 1.4 };
  check(fo, 'Le joueur marche', false, (v) => (walk.on = v)).id = 'walk';
  select(fo, 'Allure', [['1.4', 'marche'], ['3.6', 'course'], ['6', 'sprint']] as const, '1.4', (v) => (walk.speed = Number(v)));
  const surfaces: SurfaceKind[] = ['road', 'sett', 'gravel', 'park', 'water'];
  select<SurfaceKind>(fo, 'Sol', surfaces.map((s) => [s, s] as const), 'road', (v) => (state.surface = () => v));

  // ── événements de jeu ──
  const evs = section(right, 'Événements de jeu');
  const evRow = el('div', { className: 'row' }, evs);
  const here = (): { x: number; y: number; z: number } => (src.spatial ? pos() : { x: 0, y: 1.5, z: 6 });
  const shop = fake.addShop(0, 8);
  const shield = fake.addPerson('crs', 'police', 1, 5);
  shield.inventory.push({ id: 'bouclier', count: 1, state: 1, cooldown: 0 });
  shield.active = 0;
  shield.alt = true;
  const victim = fake.addPerson('manifestant', 'protest', -2, 6);
  const ev = (label: string, fn: () => void): void => {
    button(evRow, label, fn).dataset.event = label;
  };
  ev('Explosion GM2L', () => ctx.events.emit('explosion', { kind: 'gm2l', ...here(), radius: 8, sourceId: 0 }));
  ev('Désencerclement', () => ctx.events.emit('explosion', { kind: 'desencerclement', ...here(), radius: 10, sourceId: 0 }));
  ev('Mortier', () => ctx.events.emit('explosion', { kind: 'mortier', ...here(), radius: 6, sourceId: 0 }));
  ev('Véhicule', () => ctx.events.emit('explosion', { kind: 'vehicule', ...here(), radius: 12, sourceId: 0 }));
  ev('Pavé → bouclier', () => ctx.events.emit('projectile:impact', { id: 1, kind: 'pave', ownerId: 0, x: shield.x, y: 1.2, z: shield.z, hitKind: 'person', hitId: shield.id }));
  ev('Pavé → sol', () => ctx.events.emit('projectile:impact', { id: 1, kind: 'pave', ownerId: 0, ...here(), hitKind: 'ground', hitId: 0 }));
  ev('Bouteille', () => ctx.events.emit('projectile:impact', { id: 1, kind: 'bouteille', ownerId: 0, ...here(), hitKind: 'ground', hitId: 0 }));
  ev('Molotov', () => {
    const p = here();
    ctx.events.emit('projectile:impact', { id: 1, kind: 'molotov', ownerId: 0, ...p, hitKind: 'ground', hitId: 0 });
    ctx.events.emit('fire:started', { x: p.x, z: p.z, targetKind: 'ground', targetId: 0, sourceId: 0 });
  });
  ev('Feu éteint', () => {
    const p = here();
    ctx.events.emit('fire:out', { x: p.x, z: p.z, targetKind: 'ground', targetId: 0, byId: 0 });
  });
  ev('Vitrine brisée', () => ctx.events.emit('shop:window', { id: shop.id, state: 'broken', byId: 0 }));
  ev('Rideau de fer', () => ctx.events.emit('shop:shutter', { id: shop.id, closed: true }));
  ev('Collision', () => ctx.events.emit('vehicle:collision', { vehicleId: car.id, otherKind: 'vehicle', otherId: 0, speed: 9, x: 3, z: 6 }));
  ev('Blessé (coup)', () => ctx.events.emit('person:hurt', { id: victim.id, info: { amount: 18, kind: 'blunt', sourceId: 0, x: victim.x, z: victim.z }, healthAfter: 70 }));
  ev('Blessé (gaz)', () => ctx.events.emit('person:hurt', { id: victim.id, info: { amount: 1, kind: 'gas', sourceId: 0, x: victim.x, z: victim.z }, healthAfter: 95 }));
  ev('Étourdi 4 s', () => (me.stun = 4));

  // ── voix ──
  const vo = section(right, 'Voix (synthèse vocale du navigateur)');
  check(vo, 'Synthèse vocale', state.settings.voiceSynthesis, (v) => ctx.settings.set('voiceSynthesis', v));
  const text = el('input', { type: 'text', value: 'Alpha 1 de Autorité, tenez la ligne à hauteur de la place.' }, vo);
  text.style.width = '100%';
  const voRow = el('div', { className: 'row' }, vo);
  let voiceIndex = 0;
  button(voRow, 'Message radio', () => ctx.events.emit('radio:message', { msg: { channel: 'unite', from: 'Autorité', text: text.value, priority: 1, voice: voiceIndex++ }, t: 0 })).id = 'radio';
  button(voRow, 'Sommation (mégaphone)', () => ctx.events.emit('law:sommation', {
    stage: 2, byId: 3, x: 0, z: 14, text: 'Première sommation : on va faire usage de la force. Quittez immédiatement les lieux.',
  })).id = 'sommation';
  button(voRow, 'speak() simple', () => ctx.audio.speak(text.value, { voice: voiceIndex++ }));
  const voiceInfo = el('pre', {}, vo);

  // ── boucle ──
  const g2 = scope.getContext('2d')!;
  let spectrum: Uint8Array<ArrayBuffer> | null = null;
  let wave: Float32Array<ArrayBuffer> | null = null;
  let last = performance.now();
  let lastLevel = 0;
  let waterAt = 0;

  const syncCrowd = (): void => {
    while (crowd.people.length < crowd.count) {
      const p = fake.addPerson('manifestant', 'protest', 0, 0);
      const a = rnd() * Math.PI * 2;
      const r = 14 * Math.sqrt(rnd());
      p.brain = { ox: Math.sin(a) * r, oz: Math.cos(a) * r };
      crowd.people.push(p);
    }
    while (crowd.people.length > crowd.count) {
      const p = crowd.people.pop()!;
      state.people.splice(state.people.indexOf(p), 1);
    }
    for (const p of crowd.people) {
      const o = p.brain as { ox: number; oz: number };
      p.x = o.ox;
      p.z = crowd.dist + o.oz;
      p.anger = crowd.anger;
      p.fear = crowd.fear;
    }
  };

  const tick = (): void => {
    const now = performance.now();
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (src.orbit) src.angle += dt * 0.7;
    // boucles lancées à la main : elles suivent la source
    // véhicules à sirène : passage en ligne droite devant l'auditeur
    for (const c of sirenCars) {
      const v = c.v;
      if (pass.on) {
        v.vx = 16.7;
        v.x += v.vx * dt;
        if (v.x > 140) v.x = -140;
      } else {
        v.vx = 0;
        v.x = 0;
      }
      v.z = c.lane;
    }
    me.vx = walk.on ? walk.speed : 0;
    me.stun = Math.max(0, me.stun - dt);
    if (motor.sweep >= 0) {
      motor.sweep += dt;
      const u = motor.sweep / 5;
      motor.rpm = u < 0.7 ? 0.08 + 0.9 * (u / 0.7) : 0.98 - 0.9 * ((u - 0.7) / 0.3);
      motor.load = u < 0.7 ? 1 : 0;
      rpmInput.value = String(motor.rpm);
      rpmInput.dispatchEvent(new Event('input'));
      if (u >= 1) motor.sweep = -1;
    }
    if (motor.sound) {
      motor.sound.setRpm(motor.rpm);
      motor.sound.setLoad(motor.load);
      motor.sound.setPosition(car.x, 0.8, car.z);
    }
    if (water.on && now > waterAt) {
      waterAt = now + 150;
      ctx.events.emit('vehicle:turret_fired', { id: canon.id, turret: 0, byId: 0 });
    }
    syncCrowd();
    sys.frame!(dt);

    // affichage
    const an = debug.analyser();
    g2.fillStyle = '#05070b';
    g2.fillRect(0, 0, scope.width, scope.height);
    if (an) {
      if (!spectrum || spectrum.length !== an.frequencyBinCount) {
        spectrum = new Uint8Array(an.frequencyBinCount);
        wave = new Float32Array(an.fftSize);
      }
      an.getByteFrequencyData(spectrum);
      an.getFloatTimeDomainData(wave!);
      g2.fillStyle = '#c9517a';
      const n = spectrum.length;
      for (let x = 0; x < scope.width; x++) {
        // axe des fréquences logarithmique
        const bin = Math.min(n - 1, Math.floor(Math.pow(n, x / scope.width)));
        const h = (spectrum[bin]! / 255) * scope.height;
        g2.fillRect(x, scope.height - h, 1, h);
      }
      g2.strokeStyle = '#7fd4ff';
      g2.beginPath();
      let sum = 0;
      for (let x = 0; x < scope.width; x++) {
        const v = wave![Math.floor((x / scope.width) * wave!.length)]!;
        const y = scope.height * 0.3 - v * scope.height * 0.28;
        if (x === 0) g2.moveTo(x, y);
        else g2.lineTo(x, y);
      }
      for (let i = 0; i < wave!.length; i++) sum += wave![i]! * wave![i]!;
      lastLevel = Math.sqrt(sum / wave!.length);
      g2.stroke();
    }
    const s = debug.stats();
    stateEl.textContent = `contexte : ${s.state} · ${s.real} voix réelles / ${s.capacity} · ${s.virtual} virtuelles · ${s.sampleRate} Hz`;
    stats.textContent = `joués ${s.played} · écartés ${s.dropped} · niveau ${lastLevel.toFixed(3)}\n` + debug.voices().slice(0, 14).join('\n');
    const m = debug.crowdMix();
    mixEl.textContent =
      `présence ${m.presence.toFixed(2)}  murmure ${m.murmur.toFixed(2)}  slogans ${m.chant.toFixed(2)}\n` +
      `huées ${m.boo.toFixed(2)}  sifflets ${m.whistle.toFixed(2)}  panique ${m.panic.toFixed(2)}  tambours ${m.drums.toFixed(2)}`;
    const si2 = debug.speech();
    voiceInfo.textContent = `synthèse ${si2.supported ? 'disponible' : 'absente'} · voix françaises : ${si2.frenchVoices} · en file : ${si2.queued}${si2.speaking ? ' · en cours' : ''}`;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  return { fake, sys, debug, level: () => lastLevel };
}
