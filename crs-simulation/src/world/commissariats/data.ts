/* =====================================================================================
 * COMMISSARIATS — données des sites de police réels du cœur de Paris (pur : aucun three.js, aucun service).
 *
 * Sept sites : la préfecture de police (caserne de la Cité), la caserne des Célestins (point de regroupement des
 * renforts de gendarmerie mobile) et les commissariats centraux des 1er, 3e, 7e, 8e et 9e arrondissements.
 *
 * Chaque site habille le VRAI bâtiment de la carte (aucune géométrie ajoutée) et dispose d'emplacements réservés
 * (« la cour », en pratique parisienne : stationnement réservé le long du trottoir de la rue du commissariat, ou de
 * la rue large la plus proche quand la sienne est trop étroite pour y laisser des fourgons). Les véhicules y sont
 * garés nez vers la sortie, une file par unité, dans l'ordre de départ.
 *
 * Les emplacements sont des données FIGÉES : layoutYard() (layout.ts) les calcule une fois sur la vraie carte, on
 * colle le résultat arrondi ci-dessous (CRS_COMMISSARIATS_PRINT=1 npx vitest run
 * tests/unit/commissariats.sites.paris.test.ts --silent=false), et validateSite() les revérifie à chaque passage des
 * essais. En jeu, seule l'occupation des places est contrôlée (places de réserve en repli).
 *
 * Coordonnées du jeu : origine à l'obélisque de la Concorde, x vers l'est, z vers le sud ; cap = atan2(dx, dz).
 * Nom de code : « commissariat » partout (jamais « station », le métro, ni « poste », les postes du dispositif).
 * ===================================================================================== */

import type { VehicleKind } from '@/core/contracts';

/** Nature du site. */
export type CommissariatKind = 'prefecture' | 'commissariat_central' | 'commissariat' | 'caserne_gendarmerie';

/** Enseigne posée sur la façade (« none » : la préfecture, dont le monument porte déjà la sienne). */
export type CommissariatSign = 'commissariat' | 'hotel_police' | 'gendarmerie' | 'none';

/** Nature d'une unité en réserve. 'hors_dispositif' : véhicule garé que l'on ne peut pas engager (car, PC mobile). */
export type StockKind =
  | 'police_secours' | 'bac' | 'section_crs' | 'peloton_gm' | 'bravm' | 'canon_eau' | 'centaure' | 'cellulaire'
  | 'hors_dispositif';

/** Une place réservée le long du trottoir. */
export interface YardSlot {
  /** Centre de la place (m). */
  readonly x: number;
  readonly z: number;
  /** Cap du véhicule garé : celui de la circulation de son côté (nez vers la sortie). */
  readonly heading: number;
  /** Longueur de la place (m) : au moins VEHICLE_LEN du véhicule qui l'occupe. */
  readonly len: number;
  /** Largeur de la place (m) : au moins la largeur du véhicule (marquage au sol). */
  readonly width: number;
  /** File à laquelle appartient la place (indice de l'unité dans le stock ; les places de réserve en dernier). */
  readonly file: number;
  /** Place de réserve (unité adoptée, place d'origine occupée). */
  readonly spare: boolean;
}

/** Une unité en réserve dans un site. */
export interface StockTemplate {
  /** Identifiant stable (« 9e:faucon9 »). */
  readonly id: string;
  readonly kind: StockKind;
  /** Indicatif radio. */
  readonly callsign: string;
  /** Description en français (« Police secours · voiture sérigraphiée »). */
  readonly label: string;
  /** Genre de véhicule ('voiture_bac' : retombe sur 'voiture_police' quand la définition manque). */
  readonly vehicle: VehicleKind;
  /** Nombre de véhicules. */
  readonly vehicles: number;
  /** Effectif embarqué (affichage). */
  readonly crew: number;
  /** false : véhicule garé hors dispositif (car, PC mobile) — pris par un joueur seulement. */
  readonly engageable: boolean;
  /** Indices dans CommissariatDef.slots, tête de file d'abord (la place la plus proche de la sortie). */
  readonly slots: readonly number[];
}

/** Point orienté. */
export interface Pose {
  readonly x: number;
  readonly z: number;
  readonly heading: number;
}

/** Un site complet (données figées). */
export interface CommissariatDef {
  readonly id: string;
  /** Nom complet (« Commissariat du 9e — rue Chauchat »). */
  readonly name: string;
  /** Nom court (« 9e ») pour la carte. */
  readonly short: string;
  readonly kind: CommissariatKind;
  /** Adresse réelle. */
  readonly address: string;
  readonly sign: CommissariatSign;
  /** Arrondissement (0 : sans objet). */
  readonly arrondissement: number;
  /** Porte d'entrée, sur le trottoir, à 0,8 m de la façade. */
  readonly door: { readonly x: number; readonly z: number };
  /** Point de façade touché, cap = direction vers laquelle la façade regarde (vers la rue). */
  readonly facade: Pose;
  /** Sortie : point de la chaussée 25 m en aval de la tête de la première file, cap de la circulation. */
  readonly exit: Pose;
  /** Rue du commissariat. */
  readonly street: string;
  /** Rue des places réservées si elle diffère de `street` (sinon null). */
  readonly bayStreet: string | null;
  readonly slots: readonly YardSlot[];
  /** Unités, dans l'ordre de départ. */
  readonly stock: readonly StockTemplate[];
}

/** Teinte de la voiture banalisée de la BAC (gris anthracite). */
export const BAC_COLOR = 0x2e3238;

/** Longueur de place par genre de véhicule (m) : longueur du véhicule arrondie au-dessus. */
export const VEHICLE_LEN: Readonly<Record<string, number>> = {
  voiture_police: 4.7,
  voiture_bac: 4.7,
  fourgon_crs: 5.9,
  fourgon_cellulaire: 6.0,
  vl_commandement: 6.6,
  canon_eau: 10.5,
  centaure: 8.0,
  car_crs: 12.2,
  moto_bravm: 2.3,
};

/** Largeur de véhicule par genre (m), pour le placement contre le trottoir et le marquage au sol. */
export const VEHICLE_WIDTH: Readonly<Record<string, number>> = {
  voiture_police: 1.84,
  voiture_bac: 1.84,
  fourgon_crs: 2.05,
  fourgon_cellulaire: 2.05,
  vl_commandement: 2.1,
  canon_eau: 2.6,
  centaure: 2.94,
  car_crs: 2.55,
  moto_bravm: 0.98,
};

/** Place de réserve : celle d'un fourgon (unité adoptée, place d'origine occupée). */
export const SPARE_LEN = 6.0;
export const SPARE_WIDTH = 2.1;

/** Longueur de place d'un genre de véhicule (repli : place de réserve). */
export function vehicleLen(kind: VehicleKind): number {
  return VEHICLE_LEN[kind] ?? SPARE_LEN;
}

/** Largeur d'un genre de véhicule (repli : place de réserve). */
export function vehicleWidth(kind: VehicleKind): number {
  return VEHICLE_WIDTH[kind] ?? SPARE_WIDTH;
}

/** Indicatifs des unités en réserve : « TV 75-19 », « BAC 75-09 », « CELLULAIRE 75-04 », « AQUILON 1 »… */
export const STOCK_CALLSIGN_PATTERN = /^[A-ZÀ-Ý]+(?: [A-ZÀ-Ý]+)* (?:75-\d{2}|\d{1,2})$/;

// ───────────────────────────── graines (adresses, stock) ─────────────────────────────

/** Unité avant placement (les places viennent de la disposition figée). */
export type StockSeed = Omit<StockTemplate, 'slots'>;

/** Graine d'un site : identité, point d'adresse et stock. La disposition est calculée par layoutYard(). */
export interface CommissariatSeed {
  readonly id: string;
  readonly name: string;
  readonly short: string;
  readonly kind: CommissariatKind;
  readonly address: string;
  readonly sign: CommissariatSign;
  readonly arrondissement: number;
  /** Point d'adresse projeté (dans ou contre le bâtiment). */
  readonly x: number;
  readonly z: number;
  /** La porte donne sur une voie piétonne (la rue du commissariat est cherchée parmi les rues piétonnes nommées). */
  readonly pedestrianStreet?: boolean;
  /**
   * Écart supplémentaire des places au bord de la voie du commissariat (m) : le trottoir réel déborde la largeur de
   * voie de la carte (boulevard du Palais : 2 m ; sinon les véhicules garés mordaient sur le trottoir et son mobilier).
   */
  readonly curbShift?: number;
  readonly stock: readonly StockSeed[];
}

function tv(site: string, n: string): StockSeed {
  return {
    id: `${site}:tv${n}`, kind: 'police_secours', callsign: `TV 75-${n}`, label: 'Police secours · voiture sérigraphiée',
    vehicle: 'voiture_police', vehicles: 1, crew: 3, engageable: true,
  };
}

function bac(site: string, n: string): StockSeed {
  return {
    id: `${site}:bac${n}`, kind: 'bac', callsign: `BAC 75-${n}`, label: 'Brigade anticriminalité · voiture banalisée',
    vehicle: 'voiture_bac', vehicles: 1, crew: 3, engageable: true,
  };
}

function cellulaire(site: string, n: string): StockSeed {
  return {
    id: `${site}:cellulaire${n}`, kind: 'cellulaire', callsign: `CELLULAIRE 75-${n}`,
    label: 'Fourgon cellulaire · transfert des interpellés', vehicle: 'fourgon_cellulaire', vehicles: 1, crew: 2,
    engageable: true,
  };
}

/** Les sept sites, dans l'ordre de la liste (préfecture d'abord). */
export const COMMISSARIAT_SEEDS: readonly CommissariatSeed[] = [
  {
    id: 'cite', name: 'Préfecture de police — caserne de la Cité', short: 'Préfecture', kind: 'prefecture',
    address: '9, boulevard du Palais', sign: 'none', arrondissement: 4, x: 1781, z: 1215, curbShift: 2,
    stock: [
      {
        id: 'cite:aquilon1', kind: 'section_crs', callsign: 'AQUILON 1', label: 'Section CRS de réserve · 3 fourgons',
        vehicle: 'fourgon_crs', vehicles: 3, crew: 19, engageable: true,
      },
      {
        id: 'cite:neptune11', kind: 'canon_eau', callsign: 'NEPTUNE 11', label: 'Engin lanceur d’eau',
        vehicle: 'canon_eau', vehicles: 1, crew: 3, engageable: true,
      },
      {
        id: 'cite:neptune12', kind: 'canon_eau', callsign: 'NEPTUNE 12', label: 'Engin lanceur d’eau',
        vehicle: 'canon_eau', vehicles: 1, crew: 3, engageable: true,
      },
      cellulaire('cite', '04'),
      {
        id: 'cite:car1', kind: 'hors_dispositif', callsign: 'CAR CRS 1', label: 'Car de transport CRS · hors dispositif',
        vehicle: 'car_crs', vehicles: 1, crew: 0, engageable: false,
      },
      {
        id: 'cite:pc1', kind: 'hors_dispositif', callsign: 'PC MOBILE 1',
        label: 'Véhicule de commandement (PC mobile de la DOPC) · hors dispositif', vehicle: 'vl_commandement',
        vehicles: 1, crew: 0, engageable: false,
      },
    ],
  },
  {
    id: 'celestins', name: 'Caserne des Célestins — renforts de gendarmerie mobile', short: 'Célestins',
    kind: 'caserne_gendarmerie', address: '18, boulevard Henri-IV', sign: 'gendarmerie', arrondissement: 4,
    x: 3150, z: 1540,
    stock: [
      {
        id: 'celestins:epervier9', kind: 'peloton_gm', callsign: 'ÉPERVIER 9',
        label: 'Peloton de gendarmerie mobile prépositionné · 2 fourgons', vehicle: 'fourgon_crs', vehicles: 2, crew: 18,
        engageable: true,
      },
      {
        id: 'celestins:centaure11', kind: 'centaure', callsign: 'CENTAURE 11', label: 'Blindé Centaure prépositionné',
        vehicle: 'centaure', vehicles: 1, crew: 3, engageable: true,
      },
      {
        id: 'celestins:centaure12', kind: 'centaure', callsign: 'CENTAURE 12', label: 'Blindé Centaure prépositionné',
        vehicle: 'centaure', vehicles: 1, crew: 3, engageable: true,
      },
    ],
  },
  {
    id: '1er', name: 'Commissariat du 1er — place du Marché-Saint-Honoré', short: '1er', kind: 'commissariat_central',
    address: '45, place du Marché-Saint-Honoré', sign: 'commissariat', arrondissement: 1, x: 781, z: -222,
    stock: [tv('1er', '11'), tv('1er', '21'), bac('1er', '01'), cellulaire('1er', '01')],
  },
  {
    id: '3e', name: 'Commissariat du 3e — rue aux Ours', short: '3e', kind: 'commissariat_central',
    address: '5 bis, rue aux Ours', sign: 'commissariat', arrondissement: 3, x: 2250, z: 285,
    stock: [tv('3e', '13'), bac('3e', '03'), cellulaire('3e', '03')],
  },
  {
    id: '7e', name: 'Commissariat du 7e — rue Fabert', short: '7e', kind: 'commissariat_central',
    address: '9, rue Fabert', sign: 'commissariat', arrondissement: 7, x: -745, z: 735,
    stock: [tv('7e', '17'), bac('7e', '07')],
  },
  {
    id: '8e', name: 'Commissariat du 8e — avenue du Général-Eisenhower', short: '8e', kind: 'commissariat_central',
    address: '1, avenue du Général-Eisenhower (Grand Palais)', sign: 'commissariat', arrondissement: 8, x: -630, z: -168,
    pedestrianStreet: true,
    stock: [tv('8e', '18'), tv('8e', '28'), bac('8e', '08')],
  },
  {
    id: '9e', name: 'Commissariat du 9e — rue Chauchat', short: '9e', kind: 'commissariat_central',
    address: '14 bis, rue Chauchat', sign: 'commissariat', arrondissement: 9, x: 1352, z: -850,
    stock: [
      {
        id: '9e:faucon9', kind: 'bravm', callsign: 'FAUCON 9', label: 'BRAV-M · 6 motos, 12 policiers',
        vehicle: 'moto_bravm', vehicles: 6, crew: 12, engageable: true,
      },
      tv('9e', '19'),
      bac('9e', '09'),
    ],
  },
];

// ───────────────────────────── disposition figée ─────────────────────────────

/**
 * Disposition calculée par layoutYard() (layout.ts) sur la vraie carte, arrondie (0,1 m ; 0,001 rad).
 * slots : [x, z, cap, longueur, largeur, file, réserve (1/0)] ; files : indices de places par unité, tête d'abord.
 */
export interface FrozenLayout {
  readonly street: string;
  readonly bayStreet: string | null;
  readonly door: readonly [number, number];
  readonly facade: readonly [number, number, number];
  readonly exit: readonly [number, number, number];
  readonly slots: readonly (readonly [number, number, number, number, number, number, number])[];
  readonly files: readonly (readonly number[])[];
}

/* Collé depuis CRS_COMMISSARIATS_PRINT=1 (voir l'en-tête). Ne pas retoucher à la main : régénérer. */
export const FROZEN_LAYOUTS: Readonly<Record<string, FrozenLayout>> = {
  cite: {
    street: 'Boulevard du Palais', bayStreet: null,
    door: [1781.5, 1215.4], facade: [1782.2, 1215.8, -2.168],
    exit: [1809.7, 1143.3, 2.692],
    // (curbShift 2 m : sur le boulevard du Palais, le trottoir réel déborde de 2 m la largeur de voie de la carte ; au
    // bord calculé, les fourgons étaient à moitié sur le trottoir, dans les candélabres et la fontaine Wallace)
    slots: [
      [1799.8, 1170.3, 2.542, 5.9, 2.05, 0, 0],
      [1795.8, 1176.1, 2.542, 5.9, 2.05, 0, 0],
      [1791.8, 1182, 2.542, 5.9, 2.05, 0, 0],
      [1786.3, 1189.6, 2.542, 10.5, 2.6, 1, 0],
      [1779.7, 1199.3, 2.542, 10.5, 2.6, 2, 0],
      [1774.5, 1207.2, 2.542, 6, 2.05, 3, 0],
      [1768.5, 1215.6, 2.542, 12.2, 2.55, 4, 0],
      [1762.7, 1224.5, 2.542, 6.6, 2.1, 5, 0],
      [1758.5, 1230.6, 2.542, 6, 2.1, 6, 1],
      [1754.4, 1236.6, 2.542, 6, 2.1, 6, 1],
      [1750.4, 1242.5, 2.542, 6, 2.1, 6, 1],
    ],
    files: [[0, 1, 2], [3], [4], [5], [6], [7]],
  },
  celestins: {
    street: 'Boulevard Henri IV', bayStreet: null,
    door: [3148.9, 1537.6], facade: [3148.6, 1536.9, 0.433],
    exit: [3199.3, 1530.6, 2.001],
    slots: [
      [3172, 1538, 2.001, 5.9, 2.05, 0, 0],
      [3165.5, 1541, 2.001, 5.9, 2.05, 0, 0],
      [3158.3, 1544.8, 2.001, 8, 2.94, 1, 0],
      [3149.9, 1548.6, 2.001, 8, 2.94, 2, 0],
      [3142.3, 1551.7, 2.001, 6, 2.1, 3, 1],
      [3135.7, 1554.7, 2.001, 6, 2.1, 3, 1],
    ],
    files: [[0, 1], [2], [3]],
  },
  '1er': {
    street: 'Place du Marché Saint-Honoré', bayStreet: "Rue des Petits Champs et Avenue de l'Opéra",
    door: [779.4, -217.3], facade: [779.6, -218.1, -0.315],
    exit: [910.9, -208.9, -1.914],
    slots: [
      [933.8, -197.7, -1.915, 4.7, 1.84, 0, 0],
      [935.7, -203, -1.915, 4.7, 1.84, 1, 0],
      [932.2, -160.3, -2.861, 4.7, 1.84, 2, 0],
      [933.9, -153.9, -2.861, 6, 2.05, 3, 0],
      [919.2, -148.4, 0.28, 6, 2.1, 4, 1],
      [917.2, -155.4, 0.28, 6, 2.1, 4, 1],
    ],
    files: [[0], [1], [2], [3]],
  },
  '3e': {
    street: 'Rue aux Ours', bayStreet: 'Boulevard de Sébastopol',
    door: [2233, 281.2], facade: [2232.7, 281.9, 2.728],
    exit: [2147.3, 336.6, 2.785],
    slots: [
      [2141, 363.4, 2.782, 4.7, 1.84, 0, 0],
      [2138.9, 369, 2.782, 4.7, 1.84, 1, 0],
      [2136.5, 375.1, 2.782, 6, 2.05, 2, 0],
      [2133.9, 381.8, 2.782, 6, 2.1, 3, 1],
      [2131.4, 388.5, 2.782, 6, 2.1, 3, 1],
    ],
    files: [[0], [1], [2]],
  },
  '7e': {
    street: 'Rue Fabert', bayStreet: 'Rond-Point du Bleuet de France',
    door: [-738.5, 735.4], facade: [-739.3, 735.3, 1.493],
    exit: [-579.9, 805.1, 1.491],
    slots: [
      [-606.8, 798, 1.491, 4.7, 1.84, 0, 0],
      [-612.7, 797.6, 1.492, 4.7, 1.84, 1, 0],
      [-619.2, 797.2, 1.492, 6, 2.1, 2, 1],
      [-626.4, 796.6, 1.492, 6, 2.1, 2, 1],
    ],
    files: [[0], [1]],
  },
  '8e': {
    street: 'Avenue du Général-Eisenhower', bayStreet: 'Avenue des Champs-Élysées',
    door: [-630.9, -178.2], facade: [-631, -177.4, 3.067],
    exit: [-414, -173.7, 1.112],
    slots: [
      [-440, -182.7, 1.112, 4.7, 1.84, 0, 0],
      [-445.3, -185.3, 1.112, 4.7, 1.84, 1, 0],
      [-450.6, -188, 1.112, 4.7, 1.84, 2, 0],
      [-456.4, -191, 1.112, 6, 2.1, 3, 1],
      [-462.8, -194.1, 1.123, 6, 2.1, 3, 1],
    ],
    files: [[0], [1], [2]],
  },
  '9e': {
    street: 'Rue Chauchat', bayStreet: 'Boulevard Haussmann',
    door: [1346.7, -834.1], facade: [1347.5, -834.2, -1.491],
    exit: [1263.2, -732.6, -1.774],
    slots: [
      [1289.7, -731.8, -1.774, 2.3, 0.98, 0, 0],
      [1292.5, -731.3, -1.774, 2.3, 0.98, 0, 0],
      [1295.2, -730.7, -1.774, 2.3, 0.98, 0, 0],
      [1297.9, -730.2, -1.774, 2.3, 0.98, 0, 0],
      [1300.7, -729.6, -1.774, 2.3, 0.98, 0, 0],
      [1303.4, -729, -1.774, 2.3, 0.98, 0, 0],
      [1300.5, -720.7, -1.774, 4.7, 1.84, 1, 0],
      [1294.6, -721.9, -1.774, 4.7, 1.84, 2, 0],
      [1281.1, -724.8, -1.774, 6, 2.1, 3, 1],
      [1288.1, -723.3, -1.774, 6, 2.1, 3, 1],
      [1284.4, -732.4, -1.774, 6, 2.1, 3, 1],
    ],
    files: [[0, 1, 2, 3, 4, 5], [6], [7]],
  },
};

/** Assemble un site à partir de sa graine et de sa disposition. */
export function assembleCommissariat(seed: CommissariatSeed, l: FrozenLayout): CommissariatDef {
  return {
    id: seed.id, name: seed.name, short: seed.short, kind: seed.kind, address: seed.address, sign: seed.sign,
    arrondissement: seed.arrondissement,
    door: { x: l.door[0], z: l.door[1] },
    facade: { x: l.facade[0], z: l.facade[1], heading: l.facade[2] },
    exit: { x: l.exit[0], z: l.exit[1], heading: l.exit[2] },
    street: l.street,
    bayStreet: l.bayStreet,
    slots: l.slots.map((s) => ({ x: s[0], z: s[1], heading: s[2], len: s[3], width: s[4], file: s[5], spare: s[6] === 1 })),
    stock: seed.stock.map((t, i) => ({ ...t, slots: l.files[i] ?? [] })),
  };
}

/** Les sept sites (ordre de COMMISSARIAT_SEEDS). */
export const COMMISSARIATS: readonly CommissariatDef[] = COMMISSARIAT_SEEDS
  .filter((s) => FROZEN_LAYOUTS[s.id] !== undefined)
  .map((s) => assembleCommissariat(s, FROZEN_LAYOUTS[s.id]!));

const BY_ID = new Map<string, CommissariatDef>(COMMISSARIATS.map((c) => [c.id, c]));

/** Site par identifiant (undefined si inconnu). */
export function commissariatById(id: string): CommissariatDef | undefined {
  return BY_ID.get(id);
}

/** Site dont la porte est la plus proche de (x, z), parmi ceux qu'accepte `accept` (null s'il n'y en a aucun). */
export function nearestCommissariat(x: number, z: number, accept?: (c: CommissariatDef) => boolean): CommissariatDef | null {
  let best: CommissariatDef | null = null;
  let bestD = Infinity;
  for (const c of COMMISSARIATS) {
    if (accept && !accept(c)) continue;
    const d = Math.hypot(c.door.x - x, c.door.z - z);
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}

/** Une place réservée, avec son site (pour la circulation : pas de voiture civile garée dedans). */
export interface ReservedBay {
  readonly commissariatId: string;
  readonly x: number;
  readonly z: number;
  readonly heading: number;
  readonly len: number;
  readonly width: number;
}

let reserved: readonly ReservedBay[] | null = null;

/** Toutes les places réservées de tous les sites (réserve comprise). Tableau partagé : ne pas modifier. */
export function reservedBays(): readonly ReservedBay[] {
  if (reserved === null) {
    const out: ReservedBay[] = [];
    for (const c of COMMISSARIATS) {
      for (const s of c.slots) out.push({ commissariatId: c.id, x: s.x, z: s.z, heading: s.heading, len: s.len, width: s.width });
    }
    reserved = out;
  }
  return reserved;
}

/**
 * Centre de la file d'une unité (milieu entre la première et la dernière place), cap de la file. Sans place (unité
 * adoptée), la file de réserve du site ; sans réserve, la porte.
 */
export function fileCentre(def: CommissariatDef, template: Pick<StockTemplate, 'slots'> | null): Pose {
  let idx: readonly number[] = template ? template.slots : [];
  if (idx.length === 0) {
    const spare: number[] = [];
    for (let i = 0; i < def.slots.length; i++) if (def.slots[i]!.spare) spare.push(i);
    idx = spare;
  }
  if (idx.length === 0) return { x: def.door.x, z: def.door.z, heading: def.exit.heading };
  const a = def.slots[idx[0]!]!;
  const b = def.slots[idx[idx.length - 1]!]!;
  return { x: (a.x + b.x) * 0.5, z: (a.z + b.z) * 0.5, heading: a.heading };
}
