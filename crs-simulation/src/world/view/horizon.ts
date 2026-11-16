/* =====================================================================================
 * VILLE EN 3D — lointain (Three.js) : pour ne jamais voir « le bord du monde ».
 * -------------------------------------------------------------------------------------
 *   - socle : un sol neutre qui épouse le relief sur toute la carte et se prolonge à plat sur
 *     15 km au-delà ; sa texture porte le tracé des rues (connu d'emblée par le graphe) et reçoit
 *     les couleurs des tuiles à mesure qu'elles sont vues. Les mailles situées sous une tuile
 *     affichée sont retirées (aucune surface superposée) ;
 *   - silhouette : trois rangs de toits parisiens en ombre chinoise autour de l'emprise, que le
 *     brouillard de la scène estompe ;
 *   - repères lointains : la butte Montmartre et le Sacré-Cœur au nord, la tour Montparnasse au
 *     sud, les tours de la Défense à l'ouest (volumes simples).
 * ===================================================================================== */

import * as THREE from 'three';
import { TILE_SIZE, lonLatToWorld, sampleTerrain } from '../mapdata';
import type { Manifest, Place, RoadGraph, Terrain } from '../mapdata';
import { CLASS_COLOR, CL_ASPHALT, CL_COURT, CL_GRASS } from './classes';
import { paintSkyline } from './paint';

/** Mailles du socle par côté de tuile (64 m). */
const CELLS = 8;
const CELL = TILE_SIZE / CELLS;
/** Prolongement du socle au-delà de la carte (m). */
const REACH = 15000;
/** Pixels de la texture du socle par tuile. */
const SOCLE_PX = 64;

export interface HorizonStats { triangles: number; drawCalls: number; textureBytes: number }

export class Horizon {
  readonly group = new THREE.Group();
  readonly stats: HorizonStats = { triangles: 0, drawCalls: 0, textureBytes: 0 };
  private readonly tx0: number;
  private readonly tz0: number;
  private readonly ntx: number;
  private readonly ntz: number;
  private readonly hidden: Uint8Array;
  private readonly socle: THREE.Mesh;
  private readonly socleGeometry: THREE.BufferGeometry;
  private readonly socleMaterial: THREE.MeshLambertMaterial;
  private readonly canvas: HTMLCanvasElement;
  private readonly g: CanvasRenderingContext2D;
  private readonly texture: THREE.CanvasTexture;
  private readonly tileCanvas: HTMLCanvasElement;
  private readonly skyline: THREE.Mesh;
  private readonly skylineTexture: THREE.CanvasTexture;
  private readonly skylineMaterial: THREE.MeshBasicMaterial;
  private readonly landmarks: THREE.Mesh;
  private readonly landmarkMaterial: THREE.MeshLambertMaterial;
  private indexDirty = true;
  private textureDirty = false;
  private readonly base = new THREE.Color();

  constructor(manifest: Manifest, graph: RoadGraph, terrain: Terrain, places: readonly Place[]) {
    this.group.name = 'ville-lointain';
    let tx0 = Infinity, tz0 = Infinity, tx1 = -Infinity, tz1 = -Infinity;
    for (const t of manifest.tiles) {
      tx0 = Math.min(tx0, t.tx);
      tx1 = Math.max(tx1, t.tx);
      tz0 = Math.min(tz0, t.tz);
      tz1 = Math.max(tz1, t.tz);
    }
    if (manifest.tiles.length === 0) {
      tx0 = tz0 = 0;
      tx1 = tz1 = 0;
    }
    this.tx0 = tx0;
    this.tz0 = tz0;
    this.ntx = tx1 - tx0 + 1;
    this.ntz = tz1 - tz0 + 1;
    this.hidden = new Uint8Array(this.ntx * this.ntz);
    const minX = tx0 * TILE_SIZE, minZ = tz0 * TILE_SIZE;
    const sizeX = this.ntx * TILE_SIZE, sizeZ = this.ntz * TILE_SIZE;

    // ── texture du socle : fond urbain, rues du graphe, jardins connus ──
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.ntx * SOCLE_PX;
    this.canvas.height = this.ntz * SOCLE_PX;
    this.g = this.canvas.getContext('2d') as CanvasRenderingContext2D;
    this.tileCanvas = document.createElement('canvas');
    this.tileCanvas.width = this.tileCanvas.height = 256;
    this.paintBase(graph, places, minX, minZ);
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.flipY = false;
    this.texture.wrapS = this.texture.wrapT = THREE.ClampToEdgeWrapping;
    this.texture.minFilter = THREE.LinearMipmapLinearFilter;
    this.texture.generateMipmaps = true;
    this.texture.anisotropy = 4;
    this.texture.name = 'ville-socle';
    this.stats.textureBytes = this.canvas.width * this.canvas.height * 4;

    // ── maillage du socle : mailles de 64 m alignées sur les tuiles, plus une couronne lointaine ──
    const nx = this.ntx * CELLS, nz = this.ntz * CELLS;
    const w = nx + 3, h = nz + 3;
    const pos = new Float32Array(w * h * 3), uv = new Float32Array(w * h * 2);
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        // première et dernière rangées : très loin, à l'altitude du bord
        const gi = Math.min(nx, Math.max(0, i - 1)), gj = Math.min(nz, Math.max(0, j - 1));
        const bx = minX + gi * CELL, bz = minZ + gj * CELL;
        const x = i === 0 ? minX - REACH : i === w - 1 ? minX + sizeX + REACH : bx;
        const z = j === 0 ? minZ - REACH : j === h - 1 ? minZ + sizeZ + REACH : bz;
        const k = j * w + i;
        pos[3 * k] = x;
        pos[3 * k + 1] = sampleTerrain(terrain, bx, bz) - 0.06;
        pos[3 * k + 2] = z;
        uv[2 * k] = gi / nx;
        uv[2 * k + 1] = gj / nz;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(new THREE.BufferAttribute(new Uint32Array((w - 1) * (h - 1) * 6), 1));
    // Normales verticales : le socle est vu de loin, son relief n'a pas besoin d'être modelé par la lumière.
    const up = new Float32Array(w * h * 3);
    for (let k = 1; k < up.length; k += 3) up[k] = 1;
    geo.setAttribute('normal', new THREE.BufferAttribute(up, 3));
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
    this.socleGeometry = geo;
    this.socleMaterial = new THREE.MeshLambertMaterial({ map: this.texture });
    this.socleMaterial.name = 'ville-socle';
    this.socle = new THREE.Mesh(geo, this.socleMaterial);
    this.socle.name = 'socle';
    this.socle.matrixAutoUpdate = false;
    this.socle.frustumCulled = false;
    this.socle.raycast = () => { /* pas de visée sur le lointain */ };
    this.group.add(this.socle);
    this.rebuildIndex();

    // ── silhouette de toits autour de l'emprise ──
    this.skylineTexture = new THREE.CanvasTexture(paintSkyline(2048, 128, 421));
    this.skylineTexture.wrapS = THREE.RepeatWrapping;
    this.skylineTexture.wrapT = THREE.ClampToEdgeWrapping;
    this.skylineTexture.colorSpace = THREE.SRGBColorSpace;
    this.skylineTexture.anisotropy = 4;
    this.skylineTexture.name = 'ville-silhouette';
    this.stats.textureBytes += 2048 * 128 * 4;
    this.skylineMaterial = new THREE.MeshBasicMaterial({ map: this.skylineTexture, alphaTest: 0.5, side: THREE.DoubleSide, color: 0x6f7480 });
    this.skylineMaterial.name = 'ville-silhouette';
    const b = manifest.bounds;
    this.skyline = new THREE.Mesh(buildSkylineGeometry(b.minX, b.minZ, b.maxX, b.maxZ, terrain), this.skylineMaterial);
    this.skyline.name = 'silhouette';
    this.skyline.matrixAutoUpdate = false;
    this.skyline.frustumCulled = false;
    this.skyline.raycast = () => { /* idem */ };
    this.group.add(this.skyline);

    // ── repères lointains ──
    this.landmarkMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    this.landmarkMaterial.name = 'ville-reperes-lointains';
    this.landmarks = new THREE.Mesh(buildDistantLandmarks(manifest), this.landmarkMaterial);
    this.landmarks.name = 'reperes-lointains';
    this.landmarks.matrixAutoUpdate = false;
    this.landmarks.raycast = () => { /* idem */ };
    this.group.add(this.landmarks);
    this.stats.drawCalls = 3;
    this.stats.triangles = (this.skyline.geometry.index?.count ?? 0) / 3 + (this.landmarks.geometry.index?.count ?? 0) / 3;
  }

  private paintBase(graph: RoadGraph, places: readonly Place[], minX: number, minZ: number): void {
    const g = this.g;
    const s = SOCLE_PX / TILE_SIZE;
    const c = CLASS_COLOR[CL_COURT], road = CLASS_COLOR[CL_ASPHALT], green = CLASS_COLOR[CL_GRASS];
    // fond : tissu bâti vu de loin (toits de zinc et cours mêlés)
    g.fillStyle = `rgb(${Math.round(c[0] * 0.98)},${Math.round(c[1] * 1.02)},${Math.round(c[2] * 1.1)})`;
    g.fillRect(0, 0, this.canvas.width, this.canvas.height);
    for (const p of places) {
      if (p.kind !== 'garden' || p.radius < 40) continue;
      g.fillStyle = `rgba(${green[0]},${green[1]},${green[2]},0.8)`;
      g.beginPath();
      g.arc((p.x - minX) * s, (p.z - minZ) * s, p.radius * s * 0.8, 0, Math.PI * 2);
      g.fill();
    }
    g.lineCap = 'round';
    g.lineJoin = 'round';
    for (const ed of graph.edges) {
      if (ed.tunnel || ed.pedestrianOnly || ed.roadClass === 'service' || ed.roadClass === 'footway') continue;
      const wide = (ed.width + 2 * ed.sidewalk) * s;
      g.strokeStyle = `rgba(${road[0] + 18},${road[1] + 18},${road[2] + 18},${Math.min(1, 0.35 + wide * 0.5)})`;
      g.lineWidth = Math.max(0.6, wide);
      g.beginPath();
      const pts = ed.points;
      g.moveTo((pts[0] - minX) * s, (pts[1] - minZ) * s);
      for (let i = 2; i + 1 < pts.length; i += 2) g.lineTo((pts[i] - minX) * s, (pts[i + 1] - minZ) * s);
      g.stroke();
    }
  }

  /** Reporte sur le socle les couleurs d'une tuile qui vient d'être vue (256 × 256 pixels RVBA ; l'eau a un alpha nul). */
  paintTile(tx: number, tz: number, pixels: Uint8Array, size: number): void {
    const i = tx - this.tx0, j = tz - this.tz0;
    if (i < 0 || j < 0 || i >= this.ntx || j >= this.ntz) return;
    if (this.tileCanvas.width !== size) this.tileCanvas.width = this.tileCanvas.height = size;
    const tg = this.tileCanvas.getContext('2d') as CanvasRenderingContext2D;
    const img = tg.createImageData(size, size);
    const water = CLASS_COLOR[16];
    for (let p = 0; p < size * size * 4; p += 4) {
      const wet = pixels[p + 3] === 0;
      img.data[p] = wet ? water[0] : pixels[p];
      img.data[p + 1] = wet ? water[1] : pixels[p + 1];
      img.data[p + 2] = wet ? water[2] : pixels[p + 2];
      img.data[p + 3] = 255;
    }
    tg.putImageData(img, 0, 0);
    this.g.imageSmoothingEnabled = true;
    this.g.drawImage(this.tileCanvas, i * SOCLE_PX, j * SOCLE_PX, SOCLE_PX, SOCLE_PX);
    this.textureDirty = true;
  }

  /** Une tuile affiche (ou n'affiche plus) son propre sol : les mailles du socle dessous sont retirées (ou remises). */
  setTileHidden(tx: number, tz: number, hidden: boolean): void {
    const i = tx - this.tx0, j = tz - this.tz0;
    if (i < 0 || j < 0 || i >= this.ntx || j >= this.ntz) return;
    const v = hidden ? 1 : 0;
    if (this.hidden[j * this.ntx + i] === v) return;
    this.hidden[j * this.ntx + i] = v;
    this.indexDirty = true;
  }

  private rebuildIndex(): void {
    const nx = this.ntx * CELLS, nz = this.ntz * CELLS;
    const w = nx + 3;
    const index = this.socleGeometry.index as THREE.BufferAttribute;
    const idx = index.array as Uint32Array;
    let n = 0;
    for (let j = 0; j < nz + 2; j++) {
      for (let i = 0; i < nx + 2; i++) {
        // mailles de la couronne : toujours présentes ; mailles intérieures : selon la tuile
        if (i >= 1 && i <= nx && j >= 1 && j <= nz) {
          const ti = Math.floor((i - 1) / CELLS), tj = Math.floor((j - 1) / CELLS);
          if (this.hidden[tj * this.ntx + ti] === 1) continue;
        }
        const a = j * w + i, b = a + 1, c = a + w, d = c + 1;
        idx[n++] = a; idx[n++] = d; idx[n++] = b;
        idx[n++] = a; idx[n++] = c; idx[n++] = d;
      }
    }
    this.socleGeometry.setDrawRange(0, n);
    index.needsUpdate = true;
    this.indexDirty = false;
  }

  /**
   * À chaque image : applique les changements en attente, accorde la silhouette à la lumière du jour.
   * `camHeight` : hauteur de la caméra au-dessus du sol ; vue d'avion, la silhouette (un décor de
   * théâtre fait pour être vu du sol) est retirée.
   */
  update(daylight: number, camHeight: number): void {
    this.skyline.visible = camHeight < 140;
    if (this.indexDirty) this.rebuildIndex();
    if (this.textureDirty) {
      this.texture.needsUpdate = true;
      this.textureDirty = false;
    }
    const d = Math.min(1, Math.max(0, daylight));
    this.base.setRGB(0.36, 0.38, 0.43);
    this.skylineMaterial.color.copy(this.base).multiplyScalar(0.07 + 0.93 * d);
  }

  dispose(): void {
    this.socleGeometry.dispose();
    this.socleMaterial.dispose();
    this.texture.dispose();
    this.skyline.geometry.dispose();
    this.skylineMaterial.dispose();
    this.skylineTexture.dispose();
    this.landmarks.geometry.dispose();
    this.landmarkMaterial.dispose();
    this.group.removeFromParent();
    this.group.clear();
  }
}

/** Trois rangs de silhouettes autour du rectangle de la carte, de plus en plus hauts et lointains. */
function buildSkylineGeometry(minX: number, minZ: number, maxX: number, maxZ: number, terrain: Terrain): THREE.BufferGeometry {
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  const rows = [{ off: 70, h: 42, len: 520, shift: 0 }, { off: 300, h: 60, len: 760, shift: 0.37 }, { off: 760, h: 86, len: 1100, shift: 0.71 }];
  for (const row of rows) {
    const x0 = minX - row.off, z0 = minZ - row.off, x1 = maxX + row.off, z1 = maxZ + row.off;
    const corners = [x0, z0, x1, z0, x1, z1, x0, z1];
    let dist = row.shift * row.len;
    for (let c = 0; c < 4; c++) {
      const ax = corners[2 * c], az = corners[2 * c + 1], bx = corners[(2 * c + 2) % 8], bz = corners[(2 * c + 3) % 8];
      const len = Math.hypot(bx - ax, bz - az);
      const parts = Math.ceil(len / 200);
      for (let k = 0; k < parts; k++) {
        const t0 = k / parts, t1 = (k + 1) / parts;
        const px = ax + (bx - ax) * t0, pz = az + (bz - az) * t0, qx = ax + (bx - ax) * t1, qz = az + (bz - az) * t1;
        const ya = sampleTerrain(terrain, px, pz) - 6, yb = sampleTerrain(terrain, qx, qz) - 6;
        const base = pos.length / 3;
        pos.push(px, ya, pz, qx, yb, qz, qx, yb + row.h, qz, px, ya + row.h, pz);
        const u0 = (dist + len * t0) / row.len, u1 = (dist + len * t1) / row.len;
        uv.push(u0, 0, u1, 0, u1, 1, u0, 1);
        idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
      dist += len;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

/** Volumes simples, teintés par sommet, des grands repères hors de la carte. */
function buildDistantLandmarks(manifest: Manifest): THREE.BufferGeometry {
  const pos: number[] = [], col: number[] = [], nor: number[] = [], idx: number[] = [];
  const box = (cx: number, cz: number, y0: number, sx: number, sz: number, h: number, r: number, g: number, b: number, heading = 0): void => {
    const c = Math.cos(heading), s = Math.sin(heading);
    const corner = (dx: number, dz: number): [number, number] => [cx + dx * c + dz * s, cz - dx * s + dz * c];
    const p = [corner(-sx / 2, -sz / 2), corner(sx / 2, -sz / 2), corner(sx / 2, sz / 2), corner(-sx / 2, sz / 2)];
    const face = (a: number[], bb: number[], cc: number[], d: number[], nx: number, ny: number, nz: number, k: number): void => {
      const base = pos.length / 3;
      for (const v of [a, bb, cc, d]) {
        pos.push(v[0], v[1], v[2]);
        nor.push(nx, ny, nz);
        col.push(r * k, g * k, b * k);
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    };
    for (let k = 0; k < 4; k++) {
      const a = p[k], bb = p[(k + 1) % 4];
      const nx = bb[1] - a[1], nz = -(bb[0] - a[0]);
      const len = Math.hypot(nx, nz) || 1;
      face([bb[0], y0, bb[1]], [a[0], y0, a[1]], [a[0], y0 + h, a[1]], [bb[0], y0 + h, bb[1]], nx / len, 0, nz / len, 1);
    }
    face([p[0][0], y0 + h, p[0][1]], [p[3][0], y0 + h, p[3][1]], [p[2][0], y0 + h, p[2][1]], [p[1][0], y0 + h, p[1][1]], 0, 1, 0, 1.1);
  };
  const at = (lon: number, lat: number): { x: number; z: number } => lonLatToWorld(lon, lat);
  if (manifest.name === 'paris') {
    // Tour Montparnasse (209 m).
    const m = at(2.3219, 48.8421);
    box(m.x, m.z, 0, 50, 32, 209, 0.16, 0.14, 0.13, 0.5);
    // Butte Montmartre (gradins de verdure et de toits) et Sacré-Cœur (dôme à 83 m, campanile à 84 m).
    const s = at(2.3431, 48.8867);
    for (let k = 0; k < 6; k++) box(s.x, s.z, 20 + k * 12, 1150 - k * 170, 760 - k * 110, 14, 0.36 + k * 0.01, 0.38 + k * 0.01, 0.36);
    box(s.x, s.z, 92, 50, 85, 32, 0.86, 0.85, 0.8);
    box(s.x, s.z - 8, 124, 24, 24, 22, 0.88, 0.87, 0.82);
    box(s.x, s.z - 8, 146, 15, 15, 20, 0.9, 0.89, 0.84);
    box(s.x, s.z - 8, 166, 7, 7, 10, 0.9, 0.89, 0.84);
    box(s.x, s.z + 46, 92, 13, 13, 84, 0.86, 0.85, 0.8);
    // La Défense : une douzaine de tours.
    const d = at(2.2385, 48.8915);
    const towers = [0, 0, 60, 60, 231, -160, 80, 44, 44, 178, 150, -90, 50, 50, 194, 260, 120, 46, 70, 161, -300, -70, 56, 40, 142, 40, 230, 38, 38, 220,
      -120, 260, 60, 30, 110, 380, -160, 42, 42, 187, -420, 180, 70, 36, 95, 200, 330, 36, 36, 165, -40, -280, 52, 52, 128, 520, 60, 40, 40, 150];
    for (let k = 0; k + 4 < towers.length; k += 5) {
      const v = 0.3 + ((k * 7) % 5) * 0.035;
      box(d.x + towers[k], d.z + towers[k + 1], 8, towers[k + 2], towers[k + 3], towers[k + 4], v, v + 0.03, v + 0.07, k * 0.13);
    }
    // Grande Arche.
    box(d.x - 620, d.z - 40, 8, 108, 14, 110, 0.82, 0.82, 0.8, 0.11);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}
