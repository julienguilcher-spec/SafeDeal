/* =====================================================================================
 * Page d'accueil — catalogues affichés : rôles, grades, postes, modes, lieux, météo, causes,
 * familles de la foule, durées. Données pures (aucun DOM), textes en français.
 * Sources : docs/research/00-bible-realisme.md (E.3 grades, F.1 foule, I.1 lieux) et 06-roles-jouables.md.
 * ===================================================================================== */

import type {
  DurationPreset, PlayableRole, PolicePoste, PoliceRank, WeatherKind,
} from '@/core/contracts';
import { CREWS } from '@/gameplay/patrols/model';
import { SERVICE_BASES, type ServiceBase } from '@/gameplay/session/journee-data';
import type { CauseLike, CrowdFamily, Derapage, Organisateurs } from '../core/api';

export interface Variante {
  id: string;
  label: string;
  desc: string;
}

export interface RoleInfo {
  id: PlayableRole;
  /** Nom affiché sur la carte du rôle. */
  name: string;
  /** Ce qu'on y fait, en une phrase courte. */
  desc: string;
  /** Rôle des forces de l'ordre (grade et poste réglables, état légal affiché en jeu). */
  police: boolean;
  /** Grades proposés (vide pour les rôles civils) et grade par défaut. */
  ranks: readonly PoliceRank[];
  defaultRank: PoliceRank | null;
  postes: readonly PolicePoste[];
  defaultPoste: PolicePoste | null;
  /** Variantes du rôle (profil du manifestant, service du secouriste). */
  variantes: readonly Variante[];
  /** Les grades sont affichés avec leurs équivalents de la gendarmerie. */
  gendarmerie?: boolean;
  /** Libellés de poste propres au rôle (« Chef de bord » pour le poste 'interpellation' de l'équipage de patrouille). */
  posteLabels?: Readonly<Partial<Record<PolicePoste, string>>>;
  /** Précisions de poste propres au rôle (remplacent POSTE_NOTES). */
  posteNotes?: Readonly<Partial<Record<PolicePoste, string>>>;
  /** Rôle hors carrière : sa carte est masquée en mode carrière (aucune mission de carrière ne s'y joue). */
  horsCarriere?: boolean;
}

export const ROLES: readonly RoleInfo[] = [
  {
    id: 'crs', name: 'CRS', desc: 'Tenez la ligne, exécutez les ordres.', police: true,
    ranks: ['gardien_stagiaire', 'gardien', 'brigadier'], defaultRank: 'gardien',
    postes: ['bouclier', 'lanceur', 'lbd', 'extincteur', 'interpellation', 'conducteur'], defaultPoste: 'bouclier', variantes: [],
  },
  {
    id: 'chef_groupe', name: 'Chef de groupe', desc: 'Désignez, autorisez, arrêtez.', police: true,
    ranks: ['brigadier_chef', 'major', 'capitaine'], defaultRank: 'brigadier_chef',
    postes: ['chef_groupe', 'chef_section'], defaultPoste: 'chef_groupe', variantes: [],
  },
  {
    id: 'commandant', name: 'Commandant', desc: 'Manœuvrez toute la compagnie.', police: true,
    ranks: ['capitaine', 'commandant'], defaultRank: 'commandant',
    postes: ['commandant_unite'], defaultPoste: 'commandant_unite',
    variantes: [
      { id: 'terrain', label: 'Sur le terrain', desc: 'À pied au contact (sommations au mégaphone) et au véhicule de commandement, où la carte est complète.' },
      { id: 'salle', label: 'Salle de commandement', desc: 'Purement stratégique : carte, drone et caméras ; les sommations sont prononcées sur votre ordre.' },
    ],
  },
  {
    id: 'commissaire', name: 'Commissaire', desc: 'Sommez, autorisez la force.', police: true,
    ranks: ['commissaire'], defaultRank: 'commissaire',
    postes: ['autorite_civile'], defaultPoste: 'autorite_civile', variantes: [],
  },
  {
    id: 'bravm', name: 'BRAV-M', desc: 'À moto : arrivez vite, interpellez.', police: true,
    ranks: ['gardien', 'brigadier', 'brigadier_chef'], defaultRank: 'gardien',
    // chef de la BRAV-M : le poste « chef de groupe » de l'unité (il commande ses binômes depuis la selle, derrière son
    // pilote) ; il est brigadier-chef au moins (roster.ts)
    postes: ['chef_groupe', 'passager_moto', 'pilote_moto'], defaultPoste: 'passager_moto', variantes: [],
    posteLabels: { chef_groupe: 'Chef de la BRAV-M' },
    posteNotes: {
      chef_groupe: 'Vous commandez la BRAV-M depuis la selle, derrière votre pilote : où aller, qui interpeller ; elle part avec vous.',
    },
  },
  {
    id: 'gendarme_centaure', name: 'Centaure', desc: 'Blindé : pilotez, tirez au lance-grenades, ouvrez les barricades.', police: true,
    ranks: ['gardien', 'brigadier_chef', 'major'], defaultRank: 'gardien',
    postes: ['conducteur', 'operateur', 'chef_groupe'], defaultPoste: 'conducteur', variantes: [], gendarmerie: true,
    posteLabels: { operateur: 'Opérateur du lance-grenades', chef_groupe: 'Chef d’engin' },
    posteNotes: {
      conducteur: 'Vous pilotez le blindé : lame, barricades, et le lance-grenades quand vous êtes seul à bord.',
      operateur: 'Vous servez le lance-grenades depuis la tourelle ; le pilote conduit.',
      chef_groupe: 'Vous commandez l’équipage : où aller, quand tirer.',
    },
  },
  {
    id: 'operateur_canon_eau', name: 'Canon à eau', desc: 'Pilotez l’engin et tenez le jet : à distance, éteignez les feux.', police: true,
    ranks: ['gardien', 'brigadier', 'brigadier_chef'], defaultRank: 'gardien',
    postes: ['conducteur', 'operateur'], defaultPoste: 'conducteur', variantes: [],
    posteLabels: { operateur: 'Opérateur des canons' },
    posteNotes: {
      conducteur: 'Vous conduisez l’engin et tenez les canons quand personne d’autre ne les sert.',
      operateur: 'Vous tenez les canons depuis le poste de tir ; le conducteur reste à son poste.',
    },
  },
  {
    id: 'telepilote', name: 'Télépilote', desc: 'Drone : observez d’en haut, désignez.', police: true,
    ranks: ['gardien', 'brigadier', 'brigadier_chef'], defaultRank: 'gardien',
    postes: ['telepilote'], defaultPoste: 'telepilote', variantes: [],
  },
  {
    id: 'patrouille', name: 'Patrouille', desc: 'Équipage de trois en voiture : BAC en civil ou Police secours.', police: true,
    ranks: ['gardien', 'brigadier_chef', 'major'], defaultRank: 'gardien',
    postes: ['conducteur', 'interpellation'], defaultPoste: 'conducteur',
    variantes: CREWS.map((c) => ({ id: c.id, label: c.label, desc: c.desc })),
    posteLabels: { interpellation: 'Chef de bord' },
    posteNotes: {
      conducteur: 'Vous êtes au volant ; le chef de bord et l’équipier sont à bord avec vous.',
      interpellation: 'Vous dirigez l’équipage depuis le siège passager ; un collègue conduit.',
    },
    horsCarriere: true,
  },
  {
    id: 'street_medic', name: 'Street medic', desc: 'Dans la foule : rincez, pansez.', police: false,
    ranks: [], defaultRank: null, postes: [], defaultPoste: null, variantes: [],
  },
  {
    id: 'secouriste', name: 'Secours', desc: 'Pompier ou SAMU, sous protection.', police: false,
    ranks: [], defaultRank: null, postes: [], defaultPoste: null,
    variantes: [
      { id: 'pompier', label: 'Sapeur-pompier', desc: 'Fourgon, lance, extinction et secours à victime.' },
      { id: 'samu', label: 'SAMU', desc: 'Équipe médicale : tri des victimes, soins, évacuation.' },
    ],
  },
  {
    id: 'journaliste', name: 'Journaliste', desc: 'Cadrez, filmez : vos images comptent.', police: false,
    ranks: [], defaultRank: null, postes: [], defaultPoste: null, variantes: [],
  },
  {
    id: 'manifestant', name: 'Manifestant', desc: 'Défilez, scandez… ou dérapez.', police: false,
    ranks: [], defaultRank: null, postes: [], defaultPoste: null,
    variantes: [
      { id: 'pacifique', label: 'Pacifique', desc: 'Marcher, chanter, arriver, témoigner.' },
      { id: 'service_ordre', label: 'Service d’ordre', desc: 'Canaliser le cortège, protéger le carré de tête.' },
      { id: 'radical', label: 'Radical', desc: 'La casse et ses suites : interpellation, tribunal.' },
    ],
  },
];

export function roleInfo(role: PlayableRole): RoleInfo {
  for (const r of ROLES) if (r.id === role) return r;
  return ROLES[0]!;
}

/** Identifiants de tous les rôles du catalogue, dans l'ordre d'affichage. */
export const ROLE_IDS: readonly PlayableRole[] = ROLES.map((r) => r.id);

export const RANK_LABELS: Readonly<Record<PoliceRank, string>> = {
  gardien_stagiaire: 'Gardien stagiaire',
  gardien: 'Gardien de la paix',
  brigadier: 'Brigadier',
  brigadier_chef: 'Brigadier-chef',
  major: 'Major',
  capitaine: 'Capitaine',
  commandant: 'Commandant',
  commissaire: 'Commissaire',
};

/** Équivalents affichés pour l'équipage du Centaure (gendarmerie mobile). */
export const GENDARME_RANK_LABELS: Readonly<Partial<Record<PoliceRank, string>>> = {
  gardien: 'Gendarme',
  brigadier_chef: 'Maréchal des logis-chef',
  major: 'Adjudant',
};

export function rankLabel(rank: PoliceRank | null, role?: PlayableRole): string {
  if (!rank) return '';
  if (role && roleInfo(role).gendarmerie) return GENDARME_RANK_LABELS[rank] ?? RANK_LABELS[rank];
  return RANK_LABELS[rank] ?? rank;
}

/** Précision affichée sous le sélecteur de grade. */
export const RANK_NOTES: Readonly<Partial<Record<PoliceRank, string>>> = {
  gardien_stagiaire: 'Équipier en formation : vous recevez les ordres, carte tactique en lecture seule.',
  gardien: 'Équipier : vous recevez les ordres, carte tactique en lecture seule.',
  brigadier: 'Grade supprimé le 1ᵉʳ août 2023, proposé pour les scénarios antérieurs.',
  brigadier_chef: 'Chef de groupe : vous donnez des ordres à votre groupe de six agents.',
  major: 'Chef de section : vous donnez des ordres à seize agents.',
  capitaine: 'Demi-compagnie : trente-deux agents sous vos ordres.',
  commandant: 'Commandant de la force publique : toute la compagnie et ses appuis.',
  commissaire: 'Autorité civile : vous qualifiez l’attroupement, sommez, autorisez, suspendez.',
};

export const POSTE_LABELS: Readonly<Record<PolicePoste, string>> = {
  bouclier: 'Porte-bouclier',
  lanceur: 'Lanceur de grenades',
  lbd: 'Tireur LBD',
  extincteur: 'Porte-extincteur',
  interpellation: 'Interpellateur',
  conducteur: 'Conducteur',
  operateur: 'Opérateur',
  chef_groupe: 'Chef de groupe',
  chef_section: 'Chef de section',
  commandant_unite: 'Commandant d’unité',
  autorite_civile: 'Autorité civile',
  pilote_moto: 'Pilote',
  passager_moto: 'Passager intervenant',
  telepilote: 'Télépilote',
};

export const POSTE_NOTES: Readonly<Partial<Record<PolicePoste, string>>> = {
  bouclier: 'Vous tenez votre intervalle dans la ligne et encaissez.',
  lanceur: 'Lanceur Cougar : tir en cloche, uniquement sur ordre.',
  lbd: 'Tir sur désignation du superviseur, jamais pour disperser.',
  extincteur: 'Vous veillez sur vos collègues et éteignez les départs de feu.',
  interpellation: 'Vous sortez de la ligne en binôme pour interpeller sur fait.',
  conducteur: 'Vous amenez l’unité, gardez le véhicule et protégez le repli.',
  operateur: 'Vous servez la tourelle : dosage, précision, retenue.',
  chef_groupe: 'Six agents : désigner, autoriser, arrêter.',
  chef_section: 'Seize agents en trois groupes.',
  pilote_moto: 'Vous amenez le binôme, puis gardez les machines.',
  passager_moto: 'Vous mettez pied à terre et intervenez.',
};

/** Libellé d'un poste dans un rôle (libellé propre au rôle, sinon le libellé commun). */
export function posteLabel(role: PlayableRole, poste: PolicePoste): string {
  return roleInfo(role).posteLabels?.[poste] ?? POSTE_LABELS[poste];
}

/** Précision affichée sous le sélecteur de poste ('' si aucune). */
export function posteNote(role: PlayableRole, poste: PolicePoste): string {
  return roleInfo(role).posteNotes?.[poste] ?? POSTE_NOTES[poste] ?? '';
}

/**
 * Modes de jeu. L'identifiant interne 'monde_ouvert' s'appelle « Patrouille » à l'écran : une vacation d'équipage
 * (src/gameplay/patrols/model.ts) ; les anciennes configurations « Monde ouvert » y sont converties au lancement.
 */
export const MODES: readonly { id: 'carriere' | 'libre' | 'monde_ouvert'; label: string; desc: string }[] = [
  { id: 'libre', label: 'Mode libre', desc: 'Vous réglez tout : rôle, manifestation, lieu, colonnes, imprévu.' },
  { id: 'carriere', label: 'Carrière', desc: 'Progressez de grade en grade ; chaque mission compte.' },
  { id: 'monde_ouvert', label: 'Patrouille', desc: 'En BAC ou en Police secours dans Paris : la radio vous envoie sur ce qui se déclare.' },
];

/** Organisateurs de la manifestation (libellés génériques, aucune organisation réelle). */
export const ORGANISATEURS: readonly { id: Organisateurs; label: string; desc: string }[] = [
  { id: 'intersyndicale', label: 'Intersyndicale', desc: 'Manifestation déclarée : service d’ordre, camion sono, parcours négocié.' },
  { id: 'collectif', label: 'Collectif citoyen', desc: 'Déclarée par un collectif : encadrement léger, cortège plus mêlé.' },
  { id: 'coordination_etudiante', label: 'Coordination étudiante', desc: 'Étudiants et lycéens : cortège jeune et mobile.' },
  { id: 'aucun', label: 'Sans organisateur', desc: 'Appel lancé sur les réseaux : ni service d’ordre ni sono, personne à qui parler.' },
];
export const ORGANISATEUR_IDS: readonly Organisateurs[] = ORGANISATEURS.map((o) => o.id);

/** Crans du curseur « Imprévu » (0 à 3) : ce qui se déclare en marge de la manifestation annoncée. */
export const IMPREVU_LEVELS: readonly { level: 0 | 1 | 2 | 3; label: string; tip: string }[] = [
  { level: 0, label: 'Comme annoncé', tip: 'La manifestation se déroule comme déclarée : aucun rassemblement ni groupe en marge.' },
  { level: 1, label: 'Quelques débordements', tip: 'Selon l’affluence et la propension à dégénérer : parfois un rassemblement ou un groupe de casseurs en marge.' },
  { level: 2, label: 'Agité', tip: 'Au moins deux foyers en marge dès la quatrième minute, et une manifestation sauvage dans l’après-coup.' },
  { level: 3, label: 'Imprévisible', tip: 'Cinq foyers rapprochés et deux manifestations sauvages : des gens surgissent là où on ne les attend pas.' },
];

/** Point de départ des colonnes en journée de service. */
export interface ColumnDepart {
  /** 'auto' : base la mieux placée selon le lieu ; 'sur_place' : forces déjà en place ; sinon une base de SERVICE_BASES. */
  id: string;
  label: string;
  desc: string;
  base: ServiceBase | null;
}

/** Identifiant stable d'une base de prise de service (« cite », « arr-9 »). */
function baseId(b: ServiceBase, index: number): string {
  const m = /du (\d+)(?:er|e) arrondissement/.exec(b.name);
  return m ? 'arr-' + m[1] : index === 0 ? 'cite' : 'base-' + index;
}

function baseLabel(b: ServiceBase): string {
  const m = /^commissariat du (\d+(?:er|e)) arrondissement/.exec(b.name);
  if (!m) return b.name.charAt(0).toUpperCase() + b.name.slice(1);
  return `Commissariat du ${m[1]}`;
}

function baseDesc(b: ServiceBase): string {
  const m = /\((.+)\)$/.exec(b.name);
  return m ? m[1]!.charAt(0).toUpperCase() + m[1]!.slice(1) : 'Préfecture de police, île de la Cité';
}

/** Choix « Point de départ des colonnes » de la rubrique « Moyens engagés ». */
export const COLUMN_DEPARTS: readonly ColumnDepart[] = [
  { id: 'auto', label: 'Automatique', desc: 'La base la mieux placée : entre 1,2 et 3,2 km du rassemblement, un vrai trajet en colonne.', base: null },
  ...SERVICE_BASES.map((b, i) => ({ id: baseId(b, i), label: baseLabel(b), desc: baseDesc(b), base: b })),
  { id: 'sur_place', label: 'Déjà sur place', desc: 'Pas de journée de service : les forces sont en place près du rassemblement.', base: null },
];

export interface PlaceChoice {
  /** Nom affiché et valeur de SessionConfig.place. */
  name: string;
  x: number;
  z: number;
  /** Ce qui s'y joue, en quelques mots. */
  note: string;
  /** Mots (sans accents, en minuscules) qui identifient le lieu dans ctx.world.places. */
  keys: readonly string[];
}

/** Lieux proposés par défaut ; coordonnées de jeu du dossier 00, I.1 (projection du BRIEF). */
export const DEFAULT_PLACES: readonly PlaceChoice[] = [
  { name: 'Place de la République', x: 3123, z: -208, note: 'Départ des grands cortèges', keys: ['place de la republique'] },
  { name: 'Place de la Bastille', x: 3542, z: 1395, note: 'Arrivée et dispersion', keys: ['place de la bastille'] },
  { name: 'Place de la Concorde', x: -10, z: 15, note: 'Rassemblements du soir, périmètre sensible', keys: ['place de la concorde'] },
  { name: 'Champs-Élysées – Étoile', x: -1920, z: -906, note: 'Douze avenues à barrer', keys: ['charles de gaulle', 'etoile'] },
  { name: 'Place de l’Opéra', x: 811, z: -564, note: 'Débouché des Grands Boulevards', keys: ['place de l\'opera', 'place de l’opera'] },
  { name: 'Trocadéro', x: -2411, z: 387, note: 'Rassemblement statique face à la tour Eiffel', keys: ['trocadero'] },
  { name: 'Esplanade des Invalides', x: -596, z: 626, note: 'Grande esplanade de dispersion', keys: ['esplanade des invalides'] },
  { name: 'Hôtel de Ville', x: 2211, z: 993, note: 'Rassemblements catégoriels', keys: ['hotel-de-ville', 'hotel de ville'] },
  { name: 'Châtelet', x: 1903, z: 916, note: 'Groupes mobiles, nœud de transport', keys: ['place du chatelet', 'chatelet'] },
  { name: 'Place de la Madeleine', x: 239, z: -497, note: 'Verrou vers la Concorde', keys: ['place de la madeleine'] },
];

export const WEATHERS: readonly { id: WeatherKind; label: string }[] = [
  { id: 'clair', label: 'Clair' },
  { id: 'nuageux', label: 'Nuageux' },
  { id: 'couvert', label: 'Couvert' },
  { id: 'pluie', label: 'Pluie' },
  { id: 'averse', label: 'Averse' },
  { id: 'brouillard', label: 'Brouillard' },
  { id: 'orage', label: 'Orage' },
];

export function weatherLabel(weather: WeatherKind): string {
  for (const w of WEATHERS) if (w.id === weather) return w.label;
  return weather;
}

/** Causes proposées quand le service 'roles.causes' est absent (BRIEF §1). */
export const DEFAULT_CAUSES: readonly CauseLike[] = [
  { id: 'pouvoir_achat', label: 'Pouvoir d’achat' },
  { id: 'retraites', label: 'Retraites' },
  { id: 'climat', label: 'Climat' },
  { id: 'logement', label: 'Logement' },
  { id: 'hopital', label: 'Hôpital' },
  { id: 'education', label: 'Éducation' },
  { id: 'agriculture', label: 'Monde agricole' },
  { id: 'carburants', label: 'Prix des carburants' },
  { id: 'libertes', label: 'Libertés publiques' },
];

export interface FamilyInfo {
  id: CrowdFamily;
  label: string;
  /** Couleur de la famille dans l'aperçu de composition. */
  color: string;
  /** Cause par défaut la plus plausible quand cette famille domine. */
  causes: readonly string[];
}

export const FAMILIES: readonly FamilyInfo[] = [
  { id: 'syndical', label: 'Cortège syndical', color: '#e0483c', causes: ['retraites', 'pouvoir_achat'] },
  { id: 'gilets_jaunes', label: 'Gilets jaunes', color: '#ffd60a', causes: ['pouvoir_achat', 'carburants'] },
  { id: 'etudiants', label: 'Étudiants et lycéens', color: '#58c99b', causes: ['education', 'retraites'] },
  { id: 'familles', label: 'Familles', color: '#7fb5f0', causes: ['logement', 'pouvoir_achat'] },
  { id: 'climat', label: 'Militants climat', color: '#3c8d4b', causes: ['climat'] },
  { id: 'soignants', label: 'Soignants', color: '#a9cce3', causes: ['hopital'] },
  { id: 'agriculteurs', label: 'Agriculteurs', color: '#c8a24a', causes: ['agriculture', 'carburants'] },
  { id: 'retraites', label: 'Retraités', color: '#b79bd6', causes: ['retraites', 'pouvoir_achat'] },
  { id: 'black_bloc', label: 'Black bloc', color: '#1c1f26', causes: ['libertes'] },
];

export const FAMILY_IDS: readonly CrowdFamily[] = FAMILIES.map((f) => f.id);

/** Part maximale du black bloc réglable sur la page d'accueil (en %). */
export const BLACK_BLOC_MAX = 25;

export const DURATIONS: readonly { id: DurationPreset; label: string; long: string }[] = [
  { id: 'courte', label: '10 min', long: '10 minutes' },
  { id: 'standard', label: '25 min', long: '25 minutes' },
  { id: 'longue', label: '45 min', long: '45 minutes' },
  { id: 'temps_reel', label: 'Temps réel', long: 'temps réel' },
];

export const DERAPAGES: readonly { id: Derapage; label: string; tip: string }[] = [
  { id: 'hasard', label: 'Au hasard', tip: 'Le plus souvent personne ; parfois la foule, les forces ou les deux.' },
  { id: 'personne', label: 'Personne', tip: 'Chacun garde son sang-froid, sauf si vous provoquez.' },
  { id: 'foule', label: 'La foule', tip: 'Radicaux et suiveurs plus nombreux et plus actifs.' },
  { id: 'forces', label: 'Les forces', tip: 'Sous tension, un collègue peut commettre un geste hors cadre : à prévenir ou signaler.' },
  { id: 'les_deux', label: 'Les deux', tip: 'Dérapages des deux côtés.' },
];

/** Valeurs du curseur d'affluence (échelle resserrée en bas, 50 → 5 000). */
export const CROWD_STOPS: readonly number[] = [
  50, 75, 100, 150, 200, 250, 300, 400, 500, 600, 750, 900, 1000, 1200, 1500, 1800, 2000, 2500, 3000, 3500, 4000, 4500, 5000,
];
export const CROWD_MIN = 50;
export const CROWD_MAX = 5000;

/** Bornes des moyens engagés. */
export const MEANS_LIMITS = {
  sections: [0, 16],
  fourgons: [0, 48],
  centaure: [0, 10],
  canon_eau: [0, 10],
  bravm: [0, 8],
  drone: [0, 4],
  pompiers: [0, 10],
  samu: [0, 10],
} as const;

export const MEANS_LABELS: Readonly<Record<keyof typeof MEANS_LIMITS, { label: string; unit: string; hint: string }>> = {
  sections: { label: 'Sections à pied', unit: 'section', hint: '16 agents par section, en trois groupes.' },
  fourgons: { label: 'Fourgons', unit: 'fourgon', hint: 'Un fourgon par groupe ; ils servent aussi de barrage.' },
  centaure: { label: 'Centaure', unit: 'blindé', hint: 'Blindé de la gendarmerie : lame et lance-grenades. Engagement rare.' },
  canon_eau: { label: 'Canon à eau', unit: 'engin', hint: 'Tient à distance après les sommations ; éteint les feux.' },
  bravm: { label: 'BRAV-M', unit: 'groupe', hint: 'Groupes de 6 motos, 12 agents : interpellations rapides.' },
  drone: { label: 'Drone', unit: 'drone', hint: 'Quatre appareils au plus, sous arrêté préfectoral.' },
  pompiers: { label: 'Sapeurs-pompiers', unit: 'engin', hint: 'Fourgon d’incendie et secours à victime.' },
  samu: { label: 'SAMU', unit: 'équipe', hint: 'Équipe médicale et ambulance.' },
};

/** Retire accents et majuscules (comparaison tolérante de noms de lieux). */
export function fold(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’`]/g, '\'').trim();
}
