// Circulation — graphe routier de travail, feux tricolores, priorités aux carrefours, points de contrôle d'un itinéraire.
import { describe, expect, it } from 'vitest';
import { defaultTuning } from '@/sim/traffic/tuning';
import { E_ONEWAY, N_DEADEND, N_JUNCTION, N_SIGNAL, RoadCache, makeEdgeHit } from '@/sim/traffic/graph';
import { CarRoute, CP_BOX, CP_SIGNAL, stopDistance } from '@/sim/traffic/route';
import { AMBER, Boxes, GREEN, NO_SIGNAL, RED, Signals, movementsConflict } from '@/sim/traffic/signals';
import { createRoadWorld, createTown } from '@/sim/traffic/testkit';
import { FAR_STOP, STOP_SETBACK, hourFactor, pedHourFactor, weatherPedFactor } from '@/sim/traffic/tuning';

const N = { x: 0, z: -1 };
const S = { x: 0, z: 1 };
const E = { x: 1, z: 0 };
const W = { x: -1, z: 0 };
type V = { x: number; z: number };
const conflict = (ai: V, ao: V, bi: V, bo: V): boolean => movementsConflict(ai.x, ai.z, ao.x, ao.z, bi.x, bi.z, bo.x, bo.z);

describe('circulation : graphe de travail', () => {
  it('recopie le graphe : carrefours, impasses, feux, adjacence', () => {
    const town = createTown({ signals: [4] });
    const c = new RoadCache();
    c.build(town);
    expect(c.ready).toBe(true);
    expect(c.nodeCount).toBe(town.nodeCount);
    expect(c.edgeCount).toBe(town.edgeCount);
    // 9 carrefours (3 ou 4 branches chacun grâce aux rues de sortie), 12 bouts de rue
    let junctions = 0;
    let deadends = 0;
    for (let n = 0; n < c.nodeCount; n++) {
      if ((c.nodeFlags[n]! & N_JUNCTION) !== 0) junctions++;
      if ((c.nodeFlags[n]! & N_DEADEND) !== 0) deadends++;
    }
    expect(junctions).toBe(9);
    expect(deadends).toBe(12);
    const center = town.junction(1, 1);
    expect(c.nodeFlags[center]! & N_SIGNAL).toBe(N_SIGNAL);
    expect(c.nodeDeg[center]).toBe(4);
    expect(c.nodeRadius[center]).toBeCloseTo(4, 5); // demi-chaussée de 8 m
    expect(c.matches(town)).toBe(true);
    expect(c.nodeAt(120, 120)).toBe(center);
    expect(c.nodeAt(120.2, 119.9)).toBe(center);
    expect(c.nodeAt(125, 120)).toBe(-1);
    const out: number[] = [];
    expect(c.nodesInRadius(120, 120, 125, out)).toBe(5); // le centre et ses quatre voisins
    expect(c.edgeBetween(center, town.junction(2, 1))).toBe(town.edgeBetween(center, town.junction(2, 1)));
  });

  it('géométrie : point décalé à DROITE du sens a → b, projection, direction au départ d\'un nœud', () => {
    const world = createRoadWorld([{ x: 0, z: 0 }, { x: 0, z: 100 }], [{ a: 0, b: 1, width: 8 }]);
    const c = new RoadCache();
    c.build(world);
    const p = { x: 0, z: 0, dx: 0, dz: 0 };
    // l'arête va vers +z (sud) : sa droite est l'ouest (−x), comme pour un cap 0 (droite = (−cos h, sin h))
    c.pointAt(0, 30, 2, p);
    expect(p.x).toBeCloseTo(-2, 5);
    expect(p.z).toBeCloseTo(30, 5);
    expect(p.dz).toBeCloseTo(1, 5);
    const hit = makeEdgeHit();
    c.project(0, -3, 40, hit);
    expect(hit.s).toBeCloseTo(40, 5);
    expect(hit.lat).toBeCloseTo(3, 5); // à droite
    expect(hit.dist).toBeCloseTo(3, 5);
    c.dirFrom(0, 1, p);
    expect(p.dz).toBeCloseTo(-1, 5); // du nœud b vers l'intérieur de l'arête
    expect(c.nearestVehicleEdge(5, 50, 20, hit)).toBe(true);
    expect(hit.edge).toBe(0);
    expect(c.nearestVehicleEdge(500, 50, 20, hit)).toBe(false);
  });

  it('tronçon : les arêtes enchaînées par des nœuds de degré 2 forment une seule rue', () => {
    // A ─ m1 ─ m2 ─ B (carrefour à 3 branches en B)
    const world = createRoadWorld(
      [{ x: 0, z: 0 }, { x: 40, z: 0 }, { x: 80, z: 0 }, { x: 120, z: 0 }, { x: 120, z: 80 }, { x: 200, z: 0 }],
      [{ a: 0, b: 1 }, { a: 2, b: 1 }, { a: 2, b: 3 }, { a: 3, b: 4 }, { a: 3, b: 5 }],
    );
    const c = new RoadCache();
    c.build(world);
    const edges: number[] = [];
    const dirs: number[] = [];
    const info = { nodeA: -1, nodeB: -1, length: 0, count: 0 };
    c.chain(1, edges, dirs, info);
    expect(info.count).toBe(3);
    expect(info.length).toBeCloseTo(120, 5);
    expect([info.nodeA, info.nodeB].sort()).toEqual([0, 3]);
    expect(edges.slice().sort()).toEqual([0, 1, 2]);
    // l'arête 1 est numérisée à l'envers : son sens dans le tronçon est opposé à celui des deux autres
    expect(dirs[edges.indexOf(1)]).toBe(-dirs[edges.indexOf(0)]!);
    const p = { x: 0, z: 0, dx: 0, dz: 0 };
    const from0 = info.nodeA === 0;
    c.chainPoint(edges, dirs, 60, 0, p);
    expect(p.x).toBeCloseTo(from0 ? 60 : 60, 5);
    expect(p.z).toBeCloseTo(0, 5);
  });

  it('plus court chemin : respecte les sens uniques et évite les rues fermées', () => {
    const town = createTown({});
    const c = new RoadCache();
    c.build(town);
    const out: number[] = [];
    const a = town.junction(0, 1);
    const b = town.junction(2, 1);
    expect(c.route(a, b, null, out)).toBe(true);
    expect(out).toEqual([a, town.junction(1, 1), b]);
    const closed = new Uint8Array(c.edgeCount);
    closed[town.edgeBetween(town.junction(1, 1), b)] = 1;
    expect(c.route(a, b, closed, out)).toBe(true);
    expect(out.length).toBe(5); // détour par une rue parallèle
    expect(out).not.toContain(-1);
    for (let i = 1; i < out.length; i++) expect(closed[c.edgeBetween(out[i - 1]!, out[i]!)]).toBe(0);
    // tout fermé autour de l'arrivée : aucun chemin
    for (let k = c.adjStart[b]!; k < c.adjStart[b + 1]!; k++) closed[c.adjEdge[k]!] = 1;
    expect(c.route(a, b, closed, out)).toBe(false);
    // sens unique
    const oneway = createRoadWorld([{ x: 0, z: 0 }, { x: 100, z: 0 }], [{ a: 0, b: 1, oneway: true }]);
    const c2 = new RoadCache();
    c2.build(oneway);
    expect(c2.edgeFlags[0]! & E_ONEWAY).toBe(E_ONEWAY);
    expect(c2.route(0, 1, null, out)).toBe(true);
    expect(c2.route(1, 0, null, out)).toBe(false);
  });
});

describe('circulation : feux tricolores', () => {
  it('cycle vert → orange → rouge ; jamais deux axes au vert ; les sens opposés ont la même couleur', () => {
    const town = createTown({ signals: [4] });
    const c = new RoadCache();
    c.build(town);
    const tuning = defaultTuning();
    const signals = new Signals(c, tuning);
    const ctrl = signals.ctrlOf(town.junction(1, 1));
    const seen = new Set<number>();
    let bothGreen = 0;
    let greenEW = 0;
    let greenNS = 0;
    let transitions = '';
    let last = -1;
    const cycle = tuning.greenMain + tuning.greenCross + 2 * (tuning.amber + tuning.allRed);
    for (let t = 0; t < cycle * 2; t += 0.1) {
      const ew = signals.state(ctrl, 1, 0, t);
      const we = signals.state(ctrl, -1, 0, t);
      const ns = signals.state(ctrl, 0, 1, t);
      expect(we).toBe(ew);
      seen.add(ew);
      if (ew === GREEN && ns === GREEN) bothGreen++;
      if (ew !== RED && ns !== RED) bothGreen++; // ni vert + orange : rouge de dégagement entre les deux
      if (ew === GREEN) greenEW += 0.1;
      if (ns === GREEN) greenNS += 0.1;
      if (ew !== last) {
        transitions += ew;
        last = ew;
      }
    }
    expect(bothGreen).toBe(0);
    expect(seen).toEqual(new Set([GREEN, AMBER, RED]));
    expect(transitions).toMatch(/012|120|201/); // vert, puis orange, puis rouge
    expect(transitions).not.toMatch(/02|10|21/);
    // deux cycles : chaque axe a eu deux fois son temps de vert (l'un le vert long, l'autre le vert court)
    expect(Math.round(Math.max(greenEW, greenNS))).toBe(tuning.greenMain * 2);
    expect(Math.round(Math.min(greenEW, greenNS))).toBe(tuning.greenCross * 2);
  });

  it('rouge restant pour les piétons, feux éteints, passage d\'une sirène', () => {
    const town = createTown({ signals: [4] });
    const c = new RoadCache();
    c.build(town);
    const tuning = defaultTuning();
    const signals = new Signals(c, tuning);
    const node = town.junction(1, 1);
    const ctrl = signals.ctrlOf(node);
    expect(signals.crossingCtrl(node)).toBe(ctrl);
    expect(signals.crossingCtrl(town.junction(0, 0))).toBeNull(); // carrefour sans feux
    for (let t = 0; t < 120; t += 0.5) {
      const st = signals.state(ctrl, 1, 0, t);
      const left = signals.redLeft(ctrl, 1, 0, t);
      if (st === RED) {
        expect(left).toBeGreaterThan(0);
        // au bout de ce délai, le feu est vert
        expect(signals.state(ctrl, 1, 0, t + left + 0.05)).toBe(GREEN);
        expect(signals.state(ctrl, 1, 0, t + left - 0.3)).toBe(RED);
      } else {
        expect(left).toBe(0);
      }
    }
    // sirène venant de l'ouest : son axe au vert, tout le reste au rouge, puis retour au cycle
    signals.preempt(ctrl, 1, 0, 50);
    expect(signals.state(ctrl, 1, 0, 49)).toBe(GREEN);
    expect(signals.state(ctrl, -1, 0, 49)).toBe(RED);
    expect(signals.state(ctrl, 0, 1, 49)).toBe(RED);
    expect(signals.redLeft(ctrl, 0, 1, 49)).toBe(0); // les piétons ne s'engagent pas
    expect([GREEN, AMBER, RED]).toContain(signals.state(ctrl, 0, 1, 51));
    tuning.signals = false;
    expect(signals.state(ctrl, 1, 0, 10)).toBe(NO_SIGNAL);
  });

  it('une ligne de feu posée sur l\'approche commande le carrefour voisin ; un feu isolé protège un passage piéton', () => {
    // O ─ L(feu) ─ J ─ E, branche vers le sud en J ; plus loin P(feu isolé) sur la rue de l'est
    const world = createRoadWorld(
      [{ x: -200, z: 0 }, { x: -20, z: 0, signal: true }, { x: 0, z: 0 }, { x: 0, z: 150 }, { x: 150, z: 0, signal: true }, { x: 300, z: 0 }],
      [{ a: 0, b: 1 }, { a: 1, b: 2 }, { a: 2, b: 3 }, { a: 2, b: 4 }, { a: 4, b: 5 }],
    );
    const c = new RoadCache();
    c.build(world);
    const signals = new Signals(c, defaultTuning());
    const junction = signals.ctrlOf(2);
    expect(signals.crossingCtrl(1)).toBe(junction);
    expect(signals.crossingCtrl(2)).toBe(junction); // carrefour à feux par sa ligne d'approche
    const mid = signals.crossingCtrl(4);
    expect(mid).not.toBeNull();
    expect(mid!.midblock).toBe(true);
    expect(mid).not.toBe(junction);
    // itinéraire d'ouest en est : arrêt à la ligne (0,8 m avant le nœud du feu), puis au passage protégé
    const r = new CarRoute();
    r.setPath([-190, 2, -190, 0, -20, 0, 0, 0, 150, 0, 290, 0, 290, 0], 7);
    r.buildControlPoints(c, signals);
    expect(r.cpCount).toBe(2);
    const cp0 = r.cps[0]!;
    expect(cp0.node).toBe(2);
    expect(cp0.kind).toBe(CP_BOX | CP_SIGNAL);
    expect(cp0.ctrl).toBe(junction);
    expect(cp0.nodeS - cp0.stopS).toBeCloseTo(20.8, 1);
    expect(cp0.inDx).toBeCloseTo(1, 5);
    expect(cp0.outDx).toBeCloseTo(1, 5);
    const cp1 = r.cps[1]!;
    expect(cp1.node).toBe(4);
    expect(cp1.kind).toBe(CP_SIGNAL);
    expect(cp1.ctrl).toBe(mid);
    expect(cp1.nodeS - cp1.stopS).toBeCloseTo(3, 1);
  });
});

describe('circulation : priorité aux carrefours', () => {
  it('trajectoires compatibles et incompatibles', () => {
    // même approche : toujours compatibles
    expect(conflict(N, N, N, W)).toBe(false);
    // approches qui se croisent : toujours en conflit
    expect(conflict(N, N, E, E)).toBe(true);
    expect(conflict(N, E, E, S)).toBe(true);
    // approches opposées : tout droit et à droite passent ensemble
    expect(conflict(N, N, S, S)).toBe(false);
    // face au nord, l'est est à droite
    expect(conflict(N, E, S, S)).toBe(false);
    expect(conflict(N, E, S, W)).toBe(false);
    // tourne-à-gauche (face au nord, vers l'ouest) : seul
    expect(conflict(N, W, S, S)).toBe(true);
    expect(conflict(N, W, S, E)).toBe(true);
    expect(conflict(S, S, N, W)).toBe(true);
    // demi-tour
    expect(conflict(N, S, S, S)).toBe(true);
  });

  it('réservation : premier arrivé premier servi, libération, carrefour réservé à une sirène', () => {
    const boxes = new Boxes();
    const node = 7;
    // A (du sud vers le nord) passe ; B (de l'ouest vers l'est) attend
    expect(boxes.request(node, 1, N.x, N.z, N.x, N.z, 0)).toBe(true);
    expect(boxes.request(node, 2, E.x, E.z, E.x, E.z, 0.25)).toBe(false);
    expect(boxes.holds(node, 1, 0.3)).toBe(true);
    expect(boxes.holds(node, 2, 0.3)).toBe(false);
    // C arrive derrière A, par la même approche, AVANT que B ne se présente à un autre carrefour : il passe avec A
    expect(boxes.request(8, 1, N.x, N.z, N.x, N.z, 0)).toBe(true);
    expect(boxes.request(8, 3, N.x, N.z, N.x, N.z, 0.25)).toBe(true);
    expect(boxes.granted(8, 0.3)).toBe(2);
    // un piéton ne traverse pas l'embouchure nord pendant ce temps (ils sortent par là)
    expect(boxes.uses(8, N.x, N.z, 0.3)).toBe(true);
    expect(boxes.uses(8, E.x, E.z, 0.3)).toBe(false);
    // ici, C arrive derrière A alors que B attend déjà : B était là avant lui, C attendra son tour
    expect(boxes.request(node, 3, N.x, N.z, N.x, N.z, 0.5)).toBe(false);
    boxes.release(node, 1);
    expect(boxes.request(node, 2, E.x, E.z, E.x, E.z, 0.75)).toBe(true);
    expect(boxes.sameMovement(node, 2, E.x, E.z, E.x, E.z)).toBe(true);
    expect(boxes.sameMovement(node, 2, E.x, E.z, N.x, N.z)).toBe(false);
    expect(boxes.request(node, 3, N.x, N.z, N.x, N.z, 0.75)).toBe(false);
    boxes.release(node, 2);
    expect(boxes.request(node, 3, N.x, N.z, N.x, N.z, 1.0)).toBe(true);
    boxes.release(node, 3);
    // une réservation qui n'est plus rappelée s'éteint d'elle-même
    expect(boxes.request(node, 5, N.x, N.z, N.x, N.z, 2)).toBe(true);
    expect(boxes.request(node, 6, E.x, E.z, E.x, E.z, 9)).toBe(true);
    boxes.release(node, 6);
    // sirène venant de l'ouest : seules les approches de même sens passent
    boxes.preempt(node, E.x, E.z, 20);
    expect(boxes.request(node, 7, N.x, N.z, N.x, N.z, 10)).toBe(false);
    expect(boxes.request(node, 8, E.x, E.z, E.x, E.z, 10)).toBe(true);
    boxes.release(node, 8);
    expect(boxes.request(node, 7, N.x, N.z, N.x, N.z, 21)).toBe(true);
    // véhicule déjà engagé : il occupe d'office
    boxes.occupy(node, 9, E.x, E.z, E.x, E.z, 21);
    expect(boxes.holds(node, 9, 21.1)).toBe(true);
  });

  it('ligne d\'arrêt : en retrait du carrefour, plus loin encore sur une rue étroite à double sens', () => {
    const narrow = createTown({});
    const c = new RoadCache();
    c.build(narrow);
    expect(stopDistance(c, narrow.junction(1, 1), 1, 0)).toBe(FAR_STOP);
    const wide = createTown({ width: 14 });
    const c2 = new RoadCache();
    c2.build(wide);
    expect(stopDistance(c2, wide.junction(1, 1), 1, 0)).toBeCloseTo(7 + STOP_SETBACK, 5);
    // itinéraire d'ouest en est par la rangée du milieu : trois carrefours, sans feux ici
    const signals = new Signals(c, defaultTuning());
    const r = new CarRoute();
    r.setPath([-140, 122, -140, 120, 0, 120, 120, 120, 240, 120, 380, 120, 380, 120], 7);
    r.buildControlPoints(c, signals);
    expect(r.cpCount).toBe(3);
    for (let i = 0; i < 3; i++) {
      const cp = r.cps[i]!;
      expect(cp.kind).toBe(CP_BOX);
      expect(cp.nodeS - cp.stopS).toBeCloseTo(FAR_STOP, 5);
      expect(cp.cleared).toBe(false);
    }
    r.project(-100, 122);
    expect(r.s).toBeCloseTo(42, 0);
  });
});

describe('circulation : densités', () => {
  it('le trafic et l\'affluence piétonne suivent l\'heure et la météo', () => {
    expect(hourFactor(3.5)).toBeLessThan(0.2);
    expect(hourFactor(8.5)).toBeCloseTo(1, 5);
    expect(hourFactor(18)).toBeGreaterThan(0.95);
    expect(hourFactor(27.5)).toBeCloseTo(hourFactor(3.5), 9);
    for (let h = 0; h <= 24; h += 0.25) {
      expect(hourFactor(h)).toBeGreaterThan(0.05);
      expect(hourFactor(h)).toBeLessThan(1.1);
      expect(pedHourFactor(h)).toBeGreaterThan(0.05);
      expect(pedHourFactor(h)).toBeLessThan(1.1);
    }
    expect(pedHourFactor(3)).toBeLessThan(0.1);
    expect(pedHourFactor(13)).toBe(1);
    expect(weatherPedFactor('clair')).toBe(1);
    expect(weatherPedFactor('pluie')).toBeLessThan(0.6);
    expect(weatherPedFactor('orage')).toBeLessThan(weatherPedFactor('pluie'));
  });
});
