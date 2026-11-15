// Réseau de rues, voie la plus proche, itinéraires, points d'apparition.
import { beforeAll, describe, expect, it } from 'vitest';
import type { RoadSample, Vec2 } from '@/core/contracts';
import { createWorldQuery } from '@/world/query';
import type { WorldQueryImpl } from '@/world/query';
import { pathLength, seededRandom } from '@/world/query/testkit';

let w: WorldQueryImpl;
const sample: RoadSample = { edgeId: -1, x: 0, z: 0, heading: 0, dist: 0, width: 0, name: '', roadClass: 'residential', oneway: false };

beforeAll(async () => {
  w = createWorldQuery({ source: 'test' });
  await w.boot();
  w.setFocus(0, 0);
  await w.whenLoaded(0, 0, 800);
});

/**
 * Contrôle un itinéraire : hors du premier et du dernier saut (accroche), chaque tronçon suit une
 * voie ; en mode véhicule, jamais à contresens d'un sens unique ni sur une voie piétonne.
 */
function checkPath(path: readonly number[], vehicle: boolean): void {
  expect(path.length % 2).toBe(0);
  expect(path.length).toBeGreaterThanOrEqual(4);
  const n = path.length >> 1;
  for (let i = 1; i + 2 < n; i++) {
    const ax = path[2 * i], az = path[2 * i + 1], bx = path[2 * i + 2], bz = path[2 * i + 3];
    const len = Math.hypot(bx - ax, bz - az);
    expect(len).toBeGreaterThan(0.04); // pas de point doublé
    const mx = (ax + bx) / 2, mz = (az + bz) / 2;
    expect(w.nearestRoad(mx, mz, sample, 5)).toBe(true);
    expect(sample.dist).toBeLessThan(0.02); // le tronçon est sur l'axe d'une voie
    if (!vehicle) continue;
    const ed = w.edge(sample.edgeId);
    expect(ed.pedestrianOnly).toBe(false);
    if (ed.oneway) {
      const along = ((bx - ax) * Math.sin(sample.heading) + (bz - az) * Math.cos(sample.heading)) / len;
      expect(along, `contresens sur « ${ed.name} » en (${mx.toFixed(1)} ; ${mz.toFixed(1)})`).toBeGreaterThan(0.9);
    }
  }
}

describe('monde : réseau de rues (quartier d\'essai)', () => {
  it('expose les nœuds et les arêtes', () => {
    expect(w.nodeCount).toBe(95);
    expect(w.edgeCount).toBe(131);
    for (let e = 0; e < w.edgeCount; e++) {
      const ed = w.edge(e);
      expect(ed.id).toBe(e);
      const a = w.node(ed.a), b = w.node(ed.b);
      expect(a.edges).toContain(e);
      expect(b.edges).toContain(e);
      expect(ed.points[0]).toBeCloseTo(a.x, 1);
      expect(ed.points[1]).toBeCloseTo(a.z, 1);
      expect(ed.points[ed.points.length - 2]).toBeCloseTo(b.x, 1);
      expect(ed.points[ed.points.length - 1]).toBeCloseTo(b.z, 1);
      expect(ed.length).toBeCloseTo(pathLength(ed.points), 3);
      if (ed.oneway) expect(ed.lanesBackward).toBe(0);
    }
    const bridge = Array.from({ length: w.edgeCount }, (_, e) => w.edge(e)).filter((ed) => ed.bridge);
    expect(bridge.length).toBe(1);
    expect(bridge[0].name).toBe("Pont de l'Essai");
    expect(Array.from({ length: w.edgeCount }, (_, e) => w.edge(e)).filter((ed) => ed.sett).length).toBeGreaterThan(5);
    expect(Array.from({ length: w.nodeCount }, (_, n) => w.node(n)).filter((nd) => nd.signal).length).toBe(20);
    // Identifiants hors bornes : sentinelles, jamais undefined.
    expect(w.node(-1).id).toBe(-1);
    expect(w.node(9999).edges.length).toBe(0);
    expect(w.edge(9999).id).toBe(-1);
  });

  it('trouve la voie la plus proche', () => {
    expect(w.nearestRoad(100, -10, sample)).toBe(true);
    expect(sample.name).toBe("Avenue de l'Essai");
    expect(sample.x).toBeCloseTo(100, 5);
    expect(sample.z).toBeCloseTo(-7.2, 3); // -7,25 m arrondi au décimètre du format
    expect(sample.dist).toBeCloseTo(2.8, 3);
    expect(sample.width).toBeCloseTo(10.5, 5);
    expect(sample.oneway).toBe(true);
    expect(sample.roadClass).toBe('primary');
    expect(Math.sin(sample.heading)).toBeCloseTo(-1, 5); // la chaussée nord roule vers l'ouest
    expect(w.edge(sample.edgeId).name).toBe("Avenue de l'Essai");
    // Chaussée sud : vers l'est.
    expect(w.nearestRoad(100, 10, sample)).toBe(true);
    expect(Math.sin(sample.heading)).toBeCloseTo(1, 5);
    // Depuis une cour d'îlot, au-delà de la distance par défaut ou imposée.
    expect(w.nearestRoad(85, -90, sample, 20)).toBe(false);
    expect(w.nearestRoad(85, -90, sample, 100)).toBe(true);
    expect(sample.dist).toBeGreaterThan(60);
    expect(w.nearestRoad(5000, 5000, sample)).toBe(false);
    // Le plus proche est bien le plus proche : comparaison avec une recherche exhaustive.
    const rand = seededRandom(7);
    for (let k = 0; k < 300; k++) {
      const x = (rand() - 0.5) * 1100, z = (rand() - 0.5) * 1100;
      let best = Infinity;
      for (let e = 0; e < w.edgeCount; e++) {
        const pts = w.edge(e).points;
        for (let i = 2; i + 1 < pts.length; i += 2) {
          const dx = pts[i] - pts[i - 2], dz = pts[i + 1] - pts[i - 1];
          const t = Math.max(0, Math.min(1, ((x - pts[i - 2]) * dx + (z - pts[i - 1]) * dz) / (dx * dx + dz * dz)));
          best = Math.min(best, Math.hypot(x - pts[i - 2] - dx * t, z - pts[i - 1] - dz * t));
        }
      }
      const found = w.nearestRoad(x, z, sample, 300);
      expect(found).toBe(best < 300);
      if (found) expect(sample.dist).toBeCloseTo(best, 3);
    }
  });

  it('itinéraire piéton : suit les rues, dans les deux sens', () => {
    const path: number[] = [];
    expect(w.findPath(100, -16, 366, -300, 'foot', path)).toBe(true);
    expect(path[0]).toBe(100);
    expect(path[1]).toBe(-16);
    expect(path[path.length - 2]).toBe(366);
    expect(path[path.length - 1]).toBe(-300);
    checkPath(path, false);
    const length = pathLength(path);
    expect(length).toBeGreaterThan(Math.hypot(266, 284)); // jamais plus court que la ligne droite
    expect(length).toBeLessThan(266 + 284 + 80); // ni beaucoup plus long que le trajet en équerre
    // À pied, on remonte un sens unique : 100 m le long de la chaussée nord, vers l'est.
    expect(w.findPath(100, -7.2, 200, -7.2, 'foot', path)).toBe(true);
    expect(pathLength(path)).toBeCloseTo(100, 3);
    // La rue piétonne se prend à pied.
    expect(w.findPath(-20, 150, 190, 150, 'foot', path)).toBe(true);
    expect(pathLength(path)).toBeCloseTo(210, 3);
    checkPath(path, false);
    // Le tableau fourni est vidé à chaque appel.
    expect(w.findPath(100, -8, 101, -8, 'foot', path)).toBe(true);
    expect(path.length).toBe(8); // départ, accroche, accroche, arrivée
    expect(path[0]).toBe(100);
    expect(path[1]).toBe(-8);
    expect(path[2]).toBeCloseTo(100, 5);
    expect(path[3]).toBeCloseTo(-7.2, 5);
    expect(path[6]).toBe(101);
    expect(path[7]).toBe(-8);
  });

  it('itinéraire véhicule : sens uniques respectés, voies piétonnes exclues', () => {
    const path: number[] = [];
    // Dans le sens de la chaussée nord (vers l'ouest) : direct.
    expect(w.findPath(200, -7.2, 100, -7.2, 'vehicle', path)).toBe(true);
    expect(pathLength(path)).toBeCloseTo(100, 3);
    checkPath(path, true);
    // À contresens : il faut faire le tour.
    expect(w.findPath(100, -7.2, 200, -7.2, 'vehicle', path)).toBe(true);
    expect(pathLength(path)).toBeGreaterThan(250);
    checkPath(path, true);
    // La rue du Marché est piétonne entre x = 0 et x = 170 : un véhicule la contourne.
    expect(w.findPath(-20, 150, 190, 150, 'vehicle', path)).toBe(true);
    expect(pathLength(path)).toBeGreaterThan(300);
    checkPath(path, true);
    for (let i = 0; i + 1 < path.length; i += 2) {
      const inside = path[i] > 5 && path[i] < 165 && Math.abs(path[i + 1] - 150) < 1;
      expect(inside).toBe(false);
    }
    // Le rond-point se prend dans le sens giratoire : de l'ouest vers l'est par le sud.
    expect(w.findPath(-150, 7.25, 150, 7.25, 'vehicle', path)).toBe(true);
    checkPath(path, true);
    let south = 0, north = 0;
    for (let i = 0; i + 1 < path.length; i += 2) {
      if (Math.abs(path[i]) < 30 && path[i + 1] > 15) south++;
      if (Math.abs(path[i]) < 30 && path[i + 1] < -15) north++;
    }
    expect(south).toBeGreaterThan(3);
    expect(north).toBe(0);
    // Traversée du quartier, pont compris.
    expect(w.findPath(-430, -480, 300, 490, 'vehicle', path)).toBe(true);
    checkPath(path, true);
    let overBridge = false;
    for (let i = 0; i + 3 < path.length; i += 2) {
      overBridge = overBridge || (Math.abs(path[i]) < 0.01 && Math.abs(path[i + 1] - 300) < 0.01 && Math.abs(path[i + 2]) < 0.01 && Math.abs(path[i + 3] - 420) < 0.01);
    }
    expect(overBridge).toBe(true); // le seul passage vers la rive sud
  });

  it('itinéraires au hasard : toujours valides', () => {
    const rand = seededRandom(2024);
    const path: number[] = [];
    // Un sens unique qui touche le bord de la carte ne mène nulle part (entrée) ou ne vient de nulle part (sortie).
    const boundaryOneway = (x: number, z: number): boolean => {
      if (!w.nearestRoad(x, z, sample, 300)) return false;
      const ed = w.edge(sample.edgeId);
      const onEdge = (n: number): boolean => Math.abs(w.node(n).x) > 511.9 || Math.abs(w.node(n).z) > 511.9;
      return ed.oneway && (onEdge(ed.a) || onEdge(ed.b));
    };
    let foot = 0, vehicle = 0, deadEnds = 0;
    for (let k = 0; k < 200; k++) {
      const ax = (rand() - 0.5) * 1000, az = (rand() - 0.5) * 1000, bx = (rand() - 0.5) * 1000, bz = (rand() - 0.5) * 1000;
      const byCar = k % 2 === 0;
      if (!w.findPath(ax, az, bx, bz, byCar ? 'vehicle' : 'foot', path)) {
        // Seul cas admis : en voiture, une extrémité sur un sens unique du bord de la carte.
        expect(byCar).toBe(true);
        expect(boundaryOneway(ax, az) || boundaryOneway(bx, bz)).toBe(true);
        deadEnds++;
        continue;
      }
      if (byCar) vehicle++; else foot++;
      checkPath(path, byCar);
      expect(pathLength(path)).toBeGreaterThanOrEqual(Math.hypot(bx - ax, bz - az) - 1e-6);
    }
    expect(foot).toBe(100); // à pied, le quartier est d'un seul tenant
    expect(vehicle + deadEnds).toBe(100);
    expect(vehicle).toBeGreaterThan(85);
  });

  it('aucun itinéraire quand une extrémité est hors du réseau', () => {
    const path: number[] = [1, 2, 3];
    expect(w.findPath(100, -16, 5000, 5000, 'foot', path)).toBe(false);
    expect(path).toEqual([]);
    expect(w.findPath(5000, 5000, 100, -16, 'vehicle', path)).toBe(false);
  });

  it('randomFreePoint : des points libres, sur la bonne surface, reliés à une rue', () => {
    const rand = seededRandom(99);
    const out: Vec2 = { x: 0, z: 0 };
    for (const [cx, cz] of [[0, 0], [-234.5, 82], [300, -150], [0, 360], [-430, 430]]) {
      for (let k = 0; k < 60; k++) {
        expect(w.randomFreePoint(cx, cz, 120, 'sidewalk', rand, out)).toBe(true);
        expect(['sidewalk', 'plaza', 'bridge']).toContain(w.surfaceAt(out.x, out.z)); // les trottoirs d'un pont comptent
        expect(w.isFree(out.x, out.z, 0.4)).toBe(true);
        expect(Math.hypot(out.x - cx, out.z - cz)).toBeLessThanOrEqual(120);
        // Jamais dans une cour d'îlot fermée : la voie la plus proche est à portée de vue directe.
        expect(w.nearestRoad(out.x, out.z, sample, 130)).toBe(true);
        expect(w.raycast(out.x, out.z, sample.x, sample.z, { hit: false, t: 1, x: 0, z: 0, nx: 0, nz: 0, kind: 'none', id: 0, height: 0 })).toBe(false);

        expect(w.randomFreePoint(cx, cz, 120, 'road', rand, out)).toBe(true);
        expect(['road', 'sett', 'bridge']).toContain(w.surfaceAt(out.x, out.z)); // la chaussée d'un pont compte
        expect(w.nearestRoad(out.x, out.z, sample, 20)).toBe(true);
        expect(w.edge(sample.edgeId).pedestrianOnly || sample.dist <= sample.width / 2 + 0.5).toBe(true);

        expect(w.randomFreePoint(cx, cz, 120, 'any', rand, out)).toBe(true);
        expect(['building', 'water', 'void']).not.toContain(w.surfaceAt(out.x, out.z));
        expect(w.isSolidAt(out.x, out.z)).toBe(false);
      }
    }
    // Au milieu du fleuve, loin de tout : rien à moins de 30 m.
    expect(w.randomFreePoint(250, 360, 30, 'sidewalk', rand, out)).toBe(false);
    // Hors de la carte.
    expect(w.randomFreePoint(3000, 3000, 50, 'any', rand, out)).toBe(false);
  });
});
