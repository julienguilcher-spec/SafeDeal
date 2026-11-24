/* Opéra Bastille (Carlos Ott, 1989).
 * Emprise réelle 114 × 302 m (20 200 m²) en « P » : grand volume arrondi tourné vers la place de la Bastille,
 * longue aile technique le long de la rue de Lyon ; environ 48–50 m hors sol à la cage de scène. Façades en
 * dalles carrées de pierre claire et en verre ; rotonde vitrée étagée du foyer ; grand escalier extérieur passant
 * sous un portique carré de granit sombre. Les murs bas suivent l'emprise réelle de la carte ; les volumes hauts
 * (rotonde, salle, cage de scène) sont posés dessus. Repère local : la place de la Bastille est vers +z. */
import type { QualityLevel } from '@/core/contracts';
import type { MonumentDef, MonumentSite } from '../types';
import { Builder, Geo, band, box, boxAt, cyl, disc, farMaterial, finishFar, polygon, pose, prism, ribbon, stairs, walls } from '../kit';
import { designRing, glazingMaterial, plainMaterial, siteAlign } from '../kit/x-edifices';
import { insetRing } from '../shape2d';
import { BOX, EMPRISE } from '../collide/opera_bastille';

export const OB = {
  /** Centre et rayon de la rotonde du foyer (côté place), demi-ouverture de l'arc vitré (angles depuis +z, rad). */
  CX: 11.5, CZ: 84.5, R: 45.5, A0: -0.9, A1: 1.48,
  /** Corniche des corps bas, sommet de la rotonde vitrée, de la salle, de la cage de scène. */
  BASE: 22, FOYER: 30, HALL: 38, STAGE: 48,
  /** Portique : centre, largeur, hauteur. */
  PX: 25.4, PZ: 143.5, PW: 14, PH: 14.5,
} as const;

const STONE = 'pierre_claire', TRIM = 'pierre_lisse_claire', ZINC = 'zinc';
const GLASS = glazingMaterial('bastille_verre', { frame: 0x8a9196, glass: 0x8aa2ad, tile: [5.4, 5.4], panes: [3, 3], bar: 0.05, minor: 0.022, night: 1.4, solid: 0.1, solidColor: 0xcfd0cc });
const GRANITE = plainMaterial('bastille_granit_sombre', 0x2b2e31, { roughness: 0.35, metalness: 0.25, night: 0.5 });
const STEEL = plainMaterial('bastille_metal', 0x5e6468, { roughness: 0.45, metalness: 0.5, night: 0.6 });

/** Décale une polyligne ouverte vers l'extérieur (côté (−dz, dx)) de d mètres. */
function insetPath(path: number[], d: number): number[] {
  const out: number[] = [], n = path.length >> 1;
  for (let i = 0; i < n; i++) {
    const p = Math.max(0, i - 1), q = Math.min(n - 1, i + 1);
    const dx = path[2 * q] - path[2 * p], dz = path[2 * q + 1] - path[2 * p + 1], l = Math.hypot(dx, dz) || 1;
    out.push(path[2 * i] - (dz / l) * d, path[2 * i + 1] + (dx / l) * d);
  }
  return out;
}

function build(site: MonumentSite, quality: QualityLevel): Builder {
  const b = new Builder();
  const lod: 0 | 1 = quality === 'bas' ? 0 : 1;
  const { CX, CZ, BASE, FOYER, HALL, STAGE, PX, PZ, PW, PH } = OB;
  // ── corps bas sur l'emprise réelle (sans le « bec » du grand escalier) : pierre claire, bandeau vitré filant, acrotère ──
  b.push(siteAlign(site, EMPRISE, BOX));
  const full = designRing(EMPRISE, 0.3);
  const inBec = (x: number, z: number): boolean => z > 129.4 && x > 17 && x < 38.5;
  const ring: number[] = [];
  for (let i = 0; i < full.length; i += 2) if (!inBec(full[i], full[i + 1])) ring.push(full[i], full[i + 1]);
  b.add(STONE, walls(ring, 0, BASE));
  b.add(GLASS, ribbon(insetRing(ring, 0.08), 3.2, 8.6, true, 5.4));
  band(b, ring, 8.6, 0.5, 0.35, { mat: TRIM, closed: true });
  band(b, ring, 2.7, 0.5, 0.3, { mat: TRIM, closed: true });
  band(b, ring, BASE - 0.9, 0.9, 0.3, { mat: STEEL, closed: true });
  b.add(ZINC, polygon(ring, BASE - 0.15));
  const stone = new Geo(), glass = new Geo(), steel = new Geo(), zinc = new Geo();
  const seg = lod > 0 ? 28 : 14;
  // ── rotonde du foyer : mur-rideau courbe qui SUIT l'emprise réelle côté place (hors bec de l'escalier), bandeaux ──
  const out = insetRing(ring, 0.25), n = ring.length >> 1;
  const inArc = (i: number): boolean => ring[2 * i + 1] > 86.5;
  const paths: number[][] = [];
  let cur: number[] = [];
  for (let k = 0; k <= n; k++) {
    const i = k % n;
    if (inArc(i)) { if (k === n && cur.length === 0) break; cur.push(out[2 * i], out[2 * i + 1]); }
    else if (cur.length >= 4) { paths.push(cur); cur = []; } else cur = [];
  }
  if (cur.length >= 4) paths.push(cur);
  const roofPts: number[] = [];
  for (const path of paths) {
    glass.append(ribbon(path, 9.4, FOYER, false, FOYER - 9.4));
    for (let k = 0; k <= 4; k++) steel.append(ribbon(insetPath(path, 0.2), 9.2 + k * 5.15, 9.7 + k * 5.15, false, 0.5));
    for (let i = 0; i < path.length; i += 2) { steel.append(box(0.6, FOYER - 9, 0.6, { top: false }).translate(path[i], 9, path[i + 1])); roofPts.push(path[i], path[i + 1]); }
  }
  if (roofPts.length >= 6) zinc.append(polygon(roofPts, FOYER));
  // ── salle : tambour en retrait, bandeau vitré, puis attique de pierre ──
  const r2 = 36;
  stone.append(cyl(r2, r2, HALL - FOYER, seg * 2, { top: false }).translate(CX, FOYER, CZ - 6));
  glass.append(cyl(r2 + 0.12, r2 + 0.12, 3.6, seg * 2, { top: false }).translate(CX, FOYER + 1.6, CZ - 6));
  steel.append(cyl(r2 + 0.3, r2 + 0.3, 0.7, seg * 2, { top: false }).translate(CX, HALL - 0.7, CZ - 6));
  zinc.append(disc(r2, seg * 2, HALL, true).translate(CX, 0, CZ - 6));
  // ── cage de scène et arrière-scènes : grand parallélépipède de pierre, bandeau vitré haut ──
  const sx0 = -6, sx1 = 46, sz0 = 6, sz1 = 56;
  stone.append(boxAt(sx0, BASE, sz0, sx1, STAGE, sz1, { top: false }));
  glass.append(boxAt(sx0 - 0.12, STAGE - 9, sz0 - 0.12, sx1 + 0.12, STAGE - 3.6, sz1 + 0.12, { top: false }));
  steel.append(boxAt(sx0 - 0.3, STAGE - 0.8, sz0 - 0.3, sx1 + 0.3, STAGE, sz1 + 0.3, { bottom: true }));
  stone.append(boxAt(4, BASE, -24, 46, 34, 6, { top: false }));
  zinc.append(boxAt(4, 34, -24, 46, 34.2, 6, { bottom: false }));
  // rotonde arrière (ateliers)
  stone.append(cyl(24.5, 24.5, 31 - BASE, seg, { top: false }).translate(34, BASE, -31));
  glass.append(cyl(24.62, 24.62, 3.4, seg, { top: false }).translate(34, BASE + 3, -31));
  zinc.append(disc(24.5, seg, 31, true).translate(34, 0, -31));
  // ── grand escalier et portique carré de granit sombre, vers la place ──
  b.with(pose(PX, 0, PZ - 13.5), () => {
    stairs(b, 10.5, 6.4, 17.6, lod > 0 ? 26 : 13, TRIM);
    for (const s of [-1, 1]) b.add(STONE, boxAt(s * 5.25, 0, 0, s * 6.4, 7.4, 17.6));
  });
  const leg = 2.6;
  for (const s of [-1, 1]) b.add(GRANITE, box(leg, PH - leg, 3.2, { top: false }).translate(PX + s * (PW / 2 - leg / 2), 0, PZ));
  b.add(GRANITE, box(PW, leg, 3.2, { bottom: true }).translate(PX, PH - leg, PZ));
  b.add(STONE, stone); b.add(GLASS, glass); b.add(STEEL, steel); b.add(ZINC, zinc);
  b.pop();
  return b;
}

export const def: MonumentDef = {
  key: 'opera_bastille',
  name: 'Opéra Bastille',
  radius: 162,
  height: OB.STAGE,
  build(site, quality) { return build(site, quality).build('opera_bastille'); },
  buildFar(site) {
    const b = new Builder();
    const { CX, CZ, R, A0, A1, BASE, FOYER, HALL, STAGE, PX, PZ, PW, PH } = OB;
    const stone = farMaterial(0xd5d2c8), glass = farMaterial(0x93a9b3, 1.2, 0xffe2b0), dark = farMaterial(0x2b2e31, 0.3);
    b.push(siteAlign(site, EMPRISE, BOX));
    // corps bas : prisme de l'emprise simplifiée (sans le bec de l'escalier), puis les volumes hauts
    const low: number[] = [], src = designRing(EMPRISE, 3.2);
    for (let i = 0; i < src.length; i += 2) if (!(src[i + 1] > 129.4 && src[i] > 17 && src[i] < 38.5)) low.push(src[i], src[i + 1]);
    b.add(stone, prism(low, 0, BASE));
    b.add(glass, cyl(R - 4.5, R - 4.5, FOYER - BASE, 10, { start: A0, sweep: A1 - A0, flat: true }).translate(CX, BASE, CZ));
    b.add(stone, cyl(36, 36, HALL - BASE, 12, { flat: true }).translate(CX, BASE, CZ - 6));
    b.add(stone, boxAt(-6, BASE, 6, 46, STAGE, 56));
    b.add(stone, boxAt(4, BASE, -24, 46, 34, 6));
    for (const s of [-1, 1]) b.add(dark, box(2.6, PH, 3.2).translate(PX + s * (PW / 2 - 1.3), 0, PZ));
    b.add(dark, box(PW, 2.6, 3.2, { bottom: true }).translate(PX, PH - 2.6, PZ));
    b.pop();
    return finishFar(b, 'opera_bastille');
  },
};
