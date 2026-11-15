// Registre des monuments, budgets de triangles et d'appels de dessin, dimensions réelles.
// Sous Node il n'y a pas de canvas : les matériaux sont créés sans texture, la géométrie est complète.
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { getMonument, hasMonument, listMonuments } from '@/world/monuments/registry';
import { statsOf } from '@/world/monuments/kit';
import { canonicalKey } from '@/world/monuments/keys';
import type { QualityLevel } from '@/core/contracts';

const KEYS = ['arc_triomphe', 'colonne_juillet', 'colonne_vendome', 'fontaines_concorde', 'obelisque_concorde', 'statue_republique', 'tour_eiffel'];
const SITE = { footprint: [], height: 0 };
/** Dimensions réelles attendues (m) : hauteur, et largeur × profondeur quand elles sont connues. */
const REAL: Record<string, { h: number; w?: number; d?: number; tol?: number }> = {
  // largeur : corniche en saillie de 1,55 m ; profondeur : piédestaux et groupes sculptés en saillie de 2,7 m
  arc_triomphe: { h: 49.54, w: 44.82 + 2 * 1.55, d: 22.21 + 2 * 2.7, tol: 0.06 },
  tour_eiffel: { h: 330, w: 124.9 + 4, d: 124.9 + 4, tol: 0.03 },
  obelisque_concorde: { h: 33.37, tol: 0.03 },
  fontaines_concorde: { h: 9.2, tol: 0.12 },
  colonne_vendome: { h: 44.3, tol: 0.02 },
  colonne_juillet: { h: 50.5, tol: 0.03 },
  statue_republique: { h: 25, tol: 0.04 },
};

describe('registre des monuments', () => {
  it('contient les sept premiers monuments, triés par clé', () => {
    const keys = listMonuments().map((d) => d.key);
    for (const k of KEYS) expect(keys).toContain(k);
    expect(keys).toEqual([...keys].sort());
  });

  it('retrouve un monument par sa clé ou un alias', () => {
    expect(getMonument('arc_triomphe')?.name).toMatch(/Arc de triomphe/);
    expect(getMonument('arc_de_triomphe')).toBe(getMonument('arc_triomphe'));
    expect(getMonument('Arc-de-Triomphe')).toBe(getMonument('arc_triomphe'));
    expect(canonicalKey('colonne_de_juillet')).toBe('colonne_juillet');
    expect(hasMonument('tour_eiffel')).toBe(true);
    expect(getMonument('inconnu')).toBeUndefined();
    expect(hasMonument('')).toBe(false);
  });

  it('chaque définition est complète', () => {
    for (const def of listMonuments()) {
      expect(def.key).toMatch(/^[a-z0-9_]+$/);
      expect(def.name.length).toBeGreaterThan(3);
      expect(def.radius).toBeGreaterThan(1);
      expect(def.height).toBeGreaterThan(1);
      expect(typeof def.build).toBe('function');
      expect(typeof def.buildFar).toBe('function');
    }
  });
});

describe.each(KEYS)('monument %s', (key) => {
  const def = getMonument(key)!;

  it.each(['bas', 'haut', 'ultra'] as QualityLevel[])('modèle détaillé (%s) dans le budget', (quality) => {
    const obj = def.build(SITE, quality);
    const st = statsOf(obj);
    const budget = key === 'tour_eiffel' ? 150000 : 60000;
    expect(st.triangles).toBeGreaterThan(100);
    expect(st.triangles).toBeLessThanOrEqual(budget);
    expect(st.drawCalls).toBeLessThanOrEqual(12);
    // aucune coordonnée invalide
    obj.traverse((c) => {
      const m = c as THREE.Mesh;
      if (!m.geometry) return;
      const p = m.geometry.getAttribute('position');
      for (let i = 0; i < p.count; i++) {
        if (!Number.isFinite(p.getX(i)) || !Number.isFinite(p.getY(i)) || !Number.isFinite(p.getZ(i))) throw new Error(`sommet invalide dans ${c.name}`);
      }
    });
  });

  it('dimensions réelles et rayon englobant', () => {
    const obj = def.build(SITE, 'haut');
    obj.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(obj);
    const real = REAL[key];
    const tol = real.tol ?? 0.05;
    expect(box.min.y).toBeGreaterThan(-0.6);
    expect(Math.abs(box.max.y - real.h) / real.h).toBeLessThan(tol);
    expect(Math.abs(def.height - real.h) / real.h).toBeLessThan(0.02);
    const size = box.getSize(new THREE.Vector3());
    if (real.w !== undefined) expect(Math.abs(size.x - real.w) / real.w).toBeLessThan(0.06);
    if (real.d !== undefined) expect(Math.abs(size.z - real.d) / real.d).toBeLessThan(0.08);
    // le rayon déclaré englobe le modèle (à 5 % près), sans exagération
    const reach = Math.max(Math.hypot(box.max.x, box.max.z), Math.hypot(box.min.x, box.min.z), Math.hypot(box.max.x, box.min.z), Math.hypot(box.min.x, box.max.z));
    expect(def.radius).toBeGreaterThan(Math.max(size.x, size.z) / 2 * 0.95);
    expect(def.radius).toBeLessThan(reach * 1.6 + 2);
  });

  it('silhouette lointaine ≤ 400 triangles, même gabarit', () => {
    const far = def.buildFar(SITE);
    const st = statsOf(far);
    expect(st.triangles).toBeGreaterThan(10);
    expect(st.triangles).toBeLessThanOrEqual(400);
    expect(st.drawCalls).toBeLessThanOrEqual(4);
    far.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(far);
    const real = REAL[key];
    expect(Math.abs(box.max.y - real.h) / real.h).toBeLessThan(0.08);
  });

  it('la qualité basse est plus légère que la haute', () => {
    const lo = statsOf(def.build(SITE, 'bas')).triangles, hi = statsOf(def.build(SITE, 'haut')).triangles;
    expect(lo).toBeLessThanOrEqual(hi);
  });
});
