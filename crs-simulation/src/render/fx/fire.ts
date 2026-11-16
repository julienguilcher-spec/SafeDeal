/* =====================================================================================
 * Effets visuels — feux : nappes au sol (service 'hazards.field'), objets, barricades,
 * véhicules, vitrines et personnes en feu (burning > 0), puis carcasses qui rougeoient.
 *
 * Chaque foyer reçoit, selon sa distance et le budget : des flammes animées (quads dressés),
 * un panache de fumée dont la couleur dépend du matériau, des braises, une lueur posée sur
 * le sol et une lumière vacillante. Les batteries de vélo et de trottinette brûlent à leur
 * façon : jet clair, gerbes d'étincelles blanches et éclairs par à-coups.
 * ===================================================================================== */

import type { Person, Prop, Shop, Vehicle } from '@/core/contracts';
import { TILE_DOT, TILE_FLASH, TILE_PUFF, TILE_WISP } from './atlas';
import type { FxHazardField, FxPropsExt } from './api';
import { detailFactor } from './budget';
import type { FxCore } from './core';
import { DTILE_ASPHALT, DTILE_GLOW, DTILE_SOOT } from './decalAtlas';
import { DECAL_ADD } from './decalQueue';
import { TAU, hash01 } from './mathx';
import {
  F_FADE_IN, F_FLASH, F_TURB, KIND_FLAME, KIND_GLOW, MODE_AXIS, MODE_BILLBOARD, MODE_FLAT, NO_FLOOR,
  PRIO_LOW, PRIO_MID,
} from './pool';

const SRC_GROUND = 1;
const SRC_PROP = 2;
const SRC_VEHICLE = 3;
const SRC_PERSON = 4;
const SRC_SHOP = 5;

/** Matériaux : règlent la flamme, la fumée et les braises. */
const MAT_FUEL = 0;     // nappe au sol (carburant)
const MAT_PLASTIC = 1;  // poubelles, conteneurs : fumée noire épaisse
const MAT_WOOD = 2;     // palettes, mobilier : fumée grise, braises
const MAT_BATTERY = 3;  // vélos, trottinettes électriques
const MAT_VEHICLE = 4;  // voiture, fourgon
const MAT_TYRE = 5;     // deux-roues, pneus : fumée très noire
const MAT_BODY = 6;     // personne
const MAT_SHOP = 7;     // boutique

const DISCOVER_PERIOD = 0.16;
const MAX_SOURCES = 192;
const MAX_GLOWS = 48;

class FireSource {
  key = 0;
  type = 0;
  mat = MAT_FUEL;
  x = 0; y = 0; z = 0;
  /** Demi-emprise au sol, cap et hauteur de l'objet. */
  rx = 0.5; rz = 0.5; heading = 0; height = 0;
  /** Normale de façade (vitrine). */
  nx = 0; nz = 0;
  /** Intensité lissée 0..1 et intensité visée. */
  I = 0; target = 0;
  /** Chaleur résiduelle 0..1 (rougeoiement après extinction). */
  heat = 0;
  burned = 0;
  seed = 0;
  smokeAcc = 0;
  emberAcc = 0;
  crackleAt = 0;
  stamp = 0;
  marked = false;
  entity: Person | Vehicle | Prop | Shop | null = null;
}

function propMaterial(kind: string): number {
  switch (kind) {
    case 'velo': case 'trottinette': case 'station_velo': return MAT_BATTERY;
    case 'palette': case 'banc': case 'table_terrasse': case 'chaise': case 'kiosque': case 'echafaudage':
    case 'barricade': case 'debris': case 'jardiniere': return MAT_WOOD;
    default: return MAT_PLASTIC;
  }
}

export class FireRenderer {
  /** Foyers suivis (en feu ou encore chauds) et flammes dessinées à la dernière image. */
  count = 0;
  flames = 0;
  /** Le rendu des véhicules éclaire déjà ses véhicules en feu : pas de lumière de scène en double. */
  vehicleLightsElsewhere = false;
  /** Flammes et fumée des véhicules dessinées par ce module. */
  vehicleFire = true;
  hiddenPersonId = 0;

  private readonly sources: FireSource[] = [];
  private readonly free: FireSource[] = [];
  private readonly byKey = new Map<number, FireSource>();
  private stamp = 0;
  private discoverAt = 0;

  // lueurs au sol de l'image (écrites dans la couche des décalques)
  private readonly gx = new Float32Array(MAX_GLOWS);
  private readonly gy = new Float32Array(MAX_GLOWS);
  private readonly gz = new Float32Array(MAX_GLOWS);
  private readonly gs = new Float32Array(MAX_GLOWS);
  private readonly gr = new Float32Array(MAX_GLOWS);
  private readonly gg = new Float32Array(MAX_GLOWS);
  private readonly gb = new Float32Array(MAX_GLOWS);
  private glows = 0;

  constructor(private readonly core: FxCore) {}

  clear(): void {
    for (const s of this.sources) {
      s.entity = null;
      this.free.push(s);
    }
    this.sources.length = 0;
    this.byKey.clear();
    this.count = 0;
    this.flames = 0;
    this.glows = 0;
    this.discoverAt = 0;
  }

  private touch(type: number, id: number): FireSource | null {
    const key = type * 0x1000000 + (id & 0xffffff);
    let s = this.byKey.get(key);
    if (!s) {
      if (this.sources.length >= MAX_SOURCES) return null;
      s = this.free.pop() ?? new FireSource();
      s.key = key;
      s.type = type;
      s.I = 0;
      s.heat = 0;
      s.burned = 0;
      s.seed = hash01(key * 7 + 3);
      s.smokeAcc = s.seed;
      s.emberAcc = 0;
      s.crackleAt = 0;
      s.marked = false;
      s.nx = 0; s.nz = 0;
      this.sources.push(s);
      this.byKey.set(key, s);
    }
    s.stamp = this.stamp;
    return s;
  }

  /** Relève les foyers actifs dans la simulation (six fois par seconde). */
  private discover(field: FxHazardField | undefined, propsExt: FxPropsExt | undefined): void {
    const ctx = this.core.ctx;
    this.stamp++;
    if (field) {
      const fires = field.fires;
      for (let i = 0; i < fires.length; i++) {
        const f = fires[i]!;
        if (!(f.intensity > 0.02)) continue;
        const s = this.touch(SRC_GROUND, f.id);
        if (!s) break;
        s.mat = MAT_FUEL;
        s.entity = null;
        s.x = f.x; s.z = f.z;
        s.y = this.core.ground(f.x, f.z);
        s.rx = f.radius; s.rz = f.radius;
        s.height = 0;
        s.target = f.intensity > 1 ? 1 : f.intensity;
      }
    }
    const props = ctx.props.list;
    for (let i = 0; i < props.length; i++) {
      const p = props[i]!;
      if (!(p.burning > 0.02) || p.dormant) continue;
      const s = this.touch(SRC_PROP, p.id);
      if (!s) break;
      let mat = propMaterial(p.kind);
      if (mat === MAT_BATTERY && propsExt && propsExt.propView) {
        // un vélo sans batterie brûle comme un deux-roues ordinaire
        const view = propsExt.propView(p);
        if (view && view.battery === false) mat = MAT_TYRE;
      }
      s.mat = mat;
      s.entity = p;
      s.x = p.x; s.y = p.y; s.z = p.z;
      s.rx = p.halfX; s.rz = p.halfZ; s.heading = p.heading; s.height = p.height;
      s.target = p.burning > 1 ? 1 : p.burning;
    }
    if (this.vehicleFire) {
      const vehicles = ctx.vehicles.list;
      for (let i = 0; i < vehicles.length; i++) {
        const v = vehicles[i]!;
        if (!(v.burning > 0.02) || v.dormant) continue;
        const s = this.touch(SRC_VEHICLE, v.id);
        if (!s) break;
        s.mat = v.kind === 'scooter' || v.kind === 'moto_bravm' || v.kind === 'velo' ? MAT_TYRE : MAT_VEHICLE;
        s.entity = v;
        s.x = v.x; s.y = v.y; s.z = v.z;
        s.rx = v.def.width * 0.5; s.rz = v.def.length * 0.5; s.heading = v.heading; s.height = v.def.height;
        // tant que le véhicule n'est pas déclaré en feu, il ne fait que fumer et lécher
        s.target = (v.state === 'burning' ? 1 : 0.3) * (v.burning > 1 ? 1 : v.burning);
      }
    }
    const people = ctx.people.list;
    const player = ctx.player.state;
    const hidden = this.hiddenPersonId !== 0 ? this.hiddenPersonId : player.cameraMode === 'fps' ? player.personId : 0;
    for (let i = 0; i < people.length; i++) {
      const p = people[i]!;
      if (!(p.burning > 0.02) || p.dormant || p.id === hidden || p.vehicleId !== 0) continue;
      const s = this.touch(SRC_PERSON, p.id);
      if (!s) break;
      s.mat = MAT_BODY;
      s.entity = p;
      s.x = p.x; s.y = p.y; s.z = p.z;
      const lying = p.posture === 'down' || p.posture === 'prone';
      s.rx = lying ? 0.8 : 0.3; s.rz = 0.3; s.heading = p.heading;
      s.height = lying ? 0.4 : 1.7;
      s.target = p.burning > 1 ? 1 : p.burning;
    }
    const shops = ctx.props.shops;
    for (let i = 0; i < shops.length; i++) {
      const sh = shops[i]!;
      if (!(sh.burning > 0.02) || sh.dormant) continue;
      const s = this.touch(SRC_SHOP, sh.id);
      if (!s) break;
      s.mat = MAT_SHOP;
      s.entity = sh;
      s.nx = Math.sin(sh.heading); s.nz = Math.cos(sh.heading);
      s.x = sh.x + s.nx * 0.3; s.y = sh.y; s.z = sh.z + s.nz * 0.3;
      s.rx = sh.width * 0.5; s.rz = 0.3; s.heading = sh.heading; s.height = 2.6;
      s.target = sh.burning > 1 ? 1 : sh.burning;
    }
    // les foyers non revus s'éteignent : il reste la chaleur
    for (let i = 0; i < this.sources.length; i++) {
      const s = this.sources[i]!;
      if (s.stamp !== this.stamp) {
        s.target = 0;
        s.entity = null;
      }
    }
  }

  /** Avance les foyers, émet flammes, fumée, braises, lumières. À appeler une fois par image. */
  update(field: FxHazardField | undefined, propsExt: FxPropsExt | undefined): void {
    const core = this.core;
    const dt = core.dt;
    if (core.time >= this.discoverAt) {
      this.discoverAt = core.time + DISCOVER_PERIOD;
      this.discover(field, propsExt);
    }
    this.glows = 0;
    let flames = 0;
    const maxFlames = core.budget.maxFlames;
    const draw = core.view.drawDistance;
    let i = 0;
    while (i < this.sources.length) {
      const s = this.sources[i]!;
      // position des foyers mobiles
      const e = s.entity;
      if (e && s.type !== SRC_SHOP) {
        s.x = e.x; s.z = e.z; s.y = e.y;
      }
      const k = dt * 4 < 1 ? dt * 4 : 1;
      s.I += (s.target - s.I) * k;
      if (s.I > 0.03) {
        s.burned += dt;
        if (s.burned > 1.5) s.heat = 1;
      } else if (s.target <= 0) {
        // refroidissement : quelques secondes pour une nappe ou une personne, près d'une minute pour une carcasse
        const cool = s.mat === MAT_FUEL || s.mat === MAT_BODY ? 6 : s.mat === MAT_VEHICLE ? 70 : 40;
        s.heat -= dt / cool;
        if (s.heat <= 0) {
          this.byKey.delete(s.key);
          s.entity = null;
          this.free.push(s);
          const last = this.sources.pop()!;
          if (last !== s) this.sources[i] = last;
          continue;
        }
      }
      const dist = core.camDist(s.x, s.z);
      if (dist < draw) flames += this.emitSource(s, dist, flames < maxFlames ? maxFlames - flames : 0);
      i++;
    }
    this.count = this.sources.length;
    this.flames = flames;
  }

  /** Émet tout ce qui concerne un foyer ; retourne le nombre de flammes dessinées. */
  private emitSource(s: FireSource, dist: number, flameRoom: number): number {
    const core = this.core;
    const rng = core.rng;
    const budget = core.budget;
    const dt = core.dt;
    const I = s.I;
    const detail = detailFactor(dist, budget);
    const span = s.rx > s.rz ? s.rx : s.rz;
    const sinH = Math.sin(s.heading);
    const cosH = Math.cos(s.heading);
    const mat = s.mat;

    if (I <= 0.03) {
      this.emitEmbers(s, dist);
      return 0;
    }

    // ── géométrie de la flamme selon le matériau ──
    let h: number;      // hauteur de flamme (m)
    let base: number;   // hauteur du pied de flamme au-dessus du sol
    let n: number;      // nombre de flammes de près
    switch (mat) {
      case MAT_PLASTIC: h = s.height * 0.6 + 2.0 * I; base = s.height * 0.15; n = 2 + Math.round(span * 1.6); break;
      case MAT_WOOD: h = 0.9 + 1.6 * I + s.height * 0.4; base = s.height * 0.2; n = 2 + Math.round(span * 1.7); break;
      case MAT_BATTERY: h = 1.1 + 1.5 * I; base = 0.25; n = 2; break;
      case MAT_VEHICLE: h = 1.5 + 3.2 * I; base = s.height * 0.12; n = 7; break;
      case MAT_TYRE: h = 0.9 + 1.5 * I; base = 0.2; n = 3; break;
      case MAT_BODY: h = (s.height > 1 ? 1.0 : 0.6) + 0.7 * I; base = s.height > 1 ? 0.25 : 0.05; n = 2; break;
      case MAT_SHOP: h = 1.6 + 1.7 * I; base = 0.15; n = 2 + Math.round(s.rx * 1.3); break;
      default: h = (0.4 + 1.0 * I) * (0.6 + 0.4 * Math.min(2.5, span)); base = 0; n = 2 + Math.round(span * span * 1.6); break;
    }
    if (n > 10) n = 10;
    if (dist > 110) n = 1;
    else if (dist > 55) n = n > 2 ? 2 : n;
    else if (budget.level === 'bas') n = n > 3 ? 3 : n;
    if (n > flameRoom) n = flameRoom;

    // ── flammes ──
    const sp = core.sprites;
    const t = core.time;
    const top = core.topDown;
    let drawn = 0;
    for (let j = 0; j < n; j++) {
      const hj = hash01(s.key * 31 + j * 7919);
      const hk = hash01(s.key * 17 + j * 104729);
      // position dans l'emprise (ellipse), tournée selon le cap
      let lx: number;
      let lz: number;
      if (mat === MAT_SHOP || n === 1) {
        lx = n === 1 ? 0 : ((j + 0.5) / n * 2 - 1) * s.rx * 0.85;
        lz = 0;
      } else if (s.rx > s.rz * 2.2 || s.rz > s.rx * 2.2) {
        // foyer allongé (barricade, véhicule) : flammes échelonnées sur la longueur, un rideau de feu
        const along = ((j + 0.2 + 0.6 * hj) / n * 2 - 1) * 0.9;
        const across = (hk * 2 - 1) * 0.55;
        if (s.rx > s.rz) { lx = along * s.rx; lz = across * s.rz; } else { lx = across * s.rx; lz = along * s.rz; }
      } else {
        const a = hj * TAU + j * 2.4;
        const rr = Math.sqrt(hk) * 0.75;
        lx = Math.cos(a) * rr * s.rx;
        lz = Math.sin(a) * rr * s.rz;
      }
      // repère du contrat : avant = (sin h, cos h), gauche du modèle = +x local
      const wx = s.x + lx * cosH + lz * sinH;
      const wz = s.z - lx * sinH + lz * cosH;
      const breathe = 0.86 + 0.14 * Math.sin(t * (4.3 + hj * 3) + hk * 30);
      const hf = h * (0.62 + 0.5 * hj) * breathe;
      const w = Math.max(0.5, hf * (mat === MAT_BATTERY ? 0.42 : mat === MAT_VEHICLE ? 0.62 : 0.72)) * (0.85 + 0.3 * hk);
      const by = s.y + base * (0.6 + 0.6 * hk);
      const bright = (0.8 + 0.4 * I) * (mat === MAT_BATTERY ? 1.35 : 1);
      const cr = 1;
      const cb = mat === MAT_BATTERY ? 1.12 : 1;
      if (top) {
        sp.push(wx, by + hf * 0.4, wz, w * 1.5, 0, 0, 0, hj * TAU, cr, 1, cb, bright, 0, KIND_FLAME + 4 * MODE_BILLBOARD, NO_FLOOR, hj * 7 + j);
      } else {
        sp.push(wx, by + hf * 0.5, wz, w, 0, hf, 0, 0, cr, 1, cb, bright, 0, KIND_FLAME + 4 * MODE_AXIS, NO_FLOOR, hj * 7 + j);
      }
      drawn++;
    }

    // ── lueur au sol et lumière ──
    const big = mat === MAT_VEHICLE || mat === MAT_SHOP ? 1.6 : mat === MAT_BODY ? 0.5 : 0.75 + 0.35 * Math.min(2.5, span);
    if (this.glows < MAX_GLOWS && dist < 140) {
      const g = this.glows++;
      const flick = 0.85 + 0.15 * Math.sin(t * 11 + s.seed * 50) * Math.sin(t * 7.3 + s.seed * 20);
      const lum = I * flick * (0.05 + 0.3 * core.night);
      this.gx[g] = s.x; this.gy[g] = s.y; this.gz[g] = s.z;
      this.gs[g] = (span + 2.2) * 2.6 * big;
      this.gr[g] = 1.0 * lum; this.gg[g] = (mat === MAT_BATTERY ? 0.55 : 0.42) * lum; this.gb[g] = (mat === MAT_BATTERY ? 0.3 : 0.08) * lum;
    }
    const sceneLight = !(s.type === SRC_VEHICLE && this.vehicleLightsElsewhere);
    core.lights.add(
      s.x, s.y + base + h * 0.45, s.z, mat === MAT_BATTERY ? 0xffd9a8 : 0xff7a1c,
      (mat === MAT_VEHICLE || mat === MAT_SHOP ? 150 : mat === MAT_BODY ? 25 : 45 + 25 * Math.min(2.5, span)) * I,
      8 + 5 * big, s.key, 0.6, sceneLight,
    );

    // ── fumée ──
    const far = detail > 0.4 ? 1 : 0.4 + detail * 1.5;
    let rate: number;     // bouffées par seconde (qualité « haut »)
    let dark: number;     // albédo
    let opacity: number;
    switch (mat) {
      case MAT_PLASTIC: rate = 3.2 + span * 1.6; dark = 0.022; opacity = 0.86; break;
      case MAT_WOOD: rate = 2.6 + span * 1.2; dark = 0.11; opacity = 0.6; break;
      case MAT_BATTERY: rate = 4.5; dark = 0.3; opacity = 0.62; break;
      case MAT_VEHICLE: rate = 7.5; dark = 0.02; opacity = 0.9; break;
      case MAT_TYRE: rate = 5.5; dark = 0.012; opacity = 0.94; break;
      case MAT_BODY: rate = 1.4; dark = 0.05; opacity = 0.5; break;
      case MAT_SHOP: rate = 5 + s.rx * 1.5; dark = 0.03; opacity = 0.85; break;
      default: rate = 1.6 + span * 0.9; dark = 0.05; opacity = 0.6; break;
    }
    // réserve presque pleine : les panaches se modèrent d'eux-mêmes
    const room = core.pool.load > 0.85 ? 0.35 : 1;
    s.smokeAcc += rate * (0.35 + 0.65 * I) * budget.emission * far * room * dt;
    const coarse = budget.emission < 0.5 ? 1.45 : 1;
    while (s.smokeAcc >= 1) {
      s.smokeAcc -= 1;
      const a = rng.next() * TAU;
      const rr = rng.next() * 0.5;
      const lx = Math.cos(a) * rr * s.rx;
      const lz = Math.sin(a) * rr * s.rz;
      const px = s.x + lx * cosH + lz * sinH + s.nx * 0.2;
      const pz = s.z - lx * sinH + lz * cosH + s.nz * 0.2;
      const s0 = (0.7 + span * 0.5 + rng.next() * 0.5) * coarse;
      const s1 = (3.6 + span * 1.4 + rng.next() * 2.6) * (mat === MAT_BODY ? 0.5 : 1) * coarse;
      const life = (mat === MAT_BODY ? 2.6 : 5.2 + rng.next() * 2.8) * (budget.emission < 0.5 ? 0.8 : 1);
      const shade = dark * (0.8 + 0.5 * rng.next());
      const idx = core.puff(
        PRIO_LOW, px, s.y + base + h * (0.45 + 0.3 * rng.next()), pz,
        rng.signed() * 0.4 + s.nx * 0.5, 2.0 + 1.6 * I + rng.next() * 0.8, rng.signed() * 0.4 + s.nz * 0.5,
        s0, s1, life, shade, shade, shade * 1.04, opacity, mat === MAT_BODY ? TILE_WISP : TILE_PUFF + rng.int(4),
      );
      if (idx >= 0) {
        const p = core.pool;
        p.drag[idx] = 0.32;
        p.grav[idx] = -0.085;
        p.wind[idx] = 0.3;
        p.flags[idx] = F_TURB | F_FADE_IN;
        p.floorY[idx] = NO_FLOOR;
      }
    }

    // ── braises et étincelles ──
    if (detail > 0) {
      const emb = (mat === MAT_WOOD ? 9 : mat === MAT_VEHICLE ? 7 : mat === MAT_BODY ? 2 : 4.5) * I * budget.emission * detail;
      s.emberAcc += emb * dt;
      while (s.emberAcc >= 1) {
        s.emberAcc -= 1;
        const a = rng.next() * TAU;
        const rr = rng.next() * 0.7;
        const idx = core.glow(
          PRIO_LOW, s.x + Math.cos(a) * rr * span, s.y + base + h * 0.3 * rng.next(), s.z + Math.sin(a) * rr * span,
          0.06 + rng.next() * 0.06, 0.03, 1.1 + rng.next() * 1.6, 1.0, 0.45 + rng.next() * 0.2, 0.1, 2.6, TILE_DOT,
        );
        if (idx >= 0) {
          const p = core.pool;
          p.vx[idx] = rng.signed() * 0.9; p.vy[idx] = 1.6 + rng.next() * 2.4; p.vz[idx] = rng.signed() * 0.9;
          p.drag[idx] = 0.5; p.grav[idx] = -0.04; p.wind[idx] = 0.6;
          p.flags[idx] = F_TURB;
        }
      }
      if (mat === MAT_BATTERY && core.time >= s.crackleAt) this.crackle(s, base);
    }

    // ── marques laissées ──
    if (!s.marked && s.burned > 4) {
      s.marked = true;
      if (s.type === SRC_VEHICLE) core.groundDecal(DTILE_ASPHALT, s.x, s.z, span * 2.8, 1, 1, 1, 0.85, Infinity, span);
      else if (s.type === SRC_SHOP) {
        core.wallDecal(DTILE_SOOT, { x: s.x - s.nx * 0.27, y: s.y + 2.7, z: s.z - s.nz * 0.27, nx: s.nx, nz: s.nz }, s.rx * 2.4 + 1, 1, 1, 1, 0.9);
      }
    }
    return drawn;
  }

  /** Batterie : crépitement — gerbe d'étincelles blanches projetées à trois mètres, éclair bref. */
  private crackle(s: FireSource, base: number): void {
    const core = this.core;
    const rng = core.rng;
    s.crackleAt = core.time + 0.12 + rng.next() * rng.next() * 1.1;
    const n = Math.max(2, Math.round((3 + rng.next() * 7) * core.budget.emission));
    const y = s.y + base + 0.2;
    for (let k = 0; k < n; k++) {
      const a = rng.next() * TAU;
      const up = 0.25 + rng.next() * 0.75;
      const v = 4 + rng.next() * 5;
      const ch = Math.sqrt(1 - up * up * 0.8);
      core.spark(PRIO_MID, s.x, y, s.z, Math.cos(a) * ch * v, up * v, Math.sin(a) * ch * v, 0.05, 0.35 + rng.next() * 0.5, 0.85, 0.93, 1.0, 5);
    }
    core.glow(PRIO_MID, s.x, y + 0.2, s.z, 0.9 + rng.next() * 0.9, 0.4, 0.07, 0.85, 0.93, 1.0, 4.5, TILE_FLASH, F_FLASH);
    core.lights.flash(s.x, y + 0.4, s.z, 0xeaf2ff, 70, 8, 0.08);
  }

  /** Carcasse encore chaude : rougeoiement lent, filet de fumée. */
  private emitEmbers(s: FireSource, dist: number): void {
    const core = this.core;
    if (s.heat <= 0 || s.mat === MAT_BODY || dist > 120) return;
    const t = core.time;
    const span = s.rx > s.rz ? s.rx : s.rz;
    const pulse = 0.6 + 0.4 * Math.sin(t * 1.3 + s.seed * 40) * Math.sin(t * 0.7 + s.seed * 11);
    const lum = s.heat * pulse;
    const sp = core.sprites;
    const hh = s.height > 0.2 ? s.height : 0.2;
    // braises visibles dans la carcasse (points rouges) et halo
    sp.push(s.x, s.y + hh * 0.35, s.z, span * 1.5 + 0.5, 0, 0, 0, 0, 1.0, 0.16, 0.02, 0.5 * lum, TILE_DOT, KIND_GLOW + 4 * MODE_BILLBOARD, NO_FLOOR, 0);
    sp.push(s.x, s.y + 0.06, s.z, span * 2.6 + 0.8, 0, 0, 0, s.seed * TAU, 1.0, 0.12, 0.01, 0.35 * lum, TILE_DOT, KIND_GLOW + 4 * MODE_FLAT, NO_FLOOR, 0);
    if (this.glows < MAX_GLOWS) {
      const g = this.glows++;
      const k = lum * (0.05 + 0.3 * core.night);
      this.gx[g] = s.x; this.gy[g] = s.y; this.gz[g] = s.z;
      this.gs[g] = (span + 1.5) * 2.4;
      this.gr[g] = k; this.gg[g] = 0.18 * k; this.gb[g] = 0.03 * k;
    }
    core.lights.add(s.x, s.y + hh * 0.5, s.z, 0xff3a0a, 14 * lum, 6 + span, s.key, 0.2, false);
    // filet de fumée grise
    s.smokeAcc += (0.5 + span * 0.3) * s.heat * core.budget.emission * core.dt;
    if (s.smokeAcc >= 1) {
      s.smokeAcc -= 1;
      const rng = core.rng;
      const idx = core.puff(
        PRIO_LOW, s.x + rng.signed() * span * 0.5, s.y + hh * 0.7, s.z + rng.signed() * span * 0.5,
        rng.signed() * 0.2, 0.9 + rng.next() * 0.6, rng.signed() * 0.2, 0.5, 2.6 + rng.next() * 1.4, 4 + rng.next() * 2,
        0.16, 0.16, 0.165, 0.34, TILE_WISP,
      );
      if (idx >= 0) {
        const p = core.pool;
        p.drag[idx] = 0.3; p.grav[idx] = -0.05; p.wind[idx] = 0.35;
        p.flags[idx] = F_TURB | F_FADE_IN;
        p.floorY[idx] = NO_FLOOR;
      }
    }
  }

  /** Écrit les lueurs au sol de l'image dans la couche des décalques (après les décalques persistants). */
  writeGlows(): void {
    const d = this.core.decals;
    for (let g = 0; g < this.glows; g++) {
      d.push(this.gx[g]!, this.gy[g]!, this.gz[g]!, 0, 1, 0, this.gs[g]!, 0, this.gr[g]!, this.gg[g]!, this.gb[g]!, 1, DTILE_GLOW, DECAL_ADD, 0.03);
    }
  }
}
