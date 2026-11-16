/* Modèles procéduraux des véhicules : budgets de triangles, échelle exacte, roues posées au sol, orientation
 * des faces. Les constructeurs tournent sous Node (aucun DOM, aucun Three.js). */
import { describe, expect, it } from 'vitest';
import { PART_WHEEL, PART_WHEEL_STEER, PART_BIKE_WHEEL } from '@/render/vehicles/geo';
import { MODEL_KINDS, buildModel, modelKey, triBudget } from '@/render/vehicles/models/index';
import { REFERENCE_DEFS, referenceDef } from '@/render/vehicles/refdefs';

const CONTRACT_KINDS = [
  'fourgon_crs', 'car_crs', 'vl_commandement', 'voiture_police', 'fourgon_cellulaire', 'centaure', 'canon_eau', 'moto_bravm',
  'camion_pompiers', 'ambulance', 'voiture', 'citadine', 'suv', 'taxi', 'utilitaire', 'camion', 'bus', 'scooter', 'camion_sono',
  'drone', 'helicoptere',
];

function bounds(pos: Float32Array, part: Float32Array | null, filter: (t: number) => boolean) {
  const b = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity, n: 0 };
  for (let i = 0; i < pos.length / 3; i++) {
    if (part && !filter(part[i * 3]!)) continue;
    b.n++;
    b.minX = Math.min(b.minX, pos[i * 3]!); b.maxX = Math.max(b.maxX, pos[i * 3]!);
    b.minY = Math.min(b.minY, pos[i * 3 + 1]!); b.maxY = Math.max(b.maxY, pos[i * 3 + 1]!);
    b.minZ = Math.min(b.minZ, pos[i * 3 + 2]!); b.maxZ = Math.max(b.maxZ, pos[i * 3 + 2]!);
  }
  return b;
}

describe('modèles des véhicules', () => {
  it('couvre tous les VehicleKind du contrat', () => {
    for (const k of CONTRACT_KINDS) {
      expect(MODEL_KINDS, k).toContain(k);
      expect(referenceDef(k), k).toBeDefined();
    }
    expect(REFERENCE_DEFS.length).toBe(CONTRACT_KINDS.length);
  });

  const rows: string[] = [];
  for (const kind of CONTRACT_KINDS) {
    it(`${kind} : budgets, échelle, roues au sol`, () => {
      const def = referenceDef(kind)!;
      const near = buildModel(kind, def, false);
      const far = buildModel(kind, def, true);
      rows.push(`${kind.padEnd(20)} détaillé ${String(near.data.triangleCount).padStart(5)} tri / ${String(near.data.vertexCount).padStart(5)} som — lointain ${String(far.data.triangleCount).padStart(3)} tri`);
      expect(near.data.triangleCount).toBeLessThanOrEqual(triBudget(kind, false));
      expect(far.data.triangleCount).toBeLessThanOrEqual(triBudget(kind, true));
      expect(near.data.triangleCount).toBeGreaterThan(far.data.triangleCount);
      expect(far.data.triangleCount).toBeGreaterThan(20);

      for (const m of [near, far]) {
        const d = m.data;
        // aucune valeur non finie, normales unitaires
        for (let i = 0; i < d.position.length; i++) expect(Number.isFinite(d.position[i]!)).toBe(true);
        for (let i = 0; i < d.normal.length; i += 3) {
          const l = Math.hypot(d.normal[i]!, d.normal[i + 1]!, d.normal[i + 2]!);
          expect(l).toBeGreaterThan(0.98);
          expect(l).toBeLessThan(1.02);
        }
        const b = bounds(d.position, null, () => true);
        // échelle : longueur exacte (± 6 cm : pare-chocs, marchepied), le sol est à y = 0
        const rotor = kind === 'helicoptere' || kind === 'drone';
        if (!rotor) {
          expect(b.maxZ - b.minZ, 'longueur').toBeGreaterThan(def.length - 0.06);
          expect(b.maxZ - b.minZ, 'longueur').toBeLessThan(def.length + 0.2);
          // largeur hors rétroviseurs : la caisse atteint la largeur de la définition, les rétroviseurs dépassent un peu
          expect(b.maxX - b.minX, 'largeur').toBeGreaterThan(def.width - 0.06);
          expect(b.maxX - b.minX, 'largeur').toBeLessThan(def.width + 0.75);
        }
        expect(b.minY, 'sol').toBeGreaterThan(-0.02);
        expect(b.minY, 'sol').toBeLessThan(0.05);
        // hauteur : celle de la définition, équipements de toit compris (rampe, antennes : + 1,6 m au plus)
        // (le modèle lointain peut omettre un équipement haut : portique, rétroviseurs)
        expect(b.maxY, 'hauteur').toBeGreaterThan(m === near ? def.height - 0.08 : def.height * 0.83);
        expect(b.maxY, 'hauteur').toBeLessThan(def.height + (kind === 'vl_commandement' ? 1.7 : 1.1));
        // roues : posées au sol, symétriques
        if (!rotor) {
          const w = bounds(d.position, d.part, (t) => t === PART_WHEEL || t === PART_WHEEL_STEER || t === PART_BIKE_WHEEL);
          expect(w.n, 'roues').toBeGreaterThan(0);
          expect(Math.abs(w.minY), 'roues au sol').toBeLessThan(0.005);
          expect(Math.abs(w.minX + w.maxX), 'symétrie des roues').toBeLessThan(0.01);
          expect(w.maxX, 'voie').toBeLessThanOrEqual(def.width / 2 + 0.001);
        }
        // indices valides
        for (let i = 0; i < d.index.length; i++) expect(d.index[i]!).toBeLessThan(d.vertexCount);
      }
    });
  }

  it('affiche le tableau des triangles', () => {
    console.log('\n' + rows.join('\n'));
    expect(rows.length).toBe(CONTRACT_KINDS.length);
  });

  it('oriente toutes les faces vers l\'extérieur (ordre des sommets = normale)', () => {
    for (const kind of CONTRACT_KINDS) {
      const d = buildModel(kind, referenceDef(kind)!, false).data;
      let bad = 0;
      for (let t = 0; t < d.index.length; t += 3) {
        const a = d.index[t]! * 3, b = d.index[t + 1]! * 3, c = d.index[t + 2]! * 3;
        const ux = d.position[b]! - d.position[a]!, uy = d.position[b + 1]! - d.position[a + 1]!, uz = d.position[b + 2]! - d.position[a + 2]!;
        const vx = d.position[c]! - d.position[a]!, vy = d.position[c + 1]! - d.position[a + 1]!, vz = d.position[c + 2]! - d.position[a + 2]!;
        const gx = uy * vz - uz * vy, gy = uz * vx - ux * vz, gz = ux * vy - uy * vx;
        const nx = d.normal[a]! + d.normal[b]! + d.normal[c]!, ny = d.normal[a + 1]! + d.normal[b + 1]! + d.normal[c + 1]!, nz = d.normal[a + 2]! + d.normal[b + 2]! + d.normal[c + 2]!;
        if (gx * nx + gy * ny + gz * nz < 0) bad++;
      }
      expect(bad, kind).toBe(0);
    }
  });

  it('la clé de cache dépend des dimensions et des tourelles', () => {
    const a = referenceDef('canon_eau')!;
    const b = { ...a, length: a.length + 0.5 };
    const c = { ...a, turrets: a.turrets.map((t) => ({ ...t, z: t.z - 1 })) };
    expect(modelKey('canon_eau', a)).not.toBe(modelKey('canon_eau', b));
    expect(modelKey('canon_eau', a)).not.toBe(modelKey('canon_eau', c));
    expect(modelKey('canon_eau', a)).toBe(modelKey('canon_eau', { ...a }));
  });

  it('s\'adapte à une définition aux cotes différentes (échelle exacte)', () => {
    const def = { ...referenceDef('fourgon_crs')!, length: 6.4, width: 2.2, height: 2.7, wheelbase: 4.0 };
    const d = buildModel('fourgon_crs', def, false).data;
    const b = bounds(d.position, null, () => true);
    expect(b.maxZ - b.minZ).toBeGreaterThan(6.34);
    expect(b.maxZ - b.minZ).toBeLessThan(6.6);
    const w = bounds(d.position, d.part, (t) => t === PART_WHEEL || t === PART_WHEEL_STEER);
    expect(w.maxX).toBeCloseTo(1.1, 2);
  });

  it('un type inconnu retombe sur la berline', () => {
    const def = referenceDef('voiture')!;
    const d = buildModel('vehicule_inconnu', { ...def, kind: 'vehicule_inconnu' }, false).data;
    expect(d.triangleCount).toBeGreaterThan(500);
  });
});
