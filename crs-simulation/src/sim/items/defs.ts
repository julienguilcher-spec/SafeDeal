/* =====================================================================================
 * TABLE DES OBJETS (ItemDef) — un enregistrement par ItemId du contrat.
 *
 * Valeurs tirées de docs/research/00-bible-realisme.md §B et 02-materiel-tenues-vehicules.md §2-3
 * (masses, portées, cadences, dotations). Les noms affichés évitent toute marque commerciale :
 * le lanceur s'affiche « Lanceur de grenades 56 mm » (docs/INTEGRATION-NOTES.md), la grenade
 * assourdissante-lacrymogène par sa fonction.
 * Les niveaux de force viennent de FORCE_LEVEL_OF (contrat).
 * ===================================================================================== */

import type { ForceMeans, ItemCategory, ItemDef, ItemId, ProjectileKind, UpperAnim } from '@/core/contracts';
import { FORCE_LEVEL_OF } from '@/core/contracts';

interface DefOptions {
  twoHanded?: boolean;
  heldModel?: string;
  idle?: UpperAnim;
  use?: UpperAnim;
  icon: string;
  max?: number;
  weight: number;
  cooldown: number;
  range?: [number, number];
  means?: ForceMeans;
  projectile?: ProjectileKind;
  habilitation?: string;
}

function def(id: ItemId, name: string, category: ItemCategory, description: string, o: DefOptions): ItemDef {
  const means = o.means ?? null;
  return {
    id,
    name,
    category,
    description,
    twoHanded: o.twoHanded ?? false,
    heldModel: o.heldModel ?? id,
    idleAnim: o.idle ?? 'none',
    useAnim: o.use ?? 'none',
    icon: o.icon,
    maxCount: o.max ?? 1,
    weight: o.weight,
    cooldown: o.cooldown,
    rangeMin: o.range ? o.range[0] : 0,
    rangeMax: o.range ? o.range[1] : 0,
    forceLevel: means ? FORCE_LEVEL_OF[means] : 0,
    forceMeans: means,
    projectile: o.projectile ?? null,
    habilitation: o.habilitation ?? null,
  };
}

/** Tous les objets du jeu, dans l'ordre du contrat. */
export const ITEM_DEFS: readonly ItemDef[] = Object.freeze([
  // ───────────── forces de l'ordre ─────────────
  def('bouclier', 'Bouclier de maintien de l\'ordre', 'defense',
    'Polycarbonate transparent de 1,00 × 0,57 m. Action secondaire : lever le bouclier (arrête pavés, bouteilles et coups venus de face). Action principale : coup de bouclier pour repousser.',
    { idle: 'shield_carry', use: 'push', icon: 'BCL', weight: 4, cooldown: 1.2, range: [0, 1], means: 'contact' }),
  def('baton', 'Bâton de défense', 'melee',
    'Matraque souple à dragonne. Frappe à courte portée ; jamais à la tête ni sur une personne à terre ou maîtrisée.',
    { use: 'strike', icon: 'BTN', weight: 0.45, cooldown: 0.8, range: [0, 1.1], means: 'baton' }),
  def('tonfa', 'Bâton de défense à poignée latérale', 'melee',
    'Bâton de 0,60 m à poignée perpendiculaire : frappe, et parade avec l\'action secondaire.',
    { use: 'strike', icon: 'TNF', weight: 0.6, cooldown: 0.8, range: [0, 1.2], means: 'baton' }),
  def('gazeuse', 'Aérosol lacrymogène', 'spray',
    'Aérosol individuel : sept jets d\'une seconde, cône de 4 m. Arme de contact, jamais sur une personne maîtrisée.',
    { use: 'spray', icon: 'GAZ', max: 7, weight: 0.15, cooldown: 1, range: [0.5, 4], means: 'gazeuse', habilitation: 'gazeuse' }),
  def('grenade_lacrymo', 'Grenade lacrymogène à main', 'throwable',
    'Grenade de 56 mm à cuillère : s\'ouvre après un court retard et disperse six palets qui fument trente secondes chacun. Lancer de 5 à 30 m.',
    { heldModel: 'grenade', use: 'throw', icon: 'GL', max: 4, weight: 0.34, cooldown: 3, range: [5, 30], means: 'lacrymo', projectile: 'grenade_lacrymo_main' }),
  def('grenade_gm2l', 'Grenade assourdissante-lacrymogène', 'throwable',
    'Forte détonation et nuage instantané de lacrymogène. Tirée en cloche au lanceur de 56 mm, sur ordre.',
    { heldModel: 'grenade', use: 'throw', icon: 'GAL', max: 2, weight: 0.15, cooldown: 8, range: [30, 200], means: 'gm2l', projectile: 'gm2l', habilitation: 'lanceur' }),
  def('grenade_desencerclement', 'Grenade de désencerclement', 'throwable',
    'Roulée au ras du sol : détonation et projection circulaire de dix-huit plots de caoutchouc après 1,5 s. Réservée à l\'unité encerclée ou prise à partie.',
    { use: 'throw', icon: 'GMD', max: 2, weight: 0.25, cooldown: 3, range: [6, 25], means: 'desencerclement', projectile: 'desencerclement', habilitation: 'desencerclement' }),
  def('lanceur_cougar', 'Lanceur de grenades 56 mm', 'launcher',
    'Lanceur de grenades de 56 mm : tir en cloche uniquement, portée 50, 100 ou 200 m selon le dispositif de propulsion (action secondaire). Six à huit coups par minute.',
    { twoHanded: true, idle: 'none', use: 'aim_long', icon: 'LG56', max: 8, weight: 3.67, cooldown: 8, range: [30, 200], means: 'lacrymo', projectile: 'grenade_lacrymo_56', habilitation: 'lanceur' }),
  def('lbd40', 'LBD 40', 'launcher',
    'Lanceur de balles de défense de 40 mm, mono-coup. Viseur réglé à 25 m, utile de 10 à 50 m. Torse et membres uniquement ; la tête n\'est pas visée.',
    { twoHanded: true, use: 'aim_long', icon: 'LBD', max: 6, weight: 2.05, cooldown: 5, range: [10, 50], means: 'lbd', projectile: 'lbd', habilitation: 'lbd' }),
  def('pistolet', 'Arme de service', 'firearm',
    'Pistolet semi-automatique de 9 mm, quinze cartouches. Légitime défense uniquement : tout tir déclenche une enquête.',
    { use: 'aim_pistol', icon: 'PA', max: 15, weight: 0.9, cooldown: 0.35, range: [0, 25], means: 'arme_feu', projectile: 'balle' }),
  def('menottes', 'Menottes et liens', 'restraint',
    'Une paire de menottes et cinq liens plastiques. À poser sur une personne maîtrisée (4 s).',
    { use: 'restrain', icon: 'MNT', max: 6, weight: 0.3, cooldown: 1.5, range: [0, 1.6] }),
  def('radio', 'Poste radio', 'comms',
    'Poste portatif à micro d\'épaule : prise de parole sur le réseau de l\'unité.',
    { use: 'radio', icon: 'RAD', weight: 0.35, cooldown: 1 }),
  def('megaphone', 'Mégaphone', 'comms',
    'Porte-voix : intelligible à 60 m dans le bruit. Obligatoire pour l\'annonce et les sommations de l\'autorité habilitée.',
    { use: 'megaphone', icon: 'MEG', weight: 1.2, cooldown: 6, range: [0, 60] }),
  def('extincteur', 'Extincteur', 'tool',
    'Extincteur portatif de 6 kg : quinze secondes de poudre, portée 4 m. Éteint un collègue ou un début de feu.',
    { twoHanded: true, use: 'extinguish', icon: 'EXT', max: 15, weight: 6, cooldown: 1, range: [0.5, 4], habilitation: 'extincteur' }),
  def('lampe', 'Lampe torche', 'tool',
    'Torche compacte : faisceau d\'une centaine de mètres. Une pression allume, une pression éteint.',
    { use: 'point', icon: 'LMP', weight: 0.15, cooldown: 0.3, range: [0, 120] }),
  def('masque_gaz', 'Masque à gaz', 'defense',
    'Masque panoramique à cartouche : huit secondes pour le mettre. Protège du lacrymogène, réduit le champ de vision et étouffe la voix.',
    { use: 'cover_face', icon: 'MSQ', weight: 0.7, cooldown: 2 }),
  def('fusee_sommation', 'Fusée rouge', 'comms',
    'Étoile rouge tirée vers le ciel : remplace ou complète une annonce ou une sommation quand le haut-parleur ne porte pas.',
    { use: 'point', icon: 'FUS', max: 4, weight: 0.2, cooldown: 4, range: [0, 80], projectile: 'fusee_rouge' }),
  def('telecommande_drone', 'Télécommande de drone', 'tool',
    'Radiocommande à écran : prend ou rend la main sur le drone.',
    { twoHanded: true, idle: 'remote', use: 'remote', icon: 'DRN', weight: 0.8, cooldown: 1, habilitation: 'telepilote' }),

  // ───────────── manifestants ─────────────
  def('pave', 'Pavé', 'throwable',
    'Cube de granit ou fragment de chaussée d\'un à trois kilos. Arrêté par un bouclier levé ; brise vitrines et pare-brise.',
    { use: 'throw', icon: 'PAV', max: 3, weight: 1.5, cooldown: 1.6, range: [5, 28], projectile: 'pave' }),
  def('bouteille', 'Bouteille en verre', 'throwable',
    'Ramassée en terrasse ou dans un conteneur : éclate à l\'impact et projette des éclats.',
    { use: 'throw', icon: 'BTL', max: 3, weight: 0.5, cooldown: 1.4, range: [5, 30], projectile: 'bouteille' }),
  def('molotov', 'Cocktail Molotov', 'throwable',
    'Bouteille enflammée : nappe de feu de deux à trois mètres à l\'impact.',
    { use: 'throw', icon: 'MOL', max: 2, weight: 0.8, cooldown: 3, range: [8, 25], projectile: 'molotov' }),
  def('mortier', 'Mortier d\'artifice', 'launcher',
    'Tube tenu à la main, tiré à tir tendu : projectile lumineux, rapide et imprécis, qui éclate en gerbe.',
    { twoHanded: true, use: 'aim_long', icon: 'MRT', max: 8, weight: 1.2, cooldown: 1.5, range: [10, 60], projectile: 'mortier' }),
  def('fumigene', 'Fumigène', 'throwable',
    'Torche fumigène : une minute de fumée colorée. Rouge dans le cortège, noir comme signal de ralliement.',
    { use: 'throw', icon: 'FUM', max: 2, weight: 0.3, cooldown: 2, range: [0, 25], projectile: 'fumigene' }),
  def('pancarte', 'Pancarte', 'sign',
    'Carton manuscrit sur un manche. Action secondaire : la brandir.',
    { idle: 'carry_sign', use: 'wave', icon: 'PNC', weight: 0.6, cooldown: 1.5 }),
  def('banderole', 'Banderole', 'sign',
    'Banderole tenue à plusieurs ; renforcée, elle arrête les jets et les tirs de balles de défense sur ses porteurs.',
    { twoHanded: true, idle: 'carry_banner', use: 'wave', icon: 'BND', weight: 3, cooldown: 2 }),
  def('drapeau', 'Drapeau', 'sign',
    'Drapeau sur hampe de deux à trois mètres. Action secondaire : le brandir.',
    { idle: 'carry_sign', use: 'wave', icon: 'DRP', weight: 1, cooldown: 1.5 }),
  def('parapluie', 'Parapluie', 'defense',
    'Ouvert (action secondaire), il masque son porteur et ses voisins aux caméras et arrête les petits projectiles.',
    { use: 'umbrella', icon: 'PRP', weight: 0.4, cooldown: 1 }),
  def('bombe_peinture', 'Bombe de peinture', 'tool',
    'Aérosol de peinture : inscription sur une vitrine ou du mobilier à moins d\'un mètre cinquante.',
    { use: 'spraypaint', icon: 'BMB', max: 12, weight: 0.35, cooldown: 4, range: [0, 1.5] }),
  def('marteau', 'Marteau', 'melee',
    'Outil de chantier ou brise-vitre : étoile puis effondre une vitrine en quelques coups.',
    { use: 'hammer', icon: 'MRX', weight: 0.8, cooldown: 0.9, range: [0, 1] }),
  def('barre', 'Barre de fer', 'melee',
    'Barre métallique : brise vitrines et mobilier, force les rideaux.',
    { use: 'strike', icon: 'BAR', weight: 2, cooldown: 1.1, range: [0, 1.4] }),
  def('telephone', 'Téléphone', 'media',
    'Filme et diffuse : chaque prise de vue compte pour l\'image publique.',
    { idle: 'none', use: 'film', icon: 'TEL', weight: 0.2, cooldown: 1.5, range: [0, 20] }),
  def('butin', 'Butin', 'loot',
    'Marchandise emportée à bout de bras. L\'action principale la lâche.',
    { twoHanded: true, idle: 'carry_loot', use: 'pickup', icon: 'BUT', max: 10, weight: 2, cooldown: 1 }),
  def('raquette', 'Raquette', 'tool',
    'Renvoie d\'un revers un palet ou une grenade tombés à portée de bras.',
    { use: 'strike', icon: 'RQT', weight: 0.3, cooldown: 0.9, range: [0, 1.6] }),

  // ───────────── secours ─────────────
  def('trousse_secours', 'Trousse de secours', 'medical',
    'Pansements compressifs et couverture de survie : soigne la personne visée (10 s).',
    { use: 'treat', icon: 'TRS', max: 10, weight: 1.5, cooldown: 2, range: [0, 1.6] }),
  def('serum_physiologique', 'Sérum physiologique', 'medical',
    'Vingt doses : rince les yeux d\'une personne exposée au gaz (6 s).',
    { use: 'treat', icon: 'SRM', max: 20, weight: 0.5, cooldown: 1.5, range: [0, 1.6] }),
  def('brancard', 'Brancard', 'medical',
    'Brancard pliant : charge puis dépose un blessé.',
    { twoHanded: true, use: 'carry_person', icon: 'BRC', weight: 7, cooldown: 2, range: [0, 1.8] }),
  def('lance_incendie', 'Lance à incendie', 'tool',
    'Lance alimentée par l\'engin-pompe : jet de 25 m, 8 litres par seconde.',
    { twoHanded: true, use: 'extinguish', icon: 'LNC', weight: 2.5, cooldown: 0.5, range: [2, 25] }),

  // ───────────── presse ─────────────
  def('appareil_photo', 'Appareil photo', 'media',
    'Boîtier et téléobjectif : sujet net de 5 à 30 m, une vue par seconde, vingt-quatre vues.',
    { twoHanded: true, use: 'photo', icon: 'APN', max: 24, weight: 1.8, cooldown: 1, range: [5, 30] }),
  def('camera_tv', 'Caméra de télévision', 'media',
    'Caméra d\'épaule : chaque seconde filmée est une séquence exploitable.',
    { twoHanded: true, use: 'film', icon: 'CAM', weight: 7, cooldown: 1, range: [3, 40] }),
  def('micro', 'Micro', 'media',
    'Micro à bonnette : interview de la personne visée.',
    { use: 'point', icon: 'MIC', weight: 0.3, cooldown: 2, range: [0, 2] }),
] as ItemDef[]);

const BY_ID = new Map<string, ItemDef>();
for (const d of ITEM_DEFS) BY_ID.set(d.id, d);

/** Définition d'un objet (undefined pour un identifiant inconnu). */
export function itemDef(id: ItemId): ItemDef | undefined {
  return BY_ID.get(id);
}
