/* Tour Eiffel.
 * Dimensions réelles : 330 m (antennes comprises) ; quatre piliers inscrits dans un carré de 124,90 m, écart
 * intérieur 74,24 m ; planchers à 57,63 m, 115,73 m et 276,13 m (côtés extérieurs 70,69 m, 40,96 m et 18,65 m) ;
 * arcs décoratifs de 74 m de diamètre culminant à 39 m ; soubassements de maçonnerie de 4 m ; arbalétriers
 * inclinés à 54° au pied. Couleur « brun Tour Eiffel ».
 * Modélisation : arbalétriers, ceintures et croix de Saint-André en poutres réelles (fusionnées), remplissage
 * fin du treillis par des plans à découpe alpha ; on marche librement entre les piliers et sous les arcs. */
import * as THREE from 'three';
import type { QualityLevel } from '@/core/contracts';
import type { MonumentDef } from '../types';
import {
  Builder, Geo, beam, box, cyl, farMaterial, finishFar, frustum, ironFence, prism, ribbon, sparklePoints, sphere,
  updateSparkle, BRUN_EIFFEL,
} from '../kit';
import { rectRing } from '../shape2d';

export const EIFFEL = {
  H: 330, F1: 57.63, F2: 115.73, F3: 276.13,
  /** Demi-côté extérieur au sol et demi-écart intérieur entre piliers. */
  OUT0: 62.45, IN0: 37.12,
  /** Demi-côtés extérieurs des plateformes. */
  P1: 35.35, P2: 20.48, P3: 9.33,
  /** Altitude où les quatre piliers se rejoignent en un fût unique, et plateforme intermédiaire. */
  MERGE: 172, MID: 196,
} as const;

/** Interpolation cubique monotone sur des nœuds (y, valeur) ; `m0` = pente imposée au premier nœud. */
function curve(knots: readonly (readonly [number, number])[], m0?: number): (y: number) => number {
  const n = knots.length;
  const d: number[] = [];
  for (let k = 0; k < n - 1; k++) d.push((knots[k + 1][1] - knots[k][1]) / (knots[k + 1][0] - knots[k][0]));
  const m: number[] = [];
  for (let k = 0; k < n; k++) {
    let v = k === 0 ? (m0 ?? d[0]) : k === n - 1 ? d[n - 2] : (d[k - 1] + d[k]) / 2;
    const lim = 3 * Math.min(Math.abs(k > 0 ? d[k - 1] : d[0]), Math.abs(k < n - 1 ? d[k] : d[n - 2]));
    if (Math.abs(v) > lim) v = Math.sign(v) * lim;
    m.push(v);
  }
  return (y: number): number => {
    if (y <= knots[0][0]) return knots[0][1];
    if (y >= knots[n - 1][0]) return knots[n - 1][1];
    let k = 0;
    while (k < n - 2 && y > knots[k + 1][0]) k++;
    const h = knots[k + 1][0] - knots[k][0], t = (y - knots[k][0]) / h;
    const t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * knots[k][1] + (t3 - 2 * t2 + t) * h * m[k] + (-2 * t3 + 3 * t2) * knots[k + 1][1] + (t3 - t2) * h * m[k + 1];
  };
}

/** Demi-largeur de l'enveloppe extérieure et de la face intérieure des piliers, selon l'altitude. */
export const outerAt = curve([[0, EIFFEL.OUT0], [EIFFEL.F1, 33.0], [EIFFEL.F2, 18.7], [150, 13.3], [EIFFEL.MID, 8.9], [240, 6.3], [EIFFEL.F3, 5.0]], -1 / Math.tan((54 * Math.PI) / 180));
export const innerAt = curve([[0, EIFFEL.IN0], [EIFFEL.F1, 18.3], [EIFFEL.F2, 8.3], [150, 3.1], [EIFFEL.MERGE, 0]], -1 / Math.tan((54 * Math.PI) / 180));

const LEVELS = [
  4, 17, 30, 42, 50, EIFFEL.F1, 62, 73, 84, 95, 104, 110.5, EIFFEL.F2, 121, 133, 145, 156, 164, EIFFEL.MERGE, 180, 188, EIFFEL.MID,
  206, 216, 226, 236, 246, 256, 266, EIFFEL.F3,
];

type P2 = [number, number];
/** Coin c (0 = extérieur, 1 et 3 = latéraux, 2 = intérieur) du pilier du quadrant (+x, +z) à l'altitude y. */
function corner(c: number, y: number): P2 {
  const o = outerAt(y), i = Math.max(0, innerAt(y));
  return c === 0 ? [o, o] : c === 1 ? [o, i] : c === 2 ? [i, i] : [i, o];
}

function build(quality: QualityLevel): THREE.Group {
  const b = new Builder();
  const iron = new Geo(), fine = new Geo(), coarse = new Geo(), stone = new Geo(), glass = new Geo();
  const spark: number[] = [];
  const rich = quality === 'haut' || quality === 'ultra';
  const step = quality === 'bas' ? 12 : 6.5;
  const chordW = (y: number): number => 1.05 - 0.55 * Math.min(1, y / EIFFEL.F3);
  const quarter = (g: Geo, into: Geo): void => { for (let k = 0; k < 4; k++) into.append(k === 0 ? g : g.clone().rotateY((k * Math.PI) / 2)); };
  const sparkQuarter = (pts: number[]): void => {
    for (let k = 0; k < 4; k++) {
      const c = Math.cos((k * Math.PI) / 2), s = Math.sin((k * Math.PI) / 2);
      for (let i = 0; i < pts.length; i += 3) spark.push(pts[i] * c + pts[i + 2] * s, pts[i + 1], -pts[i] * s + pts[i + 2] * c);
    }
  };

  // ── un pilier (quadrant +x, +z) : arbalétriers, ceintures, croix, treillis fin ──
  const pIron = new Geo(), pFine = new Geo(), pSpark: number[] = [];
  // arbalétriers : polylignes suivant la courbure
  for (let c = 0; c < 4; c++) {
    const yTop = c === 0 ? EIFFEL.F3 : c === 2 ? EIFFEL.MERGE : EIFFEL.MID;
    for (let l = 0; l < LEVELS.length - 1; l++) {
      const ya = LEVELS[l], yb = LEVELS[l + 1];
      if (ya >= yTop) break;
      const n = Math.max(1, Math.ceil((yb - ya) / step));
      for (let s = 0; s < n; s++) {
        const y0 = ya + ((yb - ya) * s) / n, y1 = ya + ((yb - ya) * (s + 1)) / n;
        const p0 = corner(c, y0), p1 = corner(c, y1);
        // au-dessus de la jonction, les arbalétriers latéraux de deux piliers voisins se confondent : un seul sur deux
        if (c === 3 && y0 >= EIFFEL.MERGE) continue;
        const w = chordW(y0) * (c === 0 || y0 < EIFFEL.MERGE ? 1 : 0.7);
        pIron.append(beam(p0[0], y0, p0[1], p1[0], y1, p1[1], w, w));
        if (c === 0 || y0 < EIFFEL.F2) {
          // ampoules du scintillement : posées sur la face extérieure de l'arbalétrier (hors de la matière)
          const mid = (outerAt(y0) + Math.max(0, innerAt(y0))) / 2, nq = c === 0 ? 3 : 2;
          for (let q = 0; q < nq; q++) {
            const t = (q + 0.5) / nq, x = p0[0] + (p1[0] - p0[0]) * t, z = p0[1] + (p1[1] - p0[1]) * t;
            const dx = x - mid, dz = z - mid, dl = Math.hypot(dx, dz) || 1;
            pSpark.push(x + (dx / dl) * (w * 0.5 + 0.55), y0 + (y1 - y0) * t, z + (dz / dl) * (w * 0.5 + 0.55));
          }
        }
      }
    }
  }
  // panneaux : ceinture horizontale à chaque niveau, croix de Saint-André, plan de treillis fin
  for (let l = 0; l < LEVELS.length - 1; l++) {
    const ya = LEVELS[l], yb = LEVELS[l + 1];
    const zone = ya < EIFFEL.MERGE ? 0 : ya < EIFFEL.MID ? 1 : 2;
    const faces: [number, number][] = zone === 0 ? [[0, 1], [1, 2], [2, 3], [3, 0]] : zone === 1 ? [[0, 1], [3, 0]] : [[0, 0]];
    const w = chordW(ya);
    for (const [ca, cb] of faces) {
      let a0: P2, a1: P2, b0: P2, b1: P2;
      if (zone === 2) {
        // fût unique : une face entière du carré (de (o, −o) à (o, o)), les trois autres par rotation
        const oa = outerAt(ya), ob = outerAt(yb);
        a0 = [oa, -oa]; a1 = [oa, oa]; b0 = [ob, -ob]; b1 = [ob, ob];
      } else { a0 = corner(ca, ya); a1 = corner(cb, ya); b0 = corner(ca, yb); b1 = corner(cb, yb); }
      const span = Math.hypot(a1[0] - a0[0], a1[1] - a0[1]);
      if (span < 0.4) continue;
      pIron.append(beam(a0[0], ya, a0[1], a1[0], ya, a1[1], w * 0.6, w * 0.6));
      pIron.append(beam(a0[0], ya, a0[1], b1[0], yb, b1[1], w * 0.52, w * 0.4));
      pIron.append(beam(a1[0], ya, a1[1], b0[0], yb, b0[1], w * 0.52, w * 0.4));
      if (rich && zone === 0 && yb - ya > 9) {
        // contreventement secondaire : traverse à mi-hauteur et losange
        const ym = (ya + yb) / 2;
        const m0: P2 = [(a0[0] + b0[0]) / 2, (a0[1] + b0[1]) / 2], m1: P2 = [(a1[0] + b1[0]) / 2, (a1[1] + b1[1]) / 2];
        const ta: P2 = [(a0[0] + a1[0]) / 2, (a0[1] + a1[1]) / 2], tb: P2 = [(b0[0] + b1[0]) / 2, (b0[1] + b1[1]) / 2];
        pIron.append(beam(m0[0], ym, m0[1], m1[0], ym, m1[1], w * 0.36, w * 0.3));
        for (const [p, py, q, qy] of [[m0, ym, ta, ya], [m0, ym, tb, yb], [m1, ym, ta, ya], [m1, ym, tb, yb]] as const) pIron.append(beam(p[0], py, p[1], q[0], qy, q[1], w * 0.3, w * 0.26));
      }
      const rep = Math.max(1, Math.round((yb - ya) / Math.max(4, span)));
      pFine.face(a0[0], ya, a0[1], a1[0], ya, a1[1], b1[0], yb, b1[1], b0[0], yb, b0[1], 0, 0, { u1: 1, v1: rep });
    }
  }
  quarter(pIron, iron); quarter(pFine, fine); sparkQuarter(pSpark);

  // ── un côté (face +z) : arc décoratif, tympan ajouré, poutres de ceinture des 1er et 2e étages ──
  const sIron = new Geo(), sCoarse = new Geo(), sFine = new Geo(), sSpark: number[] = [];
  const R = 37, CY = 2, TH = 4.6, BELT1 = 50;
  const segs = quality === 'bas' ? 16 : 30;
  const arcPt = (t: number, r: number): [number, number, number] => { const y = CY + r * Math.sin(t); return [r * Math.cos(t), y, outerAt(y) + 0.45]; };
  for (let k = 0; k < segs; k++) {
    const t0 = Math.PI - (k / segs) * Math.PI, t1 = Math.PI - ((k + 1) / segs) * Math.PI;
    const i0 = arcPt(t0, R), i1 = arcPt(t1, R), e0 = arcPt(t0, R + TH), e1 = arcPt(t1, R + TH);
    sCoarse.face(i0[0], i0[1], i0[2], i1[0], i1[1], i1[2], e1[0], e1[1], e1[2], e0[0], e0[1], e0[2], k, 0, { u1: k + 1, v1: 1 });
    sIron.append(beam(i0[0], i0[1], i0[2], i1[0], i1[1], i1[2], 0.7, 0.9));
    sIron.append(beam(e0[0], e0[1], e0[2], e1[0], e1[1], e1[2], 0.6, 0.8));
    sIron.append(beam(i0[0], i0[1], i0[2], e0[0], e0[1], e0[2], 0.35, 0.5));
    sSpark.push((i0[0] + i1[0]) / 2, (i0[1] + i1[1]) / 2 - 0.6, (i0[2] + i1[2]) / 2 + 0.95);
    sSpark.push((e0[0] + e1[0]) / 2, (e0[1] + e1[1]) / 2 + 0.6, (e0[2] + e1[2]) / 2 + 0.95);
    // tympan entre l'arc et la poutre du premier étage
    const half = innerAt(BELT1) + 0.5;
    if (Math.abs(e0[0]) < half && Math.abs(e1[0]) < half && e0[1] < BELT1 - 0.5 && e1[1] < BELT1 - 0.5) {
      const zt = outerAt(BELT1) + 0.45;
      sFine.face(e0[0], e0[1], e0[2], e1[0], e1[1], e1[2], e1[0], BELT1, zt, e0[0], BELT1, zt, k * 0.5, 0, { u1: (k + 1) * 0.5, v1: Math.max(0.25, (BELT1 - e0[1]) / 9) });
      sIron.append(beam(e0[0], e0[1], e0[2], e0[0], BELT1, zt, 0.3, 0.3));
    }
  }
  // poutres de ceinture (treillis) entre piliers, sous chaque plancher
  for (const [y0, y1] of [[BELT1, EIFFEL.F1], [110.5, EIFFEL.F2]] as const) {
    const h0 = innerAt(y0), h1 = innerAt(y1), z0 = outerAt(y0) + 0.3, z1 = outerAt(y1) + 0.3;
    const rep = Math.max(1, Math.round((2 * h0) / (y1 - y0)));
    sCoarse.face(-h0, y0, z0, h0, y0, z0, h1, y1, z1, -h1, y1, z1, 0, 0, { u1: rep, v1: 1 });
    sIron.append(beam(-h0, y0, z0, h0, y0, z0, 0.8, 0.8)).append(beam(-h1, y1, z1, h1, y1, z1, 0.8, 0.8));
  }
  quarter(sIron, iron); quarter(sCoarse, coarse); quarter(sFine, fine); sparkQuarter(sSpark);

  // ── plateformes : planchers, frises pleines, garde-corps ajourés, pavillons ──
  const deck = (half: number, y: number, th: number, hole = 0): void => {
    const ring = rectRing(0, 0, half * 2, half * 2);
    iron.append(prism(ring, y - th, y, { bottom: true }, hole > 0 ? [rectRing(0, 0, hole * 2, hole * 2).reverse().reduce<number[]>((acc, _v, i, arr) => (i % 2 === 0 ? acc.concat([arr[i + 1], arr[i]]) : acc), [])] : []));
  };
  const gallery = (half: number, y0: number, y1: number, tile: number, frieze: number): void => {
    const ring = rectRing(0, 0, half * 2, half * 2);
    const rb = ribbon(ring, y0 + frieze, y1, true, 1);
    rb.scaleUv(1 / tile, 1);
    coarse.append(rb);
    if (frieze > 0) iron.append(prism(ring, y0, y0 + frieze, { top: false })).append(prism(rectRing(0, 0, half * 2 - 0.6, half * 2 - 0.6), y0, y0 + frieze, { top: false }).scale(1, 1, 1));
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      iron.append(beam(ring[2 * i], y1, ring[2 * i + 1], ring[2 * j], y1, ring[2 * j + 1], 0.35, 0.35));
      const n = Math.round((half * 2) / 2.6);
      const k = 1 + 0.6 / half;
      for (let q = 0; q < n; q++) spark.push((ring[2 * i] + ((ring[2 * j] - ring[2 * i]) * (q + 0.5)) / n) * k, y1 + 0.3, (ring[2 * i + 1] + ((ring[2 * j + 1] - ring[2 * i + 1]) * (q + 0.5)) / n) * k);
    }
  };
  /** Solives apparentes sous un plancher (quadrillage de poutres), visibles quand on lève la tête. */
  const joists = (half: number, y: number, n: number, hole = 0): void => {
    for (let i = 0; i <= n; i++) {
      const t = -half + (2 * half * i) / n;
      if (Math.abs(t) < hole - 0.5) {
        // de part et d'autre du vide central
        for (const s of [-1, 1]) iron.append(beam(t, y, s * hole, t, y, s * half, 0.5, 0.9)).append(beam(s * hole, y, t, s * half, y, t, 0.9, 0.5));
      } else iron.append(beam(t, y, -half, t, y, half, 0.5, 0.9)).append(beam(-half, y, t, half, y, t, 0.9, 0.5));
    }
  };
  // 1er étage : plancher évidé au centre, galerie à arcatures, pavillons vitrés
  deck(EIFFEL.P1, EIFFEL.F1, 0.9, 13);
  joists(EIFFEL.P1 - 0.4, EIFFEL.F1 - 1.4, 10, 13);
  gallery(EIFFEL.P1, EIFFEL.F1, EIFFEL.F1 + 4.6, 4.6, 1.3);
  for (let k = 0; k < 4; k++) {
    glass.append(box(26, 4.2, 7.5).translate(0, EIFFEL.F1, 24.5).rotateY((k * Math.PI) / 2));
    iron.append(box(27, 0.4, 8.5, { bottom: true }).translate(0, EIFFEL.F1 + 4.2, 24.5).rotateY((k * Math.PI) / 2));
  }
  // 2e étage : deux niveaux
  deck(EIFFEL.P2, EIFFEL.F2, 0.8);
  joists(EIFFEL.P2 - 0.3, EIFFEL.F2 - 1.3, 8);
  gallery(EIFFEL.P2, EIFFEL.F2, EIFFEL.F2 + 4.4, 4.4, 1.0);
  deck(16.5, EIFFEL.F2 + 4.6, 0.5);
  gallery(16.5, EIFFEL.F2 + 4.6, EIFFEL.F2 + 6.0, 1.4, 0);
  glass.append(box(20, 3.6, 20).translate(0, EIFFEL.F2, 0));
  // plateforme intermédiaire
  deck(10.6, EIFFEL.MID, 0.5);
  gallery(10.6, EIFFEL.MID, EIFFEL.MID + 1.3, 1.3, 0);
  // 3e étage : plancher en encorbellement, cabine vitrée, pont supérieur grillagé
  deck(EIFFEL.P3, EIFFEL.F3, 0.7);
  for (let k = 0; k < 4; k++) iron.append(beam(outerAt(264), 264, outerAt(264), EIFFEL.P3 - 0.3, EIFFEL.F3 - 0.7, EIFFEL.P3 - 0.3, 0.4, 0.4).rotateY((k * Math.PI) / 2));
  glass.append(box(15.6, 2.98, 15.6).translate(0, EIFFEL.F3, 0));
  gallery(EIFFEL.P3, EIFFEL.F3, EIFFEL.F3 + 1.2, 1.2, 0);
  deck(8.6, EIFFEL.F3 + 2.98, 0.35);
  const cage = ribbon(rectRing(0, 0, 16.4, 16.4), EIFFEL.F3 + 2.98, EIFFEL.F3 + 6.2, true, 2);
  cage.scaleUv(1 / 1.6, 1);
  fine.append(cage);
  iron.append(frustum(17.2, 17.2, 9.5, 9.5, 1.3, { bottom: true }).translate(0, EIFFEL.F3 + 6.2, 0));
  // campanile : quatre arcs, lanterne du phare, mât d'antennes
  const yc = EIFFEL.F3 + 7.5;
  for (let k = 0; k < 4; k++) {
    const g = new Geo();
    let px = 4.6, py = yc;
    for (let s = 1; s <= 6; s++) {
      const t = s / 6, x = 4.6 - 3.4 * Math.sin((t * Math.PI) / 2) ** 1.4, y = yc + 9.5 * t;
      g.append(beam(px, py, px, x, y, x, 0.34, 0.34));
      px = x; py = y;
    }
    iron.append(g.rotateY((k * Math.PI) / 2));
  }
  glass.append(cyl(1.7, 1.7, 3.2, 10).translate(0, yc + 9.5, 0));
  iron.append(cyl(2.1, 0.5, 2.0, 10).translate(0, yc + 12.7, 0));
  const mastY = yc + 14.7;                              // ≈ 298 m
  iron.append(cyl(0.55, 0.22, EIFFEL.H - mastY, 6).translate(0, mastY, 0));
  for (const [y, r, h] of [[302, 1.5, 5.5], [309.5, 1.2, 4.5], [316, 0.9, 4], [321.5, 0.6, 3]] as const) {
    for (let k = 0; k < 4; k++) iron.append(box(r * 1.2, h, 0.25, { bottom: true }).translate(0, y, r).rotateY((k * Math.PI) / 2 + Math.PI / 4));
    iron.append(cyl(r * 1.15, r * 1.15, 0.2, 8, { bottom: true }).translate(0, y - 0.2, 0));
  }
  for (let y = mastY; y < EIFFEL.H; y += 2.2) spark.push(0, y, 0.9);
  // cage d'ascenseur et escalier axiaux, du 2e au 3e étage
  for (let k = 0; k < 4; k++) iron.append(beam(1.9, EIFFEL.F2 + 4.6, 1.9, 1.9, EIFFEL.F3, 1.9, 0.28, 0.28).rotateY((k * Math.PI) / 2));

  // ── au sol : massifs de maçonnerie sous chaque arbalétrier, guichets, grilles ──
  for (let c = 0; c < 4; c++) {
    // massif de 7 m contenu dans le soubassement réel de 25 m (du demi-écart intérieur au demi-côté extérieur)
    const p = corner(c, 2.2), lo = EIFFEL.IN0 + 3.5, hi = EIFFEL.OUT0 - 3.5;
    stone.append(frustum(7, 7, 5.2, 5.2, 4.3).translate(Math.min(hi, Math.max(lo, p[0])), 0, Math.min(hi, Math.max(lo, p[1]))));
  }
  const mid = (EIFFEL.OUT0 + EIFFEL.IN0) / 2;
  stone.append(box(9, 3.4, 9).translate(mid, 0, mid));
  const quarterStone = new Geo();
  quarter(stone, quarterStone);
  b.add('pierre_grise', quarterStone);
  for (let k = 0; k < 4; k++) {
    b.push(new THREE.Matrix4().makeRotationY((k * Math.PI) / 2));
    ironFence(b, rectRing(mid, mid, EIFFEL.OUT0 - EIFFEL.IN0 + 1.2, EIFFEL.OUT0 - EIFFEL.IN0 + 1.2), { height: 2.2, closed: true, mat: 'grille' });
    b.pop();
  }

  b.add('fer_eiffel', iron);
  b.add('treillis_eiffel_fin', fine);
  b.add('treillis_eiffel', coarse);
  b.add('verre', glass);
  b.add('flamme', sphere(0.9, 8, 5).translate(0, yc + 13.9, 0));
  const points = sparklePoints(spark, 1);
  b.addObject(points);
  const group = b.build('tour_eiffel');
  group.userData.sparkle = points;
  return group;
}

function buildFar(): THREE.Group {
  const b = new Builder();
  const iron = farMaterial(BRUN_EIFFEL, 3.0, 0xffd488);
  const g = new Geo();
  const ys = [0, 30, EIFFEL.F1, 86, EIFFEL.F2, 145, EIFFEL.MERGE];
  // piliers : quatre pans par pilier, puis fût unique
  const pillar = new Geo();
  for (let l = 0; l < ys.length - 1; l++) {
    const ya = ys[l], yb = ys[l + 1];
    for (const [ca, cb] of [[0, 1], [1, 2], [2, 3], [3, 0]] as const) {
      const a0 = corner(ca, ya), a1 = corner(cb, ya), b0 = corner(ca, yb), b1 = corner(cb, yb);
      if (Math.hypot(a1[0] - a0[0], a1[1] - a0[1]) < 0.5) continue;
      pillar.face(a0[0], ya, a0[1], a1[0], ya, a1[1], b1[0], yb, b1[1], b0[0], yb, b0[1]);
    }
  }
  for (let k = 0; k < 4; k++) g.append(k === 0 ? pillar : pillar.clone().rotateY((k * Math.PI) / 2));
  const shaft = [EIFFEL.MERGE, 215, 250, EIFFEL.F3];
  for (let l = 0; l < shaft.length - 1; l++) {
    const oa = outerAt(shaft[l]), ob = outerAt(shaft[l + 1]);
    g.append(frustum(oa * 2, oa * 2, ob * 2, ob * 2, shaft[l + 1] - shaft[l], { top: false }).translate(0, shaft[l], 0));
  }
  // arcs : bandeau en demi-cercle sur chaque face
  const arc = new Geo();
  for (let k = 0; k < 6; k++) {
    const t0 = Math.PI - (k / 6) * Math.PI, t1 = Math.PI - ((k + 1) / 6) * Math.PI;
    const p = (t: number, r: number): [number, number, number] => { const y = 2 + r * Math.sin(t); return [r * Math.cos(t), y, outerAt(y) + 0.4]; };
    const i0 = p(t0, 37), i1 = p(t1, 37), e0 = p(t0, 42), e1 = p(t1, 42);
    arc.face(i0[0], i0[1], i0[2], i1[0], i1[1], i1[2], e1[0], e1[1], e1[2], e0[0], e0[1], e0[2]);
  }
  for (let k = 0; k < 4; k++) g.append(arc.clone().rotateY((k * Math.PI) / 2));
  // plateformes et flèche
  g.append(box(EIFFEL.P1 * 2, 11, EIFFEL.P1 * 2, { bottom: true }).translate(0, 51, 0));
  g.append(box(EIFFEL.P2 * 2, 10, EIFFEL.P2 * 2, { bottom: true }).translate(0, 111, 0));
  g.append(box(EIFFEL.P3 * 2, 8, EIFFEL.P3 * 2, { bottom: true }).translate(0, EIFFEL.F3 - 1, 0));
  g.append(cyl(4.5, 1.2, 15, 4, { top: false }).translate(0, EIFFEL.F3 + 7, 0));
  g.append(cyl(1.0, 0.25, EIFFEL.H - EIFFEL.F3 - 22, 4, { top: false }).translate(0, EIFFEL.F3 + 22, 0));
  b.add(iron, g);
  // scintillement visible de loin : points le long des arêtes
  const spark: number[] = [];
  for (let k = 0; k < 4; k++) {
    const c = Math.cos((k * Math.PI) / 2), s = Math.sin((k * Math.PI) / 2);
    for (let y = 4; y < EIFFEL.F3; y += 4) {
      const p = corner(0, y);
      p[0] += 1.2; p[1] += 1.2;
      spark.push(p[0] * c + p[1] * s, y, -p[0] * s + p[1] * c);
      if (y < EIFFEL.F2) { const q = corner(1, y); q[0] += 1.2; spark.push(q[0] * c + q[1] * s, y, -q[0] * s + q[1] * c); }
    }
  }
  for (let y = EIFFEL.F3 + 12; y < EIFFEL.H; y += 4) spark.push(0, y, 1.6);
  const points = sparklePoints(spark, 1.4);
  b.addObject(points);
  const group = finishFar(b, 'tour_eiffel');
  group.userData.sparkle = points;
  return group;
}

export const def: MonumentDef = {
  key: 'tour_eiffel',
  name: 'Tour Eiffel',
  radius: 90,
  height: EIFFEL.H,
  build(_site, quality) { return build(quality); },
  buildFar() { return buildFar(); },
  animate(object, frame) {
    const points = object.userData.sparkle as THREE.Points | undefined;
    if (points) updateSparkle(points, frame.time, frame.sparkle * (frame.night > 0.3 ? 1 : 0));
  },
};
