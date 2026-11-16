/* Registre des modèles : un constructeur par VehicleKind du contrat, repli sur la berline pour un type inconnu. */

import type { VehicleDef } from '@/core/contracts';
import { Geo } from '../geo';
import type { GeoData } from '../geo';
import { tile } from '../atlas-layout';
import { CAR_STYLES, buildCar } from './cars';
import { VAN_STYLES, buildVan } from './vans';
import { buildCoach } from './coach';
import { buildCamion, buildPompiers, buildSono } from './trucks';
import { buildCanonEau, buildCentaure } from './special';
import { buildDrone, buildHelico, buildMoto, buildScooter } from './light';
import type { ModelBuilder, ModelMeta } from './types';

export type { ModelMeta, CockpitKind } from './types';

const BUILDERS: Record<string, ModelBuilder> = {
  fourgon_crs: (g, far, def) => buildVan(g, far, def, VAN_STYLES.fourgon_crs!),
  vl_commandement: (g, far, def) => buildVan(g, far, def, VAN_STYLES.vl_commandement!),
  fourgon_cellulaire: (g, far, def) => buildVan(g, far, def, VAN_STYLES.fourgon_cellulaire!),
  ambulance: (g, far, def) => buildVan(g, far, def, VAN_STYLES.ambulance!),
  utilitaire: (g, far, def) => buildVan(g, far, def, VAN_STYLES.utilitaire!),
  voiture_police: (g, far, def) => buildCar(g, far, def, CAR_STYLES.voiture_police!),
  voiture: (g, far, def) => buildCar(g, far, def, CAR_STYLES.voiture!),
  citadine: (g, far, def) => buildCar(g, far, def, CAR_STYLES.citadine!),
  suv: (g, far, def) => buildCar(g, far, def, CAR_STYLES.suv!),
  taxi: (g, far, def) => buildCar(g, far, def, CAR_STYLES.taxi!),
  car_crs: (g, far, def) => buildCoach(g, far, def, 'car_crs'),
  bus: (g, far, def) => buildCoach(g, far, def, 'bus'),
  camion: buildCamion,
  camion_pompiers: buildPompiers,
  camion_sono: buildSono,
  canon_eau: buildCanonEau,
  centaure: buildCentaure,
  moto_bravm: buildMoto,
  scooter: buildScooter,
  drone: buildDrone,
  helicoptere: buildHelico,
};

/** Types de véhicules disposant d'un modèle dédié (tous ceux du contrat). */
export const MODEL_KINDS: readonly string[] = Object.keys(BUILDERS);

/** Budgets de triangles (exigence de performance). */
export const TRI_BUDGET_NEAR = 6000;
export const TRI_BUDGET_NEAR_HEAVY = 12000;
export const TRI_BUDGET_FAR = 300;

export function triBudget(kind: string, far: boolean): number {
  if (far) return TRI_BUDGET_FAR;
  return kind === 'centaure' || kind === 'canon_eau' ? TRI_BUDGET_NEAR_HEAVY : TRI_BUDGET_NEAR;
}

export interface BuiltModel {
  data: GeoData;
  meta: ModelMeta;
}

/** Vrai si un modèle dédié existe pour ce type. */
export function hasModel(kind: string): boolean {
  return Object.prototype.hasOwnProperty.call(BUILDERS, kind);
}

/** Construit la géométrie fusionnée d'un type de véhicule aux dimensions de sa définition. */
export function buildModel(kind: string, def: VehicleDef, far: boolean): BuiltModel {
  const g = new Geo(tile('blanc'));
  const builder = BUILDERS[kind] ?? BUILDERS.voiture!;
  const meta = builder(g, far, def);
  return { data: g.build(), meta };
}

/**
 * Clé de cache d'un modèle : le type et tout ce qui, dans la définition, change la géométrie (dimensions,
 * empattement, position des tourelles).
 */
export function modelKey(kind: string, def: VehicleDef): string {
  let k = `${kind}|${def.length.toFixed(3)}|${def.width.toFixed(3)}|${def.height.toFixed(3)}|${def.wheelbase.toFixed(3)}`;
  for (const t of def.turrets) k += `|${t.kind}:${t.x.toFixed(2)},${t.y.toFixed(2)},${t.z.toFixed(2)}`;
  return k;
}
