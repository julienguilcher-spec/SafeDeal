/* Kit monuments — statuaire stylisée en basse définition mais lisible : personnages articulés (drapés,
 * ailés, coiffés, portant des attributs), chevaux, quadrige, lion, oiseaux, groupes en haut-relief. */
import * as THREE from 'three';
import { Builder } from './builder';
import { Geo } from './geo';
import { box, cyl, lathe, sphere, tube } from './shapes';
import { rngOf } from './canvas';
import type { MatRef } from './materials';

/** Direction d'un membre : `e` = élévation depuis la verticale basse (0 = pend, π/2 = horizontal, π = dressé) ;
 * `a` = azimut du plan d'élévation (0 = vers l'avant +z, π/2 = sur le côté, π = vers l'arrière).
 * `e2`/`a2` : même chose pour l'avant-bras ou le tibia (par défaut dans le prolongement). */
export interface Limb { e: number; a?: number; e2?: number; a2?: number }

export type Attribute =
  | 'epee' | 'torche' | 'rameau' | 'lance' | 'drapeau' | 'couronne' | 'tablette' | 'chaine' | 'trompette' | 'bouclier' | 'globe';

export type Headgear = 'aucun' | 'phrygien' | 'casque' | 'couronne' | 'bicorne';

export interface FigureOpts {
  /** Taille debout (m). */
  height?: number;
  /** 0 = très léger (groupes, lointains), 1 = normal. */
  lod?: 0 | 1;
  /** Inclinaison du buste vers l'avant (rad) et rotation du buste autour de la verticale. */
  lean?: number;
  twist?: number;
  armL?: Limb; armR?: Limb; legL?: Limb; legR?: Limb;
  /** Assis : cuisses à l'horizontale (prévoir un siège de 0,27 × taille). */
  seated?: boolean;
  /** Longue robe drapée (les jambes ne sont pas modélisées). */
  robe?: boolean;
  /** Ailes : envergure relative (1 = normale) ; 0 = sans. */
  wings?: number;
  hat?: Headgear;
  itemL?: Attribute; itemR?: Attribute;
  /** Ne pas recaler les pieds sur y = 0 (figure en vol, génie sur une sphère). */
  fly?: boolean;
  /** Échelle des attributs tenus (1 par défaut). */
  itemScale?: number;
}

const V = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);

function dirOf(e: number, a: number, side: number): THREE.Vector3 {
  return V(side * Math.sin(e) * Math.sin(a), -Math.cos(e), Math.sin(e) * Math.cos(a));
}

function limbTube(g: Geo, p: THREE.Vector3, q: THREE.Vector3, r0: number, r1: number, seg: number): void {
  g.append(tube(p.x, p.y, p.z, q.x, q.y, q.z, r0, r1, seg));
}

function attribute(g: Geo, kind: Attribute, hand: THREE.Vector3, f: THREE.Vector3, H: number, seg: number): void {
  const along = (d: number): THREE.Vector3 => hand.clone().addScaledVector(f, d);
  if (kind === 'epee') {
    const t = along(0.46 * H), s = along(-0.04 * H);
    g.append(tube(s.x, s.y, s.z, t.x, t.y, t.z, 0.014 * H, 0.004 * H, 4, true));
    const c = along(0.04 * H);
    g.append(box(0.1 * H, 0.012 * H, 0.02 * H, { bottom: true }).translate(c.x, c.y, c.z));
  } else if (kind === 'lance' || kind === 'drapeau') {
    g.append(tube(hand.x, hand.y - 0.55 * H, hand.z, hand.x, hand.y + 0.75 * H, hand.z, 0.011 * H, 0.011 * H, 4, true));
    if (kind === 'drapeau') {
      const y0 = hand.y + 0.4 * H, y1 = hand.y + 0.72 * H, w = 0.42 * H;
      g.face(hand.x, y0, hand.z, hand.x - w, y0 - 0.06 * H, hand.z - 0.05 * H, hand.x - w, y1 - 0.1 * H, hand.z - 0.05 * H, hand.x, y1, hand.z);
      g.face(hand.x - w, y0 - 0.06 * H, hand.z - 0.05 * H, hand.x, y0, hand.z, hand.x, y1, hand.z, hand.x - w, y1 - 0.1 * H, hand.z - 0.05 * H);
    } else g.append(cyl(0.02 * H, 0, 0.08 * H, 4).translate(hand.x, hand.y + 0.75 * H, hand.z));
  } else if (kind === 'torche') {
    const t = along(0.2 * H);
    g.append(tube(hand.x, hand.y, hand.z, t.x, t.y, t.z, 0.012 * H, 0.03 * H, 5));
    g.append(sphere(0.04 * H, 6, 4).scale(1, 1.8, 1).translate(t.x, t.y + 0.05 * H, t.z));
  } else if (kind === 'rameau') {
    const t = along(0.3 * H);
    g.append(tube(hand.x, hand.y, hand.z, t.x, t.y, t.z, 0.008 * H, 0.004 * H, 4));
    for (let i = 1; i <= 4; i++) {
      const p = along(0.07 * H * i);
      g.append(sphere(0.028 * H, 4, 3).scale(0.5, 1.4, 0.5).translate(p.x + (i % 2 ? 0.03 : -0.03) * H, p.y, p.z));
    }
  } else if (kind === 'couronne') {
    const r = 0.075 * H;
    g.append(lathe([r * 0.72, -r * 0.14, r, 0, r * 0.72, r * 0.14, r * 0.72, -r * 0.14], 10).rotateX(Math.PI / 2).translate(hand.x, hand.y, hand.z));
  } else if (kind === 'tablette') {
    g.append(box(0.15 * H, 0.22 * H, 0.03 * H, { bottom: true }).translate(hand.x, hand.y - 0.2 * H, hand.z));
  } else if (kind === 'chaine') {
    g.append(tube(hand.x, hand.y, hand.z, hand.x + 0.03 * H, hand.y - 0.18 * H, hand.z, 0.012 * H, 0.012 * H, 4));
  } else if (kind === 'trompette') {
    const t = along(0.42 * H);
    g.append(tube(hand.x, hand.y, hand.z, t.x, t.y, t.z, 0.008 * H, 0.05 * H, seg));
  } else if (kind === 'bouclier') {
    g.append(cyl(0.11 * H, 0.11 * H, 0.03 * H, 10, { bottom: true }).rotateX(Math.PI / 2).translate(hand.x, hand.y + 0.03 * H, hand.z + 0.03 * H));
  } else {
    g.append(sphere(0.07 * H, 8, 5).translate(hand.x, hand.y + 0.05 * H, hand.z));
  }
}

/** Géométries d'un personnage : corps d'une part, attributs (objets tenus, ailes) d'autre part. Pieds sur y = 0, face vers +z. */
export function figureGeo(o: FigureOpts = {}): { body: Geo; items: Geo } {
  const H = o.height ?? 1.8, lod = o.lod ?? 1;
  const seg = lod === 0 ? 4 : 6, tseg = lod === 0 ? 6 : 8;
  const body = new Geo(), items = new Geo();
  const thigh = 0.245 * H, shin = 0.245 * H, footH = 0.035 * H;
  const defLeg: Limb = o.seated ? { e: Math.PI / 2, a: 0, e2: 0 } : { e: 0 };
  const legs: [Limb, number][] = [[o.legL ?? defLeg, 1], [o.legR ?? defLeg, -1]];
  // jambes (repère du bassin), puis hauteur du bassin pour que le pied le plus bas touche le sol
  const hipX = 0.075 * H;
  const legPts = legs.map(([l, side]) => {
    const d1 = dirOf(l.e, l.a ?? 0, side), d2 = dirOf(l.e2 ?? l.e, l.a2 ?? l.a ?? 0, side);
    const hip = V(side * hipX, 0, 0), knee = hip.clone().addScaledVector(d1, thigh), ankle = knee.clone().addScaledVector(d2, shin);
    return { hip, knee, ankle };
  });
  let hipY = 0.525 * H;
  if (!o.fly && !o.robe) hipY = -Math.min(legPts[0].ankle.y, legPts[1].ankle.y) + footH;
  else if (o.seated) hipY = shin + footH;
  if (!o.robe) {
    for (const lp of legPts) {
      const hip = lp.hip.clone().setY(hipY), knee = lp.knee.clone().add(V(0, hipY, 0)), ankle = lp.ankle.clone().add(V(0, hipY, 0));
      limbTube(body, hip, knee, 0.06 * H, 0.043 * H, seg);
      limbTube(body, knee, ankle, 0.043 * H, 0.03 * H, seg);
      body.append(box(0.055 * H, footH, 0.14 * H).translate(ankle.x, ankle.y - footH, ankle.z + 0.035 * H));
    }
  } else if (o.seated) {
    // drapé assis : giron horizontal, puis jupe tombant des genoux
    body.append(box(0.3 * H, 0.14 * H, 0.3 * H).translate(0, hipY - 0.09 * H, 0.11 * H));
    body.append(cyl(0.19 * H, 0.14 * H, hipY - 0.02 * H, 7, { flat: true, top: false }).scale(1, 1, 0.7).translate(0, 0, 0.2 * H));
  } else {
    // robe : tronc de cône à pans (les facettes suggèrent les plis)
    const hr = hipY + 0.09 * H;
    body.append(cyl(0.2 * H, 0.1 * H, hr, 9, { flat: true, top: false }).scale(1, 1, 0.82));
  }
  // buste, tête, bras : construits droits puis inclinés autour du bassin
  const up = new Geo(), upItems = new Geo();
  up.append(lathe([
    0.098 * H, -0.03 * H, 0.104 * H, 0.03 * H, 0.088 * H, 0.10 * H, 0.116 * H, 0.22 * H, 0.128 * H, 0.285 * H,
    0.065 * H, 0.325 * H, 0.036 * H, 0.35 * H,
  ], tseg, { smooth: true }).scale(1, 1, 0.66));
  if (o.robe) up.append(cyl(0.118 * H, 0.134 * H, 0.33 * H, 9, { flat: true, top: false }).scale(1, 1, 0.72).translate(0, -0.05 * H, 0));
  for (const side of [-1, 1]) up.append(sphere(0.046 * H, 5, 3).translate(side * 0.122 * H, 0.283 * H, 0));
  up.append(cyl(0.034 * H, 0.03 * H, 0.05 * H, seg, { top: false }).translate(0, 0.335 * H, 0));
  const headY = 0.415 * H;
  up.append(sphere(0.062 * H, lod === 0 ? 6 : 8, lod === 0 ? 4 : 6).scale(0.88, 1.12, 1).translate(0, headY, 0.008 * H));
  const hat = o.hat ?? 'aucun';
  if (hat === 'phrygien') {
    up.append(sphere(0.068 * H, 6, 4).scale(1, 0.8, 1.05).translate(0, headY + 0.03 * H, 0));
    up.append(sphere(0.036 * H, 5, 3).translate(0, headY + 0.09 * H, 0.045 * H));
  } else if (hat === 'casque') {
    up.append(sphere(0.07 * H, 6, 4).scale(1, 0.85, 1.05).translate(0, headY + 0.022 * H, 0));
    up.append(box(0.014 * H, 0.06 * H, 0.15 * H, { bottom: true }).translate(0, headY + 0.06 * H, -0.01 * H));
  } else if (hat === 'couronne') {
    up.append(cyl(0.066 * H, 0.074 * H, 0.03 * H, 8, { top: false }).translate(0, headY + 0.02 * H, 0));
  } else if (hat === 'bicorne') {
    up.append(box(0.21 * H, 0.05 * H, 0.08 * H, { bottom: true }).translate(0, headY + 0.045 * H, 0));
  }
  const defArm: Limb = { e: 0.16, a: Math.PI / 2, e2: 0.3, a2: 0.3 };
  const arms: [Limb, number, Attribute | undefined][] = [[o.armL ?? defArm, 1, o.itemL], [o.armR ?? defArm, -1, o.itemR]];
  for (const [l, side, item] of arms) {
    const sh = V(side * 0.126 * H, 0.285 * H, 0);
    const d1 = dirOf(l.e, l.a ?? Math.PI / 2, side), d2 = dirOf(l.e2 ?? l.e, l.a2 ?? l.a ?? Math.PI / 2, side);
    const el = sh.clone().addScaledVector(d1, 0.17 * H), wr = el.clone().addScaledVector(d2, 0.16 * H);
    limbTube(up, sh, el, 0.038 * H, 0.031 * H, seg);
    limbTube(up, el, wr, 0.031 * H, 0.024 * H, seg);
    const hand = wr.clone().addScaledVector(d2, 0.025 * H);
    up.append(sphere(0.03 * H, 5, 3).translate(hand.x, hand.y, hand.z));
    if (item) attribute(upItems, item, hand, d2, H * (o.itemScale ?? 1), seg);
  }
  const wings = o.wings ?? 0;
  if (wings > 0) {
    // ailes dressées : bord d'attaque montant vers la pointe, rémiges retombant en arrière (deux faces)
    const k = wings;
    for (const s of [-1, 1]) {
      const P = (x: number, y: number, z: number): THREE.Vector3 => V(s * (0.03 + x * k) * H, (0.2 + y * k) * H, z * H);
      const lead = [P(0, 0.10, -0.07), P(0.15, 0.33, -0.13), P(0.28, 0.52, -0.2), P(0.4, 0.6, -0.26), P(0.5, 0.5, -0.31)];
      const trail = [P(0, -0.1, -0.07), P(0.09, -0.04, -0.1), P(0.2, 0.04, -0.15), P(0.33, 0.16, -0.22), P(0.5, 0.5, -0.31)];
      for (let i = 0; i < lead.length - 1; i++) {
        const a = lead[i], c = lead[i + 1], d = trail[i + 1], e = trail[i];
        upItems.face(e.x, e.y, e.z, d.x, d.y, d.z, c.x, c.y, c.z, a.x, a.y, a.z);
        upItems.face(d.x, d.y, d.z, e.x, e.y, e.z, a.x, a.y, a.z, c.x, c.y, c.z);
      }
    }
  }
  const m = new THREE.Matrix4().makeTranslation(0, hipY, 0)
    .multiply(new THREE.Matrix4().makeRotationX(o.lean ?? 0))
    .multiply(new THREE.Matrix4().makeRotationY(o.twist ?? 0));
  body.append(up, m);
  items.append(upItems, m);
  return { body, items };
}

/** Ajoute un personnage ; `matItems` reçoit attributs et ailes (par défaut le même matériau). */
export function figure(b: Builder, mat: MatRef, o: FigureOpts = {}, matItems?: MatRef): void {
  const { body, items } = figureGeo(o);
  b.add(mat, body);
  if (items.triangleCount > 0) b.add(matItems ?? mat, items);
}

export interface HorseOpts {
  /** 1 = cheval de 1,6 m au garrot. */
  scale?: number;
  /** Cabré : angle de redressement (rad). */
  rear?: number;
  /** Phase de l'allure 0..1 (décale les jambes). */
  gait?: number;
  lod?: 0 | 1;
}

/** Cheval stylisé, face vers +z, sabots sur y = 0. */
export function horseGeo(o: HorseOpts = {}): Geo {
  const s = o.scale ?? 1, rear = o.rear ?? 0, seg = (o.lod ?? 1) === 0 ? 4 : 6;
  const ph = (o.gait ?? 0) * Math.PI * 2;
  const front = new Geo(), g = new Geo();
  // avant-main, tronc, encolure, tête : dans le repère du corps (pivot = croupe)
  const sw = seg === 4 ? 6 : 8, sh = seg === 4 ? 4 : 5;
  front.append(sphere(1, sw, sh).scale(0.3, 0.34, 0.74).translate(0, 1.25, -0.02));
  front.append(sphere(1, sw, sh).scale(0.31, 0.4, 0.36).translate(0, 1.27, 0.46));          // poitrail
  front.append(sphere(1, sw, sh).scale(0.33, 0.4, 0.4).translate(0, 1.3, -0.5));            // croupe
  front.append(tube(0, 1.38, 0.62, 0, 1.78, 0.92, 0.25, 0.17, seg));                         // encolure (bas)
  front.append(tube(0, 1.78, 0.92, 0, 2.1, 1.02, 0.17, 0.12, seg));                          // encolure (haut)
  front.append(tube(0, 2.14, 0.98, 0, 1.9, 1.3, 0.125, 0.085, seg));                         // chanfrein
  front.append(tube(0, 1.9, 1.3, 0, 1.74, 1.44, 0.085, 0.06, seg, true));                    // bout du nez
  front.append(box(0.045, 0.62, 0.09).rotateX(0.5).translate(0, 1.55, 0.6));                 // crinière
  front.append(tube(0, 1.52, -0.82, 0, 1.2, -1.02, 0.07, 0.06, seg));
  front.append(tube(0, 1.2, -1.02, 0, 0.62, -1.02, 0.07, 0.025, seg));                       // queue
  for (const side of [-1, 1]) {
    front.append(cyl(0.035, 0.0, 0.12, 4).translate(side * 0.07, 2.2, 0.98));
    const sw = Math.sin(ph + (side > 0 ? 0 : Math.PI)) * 0.45 + rear * 1.1;
    const kx = side * 0.19, ky = 1.12 - Math.cos(sw) * 0.52, kz = 0.52 + Math.sin(sw) * 0.52;
    const bend = rear > 0.1 ? 1.5 : Math.max(0, -Math.sin(ph + (side > 0 ? 0 : Math.PI))) * 0.7;
    front.append(tube(kx, 1.12, 0.52, kx, ky, kz, 0.12, 0.07, seg));
    front.append(tube(kx, ky, kz, kx, ky - Math.cos(sw - bend) * 0.56, kz + Math.sin(sw - bend) * 0.56, 0.065, 0.05, seg, true));
  }
  const pivot = new THREE.Matrix4().makeTranslation(0, 1.12, -0.6)
    .multiply(new THREE.Matrix4().makeRotationX(-rear))
    .multiply(new THREE.Matrix4().makeTranslation(0, -1.12, 0.6));
  g.append(front, pivot);
  // arrière-main : posé au sol
  for (const side of [-1, 1]) {
    const sw = rear > 0.1 ? 0.25 : Math.sin(ph + (side > 0 ? Math.PI : 0)) * 0.4;
    const x = side * 0.19;
    const hy = 0.62, hz = -0.62 + Math.sin(sw) * 0.4 - 0.12;
    g.append(tube(x, 1.2, -0.56, x, hy, hz, 0.16, 0.075, seg));
    g.append(tube(x, hy, hz, x, 0, hz + 0.14, 0.068, 0.052, seg, true));
  }
  if (rear <= 0.1) {
    // recale les sabots avant au sol (allure)
    let minY = Infinity;
    for (let i = 1; i < g.pos.length; i += 3) if (g.pos[i] < minY) minY = g.pos[i];
    g.translate(0, -minY, 0);
  }
  return s === 1 ? g : g.scale(s, s, s);
}

export function horse(b: Builder, mat: MatRef, o: HorseOpts = {}): void {
  b.add(mat, horseGeo(o));
}

export interface QuadrigaOpts {
  /** 1 = grandeur nature ; les quadriges monumentaux font 2 à 3. */
  scale?: number;
  driver?: FigureOpts;
  lod?: 0 | 1;
}

/** Quadrige : quatre chevaux de front, char, aurige debout. Face vers +z, centré, posé sur y = 0. */
export function quadriga(b: Builder, mat: MatRef, o: QuadrigaOpts = {}, matItems?: MatRef): void {
  const s = o.scale ?? 1, lod = o.lod ?? 1;
  const g = new Geo();
  for (let i = 0; i < 4; i++) {
    const outer = i === 0 || i === 3;
    g.append(horseGeo({ rear: outer ? 0.5 : 0.18, gait: i * 0.23, lod }).translate((i - 1.5) * 0.95, 0, 1.5).rotateY((i - 1.5) * 0.09));
  }
  // char : caisse en demi-cylindre, plancher, roues, timon
  g.append(cyl(0.85, 0.85, 0.95, 10, { start: -Math.PI / 2, sweep: Math.PI, top: false }).translate(0, 0.75, -1.25));
  g.append(box(1.7, 0.1, 1.0, { bottom: true }).translate(0, 0.7, -1.3));
  for (const side of [-1, 1]) g.append(cyl(0.72, 0.72, 0.1, 12, { bottom: true }).rotateZ(Math.PI / 2).translate(side * 1.0 + 0.05, 0.72, -1.3));
  g.append(tube(0, 0.8, -0.6, 0, 1.15, 1.5, 0.05, 0.05, 4));
  b.add(mat, s === 1 ? g : g.scale(s, s, s));
  const d = figureGeo({ height: 1.95, lod, robe: true, armR: { e: 2.5, a: 0.4 }, armL: { e: 1.2, a: 0.2, e2: 1.5, a2: 0 }, itemR: 'couronne', ...o.driver });
  const dm = new THREE.Matrix4().makeScale(s, s, s).multiply(new THREE.Matrix4().makeTranslation(0, 0.8, -1.25));
  b.add(mat, d.body, dm);
  if (d.items.triangleCount > 0) b.add(matItems ?? mat, d.items, dm);
}

/** Lion stylisé : 'debout' ou 'couche'. Face vers +z, posé sur y = 0. scale 1 ≈ 1 m au garrot. */
export function lionGeo(pose: 'debout' | 'couche' = 'debout', scale = 1, lod: 0 | 1 = 1): Geo {
  const g = new Geo(), seg = lod === 0 ? 4 : 6;
  const by = pose === 'debout' ? 0.86 : 0.42;
  g.append(sphere(1, 8, 5).scale(0.3, 0.33, 0.8).translate(0, by, -0.05));           // tronc
  g.append(sphere(1, 7, 5).scale(0.33, 0.4, 0.38).translate(0, by + 0.06, 0.48));     // poitrail
  g.append(sphere(1, 8, 5).scale(0.36, 0.42, 0.34).translate(0, by + 0.3, 0.76));     // crinière
  g.append(sphere(0.23, 7, 5).translate(0, by + 0.42, 1.04));                          // tête
  g.append(box(0.2, 0.17, 0.24, { bottom: true }).translate(0, by + 0.26, 1.2));       // museau
  for (const side of [-1, 1]) g.append(cyl(0.05, 0.0, 0.09, 4).translate(side * 0.13, by + 0.62, 0.98));
  if (pose === 'debout') {
    for (const side of [-1, 1]) {
      g.append(tube(side * 0.2, by, 0.5, side * 0.2, 0.08, 0.56, 0.14, 0.09, seg));
      g.append(tube(side * 0.2, by + 0.05, -0.62, side * 0.2, 0.42, -0.78, 0.17, 0.09, seg));
      g.append(tube(side * 0.2, 0.42, -0.78, side * 0.2, 0.08, -0.68, 0.09, 0.08, seg));
      g.append(sphere(0.12, 5, 3).scale(1, 0.6, 1.3).translate(side * 0.2, 0.07, 0.62));
      g.append(sphere(0.12, 5, 3).scale(1, 0.6, 1.3).translate(side * 0.2, 0.07, -0.62));
    }
    g.append(tube(0, by + 0.12, -0.82, 0.1, 0.5, -1.15, 0.05, 0.035, 4));
    g.append(tube(0.1, 0.5, -1.15, 0.16, 0.34, -1.3, 0.035, 0.03, 4));
    g.append(sphere(0.07, 5, 3).translate(0.16, 0.32, -1.32));
  } else {
    for (const side of [-1, 1]) {
      g.append(tube(side * 0.24, 0.16, 0.5, side * 0.24, 0.12, 1.4, 0.12, 0.1, seg, true));
      g.append(sphere(0.3, 6, 4).scale(0.7, 0.9, 1.2).translate(side * 0.34, 0.28, -0.5));
    }
    g.append(tube(0, 0.3, -0.84, 0.5, 0.08, -1.0, 0.05, 0.03, 4));
  }
  return scale === 1 ? g : g.scale(scale, scale, scale);
}

/** Oiseau héraldique : 'aigle' (ailes éployées) ou 'coq'. Face vers +z, posé sur y = 0. scale 1 ≈ 1 m de haut. */
export function birdGeo(kind: 'aigle' | 'coq' = 'aigle', scale = 1): Geo {
  const g = new Geo();
  g.append(sphere(1, 6, 4).scale(0.2, 0.3, 0.26).translate(0, 0.5, 0));
  g.append(sphere(0.11, 6, 4).translate(0, 0.86, 0.1));
  g.append(tube(0, 0.86, 0.18, 0, 0.82, 0.32, 0.04, 0.0, 4));
  for (const side of [-1, 1]) g.append(tube(side * 0.08, 0.28, 0, side * 0.09, 0, 0.04, 0.035, 0.03, 4));
  if (kind === 'aigle') {
    for (const side of [-1, 1]) {
      const r = V(side * 0.14, 0.62, -0.02);
      const pts = [V(side * 0.42, 1.0, -0.08), V(side * 0.78, 0.86, -0.1), V(side * 0.7, 0.5, -0.1), V(side * 0.4, 0.3, -0.06)];
      for (let i = 0; i < pts.length - 1; i++) {
        g.face3(r.x, r.y, r.z, pts[i].x, pts[i].y, pts[i].z, pts[i + 1].x, pts[i + 1].y, pts[i + 1].z);
        g.face3(r.x, r.y, r.z, pts[i + 1].x, pts[i + 1].y, pts[i + 1].z, pts[i].x, pts[i].y, pts[i].z);
      }
    }
    g.append(box(0.26, 0.04, 0.3, { bottom: true }).translate(0, 0.26, -0.3));
  } else {
    g.append(box(0.03, 0.12, 0.14, { bottom: true }).translate(0, 0.94, 0.08));
    for (let i = 0; i < 3; i++) g.append(tube(0, 0.6, -0.2, 0, 0.9 + i * 0.12, -0.42 - i * 0.06, 0.05, 0.015, 4));
  }
  return scale === 1 ? g : g.scale(scale, scale, scale);
}

export interface SculptedGroupOpts {
  width: number;
  height: number;
  /** Saillie du groupe devant le mur (le dos est dans le plan z = 0). */
  depth: number;
  seed?: number;
  /** Figure allégorique ailée dominant le groupe. */
  winged?: boolean;
  /** Nombre de personnages du rang inférieur. */
  count?: number;
}

/** Groupe en haut-relief adossé (dos en z = 0, saillie vers +z, base sur y = 0) : rang de combattants et allégorie ailée. */
export function sculptedGroup(b: Builder, mat: MatRef, o: SculptedGroupOpts): void {
  const rnd = rngOf(o.seed ?? 1);
  const g = new Geo();
  const n = o.count ?? 4, fh = o.height * (o.winged === false ? 0.82 : 0.56);
  const items: Attribute[] = ['epee', 'bouclier', 'lance', 'epee', 'drapeau', 'trompette'];
  g.append(box(o.width, o.height * 0.05, o.depth).translate(0, 0, o.depth / 2));
  // masse rocheuse du fond pour lier les figures
  g.append(sphere(1, 7, 4).scale(o.width * 0.42, o.height * 0.36, o.depth * 0.45).translate(0, o.height * 0.3, o.depth * 0.25));
  for (let i = 0; i < n; i++) {
    const x = ((i + 0.5) / n - 0.5) * o.width * 0.86;
    const h = fh * (0.86 + rnd() * 0.2);
    const f = figureGeo({
      height: h, lod: 0, lean: (rnd() - 0.3) * 0.35, twist: (rnd() - 0.5) * 0.9,
      armR: { e: 1.2 + rnd() * 1.6, a: rnd() * 1.2 }, armL: { e: 0.4 + rnd() * 1.2, a: 0.3 + rnd(), e2: 1.2 + rnd(), a2: 0.2 },
      legL: { e: 0.25 + rnd() * 0.3, a: 0, e2: 0 }, legR: { e: 0.3, a: Math.PI, e2: 0.15, a2: Math.PI },
      itemR: items[Math.floor(rnd() * items.length)], itemL: rnd() < 0.25 ? 'bouclier' : undefined,
      hat: rnd() < 0.5 ? 'casque' : 'aucun', robe: rnd() < 0.2,
    });
    const z = o.depth * (0.45 + rnd() * 0.4);
    g.append(f.body.translate(x, o.height * 0.05, z)).append(f.items.translate(x, o.height * 0.05, z));
  }
  if (o.winged !== false) {
    const f = figureGeo({
      height: o.height * 0.5, lod: 1, lean: 0.55, wings: 1.25, fly: true, robe: true, hat: 'casque',
      armR: { e: 2.3, a: 0.5 }, armL: { e: 1.7, a: 1.2 }, itemR: 'epee',
    });
    g.append(f.body.translate(0, o.height * 0.5, o.depth * 0.42)).append(f.items.translate(0, o.height * 0.5, o.depth * 0.42));
  }
  // haut-relief : rien ne déborde du gabarit (les lances et les ailes s'écrasent contre le fond)
  g.clampAxis(2, 0, o.depth * 1.2).clampAxis(0, -o.width * 0.56, o.width * 0.56).clampAxis(1, 0, o.height);
  b.add(mat, g);
}
