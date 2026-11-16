// Contrôleur du joueur piloté par un InputState scripté : incarnation, regard (convention de cap),
// déplacement relatif à la caméra, allures, objets (charge de lancer avec un ctx.actions factice),
// interaction, visée, masque et visière, véhicule (conduite, tourelle), engin télépiloté, écran modal.
import { describe, expect, it } from 'vitest';
import type { GameContext, GameEvents, Person, UiApi, Vehicle, VehicleDef } from '@/core/contracts';
import { genericVehicleDef } from '@/core/stores';
import type { VehicleStore } from '@/core/stores';
import { createTestContext } from '@/core/testing';
import type { TestContext } from '@/core/testing';
import { createSystems } from '@/sim/people';
import type { PlayerControlApi } from '@/sim/people';
import { ScriptedInput, createFakeActions, createScriptedInputSystem, createWallWorld } from '@/sim/people/testkit';
import type { FakeActions } from '@/sim/people/testkit';

interface Rig { t: TestContext; ctx: GameContext; input: ScriptedInput; me: Person; actions: FakeActions }

const DT = 1 / 30;

async function setup(kind: Person['kind'] = 'crs'): Promise<Rig> {
  const input = new ScriptedInput();
  const t = createTestContext({ modules: [createSystems], systems: [createScriptedInputSystem(input)] });
  await t.start();
  const ctx = t.ctx;
  const actions = createFakeActions(ctx);
  actions.addDef('pave', 'throwable', 0.5);
  actions.addDef('grenade_lacrymo', 'throwable', 0.35);
  actions.addDef('gazeuse', 'spray', 0.3);
  actions.addDef('baton', 'melee', 0.6);
  actions.addDef('bouclier', 'defense', 4.5);
  actions.addDef('masque_gaz', 'tool', 0.6);
  ctx.actions = actions;
  const me = ctx.people.spawn({ kind, x: 0, z: 0, heading: 0 });
  ctx.player.possess(me.id, 'crs');
  return { t, ctx, input, me, actions };
}

function record<K extends keyof GameEvents>(ctx: GameContext, name: K): GameEvents[K][] {
  const out: GameEvents[K][] = [];
  ctx.events.on(name, (e) => out.push({ ...e }));
  return out;
}

/** Un pas de simulation exactement (les fronts de boutons durent un pas). */
function tick(r: Rig, n = 1): void {
  for (let i = 0; i < n; i++) r.t.game.step(DT);
}

describe('incarnation et caméra', () => {
  it('possess marque la personne, émet player:possessed, et rend la précédente', async () => {
    const t = createTestContext({ modules: [createSystems] });
    await t.start();
    const ctx = t.ctx;
    const possessed = record(ctx, 'player:possessed');
    const a = ctx.people.spawn({ kind: 'crs', x: 0, z: 0, heading: 1.2 });
    const b = ctx.people.spawn({ kind: 'journaliste', x: 5, z: 0 });
    expect(ctx.player.person()).toBeNull();
    ctx.player.possess(a.id, 'crs');
    expect(a.isPlayer).toBe(true);
    expect(ctx.player.person()).toBe(a);
    expect(ctx.player.state.camYaw).toBeCloseTo(1.2, 10);
    ctx.player.possess(b.id, 'journaliste');
    expect(a.isPlayer).toBe(false);
    expect(b.isPlayer).toBe(true);
    expect(ctx.player.state.role).toBe('journaliste');
    expect(possessed).toEqual([{ personId: a.id, role: 'crs' }, { personId: b.id, role: 'journaliste' }]);
    ctx.player.possess(9999);
    expect(ctx.player.state.personId).toBe(0);
    expect(b.isPlayer).toBe(false);
  });

  it('toggleCamera bascule FPS ↔ TPS et émet player:camera ; la touche « camera » aussi', async () => {
    const r = await setup();
    const cam = record(r.ctx, 'player:camera');
    expect(r.ctx.player.state.cameraMode).toBe('tps');
    r.ctx.player.toggleCamera();
    expect(r.ctx.player.state.cameraMode).toBe('fps');
    r.ctx.player.setCameraMode('fps'); // sans changement : pas d'événement
    r.input.press('camera');
    tick(r);
    r.input.release('camera');
    tick(r);
    expect(r.ctx.player.state.cameraMode).toBe('tps');
    expect(cam.map((c) => c.mode)).toEqual(['fps', 'tps']);
  });
});

describe('regard et déplacement', () => {
  it('face au sud, regarder à droite fait tourner vers l\'ouest (le cap diminue)', async () => {
    const r = await setup();
    const st = r.ctx.player.state;
    expect(st.camYaw).toBe(0); // cap 0 = face au sud (+z)
    r.input.look(Math.PI / 2, 0); // un quart de tour vers la droite
    tick(r);
    expect(st.camYaw).toBeCloseTo(-Math.PI / 2, 10);
    // vecteur avant = (sin h, cos h) : il pointe vers l'ouest (−x)
    expect(Math.sin(st.camYaw)).toBeCloseTo(-1, 10);
    expect(Math.cos(st.camYaw)).toBeCloseTo(0, 10);
    // la rotation n'est appliquée qu'une fois
    tick(r, 3);
    expect(st.camYaw).toBeCloseTo(-Math.PI / 2, 10);
    // avancer mène donc vers l'ouest
    r.input.setMove(0, 1);
    r.t.step(2);
    expect(r.me.x).toBeLessThan(-2);
    expect(Math.abs(r.me.z)).toBeLessThan(0.01);
    expect(r.me.aimYaw).toBeCloseTo(-Math.PI / 2, 10);
  });

  it('regarder vers le haut augmente le site, borné ; à gauche augmente le cap', async () => {
    const r = await setup();
    const st = r.ctx.player.state;
    r.input.look(-0.3, 0.4);
    tick(r);
    expect(st.camYaw).toBeCloseTo(0.3, 10);
    expect(st.camPitch).toBeCloseTo(0.4, 10);
    r.input.look(0, 5);
    tick(r);
    expect(st.camPitch).toBeCloseTo(1.45, 10);
    tick(r);
    expect(r.me.aimPitch).toBeCloseTo(1.45, 10);
  });

  it('le déplacement est relatif à la caméra : face au sud, « droite » mène à l\'ouest, « avant » au sud', async () => {
    const r = await setup();
    r.input.setMove(1, 0); // pas de côté à droite
    r.t.step(2);
    expect(r.me.x).toBeLessThan(-2);
    expect(Math.abs(r.me.z)).toBeLessThan(0.01);
    r.input.setMove(0, 1);
    r.t.step(2);
    expect(r.me.z).toBeGreaterThan(2);
    // caméra tournée vers l'est (cap +π/2) : « avant » mène à l'est
    r.input.look(-Math.PI / 2, 0);
    r.input.setMove(0, 1);
    const x0 = r.me.x;
    r.t.step(2);
    expect(r.me.x).toBeGreaterThan(x0 + 2);
  });

  it('allures : marche par défaut au clavier, petite foulée par bascule, sprint maintenu, marche en visant, joystick analogique et tactile à fond', async () => {
    const r = await setup('manifestant');
    const { me, input } = r;
    me.look.backpack = false;
    const speed = (): number => Math.hypot(me.vx, me.vz);
    // clavier : la touche d'avance seule fait MARCHER — le souffle ne s'use pas (défaut de la recette : 100 → 0 en 78 s)
    input.setMove(0, 1);
    r.t.step(2);
    expect(me.cmd.gait).toBe(0);
    expect(speed()).toBeCloseTo(me.speedWalk, 1);
    me.stamina = 60;
    r.t.step(20);
    expect(me.stamina).toBeGreaterThan(60);
    // bascule « marcher / trottiner » : petite foulée, qui tient jusqu'à la bascule suivante
    input.press('jog');
    tick(r);
    input.release('jog');
    r.t.step(2);
    expect(me.cmd.gait).toBe(1);
    expect(speed()).toBeCloseTo(me.speedRun, 1);
    input.press('sprint');
    r.t.step(2);
    expect(me.cmd.gait).toBe(2);
    expect(speed()).toBeCloseTo(me.speedSprint, 1);
    input.release('sprint');
    input.press('secondary'); // on vise : au pas
    r.t.step(2);
    expect(me.cmd.gait).toBe(0);
    expect(speed()).toBeCloseTo(me.speedWalk, 1);
    input.release('secondary');
    // seconde bascule : retour à la marche
    r.t.step(1);
    expect(me.cmd.gait).toBe(1);
    input.press('jog');
    tick(r);
    input.release('jog');
    r.t.step(1);
    expect(me.cmd.gait).toBe(0);
    // manette : stick à moitié = marche lente
    input.device = 'gamepad';
    input.setMove(0, 0.3);
    r.t.step(2);
    expect(me.cmd.gait).toBe(0);
    expect(speed()).toBeCloseTo(me.speedWalk * (0.3 / 0.55), 1);
    // tactile : joystick poussé à fond = sprint
    input.device = 'touch';
    input.setMove(0, 1);
    me.stamina = 100;
    r.t.step(2);
    expect(me.cmd.gait).toBe(2);
    input.setMove(0, 0.8);
    tick(r);
    expect(me.cmd.gait).toBe(1);
  });

  it('accroupi (bascule) et saut', async () => {
    const r = await setup();
    const { me, input } = r;
    const control = r.ctx.require<PlayerControlApi>('player.control');
    input.press('crouch');
    tick(r);
    input.release('crouch');
    tick(r);
    expect(me.posture).toBe('crouch');
    expect(control.crouching).toBe(true);
    // saut accroupi : on se relève d'abord
    input.press('jump');
    tick(r);
    input.release('jump');
    tick(r, 2);
    expect(me.posture).toBe('stand');
    expect(me.y).toBe(0);
    input.press('jump');
    tick(r);
    input.release('jump');
    tick(r, 5);
    expect(me.y).toBeGreaterThan(0.1);
  });

  it('en vue subjective ou en visant, le corps suit le regard ; sinon il suit le déplacement', async () => {
    const r = await setup();
    const { me, input } = r;
    input.setMove(1, 0); // vers l'ouest
    r.t.step(1);
    expect(me.cmd.faceMove).toBe(true);
    expect(me.heading).toBeCloseTo(-Math.PI / 2, 1);
    r.ctx.player.setCameraMode('fps');
    r.t.step(1);
    expect(me.cmd.faceMove).toBe(false);
    expect(me.heading).toBeCloseTo(0, 1); // face au regard (sud), en pas chassés
  });
});

describe('objets', () => {
  it('touches 1 à 9 et molette sélectionnent ; rappuyer range l\'objet', async () => {
    const r = await setup();
    const { me, input, actions } = r;
    actions.give(me, 'baton', 1);
    actions.give(me, 'pave', 3);
    actions.give(me, 'gazeuse', 1);
    expect(me.active).toBe(-1);
    const tap = (b: 'slot1' | 'slot2' | 'slot3' | 'slot9' | 'item_next' | 'item_prev'): void => {
      input.press(b);
      tick(r);
      input.release(b);
      tick(r);
    };
    tap('slot2');
    expect(me.active).toBe(1);
    tap('slot2');
    expect(me.active).toBe(-1); // rangé
    tap('slot9');
    expect(me.active).toBe(-1); // emplacement vide
    input.scroll(1);
    tick(r);
    expect(me.active).toBe(0);
    input.scroll(1);
    tick(r);
    input.scroll(1);
    tick(r);
    expect(me.active).toBe(2);
    input.scroll(1); // après le dernier : mains nues
    tick(r);
    expect(me.active).toBe(-1);
    input.scroll(-1);
    tick(r);
    expect(me.active).toBe(2);
    tap('item_prev');
    expect(me.active).toBe(1);
    // molette affectée au bouton « objet suivant » : un cran n'est compté qu'une fois
    input.scroll(1);
    input.press('item_next');
    tick(r);
    input.release('item_next');
    expect(me.active).toBe(2);
  });

  it('lancer : maintenir charge la puissance en 0,9 s, relâcher lance', async () => {
    const r = await setup();
    const { me, input, actions } = r;
    const st = r.ctx.player.state;
    actions.give(me, 'pave', 5);
    actions.select(me, 0);
    input.press('primary');
    tick(r);
    expect(st.charge).toBe(0);
    expect(actions.uses.length).toBe(0); // rien n'est lancé à l'appui
    r.t.step(0.45, DT);
    expect(st.charge).toBeCloseTo(0.5, 1);
    expect(actions.uses.length).toBe(0);
    input.release('primary');
    tick(r);
    expect(actions.uses.length).toBe(1);
    expect(actions.uses[0]!.item).toBe('pave');
    expect(actions.uses[0]!.power).toBeCloseTo(0.5, 1);
    expect(st.charge).toBe(0);

    // charge complète : plafonnée à 1
    input.press('primary');
    r.t.step(1.5, DT);
    expect(st.charge).toBe(1);
    input.release('primary');
    tick(r);
    expect(actions.uses[1]!.power).toBe(1);

    // geste bref : puissance minimale
    input.press('primary');
    tick(r);
    input.release('primary');
    tick(r);
    expect(actions.uses[2]!.power).toBeCloseTo(0.2, 5);
  });

  it('le clic secondaire annule un lancer en cours de charge', async () => {
    const r = await setup();
    const { me, input, actions } = r;
    actions.give(me, 'grenade_lacrymo', 2);
    actions.select(me, 0);
    input.press('primary');
    r.t.step(0.5, DT);
    expect(r.ctx.player.state.charge).toBeGreaterThan(0.4);
    input.press('secondary');
    tick(r);
    expect(r.ctx.player.state.charge).toBe(0);
    input.release('primary');
    tick(r);
    expect(actions.uses.length).toBe(0);
    expect(me.alt).toBe(false); // ce clic n'a pas servi à viser
    input.release('secondary');
    tick(r);
  });

  it('gazeuse : usage continu tant que l\'action est maintenue ; bâton : un appui, un coup', async () => {
    const r = await setup();
    const { me, input, actions } = r;
    actions.give(me, 'gazeuse', 1);
    actions.give(me, 'baton', 1);
    actions.select(me, 0);
    input.press('primary');
    tick(r, 10);
    input.release('primary');
    tick(r, 3);
    expect(actions.uses.length).toBe(10);
    expect(actions.uses.every((u) => u.item === 'gazeuse')).toBe(true);
    actions.select(me, 1);
    input.press('primary');
    tick(r, 10);
    input.release('primary');
    tick(r);
    expect(actions.uses.length).toBe(11);
    expect(actions.uses[10]!.item).toBe('baton');
  });

  it('action secondaire maintenue → setAlt(true), relâchée → setAlt(false)', async () => {
    const r = await setup();
    const { me, input, actions } = r;
    actions.give(me, 'bouclier', 1);
    actions.select(me, 0);
    input.press('secondary');
    tick(r, 5);
    expect(me.alt).toBe(true);
    expect(actions.alts).toEqual([{ personId: me.id, active: true }]); // une seule demande, pas une par pas
    input.release('secondary');
    tick(r);
    expect(me.alt).toBe(false);
    expect(actions.alts.length).toBe(2);
  });
});

describe('interaction et visée', () => {
  it("l'invite est la meilleure option ; Interagir la lance, un nouvel appui l'annule", async () => {
    const r = await setup();
    const { ctx, me, input } = r;
    const st = ctx.player.state;
    tick(r, 8);
    expect(st.prompt).toBeNull();
    const victim = ctx.people.spawn({ kind: 'manifestant', x: 0.9, z: 0.4 });
    ctx.health.hurt(victim, { amount: 400, kind: 'blunt', sourceId: 0, x: 0.9, z: 0.4 });
    tick(r, 8); // l'invite est recalculée cinq fois par seconde
    expect(st.prompt?.verb).toBe('porter');
    expect(st.prompt?.targetId).toBe(victim.id);
    input.press('interact');
    tick(r);
    input.release('interact');
    expect(ctx.interactions.current(me)?.opt.verb).toBe('porter');
    tick(r, 15);
    expect(st.prompt?.verb).toBe('porter'); // l'action en cours reste affichée
    input.press('interact'); // nouvel appui : on renonce
    tick(r);
    input.release('interact');
    expect(ctx.interactions.current(me)).toBeNull();
    expect(me.carrying).toBe(0);
    // cette fois on va au bout, puis on dépose
    tick(r, 8);
    input.press('interact');
    tick(r);
    input.release('interact');
    r.t.step(2.7, DT);
    expect(me.carrying).toBe(victim.id);
    tick(r, 8);
    expect(st.prompt?.verb).toBe('deposer');
  });

  it('la personne sous le réticule est désignée, avec tolérance ; un mur la masque', async () => {
    const r = await setup();
    const { ctx, me } = r;
    const st = ctx.player.state;
    ctx.player.setCameraMode('fps');
    const target = ctx.people.spawn({ kind: 'manifestant', x: 0.25, z: 20 }); // 0,7° à côté de l'axe
    const aside = ctx.people.spawn({ kind: 'manifestant', x: 4, z: 20 }); // 11° : hors réticule
    tick(r, 5);
    expect(st.aimedPersonId).toBe(target.id);
    expect(st.aimX).toBeCloseTo(target.x, 5);
    expect(st.aimZ).toBeCloseTo(target.z, 5);
    // on tourne le regard vers l'autre (à l'est = à gauche quand on fait face au sud)
    r.input.look(-Math.atan2(4, 20), 0);
    tick(r, 5);
    expect(st.aimedPersonId).toBe(aside.id);
    // un mur entre les deux
    ctx.world = createWallWorld(ctx.world, [{ x0: -10, z0: 9, x1: 10, z1: 10 }]);
    tick(r, 5);
    expect(st.aimedPersonId).toBe(0);
    expect(st.aimZ).toBeCloseTo(9, 3); // le point visé s'arrête sur le mur
    expect(me.isPlayer).toBe(true);
  });

  it('en regardant vers le bas, le point visé est l\'intersection du regard avec le sol', async () => {
    const r = await setup();
    const { ctx, me } = r;
    const st = ctx.player.state;
    ctx.player.setCameraMode('fps');
    r.input.look(0, -Math.PI / 4); // 45° vers le bas
    tick(r, 5);
    const eye = me.look.height * 0.93;
    expect(st.aimX).toBeCloseTo(0, 5);
    expect(st.aimZ).toBeCloseTo(eye, 3);
    expect(st.aimedPersonId).toBe(0);
  });
});

describe('masque à gaz et visière', () => {
  it('le masque se met en 8 s (mains prises), se retire en 3 s ; la visière se manœuvre d\'un geste', async () => {
    const r = await setup();
    const { ctx, me, input, actions } = r;
    const control = ctx.require<PlayerControlApi>('player.control');
    const tap = (b: 'mask' | 'visor'): void => {
      input.press(b);
      tick(r);
      input.release(b);
      tick(r);
    };
    tap('mask'); // pas de masque dans la dotation
    expect(control.maskProgress).toBe(0);
    actions.give(me, 'masque_gaz', 1);
    actions.give(me, 'baton', 1);
    actions.select(me, 1);
    tap('mask');
    expect(control.maskProgress).toBeGreaterThan(0);
    expect(me.upper).toBe('cover_face');
    // mains prises : pas de coup de bâton pendant la mise en place
    input.press('primary');
    tick(r);
    input.release('primary');
    expect(actions.uses.length).toBe(0);
    r.t.step(4, DT);
    expect(me.look.gasMask).toBe(false);
    expect(control.maskProgress).toBeCloseTo(0.5, 1);
    r.t.step(4.2, DT);
    expect(me.look.gasMask).toBe(true);
    expect(me.gasProtection).toBe(0.97);
    expect(control.fovScale).toBe(0.7);
    expect(me.upper).toBe('none');
    tap('mask');
    r.t.step(3.1, DT);
    expect(me.look.gasMask).toBe(false);
    expect(me.gasProtection).toBe(0);
    // visière
    const head = me.armorHead;
    tap('visor');
    expect(me.look.visorDown).toBe(true);
    expect(me.armorHead).toBeGreaterThan(head);
    expect(control.fovScale).toBe(0.85);
    tap('visor');
    expect(me.look.visorDown).toBe(false);
    expect(me.armorHead).toBeCloseTo(head, 10);
  });

  it('un coup reçu interrompt la mise en place du masque (et fait vibrer la manette)', async () => {
    const r = await setup();
    const { ctx, me, input, actions } = r;
    const control = ctx.require<PlayerControlApi>('player.control');
    actions.give(me, 'masque_gaz', 1);
    input.press('mask');
    tick(r);
    input.release('mask');
    r.t.step(3, DT);
    expect(control.maskProgress).toBeGreaterThan(0.3);
    ctx.health.hurt(me, { amount: 8, kind: 'impact', sourceId: 0, x: 0, z: 1, zone: 0.2 });
    expect(control.maskProgress).toBe(0);
    r.t.step(6, DT);
    expect(me.look.gasMask).toBe(false);
    expect(input.rumbles.length).toBe(1);
  });
});

// ───────────────────────────── véhicules ─────────────────────────────

function fourgon(): VehicleDef {
  const def = genericVehicleDef('fourgon_crs');
  def.name = 'Fourgon';
  def.faction = 'police';
  def.hasSiren = true;
  def.hasBeacons = true;
  return def;
}

function centaure(): VehicleDef {
  const def = genericVehicleDef('centaure');
  def.seats = [
    { role: 'driver', x: -0.5, y: 1, z: 1, exitX: -2, exitZ: 1 },
    { role: 'gunner', x: 0.5, y: 1, z: 1, exitX: 2, exitZ: 1 },
  ];
  def.turrets = [{ kind: 'lance_grenades', x: 0, y: 2.5, z: 0, yawMin: -Math.PI, yawMax: Math.PI, pitchMin: -0.2, pitchMax: 0.9, capacity: 30, interval: 0.5 }];
  return def;
}

function drone(): VehicleDef {
  const def = genericVehicleDef('drone');
  def.flying = true;
  def.seats = [];
  def.turrets = [{ kind: 'camera', x: 0, y: -0.1, z: 0, yawMin: -Math.PI, yawMax: Math.PI, pitchMin: -1.5, pitchMax: 0.3, capacity: 0, interval: 0 }];
  return def;
}

function spawnVehicle(ctx: GameContext, def: VehicleDef, x: number, z: number): Vehicle {
  (ctx.vehicles as VehicleStore).registerDef(def);
  return ctx.vehicles.spawn(def.kind, x, z, 0);
}

describe('en véhicule', () => {
  it('place conducteur : accélérateur, volant, frein, marche arrière, frein à main, klaxon', async () => {
    const r = await setup();
    const { ctx, me, input } = r;
    const cam = record(ctx, 'player:camera');
    const v = spawnVehicle(ctx, fourgon(), 5, 0);
    expect(ctx.vehicles.enter(me, v, 'driver')).toBe(true);
    tick(r);
    expect(ctx.player.vehicle()).toBe(v);
    expect(ctx.player.state.cameraMode).toBe('vehicle_ext');
    input.setMove(0.5, 1);
    tick(r);
    expect(v.cmd.throttle).toBe(1);
    expect(v.cmd.steer).toBe(0.5);
    expect(v.cmd.brake).toBe(0);
    expect(v.engineOn).toBe(true);
    expect(me.cmd.moveX).toBe(0); // le personnage, lui, ne marche pas
    expect(me.cmd.moveZ).toBe(0);
    // on roule en marche avant et on tire le stick en arrière : c'est le frein
    v.speed = 8;
    input.setMove(0, -1);
    tick(r);
    expect(v.cmd.throttle).toBe(0);
    expect(v.cmd.brake).toBe(1);
    // à l'arrêt : marche arrière
    v.speed = 0;
    tick(r);
    expect(v.cmd.throttle).toBe(-1);
    expect(v.cmd.brake).toBe(0);
    // gâchettes analogiques de la manette
    input.setMove(0, 0);
    input.device = 'gamepad';
    input.throttle = 0.6;
    tick(r);
    expect(v.cmd.throttle).toBeCloseTo(0.6, 10);
    input.throttle = 0;
    input.press('handbrake');
    input.press('horn');
    tick(r);
    expect(v.cmd.handbrake).toBe(true);
    expect(v.cmd.horn).toBe(true);
    input.release('handbrake');
    input.release('horn');
    tick(r);
    expect(v.cmd.handbrake).toBe(false);
    expect(v.cmd.horn).toBe(false);
    // caméra intérieure / extérieure, puis descente
    ctx.player.toggleCamera();
    expect(ctx.player.state.cameraMode).toBe('vehicle_int');
    input.setMove(0, 1);
    tick(r);
    ctx.vehicles.exit(me);
    tick(r);
    expect(ctx.player.state.cameraMode).toBe('tps');
    expect(v.cmd.throttle).toBe(0); // personne au volant : commandes relâchées
    expect(cam.map((c) => c.mode)).toEqual(['vehicle_ext', 'vehicle_int', 'tps']);
  });

  it('sirène (événement vehicle:siren), gyrophares, phares', async () => {
    const r = await setup();
    const { ctx, me, input } = r;
    const siren = record(ctx, 'vehicle:siren');
    const v = spawnVehicle(ctx, fourgon(), 5, 0);
    ctx.vehicles.enter(me, v, 'driver');
    const tap = (b: 'siren' | 'beacons' | 'headlights'): void => {
      input.press(b);
      tick(r);
      input.release(b);
      tick(r);
    };
    tap('siren');
    expect(v.siren).toBe(1);
    expect(v.beacons).toBe(true); // pas de deux-tons sans gyrophares
    tap('siren');
    expect(v.siren).toBe(2);
    tap('beacons'); // couper les gyrophares coupe la sirène
    expect(v.beacons).toBe(false);
    expect(v.siren).toBe(0);
    tap('beacons');
    expect(v.beacons).toBe(true);
    expect(v.siren).toBe(0);
    tap('headlights');
    expect(v.headlights).toBe(true);
    expect(siren).toEqual([{ id: v.id, siren: 1 }, { id: v.id, siren: 2 }, { id: v.id, siren: 0 }]);
    // un véhicule civil n'a pas de sirène
    ctx.vehicles.exit(me);
    const car = spawnVehicle(ctx, genericVehicleDef('voiture'), 20, 0);
    ctx.vehicles.enter(me, car, 'driver');
    tap('siren');
    expect(car.siren).toBe(0);
    expect(siren.length).toBe(3);
  });

  it('place de tireur : la tourelle suit le regard à vitesse bornée et tire', async () => {
    const r = await setup();
    const { ctx, me, input } = r;
    const fired = record(ctx, 'vehicle:turret_fired');
    const control = ctx.require<PlayerControlApi>('player.control');
    const v = spawnVehicle(ctx, centaure(), 5, 0);
    ctx.vehicles.enter(me, v, 'gunner');
    tick(r);
    expect(ctx.player.state.cameraMode).toBe('turret');
    expect(control.turretIndex).toBe(0);
    // regard d'un quart de tour à gauche et levé : la tourelle suit, sans téléportation
    // (gisement positif vers la DROITE, convention de sim/vehicles : à gauche, il est négatif)
    input.look(-Math.PI / 2, 0.5);
    tick(r);
    expect(v.turretYaw[0]).toBeLessThan(0);
    expect(v.turretYaw[0]).toBeGreaterThan(-0.1);
    r.t.step(2, DT);
    expect(v.turretYaw[0]).toBeCloseTo(-Math.PI / 2, 5);
    expect(v.turretPitch[0]).toBeCloseTo(0.5, 5);
    input.look(0, 2); // au-delà de la butée haute
    r.t.step(1.5, DT);
    expect(v.turretPitch[0]).toBeCloseTo(0.9, 5);
    // tir coup par coup, cadence bornée par l'intervalle de la tourelle
    const tapFire = (): void => {
      input.press('primary');
      tick(r);
      input.release('primary');
      tick(r);
    };
    tapFire();
    tapFire(); // trop tôt (0,5 s entre deux salves)
    expect(fired).toEqual([{ id: v.id, turret: 0, byId: me.id }]);
    expect(v.turretAmmo[0]).toBe(29);
    r.t.step(0.6, DT);
    tapFire();
    expect(v.turretAmmo[0]).toBe(28);
    // le tireur ne conduit pas
    input.setMove(0, 1);
    tick(r);
    expect(v.cmd.throttle).toBe(0);
  });

  it('engin télépiloté : les commandes pilotent le drone, le personnage reste immobile', async () => {
    const r = await setup('telepilote');
    const { ctx, me, input } = r;
    const control = ctx.require<PlayerControlApi>('player.control');
    const remoteEvents: unknown[] = [];
    ctx.events.onAny('player:remote', (e) => remoteEvents.push(e));
    const d = spawnVehicle(ctx, drone(), 3, 3);
    control.setRemoteVehicle(d.id);
    expect(control.remoteVehicleId).toBe(d.id);
    expect(ctx.player.state.cameraMode).toBe('drone');
    input.setMove(0.4, 1);
    input.press('jump'); // monter
    tick(r, 2);
    expect(d.cmd.throttle).toBe(1);
    expect(d.cmd.strafe).toBe(0.4);
    expect(d.cmd.lift).toBe(1);
    expect(me.cmd.moveX).toBe(0);
    expect(me.cmd.moveZ).toBe(0);
    expect(me.upper).toBe('remote');
    input.release('jump');
    input.press('crouch'); // descendre
    tick(r);
    expect(d.cmd.lift).toBe(-1);
    input.release('crouch');
    // regarder à droite : l'engin doit tourner à droite (steer > 0), la nacelle suit le site
    input.look(0.4, -0.3);
    tick(r);
    expect(d.cmd.steer).toBeGreaterThan(0.9);
    expect(d.turretPitch[0]).toBeCloseTo(-0.8, 5);
    r.t.step(1, DT);
    expect(me.x).toBe(0);
    expect(me.z).toBe(0);
    expect(me.posture).toBe('stand'); // « descendre » n'a pas accroupi le télépilote
    // fin du télépilotage
    control.setRemoteVehicle(0);
    tick(r);
    expect(d.cmd.throttle).toBe(0);
    expect(d.cmd.lift).toBe(0);
    expect(ctx.player.state.cameraMode).toBe('tps');
    expect(me.upper).toBe('none');
    input.setMove(0, 1);
    r.t.step(1, DT);
    expect(Math.hypot(me.x, me.z)).toBeGreaterThan(1); // le personnage remarche
    expect(remoteEvents).toEqual([{ vehicleId: d.id }, { vehicleId: 0 }]);
    // un engin détruit rend la main
    control.setRemoteVehicle(d.id);
    ctx.vehicles.remove(d.id);
    expect(control.remoteVehicleId).toBe(0);
  });
});

describe('commandes neutralisées', () => {
  it('écran modal ou controlEnabled faux : ni déplacement, ni regard, ni objet, ni conduite', async () => {
    const r = await setup();
    const { ctx, me, input, actions } = r;
    const st = ctx.player.state;
    actions.give(me, 'baton', 1);
    actions.give(me, 'bouclier', 1);
    actions.select(me, 1);
    let modal = false;
    const base = ctx.ui;
    ctx.ui = Object.create(base, { modal: { get: () => modal } }) as UiApi;

    input.setMove(0, 1);
    input.press('secondary');
    r.t.step(1, DT);
    expect(me.alt).toBe(true);
    expect(Math.hypot(me.vx, me.vz)).toBeGreaterThan(1);

    modal = true;
    input.look(1, 0.5);
    input.press('primary');
    input.press('mask');
    input.press('slot1');
    tick(r);
    expect(me.cmd.moveX).toBe(0);
    expect(me.cmd.moveZ).toBe(0);
    expect(me.alt).toBe(false); // le bouclier est baissé
    expect(st.camYaw).toBe(0);
    expect(st.camPitch).toBe(0);
    expect(actions.uses.length).toBe(0);
    expect(me.active).toBe(1);
    r.t.step(1, DT);
    expect(Math.hypot(me.vx, me.vz)).toBe(0);

    modal = false;
    input.release('primary');
    input.release('mask');
    input.release('slot1');
    st.controlEnabled = false;
    r.t.step(0.5, DT);
    expect(me.cmd.moveZ).toBe(0);
    st.controlEnabled = true;
    r.t.step(0.5, DT);
    expect(me.cmd.moveZ).toBeGreaterThan(0);

    // au volant : l'ouverture d'un écran relâche l'accélérateur
    input.release('secondary');
    const v = spawnVehicle(ctx, fourgon(), 30, 0);
    ctx.vehicles.enter(me, v, 'driver');
    input.setMove(1, 1);
    tick(r);
    expect(v.cmd.throttle).toBe(1);
    modal = true;
    tick(r);
    expect(v.cmd.throttle).toBe(0);
    expect(v.cmd.steer).toBe(0);
  });
});

describe('remise à zéro entre deux sessions', () => {
  it('une nouvelle session repart de zéro : joueur, actions en cours, états privés', async () => {
    const r = await setup();
    const { t, ctx, me, input } = r;
    const control = ctx.require<PlayerControlApi>('player.control');
    const victim = ctx.people.spawn({ kind: 'manifestant', x: 0.9, z: 0 });
    ctx.health.hurt(victim, { amount: 400, kind: 'blunt', sourceId: 0, x: 0.9, z: 0 });
    expect(ctx.interactions.startVerb(me, 'porter', victim.id)).toBe(true);
    const d = spawnVehicle(ctx, drone(), 3, 3);
    control.setRemoteVehicle(d.id);
    input.look(0.7, 0.2);
    tick(r, 3);
    expect(ctx.interactions.current(me)).not.toBeNull();

    await t.start();
    const st = ctx.player.state;
    expect(st.personId).toBe(0);
    expect(st.camYaw).toBe(0);
    expect(st.cameraMode).toBe('tps');
    expect(st.prompt).toBeNull();
    expect(control.remoteVehicleId).toBe(0);
    expect(ctx.player.person()).toBeNull();
    expect(ctx.people.list.length).toBe(0);
    // le module refonctionne aussitôt dans la nouvelle session
    const again = ctx.people.spawn({ kind: 'crs', x: 0, z: 0 });
    expect(ctx.interactions.current(again)).toBeNull();
    ctx.player.possess(again.id);
    input.setMove(0, 1);
    t.step(1, DT);
    expect(again.z).toBeGreaterThan(1);
    expect(ctx.health.isIncapacitated(again)).toBe(false);
  });
});
