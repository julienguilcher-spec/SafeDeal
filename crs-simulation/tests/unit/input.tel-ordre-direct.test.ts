// Téléphone — la pastille « Ordre prêt », « ⟳ À qui » et le toucher du monde, sur une vraie partie (commandant, place
// de la Concorde, graine 21, vraie carte de Paris) :
//   - la surcouche lit elle-même l'ordre prêt AFFICHÉ par 'command.direct' (celui que le toucher donnera) et en écrit
//     la forme courte : verbe sur la ligne 1, unité et distance sur la ligne 2 ; rien de visé : « Visez » ;
//   - « ⟳ À qui » n'est montré qu'aux postes qui ont plusieurs unités au choix (le même cycle que U) ;
//   - le toucher du monde : le rayon de la caméra à travers le doigt touche le sol (ou une façade, 2 m devant) ; une
//     personne sous le doigt est désignée (jamais un policier d'une unité qui suit déjà le joueur) ; la désignation
//     tient 4 s puis le regard reprend ; l'ordre prêt la suit.
import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';

import { createTestContext } from '@/core/testing';
import type { TestContext } from '@/core/testing';
import { createSystems as world } from '@/world/query';
import { createSystems as roles } from '@/sim/roles';
import { createSystems as people } from '@/sim/people';
import { createSystems as vehicles } from '@/sim/vehicles';
import { createSystems as traffic } from '@/sim/traffic';
import { createSystems as crowd } from '@/sim/crowd';
import { createSystems as police } from '@/sim/police';
import { createSystems as items } from '@/sim/items';
import { createSystems as props } from '@/sim/props';
import { createSystems as hazards } from '@/sim/hazards';
import { createSystems as law } from '@/gameplay/law';
import { createSystems as radio } from '@/gameplay/radio';
import { createSystems as session } from '@/gameplay/session';
import { createSystems as maps } from '@/ui/maps';
import { createSystems as command } from '@/ui/command';
import type { CommandCore, CommandSystem, DirectRuntime } from '@/ui/command';
import { DIRECT_SERVICE } from '@/ui/command';
import type { GameContext, Person, RoadSample } from '@/core/contracts';
import { NO_CYCLE_POSTES, ORDER_PILL_AIM, ORDER_PILL_IDLE, ORDER_PILL_WHEEL, TouchController, readyOrderFor, whoChoiceFor } from '@/input/touch/controller';
import { designationAt } from '@/ui/command/direct/env';
import { whoCycle } from '@/ui/command/direct/who';
import { TAP_DESIGNATION_TIME, TapDesignation, rayGround, screenRay } from '@/ui/command/direct/tapDesignate';
import { fitsPill } from '@/ui/command/direct/words';

const MODULES = [world, roles, people, vehicles, traffic, crowd, police, items, props, hazards, law, radio, session, maps, command];
const MEANS = { sections: 3, fourgons: 9, centaure: 1, canon_eau: 1, bravm: 1, drone: 0, pompiers: 0, samu: 0, secours_sur_appel: true };
const W = 844;
const H = 390;

let t: TestContext;
let ctx: GameContext;
let core: CommandCore;
let direct: DirectRuntime;
let sys: CommandSystem;
let me: Person;

beforeAll(async () => {
  t = createTestContext({ seed: 21, strict: false, modules: MODULES });
  await t.start({
    mode: 'libre', role: 'commandant', rank: 'commandant', place: 'Place de la Concorde', x: -10, z: 15,
    crowdSize: 300, tension: 0.4, volatility: 0.3, duration: 'standard', extra: { moyens: MEANS, variante: 'terrain' },
  } as never);
  t.step(3);
  ctx = t.ctx;
  core = ctx.service<CommandCore>('ui.command')!;
  direct = ctx.service<DirectRuntime>(DIRECT_SERVICE)!;
  sys = t.game.systems.find((s) => s.id === 'ui:command') as unknown as CommandSystem;
  me = core.player()!;
}, 300000);

/** Contrôleur tactile sans DOM : seule la lecture du libellé de la pastille sert ici. */
function controller(): TouchController {
  return new TouchController({ core: null as never, ctx, activity() {}, haptic() {} });
}

/** Une caméra de téléphone (844 × 390) aux yeux du joueur, qui regarde le point (x, y, z). */
function cameraAt(fromX: number, fromY: number, fromZ: number, toX: number, toY: number, toZ: number): THREE.PerspectiveCamera {
  const cam = new THREE.PerspectiveCamera(70, W / H, 0.1, 2000);
  cam.position.set(fromX, fromY, fromZ);
  cam.lookAt(toX, toY, toZ);
  cam.updateMatrixWorld();
  cam.updateProjectionMatrix();
  return cam;
}

/** Vue 3D minimale pour TapDesignation : la caméra et un canevas plein écran (le reste n'est pas lu). */
function withView<T>(cam: THREE.PerspectiveCamera, fn: () => T): T {
  const c = ctx as unknown as { view: unknown };
  const saved = c.view;
  c.view = {
    camera: cam, camX: cam.position.x, camY: cam.position.y, camZ: cam.position.z,
    renderer: { domElement: { getBoundingClientRect: () => ({ left: 0, top: 0, width: W, height: H, right: W, bottom: H }) } },
  };
  try {
    return fn();
  } finally {
    c.view = saved;
  }
}

/** Point de l'écran (px) d'un point du monde, pour cette caméra. */
function toScreen(cam: THREE.PerspectiveCamera, x: number, y: number, z: number): { x: number; y: number } {
  const v = new THREE.Vector3(x, y, z).project(cam);
  return { x: (v.x * 0.5 + 0.5) * W, y: (-v.y * 0.5 + 0.5) * H };
}

/** Un point de la chaussée nommé, à 30–90 m du joueur. */
function roadPoint(): { x: number; z: number; name: string } {
  for (let r = 30; r <= 90; r += 10) {
    for (let k = 0; k < 24; k++) {
      const a = (k * Math.PI) / 12;
      const x = me.x + Math.sin(a) * r, z = me.z + Math.cos(a) * r;
      const road = { edgeId: -1, x: 0, z: 0, heading: 0, dist: 0, width: 0, name: '', roadClass: 'residential', oneway: false } as RoadSample;
      if (ctx.world.nearestRoad(x, z, road, 6) && road.name.trim() !== '' && ctx.world.buildingHeightAt(road.x, road.z) <= 0) return { x: road.x, z: road.z, name: road.name };
    }
  }
  throw new Error('aucune rue nommée autour du joueur');
}

describe('pastille « Ordre prêt » : la surcouche lit l\'ordre prêt affiché', () => {
  it('une rue désignée : « Bloquer la rue » et l\'unité qui ira, la même ligne que l\'Entrée de l\'ordinateur', () => {
    const road = roadPoint();
    direct.setDesignation(designationAt(core, road.x, road.z));
    t.step(0.6);
    const nat = direct.ready()!;
    expect(nat).not.toBeNull();
    const tc = controller();
    tc.readOrderLabel();
    console.log(`[pastille] ${nat.rule} « ${nat.text} » → « ${tc.order.verb} » / « ${tc.order.who} » (prêt : ${tc.order.ready})`);
    expect(nat.short).not.toBe('');
    expect(tc.order.verb).toBe(nat.short);
    expect(tc.order.who).toBe(nat.whoShort);
    expect(tc.order.ready).toBe(nat.enabled);
    expect(fitsPill(tc.order.verb, 1)).toBe(true);
    if (nat.rule === 'g') {
      expect(tc.order.verb).toBe('Bloquer la rue');
      expect(tc.order.who).toMatch(/\s·\s\d+ m$/);
    }
  });

  it('rien de visé (le ciel) : « Visez », grisé ; sans moteur des ordres : « Ordres » et l\'appui long', () => {
    direct.setDesignation({ kind: 'none', x: me.x, z: me.z, distance: 0, person: null, place: '', far: false });
    // la ligne affichée change au plus toutes les 0,5 s (natural.ts holdNatural)
    t.step(0.6);
    const tc = controller();
    tc.readOrderLabel();
    expect(direct.ready()!.rule).toBe('i');
    expect([tc.order.verb, tc.order.who, tc.order.ready]).toEqual([ORDER_PILL_AIM.verb, ORDER_PILL_AIM.who, false]);
    // libellé imposé, puis rendu à la lecture
    tc.setOrderLabel('Envoyer', 'BRAV-M · 400 m', true);
    tc.readOrderLabel();
    expect([tc.order.verb, tc.order.who, tc.order.ready]).toEqual(['Envoyer', 'BRAV-M · 400 m', true]);
    tc.setOrderLabel(null);
    tc.readOrderLabel();
    expect(tc.order.verb).toBe(ORDER_PILL_AIM.verb);
    expect(ORDER_PILL_IDLE.verb).toBe('Ordres');
  });

  it('« ⟳ À qui » : montré au commandant, masqué aux postes sans choix d\'unité (le même cycle que U)', () => {
    const env = direct.env();
    expect(env.poste).toBe('commandant');
    expect(whoChoiceFor(env.poste)).toBe(true);
    expect(whoCycle(env).length).toBeGreaterThan(1);
    for (const poste of NO_CYCLE_POSTES) {
      expect(whoChoiceFor(poste)).toBe(false);
      expect(whoCycle({ ...env, poste } as typeof env)).toEqual(['auto']);
    }
    for (const poste of ['section', 'bravm']) expect(whoChoiceFor(poste)).toBe(true);
  });

  it('l\'exécutant (son chef donne les ordres) : pas d\'ordre prêt, la pastille dit « Ordres » et ouvre la roue', () => {
    // le commandant a un ordre prêt
    const tc = controller();
    tc.readPoste();
    expect([tc.readyOrder, tc.whoChoice]).toEqual([true, true]);
    for (const poste of ['commandant', 'section', 'groupe', 'bravm', 'equipage']) expect(readyOrderFor(poste), poste).toBe(true);
    expect(readyOrderFor('lecture')).toBe(false);
    // le même moteur, vu d'un poste d'exécutant : la rue visée n'est pas proposée (il ne pourrait pas la donner)
    const real = direct;
    const asLecture = { ready: () => real.ready(), flashing: () => real.flashing(), env: () => ({ ...real.env(), poste: 'lecture' }) };
    const fake = { service: (key: string) => (key === DIRECT_SERVICE ? asLecture : null) } as unknown as GameContext;
    const tl = new TouchController({ core: null as never, ctx: fake, activity() {}, haptic() {} });
    const road = roadPoint();
    direct.setDesignation(designationAt(core, road.x, road.z));
    t.step(0.6);
    expect(direct.ready()!.short).not.toBe('');
    tl.readPoste();
    tl.readOrderLabel();
    expect([tl.readyOrder, tl.whoChoice]).toEqual([false, false]);
    expect([tl.order.verb, tl.order.who, tl.order.ready, tl.order.flash]).toEqual([ORDER_PILL_WHEEL.verb, ORDER_PILL_WHEEL.who, true, false]);
    expect(ORDER_PILL_WHEEL.verb).toBe('Ordres');
    expect(fitsPill(ORDER_PILL_WHEEL.verb, 1)).toBe(true);
  });
});

describe('toucher du monde : ce qui est sous le doigt', () => {
  it('le rayon de la caméra à travers le doigt touche le sol là où l\'on regarde, une façade 2 m devant, jamais le ciel', () => {
    const road = roadPoint();
    const eye = ctx.world.heightAt(me.x, me.z) + 1.7;
    const gy = ctx.world.heightAt(road.x, road.z);
    const cam = cameraAt(me.x, eye, me.z, road.x, gy, road.z);
    const ray = screenRay(cam.matrixWorld.elements, cam.projectionMatrixInverse.elements, 0, 0);
    const hit = rayGround(ctx, ray);
    expect(hit).not.toBeNull();
    const err = Math.hypot(hit!.x - road.x, hit!.z - road.z);
    console.log(`[toucher] centre de l'écran → (${hit!.x.toFixed(1)}, ${hit!.z.toFixed(1)}), visé (${road.x.toFixed(1)}, ${road.z.toFixed(1)}) : ${err.toFixed(2)} m`);
    expect(err).toBeLessThan(2);
    expect(hit!.facade).toBe(false);
    // le haut de l'écran, caméra droite : le ciel
    const level = cameraAt(me.x, eye, me.z, me.x + 10, eye + 6, me.z);
    expect(rayGround(ctx, screenRay(level.matrixWorld.elements, level.projectionMatrixInverse.elements, 0, 0.95))).toBeNull();
    // une façade : le premier immeuble le long d'un cap, le point est pris devant lui (dans la rue)
    let facade: { x: number; z: number; range: number; facade: boolean } | null = null;
    for (let k = 0; k < 32 && !facade; k++) {
      const a = (k * Math.PI) / 16;
      const c2 = cameraAt(me.x, eye, me.z, me.x + Math.sin(a) * 100, eye, me.z + Math.cos(a) * 100);
      const h = rayGround(ctx, screenRay(c2.matrixWorld.elements, c2.projectionMatrixInverse.elements, 0, 0));
      if (h && h.facade) facade = h;
    }
    expect(facade).not.toBeNull();
    expect(ctx.world.buildingHeightAt(facade!.x, facade!.z)).toBeLessThanOrEqual(0);
  });

  it('une personne sous le doigt est désignée ; un policier d\'une unité qui suit déjà le joueur, jamais', () => {
    const tap = new TapDesignation(core);
    const eye = ctx.world.heightAt(me.x, me.z) + 1.7;
    // un manifestant (à défaut un passant) à 15–150 m, debout, hors d'un véhicule
    const near: Person[] = [];
    ctx.people.queryRadius(me.x, me.z, 150, near, (p) => (p.faction === 'protest' || p.faction === 'civil') && p.vehicleId === 0 && p.injury !== 'dead');
    near.sort((a, b) => (a.faction === 'protest' ? 0 : 1) - (b.faction === 'protest' ? 0 : 1) || Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z));
    const demo = near.find((p) => Math.hypot(p.x - me.x, p.z - me.z) > 15);
    expect(demo).toBeDefined();
    const camD = cameraAt(me.x, eye, me.z, demo!.x, ctx.world.heightAt(demo!.x, demo!.z) + 1.2, demo!.z);
    // le doigt à 10 px du buste
    const s = toScreen(camD, demo!.x, ctx.world.heightAt(demo!.x, demo!.z) + 1.2, demo!.z);
    const d = withView(camD, () => tap.designateAtScreen(s.x + 8, s.y + 6));
    const rayD = screenRay(camD.matrixWorld.elements, camD.projectionMatrixInverse.elements, (s.x + 8) / W * 2 - 1, -((s.y + 6) / H * 2 - 1));
    console.log(`[toucher] manifestant #${demo!.id} à ${Math.hypot(demo!.x - me.x, demo!.z - me.z).toFixed(1)} m, écran (${s.x.toFixed(0)}, ${s.y.toFixed(0)}) ; rayon → ${JSON.stringify(rayGround(ctx, rayD))} ; désigné ${JSON.stringify(d)}`);
    expect(d).not.toBeNull();
    expect(d!.kind).toBe('person');
    // le plus proche du doigt (un autre manifestant peut être plus près : il est alors tout aussi désigné sous le doigt)
    const picked = ctx.people.get(d!.person!.id)!;
    const ps = toScreen(camD, picked.x, ctx.world.heightAt(picked.x, picked.z) + 1.2, picked.z);
    expect(Math.hypot(ps.x - s.x - 8, ps.y - s.y - 6)).toBeLessThanOrEqual(28);
    expect(picked.faction).not.toBe('police');

    // un policier d'une unité qui le suit (au départ, tout le monde suit le commandant) : le sol sous lui, pas lui
    const cops: Person[] = [];
    ctx.people.queryRadius(me.x, me.z, 60, cops, (p) => p.faction === 'police' && p.id !== me.id && p.vehicleId === 0 && Math.hypot(p.x - me.x, p.z - me.z) > 8);
    const cop = cops.find((p) => {
      const q = p.squadId !== 0 ? ctx.squads.get(p.squadId) : undefined;
      return !!q && (q.order.type === 'suivre' || q.order.type === 'avec_moi');
    });
    if (cop) {
      const camP = cameraAt(me.x, eye, me.z, cop.x, ctx.world.heightAt(cop.x, cop.z) + 1.2, cop.z);
      const sp = toScreen(camP, cop.x, ctx.world.heightAt(cop.x, cop.z) + 1.2, cop.z);
      const dp = withView(camP, () => tap.designateAtScreen(sp.x, sp.y));
      expect(dp === null || dp.person === null || dp.person.id !== cop.id).toBe(true);
    } else {
      console.log('[toucher] aucun policier à pied qui suit le joueur dans 60 m : cas non vérifié');
    }
  });

  it('le toucher tient 4 s, l\'ordre prêt le suit, puis le regard reprend', () => {
    const road = roadPoint();
    const eye = ctx.world.heightAt(me.x, me.z) + 1.7;
    const cam = cameraAt(me.x, eye, me.z, road.x, ctx.world.heightAt(road.x, road.z), road.z);
    let pending: { x: number; y: number } | null = { x: W / 2, y: H / 2 };
    const stub = { takeWorldTap: () => { const p = pending; pending = null; return p; } };
    if (!ctx.service('input.touch')) ctx.provide('input.touch', stub);
    const svc = ctx.service<{ takeWorldTap?: () => unknown }>('input.touch')!;
    const orig = svc.takeWorldTap;
    svc.takeWorldTap = stub.takeWorldTap;
    try {
      const d = withView(cam, () => sys.keys!.designate());
      expect(d).not.toBeNull();
      expect(Math.hypot(d!.x - road.x, d!.z - road.z)).toBeLessThan(2.5);
      // l'ordre prêt suit la désignation du toucher (la ligne affichée change au plus toutes les 0,5 s)
      expect(direct.designation()).toBe(d);
      t.step(0.6);
      const nat = direct.ready()!;
      expect(Math.hypot(nat.x - road.x, nat.z - road.z)).toBeLessThan(8);
      t.step(TAP_DESIGNATION_TIME - 2);
      expect(sys.keys!.tap.current()).not.toBeNull();
      t.step(2);
      expect(sys.keys!.tap.current()).toBeNull();
    } finally {
      svc.takeWorldTap = orig;
    }
  });
});
