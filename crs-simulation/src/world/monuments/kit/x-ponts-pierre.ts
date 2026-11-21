/* Kit monuments — lot « ponts » : pont de pierre à arches (Pont Neuf) dans le repère de son tablier.
 * Repère de construction (« espace du tablier ») : X = en travers (v), Y = au-dessus de la chaussée, Z = le long de
 * l'axe (s). deckMatrix() le pose dans le repère local du monument, avec la pente du tablier et, pour les piles et
 * les culées, le biais des rives.
 * Le tablier lui-même (chaussée, trottoirs, bandeau de 0,9 m) est dessiné par le module de la ville : le pont de
 * pierre fournit ce qu'il y a dessous (tympans, voûtes, piles à avant-becs) et autour (corniche à mascarons,
 * demi-lunes en encorbellement, parapets). Ses parements sont 6 cm en avant du bandeau de la ville et son parapet
 * enveloppe le parapet générique : aucune face coplanaire.
 * Fichier ajouté par le lot « ponts » : les fichiers d'origine du kit ne sont pas modifiés. */
import * as THREE from 'three';
import type { QualityLevel } from '@/core/contracts';
import { Builder } from './builder';
import { Geo, pose } from './geo';
import { box, boxAt, cyl, lathe, prism, sector, sweep } from './shapes';
import { archBlock, archivolt, type ArchOpening } from './arch';
import { canvas2d, css, mixHex, paintBumpBase, paintMatter, rngOf, texFrom } from './canvas';
import { defineMaterial, litMaterial } from './materials';
import { ensureCCW } from '../shape2d';
import type { BridgeFrame } from '../x-ponts-plan';

/** Épaisseur du tablier dessiné par le module de la ville (bandeau sous la chaussée) et hauteur de son parapet. */
export const DECK_SLAB = 0.9, CITY_PARAPET = 1.03;
/** Avancée des parements du monument devant le bandeau de la ville (m). */
export const PROUD = 0.06;

/**
 * Matrice de l'espace du tablier vers le repère local du monument. `skewed` applique le biais des rives
 * (s ← s + biais · v) : à utiliser pour ce qui porte dans l'eau (piles, culées, voûtes).
 */
export function deckMatrix(f: BridgeFrame, skewed = false): THREE.Matrix4 {
  const k = skewed ? f.skew : 0;
  return new THREE.Matrix4().set(
    f.nx + f.ux * k, 0, f.ux, f.ox,
    f.slope * k, 1, f.slope, f.y0,
    f.nz + f.uz * k, 0, f.uz, f.oz,
    0, 0, 0, 1,
  );
}

// ───────────────────────────── mascarons ─────────────────────────────

const P_STONE = 0xd8cbae;
/** Largeur (m) et hauteur (m) d'une console à mascaron. */
const MASK_W = 0.34, MASK_H = 0.56;

/** Frise de quatre mascarons (masques grotesques des consoles de la corniche du Pont Neuf), un par console. */
defineMaterial('pont_mascarons', () => {
  const cv = canvas2d(512, 256), bp = canvas2d(512, 256);
  if (!cv || !bp) return litMaterial('pont_mascarons', { color: mixHex(P_STONE, 0x000000, 0.12), roughness: 0.92, night: 0.85 });
  paintMatter(cv, mixHex(P_STONE, 0x6b6558, 0.18), 0.06, 8, 311, 0.04);
  paintBumpBase(bp, 120, 6, 12, 312);
  const g = cv.g, b = bp.g, rnd = rngOf(977);
  const shade = css(mixHex(P_STONE, 0x000000, 0.62)), mid = css(mixHex(P_STONE, 0x000000, 0.3)), light = css(mixHex(P_STONE, 0xffffff, 0.25));
  for (let k = 0; k < 4; k++) {
    const x0 = k * 128, cx = x0 + 64;
    // console : volute en haut, corps qui s'amincit
    g.fillStyle = light; b.fillStyle = '#d8d8d8';
    for (const c of [g, b]) { c.beginPath(); c.moveTo(x0 + 6, 0); c.lineTo(x0 + 122, 0); c.lineTo(x0 + 112, 250); c.lineTo(x0 + 16, 250); c.closePath(); c.fill(); }
    g.fillStyle = shade; g.fillRect(x0, 0, 5, 256); g.fillRect(x0 + 123, 0, 5, 256);
    // visage : ovale, front, arcades, yeux, nez, bouche béante, barbe ou feuillage
    const fy = 118 + rnd() * 12, rw = 44 + rnd() * 6, rh = 62 + rnd() * 8;
    g.fillStyle = css(mixHex(P_STONE, 0xffffff, 0.1)); b.fillStyle = '#f4f4f4';
    for (const c of [g, b]) { c.beginPath(); c.ellipse(cx, fy, rw, rh, 0, 0, Math.PI * 2); c.fill(); }
    // chevelure / cornes / feuilles
    g.strokeStyle = mid; g.lineWidth = 5; b.strokeStyle = '#bcbcbc'; b.lineWidth = 5;
    const horns = k % 2 === 0;
    for (const c of [g, b]) {
      for (let i = 0; i < 7; i++) {
        const a = Math.PI * (1.08 + (i / 6) * 0.84);
        c.beginPath(); c.moveTo(cx + Math.cos(a) * rw * 0.9, fy + Math.sin(a) * rh * 0.9);
        c.quadraticCurveTo(cx + Math.cos(a) * rw * 1.25, fy + Math.sin(a) * rh * 1.2 - (horns ? 14 : 0), cx + Math.cos(a + 0.25) * rw * 1.3, fy + Math.sin(a) * rh * (horns ? 1.5 : 1.25));
        c.stroke();
      }
    }
    g.fillStyle = shade; b.fillStyle = '#404040';
    for (const c of [g, b]) {
      for (const s of [-1, 1]) { c.beginPath(); c.ellipse(cx + s * rw * 0.42, fy - rh * 0.2, 9, 6 + (k % 3), 0, 0, Math.PI * 2); c.fill(); }
      c.beginPath(); c.ellipse(cx, fy + rh * 0.48, 15 + (k % 2) * 6, 10 + (k % 3) * 4, 0, 0, Math.PI * 2); c.fill();
    }
    g.strokeStyle = shade; g.lineWidth = 4; b.strokeStyle = '#707070'; b.lineWidth = 4;
    for (const c of [g, b]) {
      for (const s of [-1, 1]) { c.beginPath(); c.moveTo(cx + s * rw * 0.75, fy - rh * 0.42); c.quadraticCurveTo(cx + s * rw * 0.4, fy - rh * 0.56, cx + s * 6, fy - rh * 0.3); c.stroke(); }
      c.beginPath(); c.moveTo(cx, fy - rh * 0.3); c.lineTo(cx - 9, fy + rh * 0.2); c.lineTo(cx + 9, fy + rh * 0.2); c.stroke();
      // barbe en mèches
      for (let i = -3; i <= 3; i++) { c.beginPath(); c.moveTo(cx + i * 10, fy + rh * 0.72); c.quadraticCurveTo(cx + i * 13 + 5, fy + rh * 1.0, cx + i * 11, fy + rh * 1.22); c.stroke(); }
    }
  }
  return litMaterial('pont_mascarons', { color: 0xffffff, roughness: 0.92, night: 0.85, bumpScale: 4 },
    { map: texFrom(cv, { tile: [MASK_W * 4, MASK_H] }), bump: texFrom(bp, { tile: [MASK_W * 4, MASK_H], srgb: false }) });
});

// ───────────────────────────── pont de pierre ─────────────────────────────

export interface StoneBridgeOpts {
  /** Abscisses des deux quais (l'eau est entre les deux) et demi-largeur du tablier. */
  z0: number; z1: number; half: number;
  arches: number;
  /** Épaisseur d'une pile (m). */
  pier: number;
  /** Niveau de l'eau sous la chaussée (négatif) : au quai z0 et au quai z1 (le tablier est en pente, l'eau non). */
  water0: number; water1: number;
  quality: QualityLevel;
  /** Demi-lunes en encorbellement au droit des piles (Pont Neuf). */
  demiLunes?: boolean;
}

export interface StoneBridgeInfo {
  /** Abscisses des piles, rayon extérieur des demi-lunes, ouverture et flèche visible des arches. */
  piers: number[]; lune: number; opening: number; crownY: number;
}

const WALL = 'pierre_blonde', TRIM = 'pierre_claire', VAULT = 'pierre_grise', WET = 'calcaire_patine';

function orient(g: Geo, a: number[], b: number[], c: number[], out: number[]): void {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  if (nx * out[0] + ny * out[1] + nz * out[2] >= 0) g.face3(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], 0, 0, Math.hypot(ux, uy, uz), 0, 0, Math.hypot(vx, vy, vz));
  else g.face3(a[0], a[1], a[2], c[0], c[1], c[2], b[0], b[1], b[2], 0, 0, Math.hypot(vx, vy, vz), 0, 0, Math.hypot(ux, uy, uz));
}

/** Demi-disque horizontal (dessus), de rayon r, du côté `side` (±1) de l'axe X. */
function halfDisc(r: number, seg: number, y: number, side: number): Geo {
  return sector(r, seg, y, true, side > 0 ? 0 : Math.PI, Math.PI);
}

/**
 * Pont de pierre à arches en plein cintre, à construire dans l'espace du tablier AVEC le biais des rives
 * (b.with(deckMatrix(f, true), …)). Rend les abscisses des piles et les cotes utiles aux obstacles et au décor.
 */
export function stoneBridge(b: Builder, o: StoneBridgeOpts): StoneBridgeInfo {
  const low = o.quality === 'bas';
  const seg = low ? 8 : 14, rseg = low ? 6 : 10;
  const HW = o.half + PROUD;
  const TOP = -DECK_SLAB + 0.04;
  const waterMin = Math.min(o.water0, o.water1), waterMax = Math.max(o.water0, o.water1);
  const yBase = waterMin - 2.6, H = TOP - yBase;
  const span = o.z1 - o.z0, pitch = span / o.arches, opening = pitch - o.pier;
  const abut = 7, L = span + 2 * abut, zMid = (o.z0 + o.z1) / 2;
  const crown = H - 0.62;
  const waterAt = (z: number): number => o.water0 + ((o.water1 - o.water0) * (z - o.z0)) / span;

  // ── massif : tympans, voûtes en berceau, culées pleines ──
  const openings: ArchOpening[] = [];
  for (let i = 0; i < o.arches; i++) openings.push({ x: zMid - (o.z0 + (i + 0.5) * pitch), width: opening, height: crown });
  b.with(pose(0, yBase, zMid, Math.PI / 2), () => {
    archBlock(b, { width: L, height: H, depth: 2 * HW, openings, mat: WALL, matVault: VAULT, matJamb: VAULT, seg, top: false, left: false, right: false });
    // archivoltes : bandeau de claveaux en légère saillie sur les deux têtes
    const front = new Geo();
    for (const op of openings) front.append(archivolt(op, 0.52, 0.13, seg).translate(0, 0, HW));
    b.add(TRIM, front);
    b.add(TRIM, front.clone().rotateY(Math.PI));
  });

  // ── piles : avant-becs, tourelles, demi-lunes ──
  const piers: number[] = [];
  const rT = o.pier / 2 + 0.3, rO = rT + 0.62, rI = rO - 0.38;
  const beak = o.pier * 0.95;
  const stone = new Geo(), wet = new Geo(), trim = new Geo(), mask = new Geo(), floor = new Geo();
  for (let i = 1; i < o.arches; i++) {
    const zk = o.z0 + i * pitch;
    piers.push(zk);
    const yB = waterAt(zk) + 2.3, yCap = yB + 1.5;
    for (const sx of [-1, 1]) {
      const A = [sx * HW, yB, zk - o.pier / 2], B = [sx * HW, yB, zk + o.pier / 2], T = [sx * (HW + beak), yB, zk];
      wet.append(prism(ensureCCW([A[0], A[2], B[0], B[2], T[0], T[2]]), yBase, yB, { top: false }));
      const A2 = [A[0], yCap, A[2]], B2 = [B[0], yCap, B[2]];
      orient(wet, A, T, A2, [0, 0, -1]); orient(wet, B, T, B2, [0, 0, 1]); orient(wet, A2, T, B2, [sx, 2, 0]);
      const start = sx > 0 ? 0 : Math.PI;
      if (o.demiLunes !== false) {
        // tourelle semi-circulaire montant de l'avant-bec, frise de mascarons, corniche en encorbellement
        stone.append(lathe([rT, yB + 0.2, rT, -1.36], rseg, { start, sweep: Math.PI }).translate(sx * HW, 0, zk));
        mask.append(cyl(rT + 0.1, rT + 0.1, MASK_H, rseg, { start, sweep: Math.PI, top: false }).translate(sx * HW, -1.36, zk));
        trim.append(lathe([rT + 0.1, -0.8, rT + 0.42, -0.66, rT + 0.62, -0.42, rT + 0.62, -0.04, rT + 0.2, -0.04], rseg, { start, sweep: Math.PI }).translate(sx * HW, 0, zk));
        // parapet courbe (chaperon débordant), banc de pierre adossé
        trim.append(lathe([
          rO, -0.04, rO, 1.0, rO + 0.05, 1.0, rO + 0.05, 1.09, rI - 0.05, 1.09, rI - 0.05, 1.0, rI, 1.0, rI, 0.56, rI - 0.44, 0.56, rI - 0.44, 0.1,
        ], rseg, { start, sweep: Math.PI }).translate(sx * HW, 0, zk));
        floor.append(halfDisc(rI - 0.44, rseg, 0.1, sx).translate(sx * HW, 0, zk));
      } else {
        // simple chaperon : la pile s'arrête sous la corniche
        stone.append(lathe([rT * 0.8, yB + 0.2, rT * 0.8, -1.36, 0, -1.2], rseg, { start, sweep: Math.PI }).translate(sx * HW, 0, zk));
      }
    }
  }
  b.add(WALL, stone); b.add(WET, wet); b.add(TRIM, trim); b.add('pont_mascarons', mask); b.add(WALL, floor);

  // ── entre les piles : frise de consoles à mascarons, corniche, parapet enveloppant celui de la ville ──
  const lune = o.demiLunes !== false ? rO : 0;
  const stops: number[] = [o.z0 - abut + 0.5];
  for (const zk of piers) stops.push(zk);
  stops.push(o.z1 + abut - 0.5);
  const cornice = [0.1, -0.8, 0.42, -0.66, 0.62, -0.42, 0.62, -0.04, 0, -0.04];
  const pitchC = low ? MASK_W * 5 : MASK_W * 3;
  const cons = new Geo(), faces = new Geo(), rails = new Geo(), band = new Geo();
  for (let i = 0; i + 1 < stops.length; i++) {
    const a = stops[i] + (i === 0 ? 0 : lune), c = stops[i + 1] - (i + 2 === stops.length ? 0 : lune);
    if (c - a < 0.8) continue;
    for (const sx of [-1, 1]) {
      // la saillie du profil sort à DROITE du sens de parcours (−dz, dx)
      const path = sx > 0 ? [HW, c, HW, a] : [-HW, a, -HW, c];
      b.add(TRIM, sweep(cornice, path));
      band.append(new Geo().face(
        sx * (HW + 0.1), -1.36, sx > 0 ? c : a, sx * (HW + 0.1), -1.36, sx > 0 ? a : c,
        sx * (HW + 0.1), -0.8, sx > 0 ? a : c, sx * (HW + 0.1), -0.8, sx > 0 ? c : a,
      ));
      // consoles : une tous les `pitchC`, chacune porte un mascaron sur sa face
      const n = Math.max(1, Math.floor((c - a) / pitchC));
      for (let k = 0; k < n; k++) {
        const z = a + ((k + 0.5) / n) * (c - a);
        cons.append(boxAt(sx * HW, -1.36, z - MASK_W / 2, sx * (HW + 0.44), -0.8, z + MASK_W / 2, { top: false }));
        const u0 = ((i * 7 + k) % 4) * MASK_W;
        const x = sx * (HW + 0.445), z0 = z - (sx * MASK_W) / 2, z1 = z + (sx * MASK_W) / 2;
        faces.append(new Geo().face(x, -1.36, z1, x, -1.36, z0, x, -0.8, z0, x, -0.8, z1, u0, 0, { u1: u0 + MASK_W, v1: MASK_H }));
      }
      // parapet : mur plein et chaperon, 6 cm autour du parapet générique
      rails.append(boxAt(sx * (o.half - 0.44), 0.0, a, sx * HW, 1.0, c, { top: false }));
      rails.append(boxAt(sx * (o.half - 0.49), 1.0, a, sx * (HW + 0.05), 1.09, c, { bottom: true }));
    }
  }
  b.add(VAULT, band); b.add(WALL, cons); b.add('pont_mascarons', faces); b.add(TRIM, rails);
  // socle des culées au ras de l'eau (masque le raccord avec le quai)
  b.add(WET, box(2 * HW + 0.8, waterMax + 0.9 - yBase, abut - 0.2, { top: true }).translate(0, yBase, o.z0 - abut / 2 - 0.1));
  b.add(WET, box(2 * HW + 0.8, waterMax + 0.9 - yBase, abut - 0.2, { top: true }).translate(0, yBase, o.z1 + abut / 2 + 0.1));
  return { piers, lune, opening, crownY: yBase + crown };
}

/** Silhouette d'un pont de pierre : massif percé d'arches à peu de facettes, piles en saillie. Même espace que stoneBridge. */
export function stoneBridgeFar(b: Builder, o: StoneBridgeOpts, stone: THREE.Material, dark: THREE.Material): void {
  const HW = o.half + PROUD, yBase = Math.min(o.water0, o.water1) - 1.5, H = 1.05 - yBase;
  const span = o.z1 - o.z0, pitch = span / o.arches, zMid = (o.z0 + o.z1) / 2;
  const openings: ArchOpening[] = [];
  for (let i = 0; i < o.arches; i++) openings.push({ x: zMid - (o.z0 + (i + 0.5) * pitch), width: pitch - o.pier, height: H - 2.5 });
  // pas de dessus : la chaussée (et ce qui s'y trouve) reste celle du module de la ville
  b.with(pose(0, yBase, zMid, Math.PI / 2), () => archBlock(b, { width: span + 8, height: H, depth: 2 * HW, openings, mat: stone, matVault: dark, matJamb: dark, seg: 4, left: false, right: false, top: false }));
  for (let i = 1; i < o.arches; i++) for (const sx of [-1, 1]) b.add(stone, box(2.4, H, o.pier * 0.8, { top: true }).translate(sx * (HW + 1.2), yBase, o.z0 + i * pitch));
}
