/* =====================================================================================
 * CIRCULATION — réglages et constantes.
 * Sources : docs/research/00-bible-realisme.md (tableau C : gabarits et 30 km/h, limite générale à
 * Paris ; §I.3 « couper la circulation » : 4 barrières par tranche de 10 m, mise en place en 30 à 60 s),
 * 02-materiel-tenues-vehicules.md (barrière Vauban, sirènes : les prioritaires passent), 03 (badauds,
 * touristes et commerçants : regardent, filment, tardent à partir, fuient le gaz par les rues latérales).
 * Les densités et les durées de feux sont des valeurs de jeu (estimées).
 * ===================================================================================== */

import type { RoadClass, VehicleKind, WeatherKind } from '@/core/contracts';
import type { TrafficTuning } from './api';

export function defaultTuning(): TrafficTuning {
  return {
    ambient: true,
    vehicleDensity: 1,
    parkedDensity: 1,
    pedestrianDensity: 1,
    vehicleBase: 26,
    parkedBase: 60,
    pedestrianBase: 46,
    vehicleMax: 120,
    parkedMax: 140,
    pedestrianMax: 220,
    spawnMin: 150,
    spawnMax: 260,
    despawn: 330,
    parkedRadius: 190,
    pedSpawnMin: 35,
    pedSpawnMax: 120,
    pedDespawn: 165,
    signals: true,
    greenMain: 26,
    greenCross: 18,
    amber: 3,
    allRed: 2,
    barrierDelay: 5,
    barrierTime: 30,
    patience: 18,
    parkShare: 0.18,
    panic: true,
    incidents: true,
    radio: true,
  };
}

export function resetTuning(t: TrafficTuning): void {
  Object.assign(t, defaultTuning());
}

/** Limite générale à Paris (m/s). */
export const CITY_SPEED = 30 / 3.6;
/** Décélération de confort du pilote automatique hors urgence (m/s²) : fixe la distance de décision. */
export const AP_DECEL = 1.8;
/** Décélération d'un freinage appuyé (m/s²) : en deçà de cette distance, on passe à l'orange. */
export const HARD_DECEL = 3.2;
/** Le pilote automatique repère une fermeture à moins de cette distance de son itinéraire (m). */
export const CLOSURE_REACH = 6;
/** Recul de la ligne d'arrêt par rapport au bord de la chaussée croisée (m) : laisse le passage piéton libre. */
export const STOP_SETBACK = 4.5;
/** Un feu posé sur l'approche (nœud de degré 2) commande le carrefour situé à moins de cette distance (m). */
export const SIGNAL_REACH = 45;
/** Deux carrefours reliés par moins de cette longueur de chaussée forment un seul ensemble de feux (m). */
export const CLUSTER_REACH = 30;
/** Période de réflexion d'un automobiliste et d'un piéton (s). */
export const CAR_THINK = 0.25;
export const PED_THINK = 0.28;
/** Largeur d'une barrière Vauban telle que le décor la pose (m). */
export const BARRIER_LENGTH = 2.5;
/** Couloir laissé à un véhicule prioritaire dans un barrage ouvert (m) : 3,5 m requis pour un engin-pompe. */
export const GATE_WIDTH = 5;

/** Chaussée minimale pour stationner sans gêner un engin large roulant au pilote automatique (m). */
export const PARK_MIN_ONEWAY = 7.6;
export const PARK_MIN_TWOWAY = 16;
/** Longueur d'une place en file (m) et marge aux carrefours et passages piétons (m). */
export const PARK_SLOT = 5.6;
export const PARK_CLEAR_JUNCTION = 9;
export const PARK_CLEAR_CROSSING = 5;

/** Trafic selon l'heure (0..24) : creux la nuit, pointes du matin et de la fin d'après-midi. */
export function hourFactor(h: number): number {
  const hour = ((h % 24) + 24) % 24;
  // points de contrôle (heure, facteur), interpolés
  const pts = HOUR_CURVE;
  for (let i = 0; i + 3 < pts.length; i += 2) {
    const h2 = pts[i + 2]!;
    if (hour <= h2) {
      const h1 = pts[i]!;
      const t = h2 > h1 ? (hour - h1) / (h2 - h1) : 0;
      return pts[i + 1]! + (pts[i + 3]! - pts[i + 1]!) * t;
    }
  }
  return pts[pts.length - 1]!;
}
const HOUR_CURVE: readonly number[] = [
  0, 0.22, 3, 0.1, 5, 0.12, 7, 0.6, 8.5, 1.0, 10, 0.8, 12.5, 0.9, 14, 0.82, 17, 1.0, 19, 1.05, 21, 0.6, 23, 0.35, 24, 0.22,
];

/** Affluence piétonne selon l'heure : midi et fin d'après-midi, presque personne en pleine nuit. */
export function pedHourFactor(h: number): number {
  const hour = ((h % 24) + 24) % 24;
  if (hour < 5) return 0.08;
  if (hour < 8) return 0.08 + (hour - 5) * 0.14;
  if (hour < 12) return 0.5 + (hour - 8) * 0.1;
  if (hour < 14.5) return 1.0;
  if (hour < 16) return 0.85;
  if (hour < 19.5) return 1.05;
  if (hour < 23) return 1.05 - (hour - 19.5) * 0.2;
  return 0.3 - (hour - 23) * 0.2;
}

/** La pluie vide les trottoirs et réduit un peu la circulation. */
export function weatherPedFactor(w: WeatherKind): number {
  switch (w) {
    case 'pluie': return 0.55;
    case 'averse': return 0.3;
    case 'orage': return 0.2;
    case 'brouillard': return 0.8;
    case 'couvert': return 0.92;
    default: return 1;
  }
}
export function weatherCarFactor(w: WeatherKind): number {
  return w === 'averse' || w === 'orage' ? 0.85 : 1;
}

/** Poids d'un type de voie dans le tirage des apparitions (les grands axes portent l'essentiel du trafic). */
export function classWeight(c: RoadClass): number {
  switch (c) {
    case 'motorway': return 3.5;
    case 'primary': return 3.2;
    case 'secondary': return 2.4;
    case 'tertiary': return 1.6;
    case 'residential': return 0.8;
    case 'service': return 0.12;
    default: return 0;
  }
}

/** Composition du trafic (poids). Autobus : seulement sur les axes d'au moins 9 m de chaussée. */
export const TRAFFIC_MIX: readonly { kind: VehicleKind; weight: number; minWidth: number }[] = [
  { kind: 'voiture', weight: 30, minWidth: 0 },
  { kind: 'citadine', weight: 26, minWidth: 0 },
  { kind: 'suv', weight: 12, minWidth: 0 },
  { kind: 'taxi', weight: 10, minWidth: 0 },
  { kind: 'utilitaire', weight: 11, minWidth: 0 },
  { kind: 'scooter', weight: 8, minWidth: 0 },
  { kind: 'bus', weight: 4, minWidth: 9 },
];
export const PARKED_MIX: readonly { kind: VehicleKind; weight: number }[] = [
  { kind: 'voiture', weight: 34 },
  { kind: 'citadine', weight: 36 },
  { kind: 'suv', weight: 14 },
  { kind: 'utilitaire', weight: 10 },
  { kind: 'taxi', weight: 2 },
  { kind: 'scooter', weight: 4 },
];

/** Teintes de carrosserie courantes (noms de modèles fictifs : seule la couleur varie). */
export const CAR_COLORS: readonly number[] = [
  0x4a4f57, 0xb8bcc2, 0x23272e, 0xe9e7df, 0x6b6f76, 0x7d1f24, 0x1f3a5c, 0x2f4f3a, 0x8a8f96, 0xd9d4c7, 0x15171a, 0x5b6470,
  0x9a4a2f, 0x3d5a80, 0xc2c5c9, 0x30343b,
];
