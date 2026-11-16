/* Kit monuments — vocabulaire classique : profils de moulures, entablement et corniche extrudés le long
 * d'une polyligne, fronton, socle, emmarchement, escalier, balustrade, grille, répétition le long d'un tracé. */
import { Builder } from './builder';
import { Geo, pose } from './geo';
import { beam, box, lathe, polygon, sweep, type SweepOpts } from './shapes';
import { tileOf, type MatRef } from './materials';
import { insetRing } from '../shape2d';

// ───────────────────────────── profils (saillie, altitude), de bas en haut ─────────────────────────────

/** Bandeau plat saillant. */
export function bandProfile(y0: number, h: number, p: number): number[] {
  return [0, y0, p, y0, p, y0 + h, 0, y0 + h];
}

/** Corniche : talon, soffite, larmier, cimaise. `simple` réduit le nombre de facettes (silhouettes, basse qualité). */
export function corniceProfile(y0: number, h: number, p: number, simple = false): number[] {
  if (simple) return [0, y0, p * 0.3, y0 + h * 0.4, p, y0 + h * 0.5, p, y0 + h, 0, y0 + h];
  return [
    0, y0, p * 0.14, y0, p * 0.14, y0 + h * 0.16, p * 0.36, y0 + h * 0.40, p * 0.36, y0 + h * 0.46,
    p * 0.90, y0 + h * 0.46, p * 0.90, y0 + h * 0.74, p, y0 + h * 0.82, p, y0 + h, 0, y0 + h,
  ];
}

/** Entablement complet : architrave à deux fasces, frise nue, corniche. */
export function entablatureProfile(y0: number, h: number, p: number, simple = false): number[] {
  const a = h * 0.30, f = h * 0.32, c = h - a - f;
  const out = [0, y0, p * 0.04, y0, p * 0.04, y0 + a * 0.45, p * 0.09, y0 + a * 0.45, p * 0.09, y0 + a * 0.85, p * 0.16, y0 + a * 0.85, p * 0.16, y0 + a, p * 0.05, y0 + a, p * 0.05, y0 + a + f];
  const cor = corniceProfile(y0 + a + f, c, p, simple);
  cor[0] = p * 0.05;
  return out.concat(cor);
}

/** Socle / plinthe : pied saillant, chanfrein. */
export function plinthProfile(y0: number, h: number, p: number): number[] {
  return [p, y0, p, y0 + h * 0.7, p * 0.35, y0 + h, 0, y0 + h];
}

/** Profil complet d'un piédestal (par rapport au nu du dé) : plinthe, base moulurée, dé, corniche. */
export function pedestalProfile(H: number, p: number, baseH: number, capH: number): number[] {
  return [
    p, 0, p, baseH * 0.55, p * 0.55, baseH * 0.62, p * 0.55, baseH * 0.8, p * 0.15, baseH, 0, baseH,
    0, H - capH, p * 0.3, H - capH * 0.75, p * 0.3, H - capH * 0.6, p * 0.95, H - capH * 0.42, p, H - capH * 0.3, p, H,
  ];
}

// ───────────────────────────── extrusions le long d'une emprise ─────────────────────────────

export interface RunOpts extends SweepOpts { mat: MatRef }

/** Entablement (ou corniche seule) le long d'une polyligne / emprise. */
export function entablature(b: Builder, path: ArrayLike<number>, y: number, height: number, projection: number, o: RunOpts & { corniceOnly?: boolean; simple?: boolean }): void {
  const prof = o.corniceOnly ? corniceProfile(y, height, projection, o.simple) : entablatureProfile(y, height, projection, o.simple);
  b.add(o.mat, sweep(prof, path, o));
}

/** Bandeau / cordon le long d'une emprise. */
export function band(b: Builder, path: ArrayLike<number>, y: number, height: number, projection: number, o: RunOpts): void {
  b.add(o.mat, sweep(bandProfile(y, height, projection), path, o));
}

/** Plinthe le long d'une emprise. */
export function plinth(b: Builder, path: ArrayLike<number>, y: number, height: number, projection: number, o: RunOpts): void {
  b.add(o.mat, sweep(plinthProfile(y, height, projection), path, o));
}

/** Ruban vertical le long d'une polyligne (plans à découpe alpha : balustres, grilles). v = 0..vTop ; u en mètres. */
export function ribbon(path: ArrayLike<number>, y0: number, y1: number, closed = false, vTop = 1): Geo {
  const g = new Geo();
  const n = path.length >> 1;
  const segs = closed ? n : n - 1;
  let u = 0;
  for (let i = 0; i < segs; i++) {
    const j = (i + 1) % n;
    const ax = path[2 * i], az = path[2 * i + 1], bx = path[2 * j], bz = path[2 * j + 1];
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 1e-6) continue;
    g.face(ax, y0, az, bx, y0, bz, bx, y1, bz, ax, y1, az, u, 0, { u1: u + len, v1: vTop });
    u += len;
  }
  return g;
}

/** Surface réglée entre deux anneaux de même nombre de sommets (versants de toit, talus). UV en mètres, sans cisaillement. */
export function loft(ringA: ArrayLike<number>, yA: number, ringB: ArrayLike<number>, yB: number): Geo {
  const g = new Geo();
  const n = Math.min(ringA.length, ringB.length) >> 1;
  let u = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ax = ringA[2 * i], az = ringA[2 * i + 1], bx = ringA[2 * j], bz = ringA[2 * j + 1];
    const cx = ringB[2 * j], cz = ringB[2 * j + 1], dx = ringB[2 * i], dz = ringB[2 * i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 1e-6) continue;
    // abscisses des sommets hauts projetées sur le côté bas : le motif reste droit sur un trapèze
    const ex = (bx - ax) / len, ez = (bz - az) / len;
    const ud = (dx - ax) * ex + (dz - az) * ez, uc = (cx - ax) * ex + (cz - az) * ez;
    const perp = Math.abs((dx - ax) * ez - (dz - az) * ex);
    const v1 = Math.hypot(yB - yA, perp);
    g.faceUv(ax, yA, az, bx, yA, bz, cx, yB, cz, dx, yB, dz, u, 0, u + len, 0, u + uc, v1, u + ud, v1);
    u += len;
  }
  return g;
}

/**
 * Appelle `fn` à intervalles réguliers le long d'une polyligne : (x, z, cap de la normale sortante, index).
 * `spacing` est ajusté par côté pour tomber juste ; `inset` éloigne des sommets. Retourne le nombre de poses.
 */
export function alongPath(path: ArrayLike<number>, spacing: number, closed: boolean, fn: (x: number, z: number, heading: number, i: number) => void, inset = 0): number {
  const n = path.length >> 1;
  const segs = closed ? n : n - 1;
  let count = 0;
  for (let i = 0; i < segs; i++) {
    const j = (i + 1) % n;
    const ax = path[2 * i], az = path[2 * i + 1], bx = path[2 * j], bz = path[2 * j + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const usable = len - 2 * inset;
    if (usable <= 0) continue;
    const k = Math.max(1, Math.round(usable / spacing));
    const heading = Math.atan2(-(bz - az), bx - ax);
    for (let s = 0; s < k; s++) {
      const t = (inset + ((s + 0.5) / k) * usable) / len;
      fn(ax + (bx - ax) * t, az + (bz - az) * t, heading, count++);
    }
  }
  return count;
}

// ───────────────────────────── fronton, socle, escaliers ─────────────────────────────

export interface PedimentOpts {
  width: number;
  /** Hauteur du triangle. */
  rise: number;
  /** Saillie des corniches par rapport au tympan. */
  depth: number;
  mat: MatRef;
  /** Matériau du tympan (bas-relief par exemple) ; par défaut `mat`. */
  matTympan?: MatRef;
  /** Épaisseur des corniches. */
  cornice?: number;
  /** Ajoute la corniche horizontale de base. */
  baseCornice?: boolean;
}

/** Fronton triangulaire, base sur y = 0, tympan dans le plan z = 0, corniches en saillie vers +z. */
export function pediment(b: Builder, o: PedimentOpts): void {
  const c = o.cornice ?? Math.max(0.25, o.rise * 0.14), hw = o.width / 2, ov = c * 0.8;
  const tymp = new Geo();
  const [tw, th] = tileOf(o.matTympan ?? o.mat);
  const fit = o.matTympan !== undefined;
  // tympan : triangle, UV centrées (un bas-relief occupe toute la largeur)
  tymp.face3(-hw, 0, 0, hw, 0, 0, 0, o.rise, 0,
    0, 0, fit ? tw * (o.width / (4 * o.rise)) : o.width, 0, fit ? tw * (o.width / (8 * o.rise)) : hw, fit ? th : o.rise);
  b.add(o.matTympan ?? o.mat, tymp);
  // corniche horizontale (facultative : un entablement en tient souvent lieu)
  if (o.baseCornice) b.add(o.mat, box(o.width + 2 * ov, c * 0.5, o.depth, { bottom: true }).translate(0, 0, o.depth / 2));
  // rampants : deux poutres posées sur les pentes, prolongées pour se rejoindre au faîte
  const len = Math.hypot(hw, o.rise);
  const dx = hw / len, dy = o.rise / len, nx = -o.rise / len, ny = hw / len;
  const sx = -hw - dx * ov + (nx * c) / 2, sy = -dy * ov + (ny * c) / 2;
  const ext = (o.rise * c) / hw;
  const ex = (nx * c) / 2 + dx * ext, ey = o.rise + (ny * c) / 2 + dy * ext;
  for (const s of [-1, 1]) b.add(o.mat, beam(s * sx, sy, o.depth / 2, s * ex, ey, o.depth / 2, c, o.depth, true));
}

export interface PedestalOpts {
  width: number; depth: number; height: number; mat: MatRef;
  /** Saillie de la plinthe et de la corniche. */
  projection?: number;
  baseH?: number; capH?: number;
  /** Matériau du dé (panneaux de bronze, inscriptions) ; par défaut `mat`. */
  matDie?: MatRef;
}

/** Piédestal rectangulaire mouluré (plinthe, dé, corniche), centré, posé sur y = 0. Retourne l'altitude du dessus. */
export function pedestal(b: Builder, o: PedestalOpts): number {
  const p = o.projection ?? Math.min(o.width, o.depth) * 0.08;
  const baseH = o.baseH ?? o.height * 0.16, capH = o.capH ?? o.height * 0.12;
  const hx = o.width / 2, hz = o.depth / 2;
  const ring = [-hx, -hz, -hx, hz, hx, hz, hx, -hz];
  const prof = pedestalProfile(o.height, p, baseH, capH);
  if (o.matDie) {
    b.add(o.mat, sweep(prof.slice(0, 12), ring, { closed: true }));
    b.add(o.matDie, sweep([0, baseH, 0, o.height - capH], ring, { closed: true }));
    b.add(o.mat, sweep(prof.slice(12), ring, { closed: true }));
  } else b.add(o.mat, sweep(prof, ring, { closed: true }));
  b.add(o.mat, polygon(insetRing(ring, p), o.height));
  return o.height;
}

/** Piédestal circulaire mouluré. */
export function pedestalRound(b: Builder, radius: number, height: number, mat: MatRef, seg = 24, projection = radius * 0.12, baseH = height * 0.16, capH = height * 0.12): number {
  const prof = pedestalProfile(height, projection, baseH, capH);
  const lp: number[] = [];
  for (let i = 0; i < prof.length; i += 2) lp.push(radius + prof[i], prof[i + 1]);
  lp.push(0, height);
  b.add(mat, lathe(lp, seg));
  return height;
}

/** Emmarchement concentrique : `steps` marches autour d'une emprise (la plus haute au nu de l'emprise). Retourne la hauteur. */
export function steppedBase(b: Builder, ring: ArrayLike<number>, steps: number, tread: number, riser: number, mat: MatRef): number {
  const prof: number[] = [];
  for (let k = 0; k < steps; k++) {
    const o = (steps - 1 - k) * tread;
    prof.push(o, k * riser, o, (k + 1) * riser);
  }
  b.add(mat, sweep(prof, ring, { closed: true }));
  b.add(mat, polygon(ring, steps * riser));
  return steps * riser;
}

/** Emmarchement circulaire. */
export function steppedBaseRound(b: Builder, radius: number, steps: number, tread: number, riser: number, mat: MatRef, seg = 32): number {
  const prof: number[] = [];
  for (let k = 0; k < steps; k++) {
    const r = radius + (steps - 1 - k) * tread;
    prof.push(r, k * riser, r, (k + 1) * riser);
  }
  prof.push(0, steps * riser);
  b.add(mat, lathe(prof, seg));
  return steps * riser;
}

/** Volée d'escalier droite : palier haut au bord z = 0 (altitude `rise`), pied en z = `run`. Centrée en x. */
export function stairs(b: Builder, width: number, rise: number, run: number, steps: number, mat: MatRef): void {
  const tread = run / steps, riser = rise / steps;
  const g = new Geo();
  for (let k = 0; k < steps; k++) g.append(box(width, (k + 1) * riser, tread).translate(0, 0, run - (k + 0.5) * tread));
  b.add(mat, g);
}

// ───────────────────────────── balustrade et grille ─────────────────────────────

export interface BalustradeOpts {
  y: number;
  height?: number;
  closed?: boolean;
  mat: MatRef;
  /** Matériau à découpe alpha des balustres ('balustres' par défaut). */
  matBalusters?: MatRef;
  /** Dés (petits piédestaux) tous les n mètres ; 0 = aucun. */
  postEvery?: number;
  thickness?: number;
}

/** Balustrade de pierre le long d'une polyligne : socle, main courante, balustres (plan à découpe alpha), dés. */
export function balustrade(b: Builder, path: ArrayLike<number>, o: BalustradeOpts): void {
  const h = o.height ?? 1, t = o.thickness ?? 0.28, y = o.y, closed = o.closed === true;
  const rail = (y0: number, y1: number, w: number): number[] => [-w / 2, y0, w / 2, y0, w / 2, y1, -w / 2, y1, -w / 2, y0];
  b.add(o.mat, sweep(rail(y, y + h * 0.14, t), path, { closed, capEnds: false }));
  b.add(o.mat, sweep(rail(y + h * 0.86, y + h, t * 1.25), path, { closed, capEnds: false }));
  b.add(o.matBalusters ?? 'balustres', ribbon(path, y + h * 0.14, y + h * 0.86, closed));
  const every = o.postEvery ?? 3.2;
  if (every > 0) {
    const g = new Geo();
    alongPath(path, every, closed, (x, z, heading) => { g.append(box(t * 1.5, h * 1.04, t * 1.5), pose(x, y, z, heading)); });
    // dés aux sommets
    const n = path.length >> 1;
    for (let i = 0; i < n; i++) g.append(box(t * 1.6, h * 1.08, t * 1.6).translate(path[2 * i], y, path[2 * i + 1]));
    b.add(o.mat, g);
  }
}

export interface FenceOpts {
  y?: number; height: number; closed?: boolean;
  /** 'grille' (noire) ou 'grille_doree' (fers de lance dorés). */
  mat?: MatRef;
  /** Poteaux tous les n mètres (0 = aucun) et leur matériau. */
  postEvery?: number;
  matPost?: MatRef;
  /** Muret bas sous la grille (hauteur, matériau). */
  wall?: { height: number; mat: MatRef };
}

/** Grille en fer forgé le long d'une polyligne (plan à découpe alpha), poteaux et muret facultatifs. */
export function ironFence(b: Builder, path: ArrayLike<number>, o: FenceOpts): void {
  const y = o.y ?? 0, closed = o.closed === true;
  let y0 = y;
  if (o.wall) {
    const w = 0.3;
    b.add(o.wall.mat, sweep([-w / 2, y, w / 2, y, w / 2, y + o.wall.height, -w / 2, y + o.wall.height, -w / 2, y], path, { closed }));
    y0 += o.wall.height;
  }
  b.add(o.mat ?? 'grille', ribbon(path, y0, y0 + o.height, closed));
  const every = o.postEvery ?? 0;
  if (every > 0) {
    const g = new Geo();
    alongPath(path, every, closed, (x, z, heading) => { g.append(box(0.12, o.height * 1.06, 0.12), pose(x, y0, z, heading)); });
    b.add(o.matPost ?? 'fer_noir', g);
  }
}

export interface ReliefPanelOpts {
  width: number;
  height: number;
  /** Matériau du bas-relief ('relief_pierre', 'relief_bronze'…) : une rangée de personnages sur la hauteur du panneau. */
  mat?: MatRef;
  /** Cadre mouluré autour du panneau (matériau) ; absent = pas de cadre. */
  frame?: MatRef;
  /** Décalage du motif le long de la frise (m), pour que deux panneaux voisins diffèrent. */
  shift?: number;
}

/**
 * Bas-relief suggéré par texture : panneau vertical dans le plan z = 0 (face vers +z), base sur y = 0, centré en x.
 * Le motif garde ses proportions quelle que soit la taille du panneau.
 */
export function reliefPanel(b: Builder, o: ReliefPanelOpts): void {
  const m = o.mat ?? 'relief_pierre';
  const [tw, th] = tileOf(m);
  const hw = o.width / 2, u0 = o.shift ?? 0, u1 = u0 + (o.width / (4 * o.height)) * tw;
  b.add(m, new Geo().face(-hw, 0, 0.06, hw, 0, 0.06, hw, o.height, 0.06, -hw, o.height, 0.06, u0, 0, { u1, v1: th }));
  if (o.frame !== undefined) {
    const t = Math.max(0.12, Math.min(o.width, o.height) * 0.06), d = t * 0.9;
    const g = new Geo();
    g.append(box(o.width + 2 * t, t, d).translate(0, -t, d / 2)).append(box(o.width + 2 * t, t, d).translate(0, o.height, d / 2));
    g.append(box(t, o.height, d).translate(-hw - t / 2, 0, d / 2)).append(box(t, o.height, d).translate(hw + t / 2, 0, d / 2));
    b.add(o.frame, g);
  }
}
