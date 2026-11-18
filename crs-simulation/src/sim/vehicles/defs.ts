/* =====================================================================================
 * Définitions des véhicules (VehicleDef) pour TOUS les VehicleKind du contrat.
 *
 * Sources : docs/research/00-bible-realisme.md (tableau C) et 02-materiel-tenues-vehicules.md §4-5.
 * Gabarits et masses repris tels quels ; empattements, accélérations, freinage et braquage sont des
 * valeurs d'ordre de grandeur pour chaque catégorie (aucun constructeur réel : noms génériques).
 *
 * Repère des sièges et tourelles (contrat) : x = vers la DROITE, y = haut, z = vers l'avant, origine
 * au centre de l'emprise, au sol. Conduite à gauche du véhicule (France) : conducteur en x < 0.
 * SeatDef.y = hauteur de l'assise. Point de sortie : à côté de la porte utilisée.
 * ===================================================================================== */

import type { Faction, SeatDef, SeatRole, TurretDef, VehicleDef, VehicleKind } from '@/core/contracts';

const KMH = 1 / 3.6;
/** Distance entre la carrosserie et le point où l'on pose le pied en sortant (m). */
const DOOR_GAP = 0.65;

function seat(role: SeatRole, x: number, y: number, z: number, exitX: number, exitZ: number): SeatDef {
  return { role, x, y, z, exitX, exitZ };
}

/** Siège qui sort par la porte latérale située à sa hauteur. */
function sideSeat(role: SeatRole, x: number, y: number, z: number, width: number): SeatDef {
  const side = x < 0 ? -1 : 1;
  return seat(role, x, y, z, side * (width * 0.5 + DOOR_GAP), z);
}

/** Habitacle de voiture : deux places avant, banquette arrière de deux ou trois places. */
function carSeats(width: number, y: number, frontZ: number, rearZ: number, rear: 2 | 3): SeatDef[] {
  const off = width * 0.21;
  const seats = [
    sideSeat('driver', -off, y, frontZ, width),
    sideSeat('passenger', off, y, frontZ, width),
    sideSeat('passenger', -off, y, rearZ, width),
    sideSeat('passenger', off, y, rearZ, width),
  ];
  // la place du milieu sort par la portière droite (côté trottoir)
  if (rear === 3) seats.push(seat('passenger', 0, y, rearZ, width * 0.5 + DOOR_GAP, rearZ - 0.5));
  return seats;
}

/** Rangées de sièges d'un autocar ou d'un autobus : deux places de chaque côté du couloir. */
function busRows(
  out: SeatDef[], width: number, y: number, zFirst: number, rows: number, pitch: number, doors: readonly number[],
): void {
  const xs = [-0.95, -0.5, 0.5, 0.95];
  const exitX = width * 0.5 + DOOR_GAP;
  for (let r = 0; r < rows; r++) {
    const z = zFirst - r * pitch;
    // porte la plus proche (toutes à droite, côté trottoir)
    let door = doors[0]!;
    for (let d = 1; d < doors.length; d++) if (Math.abs(doors[d]! - z) < Math.abs(door - z)) door = doors[d]!;
    for (let c = 0; c < xs.length; c++) out.push(seat('passenger', xs[c]!, y, z, exitX, door + (c - 1.5) * 0.25));
  }
}

function turret(
  kind: TurretDef['kind'], x: number, y: number, z: number,
  yawMin: number, yawMax: number, pitchMin: number, pitchMax: number, capacity: number, interval: number,
): TurretDef {
  return { kind, x, y, z, yawMin, yawMax, pitchMin, pitchMax, capacity, interval };
}

interface Body {
  length: number; width: number; height: number; mass: number; wheelbase: number;
  /** km/h */
  top: number; reverse: number;
  accel: number; brake: number; steer: number;
}

function def(
  kind: VehicleKind, name: string, faction: Faction, color: number, b: Body, seats: SeatDef[], turrets: TurretDef[],
  flags: { armored?: boolean; canPush?: boolean; siren?: boolean; beacons?: boolean; flying?: boolean } = {},
): VehicleDef {
  return {
    kind, name, faction,
    length: b.length, width: b.width, height: b.height, mass: b.mass, wheelbase: b.wheelbase,
    maxSpeed: b.top * KMH, maxReverse: b.reverse * KMH, accel: b.accel, brake: b.brake, maxSteer: b.steer,
    seats, turrets,
    armored: flags.armored ?? false,
    canPush: flags.canPush ?? false,
    hasSiren: flags.siren ?? false,
    hasBeacons: flags.beacons ?? flags.siren ?? false,
    color,
    flying: flags.flying ?? false,
  };
}

const BLANC_POLICE = 0xf4f5f7;
const PI = Math.PI;

// ───────────────────────────── police et gendarmerie ─────────────────────────────

/** Fourgon de CRS : un groupe de 6 (vérifié), 5,8 × 2,05 × 2,55 m, 3,5 t, 110 km/h. */
function fourgonCrs(): VehicleDef {
  const w = 2.05;
  const rearExit = w * 0.5 + DOOR_GAP; // porte latérale coulissante, à droite
  return def('fourgon_crs', 'Fourgon de CRS', 'police', BLANC_POLICE,
    { length: 5.8, width: w, height: 2.55, mass: 3500, wheelbase: 3.45, top: 110, reverse: 20, accel: 2.2, brake: 7.0, steer: 0.62 },
    [
      // fourgon de 9 places (type Renault Master des CRS) : un groupe de sept tient dans son fourgon
      sideSeat('driver', -0.55, 1.05, 1.55, w),
      sideSeat('passenger', 0.6, 1.05, 1.55, w),
      seat('passenger', 0.05, 1.05, 1.55, rearExit, 1.0),
      seat('passenger', -0.5, 1.0, 0.25, rearExit, 0.55),
      seat('passenger', 0.5, 1.0, 0.25, rearExit, 0.1),
      seat('passenger', -0.5, 1.0, -0.75, rearExit, -0.35),
      seat('passenger', 0.5, 1.0, -0.75, rearExit, -0.8),
      seat('passenger', -0.5, 1.0, -1.75, rearExit, -1.3),
      seat('passenger', 0.5, 1.0, -1.75, rearExit, -1.75),
    ], [], { siren: true });
}

/** Car de transport : 1 + 49 places (estimé), 12 × 2,55 × 3,30 m, 18 t, 90 km/h. */
function carCrs(): VehicleDef {
  const w = 2.55;
  const seats: SeatDef[] = [
    sideSeat('driver', -0.75, 1.45, 5.0, w),
    seat('passenger', 0.75, 1.45, 5.0, w * 0.5 + DOOR_GAP, 5.2),
  ];
  busRows(seats, w, 1.5, 3.9, 12, 0.76, [5.2, -0.6]); // 12 rangées de 4 = 48 places
  return def('car_crs', 'Car de transport', 'police', BLANC_POLICE,
    { length: 12, width: w, height: 3.3, mass: 18000, wheelbase: 6.1, top: 90, reverse: 12, accel: 1.1, brake: 5.5, steer: 0.66 },
    seats, [], { siren: true });
}

/** Véhicule de commandement : fourgon surélevé hérissé d'antennes, 4 places. */
function vlCommandement(): VehicleDef {
  const w = 2.1;
  return def('vl_commandement', 'Véhicule de commandement', 'police', BLANC_POLICE,
    { length: 6.5, width: w, height: 2.8, mass: 3500, wheelbase: 3.7, top: 110, reverse: 20, accel: 2.1, brake: 7.0, steer: 0.6 },
    [
      sideSeat('driver', -0.5, 1.05, 1.9, w),
      sideSeat('passenger', 0.5, 1.05, 1.9, w),
      seat('passenger', -0.45, 1.0, -0.3, w * 0.5 + DOOR_GAP, 0.4),
      seat('passenger', 0.45, 1.0, -1.2, w * 0.5 + DOOR_GAP, -0.2),
    ], [], { siren: true });
}

/** Voiture sérigraphiée : 4,64 × 1,84 × 1,65 m, 1,6 t, 150 km/h, 4 places. */
function voiturePolice(): VehicleDef {
  return def('voiture_police', 'Voiture de police', 'police', 0x8e949a,
    { length: 4.64, width: 1.84, height: 1.65, mass: 1600, wheelbase: 2.73, top: 150, reverse: 25, accel: 3.4, brake: 8.5, steer: 0.58 },
    carSeats(1.84, 0.62, 0.35, -0.6, 2), [], { siren: true });
}

/**
 * Voiture banalisée de la BAC : grande berline sans aucune inscription, gris foncé, 4,70 × 1,83 × 1,47 m, 1,45 t,
 * 5 places (l'équipage de trois et deux places pour un interpellé et son escorte). Deux-tons et feux bleus discrets :
 * gyrophare aimanté posé sur le toit côté conducteur et feux à éclats dans la calandre (rendu : src/render/vehicles).
 */
function voitureBac(): VehicleDef {
  return def('voiture_bac', 'Voiture banalisée (BAC)', 'police', 0x2e3238,
    { length: 4.7, width: 1.83, height: 1.47, mass: 1450, wheelbase: 2.8, top: 190, reverse: 25, accel: 3.4, brake: 8.8, steer: 0.58 },
    carSeats(1.83, 0.52, 0.33, -0.62, 3), [], { siren: true, beacons: true });
}

/** Fourgon cellulaire : 2 agents + 8 retenus (estimé) ; les cellules s'ouvrent par l'arrière. */
function fourgonCellulaire(): VehicleDef {
  const w = 2.05;
  const len = 6.0;
  const seats: SeatDef[] = [sideSeat('driver', -0.5, 1.05, 1.65, w), sideSeat('passenger', 0.5, 1.05, 1.65, w)];
  for (let i = 0; i < 8; i++) {
    const row = i >> 1;
    const x = i % 2 === 0 ? -0.5 : 0.5;
    seats.push(seat('passenger', x, 1.0, 0.45 - row * 0.8, x * 0.8, -(len * 0.5 + 0.8 + (row % 2) * 0.5)));
  }
  return def('fourgon_cellulaire', 'Fourgon cellulaire', 'police', BLANC_POLICE,
    { length: len, width: w, height: 2.6, mass: 3500, wheelbase: 3.6, top: 110, reverse: 20, accel: 2.0, brake: 6.8, steer: 0.62 },
    seats, [], { siren: true });
}

/**
 * Centaure, blindé 4 × 4 de la gendarmerie : 7,5 × 2,94 × 3,82 m, 14,5 t, 300 ch, 100 km/h (vérifié).
 * 3 opérateurs (pilote, chef d'engin, opérateur radio-tireur) + 7 passagers qui sortent par l'arrière.
 * Lame avant ; tourelleau lance-grenades téléopéré de 30 tubes (« de 1 à 30 tirs en série », 0,3 s
 * entre deux coups, estimé) ; caméra jour / nuit sur mât.
 */
function centaure(): VehicleDef {
  const w = 2.94;
  const len = 7.5;
  const seats: SeatDef[] = [
    sideSeat('driver', -0.65, 1.55, 1.9, w),
    sideSeat('passenger', 0.65, 1.55, 1.9, w), // chef d'engin (caméra du mât)
    seat('gunner', 0, 1.5, 0.6, w * 0.5 + DOOR_GAP, 0.9), // opérateur radio-tireur
  ];
  for (let i = 0; i < 7; i++) {
    const row = i >> 1;
    const x = i === 6 ? 0 : i % 2 === 0 ? -0.8 : 0.8;
    seats.push(seat('passenger', x, 1.45, -0.6 - row * 0.75, x * 0.7, -(len * 0.5 + 0.8 + (row % 2) * 0.55)));
  }
  return def('centaure', 'Centaure', 'police', 0x1b2f5e,
    { length: len, width: w, height: 3.82, mass: 14500, wheelbase: 4.0, top: 100, reverse: 15, accel: 1.5, brake: 5.5, steer: 0.5 },
    seats,
    [
      // tir en cloche uniquement : site de 20° à 80°
      turret('lance_grenades', 0, 3.35, -0.2, -PI, PI, 0.35, 1.4, 30, 0.3),
      turret('camera', 0.75, 3.82, -1.4, -PI, PI, -0.6, 0.9, 0, 0),
    ],
    { armored: true, canPush: true, siren: true });
}

/**
 * Engin lanceur d'eau : 9,67 × 2,60 × 3,72 m, 29 t, 3 personnes, deux canons de toit orientables
 * depuis la cabine, cuve de 10 000 l (bible J.1), 15 l/s, portée 60 m (40 utile).
 */
function canonEau(): VehicleDef {
  const w = 2.6;
  return def('canon_eau', "Engin lanceur d'eau", 'police', BLANC_POLICE,
    { length: 9.67, width: w, height: 3.72, mass: 29000, wheelbase: 5.3, top: 90, reverse: 10, accel: 1.4, brake: 5.0, steer: 0.52 },
    [
      sideSeat('driver', -0.7, 1.9, 3.7, w),
      sideSeat('gunner', 0.7, 1.9, 3.7, w), // opérateur : canon gauche
      seat('gunner', 0, 1.9, 2.9, w * 0.5 + DOOR_GAP, 3.2), // chef d'engin : canon droit
    ],
    [
      turret('canon_eau', -0.75, 3.55, 3.0, -2.6, 2.6, -0.3, 0.9, 10000, 0),
      turret('canon_eau', 0.75, 3.55, 3.0, -2.6, 2.6, -0.3, 0.9, 10000, 0),
    ],
    { siren: true });
}

/** Moto de BRAV-M : trail routier, empattement 1,54 m (vérifié), 260 kg, pilote + opérateur passager. */
function motoBravm(): VehicleDef {
  return def('moto_bravm', 'Moto BRAV-M', 'police', 0x1a1a1a,
    { length: 2.25, width: 0.98, height: 1.41, mass: 260, wheelbase: 1.54, top: 130, reverse: 3, accel: 5.5, brake: 8.5, steer: 0.6 },
    [
      seat('driver', 0, 0.86, 0.05, -0.95, 0.1),
      seat('passenger', 0, 0.92, -0.5, -0.95, -0.65),
    ], [], { siren: true });
}

// ───────────────────────────── secours ─────────────────────────────

/** Engin-pompe des sapeurs-pompiers : 6,5 × 2,30 × 2,90 m, 14 t, 6 sapeurs, lance de 25 m à 8 l/s (estimé). */
function camionPompiers(): VehicleDef {
  const w = 2.3;
  return def('camion_pompiers', 'Fourgon-pompe', 'rescue', 0xc8102e,
    { length: 6.5, width: w, height: 2.9, mass: 14000, wheelbase: 3.9, top: 90, reverse: 15, accel: 1.6, brake: 6.0, steer: 0.6 },
    [
      sideSeat('driver', -0.6, 1.5, 2.2, w),
      sideSeat('gunner', 0.6, 1.5, 2.2, w), // chef d'agrès : lance de toit
      sideSeat('passenger', -0.75, 1.5, 1.1, w),
      seat('passenger', -0.25, 1.5, 1.1, -(w * 0.5 + DOOR_GAP), 0.6),
      seat('passenger', 0.25, 1.5, 1.1, w * 0.5 + DOOR_GAP, 0.6),
      sideSeat('passenger', 0.75, 1.5, 1.1, w),
    ],
    [turret('canon_eau', 0, 2.95, 0.4, -PI, PI, -0.35, 1.0, 3000, 0)],
    { siren: true });
}

/** Ambulance de réanimation : 6,0 × 2,10 × 2,80 m, équipage de 3 (vérifié) + un patient sur le brancard. */
function ambulance(): VehicleDef {
  const w = 2.1;
  const len = 6.0;
  return def('ambulance', 'Ambulance', 'rescue', 0xffffff,
    { length: len, width: w, height: 2.8, mass: 3500, wheelbase: 3.6, top: 130, reverse: 20, accel: 2.4, brake: 7.2, steer: 0.62 },
    [
      sideSeat('driver', -0.5, 1.05, 1.7, w),
      sideSeat('passenger', 0.5, 1.05, 1.7, w),
      seat('passenger', 0.6, 0.95, -0.4, w * 0.5 + DOOR_GAP, 0.3), // soignant, porte latérale
      seat('passenger', -0.3, 0.85, -1.2, 0, -(len * 0.5 + 0.9)), // brancard, portes arrière
    ], [], { siren: true });
}

// ───────────────────────────── civils ─────────────────────────────

function voiture(): VehicleDef {
  return def('voiture', 'Berline', 'civil', 0x4a4f57,
    { length: 4.5, width: 1.8, height: 1.47, mass: 1300, wheelbase: 2.65, top: 160, reverse: 25, accel: 3.0, brake: 8.5, steer: 0.58 },
    carSeats(1.8, 0.52, 0.3, -0.6, 3), []);
}

function citadine(): VehicleDef {
  return def('citadine', 'Citadine', 'civil', 0xb8bcc2,
    { length: 3.9, width: 1.72, height: 1.47, mass: 1050, wheelbase: 2.5, top: 150, reverse: 25, accel: 2.8, brake: 8.5, steer: 0.6 },
    carSeats(1.72, 0.55, 0.25, -0.55, 2), []);
}

function suv(): VehicleDef {
  return def('suv', 'SUV', 'civil', 0x23272e,
    { length: 4.6, width: 1.86, height: 1.68, mass: 1650, wheelbase: 2.7, top: 170, reverse: 25, accel: 3.0, brake: 8.2, steer: 0.56 },
    carSeats(1.86, 0.68, 0.3, -0.6, 3), []);
}

function taxi(): VehicleDef {
  return def('taxi', 'Taxi', 'civil', 0x15171a,
    { length: 4.7, width: 1.82, height: 1.47, mass: 1500, wheelbase: 2.8, top: 160, reverse: 25, accel: 2.9, brake: 8.3, steer: 0.58 },
    carSeats(1.82, 0.52, 0.35, -0.65, 3), []);
}

/** Fourgonnette de livraison : 5,0 × 2,0 × 2,2 m, 2 t, banquette de trois. */
function utilitaire(): VehicleDef {
  const w = 2.0;
  return def('utilitaire', 'Utilitaire', 'civil', 0xe9e7df,
    { length: 5.0, width: w, height: 2.2, mass: 2000, wheelbase: 3.1, top: 130, reverse: 20, accel: 2.4, brake: 7.5, steer: 0.62 },
    [
      sideSeat('driver', -0.5, 0.95, 1.3, w),
      sideSeat('passenger', 0.5, 0.95, 1.3, w),
      seat('passenger', 0, 0.95, 1.3, w * 0.5 + DOOR_GAP, 0.9),
    ], []);
}

/** Camion porteur de livraison : 8,5 × 2,5 × 3,4 m, 14 t en charge, bridé à 90 km/h. */
function camion(): VehicleDef {
  const w = 2.5;
  return def('camion', 'Camion', 'civil', 0x6b6f76,
    { length: 8.5, width: w, height: 3.4, mass: 14000, wheelbase: 4.8, top: 90, reverse: 12, accel: 1.2, brake: 5.5, steer: 0.6 },
    [sideSeat('driver', -0.65, 1.7, 3.3, w), sideSeat('passenger', 0.65, 1.7, 3.3, w)], []);
}

/** Autobus urbain : 12 × 2,55 × 3,0 m, 12 t, conducteur + 28 places assises (les voyageurs debout ne sont pas modélisés). */
function bus(): VehicleDef {
  const w = 2.55;
  const seats: SeatDef[] = [seat('driver', -0.75, 1.25, 5.0, w * 0.5 + DOOR_GAP, 5.0)];
  busRows(seats, w, 1.15, 3.2, 7, 1.05, [5.0, 0.2, -3.6]);
  return def('bus', 'Autobus', 'civil', 0x2f6b52,
    { length: 12, width: w, height: 3.0, mass: 12000, wheelbase: 5.9, top: 70, reverse: 10, accel: 1.3, brake: 5.5, steer: 0.66 },
    seats, []);
}

function scooter(): VehicleDef {
  return def('scooter', 'Scooter', 'civil', 0x34383f,
    { length: 1.9, width: 0.7, height: 1.2, mass: 130, wheelbase: 1.3, top: 100, reverse: 2, accel: 3.2, brake: 7.0, steer: 0.65 },
    [seat('driver', 0, 0.78, 0, -0.8, 0), seat('passenger', 0, 0.8, -0.4, -0.8, -0.5)], []);
}

/**
 * Vélo de ville : 1,75 × 0,6 × 1,1 m (guidon), 16 kg, empattement 1,08 m. Le cycliste fournit 150 à 250 W :
 * 15 à 22 km/h en ville, 40 km/h au plus. Freins à patins : 4 m/s² (sol sec).
 */
function velo(): VehicleDef {
  return def('velo', 'Vélo', 'civil', 0x1b1c1f,
    { length: 1.75, width: 0.6, height: 1.1, mass: 16, wheelbase: 1.08, top: 40, reverse: 2, accel: 1.4, brake: 4.0, steer: 0.7 },
    [seat('driver', 0, 0.9, -0.3, -0.7, -0.2)], []);
}

/** Camion sono du cortège : 7,0 × 2,3 × 3,2 m, 7,5 t, conducteur + animateur sur le plateau. */
function camionSono(): VehicleDef {
  const w = 2.3;
  const len = 7.0;
  return def('camion_sono', 'Camion sono', 'protest', 0xf2f2f2,
    { length: len, width: w, height: 3.2, mass: 7500, wheelbase: 4.2, top: 90, reverse: 12, accel: 1.5, brake: 6.0, steer: 0.6 },
    [
      sideSeat('driver', -0.6, 1.5, 2.6, w),
      sideSeat('passenger', 0.6, 1.5, 2.6, w),
      seat('passenger', 0, 1.6, -1.5, 0, -(len * 0.5 + 0.8)), // animateur, debout sur le plateau
    ], []);
}

// ───────────────────────────── engins volants ─────────────────────────────

/** Petit quadricoptère pliable : 0,35 × 0,28 × 0,11 m, 0,9 kg, 15 m/s, caméra stabilisée (estimé). */
function drone(): VehicleDef {
  return def('drone', 'Drone', 'police', 0x8a8f96,
    { length: 0.35, width: 0.28, height: 0.11, mass: 0.9, wheelbase: 0.25, top: 54, reverse: 54, accel: 6, brake: 6, steer: 0 },
    [], [turret('camera', 0, -0.04, 0.08, -PI, PI, -1.5708, 0.35, 0, 0)], { flying: true });
}

/** Hélicoptère biturbine léger de la gendarmerie : rotor de 10,2 m, 2,9 t, 260 km/h, équipage de 3. */
function helicoptere(): VehicleDef {
  const w = 2.2;
  return def('helicoptere', 'Hélicoptère', 'police', 0x1f3a7a,
    { length: 10.2, width: w, height: 3.5, mass: 2900, wheelbase: 3.0, top: 260, reverse: 40, accel: 3, brake: 3, steer: 0 },
    [
      sideSeat('driver', 0.45, 1.2, 2.6, w), // commandant de bord à droite, comme sur tout hélicoptère
      sideSeat('passenger', -0.45, 1.2, 2.6, w),
      sideSeat('gunner', 0.45, 1.2, 1.5, w), // opérateur de la caméra
    ],
    [turret('camera', 0, 0.5, 3.4, -PI, PI, -1.5708, 0.2, 0, 0)], { flying: true, beacons: true });
}

/** Toutes les définitions, dans l'ordre de VEHICLE_KINDS. */
export function createVehicleDefs(): VehicleDef[] {
  return [
    fourgonCrs(), carCrs(), vlCommandement(), voiturePolice(), voitureBac(), fourgonCellulaire(), centaure(), canonEau(), motoBravm(),
    camionPompiers(), ambulance(), voiture(), citadine(), suv(), taxi(), utilitaire(), camion(), bus(), scooter(),
    camionSono(), drone(), helicoptere(), velo(),
  ];
}

/**
 * Les 23 types de véhicules (pour les tests et les boucles) : les 22 du contrat, plus la voiture banalisée de la BAC
 * ('voiture_bac' : VehicleKind est un type ouvert, le contrat n'a pas à la nommer).
 */
export const VEHICLE_KINDS: readonly VehicleKind[] = [
  'fourgon_crs', 'car_crs', 'vl_commandement', 'voiture_police', 'voiture_bac', 'fourgon_cellulaire', 'centaure', 'canon_eau',
  'moto_bravm', 'camion_pompiers', 'ambulance', 'voiture', 'citadine', 'suv', 'taxi', 'utilitaire', 'camion', 'bus',
  'scooter', 'camion_sono', 'drone', 'helicoptere', 'velo',
];
