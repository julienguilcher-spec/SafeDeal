/* Vue intérieure (caméra 'vehicle_int') : habitacle du véhicule conduit par le joueur.
 *
 * L'habitacle est un modèle comme les autres (même constructeur de géométrie, même matériau, un lot d'UNE
 * instance) : planche de bord, casquette d'instruments, volant qui tourne (pièce PART_STEERING), montants,
 * traverse de pavillon, contre-portes, rétroviseurs, capot à la teinte de la carrosserie et, pour les
 * véhicules de maintien de l'ordre, grille de protection devant le pare-brise. Le combiné d'instruments est
 * un quad à part, texturé par le canvas du tableau de bord. Deux appels de dessin en tout.
 *
 * Les deux-roues n'ont pas d'habitacle : leur modèle extérieur reste affiché (guidon, réservoir, bulle) et
 * seul le combiné d'instruments est ajouté. */

import * as THREE from 'three';
import type { Vehicle, VehicleDef } from '@/core/contracts';
import { tile } from './atlas-layout';
import { Dashboard } from './dashboard';
import { EYE_AHEAD_OF_SEAT, composeVehicleMatrix, pack2, seatEyeHeight, steerToThree, steeringWheelAngle } from './frame';
import { Geo, LIGHT_BEACON_A, LIGHT_NONE, LIGHT_SIGN, PART_STEERING, SURF_DARK, SURF_FIXED, SURF_LAMP } from './geo';
import { COL, grilleOver } from './kit';
import { modelKey } from './models/index';
import type { ModelMeta } from './models/index';
import { InstancePool } from './pool';

/** Emplacement du combiné d'instruments dans le repère Three local du véhicule. */
export interface GaugePlacement { x: number; y: number; z: number; tilt: number; w: number; h: number }

const TRIM = 0x3a3d43;      // garnitures
const DASH = 0x2b2e33;      // planche de bord
const LINER = 0x8e9198;     // ciel de pavillon

/** Position du conducteur (repère Three local) : siège 'driver' de la définition, sinon place avant gauche. */
export function driverPoint(def: VehicleDef, meta: ModelMeta): { x: number; y: number; z: number } {
  for (const s of def.seats) if (s.role === 'driver') return { x: -s.x, y: s.y, z: s.z };
  return { x: meta.halfWidth * 0.45, y: meta.beltY - 0.45, z: meta.cowlZ - 1.2 };
}

/** Construit l'habitacle dans `g` et retourne l'emplacement du combiné d'instruments. */
export function buildCockpit(g: Geo, def: VehicleDef, meta: ModelMeta): GaugePlacement {
  const kind = meta.cockpit;
  const d = driverPoint(def, meta);
  const eyeY = seatEyeHeight(d.y, def.height), eyeZ = d.z + EYE_AHEAD_OF_SEAT;
  if (kind === 'bike') {
    // combiné posé derrière la bulle, incliné vers le pilote
    return { x: 0, y: meta.hoodY + 0.045, z: meta.cowlZ - 0.14, tilt: 0.85, w: 0.2, h: 0.1 };
  }
  const hw = meta.halfWidth, belt = meta.beltY, roof = meta.roofY, cowl = meta.cowlZ;
  const hl = def.length / 2;
  const rake = kind === 'car' ? 0.6 : kind === 'truck' ? 0.22 : 0.5;
  const wsTopZ = cowl - rake, wsTopY = roof - 0.06;
  const wBelt = hw - 0.03;
  const wRoof = hw - (kind === 'car' ? 0.2 : kind === 'armored' ? 0.3 : 0.1);
  const armored = kind === 'armored';
  const body = (): void => { g.body(); };
  g.noPart().light(LIGHT_NONE).tile(null);

  // ── capot ──
  if (cowl < hl - 0.3) {
    body();
    const from = g.mark();
    const y0 = meta.hoodY, y1 = meta.hoodY - (armored ? 0.2 : 0.14);
    g.hexa([
      -hw, y0 - 0.5, cowl - 0.02, hw, y0 - 0.5, cowl - 0.02, hw * 0.9, y1 - 0.4, hl - 0.04, -hw * 0.9, y1 - 0.4, hl - 0.04,
      -hw * 0.97, y0 + 0.01, cowl - 0.02, hw * 0.97, y0 + 0.01, cowl - 0.02, hw * 0.86, y1, hl - 0.04, -hw * 0.86, y1, hl - 0.04,
    ], 1);
    g.smooth(from, 40);
    if (armored) {
      // haut de la lame de dégagement, visible au bout du capot
      g.body(0.72); g.box(-def.width / 2, def.width / 2, 1.18, 1.34, hl - 0.16, hl - 0.04);
    }
  }

  // ── planche de bord et casquette d'instruments ──
  // Le combiné se lit À TRAVERS la moitié haute du volant : son centre est 30° sous l'horizontale de l'œil
  // (0,38 m plus bas, 0,66 m devant) ; le haut de la jante passe à 22°, le moyeu vers 42°.
  const dashRear = Math.min(cowl - 0.18, Math.max(cowl - 0.78, eyeZ + 0.62));
  const dashTop = Math.min(belt + 0.12, Math.max(belt - 0.05, eyeY - 0.5));
  const gTilt = 0.42, gW = 0.34, gH = 0.17;
  const gy = Math.max(dashTop + 0.05, eyeY - 0.38), gz = dashRear + 0.04;
  const gyT = gy + (gH / 2) * Math.cos(gTilt), gzT = gz + (gH / 2) * Math.sin(gTilt);
  const gyB = gy - (gH / 2) * Math.cos(gTilt), gzB = gz - (gH / 2) * Math.sin(gTilt);
  g.paint(DASH, SURF_FIXED);
  let from = g.mark();
  g.prism([cowl + 0.06, dashTop + 0.02, dashRear, dashTop - 0.03, dashRear - 0.1, dashTop - 0.55, cowl + 0.06, dashTop - 0.55], -wBelt, wBelt);
  g.smooth(from, 35);
  from = g.mark();
  // casquette : sa face arrière est parallèle au combiné, 12 mm derrière lui
  g.prism([gz + 0.32, dashTop - 0.02, gzT + 0.05, gyT + 0.03, gzT + 0.012, gyT + 0.022, gzB + 0.012, gyB - 0.012, gzB + 0.012, dashTop - 0.06], d.x - 0.23, d.x + 0.23);
  g.smooth(from, 30);
  // console centrale : écran de bord (éclairé avec les feux) et boîtier de commande des avertisseurs
  g.paint(TRIM, SURF_FIXED).box(-0.16, 0.16, dashTop - 0.5, dashTop - 0.04, dashRear - 0.13, dashRear - 0.02);
  g.paint(0x2b4a6a, SURF_LAMP).light(LIGHT_SIGN);
  g.face([0.13, dashTop - 0.28, dashRear - 0.132, -0.13, dashTop - 0.28, dashRear - 0.132, -0.13, dashTop - 0.1, dashRear - 0.135, 0.13, dashTop - 0.1, dashRear - 0.135], null, [0, 0.1, -1]);
  g.paint(0x1e5bff, SURF_LAMP).light(LIGHT_BEACON_A);
  g.face([0.1, dashTop - 0.4, dashRear - 0.132, 0.05, dashTop - 0.4, dashRear - 0.132, 0.05, dashTop - 0.36, dashRear - 0.132, 0.1, dashTop - 0.36, dashRear - 0.132], null, [0, 0, -1]);
  g.light(LIGHT_NONE);
  // aérateurs
  g.paint(0x0d0e10, SURF_DARK);
  for (const x of [-wBelt + 0.14, wBelt - 0.14]) g.face([x + 0.08, dashTop - 0.2, dashRear - 0.055, x - 0.08, dashTop - 0.2, dashRear - 0.055, x - 0.08, dashTop - 0.12, dashRear - 0.04, x + 0.08, dashTop - 0.12, dashRear - 0.04], null, [0, 0.2, -1]);

  // ── montants, traverse de pavillon, ciel de pavillon ──
  g.paint(TRIM, SURF_FIXED);
  const pr = armored ? 0.085 : 0.055;
  g.mirror(() => {
    g.tube(wBelt, belt - 0.02, cowl, wRoof, wsTopY + 0.03, wsTopZ, pr, pr, 5, false, false);
    // montant milieu et longeron de pavillon
    const bz = eyeZ - 0.42;
    g.tube(wBelt, belt, bz, wRoof, wsTopY + 0.02, bz, pr, pr * 0.9, 5, false, false);
    g.tube(wRoof, wsTopY + 0.03, wsTopZ, wRoof, wsTopY + 0.03, bz - 0.5, pr * 0.85, pr * 0.85, 5, false, false);
    // contre-porte et bandeau de ceinture
    g.paint(0x232528, SURF_FIXED);
    g.face([hw - 0.035, belt - 0.85, cowl - 0.02, hw - 0.035, belt - 0.85, bz - 0.5, hw - 0.035, belt - 0.03, bz - 0.5, hw - 0.035, belt - 0.03, cowl - 0.02], null, [-1, 0, 0]);
    g.paint(TRIM, SURF_FIXED).box(hw - 0.11, hw - 0.03, belt - 0.05, belt, bz - 0.5, cowl - 0.02);
    // accoudoir
    g.box(hw - 0.12, hw - 0.035, belt - 0.32, belt - 0.26, eyeZ - 0.25, eyeZ + 0.3);
    // rétroviseur extérieur
    const tall = kind !== 'car';
    const my = belt + (tall ? 0.34 : 0.1), mz = cowl - 0.3, ms = tall ? 0.32 : 0.14, mw = tall ? 0.18 : 0.2;
    g.paint(COL.plastic, SURF_FIXED).tube(hw - 0.02, my - ms * 0.3, mz, hw + 0.14, my, mz, 0.014, 0.014, 4, false, false);
    g.cube(hw + 0.14 + mw / 2, my, mz + 0.02, mw, ms, 0.05);
    g.paint(0x6f7f8d, SURF_LAMP);
    g.face([hw + 0.15, my - ms * 0.44, mz - 0.006, hw + 0.13 + mw, my - ms * 0.44, mz - 0.006, hw + 0.13 + mw, my + ms * 0.44, mz - 0.006, hw + 0.15, my + ms * 0.44, mz - 0.006], null, [0, 0, -1]);
    g.paint(TRIM, SURF_FIXED);
  });
  g.box(-wRoof, wRoof, wsTopY - 0.02, wsTopY + 0.07, wsTopZ - 0.14, wsTopZ + 0.03);
  g.paint(LINER, SURF_FIXED);
  g.face([-wRoof, wsTopY, wsTopZ - 0.14, wRoof, wsTopY, wsTopZ - 0.14, wRoof, wsTopY + 0.02, eyeZ - 0.95, -wRoof, wsTopY + 0.02, eyeZ - 0.95], null, [0, -1, 0]);
  // pare-soleil
  g.paint(0x6f7278, SURF_FIXED);
  for (const x of [d.x, -d.x]) g.box(x - 0.2, x + 0.2, wsTopY - 0.045, wsTopY - 0.025, wsTopZ - 0.12, wsTopZ + 0.02);
  if (armored) {
    // montant central du pare-brise en deux panneaux et allège blindée
    g.paint(TRIM, SURF_FIXED);
    g.tube(0, belt - 0.02, cowl, 0, wsTopY + 0.03, wsTopZ, 0.09, 0.09, 5, false, false);
    g.box(-wBelt, wBelt, belt - 0.06, belt + 0.07, cowl - 0.03, cowl + 0.06);
  } else if (kind !== 'truck') {
    // rétroviseur intérieur
    g.paint(COL.plastic, SURF_FIXED).cube(0, wsTopY - 0.13, wsTopZ + 0.14, 0.24, 0.07, 0.03);
    g.paint(0x6f7f8d, SURF_LAMP);
    g.face([0.11, wsTopY - 0.16, wsTopZ + 0.123, -0.11, wsTopY - 0.16, wsTopZ + 0.123, -0.11, wsTopY - 0.1, wsTopZ + 0.123, 0.11, wsTopY - 0.1, wsTopZ + 0.123], null, [0, 0, -1]);
  }

  // ── essuie-glaces ──
  g.paint(COL.dark, SURF_DARK);
  const wy = belt + 0.02, wz = cowl + 0.035;
  g.tube(wBelt * 0.55, wy, wz, wBelt * 0.02, wy + 0.03, wz - 0.01, 0.01, 0.007, 4, false, false);
  g.tube(-wBelt * 0.1, wy, wz, -wBelt * 0.63, wy + 0.03, wz - 0.01, 0.01, 0.007, 4, false, false);

  // ── grille de protection devant le pare-brise, vue de l'intérieur (face tournée vers le conducteur) ──
  if (meta.grille) {
    const quad = [wBelt, belt + 0.01, cowl + 0.02, -wBelt, belt + 0.01, cowl + 0.02, -wRoof, wsTopY, wsTopZ + 0.02, wRoof, wsTopY, wsTopZ + 0.02];
    const ny = rake, nz = wsTopY - belt;
    const nl = Math.hypot(ny, nz) || 1;
    grilleOver(g, quad, [0, -ny / nl, -nz / nl], -0.09);
  }

  // ── siège passager et appuie-tête ──
  g.paint(0x1f2124, SURF_FIXED);
  from = g.mark();
  g.box(-d.x - 0.23, -d.x + 0.23, d.y - 0.05, d.y + 0.62, d.z - 0.3, d.z - 0.16);
  g.box(-d.x - 0.12, -d.x + 0.12, d.y + 0.66, d.y + 0.84, d.z - 0.29, d.z - 0.18);
  g.box(-d.x - 0.24, -d.x + 0.24, d.y - 0.1, d.y + 0.02, d.z - 0.2, d.z + 0.3);
  g.smooth(from, 50);

  // ── colonne de direction et volant ──
  const tilt = kind === 'car' ? 0.42 : kind === 'van' ? 0.72 : 0.95;
  const R = kind === 'car' ? 0.185 : kind === 'van' ? 0.2 : 0.23;
  const kx = 0, ky = Math.sin(tilt), kz = -Math.cos(tilt);
  const cz = eyeZ + 0.41, cy = eyeY - 0.365;
  g.paint(TRIM, SURF_FIXED);
  g.tube(d.x, cy - ky * 0.02, cz - kz * 0.02, d.x - kx * 0.3, cy - ky * 0.3, cz - kz * 0.3, 0.035, 0.04, 6, false, false);
  g.part(PART_STEERING, d.x, cy, cz, tilt);
  g.paint(0x121315, SURF_FIXED);
  // base du plan du volant : u = (1, 0, 0), w = k × u
  const wy2 = -Math.cos(tilt), wz2 = -Math.sin(tilt);
  const rimPts: number[] = [];
  const seg = 18;
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    rimPts.push(d.x + Math.cos(a) * R, cy + Math.sin(a) * R * wy2, cz + Math.sin(a) * R * wz2);
  }
  for (let i = 0; i < seg; i++) {
    g.tube(rimPts[i * 3]!, rimPts[i * 3 + 1]!, rimPts[i * 3 + 2]!, rimPts[i * 3 + 3]!, rimPts[i * 3 + 4]!, rimPts[i * 3 + 5]!, 0.017, 0.017, 6, false, false);
  }
  // moyeu et trois branches (gauche, droite, bas)
  g.tube(d.x, cy, cz, d.x + kx * 0.05, cy + ky * 0.05, cz + kz * 0.05, 0.06, 0.05, 8, false, true);
  for (const a of [0, Math.PI, Math.PI / 2]) {
    g.tube(d.x, cy + ky * 0.02, cz + kz * 0.02, d.x + Math.cos(a) * R, cy + Math.sin(a) * R * wy2, cz + Math.sin(a) * R * wz2, 0.02, 0.014, 5, false, false);
  }
  // repère du haut du volant (rend sa rotation lisible)
  g.paint(0xc9ccd1, SURF_FIXED);
  g.tube(d.x - 0.02, cy - R * wy2, cz - R * wz2, d.x + 0.02, cy - R * wy2, cz - R * wz2, 0.019, 0.019, 6);
  g.noPart();
  body();

  return { x: d.x, y: gy, z: gz, tilt: gTilt, w: gW, h: gH };
}

export class Cockpit {
  drawCalls = 0;
  triangles = 0;
  private pool: InstancePool | null = null;
  private key = '';
  private gaugeAt: GaugePlacement | null = null;
  private readonly dashboard = new Dashboard();
  private readonly gauge: THREE.Mesh;
  private readonly mVehicle = new THREE.Matrix4();
  private readonly mLocal = new THREE.Matrix4();
  private readonly euler = new THREE.Euler(0, 0, 0, 'YXZ');
  private lastBlink = 0;

  constructor(private readonly material: THREE.Material, private readonly group: THREE.Group) {
    const mat = new THREE.MeshBasicMaterial({ map: this.dashboard.texture, toneMapped: false });
    this.gauge = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    this.gauge.matrixAutoUpdate = false;
    this.gauge.frustumCulled = false;
    this.gauge.visible = false;
    this.gauge.renderOrder = 5;
    group.add(this.gauge);
  }

  /** Nombre de redessins du tableau de bord depuis la création (mesure). */
  get dashboardRedraws(): number { return this.dashboard.redraws; }

  invalidate(): void {
    this.pool?.dispose();
    this.pool = null;
    this.key = '';
  }

  private ensure(v: Vehicle, meta: ModelMeta): void {
    const key = modelKey(v.kind, v.def) + '|' + meta.cockpit;
    if (key === this.key) return;
    this.pool?.dispose();
    this.pool = null;
    this.key = key;
    const g = new Geo(tile('blanc'));
    this.gaugeAt = buildCockpit(g, v.def, meta);
    if (meta.cockpit !== 'bike' && meta.cockpit !== 'none') {
      const data = g.build();
      this.pool = new InstancePool(data, this.material, 1, false);
      this.pool.mesh.renderOrder = 4;
      this.group.add(this.pool.mesh);
    }
  }

  /**
   * @param v     véhicule du joueur en vue intérieure, ou null pour masquer l'habitacle
   * @param meta  repères du modèle du véhicule
   * @param r,g,b teinte linéaire de la carrosserie
   */
  update(v: Vehicle | null, meta: ModelMeta | null, r: number, g: number, b: number, blink: number, night: number): void {
    const dt = Math.max(0, Math.min(0.1, blink - this.lastBlink));
    this.lastBlink = blink;
    if (!v || !meta || meta.cockpit === 'none') {
      if (this.pool) { this.pool.begin(); this.pool.end(); }
      this.gauge.visible = false;
      this.drawCalls = 0;
      this.triangles = 0;
      return;
    }
    this.ensure(v, meta);
    const pool = this.pool;
    let calls = 0, tris = 0;
    if (pool) {
      pool.begin();
      const k = pool.next();
      composeVehicleMatrix(pool.matrix, k * 16, v.x, v.y, v.z, v.heading, v.pitch, v.roll);
      pool.color[0] = r; pool.color[1] = g; pool.color[2] = b; pool.color[3] = 0;
      pool.anim[0] = 0;
      pool.anim[1] = steerToThree(v.steerAngle);
      // sens horaire vu du conducteur quand on braque à droite : rotation négative autour de la colonne
      pool.anim[2] = -steeringWheelAngle(v.steerAngle);
      pool.anim[3] = 0.5;
      pool.turret[0] = 0; pool.turret[1] = 0; pool.turret[2] = 0; pool.turret[3] = 0;
      pool.state[0] = 0; pool.state[1] = 0; pool.state[2] = 0; pool.state[3] = 0;
      const lit = v.headlights ? 1 : 0;
      pool.light[0] = pack2(lit, lit);
      pool.light[1] = 0;
      pool.light[2] = 0;
      pool.light[3] = pack2(v.beacons ? 1 : 0, 0);
      pool.end();
      calls++;
      tris += pool.triangles;
    }
    const at = this.gaugeAt;
    if (at) {
      this.dashboard.update(v, blink, night, dt);
      composeVehicleMatrix(this.mVehicle.elements, 0, v.x, v.y, v.z, v.heading, v.pitch, v.roll);
      // quad tourné vers l'arrière (vers le conducteur) puis incliné ; le guidon des deux-roues l'emporte avec lui
      this.euler.set(-at.tilt, Math.PI, 0);
      this.mLocal.makeRotationFromEuler(this.euler);
      const e = this.mLocal.elements;
      e[0]! *= at.w; e[1]! *= at.w; e[2]! *= at.w;
      e[4]! *= at.h; e[5]! *= at.h; e[6]! *= at.h;
      e[12] = at.x; e[13] = at.y; e[14] = at.z;
      this.gauge.matrix.multiplyMatrices(this.mVehicle, this.mLocal);
      this.gauge.matrixWorldNeedsUpdate = true;
      this.gauge.visible = true;
      calls++;
      tris += 2;
    } else {
      this.gauge.visible = false;
    }
    this.drawCalls = calls;
    this.triangles = tris;
  }

  dispose(): void {
    this.pool?.dispose();
    this.gauge.removeFromParent();
    this.gauge.geometry.dispose();
    (this.gauge.material as THREE.Material).dispose();
    this.dashboard.dispose();
  }
}
