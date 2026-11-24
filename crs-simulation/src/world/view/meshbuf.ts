/* =====================================================================================
 * VILLE EN 3D — tampon de maillage extensible (logique pure, tableaux typés).
 * -------------------------------------------------------------------------------------
 * Un sommet = position (3 flottants, relative à l'origine de la tuile), normale (3 octets signés),
 * quatre octets de données (classe, mode, teinte, ombrage) et, si le tampon en porte, des
 * coordonnées de texture. Les tampons sont réutilisés d'une tuile à l'autre (reset) : aucune
 * allocation en régime établi.
 * ===================================================================================== */

/** Modes de dessin d'un sommet (octet « mode »). */
export const MODE_FLUSH = 0;    // nappe de base : la classe vient de la grille de la tuile
export const MODE_SURFACE = 1;  // surface horizontale de classe donnée (trottoir, pelouse, tablier)
export const MODE_VERTICAL = 2; // face verticale ou volume (bordure, mur, pile) : jamais fondue vers la vue lointaine
export const MODE_DECAL = 3;    // posé sur le sol (marquage, caniveau, margelle) : léger décalage vers l'œil

export class MeshBuf {
  pos: Float32Array;
  nor: Int8Array;
  dat: Uint8Array;
  uv: Float32Array | null;
  idx: Uint32Array;
  /** Nombre de sommets et d'indices écrits. */
  nv = 0;
  ni = 0;

  constructor(vertices = 4096, withUv = false) {
    this.pos = new Float32Array(vertices * 3);
    this.nor = new Int8Array(vertices * 3);
    this.dat = new Uint8Array(vertices * 4);
    this.uv = withUv ? new Float32Array(vertices * 2) : null;
    this.idx = new Uint32Array(vertices * 3);
  }

  reset(): void {
    this.nv = 0;
    this.ni = 0;
  }

  private growVertices(): void {
    const cap = (this.pos.length / 3) * 2;
    const pos = new Float32Array(cap * 3);
    pos.set(this.pos);
    this.pos = pos;
    const nor = new Int8Array(cap * 3);
    nor.set(this.nor);
    this.nor = nor;
    const dat = new Uint8Array(cap * 4);
    dat.set(this.dat);
    this.dat = dat;
    if (this.uv !== null) {
      const uv = new Float32Array(cap * 2);
      uv.set(this.uv);
      this.uv = uv;
    }
  }

  private growIndices(): void {
    const idx = new Uint32Array(this.idx.length * 2);
    idx.set(this.idx);
    this.idx = idx;
  }

  /**
   * Ajoute un sommet. Normale en composantes -1..1 ; `tint` et `shade` de 0 à 255 (128 = teinte
   * neutre, 255 = pas d'ombrage). Retourne son indice.
   */
  vertex(x: number, y: number, z: number, nx: number, ny: number, nz: number, cls: number, mode: number, tint: number, shade: number): number {
    const i = this.nv;
    if (i * 3 >= this.pos.length) this.growVertices();
    const p = i * 3;
    this.pos[p] = x;
    this.pos[p + 1] = y;
    this.pos[p + 2] = z;
    this.nor[p] = Math.round(nx * 127);
    this.nor[p + 1] = Math.round(ny * 127);
    this.nor[p + 2] = Math.round(nz * 127);
    const d = i * 4;
    this.dat[d] = cls;
    this.dat[d + 1] = mode;
    this.dat[d + 2] = tint;
    this.dat[d + 3] = shade;
    this.nv = i + 1;
    return i;
  }

  /** Coordonnées de texture du sommet `i` (tampons créés avec `withUv`). */
  setUv(i: number, u: number, v: number): void {
    if (this.uv === null) return;
    this.uv[i * 2] = u;
    this.uv[i * 2 + 1] = v;
  }

  tri(a: number, b: number, c: number): void {
    if (this.ni + 3 > this.idx.length) this.growIndices();
    this.idx[this.ni++] = a;
    this.idx[this.ni++] = b;
    this.idx[this.ni++] = c;
  }

  /** Quadrilatère a-b-c-d (dans l'ordre du contour) : deux triangles a-b-c et a-c-d. */
  quad(a: number, b: number, c: number, d: number): void {
    if (this.ni + 6 > this.idx.length) this.growIndices();
    const idx = this.idx;
    idx[this.ni++] = a;
    idx[this.ni++] = b;
    idx[this.ni++] = c;
    idx[this.ni++] = a;
    idx[this.ni++] = c;
    idx[this.ni++] = d;
  }

  get triangles(): number {
    return this.ni / 3;
  }

  /** Octets occupés une fois sur la carte graphique. */
  get gpuBytes(): number {
    return this.nv * (12 + 3 + 4 + (this.uv !== null ? 8 : 0)) + this.ni * (this.nv <= 65535 ? 2 : 4);
  }

  /** Boîte englobante [minX, minY, minZ, maxX, maxY, maxZ] des sommets écrits. */
  bounds(out: Float64Array): Float64Array {
    let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    const p = this.pos;
    for (let i = 0, end = this.nv * 3; i < end; i += 3) {
      const x = p[i], y = p[i + 1], z = p[i + 2];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
    if (this.nv === 0) minX = minY = minZ = maxX = maxY = maxZ = 0;
    out[0] = minX;
    out[1] = minY;
    out[2] = minZ;
    out[3] = maxX;
    out[4] = maxY;
    out[5] = maxZ;
    return out;
  }
}
