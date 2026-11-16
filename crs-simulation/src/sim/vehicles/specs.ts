/* =====================================================================================
 * Caractéristiques hors contrat de chaque type de véhicule (VehicleSpec) : moteur et boîte,
 * tenue de route, incendie, équipements de tourelle, vol.
 *
 * Valeurs appuyées sur docs/research/00-bible-realisme.md (C, G.4) et 02 §4-5, 06 §7-9 :
 *   - Centaure : 300 ch pour 14,5 t (≈ 15 W/kg) ; lame qui déplace 12 t immobilisées ; 30 tubes,
 *     une recharge, rechargement 120 s à l'arrêt ; portées 50 / 100 / 200 m ;
 *   - engin lanceur d'eau : 15 l/s, portée 60 m (40 utile), ravitaillement 90 s ;
 *   - fourgon-pompe : lance de 25 m à 8 l/s ;
 *   - voiture en feu : embrasement complet en 120 à 240 s, durée 900 à 1 500 s ;
 *   - drone : 15 m/s, 30 à 120 m, batterie 30 min ; hélicoptère : orbites à 300-600 m.
 * Les autres valeurs (puissances massiques, rigidités de dérive, centres de gravité) sont des ordres
 * de grandeur usuels par catégorie.
 * ===================================================================================== */

import type { VehicleDef } from '@/core/contracts';
import type { EngineSpec, FireSpec, FlightSpec, HandlingSpec, JetSpec, LauncherSpec, VehicleSpec } from './api';

function engine(
  power: number, idle: number, redline: number, gears: number, drive: EngineSpec['drive'], engineBrake: number,
  electric = false,
): EngineSpec {
  return { power, idle, redline, gears, drive, engineBrake, electric };
}

function handling(
  grip: number, stiffness: number, rearBias: number, frontWeight: number, cgHeight: number, steerSpeed: number,
  rollGain: number, pitchGain: number, twoWheels = false,
): HandlingSpec {
  return { grip, stiffness, rearBias, frontWeight, cgHeight, steerSpeed, twoWheels, rollGain, pitchGain };
}

function fire(
  ignition: number, igniteTime: number, spreadMin: number, spreadMax: number, burnMin: number, burnMax: number,
  explosion: number, blastRadius: number,
): FireSpec {
  return { ignition, igniteTime, spreadMin, spreadMax, burnMin, burnMax, explosion, blastRadius };
}

// moteurs : essence, diesel léger, poids lourd, moto, scooter (variateur)
const ESSENCE = (power: number, drive: EngineSpec['drive'] = 'av'): EngineSpec => engine(power, 850, 6200, 6, drive, 0.7);
const DIESEL = (power: number, drive: EngineSpec['drive'] = 'ar'): EngineSpec => engine(power, 780, 4300, 6, drive, 0.8);
const LOURD = (power: number, drive: EngineSpec['drive'] = 'ar'): EngineSpec => engine(power, 600, 2500, 8, drive, 0.9);

// tenue de route
const H_VOITURE = handling(1.0, 9, 1.08, 0.6, 0.55, 12, 0.007, 0.006);
const H_SUV = handling(0.97, 8.5, 1.08, 0.58, 0.68, 12, 0.009, 0.007);
const H_FOURGON = handling(0.92, 7.5, 1.1, 0.55, 0.9, 11, 0.01, 0.008);
const H_LOURD = handling(0.8, 6, 1.12, 0.45, 1.3, 10, 0.008, 0.006);
const H_BLINDE = handling(0.78, 6, 1.12, 0.5, 1.45, 10, 0.007, 0.005);
const H_MOTO = handling(1.05, 10, 1.15, 0.48, 0.6, 7.5, 0, 0.012, true);
const H_VELO = handling(0.95, 9, 1.1, 0.42, 0.95, 6, 0, 0.01, true);

// incendie (G.4) : voiture 120-240 s puis 900-1 500 s ; deux-roues 20-40 s puis 600-900 s
const F_VOITURE = fire(25, 12, 120, 240, 900, 1500, 0.3, 6);
const F_FOURGON = fire(35, 16, 150, 270, 1000, 1500, 0.25, 6.5);
const F_LOURD = fire(60, 30, 200, 360, 1200, 1800, 0.15, 8);
const F_BLINDE = fire(250, 120, 300, 480, 1200, 1800, 0.02, 7);
const F_DEUX_ROUES = fire(14, 8, 20, 40, 600, 900, 0.35, 3.5);
// vélo : pneus et selle seulement, pas de réservoir
const F_VELO = fire(10, 6, 10, 20, 120, 240, 0, 0);
const F_DRONE = fire(4, 2, 5, 10, 30, 60, 0, 0);
const F_HELICO = fire(60, 25, 60, 120, 600, 900, 0.5, 10);

const JET_ELE: JetSpec = { flow: 15, speed: 26, range: 60, useful: 40, refill: 90, douse: 3, rescue: false };
const JET_POMPIERS: JetSpec = { flow: 8, speed: 17, range: 25, useful: 20, refill: 60, douse: 2.5, rescue: true };

const LANCEUR_CENTAURE: LauncherSpec = {
  projectile: 'grenade_lacrymo_56', ranges: [50, 100, 200], reserve: 30, reloadTime: 120, spreadOne: 0, spreadFull: 60,
};

const VOL_DRONE: FlightSpec = { type: 'drone', climb: 5, descent: 3.5, accel: 6, yawRate: 1.75, ceiling: 120, floor: 2, battery: 1800, cruise: 30 };
const VOL_HELICO: FlightSpec = { type: 'helico', climb: 8, descent: 6, accel: 5, yawRate: 0.6, ceiling: 900, floor: 30, battery: 0, cruise: 400 };

interface SpecInit {
  engine: EngineSpec; handling: HandlingSpec; fire: FireSpec;
  toughness?: number; flippable?: boolean; boardTime?: number; seatTurret?: number[];
  jets?: (JetSpec | null)[]; launchers?: (LauncherSpec | null)[]; flight?: FlightSpec; pushMass?: number; mast?: number;
}

const TABLE: Record<string, SpecInit> = {
  fourgon_crs: { engine: DIESEL(27), handling: H_FOURGON, fire: F_FOURGON, boardTime: 1.5 },
  car_crs: { engine: LOURD(15), handling: H_LOURD, fire: F_LOURD, boardTime: 2.2 },
  vl_commandement: { engine: DIESEL(27), handling: H_FOURGON, fire: F_FOURGON, boardTime: 1.5 },
  voiture_police: { engine: ESSENCE(70, '4x4'), handling: H_SUV, fire: F_VOITURE, flippable: true },
  fourgon_cellulaire: { engine: DIESEL(26), handling: H_FOURGON, fire: F_FOURGON, boardTime: 1.8 },
  centaure: {
    engine: LOURD(15.2, '4x4'), handling: H_BLINDE, fire: F_BLINDE, toughness: 0.12, boardTime: 2.0,
    seatTurret: [-1, 1, 0], jets: [null, null], launchers: [LANCEUR_CENTAURE, null], pushMass: 18000, mast: 1.6,
  },
  canon_eau: {
    engine: LOURD(10.5), handling: H_LOURD, fire: F_LOURD, toughness: 0.45, boardTime: 2.0,
    seatTurret: [-1, 0, 1], jets: [JET_ELE, JET_ELE], launchers: [null, null],
  },
  moto_bravm: { engine: engine(190, 1150, 8500, 6, 'ar', 1.2), handling: H_MOTO, fire: F_DEUX_ROUES, boardTime: 1.0 },
  camion_pompiers: {
    engine: LOURD(17), handling: H_LOURD, fire: F_LOURD, toughness: 0.8, boardTime: 1.8,
    seatTurret: [-1, 0], jets: [JET_POMPIERS], launchers: [null],
  },
  ambulance: { engine: DIESEL(34), handling: H_FOURGON, fire: F_FOURGON, boardTime: 1.5 },
  voiture: { engine: ESSENCE(60), handling: H_VOITURE, fire: F_VOITURE, flippable: true },
  citadine: { engine: ESSENCE(55), handling: H_VOITURE, fire: F_VOITURE, flippable: true },
  suv: { engine: ESSENCE(65, '4x4'), handling: H_SUV, fire: F_VOITURE, flippable: true },
  taxi: { engine: ESSENCE(60), handling: H_VOITURE, fire: F_VOITURE, flippable: true },
  utilitaire: { engine: DIESEL(40, 'av'), handling: H_FOURGON, fire: F_FOURGON },
  camion: { engine: LOURD(14), handling: H_LOURD, fire: F_LOURD, boardTime: 1.8 },
  bus: { engine: LOURD(16), handling: H_LOURD, fire: F_LOURD, boardTime: 2.0 },
  scooter: { engine: engine(45, 1700, 8500, 1, 'ar', 0.9), handling: H_MOTO, fire: F_DEUX_ROUES, boardTime: 0.9 },
  camion_sono: { engine: LOURD(16), handling: H_LOURD, fire: F_LOURD, boardTime: 1.8 },
  // vélo : le « moteur » est le cycliste (≈ 4 W/kg avec le vélo), sans boîte ni bruit ; il s'enfourche en 0,6 s
  velo: { engine: engine(4, 0, 1, 1, 'ar', 0.05, true), handling: H_VELO, fire: F_VELO, boardTime: 0.6 },
  drone: {
    engine: engine(400, 3000, 9000, 1, '4x4', 0, true), handling: H_VOITURE, fire: F_DRONE, toughness: 6,
    flight: VOL_DRONE, jets: [null], launchers: [null],
  },
  helicoptere: {
    engine: engine(300, 250, 400, 1, '4x4', 0), handling: H_VOITURE, fire: F_HELICO, boardTime: 2.0,
    seatTurret: [-1, -1, 0], flight: VOL_HELICO, jets: [null], launchers: [null],
  },
};

const GENERIC: SpecInit = { engine: ESSENCE(60), handling: H_VOITURE, fire: F_VOITURE, flippable: true };

function fill<T>(given: readonly T[] | undefined, n: number, empty: T): T[] {
  const out: T[] = [];
  for (let i = 0; i < n; i++) out.push(given && i < given.length ? given[i]! : empty);
  return out;
}

const cache = new Map<VehicleDef, VehicleSpec>();

/**
 * Caractéristiques complètes pour une définition de véhicule. Un type inconnu (ajouté par un autre
 * module) reçoit celles d'une berline ; les tableaux sont alignés sur les sièges et tourelles de la définition.
 */
export function specFor(def: VehicleDef): VehicleSpec {
  let s = cache.get(def);
  if (s) return s;
  const init = TABLE[def.kind] ?? GENERIC;
  s = {
    kind: def.kind,
    engine: init.engine,
    handling: init.handling,
    fire: init.fire,
    toughness: init.toughness ?? (def.armored ? 0.15 : 1),
    flippable: init.flippable ?? false,
    boardTime: init.boardTime ?? 1.3,
    seatTurret: fill(init.seatTurret, def.seats.length, -1),
    jets: fill(init.jets, def.turrets.length, null),
    launchers: fill(init.launchers, def.turrets.length, null),
    flight: init.flight ?? null,
    pushMass: init.pushMass ?? (def.canPush ? 8000 : 0),
    mast: init.mast ?? 0,
  };
  cache.set(def, s);
  return s;
}

// ───────────────────────────── adhérence des sols ─────────────────────────────

/** Coefficients d'adhérence par nature de sol : [sec, mouillé], et résistance au roulement (fraction du poids). */
const SURFACE_GRIP: Record<string, readonly [number, number, number]> = {
  road: [0.9, 0.62, 0.015],
  bridge: [0.9, 0.6, 0.015],
  // pavés parisiens : corrects à sec, traîtres sous la pluie
  sett: [0.75, 0.38, 0.02],
  quay: [0.75, 0.42, 0.02],
  sidewalk: [0.85, 0.58, 0.018],
  plaza: [0.82, 0.52, 0.018],
  park: [0.55, 0.33, 0.06],
  gravel: [0.6, 0.48, 0.05],
  interior: [0.8, 0.7, 0.02],
  building: [0.8, 0.6, 0.02],
  water: [0.3, 0.3, 0.3],
  void: [0.8, 0.55, 0.02],
};
const DEFAULT_GRIP: readonly [number, number, number] = [0.85, 0.55, 0.018];

/** Adhérence d'un sol pour un degré d'humidité 0..1. */
export function surfaceGrip(surface: string, wetness: number): number {
  const g = SURFACE_GRIP[surface] ?? DEFAULT_GRIP;
  const w = wetness < 0 ? 0 : wetness > 1 ? 1 : wetness;
  return g[0] + (g[1] - g[0]) * w;
}

/** Résistance au roulement d'un sol (fraction du poids). */
export function surfaceRolling(surface: string): number {
  return (SURFACE_GRIP[surface] ?? DEFAULT_GRIP)[2];
}
