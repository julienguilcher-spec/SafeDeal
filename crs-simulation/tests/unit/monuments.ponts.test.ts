// Lot « ponts » : ponts (Alexandre III, Pont Neuf grand et petit bras), palais de Chaillot (deux ailes) et fontaine de
// Varsovie, portes Saint-Denis et Saint-Martin, alias de la fontaine des Mers ; et les ajouts au système : alias de
// carte, repères supplémentaires, site (relief relatif, niveau de l'eau), service « world.monuments », silhouettes
// d'horizon. Chaque définition se construit sur l'EMPRISE RÉELLE de la carte (public/data/paris/landmarks.json).
// Sous Node il n'y a pas de canvas : géométrie complète, matériaux sans texture.
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import rawLandmarks from '../../public/data/paris/landmarks.json';
import { decodeLandmarks, type Landmark, type RawLandmarks } from '@/world/mapdata';
import { createSystems } from '@/world/monuments';
import type { MonumentsApi, WorldMonumentsApi } from '@/world/monuments/api';
import { getMonument, listMonumentAliases, listMonuments } from '@/world/monuments/registry';
import { getColliders, getWorldColliders, listColliderKeys, siteOfLandmark } from '@/world/monuments/colliders';
import { canonicalKey, registerAlias } from '@/world/monuments/keys';
import { EXTRA_LANDMARKS, extraLandmarksIn, lonLatToXZ, mergeLandmarks } from '@/world/monuments/extra';
import { HORIZON } from '@/world/monuments/horizon';
import { hazesOf, statsOf } from '@/world/monuments/kit';
import { isSimpleRing, pointInRing, ringBounds, signedArea } from '@/world/monuments/shape2d';
import { PASS_UNDER_Y, type MonumentCollider, type MonumentSite } from '@/world/monuments/types';
import { PA3, PA3_PYLONS, PETIT_BRAS_ARCHES, PONT_NEUF, PONT_NEUF_ARCHES, PONT_NEUF_PETIT_BRAS, HENRI_IV, archLayout, bridgeFrame, deckPoint, deckY, type BridgeDesign } from '@/world/monuments/x-ponts-plan';
import { CHAILLOT, REF_PARIS, REF_PASSY, VARSOVIE, clipRing, wingParts, wingPlan, wingPoint } from '@/world/monuments/x-ponts-chaillot';
import { PSD } from '@/world/monuments/collide/porte_saint_denis';
import { PSM } from '@/world/monuments/collide/porte_saint_martin';
import type { GameContext, LandmarkInfo, QualityLevel } from '@/core/contracts';

const LANDMARKS = decodeLandmarks(rawLandmarks as unknown as RawLandmarks);
const EMPTY: MonumentSite = { footprint: [], height: 0 };
const PARIS = { minX: -2656.28, minZ: -1375.38, maxX: 3757.91, maxZ: 1738.61 };
/** Clés du lot présentes dans la carte, puis repères supplémentaires. */
const MAP_KEYS = ['pont_alexandre_iii', 'pont_neuf', 'pont_neuf_petit_bras', 'palais_chaillot', 'palais_chaillot_passy'];
const EXTRA_KEYS = ['fontaine_varsovie', 'porte_saint_denis', 'porte_saint_martin'];
const KEYS = [...MAP_KEYS, ...EXTRA_KEYS];
const BRIDGES: Record<string, BridgeDesign> = { pont_alexandre_iii: PA3, pont_neuf: PONT_NEUF, pont_neuf_petit_bras: PONT_NEUF_PETIT_BRAS };

function landmark(key: string): LandmarkInfo {
  const lm = (LANDMARKS as Landmark[]).find((l) => l.key === key) ?? EXTRA_LANDMARKS.find((l) => l.key === key);
  if (!lm) throw new Error(`repère absent : ${key}`);
  return lm as LandmarkInfo;
}
function boxOf(obj: THREE.Object3D): THREE.Box3 {
  obj.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(obj);
}
function freeAtGround(cols: MonumentCollider[], x: number, z: number, r = 0.35): boolean {
  for (const c of cols) {
    if (c.baseY > PASS_UNDER_Y) continue;
    if (pointInRing(x, z, c.ring)) return false;
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; if (pointInRing(x + Math.cos(a) * r, z + Math.sin(a) * r, c.ring)) return false; }
  }
  return true;
}
const overhead = (cols: MonumentCollider[], x: number, z: number): MonumentCollider[] => cols.filter((c) => c.baseY > PASS_UNDER_Y && pointInRing(x, z, c.ring));
function finite(obj: THREE.Object3D): void {
  obj.traverse((c) => {
    const m = c as THREE.Mesh;
    if (!m.geometry) return;
    const p = m.geometry.getAttribute('position');
    for (let i = 0; i < p.count; i++) if (!Number.isFinite(p.getX(i) + p.getY(i) + p.getZ(i))) throw new Error(`sommet invalide dans ${c.name}`);
    const n = m.geometry.getAttribute('normal');
    for (let i = 0; i < n.count; i += 53) expect(Number.isFinite(n.getX(i) + n.getY(i) + n.getZ(i))).toBe(true);
  });
}
/** Site réel complété d'un relief de synthèse : tablier en pente douce, eau 6 m plus bas. */
function withTerrain(site: MonumentSite, slope = 0.008, waterY = -6): MonumentSite {
  return { ...site, groundAt: (_x, z) => slope * z, waterY };
}

describe('lot ponts : repères et registre', () => {
  it('les repères du lot sont dans landmarks.json avec une emprise ; les repères supplémentaires n\'y sont pas', () => {
    for (const key of [...MAP_KEYS, 'fontaine_des_mers', 'fontaines_concorde']) {
      const lm = LANDMARKS.find((l) => l.key === key);
      expect(lm, key).toBeDefined();
      expect(lm!.footprint.length).toBeGreaterThanOrEqual(8);
    }
    for (const key of EXTRA_KEYS) expect(LANDMARKS.find((l) => l.key === key), key).toBeUndefined();
  });
  it('chaque monument a sa définition et son fichier d\'obstacles', () => {
    const cols = listColliderKeys();
    for (const key of KEYS) {
      const def = getMonument(key);
      expect(def, key).toBeDefined();
      expect(def!.key).toBe(key);
      expect(def!.name.length).toBeGreaterThan(5);
      expect(cols).toContain(key);
    }
  });
  it('alias de carte : la fontaine des Mers utilise la définition et les obstacles des fontaines de la Concorde', () => {
    const target = getMonument('fontaines_concorde')!;
    expect(getMonument('fontaine_des_mers')).toBe(target);
    expect(listMonumentAliases()).toContainEqual(['fontaine_des_mers', 'fontaines_concorde']);
    // un alias n'est pas une définition de plus
    expect(listMonuments().map((d) => d.key)).not.toContain('fontaine_des_mers');
    expect(listColliderKeys()).not.toContain('fontaine_des_mers');
    const site = siteOfLandmark(landmark('fontaine_des_mers'));
    expect(getColliders('fontaine_des_mers', site)).toEqual(getColliders('fontaines_concorde', site));
    expect(getColliders('fontaine_des_mers', site).length).toBe(2);
    const obj = target.build(site, 'bas');
    expect(statsOf(obj).triangles).toBeGreaterThan(1000);
  });
  it('registerAlias : une clé de la carte → une définition existante, chaînes suivies, boucles refusées', () => {
    registerAlias('Pont-Alexandre-3', 'pont_alexandre_iii');
    expect(canonicalKey('pont_alexandre_3')).toBe('pont_alexandre_iii');
    expect(getMonument('pont_alexandre_3')).toBe(getMonument('pont_alexandre_iii'));
    registerAlias('pont_des_invalides_bis', 'pont_alexandre_3');
    expect(getMonument('pont_des_invalides_bis')).toBe(getMonument('pont_alexandre_iii'));
    registerAlias('pont_alexandre_iii', 'pont_des_invalides_bis');           // boucle : ignorée
    expect(canonicalKey('pont_alexandre_iii')).toBe('pont_alexandre_iii');
    expect(getColliders('pont_alexandre_3', EMPTY)).toEqual(getColliders('pont_alexandre_iii', EMPTY));
    expect(getMonument('cle_inconnue')).toBeUndefined();
  });
});

describe.each(KEYS)('monument %s', (key) => {
  const def = getMonument(key)!;
  const lm = landmark(key);
  const site = siteOfLandmark(lm);

  it.each(['bas', 'haut', 'ultra'] as QualityLevel[])('se construit sur l\'emprise réelle (%s), dans le budget', (quality) => {
    const obj = def.build(site, quality);
    const st = statsOf(obj);
    expect(st.triangles).toBeGreaterThan(600);
    expect(st.triangles).toBeLessThanOrEqual(60000);
    expect(st.drawCalls).toBeLessThanOrEqual(12);
    finite(obj);
  });
  it('la qualité basse est plus légère, la silhouette tient en 400 triangles', () => {
    expect(statsOf(def.build(site, 'bas')).triangles).toBeLessThan(statsOf(def.build(site, 'haut')).triangles);
    const far = def.buildFar(site);
    const st = statsOf(far);
    expect(st.triangles).toBeGreaterThan(10);
    expect(st.triangles).toBeLessThanOrEqual(400);
    expect(st.drawCalls).toBeLessThanOrEqual(5);
    finite(far);
    far.traverse((c) => expect(c.castShadow).toBe(false));
  });
  it('se construit aussi sans emprise (banc d\'essai) et sur un relief en pente', () => {
    const bare = def.build(EMPTY, 'haut'), real = def.build(site, 'haut'), sloped = def.build(withTerrain(site), 'haut');
    expect(statsOf(bare).triangles).toBe(statsOf(real).triangles);
    finite(sloped);
    const a = boxOf(real), b = boxOf(bare);
    expect(b.max.y).toBeCloseTo(a.max.y, 1);
    expect(Math.abs((a.max.x - a.min.x) - (b.max.x - b.min.x))).toBeLessThan(0.5);
  });
  it('rayon englobant et hauteur déclarés', () => {
    const box = boxOf(def.build(site, 'haut'));
    const reach = Math.max(Math.hypot(box.max.x, box.max.z), Math.hypot(box.min.x, box.min.z), Math.hypot(box.max.x, box.min.z), Math.hypot(box.min.x, box.max.z));
    expect(def.radius).toBeGreaterThan(reach * 0.78);
    expect(def.radius).toBeLessThan(reach * 1.3 + 3);
    expect(def.height).toBeGreaterThan(box.max.y * 0.6);
    expect(def.height).toBeLessThan(box.max.y * 1.4 + 6);
  });
  it('obstacles valides, antihoraires, dans le rayon du monument', () => {
    const cols = getColliders(key, site);
    expect(cols.length).toBeGreaterThan(0);
    for (const c of cols) {
      expect(c.ring.length).toBeGreaterThanOrEqual(6);
      expect(isSimpleRing(c.ring)).toBe(true);
      expect(signedArea(c.ring)).toBeGreaterThan(0);
      expect(c.height).toBeGreaterThan(0);
      expect(Number.isFinite(c.baseY)).toBe(true);
      const b = ringBounds(c.ring);
      expect(Math.hypot(b.cx, b.cz)).toBeLessThan(def.radius + 2);
    }
    // repère monde : même nombre, mêmes aires
    const world = getWorldColliders(lm);
    expect(world.length).toBe(cols.length);
    for (let i = 0; i < cols.length; i++) expect(Math.abs(signedArea(world[i].ring) - signedArea(cols[i].ring))).toBeLessThan(1e-3);
  });
});

describe.each(Object.keys(BRIDGES))('pont %s : ajustement sur le tablier réel', (key) => {
  const d = BRIDGES[key];
  const def = getMonument(key)!;
  const site = siteOfLandmark(landmark(key));

  it('le repère du tablier est celui de la carte (emprise de référence = emprise réelle)', () => {
    const f = bridgeFrame(site, d);
    expect(f.align.c).toBeCloseTo(1, 4);
    expect(Math.hypot(f.align.tx, f.align.tz)).toBeLessThan(0.05);
    expect(Math.hypot(f.ux, f.uz)).toBeCloseTo(1, 3);
    expect(f.uz).toBeGreaterThan(0.95);                                   // l'axe suit +z local
    expect(f.s1 - f.s0).toBeGreaterThan(50);
    // l'emprise réelle couvre la traversée de la Seine sur toute la largeur du tablier (à 1,5 m près)
    const b = ringBounds(site.footprint);
    expect(b.minZ).toBeLessThan(f.s0 + 6);
    expect(b.maxZ).toBeGreaterThan(f.s1 - 6);
    expect(b.w).toBeGreaterThan(2 * f.half - 1.5);
  });
  it('le tablier suit l\'altitude et la pente lues dans le relief ; l\'eau garde son niveau', () => {
    const flat = bridgeFrame(site, d);
    expect(flat.y0).toBe(0);
    const f = bridgeFrame({ ...site, groundAt: (x, z) => 0.4 + 0.01 * z + 0 * x, waterY: -7.2 }, d);
    expect(f.slope).toBeCloseTo(0.01 * f.uz, 3);
    expect(deckY(f, 0)).toBeCloseTo(0.4 + 0.01 * f.oz, 2);
    expect(f.waterY).toBe(-7.2);
    // un relief aberrant (falaise) n'est pas pris pour un tablier
    const wild = bridgeFrame({ ...site, groundAt: (_x, z) => 0.5 * z }, d);
    expect(wild.slope).toBe(d.slope);
  });
  it('le modèle suit le tablier quand la carte change d\'ancre ou de cap (pose rigide)', () => {
    const rot = 0.21, c = Math.cos(rot), s = Math.sin(rot), tx = 6, tz = -4;
    const moved: number[] = [];
    for (let i = 0; i + 1 < site.footprint.length; i += 2) moved.push(tx + site.footprint[i] * c - site.footprint[i + 1] * s, tz + site.footprint[i] * s + site.footprint[i + 1] * c);
    const f0 = bridgeFrame(site, d), f1 = bridgeFrame({ footprint: moved, height: site.height }, d);
    expect(f1.ox).toBeCloseTo(tx + f0.ox * c - f0.oz * s, 2);
    expect(f1.oz).toBeCloseTo(tz + f0.ox * s + f0.oz * c, 2);
    expect(f1.ux).toBeCloseTo(f0.ux * c - f0.uz * s, 3);
    const a = boxOf(def.build(site, 'bas')), b = boxOf(def.build({ footprint: moved, height: site.height }, 'bas'));
    expect(b.max.y).toBeCloseTo(a.max.y, 1);
    expect(Math.hypot(b.getCenter(new THREE.Vector3()).x, b.getCenter(new THREE.Vector3()).z)).toBeGreaterThan(1);
  });
  it('le modèle couvre la Seine d\'un quai à l\'autre et tient dans la largeur du tablier (décor compris)', () => {
    const f = bridgeFrame(site, d);
    const obj = def.build(site, 'haut');
    // extrêmes le long de l'axe et en travers, dans le repère du tablier
    let sMin = Infinity, sMax = -Infinity, vMax = 0, yMin = Infinity;
    obj.traverse((m) => {
      const mesh = m as THREE.Mesh;
      if (!mesh.geometry) return;
      const p = mesh.geometry.getAttribute('position');
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i) - f.ox, z = p.getZ(i) - f.oz;
        const s = x * f.ux + z * f.uz, v = x * f.nx + z * f.nz;
        if (Math.abs(v) <= f.half + 1 && p.getY(i) < -2) { sMin = Math.min(sMin, s); sMax = Math.max(sMax, s); yMin = Math.min(yMin, p.getY(i)); }
        if (s > f.s0 + 5 && s < f.s1 - 5) vMax = Math.max(vMax, Math.abs(v));
      }
    });
    expect(sMin).toBeLessThan(f.s0 + 1);
    expect(sMax).toBeGreaterThan(f.s1 - 1);
    expect(yMin).toBeLessThan(f.waterY - 1);                              // piles et culées plongent sous l'eau
    expect(vMax).toBeGreaterThan(f.half);                                 // parements au nu du tablier
    expect(vMax).toBeLessThan(f.half + 9);                                // avant-becs, demi-lunes, groupes de clef
  });
  it('le tablier est libre d\'une rive à l\'autre, les parapets le bordent', () => {
    const f = bridgeFrame(site, d);
    const cols = getColliders(key, site);
    for (let s = f.s0 - 4; s <= f.s1 + 4; s += 3) {
      for (const v of [0, f.roadHalf, -f.roadHalf, f.half - 0.8, -(f.half - 0.8)]) {
        const p = deckPoint(f, s, v);
        expect(freeAtGround(cols, p[0], p[1]), `s=${s} v=${v}`).toBe(true);
      }
    }
    const mid = (f.s0 + f.s1) / 2;
    for (const side of [-1, 1]) { const p = deckPoint(f, mid, side * (f.half + 0.3)); expect(freeAtGround(cols, p[0], p[1], 0.05)).toBe(false); }
    // rien sous la chaussée n'est déclaré comme obstacle (la simulation est plane)
    for (const c of cols) expect(c.baseY).toBeGreaterThanOrEqual(0);
  });
});

describe('pont Alexandre III', () => {
  const site = siteOfLandmark(landmark('pont_alexandre_iii'));
  it('tablier de 40 m, quatre pylônes de 17 m coiffés de groupes dorés aux angles de l\'emprise réelle', () => {
    const f = bridgeFrame(site, PA3);
    expect(f.half * 2).toBe(40);
    expect(f.s1 - f.s0).toBeGreaterThan(105);
    expect(f.s1 - f.s0).toBeLessThan(112);                                 // arche de 107,5 m
    const box = boxOf(getMonument('pont_alexandre_iii')!.build(site, 'haut'));
    expect(box.max.y).toBeGreaterThan(20.5);
    expect(box.max.y).toBeLessThan(23.5);
    const cols = getColliders('pont_alexandre_iii', site);
    // les pylônes sont aux angles de l'emprise de la carte (dont le contour, en redans, n'en englobe que deux)
    expect(PA3_PYLONS.filter(([x, z]) => pointInRing(x, z, site.footprint)).length).toBeGreaterThanOrEqual(2);
    const fp = ringBounds(site.footprint);
    for (const [x, z] of PA3_PYLONS) {
      expect(x).toBeGreaterThan(fp.minX); expect(x).toBeLessThan(fp.maxX); expect(z).toBeGreaterThan(fp.minZ); expect(z).toBeLessThan(fp.maxZ);
      expect(freeAtGround(cols, x, z)).toBe(false);
      expect(Math.abs(x)).toBeGreaterThan(f.half);                         // hors de la chaussée et des trottoirs
    }
    expect(PA3_PYLONS.length).toBe(4);
  });
});

describe('Pont Neuf', () => {
  it('sept arches au grand bras, cinq au petit bras ; demi-lunes au droit de chaque pile', () => {
    const big = archLayout(PONT_NEUF, PONT_NEUF_ARCHES.arches, PONT_NEUF_ARCHES.pier), small = archLayout(PONT_NEUF_PETIT_BRAS, PETIT_BRAS_ARCHES.arches, PETIT_BRAS_ARCHES.pier);
    expect(big.centers.length + small.centers.length).toBe(12);
    expect(big.piers.length).toBe(6);
    expect(small.piers.length).toBe(4);
    expect(big.opening).toBeGreaterThan(12);
    expect(small.opening).toBeGreaterThan(7.5);
    // les demi-lunes débordent du tablier au droit des piles, pas entre elles
    const site = siteOfLandmark(landmark('pont_neuf'));
    const f = bridgeFrame(site, PONT_NEUF);
    const obj = getMonument('pont_neuf')!.build(site, 'haut');
    const reach = (s0: number, s1: number): number => {
      let v = 0;
      obj.traverse((m) => {
        const mesh = m as THREE.Mesh;
        if (!mesh.geometry) return;
        const p = mesh.geometry.getAttribute('position');
        for (let i = 0; i < p.count; i++) {
          if (p.getY(i) < f.y0 + 0.2) continue;                            // au-dessus de la chaussée seulement
          const x = p.getX(i) - f.ox, z = p.getZ(i) - f.oz, vv = x * f.nx + z * f.nz, s = x * f.ux + z * f.uz - f.skew * vv;
          if (s > s0 && s < s1) v = Math.max(v, Math.abs(vv));
        }
      });
      return v;
    };
    expect(reach(big.piers[2] - 1, big.piers[2] + 1)).toBeGreaterThan(f.half + 2);
    expect(reach(big.centers[2] - 1, big.centers[2] + 1)).toBeLessThan(f.half + 0.8);
  });
  it('statue équestre d\'Henri IV sur le terre-plein, hors du tablier, sur son piédestal', () => {
    const site = siteOfLandmark(landmark('pont_neuf'));
    const f = bridgeFrame(site, PONT_NEUF);
    expect(HENRI_IV.z).toBeGreaterThan(f.s1 + 20);                         // au-delà du quai de l'île
    const cols = getColliders('pont_neuf', site);
    expect(freeAtGround(cols, HENRI_IV.x, HENRI_IV.z)).toBe(false);
    expect(freeAtGround(cols, HENRI_IV.x + 8, HENRI_IV.z)).toBe(true);
    const obj = getMonument('pont_neuf')!.build(site, 'haut');
    let top = -Infinity;
    obj.traverse((m) => {
      const mesh = m as THREE.Mesh;
      if (!mesh.geometry) return;
      const p = mesh.geometry.getAttribute('position');
      for (let i = 0; i < p.count; i++) if (Math.hypot(p.getX(i) - HENRI_IV.x, p.getZ(i) - HENRI_IV.z) < 4) top = Math.max(top, p.getY(i));
    });
    expect(top).toBeGreaterThan(8);
    expect(top).toBeLessThan(11.5);
  });
});

describe('palais de Chaillot', () => {
  const paris = siteOfLandmark(landmark('palais_chaillot')), passy = siteOfLandmark(landmark('palais_chaillot_passy'));
  it('les emprises de référence sont celles de la carte ; l\'aile de Passy est le miroir de l\'aile de Paris', () => {
    const p = wingPlan(paris, 'paris'), q = wingPlan(passy, 'passy');
    expect(p.mirror).toBe(false);
    expect(q.mirror).toBe(true);
    expect(p.align.c).toBeCloseTo(1, 4);
    expect(q.align.c).toBeCloseTo(1, 4);
    expect(REF_PARIS.length).toBe(paris.footprint.length);
    expect(REF_PASSY.length).toBe(passy.footprint.length);
    const a = ringBounds(p.ring), b = ringBounds(q.ring);                  // dans le repère canonique, les deux se superposent
    for (const k of ['minX', 'maxX', 'minZ', 'maxZ'] as const) expect(Math.abs(a[k] - b[k])).toBeLessThan(1.6);
    expect(signedArea(p.ring)).toBeGreaterThan(7000);
    expect(signedArea(q.ring)).toBeGreaterThan(7000);
  });
  it('trois volumes découpés dans l\'emprise réelle : pavillon de tête, barre courbe, pavillon de queue', () => {
    for (const plan of [wingPlan(paris, 'paris'), wingPlan(passy, 'passy')]) {
      const parts = wingParts(plan.ring);
      const total = signedArea(plan.ring);
      const sum = signedArea(parts.head) + signedArea(parts.body) + signedArea(parts.tail);
      expect(Math.abs(sum - total)).toBeLessThan(total * 0.01);
      expect(signedArea(parts.head)).toBeGreaterThan(1800);
      expect(signedArea(parts.tail)).toBeGreaterThan(600);
      expect(signedArea(parts.body)).toBeGreaterThan(2500);
      for (const r of [parts.head, parts.body, parts.tail]) expect(isSimpleRing(r)).toBe(true);
      expect(ringBounds(parts.head).maxX).toBeLessThanOrEqual(CHAILLOT.headX + 0.01);
      expect(ringBounds(parts.tail).minZ).toBeGreaterThanOrEqual(CHAILLOT.tailZ - 0.01);
    }
    expect(clipRing([0, 0, 10, 0, 10, 10, 0, 10], 1, 0, -5)).toEqual([]);
  });
  it.each([['palais_chaillot', paris], ['palais_chaillot_passy', passy]] as const)('%s tient sur son emprise réelle et la couvre', (key, site) => {
    const box = boxOf(getMonument(key)!.build(site, 'haut'));
    const fp = ringBounds(site.footprint);
    // statues dorées (≈ 5 m devant le pavillon) et pylône du groupe de bronze (côté jardins) débordent, rien d'autre
    expect(box.min.x).toBeGreaterThan(fp.minX - 7.5);
    expect(box.max.x).toBeLessThan(fp.maxX + 7.5);
    expect(box.min.z).toBeGreaterThan(fp.minZ - 1.5);
    expect(box.max.z).toBeLessThan(fp.maxZ + 1.5);
    expect(box.min.x).toBeLessThan(fp.minX + 1);
    expect(box.max.x).toBeGreaterThan(fp.maxX - 1);
    expect(box.min.z).toBeLessThan(fp.minZ + 1);
    expect(box.max.z).toBeGreaterThan(fp.maxZ - 1);
    expect(box.max.y).toBeCloseTo(CHAILLOT.parvisY + CHAILLOT.headH, 0);
  });
  it('le relief règle le niveau du parvis et le pied des murs', () => {
    const ground = (_x: number, z: number): number => 2 - 0.1 * z;
    const plan = wingPlan({ ...paris, groundAt: ground }, 'paris');
    expect(plan.parvisY).toBeCloseTo(2 - 0.1 * CHAILLOT.parvisZ, 3);
    expect(plan.lowY).toBeLessThan(2 - 0.1 * 68 - 1);
    const box = boxOf(getMonument('palais_chaillot')!.build({ ...paris, groundAt: ground }, 'bas'));
    expect(box.max.y).toBeCloseTo(plan.parvisY + CHAILLOT.headH, 0);
    expect(box.min.y).toBeLessThan(plan.lowY + 0.1);
  });
  it('le parvis reste libre entre les deux ailes ; statues et pavillons sont des obstacles', () => {
    const lmA = landmark('palais_chaillot'), lmB = landmark('palais_chaillot_passy');
    const cols = [...getWorldColliders(lmA), ...getWorldColliders(lmB)];
    const c = Math.cos(lmA.heading), s = Math.sin(lmA.heading);
    const world = (x: number, z: number): [number, number] => [lmA.x + x * c + z * s, lmA.z - x * s + z * c];
    for (let z = -70; z <= 30; z += 5) for (const dx of [-18, -9, 0, 9, 18]) { const p = world(CHAILLOT.axisX + dx, z); expect(freeAtGround(cols, p[0], p[1]), `x=${dx} z=${z}`).toBe(true); }
    // pavillons de tête de part et d'autre, à ≈ 28 m de l'axe ; statues au bord du parvis
    for (const side of [-1, 1]) { const p = world(CHAILLOT.axisX + side * 40, -30); expect(freeAtGround(cols, p[0], p[1])).toBe(false); }
    for (const [x, z] of CHAILLOT.statues) {
      const p = world(x, z); expect(freeAtGround(cols, p[0], p[1])).toBe(false);
      const q = world(2 * CHAILLOT.axisX - x, z); expect(freeAtGround(cols, q[0], q[1], 0.6)).toBe(false);
    }
    // l'axe du palais passe bien au milieu des deux pavillons (symétrie des deux repères de la carte)
    const pa = wingPlan(siteOfLandmark(lmA), 'paris'), pb = wingPlan(siteOfLandmark(lmB), 'passy');
    const ca = Math.cos(lmB.heading), sa = Math.sin(lmB.heading);
    const headA = world(...wingPoint(pa, ringBounds(wingParts(pa.ring).head).minX, -30));
    const hb = wingPoint(pb, ringBounds(wingParts(pb.ring).head).minX, -30);
    const headB: [number, number] = [lmB.x + hb[0] * ca + hb[1] * sa, lmB.z - hb[0] * sa + hb[1] * ca];
    const axis = world(CHAILLOT.axisX, -30);
    expect(Math.hypot((headA[0] + headB[0]) / 2 - axis[0], (headA[1] + headB[1]) / 2 - axis[1])).toBeLessThan(2.5);
    expect(Math.hypot(headA[0] - headB[0], headA[1] - headB[1])).toBeGreaterThan(50);       // parvis ouvert de ≈ 56 m
  });
  it('fontaine de Varsovie : dans l\'axe du palais, bassins infranchissables, pelouses libres', () => {
    const lmA = landmark('palais_chaillot'), lmF = landmark('fontaine_varsovie');
    expect(lmF.heading).toBeCloseTo(lmA.heading, 3);
    const c = Math.cos(lmA.heading), s = Math.sin(lmA.heading);
    const dx = lmF.x - lmA.x, dz = lmF.z - lmA.z;
    expect(Math.abs(dx * c - dz * s - CHAILLOT.axisX)).toBeLessThan(1.5);   // sur l'axe de symétrie du palais
    expect(dx * s + dz * c).toBeGreaterThan(120);                          // en contrebas, vers la Seine
    const cols = getColliders('fontaine_varsovie', EMPTY);
    expect(freeAtGround(cols, 0, 0)).toBe(false);
    expect(freeAtGround(cols, 0, VARSOVIE.z1 + 6)).toBe(false);
    expect(freeAtGround(cols, VARSOVIE.half + 4, 0)).toBe(true);
    expect(freeAtGround(cols, 0, VARSOVIE.z1 + VARSOVIE.half + 4)).toBe(true);
    expect(VARSOVIE.cannons).toBe(20);
  });
});

describe('portes Saint-Denis et Saint-Martin', () => {
  it('cotes réelles : 24,65 m et 18 m', () => {
    const a = boxOf(getMonument('porte_saint_denis')!.build(EMPTY, 'haut')), b = boxOf(getMonument('porte_saint_martin')!.build(EMPTY, 'haut'));
    expect(Math.abs(a.max.y - 24.65)).toBeLessThan(0.4);
    expect(a.max.x - a.min.x).toBeGreaterThan(25);
    expect(a.max.x - a.min.x).toBeLessThan(27.6);                          // corniche en saillie
    expect(Math.abs(b.max.y - 18)).toBeLessThan(0.4);
    expect(b.max.x - b.min.x).toBeGreaterThan(18);
    expect(b.max.x - b.min.x).toBeLessThan(20.4);
  });
  it('on passe sous l\'arche de la porte Saint-Denis et par ses deux portes piétonnes', () => {
    const cols = getColliders('porte_saint_denis', EMPTY);
    for (const z of [-6, -2, 0, 2, 6]) for (const x of [-3.2, 0, 3.2]) expect(freeAtGround(cols, x, z)).toBe(true);
    for (const s of [-1, 1]) for (const z of [-2, 0, 2]) expect(freeAtGround(cols, s * PSD.doorX, z, 0.3)).toBe(true);
    expect(overhead(cols, 0, 0).length).toBe(1);
    expect(overhead(cols, 0, 0)[0].baseY).toBeCloseTo(PSD.archH - PSD.archW / 2, 5);
    expect(overhead(cols, PSD.doorX, 0)[0].baseY).toBeGreaterThan(PASS_UNDER_Y);
    for (const s of [-1, 1]) for (const x of [5.5, 11]) expect(freeAtGround(cols, s * x, 0)).toBe(false);
    expect(freeAtGround(cols, 0, 9)).toBe(true);
    expect(freeAtGround(cols, 14, 0)).toBe(true);
  });
  it('on passe sous les trois arches de la porte Saint-Martin', () => {
    const cols = getColliders('porte_saint_martin', EMPTY);
    for (const z of [-4, 0, 4]) for (const x of [-2, 0, 2, -PSM.sideX, PSM.sideX]) expect(freeAtGround(cols, x, z)).toBe(true);
    expect(overhead(cols, 0, 0)[0].baseY).toBeCloseTo(PSM.midH - PSM.midW / 2, 5);
    expect(overhead(cols, PSM.sideX, 0)[0].baseY).toBeCloseTo(PSM.sideH - PSM.sideW / 2, 5);
    for (const s of [-1, 1]) for (const x of [3.6, 8.2]) expect(freeAtGround(cols, s * x, 0)).toBe(false);
    for (const c of cols) if (c.baseY > 0) expect(c.baseY).toBeGreaterThan(PASS_UNDER_Y);
  });
  it('coordonnées réelles : dans l\'emprise, sur les Grands Boulevards, façade vers le sud', () => {
    const sd = landmark('porte_saint_denis'), sm = landmark('porte_saint_martin');
    for (const lm of [sd, sm]) {
      expect(lm.x).toBeGreaterThan(PARIS.minX); expect(lm.x).toBeLessThan(PARIS.maxX);
      expect(lm.z).toBeGreaterThan(PARIS.minZ); expect(lm.z).toBeLessThan(PARIS.maxZ);
      expect(Math.cos(lm.heading)).toBeGreaterThan(0.9);                   // +z local ≈ sud
      expect(pointInRing(lm.x, lm.z, lm.footprint)).toBe(true);
      expect(signedArea(lm.footprint)).toBeGreaterThan(60);
    }
    // 48,869793 N 2,352687 E et 48,869146 N 2,355651 E : ≈ 230 m l'une de l'autre, Saint-Martin à l'est
    expect(Math.hypot(sm.x - sd.x, sm.z - sd.z)).toBeGreaterThan(200);
    expect(Math.hypot(sm.x - sd.x, sm.z - sd.z)).toBeLessThan(260);
    expect(sm.x).toBeGreaterThan(sd.x);
    const p = lonLatToXZ(2.321236, 48.865633);
    expect(Math.hypot(p.x, p.z)).toBeLessThan(1e-6);
  });
});

describe('repères supplémentaires', () => {
  it('fusionnés avec les repères de la carte seulement s\'ils tombent dans l\'emprise et n\'y sont pas déjà', () => {
    const base = LANDMARKS as unknown as LandmarkInfo[];
    const merged = mergeLandmarks(base, PARIS);
    expect(merged.length).toBe(base.length + EXTRA_LANDMARKS.length);
    for (const key of EXTRA_KEYS) expect(merged.filter((l) => l.key === key).length).toBe(1);
    expect(mergeLandmarks(base, null)).toBe(base);
    expect(mergeLandmarks(base, { minX: -Infinity, minZ: -Infinity, maxX: Infinity, maxZ: Infinity })).toBe(base);
    expect(mergeLandmarks(base, { minX: -300, minZ: -300, maxX: 300, maxZ: 300 })).toBe(base);     // quartier d'essai
    const east = mergeLandmarks(base, { minX: 2000, minZ: -1000, maxX: 3000, maxZ: 0 });
    expect(east.length).toBe(base.length + 2);                             // les deux portes, pas la fontaine
    expect(mergeLandmarks(merged, PARIS)).toBe(merged);                    // déjà fournis : aucun doublon
    expect(extraLandmarksIn(PARIS).map((l) => l.key).sort()).toEqual([...EXTRA_KEYS].sort());
    expect(extraLandmarksIn(undefined)).toEqual([]);
  });
});

// ───────────────────────────── système ─────────────────────────────

interface Fake {
  ctx: GameContext; world: THREE.Group; cam: { x: number; y: number; z: number }; env: { timeOfDay: number; daylight: number; isNight: boolean; fog: number; rain: number };
  api: MonumentsApi; worldApi: WorldMonumentsApi; run(n?: number): void; root(): THREE.Object3D | undefined;
}
function makeFake(landmarks: LandmarkInfo[], bounds: typeof PARIS | undefined, heightAt = (_x: number, _z: number): number => 0, far = 8000): Fake {
  const world = new THREE.Group();
  const cam = { x: 0, y: 1.7, z: 0 };
  const env = { timeOfDay: 14, daylight: 1, isNight: false, fog: 0, rain: 0 };
  const services = new Map<string, unknown>();
  const view = { world, quality: 'bas', drawDistance: 600, camera: { far }, scene: { fog: null }, get camX() { return cam.x; }, get camY() { return cam.y; }, get camZ() { return cam.z; } };
  const ctx = {
    headless: false, view,
    world: { ready: true, landmarks, bounds, waterLevel: -6.1, heightAt },
    env: { state: env },
    events: { on: () => () => { /* rien */ } },
    provide: (k: string, s: unknown) => { services.set(k, s); },
    service: (k: string) => services.get(k),
  } as unknown as GameContext;
  const system = createSystems()[0];
  system.provide?.(ctx);
  void system.init?.(ctx);
  return {
    ctx, world, cam, env,
    api: services.get('monuments') as MonumentsApi, worldApi: services.get('world.monuments') as WorldMonumentsApi,
    run: (n = 1) => { for (let i = 0; i < n; i++) system.frame?.(0.25); },
    root: () => world.children.find((c) => c.name === 'monuments'),
  };
}

describe('système : repères supplémentaires, service world.monuments, site', () => {
  const base = LANDMARKS as unknown as LandmarkInfo[];
  it('publie world.monuments { has, covers, horizonKeys } en plus du service monuments', () => {
    const f = makeFake(base, PARIS);
    expect(f.worldApi.has('pont_neuf')).toBe(true);
    expect(f.worldApi.has('fontaine_des_mers')).toBe(true);                // alias de carte
    expect(f.worldApi.has('porte_saint_denis')).toBe(true);
    expect(f.worldApi.has('immeuble_quelconque')).toBe(false);
    expect(f.worldApi.horizonKeys().sort()).toEqual(['la_defense', 'pantheon', 'sacre_coeur', 'tour_montparnasse']);
    // la porte Saint-Denis n'a pas de clé sur son bâtiment dans la carte : covers() permet de ne pas l'extruder
    const sd = landmark('porte_saint_denis');
    expect(f.worldApi.covers(sd.x, sd.z)).toBe(true);
    expect(f.worldApi.covers(sd.x + 40, sd.z + 40)).toBe(false);
    // piédestal d'Henri IV (bâtiment générique de la carte au même endroit)
    const pn = landmark('pont_neuf');
    const c = Math.cos(pn.heading), s = Math.sin(pn.heading);
    expect(f.worldApi.covers(pn.x + HENRI_IV.x * c + HENRI_IV.z * s, pn.z - HENRI_IV.x * s + HENRI_IV.z * c)).toBe(true);
    expect(f.worldApi.covers(pn.x, pn.z)).toBe(false);                      // la chaussée du pont n'est pas « couverte »
  });
  it('les repères supplémentaires reçoivent un modèle sur une vraie carte, pas dans un monde sans emprise', () => {
    const f = makeFake(base, PARIS);
    const sd = landmark('porte_saint_denis');
    f.cam.x = sd.x + 30; f.cam.z = sd.z + 60;
    f.run(8);
    expect(f.api.landmarks().length).toBe(base.length + 3);
    expect(f.api.stats().known).toBe(f.api.landmarks().filter((l) => getMonument(l.key)).length);
    const g = f.root()!.children.find((c) => c.name === 'monument:porte_saint_denis')!;
    expect(g.visible).toBe(true);
    expect(g.position.x).toBeCloseTo(sd.x, 3);
    expect(g.rotation.y).toBeCloseTo(sd.heading, 5);
    expect(g.children.some((c) => c.visible && c.name === 'porte_saint_denis')).toBe(true);
    const none = makeFake(base, undefined);
    none.run(3);
    expect(none.api.landmarks()).toBe(base);
    expect(none.root()!.children.some((c) => c.name === 'monument:porte_saint_denis')).toBe(false);
    expect(none.api.stats().horizon).toBe(0);
  });
  it('la seconde fontaine de la Concorde (clé fontaine_des_mers) est posée avec la définition des fontaines', () => {
    const f = makeFake(base, PARIS);
    f.cam.x = 0; f.cam.z = 20;
    f.run(8);
    const fountains = f.root()!.children.filter((c) => c.name === 'monument:fontaines_concorde');
    expect(fountains.length).toBe(2);
    for (const g of fountains) expect(g.children.some((c) => c.visible && c.name === 'fontaines_concorde')).toBe(true);
  });
  it('le site transmis aux définitions porte le relief relatif et le niveau de l\'eau : le pont suit la pente du monde', () => {
    const pn = landmark('pont_neuf');
    const flat = makeFake([pn], PARIS), sloped = makeFake([pn], PARIS, (_x, z) => 1 + 0.02 * (z - pn.z));
    const tops: number[] = [];
    for (const f of [flat, sloped]) {
      f.cam.x = pn.x; f.cam.z = pn.z;
      f.run(4);
      const g = f.root()!.children.find((c) => c.name === 'monument:pont_neuf')!;
      const near = g.children.find((c) => c.name === 'pont_neuf')!;
      expect(near).toBeDefined();
      g.updateMatrixWorld(true);
      const b = new THREE.Box3().setFromObject(near);
      tops.push(b.max.y - b.min.y);
    }
    expect(flat.root()!.children.find((c) => c.name === 'monument:pont_neuf')!.position.y).toBe(0);
    expect(sloped.root()!.children.find((c) => c.name === 'monument:pont_neuf')!.position.y).toBeCloseTo(1, 5);
    expect(tops[1]).toBeGreaterThan(tops[0] + 0.8);                        // 130 m de tablier à ≈ 1,8 % : ≈ 2 m de plus
  });
});

describe('silhouettes d\'horizon', () => {
  const az = (x: number, z: number): number => ((Math.atan2(x, -z) * 180) / Math.PI + 360) % 360;
  it('coordonnées réelles : direction et distance depuis la Concorde (dossier 04, § 3.23)', () => {
    const expected: Record<string, [number, number]> = { sacre_coeur: [2844, 34], tour_montparnasse: [2616, 179], la_defense: [6937, 296], pantheon: [2826, 140] };
    expect(HORIZON.map((h) => h.key).sort()).toEqual(Object.keys(expected).sort());
    for (const h of HORIZON) {
      const [dist, bearing] = expected[h.key];
      expect(Math.abs(Math.hypot(h.x, h.z) - dist), h.key).toBeLessThan(25);
      expect(Math.abs(az(h.x, h.z) - bearing), h.key).toBeLessThan(1);
      // hors de l'emprise de la carte
      expect(h.x < PARIS.minX || h.x > PARIS.maxX || h.z < PARIS.minZ || h.z > PARIS.maxZ, h.key).toBe(true);
      expect(h.baseY).toBeGreaterThan(15);
    }
    // la Grande Arche est dans l'axe des Champs-Élysées, derrière l'Arc de Triomphe vu de la Concorde
    const arc = landmark('arc_triomphe'), def = HORIZON.find((h) => h.key === 'la_defense')!;
    expect(Math.abs(az(arc.x, arc.z) - az(def.x, def.z))).toBeLessThan(1.2);
    expect(Math.hypot(def.x, def.z)).toBeGreaterThan(3 * Math.hypot(arc.x, arc.z));
  });
  it('jamais de modèle détaillé : une silhouette de moins de 400 triangles, aux bonnes hauteurs, à voile propre', () => {
    const heights: Record<string, [number, number]> = { sacre_coeur: [83, 92], tour_montparnasse: [209, 224], la_defense: [110, 232], pantheon: [80, 84] };
    for (const h of HORIZON) {
      const obj = h.build();
      const st = statsOf(obj);
      expect(st.triangles, h.key).toBeGreaterThan(20);
      expect(st.triangles, h.key).toBeLessThanOrEqual(400);
      expect(st.drawCalls, h.key).toBeLessThanOrEqual(4);
      finite(obj);
      const box = boxOf(obj);
      expect(box.max.y, h.key).toBeGreaterThanOrEqual(heights[h.key][0]);
      expect(box.max.y, h.key).toBeLessThanOrEqual(heights[h.key][1]);
      expect(hazesOf(obj).length, h.key).toBe(st.drawCalls);              // un voile par matériau
      obj.traverse((c) => { const m = (c as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined; if (m) expect(m.fog).toBe(false); });
    }
    expect((getMonument('sacre_coeur') ?? getMonument('pantheon') ?? getMonument('la_defense') ?? getMonument('tour_montparnasse'))).toBeUndefined();
  });
  it('posées par le système dans la bonne direction ; rapprochées et réduites au-delà du champ de la caméra', () => {
    const f = makeFake([], PARIS, () => 0, 8000);
    f.cam.y = 2;
    f.run(2);
    const st = f.api.stats();
    expect(st.horizon).toBe(4);
    expect(st.known).toBe(EXTRA_LANDMARKS.length);                         // carte vide : seuls les repères supplémentaires
    expect(st.distant).toBe(0);
    expect(st.horizonTriangles).toBeLessThanOrEqual(1600);
    const shell = 8000 * 0.82;
    for (const h of HORIZON) {
      const g = f.root()!.children.find((c) => c.name === `horizon:${h.key}`)!;
      expect(g, h.key).toBeDefined();
      const dist = Math.hypot(h.x, h.z), shown = Math.hypot(g.position.x, g.position.z);
      expect(Math.abs(az(g.position.x, g.position.z) - az(h.x, h.z))).toBeLessThan(1e-6);
      if (dist <= shell) { expect(shown).toBeCloseTo(dist, 3); expect(g.scale.x).toBe(1); expect(g.position.y).toBeCloseTo(h.baseY, 6); }
      else {
        expect(shown).toBeCloseTo(shell, 3);
        expect(g.scale.x).toBeCloseTo(shell / dist, 6);
        // même hauteur apparente : (y − œil) / distance inchangé
        expect((g.position.y - 2) / shown).toBeCloseTo((h.baseY - 2) / dist, 6);
      }
      expect(g.rotation.y).toBeCloseTo(h.heading, 6);
    }
    expect(Math.hypot(HORIZON.find((h) => h.key === 'la_defense')!.x, HORIZON.find((h) => h.key === 'la_defense')!.z)).toBeGreaterThan(shell);
    // depuis la République, la Défense est à près de 10 km : toujours dans le champ, toujours dans la bonne direction
    f.cam.x = 3123; f.cam.z = -208;
    f.run(1);
    const g = f.root()!.children.find((c) => c.name === 'horizon:la_defense')!, d = HORIZON.find((h) => h.key === 'la_defense')!;
    expect(Math.hypot(g.position.x - 3123, g.position.z + 208)).toBeCloseTo(shell, 2);
    expect(Math.abs(az(g.position.x - 3123, g.position.z + 208) - az(d.x - 3123, d.z + 208))).toBeLessThan(1e-6);
  });
  it('voile atmosphérique : croît avec la distance et le brouillard, sans jamais effacer par temps clair', () => {
    const f = makeFake([], PARIS);
    f.run(2);
    const hazeOf = (key: string): number => hazesOf(f.root()!.children.find((c) => c.name === `horizon:${key}`)!)[0].w;
    const near = hazeOf('tour_montparnasse'), farAway = hazeOf('la_defense');
    expect(near).toBeGreaterThan(0.15);
    expect(farAway).toBeGreaterThan(near);
    expect(farAway).toBeLessThan(0.65);
    f.env.fog = 1;
    f.run(1);
    expect(hazeOf('tour_montparnasse')).toBeGreaterThan(0.95);
    f.env.fog = 0;
    // remise à zéro puis repeuplement
    const system = (f.ctx as unknown as { service(k: string): unknown });
    expect(system.service('world.monuments')).toBe(f.worldApi);
  });
  it('absentes d\'un monde qui n\'est pas le cœur de Paris (quartier d\'essai, emprise inconnue)', () => {
    for (const b of [undefined, { minX: -300, minZ: -300, maxX: 300, maxZ: 300 }, { minX: 5000, minZ: 5000, maxX: 12000, maxZ: 12000 }]) {
      const f = makeFake([], b as typeof PARIS | undefined);
      f.run(2);
      expect(f.api.stats().horizon).toBe(0);
    }
  });
});
