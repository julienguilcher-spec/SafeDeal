/* =====================================================================================
 * Géométrie propre au module : boîte orientée contre boîte orientée (axes séparateurs), avec
 * normale, profondeur et point de contact. Aucune allocation : résultat écrit dans `out`.
 *
 * Convention des boîtes (identique à @/core/math-collide) : centre (cx, cz), demi-dimension halfX
 * le long de l'axe local x (la gauche : (cos h, −sin h)), halfZ le long de l'axe avant (sin h, cos h).
 * ===================================================================================== */

/** Résultat d'un contact entre deux boîtes orientées. */
export interface ObbContact {
  /** Normale unitaire, dirigée de B vers A (sens dans lequel A doit sortir). */
  nx: number;
  nz: number;
  /** Profondeur d'interpénétration le long de la normale (m). */
  depth: number;
  /** Point de contact (monde). */
  x: number;
  z: number;
}

export function makeObbContact(): ObbContact {
  return { nx: 0, nz: 0, depth: 0, x: 0, z: 0 };
}

// accumulateur du point de contact (sommets de l'une contenus dans l'autre)
let accX = 0;
let accZ = 0;
let accN = 0;

function gatherCorners(
  ax: number, az: number, ahx: number, ahz: number, asn: number, acs: number,
  bx: number, bz: number, bhx: number, bhz: number, bsn: number, bcs: number,
): void {
  // sommets de A exprimés dans le repère de B
  for (let i = 0; i < 4; i++) {
    const sx = i === 0 || i === 3 ? ahx : -ahx;
    const sz = i < 2 ? ahz : -ahz;
    // local A → monde : gauche·sx + avant·sz
    const wx = ax + acs * sx + asn * sz;
    const wz = az - asn * sx + acs * sz;
    const dx = wx - bx;
    const dz = wz - bz;
    const lx = dx * bcs - dz * bsn;
    const lz = dx * bsn + dz * bcs;
    if (lx >= -bhx - 0.02 && lx <= bhx + 0.02 && lz >= -bhz - 0.02 && lz <= bhz + 0.02) {
      accX += wx;
      accZ += wz;
      accN++;
    }
  }
}

/**
 * Teste le chevauchement de deux boîtes orientées. S'il y a contact, écrit dans `out` la normale
 * (de B vers A), la profondeur minimale et un point de contact, et retourne true.
 */
export function obbVsObb(
  ax: number, az: number, ahx: number, ahz: number, ah: number,
  bx: number, bz: number, bhx: number, bhz: number, bh: number, out: ObbContact,
): boolean {
  const dx = ax - bx;
  const dz = az - bz;
  const asn = Math.sin(ah);
  const acs = Math.cos(ah);
  const bsn = Math.sin(bh);
  const bcs = Math.cos(bh);
  // axes : gauche et avant de A, gauche et avant de B
  // produits scalaires entre axes (valeurs absolues)
  const cLL = Math.abs(acs * bcs + asn * bsn); // gaucheA·gaucheB = avantA·avantB
  const cLF = Math.abs(acs * bsn - asn * bcs); // gaucheA·avantB = avantA·gaucheB (au signe près)

  let best = Infinity;
  let nx = 0;
  let nz = 0;

  // axe gauche de A : (acs, −asn)
  let d = dx * acs - dz * asn;
  let o = ahx + bhx * cLL + bhz * cLF - Math.abs(d);
  if (o <= 0) return false;
  if (o < best) {
    best = o;
    const s = d >= 0 ? 1 : -1;
    nx = acs * s;
    nz = -asn * s;
  }
  // axe avant de A : (asn, acs)
  d = dx * asn + dz * acs;
  o = ahz + bhx * cLF + bhz * cLL - Math.abs(d);
  if (o <= 0) return false;
  if (o < best) {
    best = o;
    const s = d >= 0 ? 1 : -1;
    nx = asn * s;
    nz = acs * s;
  }
  // axe gauche de B : (bcs, −bsn)
  d = dx * bcs - dz * bsn;
  o = bhx + ahx * cLL + ahz * cLF - Math.abs(d);
  if (o <= 0) return false;
  if (o < best) {
    best = o;
    const s = d >= 0 ? 1 : -1;
    nx = bcs * s;
    nz = -bsn * s;
  }
  // axe avant de B : (bsn, bcs)
  d = dx * bsn + dz * bcs;
  o = bhz + ahx * cLF + ahz * cLL - Math.abs(d);
  if (o <= 0) return false;
  if (o < best) {
    best = o;
    const s = d >= 0 ? 1 : -1;
    nx = bsn * s;
    nz = bcs * s;
  }

  // point de contact : moyenne des sommets de chaque boîte contenus dans l'autre
  accX = 0;
  accZ = 0;
  accN = 0;
  gatherCorners(ax, az, ahx, ahz, asn, acs, bx, bz, bhx, bhz, bsn, bcs);
  gatherCorners(bx, bz, bhx, bhz, bsn, bcs, ax, az, ahx, ahz, asn, acs);
  if (accN > 0) {
    out.x = accX / accN;
    out.z = accZ / accN;
  } else {
    // boîtes en croix : aucun sommet contenu, on prend le milieu des centres
    out.x = (ax + bx) * 0.5;
    out.z = (az + bz) * 0.5;
  }
  out.nx = nx;
  out.nz = nz;
  out.depth = best;
  return true;
}

/** Carré de la distance entre deux boîtes orientées approchées par leurs cercles englobants réduits (rapide). */
export function boundsOverlap(ax: number, az: number, ar: number, bx: number, bz: number, br: number): boolean {
  const dx = ax - bx;
  const dz = az - bz;
  const r = ar + br;
  return dx * dx + dz * dz < r * r;
}
