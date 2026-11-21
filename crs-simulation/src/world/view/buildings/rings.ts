/* =====================================================================================
 * IMMEUBLES — géométrie plane des anneaux (logique pure, sans Three.js ni DOM)
 * -------------------------------------------------------------------------------------
 * Convention (celle de mapdata.ts) : anneau [x0, z0, x1, z1, …] non refermé ; x = est,
 * z = sud. Un anneau extérieur tourne dans le sens antihoraire vu de dessus (aire signée
 * POSITIVE), un trou dans le sens horaire. Pour tout côté A → B d'un anneau bien orienté,
 * la matière est à GAUCHE : normale sortante (-dz, dx), normale rentrante (dz, -dx).
 *
 * Toutes les fonctions écrivent dans des tableaux fournis par l'appelant : aucune
 * allocation dans les boucles de génération.
 * ===================================================================================== */

/** Norme d'un vecteur du plan (Math.hypot est nettement plus lent dans les boucles chaudes). */
export function hyp(x: number, z: number): number {
  return Math.sqrt(x * x + z * z);
}

/** Tableau de nombres inscriptible : number[], Float32Array, Float64Array… */
export interface NumberBuffer { [i: number]: number; readonly length: number }

/** Aire signée (m²) des `n` premiers sommets : positive si antihoraire vu de dessus. */
export function ringArea(ring: ArrayLike<number>, n: number = ring.length >> 1): number {
  let s = 0;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    s += ring[2 * i] * ring[2 * j + 1] - ring[2 * j] * ring[2 * i + 1];
  }
  return s / 2;
}

/** Périmètre (m) des `n` premiers sommets. */
export function ringPerimeter(ring: ArrayLike<number>, n: number = ring.length >> 1): number {
  let p = 0;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    p += hyp(ring[2 * i] - ring[2 * j], ring[2 * i + 1] - ring[2 * j + 1]);
  }
  return p;
}

/** Le point est-il strictement dans l'anneau (règle de parité) ? */
export function pointInRing(ring: ArrayLike<number>, n: number, x: number, z: number): boolean {
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const zi = ring[2 * i + 1], zj = ring[2 * j + 1];
    if ((zi > z) !== (zj > z)) {
      const xi = ring[2 * i], xj = ring[2 * j];
      if (x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
    }
  }
  return inside;
}

/** Inverse sur place le sens de parcours des `n` premiers sommets (le premier sommet reste le premier). */
export function reverseRingInPlace(ring: NumberBuffer, n: number): void {
  for (let i = 1, j = n - 1; i < j; i++, j--) {
    const x = ring[2 * i], z = ring[2 * i + 1];
    ring[2 * i] = ring[2 * j];
    ring[2 * i + 1] = ring[2 * j + 1];
    ring[2 * j] = x;
    ring[2 * j + 1] = z;
  }
}

/**
 * Nettoie un anneau : retire les sommets répétés (à `minDist` près), les sommets alignés (écart à
 * la corde < `collinearTol`) et les aller-retours, puis impose le sens demandé.
 * Écrit dans `out` (capacité ≥ 2·nSrc) et retourne le nombre de sommets (0 si l'anneau est
 * dégénéré : moins de 3 sommets utiles ou aire quasi nulle). `nSrc` limite la lecture de `src` à
 * ses premiers sommets (tampon réutilisé plus grand que l'anneau).
 */
export function cleanRing(
  src: ArrayLike<number>, out: NumberBuffer, ccw: boolean, minDist = 0.05, collinearTol = 0.04, minArea = 0.5,
  nSrc: number = src.length >> 1,
): number {
  const n0 = nSrc;
  let n = 0;
  const minD2 = minDist * minDist;
  // 1. sommets répétés
  for (let i = 0; i < n0; i++) {
    const x = src[2 * i], z = src[2 * i + 1];
    if (!(x === x) || !(z === z) || !Number.isFinite(x) || !Number.isFinite(z)) continue;   // NaN ou infini : ignoré
    if (n > 0) {
      const dx = x - out[2 * n - 2], dz = z - out[2 * n - 1];
      if (dx * dx + dz * dz < minD2) continue;
    }
    out[2 * n] = x;
    out[2 * n + 1] = z;
    n++;
  }
  while (n > 1) {
    const dx = out[0] - out[2 * n - 2], dz = out[1] - out[2 * n - 1];
    if (dx * dx + dz * dz < minD2) n--; else break;
  }
  if (n < 3) return 0;
  // 2. sommets alignés ou en épingle (plusieurs passes : un retrait peut en révéler un autre)
  let changed = true;
  let guard = 0;
  while (changed && n >= 3 && guard++ < 8) {
    changed = false;
    let w = 0;
    for (let i = 0; i < n; i++) {
      // voisin précédent : dernier sommet déjà conservé (ou le dernier de l'anneau pour i = 0)
      const px = w > 0 ? out[2 * w - 2] : out[2 * n - 2];
      const pz = w > 0 ? out[2 * w - 1] : out[2 * n - 1];
      const cx = out[2 * i], cz = out[2 * i + 1];
      const k = i + 1 < n ? i + 1 : 0;
      // voisin suivant : si on reboucle, prendre le premier sommet conservé
      const nx = k === 0 && w > 0 ? out[0] : out[2 * k];
      const nz = k === 0 && w > 0 ? out[1] : out[2 * k + 1];
      const ex = nx - px, ez = nz - pz;
      const len = hyp(ex, ez);
      let drop = false;
      if (len < minDist) {
        drop = true;                                  // aller-retour : le précédent et le suivant coïncident
      } else {
        const dev = Math.abs((cx - px) * ez - (cz - pz) * ex) / len;
        // aligné avec ses voisins (ou pointe d'une épingle d'épaisseur nulle) : inutile
        if (dev < collinearTol) drop = true;
      }
      if (drop && n - (i - w) - 1 >= 3) { changed = true; continue; }
      out[2 * w] = cx;
      out[2 * w + 1] = cz;
      w++;
    }
    n = w;
  }
  if (n < 3) return 0;
  const a = ringArea(out, n);
  if (Math.abs(a) < minArea) return 0;
  if ((a > 0) !== ccw) reverseRingInPlace(out, n);
  return n;
}

// ─────────────────────────────────────────────────────────────────────────────────────
// Simplification (Douglas–Peucker sur anneau fermé) — pour la version lointaine
// ─────────────────────────────────────────────────────────────────────────────────────

let keepFlags = new Uint8Array(256);
let dpStack = new Int32Array(256);

function dpRange(ring: ArrayLike<number>, n: number, from: number, to: number, tol2: number): void {
  // `from` et `to` sont des indices dans l'anneau ; le tronçon va de from à to en avançant (modulo n).
  let sp = 0;
  dpStack[sp++] = from;
  dpStack[sp++] = to;
  while (sp > 0) {
    const b = dpStack[--sp], a = dpStack[--sp];
    const span = (b - a + n) % n;
    if (span < 2) continue;
    const ax = ring[2 * a], az = ring[2 * a + 1];
    const ex = ring[2 * b] - ax, ez = ring[2 * b + 1] - az;
    const l2 = ex * ex + ez * ez;
    let best = -1, bestD = tol2;
    for (let s = 1; s < span; s++) {
      const i = (a + s) % n;
      const px = ring[2 * i] - ax, pz = ring[2 * i + 1] - az;
      let d2: number;
      if (l2 < 1e-12) d2 = px * px + pz * pz;
      else {
        let t = (px * ex + pz * ez) / l2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const qx = px - t * ex, qz = pz - t * ez;
        d2 = qx * qx + qz * qz;
      }
      if (d2 > bestD) { bestD = d2; best = i; }
    }
    if (best >= 0) {
      keepFlags[best] = 1;
      if (sp + 4 > dpStack.length) { const g = new Int32Array(dpStack.length * 2); g.set(dpStack); dpStack = g; }
      dpStack[sp++] = a; dpStack[sp++] = best;
      dpStack[sp++] = best; dpStack[sp++] = b;
    }
  }
}

/**
 * Simplifie un anneau fermé à la tolérance `tol` (m). Écrit dans `out` et retourne le nombre de
 * sommets (≥ 3 ; si la simplification dégénère, l'anneau d'origine est recopié).
 */
export function simplifyRing(ring: ArrayLike<number>, n: number, tol: number, out: NumberBuffer): number {
  if (n <= 4 || tol <= 0) {
    for (let i = 0; i < 2 * n; i++) out[i] = ring[i];
    return n;
  }
  if (keepFlags.length < n) keepFlags = new Uint8Array(n * 2);
  keepFlags.fill(0, 0, n);
  // ancres : le sommet 0 et le sommet le plus éloigné de lui
  let far = 1, farD = -1;
  for (let i = 1; i < n; i++) {
    const dx = ring[2 * i] - ring[0], dz = ring[2 * i + 1] - ring[1];
    const d = dx * dx + dz * dz;
    if (d > farD) { farD = d; far = i; }
  }
  keepFlags[0] = 1;
  keepFlags[far] = 1;
  const tol2 = tol * tol;
  dpRange(ring, n, 0, far, tol2);
  dpRange(ring, n, far, 0, tol2);
  let w = 0;
  for (let i = 0; i < n; i++) {
    if (!keepFlags[i]) continue;
    out[2 * w] = ring[2 * i];
    out[2 * w + 1] = ring[2 * i + 1];
    w++;
  }
  if (w < 3 || Math.abs(ringArea(out, w)) < 0.5) {
    for (let i = 0; i < 2 * n; i++) out[i] = ring[i];
    return n;
  }
  return w;
}

// ─────────────────────────────────────────────────────────────────────────────────────
// Décalage (inset) vers la matière, distance par côté
// ─────────────────────────────────────────────────────────────────────────────────────

/** Longueur maximale d'un onglet, en multiple de la plus grande des deux distances. */
const MITER_LIMIT = 2.6;

/**
 * Décale chaque côté de l'anneau vers la MATIÈRE (à gauche du sens de parcours : vers l'intérieur
 * pour un anneau extérieur antihoraire, vers la masse bâtie pour un trou horaire).
 * `dist[i]` est le décalage du côté i (sommet i → sommet i+1) ; un nombre vaut pour tous les côtés.
 * Le sommet k du résultat est l'intersection des deux côtés décalés qui s'y rejoignent : il y a
 * exactement un sommet décalé par sommet d'origine (les quadrilatères P[i] P[i+1] Q[i+1] Q[i]
 * recouvrent la couronne). Une distance négative décale vers l'extérieur.
 * Ne valide rien : voir insetIsValid().
 */
export function insetRing(ring: ArrayLike<number>, n: number, dist: ArrayLike<number> | number, out: NumberBuffer): void {
  const uniform = typeof dist === 'number';
  for (let k = 0; k < n; k++) {
    const p = (k + n - 1) % n, q = (k + 1) % n;
    const px = ring[2 * k], pz = ring[2 * k + 1];
    // côté précédent (p → k) et côté suivant (k → q)
    let ax = px - ring[2 * p], az = pz - ring[2 * p + 1];
    let bx = ring[2 * q] - px, bz = ring[2 * q + 1] - pz;
    const la = hyp(ax, az) || 1, lb = hyp(bx, bz) || 1;
    ax /= la; az /= la; bx /= lb; bz /= lb;
    // normales rentrantes (dz, -dx)
    const n0x = az, n0z = -ax, n1x = bz, n1z = -bx;
    const d0 = uniform ? (dist as number) : (dist as ArrayLike<number>)[p];
    const d1 = uniform ? (dist as number) : (dist as ArrayLike<number>)[k];
    const det = n0x * n1z - n0z * n1x;
    let ox: number, oz: number;
    if (Math.abs(det) < 0.02) {
      // côtés presque parallèles : alignés (moyenne des décalages) ou demi-tour (décalage du premier)
      if (n0x * n1x + n0z * n1z > 0) {
        const d = (d0 + d1) / 2;
        ox = (n0x + n1x) * 0.5 * d;
        oz = (n0z + n1z) * 0.5 * d;
      } else {
        ox = n0x * d0;
        oz = n0z * d0;
      }
    } else {
      ox = (d0 * n1z - d1 * n0z) / det;
      oz = (d1 * n0x - d0 * n1x) / det;
      const lim = MITER_LIMIT * Math.max(Math.abs(d0), Math.abs(d1));
      const l = hyp(ox, oz);
      if (l > lim && l > 0) { ox *= lim / l; oz *= lim / l; }
    }
    out[2 * k] = px + ox;
    out[2 * k + 1] = pz + oz;
  }
}

/** Les segments [a,b] et [c,d] se coupent-ils franchement (hors extrémités communes) ? */
export function segmentsCross(
  ax: number, az: number, bx: number, bz: number, cx: number, cz: number, dx: number, dz: number,
): boolean {
  const d1 = (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
  const d2 = (bx - ax) * (dz - az) - (bz - az) * (dx - ax);
  if ((d1 > 0) === (d2 > 0) || d1 === 0 || d2 === 0) return false;
  const d3 = (dx - cx) * (az - cz) - (dz - cz) * (ax - cx);
  const d4 = (dx - cx) * (bz - cz) - (dz - cz) * (bx - cx);
  if ((d3 > 0) === (d4 > 0) || d3 === 0 || d4 === 0) return false;
  return true;
}

/** L'anneau se recoupe-t-il lui-même ? O(n²), avec rejet par boîte englobante. */
export function ringSelfIntersects(ring: ArrayLike<number>, n: number): boolean {
  for (let i = 0; i < n; i++) {
    const i2 = (i + 1) % n;
    const ax = ring[2 * i], az = ring[2 * i + 1], bx = ring[2 * i2], bz = ring[2 * i2 + 1];
    const minX = ax < bx ? ax : bx, maxX = ax < bx ? bx : ax;
    const minZ = az < bz ? az : bz, maxZ = az < bz ? bz : az;
    for (let j = i + 2; j < n; j++) {
      const j2 = (j + 1) % n;
      if (j2 === i) continue;
      const cx = ring[2 * j], cz = ring[2 * j + 1], dx = ring[2 * j2], dz = ring[2 * j2 + 1];
      if ((cx < minX && dx < minX) || (cx > maxX && dx > maxX) || (cz < minZ && dz < minZ) || (cz > maxZ && dz > maxZ)) continue;
      if (segmentsCross(ax, az, bx, bz, cx, cz, dx, dz)) return true;
    }
  }
  return false;
}

/**
 * Un anneau décalé `inset` est-il utilisable comme contour de toit pour l'anneau `ring` ?
 * Conditions : même sens de parcours, aire résiduelle suffisante, aucun côté retourné (un côté
 * court avalé par le décalage), aucun recoupement.
 */
export function insetIsValid(ring: ArrayLike<number>, inset: ArrayLike<number>, n: number, minAreaRatio = 0.12): boolean {
  const a0 = ringArea(ring, n), a1 = ringArea(inset, n);
  if (!(a0 !== 0) || (a0 > 0) !== (a1 > 0)) return false;
  // anneau extérieur : l'aire diminue ; trou : l'aire (en valeur absolue) augmente
  if (a0 > 0 && a1 < a0 * minAreaRatio) return false;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ex = ring[2 * j] - ring[2 * i], ez = ring[2 * j + 1] - ring[2 * i + 1];
    const fx = inset[2 * j] - inset[2 * i], fz = inset[2 * j + 1] - inset[2 * i + 1];
    if (ex * fx + ez * fz < -1e-9) return false;
  }
  return !ringSelfIntersects(inset, n);
}

/** Centre de gravité de la surface (repli sur la moyenne des sommets si l'aire est nulle). */
export function ringCentroid(ring: ArrayLike<number>, n: number, out: { x: number; z: number }): void {
  let a = 0, cx = 0, cz = 0;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const w = ring[2 * j] * ring[2 * i + 1] - ring[2 * i] * ring[2 * j + 1];
    a += w;
    cx += (ring[2 * j] + ring[2 * i]) * w;
    cz += (ring[2 * j + 1] + ring[2 * i + 1]) * w;
  }
  if (Math.abs(a) < 1e-9) {
    cx = 0; cz = 0;
    for (let i = 0; i < n; i++) { cx += ring[2 * i]; cz += ring[2 * i + 1]; }
    out.x = n ? cx / n : 0;
    out.z = n ? cz / n : 0;
    return;
  }
  out.x = cx / (3 * a);
  out.z = cz / (3 * a);
}

/** Plus petite distance du point aux côtés de l'anneau (m). */
export function distanceToRing(ring: ArrayLike<number>, n: number, x: number, z: number): number {
  let best = Infinity;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const ax = ring[2 * j], az = ring[2 * j + 1];
    const ex = ring[2 * i] - ax, ez = ring[2 * i + 1] - az;
    const l2 = ex * ex + ez * ez;
    let t = l2 > 0 ? ((x - ax) * ex + (z - az) * ez) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const dx = x - ax - t * ex, dz = z - az - t * ez;
    const d = dx * dx + dz * dz;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

/**
 * Direction du plus long côté de l'anneau (unitaire) : axe principal approximatif d'un immeuble.
 * Retourne la longueur de ce côté.
 */
export function ringMainAxis(ring: ArrayLike<number>, n: number, out: { x: number; z: number }): number {
  let best = -1, bx = 1, bz = 0;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const ex = ring[2 * i] - ring[2 * j], ez = ring[2 * i + 1] - ring[2 * j + 1];
    const l = ex * ex + ez * ez;
    if (l > best) { best = l; bx = ex; bz = ez; }
  }
  const l = Math.sqrt(Math.max(best, 0));
  if (l > 1e-9) { out.x = bx / l; out.z = bz / l; } else { out.x = 1; out.z = 0; }
  return l;
}
