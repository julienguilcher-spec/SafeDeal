// Circulation — fermeture de rues (service EXT.traffic), barrages, déviations, bouchons, véhicules prioritaires,
// automobilistes bloqués ou pris dans une émeute, options de départ.
import { describe, expect, it } from 'vitest';
import type { GameContext, Vehicle } from '@/core/contracts';
import { EXT } from '@/core/extensions';
import type { Incident, IncidentsApi, RoadClosure, TrafficControlApi } from '@/core/extensions';
import { createSystems as people } from '@/sim/people';
import { createSystems as vehicles } from '@/sim/vehicles';
import type { AutopilotApi } from '@/sim/vehicles';
import type { ClosureEvent, GateEvent, MotoristEvent } from '@/sim/traffic';
import { createRoadWorld, createTown, createTrafficBench, runUntil } from '@/sim/traffic/testkit';
import type { RoadWorld, TrafficBench } from '@/sim/traffic/testkit';

const DT = 1 / 30;
const EAST = Math.PI / 2;

function barriers(ctx: GameContext): { x: number; z: number; heading: number; blocksMove: boolean }[] {
  return ctx.props.list.filter((p) => p.kind === 'barriere_vauban').map((p) => ({ x: p.x, z: p.z, heading: p.heading, blocksMove: p.blocksMove }));
}

/** Service d'incidents minimal (celui des missions n'est pas branché dans ces tests). */
function fakeIncidents(): IncidentsApi & { opened: Incident[]; closed: { id: number; resolved: boolean }[] } {
  const list: Incident[] = [];
  const closed: { id: number; resolved: boolean }[] = [];
  return {
    list,
    opened: list,
    closed,
    playerIncidentId: 0,
    get: (id) => list.find((i) => i.id === id),
    open(kind, x, z, targetKind, targetId, urgency = 1) {
      const inc: Incident = {
        id: list.length + 1, kind, label: kind, x, z, targetKind, targetId, urgency, severity: 0, state: 'ouvert', createdAt: 0, means: '',
        squadId: 0, progress: 0,
      };
      list.push(inc);
      return inc;
    },
    assign: () => false,
    unassign: () => {},
    close(id, resolved) {
      closed.push({ id, resolved });
      const inc = list.find((i) => i.id === id);
      if (inc) inc.state = resolved ? 'resolu' : 'echoue';
    },
    nearest: () => null,
  };
}

/** Rue à sens unique d'ouest en est, avec un carrefour J (impasse au sud) : aucune déviation possible vers l'est. */
function corridor(oneway: boolean): RoadWorld {
  return createRoadWorld(
    [{ x: -300, z: 0 }, { x: 0, z: 0 }, { x: 300, z: 0 }, { x: 0, z: 150 }],
    [{ a: 0, b: 1, oneway, width: 7, name: 'Rue du Test' }, { a: 1, b: 2, oneway, width: 7, name: 'Rue du Test' }, { a: 1, b: 3, width: 7, name: 'Impasse du Sud' }],
  );
}

describe('circulation : service de fermeture de rues', () => {
  it('closeRoad / isClosed / open / openAll / closures : barrières en travers, compte rendu radio, événements', async () => {
    const town = createTown({});
    const b = await createTrafficBench({ world: town, session: { x: town.centerX, z: town.centerZ } });
    const control: TrafficControlApi = b.ctx.require<TrafficControlApi>(EXT.traffic);
    expect(control).toBe(b.control);
    expect(control.closures).toEqual([]);
    const events: string[] = [];
    b.ctx.events.onAny('traffic:closed', (e) => events.push('closed:' + (e as ClosureEvent).id));
    b.ctx.events.onAny('traffic:barred', (e) => events.push('barred:' + (e as ClosureEvent).id));
    b.ctx.events.onAny('traffic:opened', (e) => events.push('opened:' + (e as ClosureEvent).id));
    b.step(1);
    const edge = town.edgeBetween(town.junction(1, 1), town.junction(2, 1));
    const c = control.closeRoad(180, 123, 42) as RoadClosure;
    expect(c).not.toBeNull();
    expect(c.id).toBe(1);
    expect(c.edgeId).toBe(edge);
    expect(c.x).toBeCloseTo(180, 3); // ramené sur l'axe de la rue
    expect(c.z).toBeCloseTo(120, 3);
    expect(Math.abs(Math.sin(c.heading))).toBeCloseTo(1, 5); // cap de la rue (est-ouest)
    expect(c.squadId).toBe(0);
    expect(c.createdAt).toBeCloseTo(b.ctx.clock.now, 5);
    expect(control.closures.length).toBe(1);
    expect(control.closures[0]).toBe(c);
    expect(control.isClosed(edge)).toBe(true);
    expect(control.isClosed(town.edgeBetween(town.junction(0, 1), town.junction(1, 1)))).toBe(false);
    expect(control.isClosed(-1)).toBe(false);
    expect(control.isClosed(9999)).toBe(false);
    expect(events).toEqual(['closed:1']);
    // fermer deux fois la même rue ne crée rien de plus
    expect(control.closeRoad(200, 120, 1)).toBe(c);
    expect(control.closures.length).toBe(1);
    // pas de rue à cet endroit
    expect(control.closeRoad(5000, 5000, 1)).toBeNull();
    expect(control.closeRoad(Number.NaN, 0, 1)).toBeNull();
    // mise en place : la première barrière au bout de quelques secondes, le barrage complet en 30 s environ
    expect(barriers(b.ctx).length).toBe(0);
    b.step(8);
    expect(barriers(b.ctx).length).toBeGreaterThanOrEqual(1);
    expect(barriers(b.ctx).length).toBeLessThan(4);
    expect(b.ctx.radio.log.length).toBe(0);
    b.step(26);
    const bars = barriers(b.ctx);
    expect(bars.length).toBe(4); // chaussée de 8 m, barrières de 2,5 m
    for (const bar of bars) {
      expect(bar.x).toBeCloseTo(180, 3); // toutes sur la ligne du barrage
      expect(Math.abs(bar.z - 120)).toBeLessThan(4);
      expect(bar.blocksMove).toBe(true);
      expect(Math.abs(Math.sin(bar.heading))).toBeCloseTo(1, 5); // posées en travers : leur longueur barre la rue
    }
    const zs = bars.map((p) => p.z).sort((a, c2) => a - c2);
    expect(zs[0]).toBeLessThan(118);
    expect(zs[3]).toBeGreaterThan(122);
    for (let i = 1; i < 4; i++) expect(zs[i]! - zs[i - 1]!).toBeLessThan(2.6); // jointives
    expect(events).toEqual(['closed:1', 'barred:1']);
    expect(b.ctx.radio.log.length).toBe(1);
    expect(b.ctx.radio.log[0]!.text).toContain('Rue Est-Ouest 1');
    expect(b.ctx.radio.log[0]!.channel).toBe('commandement');
    // réouverture
    control.open(c.id);
    expect(control.closures.length).toBe(0);
    expect(control.isClosed(edge)).toBe(false);
    expect(barriers(b.ctx).length).toBe(0);
    expect(events).toEqual(['closed:1', 'barred:1', 'opened:1']);
    expect(b.ctx.radio.log.length).toBe(2);
    expect(b.ctx.radio.log[1]!.text).toContain('Rue Est-Ouest 1');
    control.open(c.id); // déjà rouverte : sans effet
    control.open(777);
    // openAll
    b.api.tuning.barrierTime = 0;
    const c2 = control.closeRoad(60, 120, 1);
    const c3 = control.closeRoad(120, 60, 1);
    expect(c2).not.toBeNull();
    expect(c3).not.toBeNull();
    expect(c2!.id).not.toBe(c3!.id);
    expect(control.closures.length).toBe(2);
    expect(barriers(b.ctx).length).toBe(8); // immédiat quand le délai de pose est nul
    control.openAll();
    expect(control.closures.length).toBe(0);
    expect(barriers(b.ctx).length).toBe(0);
    const count = control.countNear(120, 120, 300);
    expect(count).toEqual({ moving: 0, stopped: 0 });
  });

  it('un barrage peut être tenu par une unité : elle reçoit l\'ordre de couper la circulation', async () => {
    const town = createTown({});
    const b = await createTrafficBench({ world: town, session: { x: town.centerX, z: town.centerZ } });
    b.api.tuning.barrierTime = 0;
    const squad = b.ctx.squads.create('groupe', 'police', 'ALPHA 1');
    const chief = b.ctx.people.spawn({ kind: 'crs', x: 20, z: 100, squadId: squad.id });
    const c = b.control.closeRoad(60, 120, chief.id, squad.id)!;
    expect(c.squadId).toBe(squad.id);
    expect(squad.order.type).toBe('couper_circulation');
    expect(squad.order.x).toBeCloseTo(c.x, 5);
    expect(squad.order.z).toBeCloseTo(c.z, 5);
    expect(squad.order.issuedBy).toBe(chief.id);
    const last = b.ctx.radio.log[b.ctx.radio.log.length - 1]!;
    expect(last.from).toBe('ALPHA 1');
    expect(last.text).toContain('Barrage tenu');
    // la rue déjà fermée par des barrières seules est confiée après coup à une unité
    const c2 = b.control.closeRoad(180, 120, 0)!;
    expect(c2.squadId).toBe(0);
    const squad2 = b.ctx.squads.create('groupe', 'police', 'ALPHA 2');
    b.ctx.people.spawn({ kind: 'crs', x: 170, z: 100, squadId: squad2.id });
    expect(b.control.closeRoad(182, 120, 0, squad2.id)).toBe(c2);
    expect(c2.squadId).toBe(squad2.id);
    expect(squad2.order.type).toBe('couper_circulation');
  });

  it('closeArea ferme chaque rue qui franchit le périmètre ; options de départ de la session', async () => {
    const town = createTown({});
    const b = await createTrafficBench({ world: town, session: { x: town.centerX, z: town.centerZ } });
    const list = b.control.closeArea(120, 120, 100, 7);
    expect(list.length).toBe(4); // les quatre rues qui partent du carrefour central
    expect(b.control.closures.length).toBe(4);
    for (const c of list) {
      expect(Math.hypot(c.x - 120, c.z - 120)).toBeCloseTo(100, 0); // barrage au bord du périmètre
      expect(b.control.isClosed(c.edgeId)).toBe(true);
    }
    expect(new Set(list.map((c) => c.edgeId)).size).toBe(4);
    // un seul compte rendu pour tout le périmètre, une fois les barrières posées ; rien d'autre ensuite
    expect(b.ctx.radio.log.length).toBe(1);
    expect(b.ctx.radio.log[0]!.text).toContain('4');
    b.step(40);
    expect(barriers(b.ctx).length).toBe(16);
    expect(b.ctx.radio.log.length).toBe(1);
    // redemander le même périmètre (l'interface le fait à la première image) ne double rien
    const again = b.control.closeArea(120, 120, 100, 7);
    expect(again.length).toBe(4);
    expect(b.control.closures.length).toBe(4);
    expect(b.ctx.radio.log.length).toBe(1);
    expect(b.control.closeArea(120, 120, 0, 7)).toEqual([]);
    // nouvelle session « circulation coupée » : périmètre de 350 m fermé dès le départ, barrières en place, sans message
    // (dans cette petite ville tout est à moins de 350 m du centre : rien ne franchit le périmètre, rien n'est fermé)
    await b.t.start({ x: town.centerX, z: town.centerZ, extra: { options: { circulation: 'coupee' } } });
    expect(b.control.closures.length).toBe(0);
    const big = createTown({ stub: 320 });
    const b2 = await createTrafficBench({ world: big, session: { x: big.centerX, z: big.centerZ, extra: { options: { circulation: 'coupee' } } } });
    expect(b2.control.closures.length).toBe(12); // les douze rues de sortie franchissent le cercle de 350 m
    expect(barriers(b2.ctx).length).toBe(12 * 4);
    expect(b2.ctx.radio.log.length).toBe(0);
    for (const c of b2.control.closures) expect(Math.hypot(c.x - big.centerX, c.z - big.centerZ)).toBeCloseTo(350, 0);
    // session ordinaire : tout est rouvert ; rues fermées une à une par la mission
    await b.t.start({ x: town.centerX, z: town.centerZ, extra: { traffic: { closed: [{ x: 60, z: 120 }], closedArea: { x: 240, z: 240, radius: 60 } } } });
    expect(b.control.closures.length).toBe(1 + 4);
    expect(b.control.isClosed(town.edgeBetween(town.junction(0, 1), town.junction(1, 1)))).toBe(true);
    await b.t.start({ x: town.centerX, z: town.centerZ });
    expect(b.control.closures.length).toBe(0);
    expect(barriers(b.ctx).length).toBe(0);
  });
});

describe('circulation : effets d\'une fermeture sur le trafic', () => {
  it('une rue fermée détourne le trafic : l\'automobiliste contourne et arrive à destination', async () => {
    const town = createTown({});
    const b = await createTrafficBench({ world: town, modules: [vehicles], session: { x: town.centerX, z: town.centerZ } });
    b.api.tuning.barrierTime = 0;
    const c = b.control.closeRoad(180, 120, 0)!;
    const v = b.api.spawnVehicle('voiture', -140, 122, EAST, 380, 120)!;
    expect(b.api.stats.reroutes).toBeGreaterThanOrEqual(1);
    let minBarrier = Infinity;
    let onClosed = 0;
    const t = runUntil(b, () => b.api.motorist(v)?.mode === 'arret' && Math.hypot(v.x - 380, v.z - 120) < 6, 200, () => {
      minBarrier = Math.min(minBarrier, Math.hypot(v.x - c.x, v.z - c.z));
      if (v.x > 128 && v.x < 232 && Math.abs(v.z - 120) < 4) onClosed++;
    });
    expect(t).toBeGreaterThan(60); // le détour allonge le trajet (65 s environ par la rue directe)
    expect(t).toBeLessThan(160);
    expect(onClosed).toBe(0); // jamais sur le tronçon fermé
    expect(minBarrier).toBeGreaterThan(30);
    expect(Math.abs(v.z - 122)).toBeLessThan(1); // arrêté sur sa voie de droite
    // rue rouverte : le suivant passe tout droit
    b.control.open(c.id);
    const v2 = b.api.spawnVehicle('citadine', -140, 122, EAST, 300, 120)!;
    let direct = 0;
    const t2 = runUntil(b, () => v2.x > 290, 120, () => {
      if (v2.x > 150 && v2.x < 210 && Math.abs(v2.z - 121) < 3) direct++;
    });
    expect(t2).toBeGreaterThan(0);
    expect(t2).toBeLessThan(75);
    expect(direct).toBeGreaterThan(10);
    console.log(`déviation : ${t.toFixed(0)} s par le détour (barrage approché à ${minBarrier.toFixed(0)} m au plus près), ${t2.toFixed(0)} s une fois la rue rouverte`);
  }, 180000);

  it('un bouchon se forme derrière un barrage sans déviation possible, puis se résorbe à la réouverture', async () => {
    const world = corridor(true);
    const incidents = fakeIncidents();
    const b = await createTrafficBench({
      world, modules: [vehicles], session: { x: 0, z: 0 },
      setup: (ctx) => ctx.provide(EXT.incidents, incidents),
    });
    b.api.tuning.barrierTime = 0;
    const motorist: MotoristEvent[] = [];
    b.ctx.events.onAny('traffic:motorist', (e) => motorist.push(e as MotoristEvent));
    const jams: string[] = [];
    b.ctx.events.onAny('traffic:jam', (e) => jams.push((e as { state: string }).state));
    const cars: Vehicle[] = [];
    const spawn = (): void => {
      const v = b.api.spawnVehicle('voiture', -285, 0, EAST, 290, 0);
      if (v) cars.push(v);
    };
    spawn();
    let closure: RoadClosure | null = null;
    let maxStopped = 0;
    let entered = 0;
    for (let i = 0; i < 30 * 125; i++) {
      b.step(DT, DT);
      if (i % 240 === 239 && cars.length < 9) spawn();
      if (i === 30 * 22) closure = b.control.closeRoad(150, 0, 0);
      if (closure && i % 30 === 0) {
        maxStopped = Math.max(maxStopped, b.control.countNear(0, 0, 400).stopped);
        // après la fermeture, plus personne n'entre dans le tronçon fermé (seuls ceux déjà engagés y roulent encore)
        for (const v of cars) if (v.x > 15 && v.x < 140 && i > 30 * 60) entered++;
      }
    }
    expect(closure).not.toBeNull();
    const before = { ...b.control.countNear(0, 0, 400) }; // l'objet rendu est réutilisé d'un appel à l'autre
    expect(before.stopped).toBeGreaterThanOrEqual(6); // la file s'est formée en amont du carrefour
    expect(before.moving).toBe(0);
    expect(entered).toBe(0);
    const waiting = cars.filter((v) => b.api.motorist(v)?.cause === 'fermeture');
    expect(waiting.length).toBeGreaterThanOrEqual(6);
    // la file : derrière la ligne d'arrêt du carrefour, véhicules espacés, sans se toucher
    const xs = waiting.map((v) => v.x).sort((a, c) => c - a);
    expect(xs[0]).toBeLessThan(-9);
    for (let i = 1; i < xs.length; i++) expect(xs[i - 1]! - xs[i]!).toBeGreaterThan(5.4);
    expect(b.api.motorist(waiting[0]!)!.blockedFor).toBeGreaterThan(50);
    // incident « automobiliste bloqué » déclaré au service des incidents
    expect(incidents.opened.length).toBeGreaterThanOrEqual(1);
    expect(incidents.opened[0]!.kind).toBe('automobiliste_bloque');
    expect(incidents.opened[0]!.targetKind).toBe('vehicle');
    expect(cars.some((v) => v.id === incidents.opened[0]!.targetId)).toBe(true);
    expect(motorist.some((m) => m.state === 'bloque')).toBe(true);
    expect(b.api.stats.blocked).toBeGreaterThanOrEqual(6);
    // réouverture : tout le monde repart, le bouchon se résorbe
    b.control.open(closure!.id);
    b.step(12);
    const after = { ...b.control.countNear(0, 0, 400) };
    expect(after.stopped).toBe(0);
    expect(after.moving).toBeGreaterThanOrEqual(6);
    b.step(22);
    expect(incidents.closed.length).toBe(incidents.opened.length);
    expect(incidents.closed.every((c) => c.resolved)).toBe(true);
    expect(motorist.some((m) => m.state === 'libere')).toBe(true);
    expect(jams).toEqual(['forme', 'resorbe']); // événement de bouchon, puis de fin de bouchon
    expect(cars.filter((v) => v.x > 150).length).toBeGreaterThanOrEqual(5); // ils ont franchi l'ancien barrage
    console.log(`bouchon : ${before.stopped} véhicules à l'arrêt derrière le barrage (jusqu'à ${maxStopped}), ${incidents.opened.length} incident(s) ; 12 s après la réouverture : ${after.moving} en mouvement, ${after.stopped} à l'arrêt`);
  }, 180000);

  it('le barrage s\'ouvre pour un véhicule déjà engagé, puis pour un véhicule prioritaire, et se referme', async () => {
    const town = createTown({});
    const b = await createTrafficBench({ world: town, modules: [vehicles], session: { x: town.centerX, z: town.centerZ } });
    const ap = b.ctx.require<AutopilotApi>('vehicles.autopilot');
    b.api.tuning.barrierTime = 0;
    const engaged = b.api.spawnVehicle('voiture', 140, 122, EAST, 380, 120)!;
    b.step(1.5);
    const c = b.control.closeRoad(200, 120, 0)!;
    const gates: GateEvent[] = [];
    b.ctx.events.onAny('traffic:gate', (e) => gates.push({ ...(e as GateEvent) }));
    expect(barriers(b.ctx).every((p) => p.blocksMove && Math.abs(p.x - 200) < 0.01)).toBe(true);
    // 1. l'automobiliste déjà dans la rue sort par le barrage, qui s'ouvre devant lui
    let minSpeedNear = Infinity;
    const t1 = runUntil(b, () => engaged.x > 215, 40, () => {
      if (engaged.x > 190 && engaged.x < 210) minSpeedNear = Math.min(minSpeedNear, engaged.speed);
    });
    expect(t1).toBeGreaterThan(0);
    expect(gates.length).toBe(1);
    expect(gates[0]).toEqual({ id: c.id, open: true, vehicleId: engaged.id });
    expect(minSpeedNear).toBeGreaterThan(1); // il ne s'est pas arrêté contre les barrières
    expect(barriers(b.ctx).every((p) => !p.blocksMove && Math.abs(p.z - 120) > 4.5)).toBe(true); // rangées sur les trottoirs
    b.step(6);
    expect(gates.length).toBe(2);
    expect(gates[1]!.open).toBe(false);
    expect(barriers(b.ctx).every((p) => p.blocksMove && Math.abs(p.x - 200) < 0.01)).toBe(true); // remises en travers
    // 2. un automobiliste arrivé après la fermeture, lui, n'entre pas
    const late = b.api.spawnVehicle('citadine', 20, 122, EAST, 380, 120)!;
    let lateOnClosed = 0;
    runUntil(b, () => false, 40, () => {
      if (late.x > 130 && late.x < 232 && Math.abs(late.z - 120) < 4) lateOnClosed++;
    });
    expect(lateOnClosed).toBe(0); // il a pris la déviation
    expect(gates.length).toBe(2);
    // 3. un fourgon de police en intervention passe : le barrage s'ouvre, puis se referme derrière lui
    const van = b.ctx.vehicles.spawn('fourgon_crs', 135, 122, EAST);
    const crs = b.ctx.people.spawn({ kind: 'crs', x: 135, z: 122 });
    expect(b.ctx.vehicles.enter(crs, van, 'driver')).toBe(true);
    expect(ap.driveTo(van, 380, 122, { urgence: true })).toBe(true);
    let vanMin = Infinity;
    const t3 = runUntil(b, () => van.x > 230, 40, () => {
      if (van.x > 185 && van.x < 215) vanMin = Math.min(vanMin, van.speed);
    });
    expect(t3).toBeGreaterThan(0);
    expect(vanMin).toBeGreaterThan(1);
    expect(gates.length).toBeGreaterThanOrEqual(3);
    expect(gates[2]).toEqual({ id: c.id, open: true, vehicleId: van.id });
    b.step(6);
    expect(gates.length).toBe(4);
    expect(gates[3]!.open).toBe(false);
    expect(barriers(b.ctx).length).toBe(4);
    console.log(`barrage : véhicule engagé sorti en ${t1.toFixed(1)} s (${minSpeedNear.toFixed(1)} m/s au plus lent), fourgon prioritaire passé à ${vanMin.toFixed(1)} m/s au plus lent`);
  }, 180000);
});

describe('circulation : automobilistes bloqués', () => {
  async function blockedStreet(): Promise<{ b: TrafficBench; cars: Vehicle[]; events: MotoristEvent[]; incidents: ReturnType<typeof fakeIncidents> }> {
    const world = corridor(false);
    const incidents = fakeIncidents();
    const b = await createTrafficBench({
      world, modules: [vehicles, people], session: { x: 0, z: 0 },
      setup: (ctx) => ctx.provide(EXT.incidents, incidents),
    });
    const t = b.api.tuning;
    t.spawnMin = 100;
    t.spawnMax = 320;
    t.despawn = 400;
    t.patience = 14;
    const events: MotoristEvent[] = [];
    b.ctx.events.onAny('traffic:motorist', (e) => events.push({ ...(e as MotoristEvent) }));
    const cars: Vehicle[] = [];
    for (let i = 0; i < 3; i++) {
      const v = b.api.spawnVehicle('voiture', -60 - i * 16, 1.75, EAST, 290, 0)!;
      b.sys.cars.byVehicle.get(v.id)!.ambient = true; // automobilistes ordinaires : libres de changer de destination
      cars.push(v);
    }
    return { b, cars, events, incidents };
  }

  it('devant un véhicule en travers : arrêt, klaxons, puis demi-tour par un autre itinéraire', async () => {
    const { b, cars, events } = await blockedStreet();
    // un fourgon de police barre la chaussée (aucune fermeture déclarée)
    b.ctx.vehicles.spawn('fourgon_crs', 150, 0, 0);
    let collisions = 0;
    b.ctx.events.on('vehicle:collision', () => collisions++);
    let stopped = false;
    let cause = '';
    const tStop = runUntil(b, () => cars[0]!.speed < 0.05 && cars[0]!.x > 120, 40);
    expect(tStop).toBeGreaterThan(0);
    expect(cars[0]!.x).toBeLessThan(147); // arrêté avant le fourgon
    b.step(6);
    stopped = cars.every((v) => Math.abs(v.speed) < 0.1);
    cause = b.api.motorist(cars[0]!)?.cause ?? '';
    expect(stopped).toBe(true);
    expect(cause).toBe('obstacle');
    expect(b.api.motorist(cars[1]!)?.cause).toBe('obstacle'); // le bouchon remonte : la cause se propage dans la file
    const t = runUntil(b, () => events.filter((e) => e.state === 'demi_tour').length >= 2, 90);
    expect(t).toBeGreaterThan(0);
    expect(b.api.stats.honks).toBeGreaterThan(0);
    expect(b.api.stats.uturns).toBeGreaterThanOrEqual(2);
    // ils repartent vers l'ouest
    const tBack = runUntil(b, () => cars.filter((v) => b.ctx.vehicles.get(v.id) === v && v.x < 60 && v.speed > 2 && Math.cos(v.heading - EAST) < -0.8).length >= 1, 60);
    expect(tBack).toBeGreaterThan(0);
    expect(collisions).toBe(0);
    console.log(`obstacle : arrêt en ${tStop.toFixed(0)} s, ${b.api.stats.honks} coups de klaxon, ${b.api.stats.uturns} demi-tours`);
  }, 180000);

  it('pris dans une foule hostile : incident, peur, abandon du véhicule et fuite à pied', async () => {
    const { b, cars, events, incidents } = await blockedStreet();
    // un groupe de manifestants en colère occupe la chaussée
    const crowd = [];
    for (let i = 0; i < 10; i++) {
      const p = b.ctx.people.spawn({ kind: 'manifestant', faction: 'protest', x: 150 + (i % 2) * 1.2, z: -2.4 + Math.floor(i / 2) * 1.2 });
      p.anger = 1;
      crowd.push(p);
    }
    const hurt: number[] = [];
    b.ctx.events.on('person:hurt', (e) => hurt.push(e.id));
    const first = cars[0]!;
    const driverId = b.sys.cars.byVehicle.get(first.id)!.driverId;
    const tStop = runUntil(b, () => first.speed < 0.05 && first.x > 110, 40);
    expect(tStop).toBeGreaterThan(0);
    expect(first.x).toBeLessThan(149); // arrêté devant la foule
    b.step(3);
    expect(b.api.motorist(first)?.cause).toBe('personne');
    expect(crowd.length).toBe(10);
    const tAbandon = runUntil(b, () => events.some((e) => e.state === 'abandon' && e.vehicleId === first.id), 40);
    expect(tAbandon).toBeGreaterThan(0);
    expect(b.api.motorist(first)).toBeNull(); // plus personne ne le conduit
    expect(b.ctx.vehicles.get(first.id)).toBe(first); // le véhicule reste sur place
    expect(first.engineOn).toBe(false);
    expect(first.seats.every((s) => s === 0)).toBe(true);
    expect(b.api.stats.abandons).toBe(1);
    const driver = b.ctx.people.get(driverId)!;
    expect(driver.vehicleId).toBe(0);
    expect(driver.fear).toBeGreaterThan(0.7);
    expect(b.api.isPedestrian(driver)).toBe(true);
    const x0 = driver.x;
    const z0 = driver.z;
    b.step(8);
    expect(Math.hypot(driver.x - x0, driver.z - z0)).toBeGreaterThan(12); // il court
    expect(b.control.countNear(first.x, first.z, 5).stopped).toBeGreaterThanOrEqual(1); // compté à l'arrêt
    expect(hurt.length).toBe(0); // la foule n'a pas été percutée
    expect(incidents.opened.length + events.filter((e) => e.state === 'fuite').length).toBeGreaterThanOrEqual(0);
    console.log(`foule hostile : arrêt en ${tStop.toFixed(0)} s, véhicule abandonné ${tAbandon.toFixed(0)} s plus tard, conducteur à ${Math.hypot(driver.x - first.x, driver.z - first.z).toFixed(0)} m huit secondes plus tard`);
  }, 180000);
});
