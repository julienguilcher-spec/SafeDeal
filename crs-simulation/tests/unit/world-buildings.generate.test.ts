// Génération complète des maillages d'une tuile (sans rendu) : budgets, relief, mitoyenneté,
// toitures, robustesse aux polygones dégénérés.
import { describe, expect, it } from 'vitest';
import { createEmptyTile, decodeMapData, decodeTerrain, sampleTerrain } from '../../src/world/mapdata';
import type { Building, BuildingKind, BuildingStyle, RoofShape, Tile } from '../../src/world/mapdata';
import { generateTestDistrict, TEST_DISTRICT } from '../../src/world/testDistrict';
import { DETAIL_TRIANGLE_BUDGET, FAR_TRIANGLE_BUDGET, generateTileFarMesh, generateTileMeshes } from '../../src/world/view/buildings/generate';
import type { GenerateOptions } from '../../src/world/view/buildings/generate';
import { MeshData } from '../../src/world/view/buildings/meshdata';
import { STYLE_PARAMS, layoutBays } from '../../src/world/view/buildings/layout';
import { WALL_FREE, WALL_HIDDEN, WALL_PARTY, prepareTile } from '../../src/world/view/buildings/prepare';
import { EdgeSet } from '../../src/world/view/buildings/walls';

const raw = generateTestDistrict({ seed: 1 });
const data = decodeMapData(raw);
const terrain = decodeTerrain(raw.terrain);
const heightAt = (x: number, z: number): number => sampleTerrain(terrain, x, z);
const flat = (): number => 0;
const never = (): boolean => false;
const opts = (quality: GenerateOptions['quality'], h: GenerateOptions['heightAt'] = flat): GenerateOptions => ({ quality, heightAt: h, skipLandmark: never, seed: 1 });

let nextId = 1;
function building(outer: number[], p: Partial<Building> & { height: number }): Building {
  return {
    id: nextId++, kind: 'generic' as BuildingKind, roof: 'flat' as RoofShape, style: 'haussmann' as BuildingStyle, baseY: 0, levels: 0,
    holes: [], landmarkKey: '', name: '', ...p, outer: new Float32Array(outer),
  };
}
/** Rectangle antihoraire vu de dessus (x0 < x1, z0 < z1). */
function rect(x0: number, z0: number, x1: number, z1: number): number[] {
  return [x0, z1, x1, z1, x1, z0, x0, z0];
}
function tileOf(buildings: Building[]): Tile {
  const t = createEmptyTile(0, 0);
  t.buildings = buildings;
  return t;
}

/** Vérifie indices, positions et uv ; retourne la boîte englobante. */
function checkMesh(m: MeshData): { minY: number; maxY: number } {
  let minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < m.ni; i++) if (m.idx[i] >= m.nv) throw new Error('indice hors bornes');
  if (m.ni % 3 !== 0) throw new Error('indices non multiples de 3');
  for (let i = 0; i < m.nv; i++) {
    const x = m.pos[3 * i], y = m.pos[3 * i + 1], z = m.pos[3 * i + 2];
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) throw new Error('position non finie');
    if (!Number.isFinite(m.uv[2 * i]) || !Number.isFinite(m.uv[2 * i + 1])) throw new Error('uv non fini');
    const nl = Math.hypot(m.nor[3 * i], m.nor[3 * i + 1], m.nor[3 * i + 2]);
    if (nl < 100) throw new Error('normale non unitaire');
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { minY, maxY };
}

/** Somme des aires (m²) des triangles tournés vers le haut dont les trois sommets sont à l'altitude y (±tol). */
function topArea(m: MeshData, y: number, tol = 0.02): number {
  let s = 0;
  for (let t = 0; t < m.ni; t += 3) {
    const a = m.idx[t], b = m.idx[t + 1], c = m.idx[t + 2];
    if (Math.abs(m.pos[3 * a + 1] - y) > tol || Math.abs(m.pos[3 * b + 1] - y) > tol || Math.abs(m.pos[3 * c + 1] - y) > tol) continue;
    const ux = m.pos[3 * b] - m.pos[3 * a], uz = m.pos[3 * b + 2] - m.pos[3 * a + 2];
    const vx = m.pos[3 * c] - m.pos[3 * a], vz = m.pos[3 * c + 2] - m.pos[3 * a + 2];
    const ny = uz * vx - ux * vz;                 // composante y du produit vectoriel
    if (ny > 0) s += ny / 2;
  }
  return s;
}

/**
 * Le produit vectoriel de chaque triangle doit pointer du même côté que les normales de ses sommets :
 * une face à l'envers serait invisible (élimination des faces arrière).
 */
function countFlipped(m: MeshData): number {
  let flipped = 0;
  for (let t = 0; t < m.ni; t += 3) {
    const a = m.idx[t], b = m.idx[t + 1], c = m.idx[t + 2];
    const ux = m.pos[3 * b] - m.pos[3 * a], uy = m.pos[3 * b + 1] - m.pos[3 * a + 1], uz = m.pos[3 * b + 2] - m.pos[3 * a + 2];
    const vx = m.pos[3 * c] - m.pos[3 * a], vy = m.pos[3 * c + 1] - m.pos[3 * a + 1], vz = m.pos[3 * c + 2] - m.pos[3 * a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz);
    if (l < 1e-7) continue;                       // triangle dégénéré : sans effet
    const d = (nx * m.nor[3 * a] + ny * m.nor[3 * a + 1] + nz * m.nor[3 * a + 2]) / (l * 127);
    if (d < -0.2) flipped++;
  }
  return flipped;
}

describe("quartier d'essai", () => {
  it('chaque tuile, chaque qualité : maillage cohérent, budget tenu, aucune face à l\'envers', () => {
    const main = new MeshData(), rail = new MeshData();
    for (const tile of data.tiles) {
      const tris: Record<string, number> = {};
      for (const quality of ['bas', 'moyen', 'haut', 'ultra'] as const) {
        const st = generateTileMeshes(tile, opts(quality, heightAt), main, rail);
        checkMesh(main);
        checkMesh(rail);
        expect(countFlipped(main)).toBe(0);
        expect(st.triangles).toBe(main.triangles + rail.triangles);
        expect(st.triangles).toBeLessThanOrEqual(DETAIL_TRIANGLE_BUDGET);
        expect(st.buildings).toBeGreaterThan(100);
        tris[quality] = st.triangles;
        if (quality === 'bas') expect(rail.triangles).toBe(0);          // un seul appel de dessin
        else expect(rail.triangles).toBeGreaterThan(0);
      }
      // la qualité basse est nettement plus légère
      expect(tris.bas).toBeLessThan(tris.haut * 0.35);
      expect(tris.moyen).toBeLessThan(tris.haut);
      expect(tris.ultra).toBe(tris.haut);
    }
  });

  it('version lointaine : budget tenu, bien plus légère que la version détaillée', () => {
    const far = new MeshData(), main = new MeshData(), rail = new MeshData();
    for (const tile of data.tiles) {
      const st = generateTileFarMesh(tile, opts('haut', heightAt), far);
      checkMesh(far);
      expect(countFlipped(far)).toBe(0);
      expect(far.triangles).toBeLessThanOrEqual(FAR_TRIANGLE_BUDGET);
      expect(st.buildings).toBeGreaterThan(100);
      const detail = generateTileMeshes(tile, opts('bas', heightAt), main, rail);
      expect(far.triangles).toBeLessThan(detail.triangles * 0.5);
    }
  });

  it('est déterministe : mêmes entrées, mêmes tampons', () => {
    const a = new MeshData(), b = new MeshData(), ra = new MeshData(), rb = new MeshData();
    generateTileMeshes(data.tiles[0], opts('haut', heightAt), a, ra);
    generateTileMeshes(data.tiles[1], opts('moyen', heightAt), b, rb);       // un autre appel entre les deux
    generateTileMeshes(data.tiles[0], opts('haut', heightAt), b, rb);
    expect(b.nv).toBe(a.nv);
    expect(b.ni).toBe(a.ni);
    expect(Array.from(b.pos.subarray(0, 3000))).toEqual(Array.from(a.pos.subarray(0, 3000)));
    expect(Array.from(b.idx.subarray(0, 3000))).toEqual(Array.from(a.idx.subarray(0, 3000)));
    expect(Array.from(b.fac.subarray(0, 4000))).toEqual(Array.from(a.fac.subarray(0, 4000)));
  });

  it('la graine change l\'aspect (teintes, variantes), pas la géométrie', () => {
    const a = new MeshData(), b = new MeshData(), ra = new MeshData(), rb = new MeshData();
    generateTileMeshes(data.tiles[0], { ...opts('moyen', heightAt), seed: 1 }, a, ra);
    generateTileMeshes(data.tiles[0], { ...opts('moyen', heightAt), seed: 2 }, b, rb);
    expect(b.triangles).toBe(a.triangles);
    let different = 0;
    for (let i = 0; i < a.nv * 3; i++) if (a.col[i] !== b.col[i]) different++;
    expect(different).toBeGreaterThan(a.nv);
  });

  it('pose chaque bâtiment sur le point le plus bas de son emprise et prolonge le mur sous le sol', () => {
    const tile = data.tiles[0];
    const p = prepareTile(tile, heightAt, never, 1);
    let checked = 0;
    for (let k = 0; k < p.count; k++) {
      const b = p.building[k];
      let min = Infinity;
      for (let i = 0; i < b.outer.length; i += 2) min = Math.min(min, heightAt(b.outer[i], b.outer[i + 1]));
      expect(p.baseY[k]).toBeCloseTo(min, 3);
      checked++;
    }
    expect(checked).toBeGreaterThan(100);
    // les murs descendent sous le point le plus bas du relief de la tuile
    const main = new MeshData(), rail = new MeshData();
    generateTileMeshes(tile, opts('haut', heightAt), main, rail);
    let lowestBase = Infinity;
    for (let k = 0; k < p.count; k++) lowestBase = Math.min(lowestBase, p.baseY[k]);
    expect(checkMesh(main).minY).toBeLessThanOrEqual(lowestBase - 1.9);
  });

  it('ignore les bâtiments remplacés par un monument, seulement si skipLandmark le demande', () => {
    const tile = data.tiles.find((t) => t.buildings.some((b) => b.landmarkKey === TEST_DISTRICT.landmarkKey))!;
    const withKey = tile.buildings.filter((b) => b.landmarkKey !== '').length;
    expect(withKey).toBeGreaterThan(0);
    const main = new MeshData(), rail = new MeshData();
    const kept = generateTileMeshes(tile, opts('bas'), main, rail);
    const asked: string[] = [];
    const skipped = generateTileMeshes(tile, { ...opts('bas'), skipLandmark: (key) => { asked.push(key); return true; } }, main, rail);
    expect(kept.buildings - skipped.buildings).toBe(withKey);
    expect(asked).toContain(TEST_DISTRICT.landmarkKey);
    expect(asked).not.toContain('');
    const farKept = generateTileFarMesh(tile, opts('bas'), main);
    const farSkipped = generateTileFarMesh(tile, { ...opts('bas'), skipLandmark: () => true }, main);
    expect(farKept.buildings - farSkipped.buildings).toBe(withKey);
  });
});

describe('murs mitoyens', () => {
  // A (haut, 20 m) et B (bas, 12 m) partagent le mur x = 10 ; C est isolé.
  const a = building(rect(0, 0, 10, 10), { height: 20 });
  const b = building(rect(10, 0, 20, 10), { height: 12 });
  const c = building(rect(40, 0, 50, 10), { height: 15 });
  const tile = tileOf([a, b, c]);

  it('classe les murs : libre, mitoyen (aveugle), caché par un voisin plus haut', () => {
    const p = prepareTile(tile, flat, never, 1);
    expect(p.count).toBe(3);
    // classement de chaque côté, repéré par l'abscisse de son milieu
    const flags = (k: number): Map<number, number> => {
      const r = p.firstRing[k];
      const out = new Map<number, number>();
      for (let i = 0; i < p.ringLen[r]; i++) {
        const s = p.ringStart[r] + i, e = p.ringStart[r] + ((i + 1) % p.ringLen[r]);
        out.set(Math.round((p.coords[2 * s] + p.coords[2 * e]) / 2), p.wall[s]);
      }
      return out;
    };
    const fa = flags(0), fb = flags(1), fc = flags(2);
    expect(fa.get(10)).toBe(WALL_PARTY);        // A dépasse de B : son mur reste visible au-dessus, aveugle
    expect(fa.get(0)).toBe(WALL_FREE);
    expect(fa.get(5)).toBe(WALL_FREE);
    expect(fb.get(10)).toBe(WALL_HIDDEN);       // B est entièrement masqué par A sur ce côté
    expect(fb.get(20)).toBe(WALL_FREE);
    expect([...fc.values()].every((f) => f === WALL_FREE)).toBe(true);
  });

  it('ne dessine pas les murs cachés et ne met pas de fenêtre sur un mur mitoyen', () => {
    const main = new MeshData(), rail = new MeshData();
    generateTileMeshes(tile, opts('bas'), main, rail);
    // aucun triangle de mur vertical tourné vers -x sur le plan x = 10 (mur ouest de B) sous 12 m
    let hiddenFaces = 0, partyWindows = 0;
    for (let t = 0; t < main.ni; t += 3) {
      const i = main.idx[t];
      const onPlane = [0, 1, 2].every((q) => Math.abs(main.pos[3 * main.idx[t + q]] - 10) < 1e-3);
      if (!onPlane) continue;
      if (main.nor[3 * i] < -100) hiddenFaces++;
      // mur est de A (normale +x) : couche de mur aveugle, calage sur les travées désactivé (255)
      if (main.nor[3 * i] > 100 && main.fac[4 * i + 1] !== 255) partyWindows++;
    }
    expect(hiddenFaces).toBe(0);
    expect(partyWindows).toBe(0);
  });

  it('version lointaine : ni mur caché ni mur entre voisins de même hauteur', () => {
    const far = new MeshData();
    const twins = tileOf([building(rect(0, 0, 10, 10), { height: 15 }), building(rect(10, 0, 20, 10), { height: 15 })]);
    generateTileFarMesh(twins, opts('haut'), far);
    // 2 prismes : 3 murs visibles chacun (2 triangles) + un dessus (2 triangles)
    expect(far.triangles).toBe(2 * (3 * 2 + 2));
  });
});

describe('toitures', () => {
  it('mansarde : terrasson en retrait sur les côtés libres, à la hauteur totale', () => {
    const b = building(rect(0, 0, 30, 14), { height: 22, levels: 6, roof: 'mansard' });
    const main = new MeshData(), rail = new MeshData();
    generateTileMeshes(tileOf([b]), opts('moyen'), main, rail);
    const { maxY } = checkMesh(main);
    expect(maxY).toBeGreaterThanOrEqual(22 - 1e-3);
    const area = topArea(main, 22);
    // comble de 3,3 m → recul de 0,42 × 3,3 ≈ 1,39 m sur les quatre côtés
    const run = 3.3 * 0.42;
    expect(area).toBeCloseTo((30 - 2 * run) * (14 - 2 * run), 1);
    expect(countFlipped(main)).toBe(0);
  });

  it('mansarde : pas de recul du côté mitoyen (le pignon monte droit)', () => {
    const left = building(rect(0, 0, 12, 14), { height: 22, levels: 6, roof: 'mansard' });
    const right = building(rect(12, 0, 24, 14), { height: 22, levels: 6, roof: 'mansard' });
    const main = new MeshData(), rail = new MeshData();
    generateTileMeshes(tileOf([left, right]), opts('moyen'), main, rail);
    const run = 3.3 * 0.42;
    // chaque terrasson : recul sur trois côtés seulement
    expect(topArea(main, 22)).toBeCloseTo(2 * (12 - run) * (14 - 2 * run), 1);
  });

  it('emprise étroite : mansarde à demi-recul, puis repli sur un toit plat couvrant toute l\'emprise', () => {
    const main = new MeshData(), rail = new MeshData();
    // comble de 18 × 0,16 = 2,88 m → recul de 1,21 m : impossible sur 1,6 m de large, possible à moitié
    const narrow = building(rect(0, 0, 40, 1.6), { height: 18, roof: 'mansard' });
    generateTileMeshes(tileOf([narrow]), opts('haut'), main, rail);
    const half = (2.88 * 0.42) / 2;
    expect(topArea(main, 18)).toBeCloseTo((40 - 2 * half) * (1.6 - 2 * half), 1);
    expect(countFlipped(main)).toBe(0);
    // sur 1 m de large, même le demi-recul est impossible : le contour n'est pas décalé
    const blade = building(rect(0, 0, 40, 1.0), { height: 18, roof: 'mansard' });
    generateTileMeshes(tileOf([blade]), opts('haut'), main, rail);
    expect(topArea(main, 18)).toBeCloseTo(40, 2);
    expect(countFlipped(main)).toBe(0);
  });

  it('toit plat : couverture complète, avec ou sans acrotère', () => {
    const b = building(rect(0, 0, 20, 15), { height: 24, roof: 'flat', style: 'modern' });
    const main = new MeshData(), rail = new MeshData();
    generateTileMeshes(tileOf([b]), opts('bas'), main, rail);
    expect(topArea(main, 24)).toBeCloseTo(300, 3);
    generateTileMeshes(tileOf([b]), opts('haut'), main, rail);
    // toit-terrasse en contrebas (0,5 m), en retrait de l'épaisseur de l'acrotère (0,3 m)
    expect(topArea(main, 23.5)).toBeCloseTo(19.4 * 14.4, 2);
    // dessus de l'acrotère : la couronne entre les deux contours
    expect(topArea(main, 24)).toBeCloseTo(300 - 19.4 * 14.4, 2);
    expect(countFlipped(main)).toBe(0);
  });

  it('deux pans : faîtage dans l\'axe long, à la hauteur totale ; projection au sol = emprise', () => {
    const b = building(rect(0, 0, 24, 10), { height: 12, roof: 'gabled', style: 'faubourg' });
    const main = new MeshData(), rail = new MeshData();
    generateTileMeshes(tileOf([b]), opts('moyen'), main, rail);
    const { maxY } = checkMesh(main);
    expect(maxY).toBeCloseTo(12, 3);
    // sommets au faîtage : tous sur la médiane z = 5
    let ridge = 0;
    for (let i = 0; i < main.nv; i++) {
      if (Math.abs(main.pos[3 * i + 1] - 12) < 1e-3) { ridge++; expect(main.pos[3 * i + 2]).toBeCloseTo(5, 3); }
    }
    expect(ridge).toBeGreaterThanOrEqual(2);
    // aire projetée des versants (triangles dont la normale monte) = emprise
    let projected = 0;
    for (let t = 0; t < main.ni; t += 3) {
      const a = main.idx[t], bb = main.idx[t + 1], c = main.idx[t + 2];
      if (main.nor[3 * a + 1] < 60 || main.nor[3 * a + 1] > 126) continue;         // ni mur ni dessus plat
      const ux = main.pos[3 * bb] - main.pos[3 * a], uz = main.pos[3 * bb + 2] - main.pos[3 * a + 2];
      const vx = main.pos[3 * c] - main.pos[3 * a], vz = main.pos[3 * c + 2] - main.pos[3 * a + 2];
      projected += (uz * vx - ux * vz) / 2;
    }
    expect(projected).toBeCloseTo(240, 2);
    expect(countFlipped(main)).toBe(0);
  });

  it('dôme : calotte au-dessus de la dalle, repli si l\'emprise ne s\'y prête pas', () => {
    const octagon: number[] = [];
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; octagon.push(20 + Math.cos(a) * 5, 20 - Math.sin(a) * 5); }
    const kiosk = building(octagon, { height: 6.5, roof: 'dome', style: 'monumental', kind: 'kiosk', levels: 1 });
    const main = new MeshData(), rail = new MeshData();
    generateTileMeshes(tileOf([kiosk]), opts('haut'), main, rail);
    expect(checkMesh(main).maxY).toBeCloseTo(6.5, 3);
    expect(countFlipped(main)).toBe(0);
    // un « U » dont le centre de gravité tombe dans le creux : pas de dôme possible, mais un toit quand même
    const u = building([0, 30, 30, 30, 30, 0, 24, 0, 24, 24, 6, 24, 6, 0, 0, 0], { height: 14, roof: 'dome' });
    generateTileMeshes(tileOf([u]), opts('haut'), main, rail);
    expect(checkMesh(main).maxY).toBeCloseTo(14, 3);
    expect(topArea(main, 14)).toBeGreaterThan(50);
    expect(countFlipped(main)).toBe(0);
  });

  it('cour intérieure : le toit ne la recouvre pas', () => {
    const b = building(rect(0, 0, 40, 40), { height: 20, roof: 'flat', holes: [new Float32Array([10, 10, 30, 10, 30, 30, 10, 30])] });
    const main = new MeshData(), rail = new MeshData();
    generateTileMeshes(tileOf([b]), opts('bas'), main, rail);
    expect(topArea(main, 20)).toBeCloseTo(1600 - 400, 2);
    // … et la cour a ses propres façades : des murs dont la normale regarde vers l'intérieur de la cour
    let courtyardWalls = 0;
    for (let t = 0; t < main.ni; t += 3) {
      const i = main.idx[t];
      const x = main.pos[3 * i], z = main.pos[3 * i + 2];
      if (x > 9.9 && x < 30.1 && z > 9.9 && z < 30.1 && main.nor[3 * i + 1] === 0) courtyardWalls++;
    }
    expect(courtyardWalls).toBeGreaterThanOrEqual(8);
  });
});

describe('façades', () => {
  it('u couvre un nombre entier de travées et v un nombre entier de niveaux sur chaque bande', () => {
    const b = building(rect(0, 0, 20, 14.4), { height: 22, levels: 6, roof: 'mansard' });
    const main = new MeshData(), rail = new MeshData();
    generateTileMeshes(tileOf([b]), opts('bas'), main, rail);
    let bands = 0;
    for (let t = 0; t < main.ni; t += 6) {
      const i = main.idx[t];
      const nb = main.fac[4 * i + 1];
      if (nb === 255 || main.nor[3 * i + 1] !== 0) continue;             // matériau continu ou face non verticale
      // quadrilatère : sommets i (bas gauche), i+1 (bas droit), i+2 (haut droit), i+3 (haut gauche)
      const u0 = main.uv[2 * i], u1 = main.uv[2 * (i + 1)], v0 = main.uv[2 * i + 1], v1 = main.uv[2 * (i + 3) + 1];
      // trumeaux symétriques : u0 = -m/w, u1 = n + m/w
      expect(u0).toBeLessThanOrEqual(0);
      expect(u1 + u0).toBeCloseTo(nb, 4);
      expect(v1).toBeCloseTo(Math.round(v1), 5);                         // le haut de la bande tombe sur une limite de niveau
      if (v0 >= 0) expect(v0).toBeCloseTo(Math.round(v0), 5);            // (le bas du rez-de-chaussée descend sous le sol)
      bands++;
    }
    expect(bands).toBeGreaterThanOrEqual(4 * 4);
  });

  it('une seule porte par immeuble, sur le plus long mur libre', () => {
    const b = building(rect(0, 0, 30, 12), { height: 20, levels: 6, roof: 'mansard' });
    const main = new MeshData(), rail = new MeshData();
    generateTileMeshes(tileOf([b]), opts('bas'), main, rail);
    const doorQuads = new Set<number>();
    for (let i = 0; i < main.nv; i++) if (main.fac[4 * i + 3] !== 255) doorQuads.add(i >> 2);
    expect(doorQuads.size).toBe(1);
  });

  it('balcons en volume seulement à partir de la qualité moyenne, et seulement sur l\'haussmannien', () => {
    const h = building(rect(0, 0, 20, 12), { height: 22, levels: 6, roof: 'mansard', style: 'haussmann' });
    const f = building(rect(40, 0, 60, 12), { height: 15, levels: 4, roof: 'gabled', style: 'faubourg' });
    const main = new MeshData(), rail = new MeshData();
    generateTileMeshes(tileOf([h]), opts('bas'), main, rail);
    expect(rail.triangles).toBe(0);
    generateTileMeshes(tileOf([h]), opts('moyen'), main, rail);
    expect(rail.triangles).toBeGreaterThanOrEqual(2 * 4 * 2);           // deux balcons filants sur quatre façades
    generateTileMeshes(tileOf([f]), opts('haut'), main, rail);
    expect(rail.triangles).toBe(0);
  });
});

describe('façades courbes : la trame enjambe les petits pans', () => {
  // Îlot à angle arrondi : deux murs droits de 20 m raccordés par un quart de cercle de 6 m de rayon
  // numérisé en 9 segments d'environ 1 m (chacun trop court pour porter une fenêtre à lui seul).
  const ring: number[] = [0, 0, 26, 0];                      // mur sud, vers l'est ; le bâti est au nord (z < 0)
  ring.push(26, -20);                                        // mur est (coin franc avec le mur sud)
  for (let q = 1; q <= 9; q++) {                             // quart de cercle : du mur est vers le mur nord
    const a = (q / 9) * (Math.PI / 2);
    ring.push(20 + Math.cos(a) * 6, -20 - Math.sin(a) * 6);
  }
  ring.push(0, -26);                                         // mur nord, vers l'ouest
  const b = building(ring, { height: 22, levels: 6, roof: 'mansard' });

  it('les pans de la rotonde partagent une seule trame continue', () => {
    const p = prepareTile(tileOf([b]), flat, never, 1);
    const es = new EdgeSet();
    es.compute(p, p.firstRing[0], STYLE_PARAMS.haussmann);
    const n = es.count;
    // mur est (côté 1), arc (côtés 2 à 10) et mur nord (côté 11) : pas de coin franc entre eux
    const run = es.run[1];
    let total = 0;
    for (let i = 1; i <= 11; i++) { expect(es.run[i]).toBe(run); total += es.len[i]; }
    expect(es.run[0]).not.toBe(run);                         // coin franc sud-est
    expect(es.run[n - 1]).not.toBe(run);                     // coin franc nord-ouest
    const bay = layoutBays(total, STYLE_PARAMS.haussmann, { n: 0, width: 0, margin: 0 });
    expect(bay.n).toBeGreaterThanOrEqual(15);
    for (let i = 1; i <= 11; i++) {
      expect(es.n[i]).toBe(bay.n);
      if (i < 11) expect(es.u1[i]).toBeCloseTo(es.u0[i + 1], 5);     // u continu d'un pan au suivant
    }
    expect(es.u0[1]).toBeCloseTo(-bay.margin / bay.width, 5);
    expect(es.u1[11]).toBeCloseTo(bay.n + bay.margin / bay.width, 5);
    // chaque pan de l'arc est trop court pour une travée, et pourtant il porte des fenêtres
    for (let i = 2; i <= 10; i++) { expect(es.len[i]).toBeLessThan(1.2); expect(es.n[i]).toBeGreaterThan(0); }
  });

  it('balcons filants et lucarnes suivent la courbe', () => {
    const main = new MeshData(), rail = new MeshData();
    generateTileMeshes(tileOf([b]), opts('haut'), main, rail);
    checkMesh(main);
    expect(countFlipped(main)).toBe(0);
    // des garde-corps sur les 9 pans de l'arc, aux deux étages à balcon
    let onArc = 0;
    for (let t = 0; t < rail.ni; t += 6) {
      const i = rail.idx[t];
      const x = rail.pos[3 * i], z = rail.pos[3 * i + 2];
      if (x > 20.5 && z < -20.5 && Math.hypot(x - 20, z + 20) > 6) onArc++;
    }
    expect(onArc).toBeGreaterThanOrEqual(2 * 7);
  });

  it('un anneau entièrement lisse (rotonde isolée) reçoit une trame', () => {
    const circle: number[] = [];
    for (let i = 0; i < 40; i++) { const a = (i / 40) * Math.PI * 2; circle.push(50 + Math.cos(a) * 9, 50 - Math.sin(a) * 9); }
    const p = prepareTile(tileOf([building(circle, { height: 18, roof: 'dome', style: 'monumental' })]), flat, never, 1);
    const es = new EdgeSet();
    es.compute(p, p.firstRing[0], STYLE_PARAMS.monumental);
    expect(es.runs).toBe(1);
    expect(es.n[0]).toBeGreaterThanOrEqual(13);
    for (let i = 0; i < es.count; i++) expect(es.n[i]).toBe(es.n[0]);
  });
});

describe('robustesse : aucun polygone ne fait planter la génération', () => {
  const nasty: Building[] = [
    building([0, 0, 10, 10, 10, 0, 0, 10], { height: 15, roof: 'mansard' }),                          // nœud papillon
    building([20, 0, 20, 0, 20, 0], { height: 10 }),                                                  // un seul point
    building([30, 0, 40, 0, 50, 0], { height: 10 }),                                                  // aligné
    building([60, 0, 60.01, 0, 60.01, 0.01], { height: 10 }),                                         // minuscule
    building([70, 0, 80, 0], { height: 10 }),                                                         // deux sommets
    building([], { height: 10 }),                                                                     // vide
    building(rect(90, 0, 100, 10), { height: NaN }),
    building(rect(110, 0, 120, 10), { height: 0 }),
    building(rect(130, 0, 140, 10), { height: -5 }),
    building(rect(150, 0, 160, 10), { height: 0.6, roof: 'mansard' }),                                // plus bas qu'un homme
    building(rect(170, 0, 180, 10), { height: 20, roof: 'dome', levels: 99 }),
    building(rect(190, 0, 200, 10), { height: 20, holes: [new Float32Array([300, 300, 310, 300, 310, 310])] }),   // cour hors de l'emprise
    building(rect(210, 0, 220, 10), { height: 20, roof: 'mansard', holes: [new Float32Array([205, -5, 225, -5, 225, 15, 205, 15])] }),   // cour plus grande que l'emprise
    building(rect(230, 0, 240, 10), { height: 20, roof: 'mansard', holes: [new Float32Array([231, 1, 231, 9, 239, 9, 239, 1])] }),       // cour qui ne laisse qu'un mètre de bâti
    building(rect(250, 0, 260, 10), { height: 20, roof: 'gabled', holes: [new Float32Array([255, 5, 255, 5, 255, 5])] }),               // cour dégénérée
    building([270, 0, 280, 0, 280, 10, 275, 10, 275, 10, 270, 10, 270, 0], { height: 12, roof: 'gabled' }),      // sommets répétés
    building(rect(290, 0, 300, 10), { height: 20, roof: 'mansard', kind: 'roof' }),                   // auvent
    building(rect(310, 0, 320, 10), { height: 20, roof: 'mansard', kind: 'construction' }),
    building(rect(330, 0, 330.4, 30), { height: 25, roof: 'mansard' }),                               // mur de 40 cm
    building([350, 0, 351, 0, 380, 30, 379, 30], { height: 25, roof: 'gabled' }),                     // lame oblique
  ];
  // étoile à 600 pointes, avec un toit de chaque forme
  for (const roof of ['mansard', 'gabled', 'dome', 'flat'] as const) {
    const starRing: number[] = [];
    for (let i = 0; i < 600; i++) {
      const a = (i / 600) * Math.PI * 2, r = i % 2 === 0 ? 30 : 22;
      starRing.push(450 + Math.cos(a) * r, 100 + nasty.length * 5 - Math.sin(a) * r);
    }
    nasty.push(building(starRing, { height: 30, roof }));
  }

  it.each(['bas', 'moyen', 'haut'] as const)('qualité %s', (quality) => {
    const main = new MeshData(), rail = new MeshData();
    const tile = tileOf(nasty);
    expect(() => generateTileMeshes(tile, opts(quality), main, rail)).not.toThrow();
    checkMesh(main);
    checkMesh(rail);
    expect(main.triangles).toBeGreaterThan(100);
    expect(countFlipped(main)).toBe(0);
  });

  it('version lointaine', () => {
    const far = new MeshData();
    expect(() => generateTileFarMesh(tileOf(nasty), opts('haut'), far)).not.toThrow();
    checkMesh(far);
  });

  it('relief pathologique : NaN ou infini → altitude de la carte, puis 0', () => {
    const main = new MeshData(), rail = new MeshData();
    const b = building(rect(0, 0, 10, 10), { height: 12, baseY: 7 });
    generateTileMeshes(tileOf([b]), { ...opts('bas'), heightAt: () => NaN }, main, rail);
    const box = checkMesh(main);
    expect(box.maxY).toBeCloseTo(19, 3);
    generateTileMeshes(tileOf([{ ...b, baseY: NaN }]), { ...opts('bas'), heightAt: () => -Infinity }, main, rail);
    expect(checkMesh(main).maxY).toBeCloseTo(12, 3);
  });

  it('tuile vide', () => {
    const main = new MeshData(), rail = new MeshData();
    expect(generateTileMeshes(tileOf([]), opts('haut'), main, rail).triangles).toBe(0);
    expect(generateTileFarMesh(tileOf([]), opts('haut'), main).triangles).toBe(0);
  });

  it('budget : une tuile trop lourde est allégée par paliers plutôt que de dépasser', () => {
    const many: Building[] = [];
    for (let j = 0; j < 30; j++) for (let i = 0; i < 30; i++) {
      many.push(building(rect(i * 17, j * 17, i * 17 + 14, j * 17 + 12), { height: 22, levels: 6, roof: 'mansard' }));
    }
    const main = new MeshData(), rail = new MeshData();
    const full = generateTileMeshes(tileOf(many), opts('haut'), main, rail, 10_000_000);
    const capped = generateTileMeshes(tileOf(many), opts('haut'), main, rail, Math.round(full.triangles * 0.6));
    expect(capped.step).toBeGreaterThan(full.step);
    expect(capped.triangles).toBeLessThan(full.triangles);
    // version lointaine : simplification croissante jusqu'à tenir dans le budget
    const far = new MeshData();
    const farFull = generateTileFarMesh(tileOf(many), opts('haut'), far, 10_000_000);
    const farCapped = generateTileFarMesh(tileOf(many), opts('haut'), far, Math.round(farFull.triangles * 0.5));
    expect(farCapped.triangles).toBeLessThanOrEqual(farFull.triangles);
  });
});
