// Kit de modélisation : géométrie plane, primitives (orientation des faces), fusion par matériau,
// palais sur emprise réelle, statuaire, illumination nocturne.
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  Builder, Geo, PALACE_STYLES, addPalace, archBlock, arcade, box, buildPalaceFromFootprint, clearance, column, cyl, facadeLayout, figureGeo,
  horseGeo, lathe, lionGeo, mat, pose, prism, setNightLevel, sphere, statsOf, sweep, triangulate, corniceProfile, loft, disposeObject, dome,
  balustrade, pediment, pedestal, quadriga, sculptedGroup, steppedBase, getNightLevel,
} from '@/world/monuments/kit';
import { cleanRing, ensureCCW, insetRing, isSimpleRing, ngonRing, pointInRing, rectRing, ringBounds, ringPerimeter, signedArea } from '@/world/monuments/shape2d';

function bounds(g: Geo): THREE.Box3 {
  const b = new THREE.Box3();
  for (let i = 0; i < g.pos.length; i += 3) b.expandByPoint(new THREE.Vector3(g.pos[i], g.pos[i + 1], g.pos[i + 2]));
  return b;
}
function finite(g: Geo): boolean {
  return g.pos.every(Number.isFinite) && g.nor.every(Number.isFinite) && g.uv.every(Number.isFinite) && g.idx.every((i) => i >= 0 && i < g.vertexCount);
}
/** Vérifie que chaque triangle est orienté comme les normales de ses sommets (faces visibles de l'extérieur). */
function windingMatchesNormals(g: Geo): number {
  let bad = 0;
  for (let t = 0; t < g.idx.length; t += 3) {
    const [a, b, c] = [g.idx[t], g.idx[t + 1], g.idx[t + 2]];
    const p = (i: number) => new THREE.Vector3(g.pos[3 * i], g.pos[3 * i + 1], g.pos[3 * i + 2]);
    const n = new THREE.Vector3().crossVectors(p(b).sub(p(a)), p(c).sub(p(a)));
    if (n.lengthSq() < 1e-12) continue;
    const vn = new THREE.Vector3(g.nor[3 * a] + g.nor[3 * b] + g.nor[3 * c], g.nor[3 * a + 1] + g.nor[3 * b + 1] + g.nor[3 * c + 1], g.nor[3 * a + 2] + g.nor[3 * b + 2] + g.nor[3 * c + 2]);
    if (n.dot(vn) <= 0) bad++;
  }
  return bad;
}
/** Volume signé (théorème de la divergence) : positif si les faces regardent vers l'extérieur d'un solide fermé. */
function signedVolume(g: Geo): number {
  let v = 0;
  for (let t = 0; t < g.idx.length; t += 3) {
    const [a, b, c] = [g.idx[t], g.idx[t + 1], g.idx[t + 2]];
    const ax = g.pos[3 * a], ay = g.pos[3 * a + 1], az = g.pos[3 * a + 2];
    const bx = g.pos[3 * b], by = g.pos[3 * b + 1], bz = g.pos[3 * b + 2];
    const cx = g.pos[3 * c], cy = g.pos[3 * c + 1], cz = g.pos[3 * c + 2];
    v += (ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx)) / 6;
  }
  return v;
}

describe('géométrie plane', () => {
  it('convention : antihoraire vu de dessus ⇔ aire signée positive (x = est, z = sud)', () => {
    // nord-ouest → sud-ouest → sud-est → nord-est : antihoraire sur une carte nord en haut
    expect(signedArea([-1, -1, -1, 1, 1, 1, 1, -1])).toBeCloseTo(4, 9);
    expect(signedArea([-1, -1, 1, -1, 1, 1, -1, 1])).toBeCloseTo(-4, 9);
    expect(signedArea(rectRing(3, -2, 10, 4))).toBeCloseTo(40, 9);
    expect(signedArea(rectRing(3, -2, 10, 4, 0.7))).toBeCloseTo(40, 9);
    expect(signedArea(ngonRing(0, 0, 5, 24))).toBeGreaterThan(Math.PI * 25 * 0.98);
    expect(signedArea(ensureCCW([-1, -1, 1, -1, 1, 1, -1, 1]))).toBeCloseTo(4, 9);
  });

  it('anneaux : bornes, périmètre, simplicité, nettoyage, décalage', () => {
    const r = rectRing(0, 0, 20, 10);
    const b = ringBounds(r);
    expect([b.w, b.d, b.cx, b.cz]).toEqual([20, 10, 0, 0]);
    expect(ringPerimeter(r)).toBeCloseTo(60, 9);
    expect(isSimpleRing(r)).toBe(true);
    expect(isSimpleRing([0, 0, 10, 10, 10, 0, 0, 10])).toBe(false);       // papillon
    expect(isSimpleRing([0, 0, 1, 1])).toBe(false);
    expect(pointInRing(9, 4, r) && !pointInRing(11, 0, r)).toBe(true);
    // sommets doublés et alignés supprimés
    expect(cleanRing([0, 0, 0, 0, 0, 5, 0, 10, 10, 10, 10, 0, 0, 0]).length).toBe(8);
    const out = insetRing(r, 1), inn = insetRing(r, -1);
    expect(signedArea(out)).toBeCloseTo(22 * 12, 6);
    expect(signedArea(inn)).toBeCloseTo(18 * 8, 6);
  });

  it('triangulation : couvre toute l\'aire, trous compris, triangles antihoraires', () => {
    const l = [0, 0, 0, 10, 10, 10, 10, 6, 4, 6, 4, 0];                    // L, antihoraire
    expect(signedArea(l)).toBeGreaterThan(0);
    const t = triangulate(l);
    let area = 0;
    for (let i = 0; i < t.length; i += 3) {
      const a = signedArea([l[2 * t[i]], l[2 * t[i] + 1], l[2 * t[i + 1]], l[2 * t[i + 1] + 1], l[2 * t[i + 2]], l[2 * t[i + 2] + 1]]);
      expect(a).toBeGreaterThan(0);
      area += a;
    }
    expect(area).toBeCloseTo(signedArea(l), 6);
    const hole = rectRing(5, 5, 2, 2).reverse();
    const t2 = triangulate(rectRing(5, 5, 10, 10), [hole]);
    expect(t2.length / 3).toBeGreaterThanOrEqual(8);
  });
});

describe('primitives', () => {
  it('boîte, cylindre, sphère, révolution : faces tournées vers l\'extérieur, UV en mètres', () => {
    const b = box(4, 3, 2, { bottom: true });
    expect(b.triangleCount).toBe(12);
    expect(windingMatchesNormals(b)).toBe(0);
    expect(signedVolume(b)).toBeCloseTo(24, 6);
    expect(Math.max(...b.uv)).toBeCloseTo(4, 6);
    const c = cyl(1, 1, 5, 24, { bottom: true });
    expect(windingMatchesNormals(c)).toBe(0);
    expect(signedVolume(c)).toBeGreaterThan(Math.PI * 5 * 0.97);
    expect(signedVolume(c)).toBeLessThan(Math.PI * 5);
    const s = sphere(2, 16, 10);
    expect(windingMatchesNormals(s)).toBe(0);
    expect(signedVolume(s)).toBeGreaterThan((4 / 3) * Math.PI * 8 * 0.9);
    const l = lathe([2, 0, 2, 1, 1, 2, 0, 3], 16);
    expect(windingMatchesNormals(l)).toBe(0);
    expect(finite(l)).toBe(true);
    const cone = cyl(1, 0, 2, 8);
    expect(cone.triangleCount).toBe(8);
    expect(windingMatchesNormals(cone)).toBe(0);
  });

  it('prisme sur emprise : volume = aire × hauteur, quel que soit le polygone', () => {
    const l = [0, 0, 0, 10, 10, 10, 10, 6, 4, 6, 4, 0];
    const p = prism(l, 2, 7, { bottom: true });
    expect(windingMatchesNormals(p)).toBe(0);
    expect(signedVolume(p)).toBeCloseTo(signedArea(l) * 5, 5);
    const withHole = prism(rectRing(0, 0, 10, 10), 0, 3, { bottom: true }, [rectRing(0, 0, 4, 4).reduce<number[]>((acc, _v, i, arr) => (i % 2 === 0 ? [arr[i], arr[i + 1], ...acc] : acc), [])]);
    expect(signedVolume(withHole)).toBeCloseTo((100 - 16) * 3, 4);
  });

  it('extrusion d\'un profil le long d\'une emprise : onglets, saillie vers l\'extérieur', () => {
    const ring = rectRing(0, 0, 20, 10);
    const g = sweep(corniceProfile(5, 1, 0.8), ring, { closed: true });
    expect(finite(g)).toBe(true);
    expect(windingMatchesNormals(g)).toBe(0);
    const bb = bounds(g);
    expect(bb.max.x).toBeCloseTo(10.8, 6);                                   // onglet : la saillie est exacte sur chaque face
    expect(bb.min.z).toBeCloseTo(-5.8, 6);
    expect(bb.min.y).toBeCloseTo(5, 6);
    expect(bb.max.y).toBeCloseTo(6, 6);
    const cw: number[] = [];
    for (let i = ring.length - 2; i >= 0; i -= 2) cw.push(ring[i], ring[i + 1]);
    // anneau horaire (pourtour d'une cour) : la saillie se fait vers l'intérieur de l'anneau, c'est-à-dire vers la cour
    const inner = sweep(corniceProfile(5, 1, 0.8), cw, { closed: true });
    expect(bounds(inner).max.x).toBeCloseTo(10, 6);
    let reach = Infinity;
    for (let i = 0; i < inner.pos.length; i += 3) if (inner.pos[i] > 5) reach = Math.min(reach, inner.pos[i]);
    expect(reach).toBeCloseTo(9.2, 6);
    expect(windingMatchesNormals(inner)).toBe(0);
    // polyligne ouverte fermée aux extrémités
    const open = sweep([0, 0, 0.5, 0, 0.5, 1, 0, 1], [0, 0, 10, 0], { capEnds: true });
    expect(windingMatchesNormals(open)).toBe(0);
    expect(open.triangleCount).toBeGreaterThan(6);
  });

  it('mur percé d\'arcs : le parement a l\'aire attendue, la voûte regarde vers la baie', () => {
    const b = new Builder();
    archBlock(b, { width: 20, height: 12, depth: 4, openings: [{ x: 0, width: 6, height: 9 }], mat: 'pierre_blonde', matVault: 'caissons', coffers: { around: 8, across: 4 } });
    const group = b.build('arche');
    const wall = group.children.find((c) => c.name.endsWith('pierre_blonde')) as THREE.Mesh;
    const vault = group.children.find((c) => c.name.endsWith('caissons')) as THREE.Mesh;
    expect(wall && vault).toBeTruthy();
    // aire du parement avant (z = +2) : rectangle − baie (rectangle 6 × 6 + demi-disque de rayon 3)
    const p = wall.geometry.getAttribute('position'), idx = wall.geometry.getIndex()!;
    let area = 0;
    for (let i = 0; i < idx.count; i += 3) {
      const [a, bb, c] = [idx.getX(i), idx.getX(i + 1), idx.getX(i + 2)];
      if (Math.abs(p.getZ(a) - 2) > 1e-6 || Math.abs(p.getZ(bb) - 2) > 1e-6 || Math.abs(p.getZ(c) - 2) > 1e-6) continue;
      const cr = (p.getX(bb) - p.getX(a)) * (p.getY(c) - p.getY(a)) - (p.getY(bb) - p.getY(a)) * (p.getX(c) - p.getX(a));
      expect(cr).toBeGreaterThan(-1e-9);                                     // antihoraire vu de face
      area += cr / 2;
    }
    const expected = 20 * 12 - (6 * 6 + (Math.PI * 9) / 2);
    expect(Math.abs(area - expected) / expected).toBeLessThan(0.01);
    // normales de la voûte : dirigées vers l'axe de la baie (vers le bas au sommet)
    const vn = vault.geometry.getAttribute('normal'), vp = vault.geometry.getAttribute('position');
    for (let i = 0; i < vp.count; i++) expect(vn.getX(i) * -vp.getX(i) + vn.getY(i) * (6 - vp.getY(i))).toBeGreaterThan(-1e-6);
    // UV de la voûte calées sur des caissons entiers
    const uv = vault.geometry.getAttribute('uv');
    let maxU = 0, maxV = 0;
    for (let i = 0; i < uv.count; i++) { maxU = Math.max(maxU, uv.getX(i)); maxV = Math.max(maxV, uv.getY(i)); }
    expect(maxU).toBeCloseTo(4, 5);
    expect(maxV).toBeCloseTo(8, 5);
    disposeObject(group);
  });

  it('colonnes des trois ordres : hauteur exacte, base sur le sol', () => {
    for (const order of ['dorique', 'ionique', 'corinthien'] as const) {
      const b = new Builder();
      column(b, { order, height: 9, diameter: 0.9, mat: 'pierre_lisse' });
      const g = b.build();
      const box3 = new THREE.Box3().setFromObject(g);
      expect(box3.min.y).toBeCloseTo(0, 5);
      expect(box3.max.y).toBeCloseTo(9, 3);
      expect(statsOf(g).triangles).toBeLessThan(900);
      expect(statsOf(g).drawCalls).toBe(1);
    }
  });
});

describe('assembleur', () => {
  it('fusionne par matériau : un maillage (un appel de dessin) par matériau', () => {
    const b = new Builder();
    for (let i = 0; i < 20; i++) b.add('pierre_blonde', box(1, 1, 1).translate(i * 2, 0, 0));
    for (let i = 0; i < 5; i++) b.add('bronze', cyl(0.5, 0.5, 2, 8).translate(i * 2, 1, 0));
    expect(b.triangles).toBe(20 * 10 + 5 * (16 + 8));
    const g = b.build('essai');
    expect(g.children.length).toBe(2);
    expect(statsOf(g)).toMatchObject({ drawCalls: 2, triangles: 20 * 10 + 5 * 24 });
    expect((g.children[0] as THREE.Mesh).material).toBe(mat('pierre_blonde'));
    disposeObject(g);
  });

  it('pile de transformations : les poses se composent et se dépilent', () => {
    const b = new Builder();
    b.with(pose(10, 0, 0, Math.PI / 2), () => {
      b.with(pose(0, 5, 3), () => b.add('pierre_blonde', box(1, 1, 1)));
    });
    b.add('pierre_blonde', box(1, 1, 1));
    const g = b.build();
    const box3 = new THREE.Box3().setFromObject(g);
    // la boîte posée en (0, 5, 3) puis tournée de 90° (z → x) et décalée de 10 en x se retrouve vers (13, 5, 0)
    expect(box3.max.x).toBeCloseTo(13.5, 5);
    expect(box3.max.y).toBeCloseTo(6, 5);
    expect(box3.min.x).toBeCloseTo(-0.5, 5);
  });

  it('une transformation en miroir conserve des faces correctement orientées', () => {
    const g = new Geo().append(box(2, 2, 2, { bottom: true }), new THREE.Matrix4().makeScale(-1, 1, 1).setPosition(5, 0, 0));
    expect(windingMatchesNormals(g)).toBe(0);
    expect(signedVolume(g)).toBeCloseTo(8, 6);
  });
});

describe('palais sur emprise réelle', () => {
  const U = [-60, -40, -60, 40, -38, 40, -38, -16, 38, -16, 38, 40, 60, 40, 60, -40];

  it('habille une emprise en U : murs, toit, pavillons, budget minuscule', () => {
    const g = buildPalaceFromFootprint(U, PALACE_STYLES.renaissance);
    const st = statsOf(g);
    const res = g.userData.palace as { wallTop: number; roofTop: number; bays: number };
    expect(res.wallTop).toBeCloseTo(7.5 + 7 + 5, 6);
    expect(res.roofTop).toBeGreaterThan(res.wallTop + 5);
    expect(res.bays).toBeGreaterThan(80);
    expect(st.triangles).toBeGreaterThan(300);
    expect(st.triangles).toBeLessThan(6000);
    expect(st.drawCalls).toBeLessThanOrEqual(8);
    const box3 = new THREE.Box3().setFromObject(g);
    expect(box3.min.x).toBeGreaterThan(-63);
    expect(box3.max.x).toBeLessThan(63);
    expect(box3.min.y).toBeGreaterThanOrEqual(-1e-6);
  });

  it('accepte une emprise horaire, une cour intérieure, une emprise biaise et les quatre styles', () => {
    const cw: number[] = [];
    for (let i = U.length - 2; i >= 0; i -= 2) cw.push(U[i], U[i + 1]);
    const a = statsOf(buildPalaceFromFootprint(cw, PALACE_STYLES.renaissance)).triangles;
    const b0 = statsOf(buildPalaceFromFootprint(U, PALACE_STYLES.renaissance)).triangles;
    expect(a).toBe(b0);
    const skew = [-40, -18, -46, 6, -30, 30, 8, 34, 44, 20, 50, -8, 30, -30, -10, -32];
    for (const style of Object.values(PALACE_STYLES)) {
      const g = buildPalaceFromFootprint(skew, style);
      g.traverse((c) => {
        const m = c as THREE.Mesh;
        if (!m.geometry) return;
        const p = m.geometry.getAttribute('position');
        for (let i = 0; i < p.count; i++) expect(Number.isFinite(p.getX(i) + p.getY(i) + p.getZ(i))).toBe(true);
      });
      expect(statsOf(g).triangles).toBeGreaterThan(100);
      expect(statsOf(g).drawCalls).toBeLessThanOrEqual(8);
    }
    const bld = new Builder();
    const res = addPalace(bld, rectRing(0, 0, 90, 70), PALACE_STYLES.classique, { holes: [rectRing(0, 0, 50, 32)] });
    expect(res.bays).toBeGreaterThan(100);
    expect(bld.build().children.length).toBeGreaterThan(2);
  });

  it('emprise dégénérée : ne plante pas, ne produit rien', () => {
    expect(statsOf(buildPalaceFromFootprint([], PALACE_STYLES.sobre)).triangles).toBe(0);
    expect(statsOf(buildPalaceFromFootprint([0, 0, 5, 0], PALACE_STYLES.sobre)).triangles).toBe(0);
  });

  it('un corps de logis étroit reçoit un toit borné par sa largeur', () => {
    expect(clearance([rectRing(0, 0, 60, 10)])).toBeCloseTo(10, 6);
    const g = buildPalaceFromFootprint(rectRing(0, 0, 60, 5), PALACE_STYLES.classique);
    const res = g.userData.palace as { wallTop: number; roofTop: number };
    expect(res.roofTop).toBeGreaterThanOrEqual(res.wallTop);
    expect(res.roofTop).toBeLessThan(res.wallTop + 7);
  });

  it('mise en page de la façade : niveaux croissants de 0 à 1', () => {
    for (const style of Object.values(PALACE_STYLES)) {
      const L = facadeLayout(style);
      expect(L.floorV[0]).toBe(0);
      for (let i = 1; i < L.floorV.length; i++) expect(L.floorV[i]).toBeGreaterThan(L.floorV[i - 1]);
      expect(L.floorV[L.floorV.length - 1]).toBeLessThanOrEqual(1);
      expect(L.total).toBeCloseTo(L.wallH + L.roofBand, 9);
    }
  });
});

describe('pièces classiques et statuaire', () => {
  it('fronton, socle, emmarchement, balustrade, arcade, dôme, toit : géométrie valide dans les gabarits', () => {
    const b = new Builder();
    pediment(b, { width: 12, rise: 2.5, depth: 0.7, mat: 'pierre_lisse', matTympan: 'relief_pierre', baseCornice: true });
    expect(pedestal(b, { width: 3, depth: 3, height: 4, mat: 'pierre_lisse' })).toBe(4);
    expect(steppedBase(b, rectRing(0, 0, 5, 5), 3, 0.4, 0.2, 'granit_gris')).toBeCloseTo(0.6, 9);
    balustrade(b, [-5, 0, 5, 0, 5, 8], { y: 4, mat: 'pierre_lisse' });
    arcade(b, { length: 20, height: 8, depth: 2, count: 4, mat: 'bossage_blond' });
    const top = dome(b, { radius: 6, height: 8, mat: 'plomb', ribs: 12, matRibs: 'or', lantern: { radius: 1.2, height: 4, mat: 'pierre_lisse', finial: 'croix' } });
    expect(top).toBeGreaterThan(11);
    b.add('ardoise', loft(rectRing(0, 0, 20, 10), 10, rectRing(0, 0, 14, 4), 13));
    const g = b.build();
    g.traverse((c) => {
      const m = c as THREE.Mesh;
      if (!m.geometry) return;
      const p = m.geometry.getAttribute('position');
      for (let i = 0; i < p.count; i++) expect(Number.isFinite(p.getX(i) + p.getY(i) + p.getZ(i))).toBe(true);
    });
    expect(statsOf(g).triangles).toBeGreaterThan(500);
  });

  it('personnage : pieds au sol, taille respectée, attributs séparés', () => {
    const f = figureGeo({ height: 2, itemR: 'epee' });
    const bb = bounds(f.body);
    expect(bb.min.y).toBeGreaterThan(-0.02);
    expect(bb.min.y).toBeLessThan(0.05);
    expect(bb.max.y).toBeGreaterThan(1.9);
    expect(bb.max.y).toBeLessThan(2.1);
    expect(f.items.triangleCount).toBeGreaterThan(0);
    expect(finite(f.body) && finite(f.items)).toBe(true);
    // en fente : les pieds restent au sol
    const lunge = figureGeo({ height: 2, legL: { e: 0.6, a: 0, e2: 0 }, legR: { e: 0.5, a: Math.PI } });
    expect(bounds(lunge.body).min.y).toBeGreaterThan(-0.02);
    expect(bounds(lunge.body).min.y).toBeLessThan(0.06);
    // la basse définition est plus légère
    expect(figureGeo({ lod: 0 }).body.triangleCount).toBeLessThan(figureGeo({ lod: 1 }).body.triangleCount);
    expect(figureGeo({ lod: 1, robe: true, wings: 1 }).body.triangleCount).toBeLessThan(700);
  });

  it('cheval, lion, quadrige, groupe en haut-relief : posés au sol, dans leur gabarit', () => {
    const h = bounds(horseGeo({ scale: 1 }));
    expect(h.min.y).toBeCloseTo(0, 2);
    expect(h.max.y).toBeGreaterThan(1.9);
    expect(h.max.y).toBeLessThan(2.5);
    expect(bounds(lionGeo('debout', 2)).max.y).toBeGreaterThan(2.4);
    const b = new Builder();
    quadriga(b, 'bronze_vert', { scale: 1.5 }, 'or');
    expect(statsOf(b.build()).triangles).toBeLessThan(4000);
    const b2 = new Builder();
    sculptedGroup(b2, 'pierre_lisse', { width: 6, height: 11, depth: 2, seed: 4 });
    const g = b2.build();
    const bb = new THREE.Box3().setFromObject(g);
    expect(bb.min.z).toBeGreaterThanOrEqual(-1e-6);
    expect(bb.max.z).toBeLessThanOrEqual(2 * 1.2 + 1e-6);
    expect(bb.max.y).toBeLessThanOrEqual(11 + 1e-6);
    expect(Math.abs(bb.min.x)).toBeLessThanOrEqual(6 * 0.56 + 1e-6);
    // même graine, même groupe
    const b3 = new Builder();
    sculptedGroup(b3, 'pierre_lisse', { width: 6, height: 11, depth: 2, seed: 4 });
    expect(statsOf(b3.build()).triangles).toBe(statsOf(g).triangles);
  });
});

describe('illumination nocturne', () => {
  it('setNightLevel règle l\'émission des matériaux éclairés, pas celle des autres', () => {
    const stone = mat('pierre_blonde') as THREE.MeshStandardMaterial;
    const gold = mat('or') as THREE.MeshStandardMaterial;
    const dark = mat('ombre') as THREE.MeshStandardMaterial;
    setNightLevel(0);
    expect(stone.emissiveIntensity).toBe(0);
    const goldDay = gold.emissiveIntensity;
    expect(goldDay).toBeGreaterThan(0);                                    // la dorure accroche toujours la lumière
    setNightLevel(1);
    expect(getNightLevel()).toBe(1);
    expect(stone.emissiveIntensity).toBeGreaterThan(0.5);
    expect(gold.emissiveIntensity).toBeGreaterThan(goldDay);
    expect(dark.emissiveIntensity).toBeLessThanOrEqual(1);
    setNightLevel(0.5);
    expect(stone.emissiveIntensity).toBeGreaterThan(0.2);
    setNightLevel(7);
    expect(getNightLevel()).toBe(1);
    setNightLevel(0);
    expect(stone.emissiveIntensity).toBe(0);
    // un matériau partagé est le même objet d'un appel à l'autre
    expect(mat('pierre_blonde')).toBe(stone);
    expect(() => mat('matiere_inconnue')).toThrow(/inconnu/);
  });
});
