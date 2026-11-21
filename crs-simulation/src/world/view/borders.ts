/* =====================================================================================
 * VILLE EN 3D — bandes le long d'un contour (logique pure).
 * -------------------------------------------------------------------------------------
 * Sert aux bordures de trottoir, aux caniveaux, aux margelles des quais et aux relevés de pelouse :
 * une bande de largeur constante posée le long d'un anneau, vers l'intérieur ou vers l'extérieur,
 * raccordée en onglet aux angles pour rester jointive.
 *
 * Convention de la carte : pour un côté A → B d'un anneau bien orienté (extérieur antihoraire vu de
 * dessus, trou horaire), la matière est à gauche et la normale SORTANTE est (−dz, dx).
 * ===================================================================================== */

/**
 * Vecteurs d'onglet : pour chaque sommet, le déplacement (dx, dz) qui décale le contour d'UNE unité
 * vers l'extérieur de la matière. Aux angles vifs, la longueur est bornée par `limit`.
 */
export function miterOffsets(ring: ArrayLike<number>, out?: Float32Array, limit = 2.2): Float32Array {
  const n = ring.length >> 1;
  const res = out !== undefined && out.length >= n * 2 ? out : new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const p = (i + n - 1) % n, q = (i + 1) % n;
    let ax = ring[2 * i] - ring[2 * p], az = ring[2 * i + 1] - ring[2 * p + 1];
    let bx = ring[2 * q] - ring[2 * i], bz = ring[2 * q + 1] - ring[2 * i + 1];
    const la = Math.hypot(ax, az), lb = Math.hypot(bx, bz);
    if (la < 1e-6 && lb < 1e-6) {
      res[2 * i] = 0;
      res[2 * i + 1] = 0;
      continue;
    }
    if (la < 1e-6) { ax = bx; az = bz; } else { ax /= la; az /= la; }
    if (lb < 1e-6) { bx = ax; bz = az; } else { bx /= lb; bz /= lb; }
    // Normales sortantes des deux côtés.
    const n0x = -az, n0z = ax, n1x = -bz, n1z = bx;
    const dot = n0x * n1x + n0z * n1z;
    let mx: number, mz: number;
    if (dot < -0.999) {
      mx = n0x;
      mz = n0z;
    } else {
      const k = 1 / (1 + dot);
      mx = (n0x + n1x) * k;
      mz = (n0z + n1z) * k;
      const len = Math.hypot(mx, mz);
      if (len > limit) {
        mx *= limit / len;
        mz *= limit / len;
      }
    }
    res[2 * i] = mx;
    res[2 * i + 1] = mz;
  }
  return res;
}

/** Tronçon d'un côté d'anneau, avec ses vecteurs d'onglet interpolés aux deux bouts. */
export interface RingStep {
  /** Indice du côté (du sommet i au sommet i + 1). */
  edge: number;
  ax: number; az: number; bx: number; bz: number;
  /** Onglets (vers l'extérieur) en a et en b. */
  max: number; maz: number; mbx: number; mbz: number;
  /** Normale sortante unitaire du côté. */
  nx: number; nz: number;
}

const step: RingStep = { edge: 0, ax: 0, az: 0, bx: 0, bz: 0, max: 0, maz: 0, mbx: 0, mbz: 0, nx: 0, nz: 0 };

/**
 * Parcourt un anneau par tronçons d'au plus `maxStep` mètres. `visit` reçoit un objet RÉUTILISÉ
 * (ne pas le conserver). Les côtés de longueur nulle sont ignorés.
 */
export function walkRing(ring: ArrayLike<number>, miters: Float32Array, maxStep: number, visit: (s: RingStep) => void): void {
  const n = ring.length >> 1;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ax = ring[2 * i], az = ring[2 * i + 1], bx = ring[2 * j], bz = ring[2 * j + 1];
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 1e-4) continue;
    const parts = Math.max(1, Math.ceil(len / maxStep));
    const nx = -(bz - az) / len, nz = (bx - ax) / len;
    for (let k = 0; k < parts; k++) {
      const t0 = k / parts, t1 = (k + 1) / parts;
      step.edge = i;
      step.ax = ax + (bx - ax) * t0;
      step.az = az + (bz - az) * t0;
      step.bx = ax + (bx - ax) * t1;
      step.bz = az + (bz - az) * t1;
      // Aux sommets : l'onglet ; en cours de côté : la normale (bande de largeur constante).
      if (k === 0) { step.max = miters[2 * i]; step.maz = miters[2 * i + 1]; } else { step.max = nx; step.maz = nz; }
      if (k === parts - 1) { step.mbx = miters[2 * j]; step.mbz = miters[2 * j + 1]; } else { step.mbx = nx; step.mbz = nz; }
      step.nx = nx;
      step.nz = nz;
      visit(step);
    }
  }
}

/**
 * Bande de bordure le long d'un anneau. Pour chaque tronçon retenu par `keep` (qui reçoit le milieu
 * du tronçon et la normale sortante), écrit dans `out` un quadrilatère de 8 nombres :
 *   [ax, az, bx, bz, b'x, b'z, a'x, a'z]
 * où a → b suit le contour et a', b' sont décalés de `width` : vers l'INTÉRIEUR de la matière si
 * width > 0 (bordure posée sur le trottoir), vers l'extérieur si width < 0 (caniveau sur la
 * chaussée). Retourne le nombre de quadrilatères écrits.
 */
export function borderStrip(
  ring: ArrayLike<number>, width: number, maxStep: number,
  keep: ((mx: number, mz: number, nx: number, nz: number) => boolean) | null, out: number[],
): number {
  const miters = miterOffsets(ring);
  let count = 0;
  walkRing(ring, miters, maxStep, (s) => {
    if (keep !== null && !keep((s.ax + s.bx) / 2, (s.az + s.bz) / 2, s.nx, s.nz)) return;
    out.push(
      s.ax, s.az, s.bx, s.bz,
      s.bx - s.mbx * width, s.bz - s.mbz * width, s.ax - s.max * width, s.az - s.maz * width,
    );
    count++;
  });
  return count;
}

/** Le segment est-il posé sur une limite de la tuile (artefact du découpage par tuile) ? */
export function onTileBorder(ax: number, az: number, bx: number, bz: number, minX: number, minZ: number, size: number, eps = 0.06): boolean {
  const maxX = minX + size, maxZ = minZ + size;
  if (Math.abs(ax - minX) < eps && Math.abs(bx - minX) < eps) return true;
  if (Math.abs(ax - maxX) < eps && Math.abs(bx - maxX) < eps) return true;
  if (Math.abs(az - minZ) < eps && Math.abs(bz - minZ) < eps) return true;
  if (Math.abs(az - maxZ) < eps && Math.abs(bz - maxZ) < eps) return true;
  return false;
}
