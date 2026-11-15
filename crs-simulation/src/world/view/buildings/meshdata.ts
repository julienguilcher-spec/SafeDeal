/* =====================================================================================
 * IMMEUBLES — tampon de maillage (logique pure, sans Three.js)
 * -------------------------------------------------------------------------------------
 * Accumule sommets et indices dans des tableaux typés extensibles. Un même tampon sert à
 * toutes les tuiles (remise à zéro entre deux générations) : aucune allocation par bâtiment.
 *
 * Format d'un sommet :
 *   position  3 × float32   (repère local de la tuile)
 *   normale   3 × int8      (normalisée, ×127)
 *   uv        2 × float32   (u en travées, v en niveaux — voir walls.ts)
 *   couleur   3 × uint8     (teinte multiplicative, normalisée)
 *   façade    4 × uint8     (couche d'atlas, nombre de travées, graine, travée particulière)
 * ===================================================================================== */

export class MeshData {
  pos: Float32Array;
  nor: Int8Array;
  uv: Float32Array;
  col: Uint8Array;
  fac: Uint8Array;
  idx: Uint32Array;
  /** Nombre de sommets et d'indices écrits. */
  nv = 0;
  ni = 0;

  // État courant, appliqué aux sommets émis ensuite.
  layer = 0;
  nb = 255;
  seed = 0;
  alt = 255;
  r = 255;
  g = 255;
  b = 255;
  /** Facteur d'assombrissement appliqué à la teinte courante (1 = aucun). */
  shade = 1;
  nx = 0;
  ny = 1;
  nz = 0;

  constructor(vertexCapacity = 4096) {
    this.pos = new Float32Array(vertexCapacity * 3);
    this.nor = new Int8Array(vertexCapacity * 3);
    this.uv = new Float32Array(vertexCapacity * 2);
    this.col = new Uint8Array(vertexCapacity * 3);
    this.fac = new Uint8Array(vertexCapacity * 4);
    this.idx = new Uint32Array(vertexCapacity * 2);
  }

  reset(): void {
    this.nv = 0;
    this.ni = 0;
    this.shade = 1;
  }

  get triangles(): number {
    return this.ni / 3;
  }

  /** Garantit de la place pour `nv` sommets et `ni` indices de plus. */
  ensure(nv: number, ni: number): void {
    const needV = this.nv + nv;
    if (needV * 3 > this.pos.length) {
      let c = this.pos.length / 3;
      while (c < needV) c *= 2;
      const pos = new Float32Array(c * 3); pos.set(this.pos.subarray(0, this.nv * 3)); this.pos = pos;
      const nor = new Int8Array(c * 3); nor.set(this.nor.subarray(0, this.nv * 3)); this.nor = nor;
      const uv = new Float32Array(c * 2); uv.set(this.uv.subarray(0, this.nv * 2)); this.uv = uv;
      const col = new Uint8Array(c * 3); col.set(this.col.subarray(0, this.nv * 3)); this.col = col;
      const fac = new Uint8Array(c * 4); fac.set(this.fac.subarray(0, this.nv * 4)); this.fac = fac;
    }
    const needI = this.ni + ni;
    if (needI > this.idx.length) {
      let c = this.idx.length;
      while (c < needI) c *= 2;
      const idx = new Uint32Array(c); idx.set(this.idx.subarray(0, this.ni)); this.idx = idx;
    }
  }

  /** Fixe la teinte courante (0..1 par canal). */
  tint(r: number, g: number, b: number): void {
    this.r = r >= 1 ? 255 : r <= 0 ? 0 : (r * 255 + 0.5) | 0;
    this.g = g >= 1 ? 255 : g <= 0 ? 0 : (g * 255 + 0.5) | 0;
    this.b = b >= 1 ? 255 : b <= 0 ? 0 : (b * 255 + 0.5) | 0;
  }

  /** Fixe la normale courante (vecteur quelconque non nul, normalisé ici). */
  normal(x: number, y: number, z: number): void {
    const l = Math.sqrt(x * x + y * y + z * z);
    if (l > 1e-12) { this.nx = x / l; this.ny = y / l; this.nz = z / l; } else { this.nx = 0; this.ny = 1; this.nz = 0; }
  }

  /** Fixe couche, nombre de travées, graine et travée particulière des sommets suivants. */
  facade(layer: number, nb: number, seed: number, alt: number): void {
    this.layer = layer;
    this.nb = nb > 255 ? 255 : nb;
    this.seed = seed & 255;
    this.alt = alt > 255 ? 255 : alt;
  }

  /** Émet un sommet avec l'état courant. Appeler ensure() avant. Retourne son indice. */
  vertex(x: number, y: number, z: number, u: number, v: number): number {
    const i = this.nv++;
    const p = i * 3;
    this.pos[p] = x; this.pos[p + 1] = y; this.pos[p + 2] = z;
    this.nor[p] = Math.round(this.nx * 127); this.nor[p + 1] = Math.round(this.ny * 127); this.nor[p + 2] = Math.round(this.nz * 127);
    this.uv[i * 2] = u; this.uv[i * 2 + 1] = v;
    const s = this.shade;
    if (s === 1) {
      this.col[p] = this.r; this.col[p + 1] = this.g; this.col[p + 2] = this.b;
    } else {
      this.col[p] = (this.r * s) | 0; this.col[p + 1] = (this.g * s) | 0; this.col[p + 2] = (this.b * s) | 0;
    }
    const f = i * 4;
    this.fac[f] = this.layer; this.fac[f + 1] = this.nb; this.fac[f + 2] = this.seed; this.fac[f + 3] = this.alt;
    return i;
  }

  tri(a: number, b: number, c: number): void {
    const i = this.ni;
    this.idx[i] = a; this.idx[i + 1] = b; this.idx[i + 2] = c;
    this.ni = i + 3;
  }

  /** Deux triangles (a, b, c) et (a, c, d) : quadrilatère a → b → c → d dans le sens direct vu de la face. */
  quadIdx(a: number, b: number, c: number, d: number): void {
    const i = this.ni;
    const idx = this.idx;
    idx[i] = a; idx[i + 1] = b; idx[i + 2] = c;
    idx[i + 3] = a; idx[i + 4] = c; idx[i + 5] = d;
    this.ni = i + 6;
  }

  /**
   * Quadrilatère plan complet : quatre sommets (sens direct vu de la face) et leurs uv.
   * La normale courante doit être fixée avant.
   */
  quad(
    x0: number, y0: number, z0: number, u0: number, v0: number,
    x1: number, y1: number, z1: number, u1: number, v1: number,
    x2: number, y2: number, z2: number, u2: number, v2: number,
    x3: number, y3: number, z3: number, u3: number, v3: number,
  ): void {
    this.ensure(4, 6);
    const a = this.vertex(x0, y0, z0, u0, v0);
    this.vertex(x1, y1, z1, u1, v1);
    this.vertex(x2, y2, z2, u2, v2);
    this.vertex(x3, y3, z3, u3, v3);
    this.quadIdx(a, a + 1, a + 2, a + 3);
  }

  /** Fixe la normale d'après trois points (sens direct vu de la face) ; false si dégénéré. */
  normalFrom(ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number): boolean {
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    const x = uy * vz - uz * vy, y = uz * vx - ux * vz, z = ux * vy - uy * vx;
    const l = Math.sqrt(x * x + y * y + z * z);
    if (l < 1e-9) return false;
    this.nx = x / l; this.ny = y / l; this.nz = z / l;
    return true;
  }

  /** Boîte englobante des sommets écrits : [minX, minY, minZ, maxX, maxY, maxZ] (zéros si vide). */
  bounds(out: Float64Array | number[]): void {
    let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    const pos = this.pos;
    for (let i = 0, n = this.nv * 3; i < n; i += 3) {
      const x = pos[i], y = pos[i + 1], z = pos[i + 2];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
    if (this.nv === 0) { minX = minY = minZ = maxX = maxY = maxZ = 0; }
    out[0] = minX; out[1] = minY; out[2] = minZ; out[3] = maxX; out[4] = maxY; out[5] = maxZ;
  }
}
