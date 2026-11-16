/* =====================================================================================
 * GROUPES RADICAUX — choix des cibles de la casse, du chantier de barricade, des véhicules.
 *
 * Casse CIBLÉE (bible F.5, dossier 03 §3.4) : banques et distributeurs d'abord, panneaux publicitaires
 * et abribus, restauration rapide et agences, enseignes de luxe et de téléphonie ; presque jamais le
 * petit commerce, jamais une pharmacie. Une cible vaut par son poids, sa proximité, et ce qu'il faut
 * pour l'entamer (un rideau baissé demande des outils et du temps ; une ligne à vingt-cinq mètres
 * dissuade). Barricade : en travers de la rue, entre le groupe et les forces, là où il y a de la matière
 * (poubelles, conteneurs, barrières, vélos et trottinettes, palettes, mobilier de terrasse).
 * ===================================================================================== */

import type { EntityId, Prop, Shop, Vehicle } from '@/core/contracts';
import type { ShopView } from '@/sim/props/api';
import { isPoliceUp } from './kernel';
import type { RadKernel } from './kernel';
import { TARGET, TOOL } from './model';
import type { RadGroup } from './model';
import * as R from './tuning';

let shopView: ShopView | undefined;

/** Outils du groupe (réunion des outils des membres valides). */
export function groupTools(g: RadGroup): number {
  let t = 0;
  for (let i = 0; i < g.members.length; i++) t |= g.members[i]!.tools;
  return t;
}

/** Le rideau de cette boutique protège-t-il encore la vitrine ? */
export function shutterHolds(k: RadKernel, s: Shop): boolean {
  if (s.shutter < 0.5) return false;
  if (!k.propsExt) return true;
  const v = k.propsExt.shopView(s, shopView);
  if (!v) return true;
  shopView = v;
  return !v.forced;
}

function done(g: RadGroup, id: EntityId): boolean {
  return g.done.indexOf(id) >= 0;
}

/**
 * Meilleure cible de casse autour du groupe : écrit tKind / tId / tx / tz et retourne son intérêt
 * (0 : rien). `heat` : au palier d'affrontement généralisé on force aussi les rideaux et les planches.
 */
export function findBreakTarget(k: RadKernel, g: RadGroup, radius: number): number {
  const ctx = k.ctx;
  const tools = groupTools(g);
  const hasTool = (tools & (TOOL.HAMMER | TOOL.BAR)) !== 0;
  const canThrow = g.ammo >= 2;
  if (!hasTool && !canThrow) return 0;
  const riot = k.heat >= R.TIER_RIOT;
  let best = 0;
  let kind = 0;
  let id = 0;
  let bx = 0;
  let bz = 0;
  const shops = k.shops;
  const ns = ctx.props.shopsNear(g.ax, g.az, radius, shops);
  for (let i = 0; i < ns; i++) {
    const s = shops[i]!;
    if (s.dormant || s.window === 'broken' || s.burning > 0 || done(g, s.id) || k.claimedByOther(g, s.id)) continue;
    let w = R.SHOP_WEIGHT[s.category] ?? 1;
    if (w <= 1) continue; // le petit commerce n'est pas une cible du bloc
    if (shutterHolds(k, s)) {
      // forcer un rideau : long, bruyant, avec des outils — seulement quand tout est permis
      if (!riot || !hasTool) continue;
      w *= 0.45;
    } else if (s.window === 'boarded') {
      if (!hasTool) continue;
      w *= 0.6;
    }
    const d = Math.hypot(s.x - g.ax, s.z - g.az);
    let score = (w / 9) * (1 - 0.55 * (d / radius));
    if (ctx.people.countIn(s.x, s.z, 25, isPoliceUp) > 0) score -= 0.5;
    if (score > best) {
      best = score;
      kind = TARGET.SHOP;
      id = s.id;
      bx = s.x;
      bz = s.z;
    }
  }
  const props = k.props;
  const np = ctx.props.queryRadius(g.ax, g.az, radius, props);
  for (let i = 0; i < np; i++) {
    const pr = props[i]!;
    const w = R.PROP_WEIGHT[pr.kind];
    if (w === undefined || pr.dormant || pr.state === 'broken' || pr.state === 'burnt' || pr.burning > 0) continue;
    if (done(g, pr.id) || k.claimedByOther(g, pr.id)) continue;
    // une caméra sur son mât ne s'atteint qu'au jet ; le reste se casse à l'outil
    if (pr.kind === 'camera' ? !canThrow : !hasTool) continue;
    const d = Math.hypot(pr.x - g.ax, pr.z - g.az);
    let score = (w / 9) * (1 - 0.55 * (d / radius)) * 0.9;
    if (ctx.people.countIn(pr.x, pr.z, 25, isPoliceUp) > 0) score -= 0.5;
    if (score > best) {
      best = score;
      kind = TARGET.PROP;
      id = pr.id;
      bx = pr.x;
      bz = pr.z;
    }
  }
  if (best > 0) {
    g.tKind = kind;
    g.tId = id;
    g.tx = bx;
    g.tz = bz;
  }
  return best;
}

/** L'objet est-il déjà posé sur la ligne d'un chantier de barricade (de n'importe quel groupe) ? */
export function onSiteLine(k: RadKernel, x: number, z: number): boolean {
  for (let i = 0; i < k.groups.length; i++) {
    const s = k.groups[i]!.site;
    if (!s.active) continue;
    const ox = x - s.x;
    const oz = z - s.z;
    if (Math.abs(ox * s.rx + oz * s.rz) < 2.2 && Math.abs(ox * s.ax + oz * s.az) < s.half + 1.5) return true;
  }
  return false;
}

/** L'objet peut-il servir de matière à barricade maintenant ? */
export function isMaterial(pr: Prop): boolean {
  return R.BARRICADE_BULK_OF[pr.kind] !== undefined && pr.movable && pr.carriedBy === 0 && pr.burning < 0.2
    && pr.state !== 'broken' && pr.state !== 'burnt' && !pr.dormant;
}

/** Volume de matière à barricade disponible autour d'un point. */
export function materialAround(k: RadKernel, x: number, z: number, radius: number): number {
  const props = k.props;
  const n = k.ctx.props.queryRadius(x, z, radius, props);
  let bulk = 0;
  for (let i = 0; i < n; i++) {
    const pr = props[i]!;
    if (isMaterial(pr) && !k.claims.has(pr.id)) bulk += R.BARRICADE_BULK_OF[pr.kind]!;
  }
  return bulk;
}

/**
 * Chantier de barricade : en travers de la rue la plus proche d'un point situé entre le groupe et les
 * forces (ou devant le groupe s'il n'y en a pas). Mesure la largeur à barrer par des rayons vers les
 * façades. Remplit g.site et retourne true si l'endroit convient et s'il y a assez de matière autour.
 */
export function findBarricadeSite(k: RadKernel, g: RadGroup): boolean {
  const ctx = k.ctx;
  const world = ctx.world;
  const a = g.a;
  let x = g.ax + g.hx * 7;
  let z = g.az + g.hz * 7;
  if (a.police > 0 && a.dist < 110) {
    // entre nous et eux, hors de portée de leurs boucliers
    const dx = g.ax - a.nx;
    const dz = g.az - a.nz;
    const d = Math.hypot(dx, dz) || 1;
    const at = Math.max(R.BARRICADE_FROM_POLICE, Math.min(d - 6, 55));
    if (d < R.BARRICADE_FROM_POLICE - 6) return false;
    x = a.nx + (dx / d) * at;
    z = a.nz + (dz / d) * at;
  }
  const road = k.road;
  let rx = g.hx;
  let rz = g.hz;
  if (world.nearestRoad(x, z, road, 25)) {
    x = road.x;
    z = road.z;
    rx = Math.sin(road.heading);
    rz = Math.cos(road.heading);
  }
  if (!world.isFree(x, z, 0.5)) return false;
  const ax = -rz;
  const az = rx;
  // largeur à barrer : jusqu'aux façades, douze mètres au plus de chaque côté
  const hit = k.hit;
  let left = 12;
  let right = 12;
  if (world.raycast(x, z, x - ax * 12, z - az * 12, hit)) left = hit.t * 12;
  if (world.raycast(x, z, x + ax * 12, z + az * 12, hit)) right = hit.t * 12;
  // une barricade tient une rue ; au milieu d'une place elle ne barre rien : on barre la chaussée
  const half = Math.min(7, Math.max(2.2, Math.min(left, right)));
  if (materialAround(k, x, z, R.BARRICADE_COLLECT) < 4) return false;
  const s = g.site;
  s.active = true;
  s.x = x;
  s.z = z;
  s.ax = ax;
  s.az = az;
  s.rx = rx;
  s.rz = rz;
  s.half = half;
  s.placed = 0;
  s.bulk = 0;
  s.barricadeId = 0;
  s.lit = false;
  s.startedAt = k.now;
  return true;
}

/** Objet de barricade libre le plus proche d'une personne, dans le rayon de collecte du chantier. */
export function nearestMaterial(k: RadKernel, g: RadGroup, px: number, pz: number, light: boolean): Prop | null {
  const s = g.site;
  const props = k.props;
  const n = k.ctx.props.queryRadius(s.x, s.z, R.BARRICADE_COLLECT, props);
  let best: Prop | null = null;
  let bestScore = Infinity;
  for (let i = 0; i < n; i++) {
    const pr = props[i]!;
    if (!isMaterial(pr) || k.claims.has(pr.id)) continue;
    const bulk = R.BARRICADE_BULK_OF[pr.kind]!;
    if (light && bulk > 1) continue;
    // déjà en place sur la ligne d'un chantier
    const ox = pr.x - s.x;
    const oz = pr.z - s.z;
    if (onSiteLine(k, pr.x, pr.z)) continue;
    const d = Math.hypot(pr.x - px, pr.z - pz) + Math.hypot(ox, oz) * 0.6;
    // les gros volumes d'abord : deux conteneurs font une barricade
    const score = d - bulk * 6;
    if (score < bestScore) {
      bestScore = score;
      best = pr;
    }
  }
  return best;
}

/** Véhicule civil à l'arrêt, sans personne à bord, que l'on peut incendier ou renverser. */
export function findParkedVehicle(k: RadKernel, g: RadGroup, radius: number, forFlip: boolean): Vehicle | null {
  const ctx = k.ctx;
  const vs = k.vehicles;
  const n = ctx.vehicles.queryRadius(g.ax, g.az, radius, vs);
  let best: Vehicle | null = null;
  let bestD = Infinity;
  for (let i = 0; i < n; i++) {
    const v = vs[i]!;
    if (v.dormant || v.def.flying || v.faction === 'police' || v.faction === 'rescue' || v.faction === 'medic') continue;
    // ni le camion sono du cortège, ni les secours, ni un véhicule que quelqu'un conduit
    if (v.kind === 'camion_sono' || v.kind === 'ambulance' || v.kind === 'camion_pompiers' || v.brain !== null) continue;
    if (v.state === 'burning' || v.state === 'burnt' || v.state === 'wrecked' || v.burning > 0.05) continue;
    if (Math.abs(v.speed) > 0.3 || v.engineOn) continue;
    let occupied = false;
    for (let s = 0; s < v.seats.length; s++) if (v.seats[s] !== 0) occupied = true;
    if (occupied || done(g, v.id) || k.claimedByOther(g, v.id)) continue;
    if (forFlip) {
      if (v.def.mass > 2200 || v.kind === 'scooter' || (k.vehExt !== undefined && (k.vehExt.isFlipped(v) || !k.vehExt.spec(v.kind).flippable))) continue;
    }
    if (ctx.people.countIn(v.x, v.z, 22, isPoliceUp) > 0) continue;
    const d = Math.hypot(v.x - g.ax, v.z - g.az);
    if (d < bestD) {
      bestD = d;
      best = v;
    }
  }
  return best;
}

/** Poubelle ou conteneur à incendier près du groupe. */
export function findBin(k: RadKernel, g: RadGroup, radius: number): Prop | null {
  const props = k.props;
  const n = k.ctx.props.queryRadius(g.ax, g.az, radius, props);
  let best: Prop | null = null;
  let bestD = Infinity;
  for (let i = 0; i < n; i++) {
    const pr = props[i]!;
    if ((pr.kind !== 'poubelle' && pr.kind !== 'conteneur') || pr.dormant || pr.burning > 0 || pr.state === 'burnt' || pr.carriedBy !== 0) continue;
    if (done(g, pr.id) || k.claims.has(pr.id) || onSiteLine(k, pr.x, pr.z)) continue;
    const d = Math.hypot(pr.x - g.ax, pr.z - g.az);
    if (d < bestD) {
      bestD = d;
      best = pr;
    }
  }
  return best;
}

/** Intérêt d'un endroit pour une manifestation sauvage : de quoi casser, de quoi brûler, de quoi barrer la rue. */
export function placeInterest(k: RadKernel, x: number, z: number): number {
  const ctx = k.ctx;
  let score = 0;
  const shops = k.shops;
  const ns = ctx.props.shopsNear(x, z, 45, shops);
  for (let i = 0; i < ns; i++) {
    const s = shops[i]!;
    if (s.window === 'broken' || s.burning > 0 || s.dormant) continue;
    const w = R.SHOP_WEIGHT[s.category] ?? 1;
    if (w >= 4) score += w / 9;
  }
  const props = k.props;
  const np = ctx.props.queryRadius(x, z, 40, props);
  for (let i = 0; i < np; i++) {
    const pr = props[i]!;
    if (pr.dormant || pr.burning > 0 || pr.state === 'burnt') continue;
    if (R.PROP_WEIGHT[pr.kind] !== undefined) score += 0.4;
    else if (R.BARRICADE_BULK_OF[pr.kind] !== undefined) score += 0.12;
  }
  return score;
}
