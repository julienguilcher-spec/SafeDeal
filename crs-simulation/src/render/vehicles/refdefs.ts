/* Définitions de référence des véhicules (dimensions de la bible de réalisme, tableau C) — données pures.
 *
 * Le rendu n'en dépend pas : il lit toujours Vehicle.def, fourni par la simulation. Ces définitions servent au
 * banc d'essai, aux tests et de repli documentaire ; elles respectent le contrat VehicleDef (sièges : x vers la
 * droite, y = hauteur de l'assise, z vers l'avant). */

import type { Faction, SeatDef, TurretDef, VehicleDef, VehicleKind } from '@/core/contracts';

interface Spec {
  kind: VehicleKind; name: string; faction: Faction;
  l: number; w: number; h: number; mass: number; wb: number;
  /** km/h */
  vmax: number;
  seats: number;
  color: number;
  seatY: number;
  siren?: boolean; beacons?: boolean; armored?: boolean; push?: boolean; flying?: boolean;
  turrets?: TurretDef[];
  /** Deux-roues : sièges en tandem sur l'axe. */
  tandem?: boolean;
  /** Recul du poste de conduite par rapport au pare-chocs avant (m) ; par défaut selon le gabarit. */
  driverBack?: number;
}

function seatsFor(s: Spec): SeatDef[] {
  const out: SeatDef[] = [];
  const side = s.w / 2 + 0.6;
  if (s.tandem) {
    out.push({ role: 'driver', x: 0, y: s.seatY, z: -0.1, exitX: -side, exitZ: 0 });
    if (s.seats > 1) out.push({ role: 'passenger', x: 0, y: s.seatY + 0.06, z: -0.55, exitX: side, exitZ: -0.4 });
    return out;
  }
  if (s.flying && s.seats === 0) return out;
  const fx = Math.min(0.48, s.w * 0.24);
  // poste de conduite à gauche : derrière le capot pour une voiture (≈ 52 % de la longueur), 1,75 m derrière le
  // pare-chocs pour un fourgon à capot court, 0,95 m pour une cabine avancée
  const back = s.driverBack ?? (s.l < 5.2 ? s.l * 0.52 : 1.75);
  const frontZ = s.l / 2 - back;
  out.push({ role: 'driver', x: -fx, y: s.seatY, z: frontZ, exitX: -side, exitZ: frontZ });
  let placed = 1;
  if (s.seats > 1) {
    const role = s.turrets && s.turrets.length ? 'gunner' as const : 'passenger' as const;
    out.push({ role, x: fx, y: s.seatY, z: frontZ, exitX: side, exitZ: frontZ });
    placed++;
  }
  let row = 1;
  while (placed < s.seats) {
    const z = frontZ - row * 0.95;
    const left = placed % 2 === 1;
    const role = s.turrets && s.turrets.length > 1 && placed === 2 ? 'gunner' as const : 'passenger' as const;
    out.push({ role, x: left ? -fx : fx, y: s.seatY, z: Math.max(-s.l / 2 + 0.6, z), exitX: left ? -side : side, exitZ: Math.max(-s.l / 2 - 0.9, z) });
    placed++;
    if (!left) row++;
  }
  return out;
}

function make(s: Spec): VehicleDef {
  const v = s.vmax / 3.6;
  return {
    kind: s.kind, name: s.name, faction: s.faction,
    length: s.l, width: s.w, height: s.h, mass: s.mass, wheelbase: s.wb,
    maxSpeed: v, maxReverse: Math.min(8, v * 0.3),
    accel: s.mass > 10000 ? 1.2 : s.mass > 3000 ? 2.0 : s.mass < 400 ? 4.5 : 3.0,
    brake: s.mass > 10000 ? 5 : 8,
    maxSteer: s.tandem ? 0.65 : s.l > 9 ? 0.7 : 0.6,
    seats: seatsFor(s), turrets: s.turrets ?? [],
    armored: !!s.armored, canPush: !!s.push, hasSiren: !!s.siren, hasBeacons: !!s.beacons,
    color: s.color, flying: !!s.flying,
  };
}

const SPECS: Spec[] = [
  { kind: 'fourgon_crs', name: 'Fourgon de CRS', faction: 'police', l: 5.8, w: 2.05, h: 2.55, mass: 3500, wb: 3.6, vmax: 110, seats: 6, color: 0xf4f5f7, seatY: 0.98, siren: true, beacons: true },
  { kind: 'car_crs', name: 'Car de transport', faction: 'police', l: 12.0, w: 2.55, h: 3.3, mass: 18000, wb: 6.0, vmax: 90, seats: 12, color: 0xf4f5f7, seatY: 1.5, driverBack: 1.0, siren: true, beacons: true },
  { kind: 'vl_commandement', name: 'Véhicule de commandement', faction: 'police', l: 6.5, w: 2.1, h: 2.8, mass: 3500, wb: 3.9, vmax: 110, seats: 4, color: 0xf4f5f7, seatY: 0.98, siren: true, beacons: true },
  { kind: 'voiture_police', name: 'Voiture de police', faction: 'police', l: 4.64, w: 1.84, h: 1.65, mass: 1600, wb: 2.73, vmax: 150, seats: 4, color: 0x8e949a, seatY: 0.62, siren: true, beacons: true },
  { kind: 'fourgon_cellulaire', name: 'Fourgon cellulaire', faction: 'police', l: 6.0, w: 2.05, h: 2.6, mass: 3500, wb: 3.7, vmax: 110, seats: 10, color: 0xf4f5f7, seatY: 0.98, siren: true, beacons: true },
  {
    kind: 'centaure', name: 'Centaure', faction: 'police', l: 7.5, w: 2.94, h: 3.82, mass: 14500, wb: 3.9, vmax: 100, seats: 10, color: 0x1b2f5e, seatY: 1.95, driverBack: 2.75,
    siren: true, beacons: true, armored: true, push: true,
    turrets: [{ kind: 'lance_grenades', x: 0, y: 3.0, z: -0.3, yawMin: -Math.PI, yawMax: Math.PI, pitchMin: -0.15, pitchMax: 1.0, capacity: 30, interval: 0.3 }],
  },
  {
    kind: 'canon_eau', name: 'Engin lanceur d\'eau', faction: 'police', l: 9.67, w: 2.6, h: 3.72, mass: 29000, wb: 4.6, vmax: 90, seats: 3, color: 0xf4f5f7, seatY: 1.75, driverBack: 1.25,
    siren: true, beacons: true, armored: true, push: true,
    turrets: [
      { kind: 'canon_eau', x: -0.62, y: 3.36, z: 1.9, yawMin: -2.4, yawMax: 2.4, pitchMin: -0.35, pitchMax: 0.9, capacity: 5000, interval: 0.1 },
      { kind: 'canon_eau', x: 0.62, y: 3.36, z: 1.9, yawMin: -2.4, yawMax: 2.4, pitchMin: -0.35, pitchMax: 0.9, capacity: 5000, interval: 0.1 },
    ],
  },
  { kind: 'moto_bravm', name: 'Moto de BRAV-M', faction: 'police', l: 2.25, w: 0.98, h: 1.41, mass: 260, wb: 1.54, vmax: 130, seats: 2, color: 0x1a1a1a, seatY: 0.86, siren: true, beacons: true, tandem: true },
  { kind: 'camion_pompiers', name: 'Fourgon-pompe', faction: 'rescue', l: 6.5, w: 2.3, h: 2.9, mass: 14000, wb: 3.6, vmax: 90, seats: 6, color: 0xc8102e, seatY: 1.55, driverBack: 1.0, siren: true, beacons: true },
  { kind: 'ambulance', name: 'Ambulance de réanimation', faction: 'rescue', l: 6.0, w: 2.1, h: 2.8, mass: 3500, wb: 3.7, vmax: 130, seats: 3, color: 0xffffff, seatY: 0.98, siren: true, beacons: true },
  { kind: 'voiture', name: 'Berline', faction: 'civil', l: 4.3, w: 1.8, h: 1.5, mass: 1300, wb: 2.6, vmax: 130, seats: 5, color: 0x8a8f96, seatY: 0.5 },
  { kind: 'citadine', name: 'Citadine', faction: 'civil', l: 3.7, w: 1.68, h: 1.5, mass: 1000, wb: 2.4, vmax: 130, seats: 4, color: 0xb23a2e, seatY: 0.52 },
  { kind: 'suv', name: 'SUV', faction: 'civil', l: 4.5, w: 1.86, h: 1.68, mass: 1700, wb: 2.7, vmax: 130, seats: 5, color: 0x2f3a44, seatY: 0.66 },
  { kind: 'taxi', name: 'Taxi', faction: 'civil', l: 4.7, w: 1.84, h: 1.48, mass: 1500, wb: 2.8, vmax: 130, seats: 5, color: 0x1c1d20, seatY: 0.5 },
  { kind: 'utilitaire', name: 'Utilitaire', faction: 'civil', l: 5.0, w: 2.0, h: 2.2, mass: 2000, wb: 3.1, vmax: 130, seats: 2, color: 0xe9eaec, seatY: 0.95 },
  { kind: 'camion', name: 'Camion', faction: 'civil', l: 8.0, w: 2.5, h: 3.5, mass: 12000, wb: 4.6, vmax: 90, seats: 2, color: 0x2c5a8c, seatY: 1.6, driverBack: 1.0 },
  { kind: 'bus', name: 'Bus urbain', faction: 'civil', l: 12.0, w: 2.55, h: 3.0, mass: 12000, wb: 6.0, vmax: 70, seats: 9, color: 0x3fa78a, seatY: 1.2, driverBack: 1.0 },
  { kind: 'scooter', name: 'Scooter', faction: 'civil', l: 1.9, w: 0.7, h: 1.2, mass: 130, wb: 1.35, vmax: 90, seats: 1, color: 0x30343a, seatY: 0.76, tandem: true },
  { kind: 'camion_sono', name: 'Camion sono', faction: 'protest', l: 7.0, w: 2.3, h: 3.2, mass: 7500, wb: 3.9, vmax: 60, seats: 2, color: 0xeceef0, seatY: 1.5, driverBack: 1.0 },
  { kind: 'drone', name: 'Drone', faction: 'police', l: 0.35, w: 0.28, h: 0.11, mass: 0.9, wb: 0.2, vmax: 54, seats: 0, color: 0x8a8f96, seatY: 0, flying: true },
  { kind: 'helicoptere', name: 'Hélicoptère', faction: 'police', l: 10.2, w: 2.3, h: 3.5, mass: 2900, wb: 2.5, vmax: 260, seats: 3, color: 0x1f3a7a, seatY: 1.1, flying: true, beacons: true },
];

/** Définitions de référence, une par VehicleKind du contrat. */
export const REFERENCE_DEFS: readonly VehicleDef[] = SPECS.map(make);

export function referenceDef(kind: VehicleKind): VehicleDef | undefined {
  for (const d of REFERENCE_DEFS) if (d.kind === kind) return d;
  return undefined;
}

/** Teintes de carrosserie plausibles pour le trafic civil (noir, gris, blanc et bleu dominent le parc français). */
export const CIVIL_COLORS: readonly number[] = [
  0x1c1d20, 0x2b2e33, 0x4a4f57, 0x6d737b, 0x8a8f96, 0xb4b8be, 0xd9dbde, 0xf0f1f2, 0xe9eaec,
  0x1f2f4a, 0x2c4a73, 0x3f6a9c, 0x6f1d22, 0xa02a2a, 0x7a4a2a, 0x2f4a3a, 0x5a6b4a, 0xc9b98a,
];
