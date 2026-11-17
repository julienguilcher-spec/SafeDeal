/* Sérigraphies des véhicules : chaque inscription doit se lire à l'endroit depuis l'extérieur de la face qui la
 * porte (ni en miroir, ni tournée vers le sol). Les constructeurs tournent sous Node (aucun DOM). */
import { describe, expect, it } from 'vitest';
import { tile } from '@/render/vehicles/atlas-layout';
import type { TileName } from '@/render/vehicles/atlas-layout';
import { PART_DOOR, PART_WHEEL_STEER } from '@/render/vehicles/geo';
import { buildModel } from '@/render/vehicles/models/index';
import { REFERENCE_DEFS } from '@/render/vehicles/refdefs';

/** Tuiles portant un texte ou un motif orienté. La bande tricolore est volontairement en miroir sur le flanc droit
 * (hachures en tête, à l'avant, des deux côtés) : elle n'est contrôlée que pour son orientation vers le sol. */
const LETTERING: TileName[] = ['police', 'gendarmerie', 'pompiers', 'samu', 'ambulance', 'taxi', 'girouette', 'banderole', 'bande_police'];

interface Bad { kind: string; far: boolean; name: TileName; why: string; at: string }

function audit(kind: string, far: boolean): { bad: Bad[]; seen: Set<TileName> } {
  const def = REFERENCE_DEFS.find((d) => d.kind === kind)!;
  const d = buildModel(kind, def, far).data;
  const rects = LETTERING.map((n) => [n, tile(n)] as const);
  const bad: Bad[] = [];
  const seen = new Set<TileName>();
  for (let t = 0; t < d.index.length; t += 3) {
    const ia = d.index[t]!, ib = d.index[t + 1]!, ic = d.index[t + 2]!;
    const su = (d.uv[ia * 2]! + d.uv[ib * 2]! + d.uv[ic * 2]!) / 3, sv = (d.uv[ia * 2 + 1]! + d.uv[ib * 2 + 1]! + d.uv[ic * 2 + 1]!) / 3;
    const hit = rects.find(([, r]) => su > r.u0 && su < r.u1 && sv > r.v0 && sv < r.v1);
    if (!hit) continue;
    const name = hit[0];
    seen.add(name);
    const p = (i: number, k: number): number => d.position[i * 3 + k]!;
    const e1 = [p(ib, 0) - p(ia, 0), p(ib, 1) - p(ia, 1), p(ib, 2) - p(ia, 2)];
    const e2 = [p(ic, 0) - p(ia, 0), p(ic, 1) - p(ia, 1), p(ic, 2) - p(ia, 2)];
    const du1 = d.uv[ib * 2]! - d.uv[ia * 2]!, dv1 = d.uv[ib * 2 + 1]! - d.uv[ia * 2 + 1]!;
    const du2 = d.uv[ic * 2]! - d.uv[ia * 2]!, dv2 = d.uv[ic * 2 + 1]! - d.uv[ia * 2 + 1]!;
    const det = du1 * dv2 - du2 * dv1;
    if (Math.abs(det) < 1e-12) continue;
    // sens de lecture (u croissant) et haut du texte (v croissant) dans le repère du modèle
    const T = [0, 1, 2].map((k) => (e1[k]! * dv2 - e2[k]! * dv1) / det);
    const B = [0, 1, 2].map((k) => (e2[k]! * du1 - e1[k]! * du2) / det);
    // normale de la face visible (ordre des sommets)
    const n = [e1[1]! * e2[2]! - e1[2]! * e2[1]!, e1[2]! * e2[0]! - e1[0]! * e2[2]!, e1[0]! * e2[1]! - e1[1]! * e2[0]!];
    const nl = Math.hypot(n[0]!, n[1]!, n[2]!) || 1;
    const tb = [T[1]! * B[2]! - T[2]! * B[1]!, T[2]! * B[0]! - T[0]! * B[2]!, T[0]! * B[1]! - T[1]! * B[0]!];
    const at = `(${((p(ia, 0) + p(ib, 0) + p(ic, 0)) / 3).toFixed(2)}, ${((p(ia, 1) + p(ib, 1) + p(ic, 1)) / 3).toFixed(2)}, ${((p(ia, 2) + p(ib, 2) + p(ic, 2)) / 3).toFixed(2)})`;
    if (name !== 'bande_police' && tb[0]! * n[0]! + tb[1]! * n[1]! + tb[2]! * n[2]! <= 0) bad.push({ kind, far, name, why: 'en miroir', at });
    if (n[1]! / nl < -0.3) bad.push({ kind, far, name, why: 'tournée vers le sol', at });
    // sur une face verticale (flanc, avant, arrière), le haut du texte est en haut
    if (Math.abs(n[1]! / nl) < 0.5 && B[1]! <= 0) bad.push({ kind, far, name, why: 'à l\'envers', at });
  }
  return { bad, seen };
}

describe('sérigraphies des véhicules', () => {
  it('toutes les inscriptions se lisent à l\'endroit, de l\'extérieur (modèles proches et lointains)', () => {
    const bad: Bad[] = [];
    for (const def of REFERENCE_DEFS) for (const far of [false, true]) bad.push(...audit(def.kind, far).bad);
    expect(bad.map((b) => `${b.kind}${b.far ? ' (loin)' : ''} ${b.name} ${b.why} en ${b.at}`)).toEqual([]);
  });

  it('la voiture de police porte « POLICE » sur le capot, tourné vers le ciel et l\'avant', () => {
    for (const far of [false, true]) {
      const def = REFERENCE_DEFS.find((d) => d.kind === 'voiture_police')!;
      const d = buildModel('voiture_police', def, far).data;
      const r = tile('police');
      let up = 0;
      for (let t = 0; t < d.index.length; t += 3) {
        const ia = d.index[t]!, ib = d.index[t + 1]!, ic = d.index[t + 2]!;
        const su = (d.uv[ia * 2]! + d.uv[ib * 2]! + d.uv[ic * 2]!) / 3, sv = (d.uv[ia * 2 + 1]! + d.uv[ib * 2 + 1]! + d.uv[ic * 2 + 1]!) / 3;
        if (!(su > r.u0 && su < r.u1 && sv > r.v0 && sv < r.v1)) continue;
        // normale du sommet : capot = composante verticale dominante, légèrement vers l'avant (+z)
        const ny = d.normal[ia * 3 + 1]!, nz = d.normal[ia * 3 + 2]!;
        if (ny > 0.8) {
          up++;
          expect(nz, far ? 'loin' : 'proche').toBeGreaterThan(0);
          // lisible de face (comme sur les fourgons) : u croît vers +x, v vers l'arrière (pare-brise), sur le capot
          for (const [a, b] of [[ia, ib], [ib, ic], [ic, ia]] as const) {
            const du = d.uv[b * 2]! - d.uv[a * 2]!, dv = d.uv[b * 2 + 1]! - d.uv[a * 2 + 1]!;
            const dx = d.position[b * 3]! - d.position[a * 3]!, dz = d.position[b * 3 + 2]! - d.position[a * 3 + 2]!;
            if (Math.abs(du) > 1e-6 && Math.abs(dv) < 1e-6) expect(Math.sign(dx), 'sens de lecture').toBe(Math.sign(du));
            if (Math.abs(dv) > 1e-6 && Math.abs(du) < 1e-6) expect(Math.sign(dz), 'haut du texte').toBe(-Math.sign(dv));
          }
          expect(d.position[ia * 3 + 2]!, 'sur le capot').toBeGreaterThan(def.length / 2 - 1.3);
          expect(Math.abs(d.position[ia * 3]!), 'largeur raisonnable').toBeLessThan(def.width / 2);
        }
      }
      expect(up, far ? 'loin' : 'proche').toBeGreaterThan(0);
    }
  });

  it('les portes de cabine ne recouvrent pas la roue avant (aucun pneu affleurant à travers le panneau)', () => {
    for (const def of REFERENCE_DEFS) {
      const d = buildModel(def.kind, def, false).data;
      // roue directrice gauche (+x) : étendue en z et en hauteur
      let zMin = Infinity, zMax = -Infinity, yMax = -Infinity, n = 0;
      for (let i = 0; i < d.vertexCount; i++) {
        if (d.part[i * 3] !== PART_WHEEL_STEER || d.position[i * 3]! <= 0) continue;
        n++;
        zMin = Math.min(zMin, d.position[i * 3 + 2]!); zMax = Math.max(zMax, d.position[i * 3 + 2]!);
        yMax = Math.max(yMax, d.position[i * 3 + 1]!);
      }
      if (n === 0) continue;
      for (let i = 0; i < d.vertexCount; i++) {
        // panneau extérieur des portes avant (indices 0 et 1)
        if (d.part[i * 3] !== PART_DOOR || Math.abs(d.part[i * 3 + 1]!) > 2 || d.normal[i * 3]! < 0.9) continue;
        const z = d.position[i * 3 + 2]!, y = d.position[i * 3 + 1]!;
        if (z > zMin + 0.05 && z < zMax - 0.05) expect(y, `${def.kind} : bas de porte au droit de la roue`).toBeGreaterThan(yMax - 0.02);
      }
    }
  });
});
