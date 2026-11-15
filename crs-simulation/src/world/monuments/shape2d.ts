/* Géométrie plane (x, z) — DONNÉES PURES, aucun import de Three.js.
 * Convention commune avec la carte : un anneau est un tableau plat [x0, z0, x1, z1, …], non refermé,
 * ANTIHORAIRE VU DE DESSUS (x = est/droite, z = sud/bas) ⇔ aire signée positive. La normale sortante
 * du côté a→b est alors (−dz, dx). */

/** Aire signée (m²) : positive si l'anneau tourne dans le sens antihoraire vu de dessus. */
export function signedArea(ring: ArrayLike<number>): number {
  const n = ring.length >> 1;
  let s = 0;
  for (let i = 0, j = n - 1; i < n; j = i++) s += ring[2 * i] * ring[2 * j + 1] - ring[2 * j] * ring[2 * i + 1];
  return s / 2;
}

export function isCCW(ring: ArrayLike<number>): boolean {
  return signedArea(ring) > 0;
}

/** Copie de l'anneau dans le sens antihoraire (inversée si nécessaire). */
export function ensureCCW(ring: ArrayLike<number>): number[] {
  const out: number[] = [];
  const n = ring.length >> 1;
  if (signedArea(ring) >= 0) {
    for (let i = 0; i < n * 2; i++) out.push(ring[i]);
  } else {
    for (let i = n - 1; i >= 0; i--) out.push(ring[2 * i], ring[2 * i + 1]);
  }
  return out;
}

/** Rectangle centré (largeur selon x, profondeur selon z), antihoraire, éventuellement tourné (rad, comme rotation.y). */
export function rectRing(cx: number, cz: number, w: number, d: number, rot = 0): number[] {
  const hx = w / 2, hz = d / 2;
  const local = [-hx, -hz, -hx, hz, hx, hz, hx, -hz];
  return rot === 0 ? offsetRing(local, cx, cz) : transformRing(local, cx, cz, rot);
}

/** Polygone régulier à n côtés (antihoraire). `phase` en radians ; phase = π/n donne un côté face à +x. */
export function ngonRing(cx: number, cz: number, r: number, n: number, phase = 0): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = phase + (i / n) * Math.PI * 2;
    out.push(cx + r * Math.cos(a), cz - r * Math.sin(a));
  }
  return out;
}

export function offsetRing(ring: ArrayLike<number>, dx: number, dz: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < ring.length; i += 2) out.push(ring[i] + dx, ring[i + 1] + dz);
  return out;
}

/** Tourne (même convention que rotation.y : +z local → (sin r, cos r)) puis translate. */
export function transformRing(ring: ArrayLike<number>, dx: number, dz: number, rot: number): number[] {
  const c = Math.cos(rot), s = Math.sin(rot);
  const out: number[] = [];
  for (let i = 0; i < ring.length; i += 2) {
    const x = ring[i], z = ring[i + 1];
    out.push(dx + x * c + z * s, dz - x * s + z * c);
  }
  return out;
}

/** Passe un anneau du repère monde au repère local d'un monument posé en (ox, oz) avec le cap `heading`. */
export function worldRingToLocal(ring: ArrayLike<number>, ox: number, oz: number, heading: number): number[] {
  const c = Math.cos(heading), s = Math.sin(heading);
  const out: number[] = [];
  for (let i = 0; i + 1 < ring.length; i += 2) {
    const x = ring[i] - ox, z = ring[i + 1] - oz;
    out.push(x * c - z * s, x * s + z * c);
  }
  return out;
}

export interface Bounds2 { minX: number; minZ: number; maxX: number; maxZ: number; cx: number; cz: number; w: number; d: number }

export function ringBounds(ring: ArrayLike<number>): Bounds2 {
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (let i = 0; i + 1 < ring.length; i += 2) {
    const x = ring[i], z = ring[i + 1];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  if (minX === Infinity) { minX = minZ = maxX = maxZ = 0; }
  return { minX, minZ, maxX, maxZ, cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2, w: maxX - minX, d: maxZ - minZ };
}

/** Point dans un anneau (règle pair-impair). */
export function pointInRing(px: number, pz: number, ring: ArrayLike<number>): boolean {
  const n = ring.length >> 1;
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const ix = ring[2 * i], iz = ring[2 * i + 1], jx = ring[2 * j], jz = ring[2 * j + 1];
    if ((iz > pz) !== (jz > pz) && px < ((jx - ix) * (pz - iz)) / (jz - iz) + ix) inside = !inside;
  }
  return inside;
}

function segmentsCross(ax: number, az: number, bx: number, bz: number, cx: number, cz: number, dx: number, dz: number): boolean {
  const d1 = (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
  const d2 = (bx - ax) * (dz - az) - (bz - az) * (dx - ax);
  const d3 = (dx - cx) * (az - cz) - (dz - cz) * (ax - cx);
  const d4 = (dx - cx) * (bz - cz) - (dz - cz) * (bx - cx);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

/** Vrai si l'anneau a au moins 3 sommets distincts, une aire non nulle et aucun côté qui en croise un autre. */
export function isSimpleRing(ring: ArrayLike<number>): boolean {
  const n = ring.length >> 1;
  if (n < 3 || ring.length % 2 !== 0) return false;
  for (let i = 0; i < ring.length; i++) if (!Number.isFinite(ring[i])) return false;
  if (Math.abs(signedArea(ring)) < 1e-6) return false;
  for (let i = 0; i < n; i++) {
    const i2 = (i + 1) % n;
    for (let j = i + 1; j < n; j++) {
      const j2 = (j + 1) % n;
      if (i === j2 || i2 === j) continue;
      if (segmentsCross(ring[2 * i], ring[2 * i + 1], ring[2 * i2], ring[2 * i2 + 1], ring[2 * j], ring[2 * j + 1], ring[2 * j2], ring[2 * j2 + 1])) return false;
    }
  }
  return true;
}

/** Supprime les sommets confondus ou alignés (tolérance en mètres). */
export function cleanRing(ring: ArrayLike<number>, eps = 0.01): number[] {
  const pts: number[] = [];
  const n = ring.length >> 1;
  for (let i = 0; i < n; i++) {
    const x = ring[2 * i], z = ring[2 * i + 1];
    const m = pts.length;
    if (m >= 2 && Math.hypot(x - pts[m - 2], z - pts[m - 1]) < eps) continue;
    pts.push(x, z);
  }
  while (pts.length >= 4 && Math.hypot(pts[0] - pts[pts.length - 2], pts[1] - pts[pts.length - 1]) < eps) pts.length -= 2;
  // sommets alignés
  let changed = true;
  while (changed && pts.length > 6) {
    changed = false;
    const m = pts.length >> 1;
    for (let i = 0; i < m; i++) {
      const p = (i + m - 1) % m, q = (i + 1) % m;
      const ax = pts[2 * i] - pts[2 * p], az = pts[2 * i + 1] - pts[2 * p + 1];
      const bx = pts[2 * q] - pts[2 * i], bz = pts[2 * q + 1] - pts[2 * i + 1];
      const cross = ax * bz - az * bx;
      const la = Math.hypot(ax, az), lb = Math.hypot(bx, bz);
      if (Math.abs(cross) < eps * Math.max(la, lb) && ax * bx + az * bz > 0) { pts.splice(2 * i, 2); changed = true; break; }
    }
  }
  return pts;
}

/**
 * Décale un anneau antihoraire vers l'extérieur (d > 0) ou l'intérieur (d < 0) avec raccords en onglet.
 * L'onglet est borné (× 3) pour les angles très aigus. Ne détecte pas les auto-intersections.
 */
export function insetRing(ring: ArrayLike<number>, d: number): number[] {
  const n = ring.length >> 1;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const p = (i + n - 1) % n, q = (i + 1) % n;
    let ax = ring[2 * i] - ring[2 * p], az = ring[2 * i + 1] - ring[2 * p + 1];
    let bx = ring[2 * q] - ring[2 * i], bz = ring[2 * q + 1] - ring[2 * i + 1];
    const la = Math.hypot(ax, az) || 1, lb = Math.hypot(bx, bz) || 1;
    ax /= la; az /= la; bx /= lb; bz /= lb;
    // normales sortantes (−dz, dx)
    const n0x = -az, n0z = ax, n1x = -bz, n1z = bx;
    let mx = n0x + n1x, mz = n0z + n1z;
    const ml = Math.hypot(mx, mz);
    if (ml < 1e-6) { mx = n0x; mz = n0z; } else { mx /= ml; mz /= ml; }
    const cos = Math.max(mx * n0x + mz * n0z, 1 / 3);
    out.push(ring[2 * i] + (mx * d) / cos, ring[2 * i + 1] + (mz * d) / cos);
  }
  return out;
}

/** Périmètre d'un anneau (m). */
export function ringPerimeter(ring: ArrayLike<number>): number {
  const n = ring.length >> 1;
  let len = 0;
  for (let i = 0, j = n - 1; i < n; j = i++) len += Math.hypot(ring[2 * i] - ring[2 * j], ring[2 * i + 1] - ring[2 * j + 1]);
  return len;
}
