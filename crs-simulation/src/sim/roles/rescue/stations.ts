/* =====================================================================================
 * SECOURS — centres de secours de la Brigade de sapeurs-pompiers de Paris et bases SMUR de l'AP-HP.
 *
 * Sert à nommer l'engin du joueur comme à la radio (« FOURGON SÉVIGNÉ », « SMUR NECKER ») et à le renvoyer à
 * sa remise quand il est disponible. Adresses réelles ; positions (latitude, longitude) relevées à l'adresse, puis
 * projetées sur la carte du jeu par une transformation affine ajustée sur les bases de la journée de service
 * (journee-data.ts : caserne de la Cité et commissariats d'arrondissement) — précision de l'ordre de 50 à 100 m,
 * suffisante pour choisir le centre le plus proche ; le point d'arrivée est recalé sur la voie la plus proche.
 * ===================================================================================== */

import type { RescueKind } from '@/core/extensions';

export interface RescueStation {
  /** Nom d'usage du centre (« Sévigné ») ou de l'hôpital (« Necker »). */
  readonly name: string;
  /** Adresse, pour la radio et la carte « Ma mission ». */
  readonly address: string;
  readonly x: number;
  readonly z: number;
}

/** Projection approchée (latitude, longitude) → coordonnées du jeu (m ; x vers l'est, z vers le sud). */
const LON0 = 2.3213;
const LAT0 = 48.8658;
const M_PER_LON = 70900;
const M_PER_LAT = 113000;

function at(name: string, address: string, lat: number, lon: number): RescueStation {
  return { name, address, x: Math.round((lon - LON0) * M_PER_LON), z: Math.round((LAT0 - lat) * M_PER_LAT) };
}

/** Centres de secours de la BSPP (Paris intra-muros). */
export const FIRE_STATIONS: readonly RescueStation[] = [
  at('Sévigné', '7 rue de Sévigné', 48.8556, 2.3631),
  at('Rousseau', '21 rue Jean-Jacques-Rousseau', 48.8628, 2.3418),
  at('Colombier', '11 rue du Vieux-Colombier', 48.8514, 2.3311),
  at('Poissy', '7 rue de Poissy', 48.8497, 2.3520),
  at('Port-Royal', '55 boulevard de Port-Royal', 48.8372, 2.3460),
  at('Masséna', '37 boulevard Masséna', 48.8222, 2.3687),
  at('Chaligny', '26 rue de Chaligny', 48.8471, 2.3854),
  at('Malar', '15 rue Malar', 48.8603, 2.3049),
  at('Grenelle', '8 rue Mademoiselle', 48.8449, 2.2972),
  at('Champerret', '6 rue Jean-Oestreicher', 48.8869, 2.2931),
  at('Blanche', '28 rue Blanche', 48.8799, 2.3326),
  at('Montmartre', '12 rue Carpeaux', 48.8902, 2.3318),
  at('Château-Landon', '66 rue du Château-Landon', 48.8839, 2.3625),
  at('Ménilmontant', '48 rue de Ménilmontant', 48.8691, 2.3852),
  at('La Villette', '211 avenue Jean-Jaurès', 48.8890, 2.3880),
];

/** Hôpitaux de l'AP-HP sièges d'un SMUR (unités mobiles hospitalières régulées par le SAMU de Paris). */
export const SMUR_BASES: readonly RescueStation[] = [
  at('Necker', '149 rue de Sèvres', 48.8457, 2.3155),
  at('Lariboisière', '2 rue Ambroise-Paré', 48.8826, 2.3529),
  at('Pitié-Salpêtrière', '47 boulevard de l’Hôpital', 48.8384, 2.3643),
  at('Pompidou', '20 rue Leblanc', 48.8390, 2.2733),
  at('Bichat', '46 rue Henri-Huchard', 48.8988, 2.3324),
  at('Saint-Antoine', '184 rue du Faubourg-Saint-Antoine', 48.8495, 2.3837),
];

/** Centre (ou base SMUR) le plus proche d'un point. */
export function nearestStation(kind: RescueKind, x: number, z: number): RescueStation {
  const list = kind === 'pompiers' ? FIRE_STATIONS : SMUR_BASES;
  let best = list[0];
  let bestD = Infinity;
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    const d = Math.hypot(s.x - x, s.z - z);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best;
}

/** Indicatif radio de l'engin : « FOURGON SÉVIGNÉ » (fourgon-pompe du centre), « SMUR NECKER » (UMH de l'hôpital). */
export function stationCallsign(kind: RescueKind, station: RescueStation): string {
  return `${kind === 'pompiers' ? 'FOURGON' : 'SMUR'} ${station.name.toUpperCase()}`;
}

/** Indicatif de la salle qui engage l'engin : la BSPP (« PARIS ») ou la régulation du SAMU de Paris (« SAMU 75 »). */
export function dispatcherCallsign(kind: RescueKind): string {
  return kind === 'pompiers' ? 'PARIS' : 'SAMU 75';
}
