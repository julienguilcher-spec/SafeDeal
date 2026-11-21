import { beforeEach, describe, expect, it } from 'vitest';
import { SystemOrder } from '@/core/contracts';
import { AUDIO_DEBUG_SERVICE, AUDIO_ENGINE_SERVICE, createSystems, type AudioDebug, type EngineSoundService } from '@/audio';
import { createFakeContext, type FakeContext } from '@/audio/dev/fakeContext';
import { FakeAudioContext } from '@/audio/dev/fakeWebAudio';
import type { AudioSystem } from '@/audio/system';
import { MAX_VOICES } from '@/audio/voicePool';

interface Rig {
  fake: FakeContext;
  sys: AudioSystem;
  ac: FakeAudioContext;
  debug: AudioDebug;
  /** Avance le temps (contexte audio + système) par pas de 50 ms. */
  run(seconds: number): void;
  voices(): string[];
  has(id: string, real?: boolean): boolean;
}

/** Système audio branché sur un contexte de jeu factice et un faux contexte WebAudio. */
function rig(): Rig {
  const fake = createFakeContext(false);
  const sys = createSystems()[0] as AudioSystem;
  sys.provide(fake.ctx);
  sys.init(fake.ctx);
  // sous Node il n'y a pas de fenêtre : on branche le moteur à la main sur le faux contexte
  const ac = new FakeAudioContext();
  sys.engine.disabled = false;
  sys.engine.attach(ac.asContext());
  const debug = fake.ctx.require<AudioDebug>(AUDIO_DEBUG_SERVICE);
  const voices = (): string[] => debug.voices();
  return {
    fake, sys, ac, debug, voices,
    run(seconds: number): void {
      for (let t = 0; t < seconds - 1e-9; t += 0.05) {
        ac.advance(0.05);
        sys.frame(0.05);
      }
    },
    has: (id, real) => voices().some((v) => v.includes(` ${id}`) && (real === undefined || v.startsWith(real ? '●' : '○'))),
  };
}

describe('système audio : branchement', () => {
  it('createSystems retourne un système d’ordre AUDIO qui publie ctx.audio et ses services', () => {
    const systems = createSystems();
    expect(systems.length).toBe(1);
    expect(systems[0]!.order).toBe(SystemOrder.AUDIO);
    expect(systems[0]!.id).toBe('audio');
    const fake = createFakeContext(true);
    const before = fake.ctx.audio;
    systems[0]!.provide!(fake.ctx);
    expect(fake.ctx.audio).not.toBe(before);
    expect(fake.ctx.service<EngineSoundService>(AUDIO_ENGINE_SERVICE)).toBeDefined();
    expect(fake.ctx.service<AudioDebug>(AUDIO_DEBUG_SERVICE)).toBeDefined();
  });

  it('en mode headless tout est inerte et rien ne lève d’exception', () => {
    const fake = createFakeContext(true);
    const sys = createSystems()[0]!;
    sys.provide!(fake.ctx);
    sys.init!(fake.ctx);
    const a = fake.ctx.audio;
    expect(a.play('detonation', { x: 1, z: 2 })).toBe(0);
    expect(a.play('sirene_police', { loop: true })).toBe(0);
    a.stop(12);
    a.speak('Bonjour', { radio: true });
    a.setListener(0, 0, 0, 0);
    fake.ctx.events.emit('explosion', { kind: 'gm2l', x: 0, y: 0, z: 0, radius: 8, sourceId: 0 });
    fake.ctx.events.emit('radio:message', { msg: { channel: 'unite', from: 'A', text: 'Reçu', priority: 1 }, t: 0 });
    const e = fake.ctx.require<EngineSoundService>(AUDIO_ENGINE_SERVICE).create(5);
    e.setRpm(2000);
    e.setLoad(1);
    e.setPosition(0, 0, 0);
    e.dispose();
    sys.reset!();
    sys.dispose!();
    expect(fake.ctx.require<AudioDebug>(AUDIO_DEBUG_SERVICE).stats().real).toBe(0);
  });
});

describe('moteur : lecture, boucles, réserve', () => {
  let r: Rig;
  beforeEach(() => {
    r = rig();
  });

  it('un son ponctuel devient une voix réelle puis disparaît à la fin', () => {
    const h = r.fake.ctx.audio.play('ui_valide');
    expect(h).toBeGreaterThan(0);
    expect(r.debug.stats().real).toBe(1);
    expect(r.has('ui_valide', true)).toBe(true);
    r.run(1);
    expect(r.has('ui_valide')).toBe(false);
    expect(r.sys.engine.alive(h)).toBe(false);
  });

  it('un son inconnu est signalé une fois et ignoré', () => {
    const errors: unknown[] = [];
    const orig = console.error;
    console.error = (...a: unknown[]) => errors.push(a);
    try {
      expect(r.fake.ctx.audio.play('son_qui_n_existe_pas')).toBe(0);
      expect(r.fake.ctx.audio.play('son_qui_n_existe_pas')).toBe(0);
    } finally {
      console.error = orig;
    }
    expect(errors.length).toBe(1);
  });

  it('stop() coupe une boucle', () => {
    const h = r.fake.ctx.audio.play('sirene_police', { loop: true });
    expect(r.has('sirene_police', true)).toBe(true);
    r.run(2);
    expect(r.has('sirene_police', true)).toBe(true);
    r.fake.ctx.audio.stop(h, 0.1);
    expect(r.has('sirene_police')).toBe(false);
  });

  it('un son ponctuel hors de portée n’est pas joué ; une boucle hors de portée reste virtuelle puis démarre quand on s’approche', () => {
    expect(r.fake.ctx.audio.play('pas', { x: 500, z: 0 })).toBe(0);
    const h = r.fake.ctx.audio.play('feu', { x: 400, z: 0, loop: true });
    expect(h).toBeGreaterThan(0);
    r.run(0.5);
    expect(r.has('feu', false)).toBe(true);
    r.fake.state.camera!.camX = 395;
    r.run(0.5);
    expect(r.has('feu', true)).toBe(true);
    r.fake.state.camera!.camX = 0;
    r.run(0.5);
    expect(r.has('feu', false)).toBe(true);
  });

  it('ne dépasse jamais 32 voix réelles ; les sons les plus lointains sont écartés', () => {
    const kinds = ['petard', 'impact_sol', 'tole', 'verre_brise', 'cri', 'sifflet', 'tambour', 'coup_baton', 'impact_bouclier', 'collision', 'rideau_fer', 'molotov'];
    const near: number[] = [];
    const far: number[] = [];
    for (let i = 0; i < 72; i++) {
      // 6 exemplaires de chaque son : 3 proches (3 m), 3 lointains (30 m)
      const close = i % 2 === 0;
      const d = close ? 3 : 30;
      const h = r.fake.ctx.audio.play(kinds[i % 12]!, { x: Math.sin(i) * d, z: Math.cos(i) * d });
      (close ? near : far).push(h);
    }
    expect(r.debug.stats().real).toBe(MAX_VOICES);
    const alive = (hs: number[]): number => hs.filter((h) => h > 0 && r.sys.engine.alive(h)).length;
    expect(alive(near)).toBe(36);
    expect(alive(far)).toBeLessThan(alive(near));
  });

  it('un son prioritaire (sirène) prend la place d’un son ordinaire quand la réserve est pleine', () => {
    const kinds = ['petard', 'impact_sol', 'tole', 'verre_brise', 'cri', 'sifflet', 'tambour', 'coup_baton'];
    for (let i = 0; i < 60; i++) r.fake.ctx.audio.play(kinds[i % 8]!, { x: Math.sin(i) * 3, z: Math.cos(i) * 3 });
    expect(r.debug.stats().real).toBe(MAX_VOICES);
    r.fake.ctx.audio.play('sirene_police', { x: 60, z: 0, loop: true });
    expect(r.has('sirene_police', true)).toBe(true);
    expect(r.debug.stats().real).toBe(MAX_VOICES);
  });

  it('fusionne deux demandes identiques au même endroit au même instant', () => {
    const a = r.fake.ctx.audio.play('verre_brise', { x: 5, z: 5 });
    const b = r.fake.ctx.audio.play('verre_brise', { x: 5.5, z: 5 });
    const c = r.fake.ctx.audio.play('verre_brise', { x: 25, z: 5 });
    expect(b).toBe(a);
    expect(c).not.toBe(a);
  });

  it('une source masquée par un mur est assourdie et atténuée', () => {
    const eng = r.sys.engine;
    const open = eng.play('sirene_police', { x: 0, z: 30, loop: true });
    r.run(1);
    const gOpen = r.voices().find((v) => v.includes('sirene_police'))!;
    r.fake.state.walls = [[-50, 10, 50, 10]];
    r.run(2);
    const gHidden = r.voices().find((v) => v.includes('sirene_police'))!;
    const gain = (s: string): number => Number(/g([0-9.]+)/.exec(s)![1]);
    expect(gain(gHidden)).toBeLessThan(gain(gOpen) * 0.6);
    eng.stop(open);
  });

  it('les réglages de volume pilotent les bus ; le monde se tait en pause', () => {
    const before = r.ac.gains.map((g) => g.gain.value);
    r.fake.ctx.settings.set('volumeMaster', 0);
    const after = r.ac.gains.map((g) => g.gain.value);
    expect(after).not.toEqual(before);
    expect(after.filter((v) => v === 0).length).toBeGreaterThan(before.filter((v) => v === 0).length);
    // pause : le niveau « monde » tombe à zéro
    const zerosPlaying = r.ac.gains.filter((g) => g.gain.value === 0).length;
    r.fake.ctx.session.pause(true);
    r.run(0.2);
    expect(r.ac.gains.filter((g) => g.gain.value === 0).length).toBeGreaterThan(zerosPlaying);
  });

  it('des valeurs non finies ne parviennent jamais à WebAudio', () => {
    // le faux contexte lève une exception à la moindre valeur non finie programmée
    const a = r.fake.ctx.audio;
    expect(a.play('petard', { x: Number.NaN, z: 3 })).toBeGreaterThan(0); // joué sans spatialisation
    expect(a.play('tole', { x: 2, z: 2, volume: Number.NaN, pitch: Number.POSITIVE_INFINITY })).toBeGreaterThan(0);
    const h = a.play('sirene_police', { x: 5, y: Number.NaN, z: 5, loop: true });
    r.sys.engine.setVoicePosition(h, Number.NaN, 0, 0);
    r.sys.engine.setVoiceVelocity(h, Number.NaN, 0);
    r.sys.engine.setVoiceVolume(h, Number.NaN);
    a.setListener(Number.NaN, 0, 0, 0);
    r.fake.state.camera = null;
    r.run(0.5);
    expect(r.has('sirene_police', true)).toBe(true);
    expect(r.sys.engine.lx).toBe(0);
  });

  it('reset() arrête tous les sons du monde', () => {
    r.fake.ctx.audio.play('sirene_police', { loop: true });
    r.fake.ctx.audio.play('feu', { x: 2, z: 2, loop: true });
    r.run(0.3);
    r.sys.reset();
    expect(r.debug.stats().real + r.debug.stats().virtual).toBe(0);
  });
});

describe('câblage par événements', () => {
  let r: Rig;
  beforeEach(() => {
    r = rig();
  });

  it("'sfx' joue le son demandé", () => {
    r.fake.ctx.events.emit('sfx', { id: 'menottes', x: 1, z: 1 });
    expect(r.has('menottes', true)).toBe(true);
  });

  it("'explosion' choisit le son d'après le type, avec un acouphène si elle est toute proche", () => {
    r.fake.ctx.events.emit('explosion', { kind: 'gm2l', x: 3, y: 0, z: 3, radius: 8, sourceId: 0 });
    expect(r.has('detonation', true)).toBe(true);
    expect(r.has('acouphene', true)).toBe(true);
    r.fake.ctx.events.emit('explosion', { kind: 'vehicule', x: 80, y: 0, z: 0, radius: 12, sourceId: 0 });
    expect(r.has('explosion_vehicule', true)).toBe(true);
  });

  it("'projectile:impact' : pavé sur bouclier levé, pavé au sol, bouteille", () => {
    const shield = r.fake.addPerson('crs', 'police', 2, 2);
    shield.inventory.push({ id: 'bouclier', count: 1, state: 1, cooldown: 0 });
    shield.active = 0;
    shield.alt = true;
    const ev = r.fake.ctx.events;
    ev.emit('projectile:impact', { id: 1, kind: 'pave', ownerId: 0, x: 2, y: 1, z: 2, hitKind: 'person', hitId: shield.id });
    expect(r.has('impact_bouclier', true)).toBe(true);
    ev.emit('projectile:impact', { id: 2, kind: 'pave', ownerId: 0, x: 8, y: 0, z: 2, hitKind: 'ground', hitId: 0 });
    expect(r.has('impact_sol', true)).toBe(true);
    ev.emit('projectile:impact', { id: 3, kind: 'bouteille', ownerId: 0, x: -6, y: 0, z: 2, hitKind: 'ground', hitId: 0 });
    expect(r.has('verre_brise', true)).toBe(true);
  });

  it("'shop:window' et 'shop:shutter' jouent à l'emplacement de la vitrine", () => {
    const shop = r.fake.addShop(4, 6);
    r.fake.ctx.events.emit('shop:window', { id: shop.id, state: 'broken', byId: 0 });
    expect(r.has('verre_brise', true)).toBe(true);
    r.fake.ctx.events.emit('shop:shutter', { id: shop.id, closed: true });
    expect(r.has('rideau_fer', true)).toBe(true);
  });

  it("'fire:started' allume une boucle de feu que 'fire:out' éteint", () => {
    const ev = r.fake.ctx.events;
    ev.emit('fire:started', { x: 5, z: 5, targetKind: 'ground', targetId: 0, sourceId: 0 });
    expect(r.has('feu', true)).toBe(true);
    expect(r.has('embrasement', true)).toBe(true);
    // un second signalement du même foyer ne double pas la boucle
    ev.emit('fire:started', { x: 5.5, z: 5, targetKind: 'ground', targetId: 0, sourceId: 0 });
    expect(r.voices().filter((v) => v.includes(' feu')).length).toBe(1);
    ev.emit('fire:out', { x: 5, z: 5, targetKind: 'ground', targetId: 0, byId: 0 });
    expect(r.has('feu')).toBe(false);
  });

  it('un feu constaté éteint par la simulation se tait de lui-même', () => {
    let burning = 1;
    r.fake.state.fire = () => burning;
    r.fake.ctx.events.emit('fire:started', { x: 5, z: 5, targetKind: 'ground', targetId: 0, sourceId: 0 });
    r.run(2.5);
    expect(r.has('feu', true)).toBe(true);
    burning = 0;
    r.run(2.5);
    expect(r.has('feu')).toBe(false);
  });

  it('une grenade lacrymogène qui émet siffle, là où elle roule, et se tait quand elle est épuisée', () => {
    const g = r.fake.addProjectile('grenade_lacrymo_56', 6, 6);
    r.run(0.6);
    expect(r.has('gaz_sifflement')).toBe(false);
    g.emitting = true;
    r.run(0.6);
    expect(r.has('gaz_sifflement', true)).toBe(true);
    const gain = (): number => Number(/g([0-9.]+)/.exec(r.voices().find((v) => v.includes('gaz_sifflement'))!)![1]);
    const near = gain();
    g.x = 30;
    r.run(0.3);
    expect(gain()).toBeLessThan(near);
    g.emitting = false;
    r.run(0.3);
    expect(r.has('gaz_sifflement')).toBe(false);
    // au plus six sifflements à la fois, les plus proches ; hors de portée : aucun
    for (let i = 0; i < 12; i++) r.fake.addProjectile('palet_lacrymo', 3 + i * 3, 0).emitting = true;
    r.fake.addProjectile('palet_lacrymo', 300, 0).emitting = true;
    r.run(0.6);
    expect(r.voices().filter((v) => v.includes('gaz_sifflement')).length).toBe(6);
    r.fake.state.projectiles.length = 0;
    r.run(0.3);
    expect(r.has('gaz_sifflement')).toBe(false);
  });

  it("'vehicle:siren' attache la sirène du bon service au véhicule et la suit", () => {
    const police = r.fake.addVehicle('voiture_police', 'police', 20, 0);
    const pompiers = r.fake.addVehicle('camion_pompiers', 'rescue', 0, 25);
    const samu = r.fake.addVehicle('ambulance', 'medic', -20, 0);
    const ev = r.fake.ctx.events;
    for (const v of [police, pompiers, samu]) {
      v.siren = 1;
      ev.emit('vehicle:siren', { id: v.id, siren: 1 });
    }
    expect(r.has('sirene_police', true)).toBe(true);
    expect(r.has('sirene_pompiers', true)).toBe(true);
    expect(r.has('sirene_samu', true)).toBe(true);
    // la sirène s'éloigne avec son véhicule : son gain diminue
    const gain = (): number => Number(/g([0-9.]+)/.exec(r.voices().find((v) => v.includes('sirene_police'))!)![1]);
    r.run(0.2);
    const g0 = gain();
    police.x = 200;
    r.run(0.5);
    expect(gain()).toBeLessThan(g0 * 0.5);
    police.siren = 0;
    ev.emit('vehicle:siren', { id: police.id, siren: 0 });
    r.run(0.1);
    expect(r.has('sirene_police')).toBe(false);
    expect(r.has('sirene_pompiers', true)).toBe(true);
  });

  it("une sirène allumée sans événement est tout de même prise en compte (relecture de l'état)", () => {
    const v = r.fake.addVehicle('voiture_police', 'police', 15, 0);
    v.siren = 2;
    r.run(1.2);
    expect(r.has('sirene_hurleur', true)).toBe(true);
    r.fake.state.vehicles.length = 0;
    r.run(0.2);
    expect(r.has('sirene_hurleur')).toBe(false);
  });

  it('klaxon tenu tant que la commande l’est', () => {
    const v = r.fake.addVehicle('voiture', 'civil', 6, 4);
    v.cmd.horn = true;
    r.run(0.2);
    expect(r.has('klaxon', true)).toBe(true);
    v.cmd.horn = false;
    r.run(0.2);
    expect(r.has('klaxon')).toBe(false);
  });

  it("'vehicle:collision' et 'person:hurt' (avec limitation de cadence)", () => {
    const ev = r.fake.ctx.events;
    ev.emit('vehicle:collision', { vehicleId: 7, otherKind: 'vehicle', otherId: 8, speed: 10, x: 4, z: 4 });
    expect(r.has('collision', true)).toBe(true);
    const p = r.fake.addPerson('manifestant', 'protest', 3, 3);
    const hurt = (): void => ev.emit('person:hurt', { id: p.id, info: { amount: 20, kind: 'blunt', sourceId: 0, x: 3, z: 3 }, healthAfter: 60 });
    hurt();
    expect(r.voices().filter((v) => v.includes(' cri')).length).toBe(1);
    r.run(0.3);
    hurt();
    expect(r.voices().filter((v) => v.includes(' cri')).length).toBe(1);
    ev.emit('person:hurt', { id: p.id, info: { amount: 1, kind: 'gas', sourceId: 0, x: 3, z: 3 }, healthAfter: 59 });
    expect(r.has('toux')).toBe(false); // même personne, moins de 1,2 s après
  });

  it("'radio:message' : bip d'ouverture, souffle, bip de fin (sans synthèse vocale sous Node)", () => {
    r.fake.ctx.events.emit('radio:message', { msg: { channel: 'unite', from: 'Alpha 1', text: 'Autorité de Alpha 1, en position.', priority: 1 }, t: 0 });
    r.run(0.1);
    expect(r.has('radio_bip', true)).toBe(true);
    r.run(0.4);
    expect(r.has('radio_souffle', true)).toBe(true);
    let sawEnd = false;
    for (let i = 0; i < 80 && !sawEnd; i++) {
      r.run(0.05);
      sawEnd = r.has('radio_fin');
    }
    expect(sawEnd).toBe(true);
    expect(r.has('radio_souffle')).toBe(false);
    r.run(1);
    expect(r.debug.speech().speaking).toBe(false);
  });

  it("le même message demandé par l'événement et par speak() n'est diffusé qu'une fois", () => {
    const text = 'Charlie 2, rendez compte.';
    r.fake.ctx.events.emit('radio:message', { msg: { channel: 'unite', from: 'A', text, priority: 1 }, t: 0 });
    r.fake.ctx.audio.speak(text, { radio: true });
    r.run(0.1);
    expect(r.debug.speech().queued).toBe(0);
    expect(r.debug.speech().speaking).toBe(true);
  });

  it("'law:sommation' : voix de mégaphone à l'emplacement de l'autorité", () => {
    r.fake.ctx.events.emit('law:sommation', { stage: 1, byId: 9, x: 0, z: 20, text: 'Obéissance à la loi. Dispersez-vous.' });
    r.run(0.2);
    expect(r.has('megaphone', true)).toBe(true);
  });

  it('sans synthèse vocale (réglage coupé) la file ne garde rien en attente', () => {
    r.fake.ctx.settings.set('voiceSynthesis', false);
    r.fake.ctx.audio.speak('Un', { radio: true });
    r.fake.ctx.audio.speak('Deux', { radio: true });
    r.run(8);
    expect(r.debug.speech()).toMatchObject({ queued: 0, speaking: false });
  });
});

describe('ambiance vivante', () => {
  it('une foule en cortège fait apparaître murmure, batterie et slogans ; sans foule, rien', () => {
    const r = rig();
    r.run(2);
    expect(r.has('foule_calme')).toBe(false);
    expect(r.debug.crowdMix().presence).toBe(0);
    for (let i = 0; i < 90; i++) {
      const p = r.fake.addPerson('manifestant', 'protest', Math.sin(i) * 12, 10 + Math.cos(i) * 12);
      p.anger = 0.15;
    }
    r.fake.state.director.phase = 'cortege';
    r.run(6);
    const m = r.debug.crowdMix();
    expect(m.chant).toBeGreaterThan(0.5);
    expect(r.has('foule_calme', true)).toBe(true);
    expect(r.has('batucada', true)).toBe(true);
    let chant = r.has('foule_slogans');
    for (let i = 0; i < 120 && !chant; i++) {
      r.run(0.05);
      chant = r.has('foule_slogans');
    }
    expect(chant).toBe(true);
  });

  it("la foule répond à l'événement crowd:chant", () => {
    const r = rig();
    r.fake.ctx.events.emit('crowd:chant', { x: 0, z: 12, text: 'On ne lâche rien !', intensity: 0.8 });
    expect(r.has('foule_slogans', true)).toBe(true);
    // deux groupes au même instant : un seul chœur
    r.fake.ctx.events.emit('crowd:chant', { x: 3, z: 12, text: 'Autre slogan !', intensity: 0.8 });
    expect(r.voices().filter((v) => v.includes('foule_slogans')).length).toBe(1);
    // trop loin : ignoré
    r.run(1);
    r.fake.ctx.events.emit('crowd:chant', { x: 900, z: 0, text: 'Loin !', intensity: 1 });
    expect(r.voices().filter((v) => v.includes('foule_slogans')).length).toBe(1);
  });

  it('colère puis peur : les huées puis la panique remplacent les slogans', () => {
    const r = rig();
    const people = [];
    for (let i = 0; i < 90; i++) people.push(r.fake.addPerson('manifestant', 'protest', Math.sin(i) * 10, Math.cos(i) * 10));
    r.fake.state.director.phase = 'affrontement';
    r.fake.state.director.tension = 0.8;
    for (const p of people) p.anger = 0.9;
    r.run(5);
    let m = { ...r.debug.crowdMix() };
    expect(m.boo).toBeGreaterThan(m.chant);
    expect(r.has('foule_huees', true)).toBe(true);
    for (const p of people) p.fear = 0.95;
    r.run(5);
    m = { ...r.debug.crowdMix() };
    expect(m.panic).toBeGreaterThan(0.6);
    expect(m.panic).toBeGreaterThan(m.chant);
    expect(r.has('foule_panique', true)).toBe(true);
  });

  it('ville, pluie et vent suivent l’heure et la météo', () => {
    const r = rig();
    r.run(1);
    expect(r.has('ville', true)).toBe(true);
    expect(r.has('pluie')).toBe(false);
    expect(r.has('vent')).toBe(false);
    r.fake.state.env.rain = 0.7;
    r.fake.state.env.windX = 12;
    r.run(1);
    expect(r.has('pluie', true)).toBe(true);
    expect(r.has('vent', true)).toBe(true);
    r.fake.state.env.rain = 0;
    r.fake.state.env.windX = 0;
    r.run(1);
    expect(r.has('pluie')).toBe(false);
    expect(r.has('vent')).toBe(false);
  });

  it('les personnes dans le gaz toussent', () => {
    const r = rig();
    const p = r.fake.addPerson('manifestant', 'protest', 4, 4);
    p.gas = 0.8;
    let coughed = false;
    for (let i = 0; i < 100 && !coughed; i++) {
      r.run(0.05);
      coughed = r.has('toux');
    }
    expect(coughed).toBe(true);
  });
});

describe('pas et moteurs', () => {
  it('le joueur qui marche fait un pas par foulée, selon la surface', () => {
    const r = rig();
    const me = r.fake.addPerson('crs', 'police', 0, 0);
    me.isPlayer = true;
    r.fake.state.player.personId = me.id;
    const played0 = r.debug.stats().played;
    r.run(2);
    expect(r.debug.stats().played).toBe(played0 + 1); // immobile : aucun pas (seule la rumeur de la ville a démarré)
    me.vx = 1.4;
    r.run(3);
    // 4,2 m parcourus, foulée de 0,82 m : 5 pas
    expect(r.debug.stats().played - played0 - 1).toBe(5);
    r.fake.state.surface = () => 'gravel';
    let gravel = false;
    for (let i = 0; i < 40 && !gravel; i++) {
      r.run(0.05);
      gravel = r.has('pas_gravier');
    }
    expect(gravel).toBe(true);
  });

  it('une personne proche en mouvement s’entend marcher, pas une personne en véhicule', () => {
    const r = rig();
    const walker = r.fake.addPerson('manifestant', 'protest', 3, 3);
    walker.vx = 3.5;
    const seated = r.fake.addPerson('conducteur', 'civil', 4, 2);
    seated.vx = 8;
    seated.vehicleId = 77;
    let steps = 0;
    for (let i = 0; i < 60; i++) {
      r.run(0.05);
      if (r.has('pas')) steps++;
    }
    expect(steps).toBeGreaterThan(3);
    walker.vx = 0;
    r.run(1);
    const played = r.debug.stats().played;
    r.run(2);
    expect(r.debug.stats().played).toBe(played);
  });

  it("service 'audio.engine' : créer, piloter, libérer un moteur", () => {
    const r = rig();
    const v = r.fake.addVehicle('fourgon_crs', 'police', 5, 5);
    const svc = r.fake.ctx.require<EngineSoundService>(AUDIO_ENGINE_SERVICE);
    r.run(1); // laisse démarrer la rumeur de la ville, qui crée ses propres sources
    const e = svc.create(v.id);
    expect(r.has('moteur', true)).toBe(true);
    const events0 = r.ac.sources.length;
    for (const rpm of [900, 1500, 2600, 0.2, 0.9, Number.NaN, -1, 1e9]) {
      e.setRpm(rpm);
      e.setLoad(rpm > 1000 ? 1 : 0.2);
      e.setPosition(5 + rpm * 1e-6, 0.8, 5);
      r.run(0.1);
    }
    expect(r.ac.sources.length).toBe(events0); // piloter ne recrée pas de graphe
    e.dispose();
    e.dispose();
    expect(r.has('moteur')).toBe(false);
  });

  it('sonorisation automatique : les véhicules proches, moteur en marche, ont un moteur ; il suit le régime', () => {
    const r = rig();
    const a = r.fake.addVehicle('voiture', 'civil', 10, 0);
    const far = r.fake.addVehicle('voiture', 'civil', 400, 0);
    const off = r.fake.addVehicle('voiture', 'civil', 12, 0);
    a.engineOn = true;
    far.engineOn = true;
    off.engineOn = false;
    a.rpm = 2200;
    r.run(1.2);
    expect(r.voices().filter((v) => v.includes('moteur')).length).toBe(1);
    // un moteur créé par un autre module remplace la sonorisation automatique (pas de doublon)
    const svc = r.fake.ctx.require<EngineSoundService>(AUDIO_ENGINE_SERVICE);
    const mine = svc.create(a.id);
    r.run(1.2);
    expect(r.voices().filter((v) => v.includes('moteur')).length).toBe(1);
    mine.dispose();
    a.engineOn = false;
    r.run(1.2);
    expect(r.has('moteur')).toBe(false);
  });

  it('au plus cinq moteurs automatiques, les plus proches', () => {
    const r = rig();
    for (let i = 0; i < 12; i++) r.fake.addVehicle('voiture', 'civil', 6 + i * 5, 0).engineOn = true;
    r.run(1.5);
    expect(r.voices().filter((v) => v.includes('moteur')).length).toBe(5);
  });
});
