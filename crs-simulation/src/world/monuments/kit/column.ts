/* Kit monuments — colonnes et pilastres des ordres classiques (simplifiés mais lisibles). */
import { Builder } from './builder';
import { Geo } from './geo';
import { box, cyl, lathe } from './shapes';
import type { MatRef } from './materials';

export type Order = 'toscan' | 'dorique' | 'ionique' | 'corinthien';

export interface ColumnOpts {
  order: Order;
  /** Hauteur totale, base et chapiteau compris. */
  height: number;
  /** Diamètre du fût à la base. */
  diameter: number;
  mat: MatRef;
  /** Matériau du chapiteau et de la base (bronze doré…) ; par défaut `mat`. */
  matCapital?: MatRef;
  /** Nombre de cannelures en géométrie ; 0 = fût lisse. Par défaut 20 (dorique) ou 24, 0 pour le toscan. */
  flutes?: number;
  /** Segments du fût lisse et des parties tournées. */
  seg?: number;
  /** Base (par défaut oui ; une colonne dorique grecque n'en a pas). */
  base?: boolean;
}

/** Hauteur du chapiteau et de la base, en diamètres. */
const CAPITAL_H: Record<Order, number> = { toscan: 0.5, dorique: 0.5, ionique: 0.55, corinthien: 1.15 };
const BASE_H = 0.5;

/** Fût cannelé : section en étoile adoucie, galbe (entasis) sur trois niveaux. */
function flutedShaft(r0: number, r1: number, h: number, flutes: number): Geo {
  const g = new Geo();
  const n = flutes * 2;
  const levels = [0, 0.38, 1];
  const rad = (t: number): number => (t <= 0.38 ? r0 : r0 + (r1 - r0) * ((t - 0.38) / 0.62));
  let u = 0;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
    const k0 = i % 2 === 0 ? 1 : 0.9, k1 = i % 2 === 0 ? 0.9 : 1;
    const du = (r0 * Math.PI * 2) / n;
    for (let l = 0; l < levels.length - 1; l++) {
      const ra = rad(levels[l]), rb = rad(levels[l + 1]);
      const y0 = levels[l] * h, y1 = levels[l + 1] * h;
      g.face(
        ra * k0 * Math.sin(a0), y0, ra * k0 * Math.cos(a0), ra * k1 * Math.sin(a1), y0, ra * k1 * Math.cos(a1),
        rb * k1 * Math.sin(a1), y1, rb * k1 * Math.cos(a1), rb * k0 * Math.sin(a0), y1, rb * k0 * Math.cos(a0),
        u, y0, { u1: u + du, v1: y1 },
      );
    }
    u += du;
  }
  return g;
}

/** Géométries d'une colonne : fût d'une part, base + chapiteau d'autre part. Base posée sur y = 0. */
export function columnGeo(o: ColumnOpts): { shaft: Geo; trim: Geo } {
  const D = o.diameter, r0 = D / 2, r1 = r0 * (o.order === 'dorique' || o.order === 'toscan' ? 0.82 : 0.86);
  const seg = o.seg ?? 12;
  const hasBase = o.base !== false;
  const hb = hasBase ? D * BASE_H : 0, hc = D * CAPITAL_H[o.order];
  const hs = Math.max(0.1, o.height - hb - hc);
  const flutes = o.flutes ?? (o.order === 'toscan' ? 0 : o.order === 'dorique' ? 20 : 24);
  const shaft = (flutes > 0 ? flutedShaft(r0, r1, hs, flutes) : lathe([r0, 0, r0, hs * 0.38, r1, hs], seg, { smooth: true })).translate(0, hb, 0);
  const trim = new Geo();
  if (hasBase) {
    // base attique : plinthe carrée, tore, scotie, tore
    trim.append(box(D * 1.36, hb * 0.32, D * 1.36));
    trim.append(lathe([
      r0 * 1.30, hb * 0.32, r0 * 1.34, hb * 0.44, r0 * 1.30, hb * 0.56, r0 * 1.12, hb * 0.62, r0 * 1.12, hb * 0.74,
      r0 * 1.20, hb * 0.80, r0 * 1.20, hb * 0.92, r0 * 1.0, hb,
    ], seg));
  }
  const y = hb + hs;
  if (o.order === 'toscan' || o.order === 'dorique') {
    trim.append(lathe([r1, 0, r1 * 1.08, hc * 0.06, r1 * 1.08, hc * 0.16, r1, hc * 0.2, r1, hc * 0.36, r1 * 1.42, hc * 0.66, r1 * 1.42, hc * 0.7], seg).translate(0, y, 0));
    trim.append(box(r1 * 3.0, hc * 0.3, r1 * 3.0, { bottom: true }).translate(0, y + hc * 0.7, 0));
  } else if (o.order === 'ionique') {
    trim.append(lathe([r1, 0, r1 * 1.1, hc * 0.1, r1 * 1.1, hc * 0.2, r1 * 1.3, hc * 0.5, r1 * 1.3, hc * 0.62], seg).translate(0, y, 0));
    // coussinet et volutes (cylindres d'axe z aux deux extrémités)
    trim.append(box(r1 * 3.1, hc * 0.24, r1 * 2.3, { bottom: true }).translate(0, y + hc * 0.56, 0));
    const vr = hc * 0.42;
    for (const s of [-1, 1]) {
      const v = cyl(vr, vr, r1 * 2.5, 10, { bottom: true }).rotateX(Math.PI / 2).translate(s * r1 * 1.55, y + hc * 0.46, -r1 * 1.25);
      trim.append(v);
    }
    trim.append(box(r1 * 3.0, hc * 0.18, r1 * 3.0, { bottom: true }).translate(0, y + hc * 0.82, 0));
  } else {
    // corinthien : corbeille à deux rangs de feuilles, volutes d'angle, tailloir
    trim.append(lathe([
      r1, 0, r1 * 1.1, hc * 0.03, r1 * 1.1, hc * 0.07, r1 * 1.0, hc * 0.1, r1 * 1.24, hc * 0.36, r1 * 1.06, hc * 0.40,
      r1 * 1.34, hc * 0.66, r1 * 1.16, hc * 0.70, r1 * 1.5, hc * 0.88,
    ], Math.max(8, seg)).translate(0, y, 0));
    for (let k = 0; k < 4; k++) {
      const a = Math.PI / 4 + (k * Math.PI) / 2;
      trim.append(box(r1 * 0.5, hc * 0.24, r1 * 0.5, { bottom: true }).rotateY(Math.PI / 4).translate(Math.sin(a) * r1 * 1.72, y + hc * 0.66, Math.cos(a) * r1 * 1.72));
    }
    trim.append(box(r1 * 3.1, hc * 0.12, r1 * 3.1, { bottom: true }).translate(0, y + hc * 0.88, 0));
  }
  return { shaft, trim };
}

/** Ajoute une colonne (base sur y = 0 de la pose courante). */
export function column(b: Builder, o: ColumnOpts): void {
  const { shaft, trim } = columnGeo(o);
  b.add(o.mat, shaft);
  b.add(o.matCapital ?? o.mat, trim);
}

export interface PilasterOpts {
  order: Order;
  height: number;
  width: number;
  /** Saillie par rapport au mur. */
  depth?: number;
  mat: MatRef;
}

/** Pilastre plat adossé : dos dans le plan z = 0, saillie vers +z, base sur y = 0, centré en x. */
export function pilaster(b: Builder, o: PilasterOpts): void {
  const w = o.width, d = o.depth ?? w * 0.22;
  const hb = w * 0.45, hc = w * CAPITAL_H[o.order];
  const g = new Geo();
  g.append(box(w * 1.3, hb * 0.4, d * 1.5).translate(0, 0, d * 0.75));
  g.append(box(w * 1.16, hb * 0.6, d * 1.25).translate(0, hb * 0.4, d * 0.62));
  g.append(box(w, o.height - hb - hc, d).translate(0, hb, d / 2));
  const y = o.height - hc;
  if (o.order === 'corinthien') {
    g.append(box(w * 1.12, hc * 0.36, d * 1.2).translate(0, y, d * 0.6));
    g.append(box(w * 1.26, hc * 0.36, d * 1.45).translate(0, y + hc * 0.36, d * 0.72));
    g.append(box(w * 1.44, hc * 0.28, d * 1.8, { bottom: true }).translate(0, y + hc * 0.72, d * 0.9));
  } else {
    g.append(box(w * 1.1, hc * 0.5, d * 1.2).translate(0, y, d * 0.6));
    g.append(box(w * 1.32, hc * 0.5, d * 1.6, { bottom: true }).translate(0, y + hc * 0.5, d * 0.8));
  }
  b.add(o.mat, g);
}
