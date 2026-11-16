// Lot « édifices » (églises, opéras, palais) : chaque définition se construit sans erreur sur l'EMPRISE RÉELLE de la
// carte (public/data/paris/landmarks.json), tient dessus, respecte les budgets, garde ses cotes réelles ; les
// obstacles sont valides et antihoraires ; les passages (tour Saint-Jacques, portique de Saint-Sulpice, coursives du
// Centre Pompidou) sont praticables. Sous Node il n'y a pas de canvas : géométrie complète, matériaux sans texture.
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import rawLandmarks from '../../public/data/paris/landmarks.json';
import { decodeLandmarks, type Landmark, type RawLandmarks } from '@/world/mapdata';
import { createSystems } from '@/world/monuments';
import { getMonument } from '@/world/monuments/registry';
import { getColliders, getWorldColliders, listColliderKeys, siteOfLandmark } from '@/world/monuments/colliders';
import { statsOf } from '@/world/monuments/kit';
import { siteFit } from '@/world/monuments/kit/x-edifices';
import { flyingButtress, lancet, pinnacle, roseWindow } from '@/world/monuments/kit/x-gothique';
import { gothicAtlas, rowWall } from '@/world/monuments/kit/x-gothique-peint';
import { isSimpleRing, pointInRing, ringBounds, signedArea } from '@/world/monuments/shape2d';
import { PASS_UNDER_Y, type MonumentCollider, type MonumentSite } from '@/world/monuments/types';
import { SUL, porticoColumns } from '@/world/monuments/collide/saint_sulpice';
import { CP } from '@/world/monuments/collide/centre_pompidou';
import type { GameContext, LandmarkInfo, QualityLevel } from '@/core/contracts';

const LANDMARKS = decodeLandmarks(rawLandmarks as unknown as RawLandmarks);
const EMPTY: MonumentSite = { footprint: [], height: 0 };

interface Spec {
  /** Hauteur réelle (m) et tolérance relative. */
  h: number; tol?: number;
  /** Budget de triangles. */
  budget?: number;
  /** Débord toléré du modèle hors de la boîte de l'emprise réelle (m) : [−x, +x, −z, +z] (perron, parvis, piazza…). */
  over?: [number, number, number, number];
}
const SPECS: Record<string, Spec> = {
  notre_dame: { h: 96, tol: 0.02, budget: 120000, over: [6, 2, 2, 62] },          // parvis au-devant de la façade
  sainte_chapelle: { h: 75.75, tol: 0.02 },
  madeleine: { h: 30, tol: 0.08 },                                                 // 31,6 m soubassement compris
  opera_garnier: { h: 56, tol: 0.2, over: [8, 3, 2, 4] },                          // 56 m au comble, ~66 m à la lyre ; perron, rampes
  saint_eustache: { h: 50, tol: 0.08, over: [4, 4, 3, 3] },
  saint_sulpice: { h: 73, tol: 0.02, over: [3, 3, 2, 3] },
  tour_saint_jacques: { h: 54, tol: 0.02 },
  bourse_commerce: { h: 36.3, tol: 0.08, over: [2, 4, 2, 2] },                     // colonne Médicis hors de l'anneau
  centre_pompidou: { h: 42, tol: 0.12, over: [2, 2, 2, 62] },                      // piazza
  opera_bastille: { h: 48, tol: 0.03 },
  grand_palais: { h: 45, tol: 0.35, over: [3, 3, 3, 12] },                         // 45 m au dôme, 60 m à la hampe ; perron
  petit_palais: { h: 21.3, tol: 0.5, over: [2, 2, 2, 9] },                         // 31 m au dôme du porche ; grand escalier
};
const KEYS = Object.keys(SPECS);

function landmark(key: string): Landmark {
  const lm = LANDMARKS.find((l) => l.key === key);
  if (!lm) throw new Error(`repère absent de landmarks.json : ${key}`);
  return lm;
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

describe('lot édifices : repères de la carte', () => {
  it('les douze monuments du lot sont présents dans landmarks.json, avec une emprise', () => {
    for (const key of KEYS) {
      const lm = landmark(key);
      expect(lm.footprint.length).toBeGreaterThanOrEqual(8);
      expect(lm.height).toBeGreaterThan(10);
    }
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
});

describe.each(KEYS)('édifice %s', (key) => {
  const def = getMonument(key)!;
  const lm = landmark(key);
  const site = siteOfLandmark(lm);
  const spec = SPECS[key];
  const fp = ringBounds(site.footprint);

  it.each(['bas', 'haut'] as QualityLevel[])('se construit sur l\'emprise réelle (%s), dans le budget', (quality) => {
    const obj = def.build(site, quality);
    const st = statsOf(obj);
    expect(st.triangles).toBeGreaterThan(800);
    expect(st.triangles).toBeLessThanOrEqual(spec.budget ?? 60000);
    expect(st.drawCalls).toBeLessThanOrEqual(12);
    obj.traverse((c) => {
      const m = c as THREE.Mesh;
      if (!m.geometry) return;
      const p = m.geometry.getAttribute('position');
      for (let i = 0; i < p.count; i++) {
        if (!Number.isFinite(p.getX(i)) || !Number.isFinite(p.getY(i)) || !Number.isFinite(p.getZ(i))) throw new Error(`sommet invalide dans ${c.name}`);
      }
      const n = m.geometry.getAttribute('normal');
      for (let i = 0; i < n.count; i += 97) expect(Number.isFinite(n.getX(i) + n.getY(i) + n.getZ(i))).toBe(true);
    });
  });

  it('tient sur son emprise réelle et la couvre', () => {
    const box = boxOf(def.build(site, 'haut'));
    const [ox0, ox1, oz0, oz1] = spec.over ?? [2, 2, 2, 2];
    // pas de débord au-delà de la marge admise (corniches, perrons, parvis déclarés)
    expect(box.min.x).toBeGreaterThan(fp.minX - ox0);
    expect(box.max.x).toBeLessThan(fp.maxX + ox1);
    expect(box.min.z).toBeGreaterThan(fp.minZ - oz0);
    expect(box.max.z).toBeLessThan(fp.maxZ + oz1);
    // le modèle occupe bien toute l'emprise (à 3,5 m près)
    expect(box.min.x).toBeLessThan(fp.minX + 3.5);
    expect(box.max.x).toBeGreaterThan(fp.maxX - 3.5);
    expect(box.min.z).toBeLessThan(fp.minZ + 3.5);
    expect(box.max.z).toBeGreaterThan(fp.maxZ - 3.5);
    expect(box.min.y).toBeGreaterThan(-0.3);
  });

  it('hauteur réelle et rayon englobant', () => {
    const box = boxOf(def.build(site, 'haut'));
    expect(Math.abs(def.height - box.max.y) / box.max.y).toBeLessThan(0.12);
    expect(Math.abs(box.max.y - spec.h) / spec.h).toBeLessThan(spec.tol ?? 0.05);
    const reach = Math.max(Math.hypot(box.max.x, box.max.z), Math.hypot(box.min.x, box.min.z), Math.hypot(box.max.x, box.min.z), Math.hypot(box.min.x, box.max.z));
    const size = box.getSize(new THREE.Vector3());
    expect(def.radius).toBeGreaterThan((Math.max(size.x, size.z) / 2) * 0.95);
    expect(def.radius).toBeLessThan(reach * 1.6 + 2);
  });

  it('sans emprise (banc d\'essai), le modèle est le même, dans son repère de dessin', () => {
    const real = def.build(site, 'haut'), bare = def.build(EMPTY, 'haut');
    const a = boxOf(real), b = boxOf(bare);
    expect(b.max.y).toBeCloseTo(a.max.y, 1);
    expect(statsOf(bare).triangles).toBe(statsOf(real).triangles);
    // même encombrement (la pose sur le site est rigide : seule une rotation peut changer la boîte)
    const da = Math.hypot(a.max.x - a.min.x, a.max.z - a.min.z), db = Math.hypot(b.max.x - b.min.x, b.max.z - b.min.z);
    expect(Math.abs(da - db) / db).toBeLessThan(0.12);
    expect(statsOf(def.build(EMPTY, 'bas')).triangles).toBeLessThanOrEqual(statsOf(bare).triangles);
  });

  it('le modèle suit l\'emprise si la carte change de point d\'ancrage ou de cap', () => {
    // même contour, vu d'un repère tourné de 23,6° et décalé : le modèle doit rester sur l'emprise
    const rot = 0.412, dx = 7.5, dz = -4.2, c = Math.cos(rot), s = Math.sin(rot);
    const moved: number[] = [];
    for (let i = 0; i < site.footprint.length; i += 2) moved.push(dx + site.footprint[i] * c - site.footprint[i + 1] * s, dz + site.footprint[i] * s + site.footprint[i + 1] * c);
    const mb = ringBounds(moved);
    const box = boxOf(def.build({ footprint: moved, height: site.height }, 'bas'));
    const [ox0, ox1, oz0, oz1] = spec.over ?? [2, 2, 2, 2], slack = Math.max(ox0, ox1, oz0, oz1) + 1.5;
    expect(box.min.x).toBeGreaterThan(mb.minX - slack);
    expect(box.max.x).toBeLessThan(mb.maxX + slack);
    expect(box.min.z).toBeGreaterThan(mb.minZ - slack);
    expect(box.max.z).toBeLessThan(mb.maxZ + slack);
    expect(box.min.x).toBeLessThan(mb.minX + 4.5);
    expect(box.max.x).toBeGreaterThan(mb.maxX - 4.5);
    // les obstacles suivent aussi : le centre de l'emprise déplacée reste bloqué ou couvert
    const cols = getColliders(key, { footprint: moved, height: site.height });
    const cx = dx + fp.cx * c - fp.cz * s, cz = dz + fp.cx * s + fp.cz * c;
    for (const col of cols) { const bb = ringBounds(col.ring); expect(Math.hypot(bb.cx - cx, bb.cz - cz)).toBeLessThan(def.radius + 5); }
  });

  it('silhouette lointaine ≤ 400 triangles, même gabarit', () => {
    const far = def.buildFar(site);
    const st = statsOf(far);
    expect(st.triangles).toBeGreaterThan(20);
    expect(st.triangles).toBeLessThanOrEqual(400);
    expect(st.drawCalls).toBeLessThanOrEqual(4);
    const box = boxOf(far), near = boxOf(def.build(site, 'bas'));
    expect(Math.abs(box.max.y - near.max.y) / near.max.y).toBeLessThan(0.12);
    expect(box.min.x).toBeGreaterThan(fp.minX - 4);
    expect(box.max.x).toBeLessThan(fp.maxX + 4);
    expect(box.min.z).toBeGreaterThan(fp.minZ - 4);
    expect(box.max.z).toBeLessThan(fp.maxZ + 4);
  });

  it('obstacles valides, antihoraires, pleins au sol sous le bâti', () => {
    for (const s of [site, EMPTY]) {
      const cols = getColliders(key, s);
      expect(cols.length).toBeGreaterThan(0);
      for (const c of cols) {
        expect(c.ring.length % 2).toBe(0);
        expect(c.ring.length).toBeGreaterThanOrEqual(6);
        expect(isSimpleRing(c.ring), `${key} : anneau non simple`).toBe(true);
        expect(signedArea(c.ring)).toBeGreaterThan(0.5);
        expect(c.height).toBeGreaterThan(0);
        expect(c.baseY).toBeGreaterThanOrEqual(0);
      }
      expect(cols.some((c) => c.baseY <= PASS_UNDER_Y)).toBe(true);
      // loin du monument, le sol est libre
      expect(freeAtGround(cols, fp.maxX + 80, fp.maxZ + 80)).toBe(true);
    }
    // en coordonnées monde : les obstacles sont autour du point d'ancrage du repère
    const world = getWorldColliders(lm);
    expect(world.length).toBe(getColliders(key, site).length);
    for (const c of world) {
      const bb = ringBounds(c.ring);
      expect(Math.hypot(bb.cx - lm.x, bb.cz - lm.z)).toBeLessThan(def.radius + 5);
      expect(signedArea(c.ring)).toBeGreaterThan(0.5);
    }
  });
});

describe('lot édifices : passages praticables', () => {
  it('on passe sous la tour Saint-Jacques par ses quatre arcades', () => {
    const cols = getColliders('tour_saint_jacques', siteOfLandmark(landmark('tour_saint_jacques')));
    // traversées nord-sud et est-ouest, en contournant le socle de la statue de Pascal
    for (const [x, z] of [[0, 9], [0, 5.5], [0, 3], [1.9, 0], [0, -3], [0, -5.5], [3, 0], [5.5, 0], [-3, 0], [-5.5, 0], [2.2, 2.2]]) expect(freeAtGround(cols, x, z), `(${x}, ${z})`).toBe(true);
    for (const [x, z] of [[0, 3], [3, 0], [0, -3], [-3, 0]]) expect(overhead(cols, x, z).length).toBeGreaterThan(0);
    // les quatre piles d'angle et le socle de la statue sont pleins
    for (const [x, z] of [[4.75, 4.75], [-4.75, 4.75], [4.75, -4.75], [-4.75, -4.75], [0, 0]]) expect(freeAtGround(cols, x, z)).toBe(false);
    for (const c of cols) if (c.baseY > 0) expect(c.baseY).toBeGreaterThan(PASS_UNDER_Y + 3);
    // largeur du passage entre deux piles
    let gap = 0;
    while (freeAtGround(cols, gap / 2, 4.75, 0.05) && freeAtGround(cols, -gap / 2, 4.75, 0.05) && gap < 20) gap += 0.1;
    expect(gap).toBeGreaterThan(5);
    expect(gap).toBeLessThan(8);
  });

  it('on passe sous le portique de Saint-Sulpice, entre les colonnes', () => {
    const cols = getColliders('saint_sulpice', siteOfLandmark(landmark('saint_sulpice')));
    const xs = porticoColumns();
    expect(xs.length).toBe(8);
    for (let i = 0; i < xs.length - 1; i++) {
      const xm = (xs[i] + xs[i + 1]) / 2;
      // du parvis jusqu'au pied du mur du fond, dans chaque entrecolonnement
      for (const z of [SUL.ZF + 3, SUL.ZF - 1.4, SUL.ZF - 3.3, SUL.ZF - 5.2, SUL.ZWALL + 0.9]) expect(freeAtGround(cols, xm, z), `(${xm}, ${z})`).toBe(true);
      expect(overhead(cols, xm, SUL.ZF - 3.3).length).toBeGreaterThan(0);
      expect(xs[i + 1] - xs[i] - SUL.DIA).toBeGreaterThan(2);
    }
    // on circule aussi en long entre les deux rangs
    for (const x of [-12, -6, 0, 6, 12]) expect(freeAtGround(cols, x, SUL.ZF - 3.3)).toBe(true);
    // colonnes, tours, nef : pleins
    for (const x of xs) { expect(freeAtGround(cols, x, SUL.ZF - 1.4)).toBe(false); expect(freeAtGround(cols, x, SUL.ZF - 5.2)).toBe(false); }
    for (const [x, z] of [[-22, 55], [22, 55], [0, 40], [0, 0], [27, -2], [0, -45]]) expect(freeAtGround(cols, x, z)).toBe(false);
    expect(overhead(cols, 0, SUL.ZF + 3).length).toBe(0);
    for (const c of cols) if (c.baseY > 0) expect(c.baseY).toBeGreaterThan(10);
  });

  it('on marche sous les coursives du Centre Pompidou, côté piazza, entre les poteaux', () => {
    const cols = getColliders('centre_pompidou', siteOfLandmark(landmark('centre_pompidou')));
    for (let i = 0; i < 13; i++) {
      const xm = -CP.HX + (i + 0.5) * CP.BAY;
      for (const z of [CP.ZB1 + 0.8, CP.ZB1 + 1.6, CP.ZB1 + 4, CP.ZW]) if (!(z > CP.ZW - 1 && Math.abs(xm - CP.XFOOT) < 8)) expect(freeAtGround(cols, xm, z), `(${xm}, ${z})`).toBe(true);
      expect(overhead(cols, xm, CP.ZB1 + 3).length).toBeGreaterThan(0);
    }
    // on longe toute la façade sous l'ossature, sauf au pied de l'escalier mécanique
    for (let x = -CP.HX + 3; x < CP.HX; x += 4.1) if (Math.abs(x + CP.HX) % CP.BAY > 1.2 && (CP.BAY - (Math.abs(x + CP.HX) % CP.BAY)) > 1.2) expect(freeAtGround(cols, x, CP.ZB1 + 1.6), `x = ${x}`).toBe(true);
    for (let i = 0; i <= 13; i++) expect(freeAtGround(cols, -CP.HX + i * CP.BAY, CP.ZB1 + 1.6)).toBe(false);
    expect(freeAtGround(cols, CP.XFOOT, CP.ZTUBE)).toBe(false);
    // le volume vitré et la nappe de tuyaux côté rue du Renard sont pleins ; la piazza est libre
    for (const [x, z] of [[0, 0], [60, -20], [-70, 10], [0, -30], [50, -31]]) expect(freeAtGround(cols, x, z)).toBe(false);
    for (const [x, z] of [[0, 45], [-60, 60], [70, 38]]) expect(freeAtGround(cols, x, z)).toBe(true);
    for (const c of cols) if (c.baseY > 0) expect(c.baseY).toBeGreaterThan(PASS_UNDER_Y + 1);
  });

  it('les édifices pleins ferment bien leur emprise (pas de passage à travers une nef ou un palais)', () => {
    for (const key of ['notre_dame', 'sainte_chapelle', 'madeleine', 'opera_garnier', 'saint_eustache', 'bourse_commerce', 'opera_bastille', 'grand_palais', 'petit_palais']) {
      const lm = landmark(key), site = siteOfLandmark(lm), cols = getColliders(key, site);
      const b = ringBounds(site.footprint);
      // échantillonnage : tout point intérieur à l'emprise réelle est bloqué au sol
      let inside = 0;
      for (let i = 1; i < 12; i++) for (let j = 1; j < 12; j++) {
        const x = b.minX + (i / 12) * b.w, z = b.minZ + (j / 12) * b.d;
        if (!pointInRing(x, z, site.footprint)) continue;
        inside++;
        expect(freeAtGround(cols, x, z, 0.05), `${key} (${x.toFixed(1)}, ${z.toFixed(1)})`).toBe(false);
      }
      expect(inside).toBeGreaterThan(20);
    }
  });
});

describe('lot édifices : dans le système d\'affichage, sur la carte réelle', () => {
  it('chaque édifice est posé (ancrage, cap) sur son emprise MONDE', () => {
    const landmarks: LandmarkInfo[] = KEYS.map((k) => { const l = landmark(k); return { key: l.key, name: l.name, x: l.x, z: l.z, y: l.y, heading: l.heading, height: l.height, footprint: l.footprint }; });
    const world = new THREE.Group();
    const cam = { x: 0, y: 1.7, z: 0 };
    const services = new Map<string, unknown>();
    const view = { world, quality: 'bas', drawDistance: 600, get camX() { return cam.x; }, get camY() { return cam.y; }, get camZ() { return cam.z; } };
    const ctx = {
      headless: false, view,
      world: { ready: true, landmarks, heightAt: () => 0 },
      env: { state: { timeOfDay: 14, daylight: 1, isNight: false } },
      events: { on: () => () => { /* rien à désabonner */ } },
      provide: (k: string, v: unknown) => { services.set(k, v); },
      service: (k: string) => services.get(k),
    } as unknown as GameContext;
    const system = createSystems()[0];
    system.provide?.(ctx);
    void system.init?.(ctx);
    for (const lm of landmarks) {
      cam.x = lm.x; cam.z = lm.z;
      for (let i = 0; i < 6; i++) system.frame?.(0.25);
      const root = world.children.find((c) => c.name === 'monuments')!;
      const group = root.children.find((c) => c.name === `monument:${lm.key}`)!;
      expect(group, lm.key).toBeDefined();
      expect(group.visible).toBe(true);
      const near = group.children.find((c) => c.visible && c.name === lm.key);
      expect(near, `${lm.key} : modèle détaillé affiché`).toBeDefined();
      world.updateMatrixWorld(true);
      // boîte exacte, sommet par sommet : le groupe est tourné du cap du repère
      const box = new THREE.Box3().setFromObject(near!, true), fpw = ringBounds(lm.footprint);
      const [ox0, ox1, oz0, oz1] = SPECS[lm.key].over ?? [2, 2, 2, 2], slack = Math.max(ox0, ox1, oz0, oz1) + 1.5;
      expect(box.min.x, lm.key).toBeGreaterThan(fpw.minX - slack);
      expect(box.max.x, lm.key).toBeLessThan(fpw.maxX + slack);
      expect(box.min.z, lm.key).toBeGreaterThan(fpw.minZ - slack);
      expect(box.max.z, lm.key).toBeLessThan(fpw.maxZ + slack);
      expect(box.min.x, lm.key).toBeLessThan(fpw.minX + 4.5);
      expect(box.max.x, lm.key).toBeGreaterThan(fpw.maxX - 4.5);
      expect(box.min.z, lm.key).toBeLessThan(fpw.minZ + 4.5);
      expect(box.max.z, lm.key).toBeGreaterThan(fpw.maxZ - 4.5);
    }
    system.dispose?.();
  });
});

describe('lot édifices : pièces du kit', () => {
  it('siteFit : identité sur l\'emprise de dessin, mise à l\'échelle sur une emprise voisine, repli sur une emprise aberrante', () => {
    const box = { minX: -10, maxX: 10, minZ: -20, maxZ: 20 };
    const id = siteFit({ footprint: [-10, -20, -10, 20, 10, 20, 10, -20], height: 0 }, box);
    expect(id.equals(new THREE.Matrix4())).toBe(true);
    expect(siteFit(EMPTY, box).equals(new THREE.Matrix4())).toBe(true);
    const m = siteFit({ footprint: [0, 0, 0, 44, 22, 44, 22, 0], height: 0 }, box);
    const p = new THREE.Vector3(10, 5, 20).applyMatrix4(m), q = new THREE.Vector3(-10, 0, -20).applyMatrix4(m);
    expect(p.x).toBeCloseTo(22, 5); expect(p.y).toBeCloseTo(5, 5); expect(p.z).toBeCloseTo(44, 5);
    expect(q.x).toBeCloseTo(0, 5); expect(q.z).toBeCloseTo(0, 5);
    expect(siteFit({ footprint: [0, 0, 0, 400, 22, 400, 22, 0], height: 0 }, box).equals(new THREE.Matrix4())).toBe(true);
  });

  it('pièces gothiques : arc brisé, rose, pinacle, arc-boutant', () => {
    const l = lancet({ width: 3, height: 9, sill: 1 });
    expect(l.glass.triangleCount).toBeGreaterThan(6);
    expect(l.frame.triangleCount).toBeGreaterThan(20);
    let top = -Infinity, bottom = Infinity;
    for (let i = 1; i < l.glass.pos.length; i += 3) { top = Math.max(top, l.glass.pos[i]); bottom = Math.min(bottom, l.glass.pos[i]); }
    expect(top).toBeCloseTo(10, 3);
    expect(bottom).toBeCloseTo(1, 3);
    for (let i = 0; i < l.glass.uv.length; i++) { expect(l.glass.uv[i]).toBeGreaterThanOrEqual(-1e-6); expect(l.glass.uv[i]).toBeLessThanOrEqual(1 + 1e-6); }
    const r = roseWindow(5, { seg: 24 });
    expect(r.glass.triangleCount).toBe(24);
    expect(r.frame.triangleCount).toBe(24 * 6);
    const p = pinnacle(1, 6);
    let py = 0;
    for (let i = 1; i < p.pos.length; i += 3) py = Math.max(py, p.pos[i]);
    expect(py).toBeGreaterThan(5.5);
    expect(py).toBeLessThanOrEqual(6.01);
    // arc-boutant : du pied (0, 0) à la tête (portée, flèche), chaperon au-dessus de l'intrados partout
    const f = flyingButtress(12, 7, 0.9);
    let maxX = 0, maxY = 0;
    for (let i = 0; i < f.pos.length; i += 3) { maxX = Math.max(maxX, f.pos[i]); maxY = Math.max(maxY, f.pos[i + 1]); expect(Math.abs(f.pos[i + 2])).toBeLessThanOrEqual(0.451); }
    expect(maxX).toBeCloseTo(12, 5);
    expect(maxY).toBeGreaterThan(7.5);
    expect(f.triangleCount).toBeGreaterThan(20);
  });

  it('atlas de travées : rangées sans recouvrement, murs à nombre entier de travées', () => {
    const atlas = gothicAtlas('test_atlas_edifices', 0xdddddd, [
      { id: 'a', kind: 'baie', w: 6, h: 10, win: { w: 3, h: 7, sill: 1 } },
      { id: 'b', kind: 'rois', w: 6, h: 3, count: 4 },
      { id: 'c', kind: 'portail', w: 5, h: 9 },
    ]);
    const rows = Object.values(atlas.rows);
    expect(rows.length).toBe(3);
    for (let i = 0; i < rows.length; i++) {
      expect(rows[i].v0).toBeGreaterThanOrEqual(0);
      expect(rows[i].v1).toBeLessThanOrEqual(1);
      expect(rows[i].v1).toBeGreaterThan(rows[i].v0);
      if (i > 0) expect(rows[i].v0).toBeGreaterThan(rows[i - 1].v1);
    }
    const g = rowWall(atlas, 'a', 0, 0, 24.5, 0, 0, 10);
    expect(g.triangleCount).toBe(2);
    expect(Math.max(...g.uv.filter((_, i) => i % 2 === 0))).toBe(4);
    expect(() => rowWall(atlas, 'inconnue', 0, 0, 1, 0, 0, 1)).toThrow();
  });
});
