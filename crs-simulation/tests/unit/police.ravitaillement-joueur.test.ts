// Ravitaillement du JOUEUR : au fourgon de son unité (interaction), réserve vide → demande radio → arrivée de la
// logistique après le délai, indication à l'écran (seuils, véhicule le plus proche qui a encore de quoi, engins).
import { describe, expect, it, vi } from 'vitest';
import type { GameContext, GameSystem, InteractionOption, Person, Vehicle } from '@/core/contracts';
import { SystemOrder } from '@/core/contracts';
import { createObjectives } from '@/ui/core/objectives';
import { createTestContext } from '@/core/testing';
import { EXT } from '@/core/extensions';
import type { ObjectivesApi } from '@/core/extensions';
import { createSystems as world } from '@/world/query';
import { createSystems as people } from '@/sim/people';
import { createSystems as items } from '@/sim/items';
import { createSystems as hazards } from '@/sim/hazards';
import { createSystems as law } from '@/gameplay/law';
import { PoliceSystem } from '@/sim/police/system';
import { VehiclesSystem } from '@/sim/vehicles/system';
import type { VehiclesExtApi } from '@/sim/vehicles/api';
import { createFakeWorld } from '@/sim/vehicles/testkit';
import { PlayerSupplySystem, SUPPLY_OBJECTIVE_ID, assessLoad, footHintText, launcherHint, tankHint } from '@/sim/police/supply-player';
import type { PlayerSupplyApi, PoliceUnitsApi } from '@/sim/police/api';
import { PLAYER_SUPPLY_SERVICE, POLICE_UNITS_SERVICE } from '@/sim/police/api';

const MODULES = [world, people, items, hazards, law];
const NORTH = Math.PI;

function count(p: Person, id: string): number {
  const s = p.inventory.find((i) => i.id === id);
  return s ? s.count : 0;
}

/** Objectifs affichés (le service de l'interface, sans DOM). */
const objectivesSystem = (): GameSystem => ({
  id: 'test.objectives',
  order: SystemOrder.UI,
  provide(ctx: GameContext): void {
    ctx.provide(EXT.objectives, createObjectives());
  },
});

async function setup(poste: 'lanceur' | 'lbd' = 'lanceur') {
  const t = createTestContext({ seed: 7, modules: MODULES, systems: [new PoliceSystem(), new PlayerSupplySystem(), objectivesSystem()] });
  await t.start({ mode: 'test', x: 0, z: -100 });
  const ctx = t.ctx;
  const units = ctx.require<PoliceUnitsApi>(POLICE_UNITS_SERVICE);
  const supply = ctx.require<PlayerSupplyApi>(PLAYER_SUPPLY_SERVICE);
  const sec = units.createSection({ x: 0, z: -90, heading: NORTH, layout: 'ligne', vehicles: true });
  t.step(1);
  const me = sec.people.find((p) => p.poste === poste)!;
  ctx.player.possess(me.id, 'crs');
  const notes: string[] = [];
  vi.spyOn(ctx.ui, 'notify').mockImplementation((text: string) => {
    notes.push(text);
  });
  // le fourgon du groupe du joueur
  const van = ctx.vehicles.get(ctx.squads.get(me.squadId)!.vehicleId)!;
  van.speed = 0;
  return { t, ctx, units, supply, sec, me, van, notes };
}

/** Place la personne derrière le véhicule (portes arrière). */
function behind(p: Person, v: Vehicle, extra = 1.0): void {
  const back = v.def.length * 0.5 + extra;
  p.x = v.x - Math.sin(v.heading) * back;
  p.z = v.z - Math.cos(v.heading) * back;
}

function option(ctx: ReturnType<typeof createTestContext>['ctx'], p: Person): InteractionOption | undefined {
  const out: InteractionOption[] = [];
  const n = ctx.interactions.options(p, out);
  return out.slice(0, n).find((o) => o.verb === 'ravitailler');
}

describe('ravitaillement du joueur — au fourgon', () => {
  it('lanceur sans grenades : « Se ravitailler » à l’arrière du fourgon rend la dotation et décompte la réserve', async () => {
    const { t, ctx, units, me, van, notes } = await setup('lanceur');
    ctx.actions.remove(me, 'grenade_lacrymo');
    ctx.actions.remove(me, 'grenade_gm2l', 1);
    me.inventory.find((s) => s.id === 'lanceur_cougar')!.count = 3;
    const r0 = { ...units.reserveOf(van.id)! };
    behind(me, van);
    t.step(0.1);
    const o = option(ctx, me);
    expect(o).toBeDefined();
    expect(o!.label).toContain('Se ravitailler');
    expect(o!.duration).toBeGreaterThan(1);
    expect(ctx.interactions.start(me, o!)).toBe(true);
    t.step(o!.duration + 0.5);
    expect(count(me, 'grenade_lacrymo')).toBe(4);
    expect(count(me, 'grenade_gm2l')).toBe(2);
    expect(count(me, 'lanceur_cougar')).toBe(8);
    const r1 = units.reserveOf(van.id)!;
    expect(r1.lacrymoMain).toBe(r0.lacrymoMain - 4);
    expect(r1.gm2l).toBe(r0.gm2l - 1);
    expect(r1.lacrymoLanceur).toBe(r0.lacrymoLanceur - 5);
    const msg = notes.find((n) => n.includes('+4 grenades lacrymogènes'));
    expect(msg).toBeDefined();
    expect(msg).toContain('réserve du fourgon');
    expect(msg).toContain('grenades lacrymogènes ' + (r0.lacrymoMain - 4) + ' / 12');
    // dotation complète : plus rien à proposer
    t.step(0.6);
    expect(option(ctx, me)).toBeUndefined();
  });

  it('réserve basse : ravitaillement partiel, la réserve tombe à zéro sans jamais devenir négative', async () => {
    const { t, ctx, units, me, van } = await setup('lanceur');
    ctx.actions.remove(me, 'grenade_lacrymo');
    const r = units.reserveOf(van.id)!;
    r.lacrymoMain = 1;
    behind(me, van);
    t.step(0.1);
    const o = option(ctx, me)!;
    ctx.interactions.start(me, o);
    t.step(o.duration + 0.5);
    expect(count(me, 'grenade_lacrymo')).toBe(1);
    expect(r.lacrymoMain).toBe(0);
  });

  it('réserve vide : message clair, demande radio, puis arrivée de la logistique après le délai et ravitaillement possible', async () => {
    const { t, ctx, units, supply, sec, me, van, notes } = await setup('lbd');
    supply.restockDelay = 60;
    ctx.actions.remove(me, 'lbd40', 6);
    for (const v of sec.vehicles) units.reserveOf(v.id)!.lbd = 0;
    behind(me, van);
    t.step(0.6);
    // indication : plus de munitions, réserves vides → demander par radio
    expect(supply.hint()!.text).toContain('demandez le ravitaillement par radio');
    const o = option(ctx, me)!;
    expect(o.label).toContain('Réserve vide');
    expect(o.duration).toBe(0);
    const radio0 = ctx.radio.log.length;
    expect(ctx.interactions.start(me, o)).toBe(true);
    expect(notes.some((n) => n.includes('Demande de ravitaillement transmise'))).toBe(true);
    expect(ctx.radio.log.slice(radio0).some((m) => m.text.includes('Demande de ravitaillement'))).toBe(true);
    expect(units.reserveOf(van.id)!.lbd).toBe(0);
    // seconde demande : déjà en cours
    expect(supply.request()).toBe(false);
    t.step(1);
    expect(supply.hint()!.level).toBe('attente');
    t.step(30);
    expect(units.reserveOf(van.id)!.lbd).toBe(0);
    t.step(31);
    expect(units.reserveOf(van.id)!.lbd).toBe(12);
    expect(ctx.radio.log.some((m) => m.text.includes('Ravitaillement arrivé, zone de stationnement'))).toBe(true);
    console.log('radio :', ctx.radio.log.slice(radio0).map((m) => m.from + ' — ' + m.text).join(' | '));
    // le joueur peut maintenant se ravitailler
    behind(me, van);
    t.step(0.6);
    const o2 = option(ctx, me)!;
    expect(o2.label).toContain('Se ravitailler');
    ctx.interactions.start(me, o2);
    t.step(o2.duration + 0.5);
    expect(count(me, 'lbd40')).toBe(6);
    expect(units.reserveOf(van.id)!.lbd).toBe(6);
  });

  it('fourgon en feu : aucune proposition', async () => {
    const { t, ctx, me, van } = await setup('lanceur');
    ctx.actions.remove(me, 'grenade_lacrymo');
    van.state = 'burning';
    van.burning = 0.6;
    behind(me, van);
    t.step(0.1);
    expect(option(ctx, me)).toBeUndefined();
  });

  it('pas pour un civil, ni pour un agent interpellé', async () => {
    const { t, ctx, me, van } = await setup('lanceur');
    const civil = ctx.people.spawn({ kind: 'passant', x: 0, z: 0 });
    ctx.actions.give(civil, 'grenade_lacrymo', 0);
    ctx.player.possess(civil.id, 'manifestant');
    behind(civil, van);
    t.step(0.1);
    expect(option(ctx, civil)).toBeUndefined();
    ctx.actions.remove(me, 'grenade_lacrymo');
    me.custody = 'cuffed';
    behind(me, van);
    expect(option(ctx, me)).toBeUndefined();
  });

  it('indication : munitions basses → fourgon le plus proche qui a encore de quoi, objectif GPS posé', async () => {
    const { t, ctx, units, supply, sec, me, van } = await setup('lbd');
    me.inventory.find((s) => s.id === 'lbd40')!.count = 1;
    t.step(0.6);
    let h = supply.hint()!;
    expect(h.level).toBe('bas');
    expect(h.text).toContain('Munitions basses');
    expect(h.text).toContain('touche d’interaction');
    // le fourgon du groupe n'a plus de munitions LBD : on indique un autre véhicule de la section
    units.reserveOf(van.id)!.lbd = 0;
    t.step(0.6);
    h = supply.hint()!;
    expect(h.vehicleId).not.toBe(van.id);
    expect(sec.vehicles.some((v) => v.id === h.vehicleId)).toBe(true);
    const obj = ctx.require<ObjectivesApi>(EXT.objectives);
    const marker = obj.list.find((o) => o.id === SUPPLY_OBJECTIVE_ID)!;
    expect(marker).toBeDefined();
    expect(Math.hypot(marker.x! - h.x, marker.z! - h.z)).toBeLessThan(2);
    expect(obj.tracked).toBe(SUPPLY_OBJECTIVE_ID);
    // dotation pleine : plus d'indication
    me.inventory.find((s) => s.id === 'lbd40')!.count = 6;
    t.step(0.6);
    expect(supply.hint()).toBeNull();
    expect(obj.list.some((o) => o.id === SUPPLY_OBJECTIVE_ID)).toBe(false);
    expect(obj.tracked).toBe('');
  });
});

describe('ravitaillement du joueur — dotation réellement perçue', () => {
  it('un objet que le joueur n’a jamais eu n’est pas signalé comme épuisé (télépilote sans aérosol)', async () => {
    const t = createTestContext({ seed: 7, modules: MODULES, systems: [new PoliceSystem(), new PlayerSupplySystem(), objectivesSystem()] });
    await t.start({ mode: 'test', x: 0, z: -100 });
    const ctx = t.ctx;
    const units = ctx.require<PoliceUnitsApi>(POLICE_UNITS_SERVICE);
    const supply = ctx.require<PlayerSupplyApi>(PLAYER_SUPPLY_SERVICE);
    const sec = units.createSection({ x: 0, z: -90, heading: NORTH, layout: 'ligne', vehicles: true });
    t.step(1);
    const me = sec.people.find((p) => p.poste === 'lbd')!;
    // ce poste-là n'a perçu ni aérosol ni menottes (comme un télépilote ou un équipage d'engin)
    ctx.actions.remove(me, 'gazeuse');
    ctx.actions.remove(me, 'menottes');
    expect(count(me, 'gazeuse')).toBe(0);
    ctx.player.possess(me.id, 'crs');
    t.step(1);
    expect(supply.hint()).toBeNull();
    const obj = ctx.require<ObjectivesApi>(EXT.objectives);
    expect(obj.list.some((o) => o.id === SUPPLY_OBJECTIVE_ID)).toBe(false);
    // rien à proposer au fourgon non plus : sa dotation perçue est complète
    const van = ctx.vehicles.get(ctx.squads.get(me.squadId)!.vehicleId)!;
    van.speed = 0;
    behind(me, van);
    t.step(0.6);
    expect(option(ctx, me)).toBeUndefined();
    // en revanche, ce qu'il a perçu et dépensé est bien signalé
    me.inventory.find((s) => s.id === 'lbd40')!.count = 0;
    me.x = 40;
    t.step(0.6);
    expect(supply.hint()).not.toBeNull();
    expect(supply.hint()!.text).not.toContain('aérosol');
  });
});

describe('ravitaillement du joueur — logique d’indication', () => {
  it('seuils : au quart ou moins → bas ; à zéro → vide', () => {
    expect(assessLoad([{ id: 'lbd40', have: 6, full: 6 }]).level).toBe('ok');
    expect(assessLoad([{ id: 'lbd40', have: 2, full: 6 }]).level).toBe('ok');
    expect(assessLoad([{ id: 'lbd40', have: 1, full: 6 }]).level).toBe('bas');
    expect(assessLoad([{ id: 'grenade_lacrymo', have: 1, full: 4 }]).level).toBe('bas');
    const a = assessLoad([{ id: 'grenade_lacrymo', have: 1, full: 4 }, { id: 'lbd40', have: 0, full: 6 }]);
    expect(a.level).toBe('vide');
    expect(a.ids[0]).toBe('lbd40');
    expect(footHintText('vide', ['grenade_lacrymo'], 'au fourgon', -1)).toBe('Plus de grenades lacrymogènes : ravitaillez-vous au fourgon (touche d’interaction, à l’arrière du véhicule)');
    expect(footHintText('bas', ['lbd40'], '', 4)).toContain('arrivée à la zone de stationnement dans environ 4 min');
  });

  it('Centaure : tubes vides → arrêt et grenades en soute ; soute épuisée → demande de ravitaillement', () => {
    expect(launcherHint(6, 6, 30, false)).toBeNull();
    expect(launcherHint(1, 6, 30, false)!.level).toBe('bas');
    expect(launcherHint(0, 6, 24, false)!.text).toContain('arrêtez l’engin');
    expect(launcherHint(0, 6, 24, false)!.text).toContain('24 grenades de 56 mm en soute');
    expect(launcherHint(0, 6, 0, false)!.text).toContain('soute épuisée');
    expect(launcherHint(0, 6, 0, false)!.text).toContain('demandez le ravitaillement par radio');
    expect(launcherHint(0, 6, 0, false, 4)!.text).toContain('soute complétée dans environ 4 min');
    expect(launcherHint(0, 6, 0, false, 4)!.level).toBe('attente');
    expect(launcherHint(0, 6, 24, true)!.text).toContain('restez à l’arrêt');
  });

  it('canon à eau : cuve basse → bouche d’incendie, distance et durée du plein', () => {
    expect(tankHint(8000, 10000, false, 100)).toBeNull();
    const h = tankHint(2000, 10000, false, 120)!;
    expect(h.text).toContain('Cuve basse (2000 l)');
    expect(h.text).toContain('moins de 45 m');
    expect(h.text).toContain('90 s');
    expect(tankHint(0, 10000, false, -1)!.text).toContain('aucune bouche d’incendie');
    expect(tankHint(5000, 10000, true, 10)!.text).toContain('Plein en cours');
  });
});

describe('ravitaillement du joueur — engins conduits par le joueur', () => {
  async function engine(kind: 'centaure' | 'canon_eau') {
    const t = createTestContext({ seed: 3, systems: [new VehiclesSystem(), new PoliceSystem(), new PlayerSupplySystem(), objectivesSystem()] });
    await t.ready;
    t.ctx.world = createFakeWorld();
    await t.start({ mode: 'test' });
    const ctx = t.ctx;
    const v = ctx.vehicles.spawn(kind, 0, 0, 0, { faction: 'police' });
    const me = ctx.people.spawn({ kind: 'gendarme', x: 0, z: 0 });
    expect(ctx.vehicles.enter(me, v, 'driver')).toBe(true);
    ctx.player.possess(me.id, 'crs');
    const supply = ctx.require<PlayerSupplyApi>(PLAYER_SUPPLY_SERVICE);
    const ext = ctx.require<VehiclesExtApi>('vehicles.ext');
    return { t, ctx, v, me, supply, ext };
  }

  it('Centaure du joueur : tubes vides → indication, puis rechargement de lui-même à l’arrêt', async () => {
    const { t, ctx, v, me, supply, ext } = await engine('centaure');
    const cap = v.def.turrets[0].capacity;
    const reserve0 = ext.turretStatus(v, 0).reserve;
    // le joueur vide les tubes d'une seule salve
    ext.aimTurretAt(v, 0, 30, 0, 90);
    t.step(3);
    ext.setSalvo(v, 0, cap);
    expect(ctx.vehicles.fireTurret(v, 0, me.id)).toBe(true);
    let seen = '';
    for (let i = 0; i < 120 && v.turretAmmo[0] !== 0; i++) t.step(0.5);
    for (let i = 0; i < 20; i++) {
      t.step(0.5);
      const h = supply.hint();
      if (h && seen === '') seen = h.text;
    }
    expect(v.turretAmmo[0]).toBe(0);
    expect(seen).toMatch(/Tubes vides : arrêtez l’engin|Rechargement des tubes en cours/);
    expect(supply.hint()!.level).toBe('vide');
    t.step(200);
    expect(v.turretAmmo[0]).toBe(Math.min(cap, reserve0));
    expect(ext.turretStatus(v, 0).reserve).toBe(reserve0 - Math.min(cap, reserve0));
  });

  it('Centaure du joueur : soute épuisée → demande par radio → la logistique complète la soute après le délai', async () => {
    const t = createTestContext({ seed: 3, systems: [new VehiclesSystem(), new PoliceSystem(), new PlayerSupplySystem(), objectivesSystem()] });
    await t.ready;
    t.ctx.world = createFakeWorld();
    await t.start({ mode: 'test' });
    const ctx = t.ctx;
    const units = ctx.require<PoliceUnitsApi>(POLICE_UNITS_SERVICE);
    const supply = ctx.require<PlayerSupplyApi>(PLAYER_SUPPLY_SERVICE);
    const ext = ctx.require<VehiclesExtApi>('vehicles.ext');
    const crew = units.createEquipage('centaure', { x: 0, z: 0, heading: 0 });
    const v = crew.vehicles[0]!;
    const me = ctx.people.get(v.seats[0]!)!;
    ctx.player.possess(me.id, 'gendarme_centaure');
    const cap = v.def.turrets[0].capacity;
    const full = ext.turretStatus(v, 0).reserve;
    expect(full).toBeGreaterThan(0);
    // le joueur tire toute sa dotation : tubes puis soute, salve après salve (rechargement à l'arrêt entre deux)
    ext.aimTurretAt(v, 0, 30, 0, 90);
    t.step(3);
    for (let salvo = 0; salvo < 12 && (v.turretAmmo[0]! > 0 || ext.turretStatus(v, 0).reserve > 0); salvo++) {
      for (let i = 0; i < 600 && v.turretAmmo[0] === 0 && ext.turretStatus(v, 0).reserve > 0; i++) t.step(0.5);
      if (v.turretAmmo[0] === 0) break;
      ext.setSalvo(v, 0, cap);
      ctx.vehicles.fireTurret(v, 0, me.id);
      for (let i = 0; i < 120 && v.turretAmmo[0] !== 0; i++) t.step(0.5);
    }
    expect(v.turretAmmo[0]).toBe(0);
    expect(ext.turretStatus(v, 0).reserve).toBe(0);
    t.step(1);
    // plus rien à bord : l'indication dit comment se réapprovisionner
    expect(supply.hint()!.text).toContain('demandez le ravitaillement par radio');
    supply.restockDelay = 120;
    expect(supply.request()).toBe(true);
    expect(supply.request()).toBe(false); // une seule demande à la fois
    t.step(1);
    expect(supply.hint()!.level).toBe('attente');
    expect(supply.hint()!.text).toContain('ravitaillement demandé');
    t.step(60);
    expect(ext.turretStatus(v, 0).reserve).toBe(0);
    // arrivée de la logistique : soute complétée, puis les tubes se rechargent d'eux-mêmes à l'arrêt
    t.step(70);
    expect(ext.turretStatus(v, 0).reserve + v.turretAmmo[0]!).toBe(full);
    t.step(200);
    expect(v.turretAmmo[0]).toBe(cap);
    expect(ext.turretStatus(v, 0).reserve).toBe(full - cap);
  });

  it('canon à eau du joueur : cuve basse → marqueur sur la bouche d’incendie ; arrêté à moins de 45 m, le plein se fait', async () => {
    const { t, ctx, v, supply } = await engine('canon_eau');
    const cap = v.def.turrets[0].capacity;
    const hydrant = ctx.props.spawn('bouche_incendie', 30, 0, 0);
    for (let i = 0; i < v.turretAmmo.length; i++) v.turretAmmo[i] = cap * 0.1; // une cuve pour les deux canons
    t.step(0.6);
    const h = supply.hint()!;
    expect(h.text).toContain('bouche d’incendie');
    expect(Math.hypot(h.x - hydrant.x, h.z - hydrant.z)).toBeLessThan(0.5);
    t.step(120);
    expect(v.turretAmmo[0]).toBeGreaterThanOrEqual(cap * 0.97);
  });

  it('canon à eau du joueur loin de toute bouche : pas de plein tiré de nulle part', async () => {
    const { t, ctx, v } = await engine('canon_eau');
    const cap = v.def.turrets[0].capacity;
    ctx.props.spawn('bouche_incendie', 300, 0, 0);
    for (let i = 0; i < v.turretAmmo.length; i++) v.turretAmmo[i] = cap * 0.1; // une cuve pour les deux canons
    t.step(30);
    expect(v.turretAmmo[0]).toBeCloseTo(cap * 0.1, 0);
  });
});
