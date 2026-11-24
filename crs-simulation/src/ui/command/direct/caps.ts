/* =====================================================================================
 * Ordres directs — CE QUE CHAQUE UNITÉ ACCEPTE et les REFUS en une phrase (logique pure).
 *
 *   unitKindOf(symbol, cellular)   genre d'unité (troupe, BRAV-M, Centaure, canon à eau, drone, fourgon cellulaire…) ;
 *   accepts(kind, verb)            le verbe est-il dans ses capacités (tableau du §4.2) ;
 *   capRefusal(kind, verb)         la phrase de refus d'un verbe qu'elle n'accepte pas (null s'il l'accepte) ;
 *   REFUS / refus…()               les refus du §4.3, une phrase et la façon d'en sortir ;
 *   simRefusal(unité, motif)       un refus de la simulation (police:order_refused, startTask, BRAV-M) dit en clair :
 *                                  « MISTRAL 2 ne peut pas : <motif>. U : une autre unité. » ; chaque motif connu de la
 *                                  simulation a ses mots (SIM_REASON_WORDS) — un motif inconnu est un échec de test.
 * Utilisé pour griser les secteurs de la roue, écarter une unité du choix automatique et écrire le refus.
 * ===================================================================================== */

import type { UnitSymbol } from '../../maps/units';
import type { DirectVerb, UnitKind } from './types';

/** Genre d'unité d'un symbole de carte (le fourgon cellulaire est un véhicule à part). */
export function unitKindOf(symbol: UnitSymbol | string, cellular = false): UnitKind {
  if (cellular) return 'cellulaire';
  switch (symbol) {
    case 'section': case 'groupe': case 'binome': case 'compagnie': return 'troupe';
    case 'bravm': return 'bravm';
    case 'centaure': return 'centaure';
    case 'canon_eau': return 'canon_eau';
    case 'drone': return 'drone';
    case 'patrouille': return 'patrouille';
    default: return 'autre';
  }
}

/** Verbes que tout le monde accepte : revenir avec le joueur. */
const ALWAYS: ReadonlySet<DirectVerb> = new Set<DirectVerb>(['avec_moi']);

const ACCEPTS: Readonly<Record<UnitKind, ReadonlySet<DirectVerb> | 'all'>> = {
  troupe: 'all',
  bravm: 'all',
  centaure: new Set<DirectVerb>(['envoyer', 'pousser', 'tenir', 'cesser', 'venir']),
  canon_eau: new Set<DirectVerb>(['envoyer', 'disperser', 'tenir', 'cesser', 'venir']),
  drone: new Set<DirectVerb>(['envoyer']),
  cellulaire: new Set<DirectVerb>(['envoyer', 'venir', 'partir', 'faire_venir']),
  // voiture de patrouille : ses deux équipiers (§1.4) — Avec moi, Interpeller, Secours, l'interpellé
  patrouille: new Set<DirectVerb>(['interpeller', 'constater', 'secours', 'confier', 'remettre', 'emmener', 'faire_venir', 'envoyer', 'venir']),
  autre: new Set<DirectVerb>(['envoyer']),
};

/** Verbes propres au joueur ou au fourgon : ils ne s'adressent à aucune troupe. */
const VAN_ONLY: ReadonlySet<DirectVerb> = new Set<DirectVerb>(['partir']);

/** Le verbe est-il dans les capacités de ce genre d'unité ? */
export function accepts(kind: UnitKind, verb: DirectVerb): boolean {
  if (ALWAYS.has(verb)) return true;
  const set = ACCEPTS[kind];
  if (set === 'all') return !VAN_ONLY.has(verb);
  return set.has(verb);
}

/** Refus exacts des capacités (§4.2). */
export const CAP_REFUSALS = {
  bravmBloquer: 'La BRAV-M ne tient pas de barrage\u00a0: envoyez une section.',
  centaureInterpeller: 'Le Centaure n’interpelle pas\u00a0: envoyez la BRAV-M ou un groupe.',
  centaureDisperser: 'Le Centaure ne disperse pas\u00a0: prenez le canon à eau.',
  canonInterpeller: 'Le canon à eau n’interpelle pas\u00a0: envoyez la BRAV-M ou un groupe.',
  canonBloquer: 'Le canon à eau ne barre pas une rue seul\u00a0: envoyez une section.',
  drone: 'Le drone observe seulement\u00a0: il survole le point.',
  cellulaire: 'C’est un fourgon cellulaire\u00a0: il transporte les interpellés.',
} as const;

/** Verbes de troupe qu'un engin ne fait pas : la phrase du §4.2 (null : aucune, verbe accepté). */
export function capRefusal(kind: UnitKind, verb: DirectVerb): string | null {
  if (accepts(kind, verb)) {
    // la BRAV-M accepte « Bloquer » (proposé seulement si rien d'autre n'est sous vos ordres), mais le dit quand on le
    // lui demande alors qu'une section existe : voir who.ts
    return null;
  }
  switch (kind) {
    case 'centaure':
      if (verb === 'interpeller' || verb === 'constater') return CAP_REFUSALS.centaureInterpeller;
      if (verb === 'disperser' || verb === 'gaz' || verb === 'charge' || verb === 'bond') return CAP_REFUSALS.centaureDisperser;
      return REFUS.centaureAutre;
    case 'canon_eau':
      if (verb === 'interpeller' || verb === 'constater') return CAP_REFUSALS.canonInterpeller;
      if (verb === 'bloquer' || verb === 'face_foule') return CAP_REFUSALS.canonBloquer;
      return REFUS.canonAutre;
    case 'drone': return CAP_REFUSALS.drone;
    case 'cellulaire': return CAP_REFUSALS.cellulaire;
    case 'patrouille': return REFUS.equipage;
    default: return REFUS.autreEngin;
  }
}

// ───────────────────────────── refus du §4.3 ─────────────────────────────

/** Refus en une phrase et la façon d'en sortir (toast 5 s + ligne d'ordre prêt grisée). */
export const REFUS = {
  disperserSommations: (unit: string): string =>
    `Disperser\u00a0: il faut d’abord les 3 sommations (avertissements à la foule). Appuyez encore\u00a0: ${unit} se met en ligne et je les fais faire.`,
  encercler: 'Encercler demande deux unités\u00a0: vous n’en avez qu’une. Bloquez plutôt la rue.',
  noCentaure: 'Pas de blindé Centaure avec vous. Bloquez la rue en attendant.',
  noBinome: (busy: number): string =>
    `Toute la BRAV-M est déjà sur des interpellations (${busy} en cours). Envoyez une section.`,
  tropLoin: 'Trop loin pour viser\u00a0: Tab, la carte s’ouvre sur ce point.',
  lecture: 'Votre chef donne les ordres. A\u00a0: votre binôme avec vous.',
  equipage: 'Vous êtes deux\u00a0: pour barrer ou disperser, demandez des renforts à CENTRAL (Y).',
  personne: 'Personne sous vos ordres ici.',
  rien: 'Visez une rue, une personne ou la foule — A\u00a0: tout le monde avec vous.',
  constater: 'Personne n’a rien commis ici\u00a0: ils surveillent.',
  centaureAutre: 'Le Centaure ne fait pas cela\u00a0: envoyez une section.',
  canonAutre: 'Le canon à eau ne fait pas cela\u00a0: envoyez une section.',
  autreEngin: 'Cet engin ne fait pas cela\u00a0: envoyez une section.',
} as const;

/** Verbe de force dit en tête du refus (« Charger », « Disperser au gaz »). */
function forceVerbWord(verb: DirectVerb): string {
  switch (verb) {
    case 'charge': return 'Charger';
    case 'gaz': return 'Disperser au gaz';
    case 'bond': return 'Bond en avant';
    case 'disperser': return 'Disperser';
    default: return 'Cet ordre';
  }
}

/**
 * Force non autorisée : le commandant (l'autorité) se voit proposer de tout faire d'un second appui (sommations + son
 * accord) ; les autres demandent l'accord du commandant à la radio.
 */
export function refusForce(verb: DirectVerb, authority: boolean): string {
  const w = forceVerbWord(verb);
  return authority
    ? `${w}\u00a0: il faut d’abord les 3 sommations (avertissements à la foule) et votre accord. Appuyez encore\u00a0: je les fais faire et vous donnez votre accord.`
    : `${w} demande l’accord du commandant. Demandez-le à la radio (T).`;
}

// ───────────────────────────── refus de la simulation ─────────────────────────────

/**
 * Motifs que la simulation donne (sim/police : refuse(), finish(), done(), startTask, BRAV-M), sans le point final,
 * et leurs mots pour le joueur. Clé : le motif tel quel (minuscules, point final ôté, espaces insécables normalisés).
 */
export const SIM_REASON_WORDS: Readonly<Record<string, string>> = {
  // déplacement, engins
  'pilote automatique indisponible': 'son conducteur ne peut pas rouler',
  'aucun itinéraire': 'aucun chemin pour y aller',
  'engin bloqué': 'l’engin est bloqué',
  'objectif hors de portée': 'le point est hors de portée',
  'zone hors de portée': 'la zone est hors de portée',
  'zone hors de portée de la tourelle': 'la zone est hors de portée de la tourelle',
  'objectif perdu': 'il a perdu l’objectif de vue',
  'aucun véhicule disponible': 'aucun véhicule libre pour monter',
  'personne à suivre': 'il n’y a personne à suivre',
  'ordre inconnu': 'il ne connaît pas cet ordre',
  // canon à eau
  'canons indisponibles': 'ses canons sont hors d’usage',
  'aucun opérateur aux canons': 'personne aux canons',
  'aucun équipier aux canons': 'personne aux canons',
  'niveau de force de l’ordre insuffisant pour l’engin lanceur d’eau': 'l’eau n’est pas autorisée (accord du commandant)',
  'feu hors de portée': 'le feu est hors de portée',
  'feu non maîtrisé': 'le feu n’est pas maîtrisé',
  'personnes au contact du foyer': 'des personnes sont au contact du feu',
  'cuve basse : plein à faire par le conducteur': 'sa cuve est presque vide',
  'plein impossible': 'il ne peut pas faire le plein',
  // Centaure
  'tourelle indisponible': 'sa tourelle est hors d’usage',
  'usage des armes non autorisé : la dernière sommation doit être réitérée': 'la dernière sommation doit être refaite',
  'niveau de force de l’ordre insuffisant pour une salve de lacrymogènes': 'le gaz n’est pas autorisé (accord du commandant)',
  'agents dans la zone d’arrivée': 'des policiers sont dans la zone visée',
  'tubes vides': 'il n’a plus de grenades',
  'pointage impossible': 'il ne peut pas viser ce point',
  'tir impossible': 'il ne peut pas tirer',
  'lame indisponible': 'sa lame est hors d’usage',
  'aucune barricade au point indiqué': 'il n’y a pas de barricade à cet endroit',
  'aucun obstacle au point indiqué': 'il n’y a pas de véhicule à pousser à cet endroit',
  'obstacle hors de la chaussée': 'le véhicule n’est pas sur la chaussée',
  'obstacle hors d’atteinte': 'le véhicule est hors d’atteinte',
  'obstacle habité : poussée refusée': 'quelqu’un est dans le véhicule',
  'véhicule occupé : poussée refusée': 'quelqu’un est dans le véhicule',
  'personnes dans le couloir de poussée : poussée refusée': 'des personnes sont devant le véhicule',
  'obstacle non dégagé': 'le véhicule n’a pas bougé',
  'aucun centaure disponible': 'aucun Centaure libre',
  'le centaure n’a pas reçu l’ordre': 'le Centaure n’a pas reçu l’ordre',
  'aucun obstacle à proximité': 'aucun véhicule ne bloque ici',
  'aucun joueur': 'vous n’êtes pas sur le terrain',
  // BRAV-M
  'aucun opérateur disponible': 'aucun binôme libre',
  'point non atteint': 'elle n’a pas atteint le point à pied',
  'objectif au milieu d’un groupe compact : interpellation non tentée': 'l’individu est au milieu d’un groupe compact',
  'aucun fait constaté : aucune interpellation': 'personne n’a rien commis ici (aucun fait constaté)',
  'interpellation non aboutie': 'l’interpellation n’a pas abouti',
  // interpellation
  'aucun individu à interpeller sur fait constaté': 'personne n’a rien commis ici',
  'binôme hors de combat': 'le binôme est hors de combat',
  'individu perdu de vue': 'l’individu est perdu de vue',
  'individu déjà interpellé': 'il est déjà interpellé',
  'individu hors d’atteinte, le binôme rentre': 'l’individu est hors d’atteinte',
  'individu hors d’atteinte': 'l’individu est hors d’atteinte',
  'individu trop loin de la ligne': 'l’individu est trop loin de la ligne',
  'saisie impossible': 'il n’a pas pu le saisir',
  'l’individu s’est dégagé et a pris la fuite': 'l’individu s’est enfui',
  'escorte impossible': 'il ne peut pas l’emmener',
  'l’interpellé s’est échappé': 'l’interpellé s’est échappé',
  'remise impossible': 'aucun véhicule pour le remettre',
  'interpellé non rejoint': 'ses collègues n’ont pas pu rejoindre l’interpellé',
  'rien constaté sur place': 'rien n’a été constaté sur place',
  // secours, dégagement
  'aucun blessé à terre au point indiqué': 'il n’y a pas de blessé à cet endroit',
  'agent de secours hors de combat': 'l’agent qui secourait est hors de combat',
  'blessé introuvable': 'le blessé est introuvable',
  'extraction interrompue': 'l’extraction a été interrompue',
  'impossible de dégager le blessé': 'il ne peut pas dégager le blessé',
  'dépôt impossible': 'il ne peut pas déposer le blessé',
  'porte-extincteur hors de combat': 'le porte-extincteur est hors de combat',
  'extincteur vide, feu non maîtrisé. demande l’engin lanceur d’eau ou les pompiers': 'l’extincteur est vide (il faut le canon à eau ou les pompiers)',
  'feu trop important pour un extincteur. demande l’engin lanceur d’eau ou les pompiers': 'le feu est trop fort (il faut le canon à eau ou les pompiers)',
  'barricade en feu : à éteindre avant de la dégager': 'la barricade brûle',
  'barricade trop lourde à la main. demande le centaure': 'la barricade est trop lourde (il faut le Centaure)',
  'équipe de dégagement hors de combat': 'l’équipe de dégagement est hors de combat',
  'impossible de dégager l’obstacle à la main. demande le centaure': 'l’obstacle est trop lourd (il faut le Centaure)',
  // force
  'moyen de force non autorisé': 'ce moyen de force n’est pas autorisé',
  'tir impossible : objectif hors de portée, munitions épuisées ou cadre non réuni': 'tir impossible (hors de portée, plus de munitions ou cadre légal non réuni)',
};

/** Motifs dont la fin varie (nom de la personne) : leur début et leurs mots. */
export const SIM_REASON_PREFIXES: readonly (readonly [string, string])[] = [
  ['aucun fait constaté contre', 'personne n’a rien commis ici (aucun fait constaté)'],
];

/** Clé de recherche d'un motif : minuscules, espaces insécables normalisés, point final ôté. */
export function reasonKey(reason: string): string {
  return reason.replace(/[\u00a0 ]/g, ' ').replace(/'/g, '’').trim().replace(/\.+$/, '').trim().toLocaleLowerCase('fr-FR');
}

/** Le motif de la simulation a-t-il ses mots ? (Un motif vide n'en a pas besoin : il n'est jamais affiché.) */
export function isKnownSimReason(reason: string): boolean {
  const k = reasonKey(reason);
  return k === '' || SIM_REASON_WORDS[k] !== undefined || SIM_REASON_PREFIXES.some(([pre]) => k.startsWith(pre));
}

/** Mots d'un motif de la simulation ; inconnu : le motif lui-même, première lettre en minuscule (jamais rien). */
export function simReasonWords(reason: string): string {
  const k = reasonKey(reason);
  const w = SIM_REASON_WORDS[k];
  if (w !== undefined) return w;
  for (const [pre, words] of SIM_REASON_PREFIXES) if (k.startsWith(pre)) return words;
  const t = reason.trim().replace(/\.+$/, '');
  return t === '' ? 'ordre impossible' : t.charAt(0).toLocaleLowerCase('fr-FR') + t.slice(1);
}

/** « MISTRAL 2 ne peut pas : aucun chemin pour y aller. U : une autre unité. » */
export function simRefusal(unitName: string, reason: string): string {
  return `${unitName} ne peut pas\u00a0: ${simReasonWords(reason)}. U\u00a0: une autre unité.`;
}
