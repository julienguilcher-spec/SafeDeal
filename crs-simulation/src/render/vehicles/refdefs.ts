/* Définitions de référence des véhicules — données pures.
 *
 * Le rendu n'en dépend pas : il lit toujours Vehicle.def, fourni par la simulation (src/sim/vehicles). Ces
 * définitions servent au banc d'essai et aux tests ; elles reprennent les mêmes cotes, empattements, sièges de
 * l'équipage et tourelles que la simulation (gabarits de la bible de réalisme, tableau C), pour que les modèles
 * soient vérifiés dans la configuration réellement jouée. Contrat VehicleDef : sièges et tourelles en x vers la
 * droite, y = hauteur (assise, tourillon), z vers l'avant ; conduite à gauche (x < 0). */

import type { Faction, SeatDef, SeatRole, TurretDef, VehicleDef, VehicleKind } from '@/core/contracts';

const PI = Math.PI;
const DOOR_GAP = 0.65;

function seat(role: SeatRole, x: number, y: number, z: number, exitX: number, exitZ: number): SeatDef {
  return { role, x, y, z, exitX, exitZ };
}

/** Siège qui sort par la porte latérale située à sa hauteur. */
function side(role: SeatRole, x: number, y: number, z: number, width: number): SeatDef {
  return seat(role, x, y, z, (x < 0 ? -1 : 1) * (width / 2 + DOOR_GAP), z);
}

function carSeats(width: number, y: number, frontZ: number, rearZ: number, rear: 2 | 3 = 2): SeatDef[] {
  const off = width * 0.21;
  const seats = [
    side('driver', -off, y, frontZ, width), side('passenger', off, y, frontZ, width),
    side('passenger', -off, y, rearZ, width), side('passenger', off, y, rearZ, width),
  ];
  // place du milieu de la banquette : elle sort par la portière droite (côté trottoir)
  if (rear === 3) seats.push(seat('passenger', 0, y, rearZ, width / 2 + DOOR_GAP, rearZ - 0.5));
  return seats;
}

function turret(kind: TurretDef['kind'], x: number, y: number, z: number, yawMin: number, yawMax: number, pitchMin: number, pitchMax: number, capacity: number, interval: number): TurretDef {
  return { kind, x, y, z, yawMin, yawMax, pitchMin, pitchMax, capacity, interval };
}

interface Body { l: number; w: number; h: number; mass: number; wb: number; top: number; accel: number; brake: number; steer: number }
interface Flags { siren?: boolean; beacons?: boolean; armored?: boolean; push?: boolean; flying?: boolean }

function def(kind: VehicleKind, name: string, faction: Faction, color: number, b: Body, seats: SeatDef[], turrets: TurretDef[], f: Flags = {}): VehicleDef {
  return {
    kind, name, faction, length: b.l, width: b.w, height: b.h, mass: b.mass, wheelbase: b.wb,
    maxSpeed: b.top / 3.6, maxReverse: Math.min(7, b.top / 3.6 / 4), accel: b.accel, brake: b.brake, maxSteer: b.steer,
    seats, turrets, armored: !!f.armored, canPush: !!f.push, hasSiren: !!f.siren, hasBeacons: f.beacons ?? !!f.siren,
    color, flying: !!f.flying,
  };
}

const BLANC = 0xf4f5f7;

function rearRows(out: SeatDef[], n: number, x: number, y: number, z0: number, pitch: number, exitX: number, exitZ: number): void {
  for (let i = 0; i < n; i++) out.push(seat('passenger', i % 2 === 0 ? -x : x, y, z0 - (i >> 1) * pitch, exitX, exitZ));
}

function build(): VehicleDef[] {
  const out: VehicleDef[] = [];
  { // fourgon de CRS : un groupe de 6, porte latérale coulissante à droite
    const w = 2.05, s = [side('driver', -0.5, 1.05, 1.55, w), side('passenger', 0.5, 1.05, 1.55, w)];
    rearRows(s, 4, 0.5, 1.0, 0.25, 1.0, w / 2 + DOOR_GAP, 0.3);
    out.push(def('fourgon_crs', 'Fourgon de CRS', 'police', BLANC, { l: 5.8, w, h: 2.55, mass: 3500, wb: 3.45, top: 110, accel: 2.2, brake: 7, steer: 0.62 }, s, [], { siren: true }));
  }
  { // car de transport
    const w = 2.55, s = [side('driver', -0.75, 1.45, 5.0, w), seat('passenger', 0.75, 1.45, 5.0, w / 2 + DOOR_GAP, 5.2)];
    rearRows(s, 10, 0.95, 1.5, 3.9, 0.76, w / 2 + DOOR_GAP, 5.2);
    out.push(def('car_crs', 'Car de transport', 'police', BLANC, { l: 12, w, h: 3.3, mass: 18000, wb: 6.1, top: 90, accel: 1.1, brake: 5.5, steer: 0.66 }, s, [], { siren: true }));
  }
  { // véhicule de commandement
    const w = 2.1;
    out.push(def('vl_commandement', 'Véhicule de commandement', 'police', BLANC, { l: 6.5, w, h: 2.8, mass: 3500, wb: 3.7, top: 110, accel: 2.1, brake: 7, steer: 0.6 },
      [side('driver', -0.5, 1.05, 1.9, w), side('passenger', 0.5, 1.05, 1.9, w), seat('passenger', -0.45, 1.0, -0.3, w / 2 + DOOR_GAP, 0.4), seat('passenger', 0.45, 1.0, -1.2, w / 2 + DOOR_GAP, -0.2)],
      [], { siren: true }));
  }
  out.push(def('voiture_police', 'Voiture de police', 'police', 0x8e949a, { l: 4.64, w: 1.84, h: 1.65, mass: 1600, wb: 2.73, top: 150, accel: 3.4, brake: 8.5, steer: 0.58 }, carSeats(1.84, 0.62, 0.35, -0.6), [], { siren: true }));
  // voiture banalisée de la BAC : berline sans inscription, gyrophare aimanté et feux de calandre
  out.push(def('voiture_bac', 'Voiture banalisée (BAC)', 'police', 0x2e3238, { l: 4.7, w: 1.83, h: 1.47, mass: 1450, wb: 2.8, top: 190, accel: 3.4, brake: 8.8, steer: 0.58 }, carSeats(1.83, 0.52, 0.33, -0.62, 3), [], { siren: true, beacons: true }));
  { // fourgon cellulaire : les cellules s'ouvrent par l'arrière
    const w = 2.05, len = 6.0, s = [side('driver', -0.5, 1.05, 1.65, w), side('passenger', 0.5, 1.05, 1.65, w)];
    rearRows(s, 8, 0.5, 1.0, 0.45, 0.8, 0, -(len / 2 + 0.9));
    out.push(def('fourgon_cellulaire', 'Fourgon cellulaire', 'police', BLANC, { l: len, w, h: 2.6, mass: 3500, wb: 3.6, top: 110, accel: 2, brake: 6.8, steer: 0.62 }, s, [], { siren: true }));
  }
  { // Centaure : 3 opérateurs + 7 passagers, tourelleau lance-grenades et caméra sur mât
    const w = 2.94, len = 7.5;
    const s = [side('driver', -0.65, 1.55, 1.9, w), side('passenger', 0.65, 1.55, 1.9, w), seat('gunner', 0, 1.5, 0.6, w / 2 + DOOR_GAP, 0.9)];
    rearRows(s, 7, 0.8, 1.45, -0.6, 0.75, 0, -(len / 2 + 0.9));
    out.push(def('centaure', 'Centaure', 'police', 0x1b2f5e, { l: len, w, h: 3.82, mass: 14500, wb: 4.0, top: 100, accel: 1.5, brake: 5.5, steer: 0.5 }, s,
      [turret('lance_grenades', 0, 3.35, -0.2, -PI, PI, 0.35, 1.4, 30, 0.3), turret('camera', 0.75, 3.82, -1.4, -PI, PI, -0.6, 0.9, 0, 0)],
      { armored: true, push: true, siren: true }));
  }
  { // engin lanceur d'eau : deux canons de toit
    const w = 2.6;
    out.push(def('canon_eau', 'Engin lanceur d\'eau', 'police', BLANC, { l: 9.67, w, h: 3.72, mass: 29000, wb: 5.3, top: 90, accel: 1, brake: 5, steer: 0.52 },
      [side('driver', -0.7, 1.9, 3.7, w), side('gunner', 0.7, 1.9, 3.7, w), seat('gunner', 0, 1.9, 2.9, w / 2 + DOOR_GAP, 3.2)],
      [turret('canon_eau', -0.75, 3.55, 3.0, -2.6, 2.6, -0.3, 0.9, 10000, 0), turret('canon_eau', 0.75, 3.55, 3.0, -2.6, 2.6, -0.3, 0.9, 10000, 0)],
      { siren: true }));
  }
  out.push(def('moto_bravm', 'Moto BRAV-M', 'police', 0x1a1a1a, { l: 2.25, w: 0.98, h: 1.41, mass: 260, wb: 1.54, top: 130, accel: 5.5, brake: 8.5, steer: 0.6 },
    [seat('driver', 0, 0.86, 0.05, -0.95, 0.1), seat('passenger', 0, 0.92, -0.5, -0.95, -0.65)], [], { siren: true }));
  { // fourgon-pompe : lance de toit
    const w = 2.3;
    out.push(def('camion_pompiers', 'Fourgon-pompe', 'rescue', 0xc8102e, { l: 6.5, w, h: 2.9, mass: 14000, wb: 3.9, top: 90, accel: 1.6, brake: 6, steer: 0.6 },
      [side('driver', -0.6, 1.5, 2.2, w), side('gunner', 0.6, 1.5, 2.2, w), side('passenger', -0.75, 1.5, 1.1, w), side('passenger', 0.75, 1.5, 1.1, w)],
      [turret('canon_eau', 0, 2.95, 0.4, -PI, PI, -0.35, 1.0, 3000, 0)], { siren: true }));
  }
  { // ambulance de réanimation
    const w = 2.1, len = 6.0;
    out.push(def('ambulance', 'Ambulance', 'rescue', 0xffffff, { l: len, w, h: 2.8, mass: 3500, wb: 3.6, top: 130, accel: 2.4, brake: 7.2, steer: 0.62 },
      [side('driver', -0.5, 1.05, 1.7, w), side('passenger', 0.5, 1.05, 1.7, w), seat('passenger', 0.6, 0.95, -0.4, w / 2 + DOOR_GAP, 0.3), seat('passenger', -0.3, 0.85, -1.2, 0, -(len / 2 + 0.9))],
      [], { siren: true }));
  }
  out.push(def('voiture', 'Berline', 'civil', 0x4a4f57, { l: 4.5, w: 1.8, h: 1.47, mass: 1300, wb: 2.65, top: 160, accel: 3, brake: 8.5, steer: 0.58 }, carSeats(1.8, 0.52, 0.3, -0.6), []));
  out.push(def('citadine', 'Citadine', 'civil', 0xb8bcc2, { l: 3.9, w: 1.72, h: 1.47, mass: 1050, wb: 2.5, top: 150, accel: 2.8, brake: 8.5, steer: 0.6 }, carSeats(1.72, 0.55, 0.25, -0.55), []));
  out.push(def('suv', 'SUV', 'civil', 0x23272e, { l: 4.6, w: 1.86, h: 1.68, mass: 1650, wb: 2.7, top: 170, accel: 3, brake: 8.2, steer: 0.56 }, carSeats(1.86, 0.68, 0.3, -0.6), []));
  out.push(def('taxi', 'Taxi', 'civil', 0x15171a, { l: 4.7, w: 1.82, h: 1.47, mass: 1500, wb: 2.8, top: 160, accel: 2.9, brake: 8.3, steer: 0.58 }, carSeats(1.82, 0.52, 0.35, -0.65), []));
  {
    const w = 2.0;
    out.push(def('utilitaire', 'Utilitaire', 'civil', 0xe9e7df, { l: 5.0, w, h: 2.2, mass: 2000, wb: 3.1, top: 130, accel: 2.4, brake: 7.5, steer: 0.62 },
      [side('driver', -0.5, 0.95, 1.3, w), side('passenger', 0.5, 0.95, 1.3, w)], []));
  }
  {
    const w = 2.5;
    out.push(def('camion', 'Camion', 'civil', 0x6b6f76, { l: 8.5, w, h: 3.4, mass: 14000, wb: 4.8, top: 90, accel: 1.2, brake: 5.5, steer: 0.6 },
      [side('driver', -0.65, 1.7, 3.3, w), side('passenger', 0.65, 1.7, 3.3, w)], []));
  }
  { // autobus : portes à droite
    const w = 2.55, s = [seat('driver', -0.75, 1.25, 5.0, w / 2 + DOOR_GAP, 5.0)];
    rearRows(s, 8, 0.95, 1.15, 3.2, 1.05, w / 2 + DOOR_GAP, 0.2);
    out.push(def('bus', 'Autobus', 'civil', 0x2f6b52, { l: 12, w, h: 3.0, mass: 12000, wb: 5.9, top: 70, accel: 1.3, brake: 5.5, steer: 0.66 }, s, []));
  }
  out.push(def('scooter', 'Scooter', 'civil', 0x34383f, { l: 1.9, w: 0.7, h: 1.2, mass: 130, wb: 1.3, top: 100, accel: 3.2, brake: 7, steer: 0.65 },
    [seat('driver', 0, 0.78, 0, -0.8, 0), seat('passenger', 0, 0.8, -0.4, -0.8, -0.5)], []));
  {
    const w = 2.3, len = 7.0;
    out.push(def('camion_sono', 'Camion sono', 'protest', 0xf2f2f2, { l: len, w, h: 3.2, mass: 7500, wb: 4.2, top: 90, accel: 1.5, brake: 6, steer: 0.6 },
      [side('driver', -0.6, 1.5, 2.6, w), side('passenger', 0.6, 1.5, 2.6, w), seat('passenger', 0, 1.6, -1.5, 0, -(len / 2 + 0.8))], []));
  }
  out.push(def('velo', 'Vélo', 'civil', 0x1b1c1f, { l: 1.75, w: 0.6, h: 1.1, mass: 16, wb: 1.08, top: 40, accel: 1.4, brake: 4, steer: 0.7 },
    [seat('driver', 0, 0.9, -0.3, -0.7, -0.2)], []));
  out.push(def('drone', 'Drone', 'police', 0x8a8f96, { l: 0.35, w: 0.28, h: 0.11, mass: 0.9, wb: 0.25, top: 54, accel: 6, brake: 6, steer: 0 },
    [], [turret('camera', 0, -0.04, 0.08, -PI, PI, -1.5708, 0.35, 0, 0)], { flying: true, beacons: false }));
  {
    const w = 2.2;
    out.push(def('helicoptere', 'Hélicoptère', 'police', 0x1f3a7a, { l: 10.2, w, h: 3.5, mass: 2900, wb: 3.0, top: 260, accel: 3, brake: 3, steer: 0 },
      [side('driver', 0.45, 1.2, 2.6, w), side('passenger', -0.45, 1.2, 2.6, w), side('gunner', 0.45, 1.2, 1.5, w)],
      [turret('camera', 0, 0.5, 3.4, -PI, PI, -1.5708, 0.2, 0, 0)], { flying: true, beacons: true }));
  }
  return out;
}

/** Définitions de référence, une par VehicleKind du contrat. */
export const REFERENCE_DEFS: readonly VehicleDef[] = build();

export function referenceDef(kind: VehicleKind): VehicleDef | undefined {
  for (const d of REFERENCE_DEFS) if (d.kind === kind) return d;
  return undefined;
}

/** Teintes de carrosserie plausibles pour le trafic civil (noir, gris, blanc et bleu dominent le parc français). */
export const CIVIL_COLORS: readonly number[] = [
  0x1c1d20, 0x2b2e33, 0x4a4f57, 0x6d737b, 0x8a8f96, 0xb4b8be, 0xd9dbde, 0xf0f1f2, 0xe9eaec,
  0x1f2f4a, 0x2c4a73, 0x3f6a9c, 0x6f1d22, 0xa02a2a, 0x7a4a2a, 0x2f4a3a, 0x5a6b4a, 0xc9b98a,
];
