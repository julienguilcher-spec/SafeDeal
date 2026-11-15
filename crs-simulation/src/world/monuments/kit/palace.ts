/* Kit monuments — buildPalaceFromFootprint : habille une EMPRISE RÉELLE quelconque d'une façade
 * ordonnancée (soubassement à arcades ou refends, étages à hautes fenêtres et pilastres, corniche,
 * balustrade, comble d'ardoise ou de zinc à la Mansart, pavillons d'angle). Sert au Louvre, aux
 * Invalides, à l'Hôtel de Ville, etc. Coût : 2 triangles par pan de mur et par niveau de toit, plus
 * les moulures extrudées — une emprise de 150 côtés tient en quelques milliers de triangles. */
import * as THREE from 'three';
import { Builder } from './builder';
import { Geo } from './geo';
import { polygon, sweep } from './shapes';
import { balustrade, bandProfile, corniceProfile, loft, plinthProfile } from './classical';
import { brisis, facadeMaterial, PALACE_STYLES, type FacadeLayout, type PalaceStyle } from './facade';
import { cleanRing, ensureCCW, insetRing, signedArea } from '../shape2d';
import type { MatRef } from './materials';

export interface PalaceResult {
  /** Altitude du sommet des murs, du faîte du toit, nombre total de travées. */
  wallTop: number;
  roofTop: number;
  bays: number;
}

export interface PalaceOpts {
  /** Cours intérieures : anneaux [x0, z0, …] (sens indifférent). */
  holes?: ArrayLike<number>[];
  /** Matériau de pierre des moulures (corniche, bandeaux, plinthe). */
  matTrim?: MatRef;
  /** false : pas de toit (le monument pose le sien : dôme, verrière…). */
  roof?: boolean;
}

/** Plus petite largeur du bâti mesurée perpendiculairement aux côtés (m) : borne le recul des toits. */
export function clearance(rings: ArrayLike<number>[]): number {
  let best = Infinity;
  for (const ring of rings) {
    const n = ring.length >> 1;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const ax = ring[2 * i], az = ring[2 * i + 1], bx = ring[2 * j], bz = ring[2 * j + 1];
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 0.5) continue;
      const mx = (ax + bx) / 2, mz = (az + bz) / 2;
      const nx = (bz - az) / len, nz = -(bx - ax) / len;         // normale RENTRANTE
      for (const other of rings) {
        const m = other.length >> 1;
        for (let k = 0; k < m; k++) {
          if (other === ring && k === i) continue;
          const l = (k + 1) % m;
          const cx = other[2 * k], cz = other[2 * k + 1], dx = other[2 * l] - cx, dz = other[2 * l + 1] - cz;
          const den = nx * dz - nz * dx;
          if (Math.abs(den) < 1e-9) continue;
          const t = ((cx - mx) * dz - (cz - mz) * dx) / den;
          const s = ((cx - mx) * nz - (cz - mz) * nx) / den;
          if (t > 0.05 && s >= 0 && s <= 1 && t < best) best = t;
        }
      }
    }
  }
  return best === Infinity ? 0 : best;
}

/** Murs à façade peinte : un quadrilatère par côté, u calé sur un nombre entier de travées. Retourne le nombre de travées. */
function facadeWalls(g: Geo, ring: ArrayLike<number>, y0: number, y1: number, v0: number, v1: number, bay: number): number {
  const n = ring.length >> 1;
  let total = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ax = ring[2 * i], az = ring[2 * i + 1], bx = ring[2 * j], bz = ring[2 * j + 1];
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 0.05) continue;
    if (len < bay * 0.6) {
      // pan trop court pour une travée : bande de pilastre seule (sans fenêtre)
      const hu = Math.min(0.04, (len / bay) * 0.25);
      g.face(ax, y0, az, bx, y0, bz, bx, y1, bz, ax, y1, az, -hu, v0, { u1: hu, v1 });
      continue;
    }
    const k = Math.max(1, Math.round(len / bay));
    g.face(ax, y0, az, bx, y0, bz, bx, y1, bz, ax, y1, az, 0, v0, { u1: k / 2, v1 });
    total += k;
  }
  return total;
}

/** Versant de toit entre deux anneaux homologues, avec les UV de la bande de comble de la façade. */
function facadeSlope(g: Geo, lo: ArrayLike<number>, yLo: number, hi: ArrayLike<number>, yHi: number, ref: ArrayLike<number>, v0: number, v1: number, bay: number): void {
  const n = ref.length >> 1;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const len = Math.hypot(ref[2 * j] - ref[2 * i], ref[2 * j + 1] - ref[2 * i + 1]);
    if (len < 0.05) continue;
    const short = len < bay * 0.6;
    const k = Math.max(1, Math.round(len / bay));
    g.face(lo[2 * i], yLo, lo[2 * i + 1], lo[2 * j], yLo, lo[2 * j + 1], hi[2 * j], yHi, hi[2 * j + 1], hi[2 * i], yHi, hi[2 * i + 1],
      short ? 0.46 : 0, v0, { u1: short ? 0.54 : k / 2, v1 });
  }
}

/**
 * Ajoute un palais à l'assembleur : murs, plinthe, bandeau, corniche, balustrade, toit, pavillons d'angle.
 * `emprise` : anneau [x0, z0, …] dans le repère local (sens indifférent, non refermé).
 */
export function addPalace(b: Builder, emprise: ArrayLike<number>, style: PalaceStyle = PALACE_STYLES.classique, opts: PalaceOpts = {}): PalaceResult {
  const ring = cleanRing(ensureCCW(emprise), 0.05);
  if (ring.length < 6) return { wallTop: 0, roofTop: 0, bays: 0 };
  // cours : anneaux horaires (la normale (−dz, dx) pointe alors vers la cour)
  const holes = (opts.holes ?? []).map((h) => { const c = cleanRing(ensureCCW(h), 0.05); const r: number[] = []; for (let i = (c.length >> 1) - 1; i >= 0; i--) r.push(c[2 * i], c[2 * i + 1]); return r; }).filter((h) => h.length >= 6);
  const rings = [ring, ...holes];
  const { material, layout } = facadeMaterial(style);
  const trim = opts.matTrim ?? 'pierre_lisse';
  const H = layout.wallH, vTop = layout.floorV[layout.floorV.length - 1];
  const fac = new Geo();
  let bays = 0;
  for (const r of rings) bays += facadeWalls(fac, r, 0, H, 0, vTop, style.bay);
  // moulures extrudées le long de l'emprise
  const cor = style.cornice ?? 0.7, corH = Math.max(0.6, cor * 1.1);
  const firstH = style.floors[0].height;
  for (const r of rings) {
    b.add(trim, sweep(plinthProfile(0, style.plinth ?? 0.8, 0.16), r, { closed: true }));
    if (style.floors.length > 1) b.add(trim, sweep(bandProfile(firstH - 0.34, 0.34, 0.2), r, { closed: true }));
    b.add(trim, sweep(corniceProfile(H - corH, corH, cor, r.length > 160), r, { closed: true }));
  }
  // toit
  let roofTop = H;
  if (opts.roof !== false) roofTop = addRoof(b, fac, rings, style, layout);
  if (style.balustrade) for (const r of rings) balustrade(b, insetRing(r, cor * 0.25), { y: H, height: 1.05, closed: true, mat: trim, postEvery: style.bay });
  // pavillons d'angle
  if (style.pavilions) roofTop = Math.max(roofTop, addPavilions(b, fac, ring, style, layout, trim));
  b.add(material, fac);
  return { wallTop: H, roofTop, bays };
}

function addRoof(b: Builder, fac: Geo, rings: number[][], style: PalaceStyle, L: FacadeLayout): number {
  const H = L.wallH, top = style.roof.top ?? 'zinc', gutter = 0.3;
  const free = clearance(rings) / 2;
  const { rise, run } = brisis(style);
  const insetAll = (d: number): number[][] => rings.map((r) => insetRing(r, -d));
  const valid = (rs: number[][]): boolean => signedArea(rs[0]) > 1;
  if (style.roof.kind === 'terrasse' || free < gutter + 0.6) {
    const y = H + (style.roof.kind === 'terrasse' ? 0.05 : 0.3);
    const r0 = insetAll(Math.min(gutter, free * 0.5));
    if (valid(r0)) b.add(top, polygon(r0[0], y, true, r0.slice(1)));
    return y;
  }
  // versant raide (brisis) : borné par la largeur disponible
  const k = Math.min(1, (free - gutter - 0.3) / run);
  const r0 = insetAll(gutter), r1 = insetAll(gutter + run * k);
  const y1 = H + rise * k;
  const painted = L.roofBand > 0;
  for (let i = 0; i < rings.length; i++) {
    if (painted) facadeSlope(fac, r0[i], H, r1[i], y1, rings[i], L.floorV[L.floorV.length - 1], 1, style.bay);
    else b.add(style.roof.mat ?? 'ardoise', loft(r0[i], H, r1[i], y1));
  }
  // dessus : terrasson en pente douce (Mansart) ou plat
  let yTop = y1, capRings = r1;
  if (style.roof.kind === 'mansart' && k === 1) {
    const h2 = style.roof.height * 0.28;
    const run2 = Math.min(h2 * 3, free - gutter - run - 0.3);
    if (run2 > 0.4) {
      const r2 = insetAll(gutter + run + run2);
      if (valid(r2)) {
        yTop = y1 + h2 * (run2 / (h2 * 3));
        for (let i = 0; i < rings.length; i++) b.add(top, loft(r1[i], y1, r2[i], yTop));
        capRings = r2;
      }
    }
  }
  if (valid(capRings)) b.add(top, polygon(capRings[0], yTop, true, capRings.slice(1)));
  return yTop;
}

function addPavilions(b: Builder, fac: Geo, ring: number[], style: PalaceStyle, L: FacadeLayout, trim: MatRef): number {
  const pv = style.pavilions!;
  const n = ring.length >> 1, s = pv.size, p = 0.7;
  const H = L.wallH, lastV0 = L.floorV[L.floorV.length - 2], vTop = L.floorV[L.floorV.length - 1];
  let top = 0;
  for (let i = 0; i < n; i++) {
    const h = (i + n - 1) % n, j = (i + 1) % n;
    const vx = ring[2 * i], vz = ring[2 * i + 1];
    let e0x = vx - ring[2 * h], e0z = vz - ring[2 * h + 1], e1x = ring[2 * j] - vx, e1z = ring[2 * j + 1] - vz;
    const l0 = Math.hypot(e0x, e0z), l1 = Math.hypot(e1x, e1z);
    if (l0 < s * 1.8 || l1 < s * 1.8) continue;
    e0x /= l0; e0z /= l0; e1x /= l1; e1z /= l1;
    const turn = e0x * e1z - e0z * e1x, dot = e0x * e1x + e0z * e1z;
    if (turn > -0.5 || Math.abs(dot) > 0.5) continue;              // angle saillant proche de l'équerre uniquement
    const n0x = -e0z, n0z = e0x, n1x = -e1z, n1z = e1x;             // normales sortantes
    const quad = [
      vx - e0x * s + n0x * p, vz - e0z * s + n0z * p,
      vx + n0x * p + n1x * p, vz + n0z * p + n1z * p,
      vx + e1x * s + n1x * p, vz + e1z * s + n1z * p,
      vx + e1x * s - e0x * s, vz + e1z * s - e0z * s,
    ];
    const yTop = H + pv.extra;
    facadeWalls(fac, quad, 0, H, 0, vTop, style.bay);
    facadeWalls(fac, quad, H, yTop, lastV0, vTop, style.bay);
    const cor = (style.cornice ?? 0.7) * 1.1;
    b.add(trim, sweep(plinthProfile(0, style.plinth ?? 0.8, 0.16), quad, { closed: true }));
    b.add(trim, sweep(corniceProfile(H - cor, cor, cor), quad, { closed: true }));
    b.add(trim, sweep(corniceProfile(yTop - cor, cor, cor), quad, { closed: true }));
    // toit en pavillon : tronc de pyramide d'ardoise, terrasson de zinc
    const r0 = insetRing(quad, -0.3), r1 = insetRing(quad, -Math.min(s * 0.36, pv.roof * 0.42));
    b.add(style.roof.mat ?? 'ardoise', loft(r0, yTop, r1, yTop + pv.roof));
    b.add(style.roof.top ?? 'zinc', polygon(r1, yTop + pv.roof));
    b.add(style.roof.top ?? 'zinc', sweep(bandProfile(yTop + pv.roof - 0.1, 0.35, 0.12), r1, { closed: true }));
    top = Math.max(top, yTop + pv.roof + 0.25);
  }
  return top;
}

/**
 * Construit un palais complet à partir d'une emprise réelle (repère local, anneau [x0, z0, …]).
 * Pour combiner avec d'autres éléments (dôme, portique) dans un même monument, utiliser addPalace().
 */
export function buildPalaceFromFootprint(emprise: ArrayLike<number>, style: PalaceStyle = PALACE_STYLES.classique, opts: PalaceOpts = {}): THREE.Group {
  const b = new Builder();
  const res = addPalace(b, emprise, style, opts);
  const group = b.build(`palais:${style.id}`);
  group.userData.palace = res;
  return group;
}
