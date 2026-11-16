/* =====================================================================================
 * DÉCOR DYNAMIQUE — caractères des commerces par catégorie et enseignes FICTIVES.
 *
 * Attrait (docs/research/00-bible-realisme.md F.5) : luxe, bijouterie, téléphonie et banque en tête ;
 * tabac, habillement, alimentation ensuite ; cafés, hôtels et pharmacies en queue.
 * Sang-froid du commerçant : tension locale à partir de laquelle il baisse son rideau (les enseignes
 * exposées ferment tôt, le café du coin reste ouvert longtemps).
 * Les noms sont composés d'un mot générique et d'un complément inventé : aucune marque réelle.
 * ===================================================================================== */

import type { Rng, ShopCategory } from '@/core/contracts';

export interface ShopDef {
  /** Attrait pour les pilleurs et les casseurs 0..1. */
  appeal: number;
  /** Marchandise au départ 0..1 et nombre de charges de butin qu'elle représente. */
  stock: number;
  loads: number;
  /** Résistance du vitrage (30 = verre courant : trois coups de marteau ; 60 = feuilleté). */
  glassHp: number;
  reinforced: boolean;
  /** Résistance du rideau de fer. */
  shutterHp: number;
  /** Proportion de boutiques qui ont un rideau. */
  shutterShare: number;
  /** Tension locale qui décide le commerçant à fermer. */
  nerve: number;
  /** Heures d'ouverture [début, fin[ (fin > 24 = après minuit). */
  opens: number;
  closes: number;
  /** Combustible (s de feu) par mètre de vitrine et fumée produite. */
  fuelPerMeter: number;
  /** Probabilité de panneaux de bois posés avant une manifestation annoncée tendue. */
  boardShare: number;
}

function sd(
  appeal: number, stock: number, loads: number, glassHp: number, shutterHp: number, shutterShare: number,
  nerve: number, opens: number, closes: number, fuelPerMeter: number, boardShare: number,
): ShopDef {
  return {
    appeal, stock, loads, glassHp, reinforced: glassHp >= 50, shutterHp, shutterShare, nerve, opens, closes,
    fuelPerMeter, boardShare,
  };
}

const DEFS: Record<string, ShopDef> = {
  //                   attrait stock charges verre rideau part  nerf  ouv. ferm. feu/m planches
  luxe: sd(0.95, 1.0, 40, 60, 600, 1.0, 0.22, 10, 19.5, 90, 0.5),
  bijouterie: sd(0.92, 1.0, 24, 70, 700, 1.0, 0.2, 10, 19, 60, 0.45),
  telephonie: sd(0.88, 1.0, 30, 30, 420, 1.0, 0.28, 9.5, 19.5, 80, 0.2),
  banque: sd(0.8, 0.25, 6, 70, 700, 0.9, 0.2, 9, 17.5, 70, 0.6),
  tabac_presse: sd(0.62, 0.9, 30, 30, 400, 0.95, 0.4, 7, 20, 100, 0.05),
  mode: sd(0.6, 1.0, 50, 30, 420, 0.95, 0.3, 10, 19.5, 120, 0.15),
  supermarche: sd(0.5, 1.0, 80, 30, 450, 0.95, 0.35, 8.5, 21, 110, 0.1),
  alimentation: sd(0.4, 0.9, 40, 30, 380, 0.9, 0.42, 8, 21.5, 90, 0.02),
  restauration_rapide: sd(0.38, 0.6, 16, 30, 400, 0.9, 0.36, 10.5, 23.5, 90, 0.1),
  agence: sd(0.36, 0.3, 8, 30, 400, 0.85, 0.3, 9, 18.5, 80, 0.2),
  pharmacie: sd(0.2, 0.8, 20, 30, 420, 0.95, 0.45, 8.5, 20, 80, 0.02),
  hotel: sd(0.2, 0.3, 8, 40, 400, 0.1, 0.5, 0, 24, 100, 0.02),
  cafe_restaurant: sd(0.15, 0.5, 14, 30, 380, 0.8, 0.5, 7, 25, 100, 0.02),
  autre: sd(0.3, 0.6, 16, 30, 400, 0.85, 0.38, 9.5, 19, 90, 0.05),
};

export function shopDef(category: ShopCategory): ShopDef {
  return DEFS[category] ?? DEFS.autre!;
}

/** La boutique est-elle ouverte à cette heure (0..24) ? */
export function shopOpenAt(def: ShopDef, hour: number): boolean {
  if (def.closes > 24) return hour >= def.opens || hour < def.closes - 24;
  return hour >= def.opens && hour < def.closes;
}

// ───────────────────────────── enseignes fictives ─────────────────────────────

/** Compléments de lieu : ne désignent aucune enseigne existante. */
const PLACES: readonly string[] = [
  'du Parvis', 'des Arcades', 'des Quais', 'du Méridien', 'des Deux Rives', "de l'Écluse", "de l'Horloge",
  'des Tilleuls', 'du Belvédère', 'de la Passerelle', 'des Tanneurs', 'du Vieux Pont', 'des Marronniers',
  'de la Rotonde', 'du Cadran', 'des Verriers', 'de la Halle', 'du Petit Square', 'du Clos',
  'de la Fontaine', 'du Passage', 'des Lavandières', 'de la Butte', 'du Gué',
];

/** Patronymes inventés pour les maisons de luxe et les joailliers. */
const HOUSES: readonly string[] = [
  'Valcourt', 'Belrive', 'Montclar', 'Sérignac', 'Hautefort', 'Lorvent', 'Vauclair', 'Aubervert', 'Castelmont',
  'Vermeilhac', 'Sainte-Aure', 'Sombreval', 'Armanville', 'Brévannes', 'Clairmarais', 'Ormeval',
];

const FIRST_NAMES: readonly string[] = [
  'Léonie', 'Solène', 'Capucine', 'Apolline', 'Maëlle', 'Garance', 'Ombeline', 'Clémence', 'Honorine', 'Sixtine',
  'Anatole', 'Basile', 'Célestin', 'Gaspard', 'Lubin', 'Octave',
];

const COLORS: readonly string[] = ['Bleu', 'Vert', 'Rouge', 'Doré', 'Gris', 'Blanc', 'Noir', 'Ambré'];

type Pattern = (rng: Rng) => string;

function place(rng: Rng): string {
  return rng.pick(PLACES);
}

const PATTERNS: Record<string, readonly Pattern[]> = {
  banque: [
    (r) => `Banque ${place(r)}`,
    (r) => `Crédit ${place(r)}`,
    (r) => `Comptoir Financier ${place(r)}`,
    (r) => `Caisse Lutétienne ${place(r)}`,
  ],
  luxe: [
    (r) => `Maison ${r.pick(HOUSES)}`,
    (r) => `${r.pick(HOUSES)} Paris`,
    (r) => `Atelier ${r.pick(HOUSES)}`,
    (r) => `${r.pick(HOUSES)} & Fils, maroquinier`,
  ],
  bijouterie: [
    (r) => `Joaillerie ${r.pick(HOUSES)}`,
    (r) => `Bijouterie ${place(r)}`,
    (r) => `Horlogerie ${r.pick(HOUSES)}`,
    (r) => `L'Écrin ${place(r)}`,
  ],
  telephonie: [
    (r) => `Allô ${r.pick(FIRST_NAMES)} Mobiles`,
    (r) => `Téléphonie ${place(r)}`,
    (r) => `Le Comptoir du Mobile ${place(r)}`,
    (r) => `Ondes & Réseaux ${place(r)}`,
  ],
  mode: [
    (r) => `Les Fripes de ${r.pick(FIRST_NAMES)}`,
    (r) => `Prêt-à-porter ${r.pick(FIRST_NAMES)}`,
    (r) => `Boutique ${r.pick(COLORS)} ${place(r)}`,
    (r) => `Le Vestiaire ${place(r)}`,
  ],
  alimentation: [
    (r) => `Épicerie ${place(r)}`,
    (r) => `Primeurs ${place(r)}`,
    (r) => `Alimentation générale ${place(r)}`,
    (r) => `Chez ${r.pick(FIRST_NAMES)}, épicerie fine`,
  ],
  supermarche: [
    (r) => `Supérette ${place(r)}`,
    (r) => `Supermarché ${place(r)}`,
    (r) => `La Halle aux Vivres ${place(r)}`,
  ],
  cafe_restaurant: [
    (r) => `Café ${place(r)}`,
    (r) => `Brasserie ${place(r)}`,
    (r) => `Le Zinc ${r.pick(COLORS)}`,
    (r) => `Bistrot ${place(r)}`,
    (r) => `Chez ${r.pick(FIRST_NAMES)}`,
  ],
  restauration_rapide: [
    (r) => `Burgers ${place(r)}`,
    (r) => `La Friterie ${place(r)}`,
    (r) => `Sandwichs & Cie ${place(r)}`,
    (r) => `Le Comptoir à Galettes ${place(r)}`,
  ],
  pharmacie: [
    (r) => `Pharmacie ${place(r)}`,
    (r) => `Grande Pharmacie ${place(r)}`,
  ],
  tabac_presse: [
    (r) => `Tabac ${place(r)}`,
    (r) => `Tabac-Presse ${place(r)}`,
    (r) => `Le Calumet ${r.pick(COLORS)}`,
    (r) => `La Tabatière ${place(r)}`,
  ],
  agence: [
    (r) => `Agence immobilière ${place(r)}`,
    (r) => `Intérim ${place(r)}`,
    (r) => `Assurances ${place(r)}`,
    (r) => `Voyages ${place(r)}`,
  ],
  hotel: [
    (r) => `Hôtel ${place(r)}`,
    (r) => `Hôtel ${r.pick(HOUSES)}`,
    (r) => `Grand Hôtel ${place(r)}`,
  ],
  autre: [
    (r) => `Bazar ${place(r)}`,
    (r) => `Librairie ${place(r)}`,
    (r) => `Fleurs ${place(r)}`,
    (r) => `Optique ${place(r)}`,
    (r) => `Cordonnerie ${place(r)}`,
    (r) => `Au Fil de ${r.pick(FIRST_NAMES)}, mercerie`,
  ],
};

/** Nom d'enseigne fictif pour une catégorie (tirages pris sur `rng`). */
export function shopName(category: ShopCategory, rng: Rng): string {
  const patterns = PATTERNS[category] ?? PATTERNS.autre!;
  return rng.pick(patterns)(rng);
}
