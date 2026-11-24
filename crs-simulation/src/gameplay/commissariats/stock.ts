/* =====================================================================================
 * COMMISSARIATS (jeu) — véhicules garés en réserve : occupation des places, mise en place des véhicules sans
 * équipage (à la mise en place de la session), choix d'une place libre (engagement, retour d'une unité accueillie).
 *
 * Un véhicule garé est dans le même état qu'une voiture garée de la circulation (src/sim/traffic/parking.ts) :
 * verrouillé, moteur coupé, frein et frein à main serrés, solide. Faction police : un policier peut y monter (il le
 * retire alors du stock). Aucun tirage au hasard : places prises dans l'ordre des données.
 * ===================================================================================== */

import type { EntityId, GameContext, Prop, Vehicle, VehicleKind } from '@/core/contracts';
import { BAC_COLOR, vehicleLen } from '@/world/commissariats';
import type { CommissariatDef, StockTemplate, YardSlot } from '@/world/commissariats';

/** Marge autour d'un véhicule garé : une place est occupée si un véhicule ou un obstacle la touche à moins de … (m). */
export const OCCUPIED_MARGIN = 0.4;
/** Livrée des fourgons de la gendarmerie mobile (même valeur que createPeloton, src/sim/police/units.ts). */
export const GENDARMERIE_BLUE = 0x23407a;

const nearV: Vehicle[] = [];
const nearP: Prop[] = [];

/** Rectangle orienté (centre, cap, demi-longueur, demi-largeur). */
interface Box {
  x: number;
  z: number;
  h: number;
  hl: number;
  hw: number;
}

/** Deux rectangles orientés se recouvrent-ils (axes séparateurs) ? */
function boxesOverlap(a: Box, b: Box): boolean {
  const ax = Math.sin(a.h), az = Math.cos(a.h);
  const bx = Math.sin(b.h), bz = Math.cos(b.h);
  const axes: readonly (readonly [number, number])[] = [[ax, az], [az, -ax], [bx, bz], [bz, -bx]];
  for (const [ux, uz] of axes) {
    const ca = a.x * ux + a.z * uz;
    const cb = b.x * ux + b.z * uz;
    const ra = Math.abs(ax * ux + az * uz) * a.hl + Math.abs(az * ux - ax * uz) * a.hw;
    const rb = Math.abs(bx * ux + bz * uz) * b.hl + Math.abs(bz * ux - bx * uz) * b.hw;
    if (ca + ra < cb - rb || cb + rb < ca - ra) return false;
  }
  return true;
}

/** Genre de véhicule réellement créé : la voiture banalisée retombe sur la voiture de police sans sa définition. */
export function realKind(ctx: GameContext, kind: VehicleKind): VehicleKind {
  if (kind === 'voiture_bac' && !ctx.vehicles.def('voiture_bac')) return 'voiture_police';
  return kind;
}

/** Dimensions (longueur, largeur) d'un genre de véhicule : sa définition, à défaut la place figée. */
function dims(ctx: GameContext, kind: VehicleKind): { len: number; width: number } {
  const def = ctx.vehicles.def(kind);
  return def ? { len: def.length, width: def.width } : { len: vehicleLen(kind), width: 2.1 };
}

/**
 * La place est-elle libre pour ce genre de véhicule : aucun véhicule (hors `ignore`) ni obstacle fixe du décor dans le
 * rectangle du véhicule garé, élargi de OCCUPIED_MARGIN ?
 */
export function slotFree(ctx: GameContext, slot: YardSlot, kind: VehicleKind, ignore?: ReadonlySet<EntityId>): boolean {
  const d = dims(ctx, kind);
  const box: Box = { x: slot.x, z: slot.z, h: slot.heading, hl: d.len / 2 + OCCUPIED_MARGIN, hw: d.width / 2 + OCCUPIED_MARGIN };
  const reach = d.len / 2 + 14;
  const n = ctx.vehicles.queryRadius(slot.x, slot.z, reach, nearV);
  for (let i = 0; i < n; i++) {
    const o = nearV[i]!;
    if (o.def.flying || (ignore && ignore.has(o.id))) continue;
    if (boxesOverlap(box, { x: o.x, z: o.z, h: o.heading, hl: o.def.length / 2, hw: o.def.width / 2 })) return false;
  }
  const m = ctx.props.queryRadius(slot.x, slot.z, d.len / 2 + 4, nearP);
  for (let i = 0; i < m; i++) {
    const p = nearP[i]!;
    if (!p.blocksMove || p.carriedBy !== 0) continue;
    if (boxesOverlap(box, { x: p.x, z: p.z, h: p.heading, hl: p.halfZ, hw: p.halfX })) return false;
  }
  return true;
}

/** Longueur du couloir d'approche contrôlé derrière une place (m) : le point d'approche du pilote automatique. */
export const APPROACH_LEN = 9;

/**
 * Le couloir d'approche d'une place (dans son axe, juste derrière elle, sur APPROACH_LEN m) est-il libre de tout
 * véhicule (hors `ignore`) ? Le pilote automatique se gare en entrant dans la place par l'arrière, dans son axe : une
 * voiture garée juste derrière la bloque (au 8e, TV 75-18 restait arrêtée derrière TV 75-28 et BAC 75-08).
 */
export function approachClear(ctx: GameContext, slot: YardSlot, kind: VehicleKind, ignore?: ReadonlySet<EntityId>): boolean {
  const d = dims(ctx, kind);
  const fx = Math.sin(slot.heading), fz = Math.cos(slot.heading);
  const back = d.len / 2 + APPROACH_LEN / 2;
  const box: Box = { x: slot.x - fx * back, z: slot.z - fz * back, h: slot.heading, hl: APPROACH_LEN / 2, hw: d.width / 2 + 0.2 };
  const n = ctx.vehicles.queryRadius(box.x, box.z, APPROACH_LEN / 2 + 14, nearV);
  for (let i = 0; i < n; i++) {
    const o = nearV[i]!;
    if (o.def.flying || (ignore && ignore.has(o.id))) continue;
    if (boxesOverlap(box, { x: o.x, z: o.z, h: o.heading, hl: o.def.length / 2, hw: o.def.width / 2 })) return false;
  }
  return true;
}

/** La place peut-elle recevoir ce véhicule (assez longue) ? */
function fits(slot: YardSlot, kind: VehicleKind): boolean {
  return slot.len + 0.05 >= vehicleLen(kind);
}

/**
 * Place libre pour le véhicule `kind` : d'abord les places de sa file (`template`, dans l'ordre), puis les places de
 * réserve du site. `used` : places déjà attribuées (complétée par la place retenue). -1 si aucune.
 */
export function freeSlot(
  ctx: GameContext, def: CommissariatDef, template: Pick<StockTemplate, 'slots'> | null, kind: VehicleKind, used: Set<number>,
  ignore?: ReadonlySet<EntityId>,
): number {
  const tryIdx = (i: number): boolean => {
    const s = def.slots[i];
    if (!s || used.has(i) || !fits(s, kind) || !slotFree(ctx, s, kind, ignore)) return false;
    used.add(i);
    return true;
  };
  if (template) for (const i of template.slots) if (tryIdx(i)) return i;
  for (let i = 0; i < def.slots.length; i++) if (def.slots[i]!.spare && tryIdx(i)) return i;
  return -1;
}

/** Couleur d'un véhicule garé de ce modèle de stock (undefined : couleur de sa définition). */
export function stockColor(ctx: GameContext, template: Pick<StockTemplate, 'kind' | 'vehicle'>): number | undefined {
  if (template.kind === 'peloton_gm') return GENDARMERIE_BLUE;
  if (template.vehicle === 'voiture_bac' && ctx.vehicles.def('voiture_bac')) return BAC_COLOR;
  return undefined;
}

/** Pose un véhicule garé sans équipage, dans l'état d'une voiture garée. */
export function spawnParked(ctx: GameContext, kind: VehicleKind, slot: YardSlot, color: number | undefined): Vehicle {
  const v = ctx.vehicles.spawn(kind, slot.x, slot.z, slot.heading, { faction: 'police', color });
  v.y = ctx.world.heightAt(slot.x, slot.z);
  v.heading = slot.heading;
  v.speed = 0;
  v.engineOn = false;
  v.locked = true;
  v.cmd.throttle = 0;
  v.cmd.brake = 1;
  v.cmd.handbrake = true;
  return v;
}

/** Résultat de la mise en place d'une unité du stock. */
export interface ParkedUnit {
  /** Véhicules posés et leur place, tête de file d'abord. */
  readonly parked: { id: EntityId; slot: number }[];
  /** Véhicules sans place libre (« virtuels ») : créés à l'engagement par le rangement de repli des unités. */
  virtual: number;
}

/**
 * Pose les véhicules d'une unité du stock sur ses places (ou, occupées, sur des places de réserve). `used` : places
 * déjà prises dans ce site (complété).
 */
export function parkTemplate(ctx: GameContext, def: CommissariatDef, template: StockTemplate, used: Set<number>): ParkedUnit {
  const kind = realKind(ctx, template.vehicle);
  const color = stockColor(ctx, template);
  const out: ParkedUnit = { parked: [], virtual: 0 };
  for (let i = 0; i < template.vehicles; i++) {
    const idx = freeSlot(ctx, def, template, kind, used);
    if (idx < 0) {
      out.virtual++;
      continue;
    }
    const v = spawnParked(ctx, kind, def.slots[idx]!, color);
    out.parked.push({ id: v.id, slot: idx });
  }
  return out;
}
