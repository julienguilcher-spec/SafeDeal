// Obstacles au sol des monuments : polygones valides et antihoraires, passages sous l'Arc et sous la Tour,
// repli sur l'emprise, passage en coordonnées monde, et pureté (aucun import de three dans collide/).
import { describe, expect, it } from 'vitest';
import { getColliders, getWorldColliders, listColliderKeys, siteOfLandmark } from '@/world/monuments/colliders';
import { isSimpleRing, pointInRing, signedArea, rectRing, transformRing, worldRingToLocal } from '@/world/monuments/shape2d';
import { PASS_UNDER_Y, type MonumentCollider } from '@/world/monuments/types';

const KEYS = ['arc_triomphe', 'colonne_juillet', 'colonne_vendome', 'fontaines_concorde', 'obelisque_concorde', 'statue_republique', 'tour_eiffel'];
const SITE = { footprint: [], height: 0 };

/** Un disque de rayon r centré en (x, z) est-il libre au sol ? (échantillonnage du pourtour) */
function freeAtGround(cols: MonumentCollider[], x: number, z: number, r = 0.35): boolean {
  for (const c of cols) {
    if (c.baseY > PASS_UNDER_Y) continue;
    if (pointInRing(x, z, c.ring)) return false;
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; if (pointInRing(x + Math.cos(a) * r, z + Math.sin(a) * r, c.ring)) return false; }
  }
  return true;
}
function overhead(cols: MonumentCollider[], x: number, z: number): MonumentCollider[] {
  return cols.filter((c) => c.baseY > PASS_UNDER_Y && pointInRing(x, z, c.ring));
}

describe('obstacles des monuments', () => {
  it('chaque monument livré a son fichier collide/', () => {
    const keys = listColliderKeys();
    for (const k of KEYS) expect(keys).toContain(k);
  });

  it.each(KEYS)('%s : polygones valides, antihoraires, hauteurs cohérentes', (key) => {
    const cols = getColliders(key, SITE);
    expect(cols.length).toBeGreaterThan(0);
    for (const c of cols) {
      expect(c.ring.length % 2).toBe(0);
      expect(c.ring.length).toBeGreaterThanOrEqual(6);
      expect(isSimpleRing(c.ring)).toBe(true);
      expect(signedArea(c.ring)).toBeGreaterThan(0.5);
      expect(c.height).toBeGreaterThan(0);
      expect(c.baseY).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(c.height) && Number.isFinite(c.baseY)).toBe(true);
    }
    // au moins un obstacle plein au sol
    expect(cols.some((c) => c.baseY <= PASS_UNDER_Y)).toBe(true);
  });

  it('on passe sous la grande arche et sous les arches latérales de l\'Arc de triomphe', () => {
    const cols = getColliders('arc_triomphe', SITE);
    // grande arche : couloir de 14,62 m selon z (hors dalle de la tombe)
    for (const [x, z] of [[4, 0], [-4, 0], [5.5, 9], [-5.5, -9], [0, -6], [6.5, 3]]) {
      expect(freeAtGround(cols, x, z)).toBe(true);
      expect(overhead(cols, x, z).length).toBeGreaterThan(0);
    }
    // arches latérales : couloir de 8,44 m selon x, à travers les piles
    for (const [x, z] of [[14.86, 0], [-14.86, 0], [20, 3], [-20, -3], [9, 0]]) {
      expect(freeAtGround(cols, x, z)).toBe(true);
      expect(overhead(cols, x, z).length).toBeGreaterThan(0);
    }
    // les quatre piles sont pleines
    for (const [x, z] of [[14.86, 7.6], [-14.86, 7.6], [14.86, -7.6], [-14.86, -7.6]]) expect(freeAtGround(cols, x, z)).toBe(false);
    // la voûte la plus basse commence bien au-dessus des têtes et des véhicules
    for (const c of cols) if (c.baseY > 0) expect(c.baseY).toBeGreaterThan(10);
    // dehors, c'est libre
    expect(freeAtGround(cols, 0, 30)).toBe(true);
    expect(overhead(cols, 0, 30).length).toBe(0);
  });

  it('on marche sous la Tour Eiffel, entre les piliers et sous les arcs', () => {
    const cols = getColliders('tour_eiffel', SITE);
    for (const [x, z] of [[0, 0], [0, 55], [55, 0], [-55, 0], [0, -55], [30, 30], [-33, 20], [10, -36]]) expect(freeAtGround(cols, x, z)).toBe(true);
    expect(overhead(cols, 0, 0).length).toBeGreaterThan(0);
    for (const [x, z] of [[50, 50], [-50, 50], [50, -50], [-50, -50]]) expect(freeAtGround(cols, x, z)).toBe(false);
    // passage libre d'au moins 70 m entre deux piliers
    let gap = 0;
    while (freeAtGround(cols, gap / 2, 50) && freeAtGround(cols, -gap / 2, 50) && gap < 200) gap += 0.5;
    expect(gap).toBeGreaterThan(70);
    expect(gap).toBeLessThan(76);
    for (const c of cols) if (c.baseY > 0) expect(c.baseY).toBeGreaterThanOrEqual(50);
  });

  it('sans fichier collide/, l\'emprise du site sert d\'obstacle ; sans emprise, rien', () => {
    expect(getColliders('monument_sans_fichier', SITE)).toEqual([]);
    const cw = [0, 0, 10, 0, 10, 6, 0, 6];           // sens horaire vu de dessus
    const cols = getColliders('monument_sans_fichier', { footprint: cw, height: 18 });
    expect(cols.length).toBe(1);
    expect(cols[0].height).toBe(18);
    expect(cols[0].baseY).toBe(0);
    expect(signedArea(cols[0].ring)).toBeGreaterThan(0);
    expect(getColliders('monument_sans_fichier', { footprint: cw, height: 0 })[0].height).toBeGreaterThan(0);
  });

  it('les alias de clé donnent les mêmes obstacles', () => {
    expect(getColliders('arc_de_triomphe', SITE)).toEqual(getColliders('arc_triomphe', SITE));
  });

  it('passage du repère local au repère monde (position et cap)', () => {
    const lm = { key: 'obelisque_concorde', x: 100, z: -40, heading: Math.PI / 2, height: 33, footprint: [] as number[] };
    const world = getWorldColliders(lm);
    const local = getColliders('obelisque_concorde', SITE);
    expect(world.length).toBe(local.length);
    for (let i = 0; i < world.length; i++) {
      expect(Math.abs(signedArea(world[i].ring) - signedArea(local[i].ring))).toBeLessThan(1e-6);
      expect(pointInRing(100, -40, world[i].ring)).toBe(true);
    }
    // cap h : +z local → (sin h, cos h) ; pour h = π/2, +z local devient +x monde
    const p = transformRing([0, 5], 100, -40, Math.PI / 2);
    expect(p[0]).toBeCloseTo(105, 6);
    expect(p[1]).toBeCloseTo(-40, 6);
    const back = worldRingToLocal(p, 100, -40, Math.PI / 2);
    expect(back[0]).toBeCloseTo(0, 6);
    expect(back[1]).toBeCloseTo(5, 6);
    // emprise monde → site local → identique après aller-retour
    const fp = transformRing(rectRing(0, 0, 20, 8), 100, -40, 0.7);
    const site = siteOfLandmark({ x: 100, z: -40, heading: 0.7, height: 12, footprint: fp });
    const r = rectRing(0, 0, 20, 8);
    for (let i = 0; i < r.length; i++) expect(site.footprint[i]).toBeCloseTo(r[i], 5);
  });
});

describe('pureté des données de collision', () => {
  // texte source de tous les fichiers du module et du noyau (lu par Vite, sans dépendre des types de Node)
  const sources = {
    ...(import.meta.glob('../../src/world/monuments/**/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>),
    ...(import.meta.glob('../../src/core/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>),
  };
  const ROOT = '../../src/world/monuments/';

  function normalize(p: string): string {
    const out: string[] = [];
    for (const part of p.split('/')) {
      if (part === '.' || part === '') continue;
      if (part === '..' && out.length > 0 && out[out.length - 1] !== '..') out.pop(); else out.push(part);
    }
    return out.join('/');
  }
  /** Imports d'exécution (hors `import type`) d'un fichier TypeScript. */
  function runtimeImports(code: string): string[] {
    const out: string[] = [];
    const re = /^\s*(import|export)\s+(type\s+)?([^;'"]*?\sfrom\s+)?['"]([^'"]+)['"]/gm;
    let m: RegExpExecArray | null;
    while ((m = re.exec(code))) { if (!m[2]) out.push(m[4]); }
    const dyn = /import\(\s*['"]([^'"]+)['"]\s*\)/g;
    while ((m = dyn.exec(code))) out.push(m[1]);
    return out;
  }
  function resolve(from: string, spec: string): string | null {
    let base: string;
    if (spec.startsWith('@/')) base = '../../src/' + spec.slice(2);
    else if (spec.startsWith('.')) base = normalize(from.slice(0, from.lastIndexOf('/') + 1) + spec);
    else return null;
    for (const cand of [base + '.ts', base + '/index.ts', base]) if (cand in sources) return cand;
    return null;
  }

  it('aucun fichier de collide/ n\'importe three, ni directement ni par transitivité', () => {
    const files = Object.keys(sources).filter((f) => f.startsWith(ROOT + 'collide/'));
    expect(files.length).toBeGreaterThanOrEqual(KEYS.length);
    const seen = new Set<string>();
    const stack = [...files, ROOT + 'colliders.ts'];
    expect(ROOT + 'colliders.ts' in sources).toBe(true);
    while (stack.length > 0) {
      const file = stack.pop()!;
      if (seen.has(file)) continue;
      seen.add(file);
      for (const spec of runtimeImports(sources[file])) {
        expect(spec === 'three' || spec.startsWith('three/'), `${file} importe ${spec}`).toBe(false);
        expect(/\/kit(\/|$)/.test(spec), `${file} importe le kit (${spec})`).toBe(false);
        const next = resolve(file, spec);
        if (next) stack.push(next);
      }
    }
    // la fermeture transitive reste petite : données pures uniquement
    expect([...seen].some((f) => f.endsWith('/shape2d.ts'))).toBe(true);
    expect(seen.size).toBeLessThan(files.length + 8);
    // les fichiers de collide/ ne citent même pas « three » dans un import de type
    for (const f of files) expect(/['"]three['"]/.test(sources[f]), `${f} cite three`).toBe(false);
  });

  it('le détecteur d\'imports reconnaît bien un import de three', () => {
    expect(runtimeImports("import * as THREE from 'three';\nimport type { A } from 'three';\nexport { b } from './b';")).toEqual(['three', './b']);
    expect(runtimeImports(sources[ROOT + 'kit/geo.ts'])).toContain('three');
  });
});
