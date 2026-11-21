/* =====================================================================================
 * CARTE DE PARIS — découpage par tuile et réparation des contours
 * -------------------------------------------------------------------------------------
 * Découpage : un polygone (contour et trous ensemble) est coupé par les droites de la grille
 * des tuiles ; chaque morceau est un polygone simple avec ses propres trous. Les polylignes
 * passent par clipPolylineToRect de mapdata.ts.
 * Réparation : les rares contours des sources qui se recoupent (épines, nœuds papillon, trou
 * qui frôle le contour) sont ramenés à des anneaux simples à la précision du format.
 * ===================================================================================== */
import { M, T, hasTile, signedArea, orient, dedupeRing, bboxOf } from './build-lib.mjs';

/** L'anneau se recoupe-t-il une fois arrondi au décimètre (la précision du format) ? */
export function selfIntersectsAtFormatPrecision(ring) {
  const q = new Array(ring.length);
  for (let i = 0; i < ring.length; i++) q[i] = Math.round(ring[i] * 10) / 10;
  return M.ringSelfIntersects(q);
}

/**
 * Retire les « épines » d'un anneau : un sommet où le contour rebrousse chemin sur lui-même
 * (aller-retour sans surface, artefact de saisie). Répété jusqu'à stabilité.
 */
export function removeSpikes(ring) {
  let pts = Array.from(ring);
  for (let pass = 0; pass < 8; pass++) {
    const n = pts.length >> 1;
    if (n <= 3) break;
    const out = [];
    let removed = false;
    for (let i = 0; i < n; i++) {
      const p = (i + n - 1) % n, q = (i + 1) % n;
      const ax = pts[2 * i] - pts[2 * p], az = pts[2 * i + 1] - pts[2 * p + 1];
      const bx = pts[2 * q] - pts[2 * i], bz = pts[2 * q + 1] - pts[2 * i + 1];
      const la = Math.hypot(ax, az), lb = Math.hypot(bx, bz);
      // Demi-tour : produit scalaire négatif et écart latéral inférieur à 8 % du plus court des deux côtés (au plus 15 cm).
      if (la > 0 && lb > 0 && ax * bx + az * bz < 0 && Math.abs(ax * bz - az * bx) / Math.max(la, lb) < Math.min(0.15, 0.08 * Math.min(la, lb))) { removed = true; continue; }
      out.push(pts[2 * i], pts[2 * i + 1]);
    }
    pts = out;
    if (!removed) break;
  }
  return pts;
}

/**
 * Défait les croisements d'un anneau : à chaque paire de côtés qui se croisent, l'anneau est coupé
 * au point de croisement en deux anneaux, traités à leur tour. Retourne des anneaux simples,
 * antihoraires, d'au moins `minArea` m² (un « nœud papillon » donne ses deux lobes ; une boucle
 * parasite minuscule disparaît). Sert de réparation aux rares contours invalides des sources.
 */
export function unkinkRing(ring, minArea = 0.5) {
  const out = [];
  const todo = [Array.from(ring)];
  let guard = 0;
  while (todo.length > 0 && guard++ < 200) {
    const r = dedupeRing(todo.pop(), 1e-6);
    const n = r.length >> 1;
    if (n < 3) continue;
    let cut = null;
    for (let i = 0; i < n && cut === null; i++) {
      const i2 = (i + 1) % n;
      const x1 = r[2 * i], z1 = r[2 * i + 1], x2 = r[2 * i2], z2 = r[2 * i2 + 1];
      for (let j = i + 2; j < n; j++) {
        const j2 = (j + 1) % n;
        if (j2 === i) continue;
        const x3 = r[2 * j], z3 = r[2 * j + 1], x4 = r[2 * j2], z4 = r[2 * j2 + 1];
        const d1 = (x4 - x3) * (z1 - z3) - (z4 - z3) * (x1 - x3);
        const d2 = (x4 - x3) * (z2 - z3) - (z4 - z3) * (x2 - x3);
        const d3 = (x2 - x1) * (z3 - z1) - (z2 - z1) * (x3 - x1);
        const d4 = (x2 - x1) * (z4 - z1) - (z2 - z1) * (x4 - x1);
        if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
          const t = d1 / (d1 - d2);
          cut = { i, j, x: x1 + (x2 - x1) * t, z: z1 + (z2 - z1) * t };
          break;
        }
      }
    }
    if (cut === null) {
      if (Math.abs(signedArea(r)) >= minArea) out.push(orient(r, true));
      continue;
    }
    // Anneau A : X, v(i+1) … v(j) ; anneau B : X, v(j+1) … v(i).
    const a = [cut.x, cut.z], b = [cut.x, cut.z];
    for (let k = cut.i + 1; k <= cut.j; k++) a.push(r[2 * k], r[2 * k + 1]);
    for (let k = cut.j + 1; k < n + cut.i + 1; k++) b.push(r[2 * (k % n)], r[2 * (k % n) + 1]);
    todo.push(a, b);
  }
  return out;
}

/**
 * Anneaux simples À LA PRÉCISION DU FORMAT (décimètre) équivalents à un anneau qui se recoupe.
 * Le point de coupe n'étant pas sur la grille, un lobe peut se recouper de nouveau une fois
 * arrondi : on recommence, trois fois au plus. Un lobe encore invalide est rendu tel quel
 * (`unresolved` le compte) : mieux vaut un avertissement qu'une surface perdue.
 */
export function simpleRings(ring, minArea = 0.5) {
  const round = (r) => r.map((v) => Math.round(v * 10) / 10);
  let pending = [round(Array.from(ring))];
  const rings = [];
  let unresolved = 0;
  for (let pass = 0; pass < 3 && pending.length > 0; pass++) {
    const next = [];
    for (const r of pending) {
      for (const part of unkinkRing(r, minArea)) {
        const q = dedupeRing(round(part), 0.01);
        if (q.length < 6 || Math.abs(signedArea(q)) < minArea) continue;
        if (M.ringSelfIntersects(q)) next.push(q);
        else rings.push(orient(q, true));
      }
    }
    pending = next;
  }
  for (const r of pending) { rings.push(orient(r, true)); unresolved++; }
  rings.sort((a, b) => Math.abs(signedArea(b)) - Math.abs(signedArea(a)));
  return { rings, unresolved };
}

/** Enveloppe convexe d'un nuage de points plat (chaîne monotone d'Andrew), antihoraire vue de dessus. */
export function convexHull(points) {
  const pts = [];
  for (let i = 0; i + 1 < points.length; i += 2) pts.push([points[i], points[i + 1]]);
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [], upper = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  const out = [];
  for (const p of lower.concat(upper)) out.push(p[0], p[1]);
  return orient(out, true);
}


// ─────────────────────────────────────────────────────────────────────────────────────
// Découpage par tuile
// ─────────────────────────────────────────────────────────────────────────────────────

/**
 * Coupe un polygone (outer antihoraire + trous horaires) par la droite coord[axis] = c.
 * Retourne { lo, hi } : listes de polygones de chaque côté, ou null si la géométrie ne permet
 * pas un découpage propre (anneau qui se recoupe) — l'appelant se replie alors sur
 * Sutherland–Hodgman.
 */
export function splitPolygon(poly, axis, c) {
  const rings = [poly.outer, ...poly.holes];
  const whole = [[], []];           // anneaux entièrement d'un côté : { ring, isOuter }
  const chains = [[], []];          // chaînes ouvertes par côté : { pts, tIn, tOut }
  const o = 1 - axis;
  for (let r = 0; r < rings.length; r++) {
    const ring = rings[r];
    const n = ring.length >> 1;
    let any0 = false, any1 = false;
    for (let i = 0; i < n; i++) {
      if (ring[2 * i + axis] > c) any1 = true; else any0 = true;
    }
    if (!any1) { whole[0].push({ ring, isOuter: r === 0 }); continue; }
    if (!any0) { whole[1].push({ ring, isOuter: r === 0 }); continue; }
    // Départ sur un changement de côté, pour que chaque chaîne soit entière.
    let start = -1;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      if (ring[2 * i + axis] > c !== ring[2 * j + axis] > c) { start = j; break; }
    }
    let cur = null;
    for (let k = 0; k < n; k++) {
      const i = (start + k) % n, p = (i + n - 1) % n;
      const side = ring[2 * i + axis] > c ? 1 : 0;
      const prevSide = ring[2 * p + axis] > c ? 1 : 0;
      if (side !== prevSide) {
        // Intersection du côté p -> i avec la droite.
        const va = ring[2 * p + axis], vb = ring[2 * i + axis];
        const t = (c - va) / (vb - va);
        const w = ring[2 * p + o] + (ring[2 * i + o] - ring[2 * p + o]) * t;
        const X = axis === 0 ? [c, w] : [w, c];
        if (cur !== null) {
          cur.pts.push(X[0], X[1]);
          cur.tOut = w;
          chains[prevSide].push(cur);
        }
        cur = { pts: [X[0], X[1]], tIn: w, tOut: 0 };
      }
      cur.pts.push(ring[2 * i], ring[2 * i + 1]);
    }
    // Fermeture : la dernière chaîne sort par le premier changement de côté.
    {
      const i = start, p = (start + n - 1) % n;
      const va = ring[2 * p + axis], vb = ring[2 * i + axis];
      const t = (c - va) / (vb - va);
      const w = ring[2 * p + o] + (ring[2 * i + o] - ring[2 * p + o]) * t;
      const X = axis === 0 ? [c, w] : [w, c];
      cur.pts.push(X[0], X[1]);
      cur.tOut = w;
      chains[ring[2 * p + axis] > c ? 1 : 0].push(cur);
    }
  }
  const result = [[], []];
  for (let side = 0; side < 2; side++) {
    const list = chains[side];
    const outers = [], holes = [];
    for (const w of whole[side]) (w.isOuter ? outers : holes).push(w.ring);
    if (list.length > 0) {
      // Événements triés le long de la droite : chaque intervalle intérieur relie une sortie à une entrée.
      const ev = [];
      for (let k = 0; k < list.length; k++) {
        ev.push({ t: list[k].tIn, chain: k, entry: true });
        ev.push({ t: list[k].tOut, chain: k, entry: false });
      }
      ev.sort((a, b) => a.t - b.t || (a.entry === b.entry ? 0 : a.entry ? 1 : -1));
      if (ev.length % 2 !== 0) return null;
      const nextOf = new Int32Array(list.length).fill(-1);
      for (let k = 0; k < ev.length; k += 2) {
        const a = ev[k];
        let b = ev[k + 1];
        if (a.entry === b.entry) {
          // Deux événements au même endroit (sommet posé sur la droite) : l'ordre du tri est arbitraire, on essaie l'autre.
          const c = ev[k + 2];
          if (c === undefined || c.t !== b.t || c.entry === a.entry) return null;
          ev[k + 1] = c;
          ev[k + 2] = b;
          b = c;
        }
        const exit = a.entry ? b : a, entry = a.entry ? a : b;
        if (nextOf[exit.chain] !== -1) return null;
        nextOf[exit.chain] = entry.chain;
      }
      const used = new Uint8Array(list.length);
      for (let k = 0; k < list.length; k++) {
        if (used[k]) continue;
        const ring = [];
        let cur = k, guard = 0;
        while (!used[cur]) {
          used[cur] = 1;
          const pts = list[cur].pts;
          for (let q = 0; q < pts.length; q++) ring.push(pts[q]);
          cur = nextOf[cur];
          if (cur < 0 || ++guard > list.length) return null;
        }
        if (cur !== k) return null;
        const clean = dedupeRing(ring, 1e-7);
        if (clean.length < 6) continue;
        const area = signedArea(clean);
        if (Math.abs(area) < 0.005) continue;
        (area > 0 ? outers : holes).push(clean);
      }
    }
    // Rattache chaque trou à l'anneau extérieur qui le contient.
    const polys = outers.map((outer) => ({ outer, holes: [] }));
    for (const h of holes) {
      for (const p of polys) {
        // Un sommet du trou peut être sur le bord : on en essaie plusieurs.
        let inside = 0, tested = 0;
        for (let i = 0; i < h.length && tested < 5; i += 2 * Math.max(1, Math.floor(h.length / 10))) {
          tested++;
          if (M.pointInRing(p.outer, h[i], h[i + 1])) inside++;
        }
        if (inside * 2 > tested) { p.holes.push(h); break; }
      }
    }
    result[side] = polys;
  }
  return { lo: result[0], hi: result[1] };
}

/** Repli : découpage Sutherland–Hodgman anneau par anneau (côtés confondus possibles sur le bord). */
function clipFallback(poly, rect) {
  const outer = M.clipRingToRect(poly.outer, rect);
  if (outer.length < 6) return null;
  const holes = [];
  for (const h of poly.holes) {
    const c = M.clipRingToRect(h, rect);
    if (c.length >= 6) holes.push(c);
  }
  return { outer, holes };
}

/** Statistiques du découpage (lues par le rapport). */
export const clipStats = { whole: 0, split: 0, fallback: 0 };

/**
 * Répartit un polygone dans les tuiles qu'il recouvre : retourne [{ tx, tz, poly }]. Un polygone
 * contenu dans une seule tuile n'est pas touché. Les morceaux hors des tuiles de la carte sont
 * abandonnés.
 */
export function tilePolygon(poly) {
  const b = bboxOf(poly.outer);
  const tx0 = Math.floor(b.minX / T), tx1 = Math.floor((b.maxX - 1e-9) / T);
  const tz0 = Math.floor(b.minZ / T), tz1 = Math.floor((b.maxZ - 1e-9) / T);
  const out = [];
  if (tx0 === tx1 && tz0 === tz1) {
    clipStats.whole++;
    if (hasTile(tx0, tz0)) out.push({ tx: tx0, tz: tz0, poly });
    return out;
  }
  let failed = false;
  // Découpe récursive par dichotomie : d'abord en colonnes, puis chaque colonne en lignes.
  const rec = (p, axis, lo, hi, fixed) => {
    if (failed) return;
    if (lo === hi) {
      if (axis === 0) {
        const bb = bboxOf(p.outer);
        rec(p, 1, Math.max(tz0, Math.floor(bb.minZ / T)), Math.min(tz1, Math.floor((bb.maxZ - 1e-9) / T)), lo);
      } else if (hasTile(fixed, lo)) out.push({ tx: fixed, tz: lo, poly: p });
      return;
    }
    const mid = (lo + hi + 1) >> 1;
    const parts = splitPolygon(p, axis, mid * T);
    if (parts === null) { failed = true; return; }
    for (const q of parts.lo) rec(q, axis, lo, mid - 1, fixed);
    for (const q of parts.hi) rec(q, axis, mid, hi, fixed);
  };
  rec(poly, 0, tx0, tx1, 0);
  if (!failed) {
    clipStats.split++;
    return out;
  }
  clipStats.fallback++;
  out.length = 0;
  for (let tz = tz0; tz <= tz1; tz++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      if (!hasTile(tx, tz)) continue;
      const c = clipFallback(poly, M.tileBounds(tx, tz));
      if (c !== null) out.push({ tx, tz, poly: c });
    }
  }
  return out;
}

/** Répartit une polyligne dans les tuiles : [{ tx, tz, points }]. */
export function tilePolyline(points) {
  const b = bboxOf(points);
  const tx0 = Math.floor(b.minX / T), tx1 = Math.floor(b.maxX / T);
  const tz0 = Math.floor(b.minZ / T), tz1 = Math.floor(b.maxZ / T);
  const out = [];
  if (tx0 === tx1 && tz0 === tz1) {
    if (hasTile(tx0, tz0)) out.push({ tx: tx0, tz: tz0, points });
    return out;
  }
  for (let tz = tz0; tz <= tz1; tz++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      if (!hasTile(tx, tz)) continue;
      for (const piece of M.clipPolylineToRect(points, M.tileBounds(tx, tz))) out.push({ tx, tz, points: piece });
    }
  }
  return out;
}
