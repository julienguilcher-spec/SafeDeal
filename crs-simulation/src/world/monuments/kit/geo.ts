/* Kit monuments — géométrie brute fusionnable.
 * `Geo` accumule sommets (position, normale, uv) et triangles dans des tableaux simples ; le `Builder`
 * (builder.ts) les regroupe par matériau pour ne produire qu'un maillage par matériau.
 * CONVENTION D'UV : sauf mention contraire (« uvFit »), les UV sont exprimées en MÈTRES ; c'est la
 * texture du matériau (repeat = 1 / taille du motif) qui fixe l'échelle. Une géométrie peut donc changer
 * de matériau sans être recalculée. */
import * as THREE from 'three';

const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _nm = new THREE.Matrix3();

export class Geo {
  pos: number[] = [];
  nor: number[] = [];
  uv: number[] = [];
  idx: number[] = [];

  get vertexCount(): number { return this.pos.length / 3; }
  get triangleCount(): number { return this.idx.length / 3; }

  /** Ajoute un sommet, retourne son index. */
  vert(x: number, y: number, z: number, nx: number, ny: number, nz: number, u: number, v: number): number {
    const i = this.pos.length / 3;
    this.pos.push(x, y, z);
    this.nor.push(nx, ny, nz);
    this.uv.push(u, v);
    return i;
  }

  tri(a: number, b: number, c: number): this { this.idx.push(a, b, c); return this; }
  quad(a: number, b: number, c: number, d: number): this { this.idx.push(a, b, c, a, c, d); return this; }

  /**
   * Quadrilatère plan a→b→c→d (antihoraire vu de face), normale calculée, UV en mètres :
   * u le long de a→b, v le long de a→d, décalées de (u0, v0). Avec `fit`, UV = rectangle [u0,u1]×[v0,v1].
   */
  face(
    ax: number, ay: number, az: number, bx: number, by: number, bz: number,
    cx: number, cy: number, cz: number, dx: number, dy: number, dz: number,
    u0 = 0, v0 = 0, fit?: { u1: number; v1: number },
  ): this {
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = dx - ax, vy = dy - ay, vz = dz - az;
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl; ny /= nl; nz /= nl;
    const lu = Math.hypot(ux, uy, uz), lv = Math.hypot(vx, vy, vz);
    const u1 = fit ? fit.u1 : u0 + lu;
    const v1 = fit ? fit.v1 : v0 + lv;
    // u du côté haut : proportionnel à la longueur réelle c–d (trapèzes)
    const a = this.vert(ax, ay, az, nx, ny, nz, u0, v0);
    const b = this.vert(bx, by, bz, nx, ny, nz, u1, v0);
    const c = this.vert(cx, cy, cz, nx, ny, nz, u1, v1);
    const d = this.vert(dx, dy, dz, nx, ny, nz, u0, v1);
    return this.quad(a, b, c, d);
  }

  /** Triangle plan (antihoraire vu de face), UV données. */
  face3(
    ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number,
    ua = 0, va = 0, ub = 1, vb = 0, uc = 0.5, vc = 1,
  ): this {
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl; ny /= nl; nz /= nl;
    const a = this.vert(ax, ay, az, nx, ny, nz, ua, va);
    const b = this.vert(bx, by, bz, nx, ny, nz, ub, vb);
    const c = this.vert(cx, cy, cz, nx, ny, nz, uc, vc);
    return this.tri(a, b, c);
  }

  /** Ajoute une autre géométrie (éventuellement transformée). */
  append(o: Geo, m?: THREE.Matrix4): this {
    const base = this.vertexCount;
    const n = o.vertexCount;
    if (m) {
      _nm.getNormalMatrix(m);
      const flip = m.determinant() < 0;
      for (let i = 0; i < n; i++) {
        _v.set(o.pos[3 * i], o.pos[3 * i + 1], o.pos[3 * i + 2]).applyMatrix4(m);
        _n.set(o.nor[3 * i], o.nor[3 * i + 1], o.nor[3 * i + 2]).applyMatrix3(_nm).normalize();
        this.pos.push(_v.x, _v.y, _v.z);
        this.nor.push(_n.x, _n.y, _n.z);
      }
      for (let i = 0; i < o.uv.length; i++) this.uv.push(o.uv[i]);
      if (flip) for (let i = 0; i < o.idx.length; i += 3) this.idx.push(base + o.idx[i], base + o.idx[i + 2], base + o.idx[i + 1]);
      else for (let i = 0; i < o.idx.length; i++) this.idx.push(base + o.idx[i]);
    } else {
      for (let i = 0; i < o.pos.length; i++) this.pos.push(o.pos[i]);
      for (let i = 0; i < o.nor.length; i++) this.nor.push(o.nor[i]);
      for (let i = 0; i < o.uv.length; i++) this.uv.push(o.uv[i]);
      for (let i = 0; i < o.idx.length; i++) this.idx.push(base + o.idx[i]);
    }
    return this;
  }

  /** Transforme sur place. */
  transform(m: THREE.Matrix4): this {
    _nm.getNormalMatrix(m);
    const n = this.vertexCount;
    for (let i = 0; i < n; i++) {
      _v.set(this.pos[3 * i], this.pos[3 * i + 1], this.pos[3 * i + 2]).applyMatrix4(m);
      _n.set(this.nor[3 * i], this.nor[3 * i + 1], this.nor[3 * i + 2]).applyMatrix3(_nm).normalize();
      this.pos[3 * i] = _v.x; this.pos[3 * i + 1] = _v.y; this.pos[3 * i + 2] = _v.z;
      this.nor[3 * i] = _n.x; this.nor[3 * i + 1] = _n.y; this.nor[3 * i + 2] = _n.z;
    }
    if (m.determinant() < 0) for (let i = 0; i < this.idx.length; i += 3) { const t = this.idx[i + 1]; this.idx[i + 1] = this.idx[i + 2]; this.idx[i + 2] = t; }
    return this;
  }

  translate(x: number, y: number, z: number): this {
    for (let i = 0; i < this.pos.length; i += 3) { this.pos[i] += x; this.pos[i + 1] += y; this.pos[i + 2] += z; }
    return this;
  }

  rotateY(a: number): this { return this.transform(new THREE.Matrix4().makeRotationY(a)); }
  rotateX(a: number): this { return this.transform(new THREE.Matrix4().makeRotationX(a)); }
  rotateZ(a: number): this { return this.transform(new THREE.Matrix4().makeRotationZ(a)); }
  scale(x: number, y: number, z: number): this { return this.transform(new THREE.Matrix4().makeScale(x, y, z)); }

  /** Borne les coordonnées d'un axe (0 = x, 1 = y, 2 = z) : écrase ce qui dépasse (haut-relief, figure à demi immergée). */
  clampAxis(axis: 0 | 1 | 2, min: number, max: number): this {
    for (let i = axis; i < this.pos.length; i += 3) { if (this.pos[i] < min) this.pos[i] = min; else if (this.pos[i] > max) this.pos[i] = max; }
    return this;
  }

  /** Multiplie les UV (utile pour caler un motif : nombre de travées, de tours…). */
  scaleUv(su: number, sv: number, ou = 0, ov = 0): this {
    for (let i = 0; i < this.uv.length; i += 2) { this.uv[i] = this.uv[i] * su + ou; this.uv[i + 1] = this.uv[i + 1] * sv + ov; }
    return this;
  }

  /** Remplace les UV par une projection « boîte » en mètres d'après la normale dominante. */
  boxUv(scale = 1): this {
    const n = this.vertexCount;
    for (let i = 0; i < n; i++) {
      const x = this.pos[3 * i], y = this.pos[3 * i + 1], z = this.pos[3 * i + 2];
      const ax = Math.abs(this.nor[3 * i]), ay = Math.abs(this.nor[3 * i + 1]), az = Math.abs(this.nor[3 * i + 2]);
      if (ay >= ax && ay >= az) { this.uv[2 * i] = x * scale; this.uv[2 * i + 1] = z * scale; }
      else if (ax >= az) { this.uv[2 * i] = z * scale; this.uv[2 * i + 1] = y * scale; }
      else { this.uv[2 * i] = x * scale; this.uv[2 * i + 1] = y * scale; }
    }
    return this;
  }

  /** Recalcule des normales à facettes (duplique les sommets partagés). */
  flatten(): this {
    const g = new Geo();
    for (let i = 0; i < this.idx.length; i += 3) {
      const a = this.idx[i], b = this.idx[i + 1], c = this.idx[i + 2];
      g.face3(
        this.pos[3 * a], this.pos[3 * a + 1], this.pos[3 * a + 2],
        this.pos[3 * b], this.pos[3 * b + 1], this.pos[3 * b + 2],
        this.pos[3 * c], this.pos[3 * c + 1], this.pos[3 * c + 2],
        this.uv[2 * a], this.uv[2 * a + 1], this.uv[2 * b], this.uv[2 * b + 1], this.uv[2 * c], this.uv[2 * c + 1],
      );
    }
    this.pos = g.pos; this.nor = g.nor; this.uv = g.uv; this.idx = g.idx;
    return this;
  }

  clone(): Geo { return new Geo().append(this); }

  /** Importe une BufferGeometry de Three.js (les UV sont conservées telles quelles). */
  static fromThree(g: THREE.BufferGeometry, uScale = 1, vScale = 1): Geo {
    const out = new Geo();
    const p = g.getAttribute('position');
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    const nn = g.getAttribute('normal');
    const uv = g.getAttribute('uv');
    for (let i = 0; i < p.count; i++) {
      out.pos.push(p.getX(i), p.getY(i), p.getZ(i));
      out.nor.push(nn.getX(i), nn.getY(i), nn.getZ(i));
      if (uv) out.uv.push(uv.getX(i) * uScale, uv.getY(i) * vScale); else out.uv.push(0, 0);
    }
    const index = g.getIndex();
    if (index) for (let i = 0; i < index.count; i++) out.idx.push(index.getX(i));
    else for (let i = 0; i < p.count; i++) out.idx.push(i);
    g.dispose();
    return out;
  }

  /** Convertit en BufferGeometry (index 16 ou 32 bits selon la taille). */
  toBufferGeometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(this.nor), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(this.uv), 2));
    const n = this.vertexCount;
    g.setIndex(new THREE.BufferAttribute(n > 65535 ? new Uint32Array(this.idx) : new Uint16Array(this.idx), 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

/** Matrice de pose : translation, rotation autour de y (rad), échelle uniforme ou par axe. */
export function pose(x = 0, y = 0, z = 0, rotY = 0, sx = 1, sy = sx, sz = sx): THREE.Matrix4 {
  const m = new THREE.Matrix4();
  if (rotY !== 0) m.makeRotationY(rotY);
  if (sx !== 1 || sy !== 1 || sz !== 1) m.scale(_v.set(sx, sy, sz));
  m.setPosition(x, y, z);
  return m;
}

/** Matrice de pose générale (rotations d'Euler XYZ). */
export function poseEuler(x: number, y: number, z: number, rx: number, ry: number, rz: number, s = 1): THREE.Matrix4 {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')),
    new THREE.Vector3(s, s, s),
  );
}

/** Triangule un polygone plan [x0, z0, …] (avec trous éventuels) ; retourne des index dans contour puis trous. */
export function triangulateRaw(ring: ArrayLike<number>, holes: ArrayLike<number>[] = []): number[] {
  const toPts = (r: ArrayLike<number>): THREE.Vector2[] => {
    const pts: THREE.Vector2[] = [];
    for (let i = 0; i + 1 < r.length; i += 2) pts.push(new THREE.Vector2(r[i], r[i + 1]));
    return pts;
  };
  const tris = THREE.ShapeUtils.triangulateShape(toPts(ring), holes.map(toPts));
  const out: number[] = [];
  for (const t of tris) out.push(t[0], t[1], t[2]);
  return out;
}
