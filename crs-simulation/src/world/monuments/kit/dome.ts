/* Kit monuments — dômes nervurés, lanternons, flèches. */
import * as THREE from 'three';
import { Builder } from './builder';
import { Geo } from './geo';
import { box, cyl, lathe, sphere } from './shapes';
import type { MatRef } from './materials';

export interface LanternOpts {
  radius: number;
  height: number;
  mat: MatRef;
  /** Matériau de la calotte et de la pointe (dorure, plomb). Par défaut `mat`. */
  matRoof?: MatRef;
  /** Nombre de baies (colonnettes) autour. */
  bays?: number;
  /** Épi de faîtage : 'pointe', 'boule', 'croix'. */
  finial?: 'pointe' | 'boule' | 'croix';
}

/** Lanternon : socle, colonnettes autour d'un noyau ajouré, corniche, calotte, épi. Base sur y = 0. Retourne la hauteur totale. */
export function lantern(b: Builder, o: LanternOpts): number {
  const r = o.radius, h = o.height, bays = o.bays ?? 8;
  const roof = o.matRoof ?? o.mat;
  const g = new Geo();
  g.append(cyl(r * 1.08, r * 1.08, h * 0.1, 12));
  g.append(cyl(r * 0.62, r * 0.62, h * 0.5, 10, { top: false }).translate(0, h * 0.1, 0));
  for (let i = 0; i < bays; i++) {
    const a = (i / bays) * Math.PI * 2;
    g.append(cyl(r * 0.1, r * 0.1, h * 0.5, 5, { top: false }).translate(Math.sin(a) * r * 0.92, h * 0.1, Math.cos(a) * r * 0.92));
  }
  g.append(lathe([r * 1.0, h * 0.6, r * 1.14, h * 0.63, r * 1.14, h * 0.68, r * 0.95, h * 0.68], 12));
  b.add(o.mat, g);
  const top = new Geo();
  const cap: number[] = [];
  for (let k = 0; k <= 5; k++) { const t = (k / 5) * Math.PI / 2; cap.push(r * 0.95 * Math.cos(t), h * 0.68 + h * 0.2 * Math.sin(t)); }
  top.append(lathe(cap, 12, { smooth: true }));
  const fy = h * 0.88;
  const finial = o.finial ?? 'pointe';
  top.append(cyl(r * 0.07, r * 0.02, h * 0.12, 5).translate(0, fy, 0));
  if (finial !== 'pointe') top.append(sphere(r * 0.14, 8, 5).translate(0, fy + h * 0.04, 0));
  if (finial === 'croix') {
    top.append(box(r * 0.05, h * 0.2, r * 0.05).translate(0, fy + h * 0.06, 0));
    top.append(box(r * 0.3, r * 0.05, r * 0.05).translate(0, fy + h * 0.18, 0));
  }
  b.add(roof, top);
  return finial === 'croix' ? fy + h * 0.26 : h;
}

export interface DomeOpts {
  radius: number;
  /** Hauteur de la calotte (égale au rayon : hémisphère ; plus : dôme surhaussé). */
  height: number;
  mat: MatRef;
  /** Nombre de nervures (0 = dôme lisse) et leur matériau (dorure…). */
  ribs?: number;
  matRibs?: MatRef;
  seg?: number;
  rows?: number;
  /** Exposant de forme : 1 = ellipse ; < 1 = épaules plus pleines (dôme « à l'impériale ») ; > 1 = plus pointu. */
  shape?: number;
  /** Rayon de l'ouverture sommitale laissée pour le lanternon (0 = fermé). */
  oculus?: number;
  lantern?: LanternOpts;
}

/** Profil (r, y) d'une calotte, du bas vers le haut. */
export function domeProfile(radius: number, height: number, rows = 8, shape = 1, oculus = 0): number[] {
  const out: number[] = [];
  const tMax = oculus > 0 ? Math.acos(Math.min(1, oculus / radius)) : Math.PI / 2;
  for (let k = 0; k <= rows; k++) {
    const t = (k / rows) * tMax;
    out.push(radius * Math.pow(Math.cos(t), shape), height * Math.sin(t));
  }
  return out;
}

/** Dôme nervuré, base sur y = 0, avec lanternon facultatif. Retourne l'altitude du sommet. */
export function dome(b: Builder, o: DomeOpts): number {
  const seg = o.seg ?? 24, rows = o.rows ?? 8;
  const oc = o.oculus ?? (o.lantern ? o.lantern.radius * 1.05 : 0);
  const prof = domeProfile(o.radius, o.height, rows, o.shape ?? 1, oc);
  b.add(o.mat, lathe(prof, seg, { smooth: true }));
  const ribs = o.ribs ?? 0;
  if (ribs > 0) {
    const g = new Geo();
    const w = (o.radius * Math.PI * 2) / ribs * 0.16, t = o.radius * 0.035;
    for (let i = 0; i < ribs; i++) {
      const a = (i / ribs) * Math.PI * 2, s = Math.sin(a), c = Math.cos(a);
      for (let k = 0; k < rows; k++) {
        const r0 = prof[2 * k], y0 = prof[2 * k + 1], r1 = prof[2 * k + 2], y1 = prof[2 * k + 3];
        const dl = Math.hypot(r1 - r0, y1 - y0) || 1;
        const nr = (y1 - y0) / dl, ny = -(r1 - r0) / dl;       // normale du profil
        const w0 = w * Math.max(0.35, r0 / o.radius), w1 = w * Math.max(0.35, r1 / o.radius);
        // quatre coins extérieurs de la nervure (décalés selon la normale), dans le repère tourné
        const p = (r: number, y: number, side: number, ww: number, lift: number): [number, number, number] =>
          [(r + nr * lift) * s + side * ww * c, y + ny * lift, (r + nr * lift) * c - side * ww * s];
        const a0 = p(r0, y0, -1, w0, t), b0 = p(r0, y0, 1, w0, t), b1 = p(r1, y1, 1, w1, t), a1 = p(r1, y1, -1, w1, t);
        const c0 = p(r0, y0, -1, w0, -t), d0 = p(r0, y0, 1, w0, -t), d1 = p(r1, y1, 1, w1, -t), c1 = p(r1, y1, -1, w1, -t);
        g.face(b0[0], b0[1], b0[2], a0[0], a0[1], a0[2], a1[0], a1[1], a1[2], b1[0], b1[1], b1[2]);
        g.face(a0[0], a0[1], a0[2], c0[0], c0[1], c0[2], c1[0], c1[1], c1[2], a1[0], a1[1], a1[2]);
        g.face(d0[0], d0[1], d0[2], b0[0], b0[1], b0[2], b1[0], b1[1], b1[2], d1[0], d1[1], d1[2]);
      }
    }
    b.add(o.matRibs ?? o.mat, g);
  }
  const topY = prof[prof.length - 1];
  if (o.lantern) {
    b.push(new THREE.Matrix4().makeTranslation(0, topY, 0));
    const lh = lantern(b, o.lantern);
    b.pop();
    return topY + lh;
  }
  return topY;
}

export interface SpireOpts {
  radius: number;
  height: number;
  /** Nombre de pans (8 par défaut). */
  sides?: number;
  mat: MatRef;
  /** Épi : 'pointe', 'boule', 'croix', et son matériau. */
  finial?: 'pointe' | 'boule' | 'croix';
  matFinial?: MatRef;
}

/** Flèche à pans (pyramide élancée) avec épi de faîtage. Base sur y = 0. Retourne l'altitude du sommet. */
export function spire(b: Builder, o: SpireOpts): number {
  const sides = o.sides ?? 8;
  const g = new Geo();
  g.append(cyl(o.radius * 1.06, o.radius, o.height * 0.03, sides, { flat: true, top: false }));
  g.append(cyl(o.radius, o.radius * 0.02, o.height * 0.97, sides, { flat: true, top: false }).translate(0, o.height * 0.03, 0));
  b.add(o.mat, g);
  const finial = o.finial ?? 'pointe';
  if (finial === 'pointe') return o.height;
  const f = new Geo();
  const r = Math.max(0.12, o.radius * 0.12);
  f.append(sphere(r, 8, 5).translate(0, o.height, 0));
  let top = o.height + r;
  if (finial === 'croix') {
    f.append(box(r * 0.4, r * 6, r * 0.4).translate(0, o.height + r * 0.6, 0));
    f.append(box(r * 3.4, r * 0.4, r * 0.4).translate(0, o.height + r * 4.4, 0));
    top = o.height + r * 6.6;
  }
  b.add(o.matFinial ?? o.mat, f);
  return top;
}
