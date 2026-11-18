/* =====================================================================================
 * Catalogue des ordres (tous les verbes d'OrderType du contrat, libellés français) et géométrie
 * des gestes : segment tracé → ligne de barrage (centre, cap, largeur), partage entre plusieurs
 * unités, point → ordre de mouvement, cercle → nasse. Logique pure, sans DOM.
 * ===================================================================================== */

import type { ForceLevel, OrderType } from '@/core/contracts';

/** Geste attendu sur la carte après le choix du verbe. */
export type OrderGesture = 'immediate' | 'point' | 'line' | 'area' | 'target';
export type OrderGroup = 'posture' | 'mouvement' | 'manoeuvre' | 'appui' | 'fin';

export interface OrderVerb {
  type: OrderType;
  /** Libellé complet (« Ligne de barrage ») et libellé court pour les pastilles et la roue. */
  label: string;
  short: string;
  group: OrderGroup;
  gesture: OrderGesture;
  /** Niveau de force minimal que l'ordre suppose (rappel affiché si la force autorisée est inférieure). */
  force: ForceLevel;
  /** Emploi collectif de la force : suppose les sommations faites (hors riposte à des violences). */
  coercive: boolean;
  /** Consigne affichée pendant le geste. */
  hint: string;
  /** Rappel de règle affiché avec l'ordre (vide si aucun). */
  rule: string;
  /** Libellé en clair d'une ligne de fiche (« Barrer la rue ») : seul nom montré au joueur. */
  plain: string;
  /** Étiquette de la carte, de la pastille d'unité et des lignes « Mes unités » (majuscules, ≤ 20 caractères, sans abréviation). */
  tag: string;
  /** Explication en une ligne, sous le libellé. */
  explain: string;
  /** Ce que fait l'unité, pour les lignes de suivi (« barre la rue »). */
  doing: string;
}

/** Textes en clair d'un ordre (libellé, étiquette, explication, activité). */
export interface PlainWords {
  plain: string;
  tag: string;
  explain: string;
  doing: string;
}

/** Consigne de l'ordre « Barrer la rue » (palette, ordre rapide, roue, aperçu). */
export const BARRER_HINT = 'Plus personne ne passe, dans les deux sens';
/** Consigne de « Barrer la rue » avec l'option « Passants : laissés passer ». */
export const BARRER_HINT_PASSANTS = 'Les manifestants ne passent pas, les passants oui';

/**
 * Valeur de SquadOrder.targetId de « Barrer la rue » quand les passants sont laissés passer (copie locale de
 * BARRAGE_LET_PASSERSBY, src/sim/police/api.ts : l'interface n'importe rien de src/sim).
 */
export const BARRAGE_LET_PASSERSBY = -2;

/** Libellé de l'option du barrage : « Passants : bloqués » (défaut) ou « Passants : laissés passer ». */
export function passersbyLabel(letPass: boolean): string {
  return letPass ? 'Passants : laissés passer' : 'Passants : bloqués';
}

/** Consigne de « Barrer la rue » selon l'option des passants. */
export function barrerHint(letPass: boolean): string {
  return letPass ? BARRER_HINT_PASSANTS : BARRER_HINT;
}

/** L'option « passants » vaut pour cet ordre (« Barrer la rue ») ? */
export function hasPassersbyOption(type: OrderType): boolean {
  return type === 'couper_circulation';
}

/** Consigne d'un verbe (palette, bandeau de la carte) avec l'option des passants de « Barrer la rue ». */
export function verbHint(v: OrderVerb, letPass: boolean): string {
  if (!hasPassersbyOption(v.type) || !v.hint.startsWith(BARRER_HINT)) return v.hint;
  return barrerHint(letPass) + v.hint.slice(BARRER_HINT.length);
}

/** targetId de l'ordre donné depuis la carte : l'option des passants pour « Barrer la rue », sinon `targetId`. */
export function barrageTargetId(type: OrderType, letPass: boolean, targetId = 0): number {
  return hasPassersbyOption(type) && targetId === 0 && letPass ? BARRAGE_LET_PASSERSBY : targetId;
}

export const ORDER_VERBS: readonly OrderVerb[] = [
  { type: 'tenir', label: 'Tenir la position', short: 'Tenir', group: 'posture', gesture: 'immediate', force: 1, coercive: false,
    hint: '', rule: '',
    plain: 'Tenir sa position', tag: 'TIENT', explain: 'Reste sur place, face à la menace.', doing: 'tient sa position' },
  { type: 'ligne', label: 'Ligne de barrage', short: 'Ligne', group: 'posture', gesture: 'line', force: 1, coercive: false,
    hint: 'Tracez la ligne d’un flanc à l’autre\u00a0: l’unité fait face du côté où le flanc gauche est à votre gauche.', rule: '',
    plain: 'Tenir une ligne ici', tag: 'EN LIGNE', explain: 'Ligne en travers, boucliers levés\u00a0; le jeu l’oriente et la dimensionne.', doing: 'tient une ligne' },
  { type: 'colonne', label: 'En file (à pied) vers…', short: 'En file', group: 'posture', gesture: 'point', force: 0, coercive: false,
    hint: 'Désignez le point à rejoindre à pied, en file.', rule: '',
    plain: 'Y aller', tag: 'VA À PIED', explain: 'Rejoint le point à pied, en file\u00a0; en véhicules au-delà de 250\u00a0m.', doing: 'va à pied' },
  // une unité envoyée sur une rue la barre d'une façade à l'autre : piétons, véhicules, dans les deux sens
  { type: 'couper_circulation', label: 'Barrer la rue', short: 'Barrer', group: 'posture', gesture: 'point', force: 1, coercive: false,
    hint: BARRER_HINT + '. Désignez la rue\u00a0: l’unité la barre d’une façade à l’autre.', rule: '',
    plain: 'Barrer la rue', tag: 'BARRE', explain: 'Personne ne passe, dans les deux sens.', doing: 'barre la rue' },
  { type: 'filtrer', label: 'Barrage filtrant', short: 'Filtrer', group: 'posture', gesture: 'point', force: 1, coercive: false,
    hint: 'Désignez la rue\u00a0: l’unité la barre en laissant une porte, les personnes sortent une à une.', rule: 'Issue de nasse\u00a0: annoncez-la à la foule.',
    plain: 'Barrage filtrant', tag: 'FILTRE', explain: 'Une porte\u00a0: les gens sortent un par un.', doing: 'filtre la rue' },
  { type: 'tortue', label: 'Tortue', short: 'Tortue', group: 'posture', gesture: 'immediate', force: 1, coercive: false,
    hint: '', rule: 'Boucliers de face et au-dessus des têtes\u00a0: aucun tir possible.',
    plain: 'Se protéger (tortue)', tag: 'TORTUE', explain: 'Boucliers devant et au-dessus contre les jets\u00a0; aucun tir possible.', doing: 'se protège (tortue)' },
  { type: 'avancer', label: 'Avancer jusqu’à…', short: 'Avancer', group: 'mouvement', gesture: 'point', force: 1, coercive: false,
    hint: 'Désignez le point à atteindre\u00a0; glissez pour fixer le cap à l’arrivée.', rule: '',
    plain: 'Avancer en formation jusqu’ici', tag: 'AVANCE', explain: 'Avance en ligne, prête au contact.', doing: 'avance en formation' },
  { type: 'bond_offensif', label: 'Bond offensif', short: 'Bond', group: 'mouvement', gesture: 'point', force: 1, coercive: true,
    hint: 'Désignez la limite du bond (20 à 40\u00a0m)\u00a0: arrêt net et réalignement.', rule: 'Sans rechercher le contact.',
    plain: 'Bond en avant (20 à 40\u00a0m)', tag: 'BOND', explain: 'Avance vite puis s’arrête net, sans chercher le contact.', doing: 'fait un bond en avant' },
  { type: 'charge', label: 'Charge', short: 'Charge', group: 'mouvement', gesture: 'point', force: 2, coercive: true,
    hint: 'Désignez la limite de la charge\u00a0: arrêt au sifflet, repli au pas.', rule: 'Après la dernière sommation, sauf violences contre l’unité.',
    plain: 'Charger', tag: 'CHARGE', explain: 'Course jusqu’au point, arrêt au sifflet (bâton).', doing: 'charge' },
  { type: 'refoulement', label: 'Vague de refoulement', short: 'Refouler', group: 'mouvement', gesture: 'point', force: 1, coercive: true,
    hint: 'Désignez la limite du refoulement\u00a0: par tronçons de 50\u00a0m, issue libre devant la foule.', rule: 'Après la dernière sommation\u00a0; une issue reste libre.',
    plain: 'Repousser la foule', tag: 'REPOUSSE', explain: 'Par bonds de 50\u00a0m, en lui laissant une sortie devant elle.', doing: 'repousse la foule' },
  // les deux ordres « me suivre », côte à côte : à pied, ou en colonne de véhicules (session/follow.ts)
  { type: 'suivre_pied', label: 'Me suivre à pied', short: 'À pied', group: 'mouvement', gesture: 'immediate', force: 0, coercive: false,
    hint: '', rule: 'Les unités désignées descendent de leurs véhicules s’il le faut et vous suivent à pied, en formation.',
    plain: 'Suivez-moi à pied', tag: 'ME SUIT À PIED', explain: 'Toute votre unité descend et vous suit à pied.', doing: 'vous suit à pied' },
  { type: 'avec_moi', label: 'Me suivre en colonne (véhicules)', short: 'En colonne', group: 'mouvement', gesture: 'immediate', force: 0, coercive: false,
    hint: '', rule: 'Les unités désignées remontent dans leurs véhicules, se rangent derrière le vôtre et le suivent, feux et sirène comme vous. Sans véhicule, elles vous suivent à pied.',
    plain: 'Suivez-moi en véhicules', tag: 'ME SUIT EN VÉHICULE', explain: 'Toute votre unité remonte et suit votre véhicule.', doing: 'vous suit en véhicules' },
  { type: 'faire_mouvement', label: 'Faire mouvement en véhicules vers…', short: 'Véhicules', group: 'mouvement', gesture: 'point', force: 0, coercive: false,
    hint: 'Désignez le point\u00a0: l’unité embarque (elle vous attend si vous en faites partie), roule en colonne, deux tons, et débarque sur place.', rule: 'Au-delà de 250\u00a0m, tout ordre de mouvement d’une unité qui a ses véhicules se fait ainsi.',
    plain: 'Y aller en véhicules', tag: 'VA EN VÉHICULE', explain: 'Embarque, deux-tons, débarque sur place.', doing: 'va en véhicules' },
  { type: 'repli', label: 'Repli', short: 'Repli', group: 'mouvement', gesture: 'point', force: 0, coercive: false,
    hint: 'Désignez la position de repli\u00a0: l’unité recule par échelons, face à la foule.', rule: '',
    plain: 'Se replier ici', tag: 'SE REPLIE', explain: 'Recule jusqu’au point, face à la foule.', doing: 'se replie' },
  { type: 'encercler', label: 'Encercler (nasse)', short: 'Nasse', group: 'manoeuvre', gesture: 'area', force: 1, coercive: true,
    hint: 'Posez le centre, puis glissez vers l’ISSUE à laisser ouverte\u00a0: la longueur du geste fixe le rayon.',
    rule: 'Règle\u00a0: une issue doit rester ouverte et annoncée. Un encerclement sans sortie est une faute.',
    plain: 'Encercler en cercle serré', tag: 'ENCERCLE', explain: 'Cercle autour de la foule, sortie laissée à l’opposé de vos unités.', doing: 'encercle la foule' },
  { type: 'disperser_gaz', label: 'Disperser au gaz', short: 'Gaz', group: 'manoeuvre', gesture: 'point', force: 3, coercive: true,
    hint: 'Désignez la zone à traiter\u00a0: vérifiez le vent avant de valider.', rule: 'Gaz lacrymogène\u00a0: seulement après la dernière sommation, et une fois le gaz autorisé.',
    plain: 'Disperser au gaz lacrymogène', tag: 'GAZ', explain: 'Vérifiez le vent\u00a0: sa flèche est dessinée sur l’aperçu.', doing: 'disperse au gaz lacrymogène' },
  { type: 'interpeller', label: 'Interpeller la cible', short: 'Interpeller', group: 'manoeuvre', gesture: 'target', force: 1, coercive: false,
    hint: 'Désignez la cible\u00a0: un incident «\u00a0suspect\u00a0» ou «\u00a0pillage\u00a0», ou le secteur où l’auteur a été vu.', rule: 'Sur fait constaté seulement.',
    plain: 'Interpeller ici', tag: 'INTERPELLE', explain: 'Arrête l’auteur de faits constatés.', doing: 'interpelle' },
  { type: 'degager_barricade', label: 'Dégager une barricade', short: 'Dégager', group: 'manoeuvre', gesture: 'target', force: 0, coercive: false,
    hint: 'Désignez la barricade à dégager.', rule: '',
    plain: 'Dégager une barricade', tag: 'DÉGAGE', explain: 'Une unité ou le blindé Centaure dégage la rue.', doing: 'dégage une barricade' },
  { type: 'degager_obstacle', label: 'Dégager l’obstacle (Centaure)', short: 'Obstacle', group: 'manoeuvre', gesture: 'point', force: 0, coercive: false,
    hint: 'Désignez le véhicule qui barre la voie\u00a0: le Centaure le pousse hors de la chaussée, à la lame, au pas.',
    rule: 'Personne à bord ni dans le couloir de poussée\u00a0: l’engin fait descendre, avertit et attend.',
    plain: 'Pousser un véhicule qui bloque (blindé Centaure)', tag: 'POUSSE UN VÉHICULE', explain: 'Le blindé Centaure pousse le véhicule hors de la chaussée.', doing: 'pousse un véhicule hors de la voie' },
  { type: 'proteger', label: 'Protéger', short: 'Protéger', group: 'appui', gesture: 'target', force: 0, coercive: false,
    hint: 'Désignez l’unité, le véhicule de secours ou le point à protéger.', rule: '',
    plain: 'Protéger une autre unité…', tag: 'PROTÈGE', explain: 'Se place pour la couvrir.', doing: 'protège' },
  { type: 'escorter', label: 'Escorter', short: 'Escorter', group: 'appui', gesture: 'target', force: 0, coercive: false,
    hint: 'Désignez l’unité ou le véhicule à escorter.', rule: '',
    plain: 'Escorter une autre unité…', tag: 'ESCORTE', explain: 'L’accompagne pendant son trajet.', doing: 'escorte' },
  { type: 'suivre', label: 'Suivre l’unité désignée…', short: 'Suivre', group: 'appui', gesture: 'target', force: 0, coercive: false,
    hint: 'Désignez l’unité à suivre.', rule: '',
    plain: 'Suivre une autre unité…', tag: 'SUIT', explain: 'Marche derrière elle.', doing: 'suit' },
  { type: 'embarquer', label: 'Embarquer', short: 'Embarquer', group: 'appui', gesture: 'immediate', force: 0, coercive: false,
    hint: '', rule: '',
    plain: 'Monter dans les véhicules', tag: 'MONTE', explain: 'L’unité remonte dans ses véhicules.', doing: 'monte dans les véhicules' },
  { type: 'debarquer', label: 'Débarquer', short: 'Débarquer', group: 'appui', gesture: 'immediate', force: 0, coercive: false,
    hint: '', rule: 'À 50\u00a0m au moins de la foule.',
    plain: 'Descendre des véhicules', tag: 'DESCEND', explain: 'À 50\u00a0m au moins de la foule.', doing: 'descend des véhicules' },
  { type: 'cesser', label: 'Cesser l’action', short: 'Cesser', group: 'fin', gesture: 'immediate', force: 0, coercive: false,
    hint: '', rule: '',
    plain: 'Arrêter l’action en cours', tag: 'ARRÊTE', explain: 'L’unité s’arrête et attend.', doing: 'attend' },
  { type: 'libre', label: 'Reprendre l’initiative', short: 'Libre', group: 'fin', gesture: 'immediate', force: 0, coercive: false,
    hint: '', rule: '',
    plain: 'Laisser agir seule', tag: 'SANS ORDRE', explain: 'Plus d’ordre\u00a0: l’unité réagit d’elle-même.', doing: 'sans ordre' },
];

/** Familles de « Plus… › Tous les ordres » (clés inchangées). */
export const ORDER_GROUP_LABELS: Readonly<Record<OrderGroup, string>> = {
  posture: 'Se placer', mouvement: 'Se déplacer', manoeuvre: 'Face à la foule', appui: 'Intervenir', fin: 'Fin d’action',
};

/**
 * Textes en clair des ordres que d'autres modules ajoutent à ORDER_VERBS (« Rentrer au commissariat », `retour_poste`,
 * ajouté par le module des commissariats) : les fiches et les étiquettes les emploient dès que le verbe existe.
 */
export const EXTRA_PLAIN: Readonly<Record<string, PlainWords>> = {
  retour_poste: {
    plain: 'Rentrer au commissariat', tag: 'RENTRE', explain: 'Retour sans deux-tons\u00a0; au repos puis de nouveau prête.',
    doing: 'rentre au commissariat',
  },
};

/** Étiquette de « Barrer la rue, passants admis » (targetId BARRAGE_LET_PASSERSBY). */
export const TAG_PASSERSBY = 'BARRE (PASSANTS)';

// index paresseux : un verbe ajouté plus tard à ORDER_VERBS (commissariats) est trouvé aussi
const BY_TYPE = new Map<string, OrderVerb>();
let indexed = 0;

export function verbOf(type: OrderType): OrderVerb | undefined {
  if (indexed !== ORDER_VERBS.length) {
    BY_TYPE.clear();
    for (let i = 0; i < ORDER_VERBS.length; i++) BY_TYPE.set(ORDER_VERBS[i]!.type, ORDER_VERBS[i]!);
    indexed = ORDER_VERBS.length;
  }
  return BY_TYPE.get(type);
}

/** Textes en clair d'un ordre (verbe du catalogue, sinon EXTRA_PLAIN), null s'il est inconnu. */
export function plainOf(type: OrderType): PlainWords | null {
  const v = verbOf(type);
  if (v) return v;
  return EXTRA_PLAIN[String(type)] ?? null;
}

/**
 * Étiquette d'un ordre pour la carte et les pastilles (« BARRE », « EN LIGNE »). `targetId` distingue « Barrer la rue,
 * passants admis ». Ordre inconnu : '' (jamais le type brut en majuscules).
 */
export function tagOf(type: OrderType, targetId = 0): string {
  if (type === 'couper_circulation' && targetId === BARRAGE_LET_PASSERSBY) return TAG_PASSERSBY;
  return plainOf(type)?.tag ?? '';
}

/**
 * Libellé français d'un ordre en cours, pour la pastille d'unité et les listes : l'étiquette en clair, en minuscules
 * avec une capitale (« En ligne », « Barre », « Sans ordre »). Ordre inconnu : « Ordre en cours ».
 */
export function orderLabel(type: OrderType): string {
  const tag = tagOf(type);
  if (tag === '') return 'Ordre en cours';
  const low = tag.toLocaleLowerCase('fr-FR');
  return low.charAt(0).toLocaleUpperCase('fr-FR') + low.slice(1);
}

/** Article devant un nom de voie ou de lieu : « la rue de Rivoli », « le boulevard Haussmann », « l’avenue Foch ». */
/** Mots qui ouvrent un nom de voie : écrits en minuscule au milieu d'une phrase (« barre la place de la Concorde »). */
const VOIE_WORDS: ReadonlySet<string> = new Set([
  'rue', 'avenue', 'boulevard', 'place', 'quai', 'pont', 'cours', 'passage', 'square', 'allée', 'impasse', 'esplanade', 'jardin', 'port',
  'parvis', 'carrefour', 'faubourg', 'villa', 'cité', 'galerie', 'chaussée', 'route', 'voie', 'rond-point', 'porte', 'sentier', 'promenade',
]);

export function withArticle(place: string): string {
  const p = place.trim();
  if (p === '') return p;
  const word = p.split(/\s+/)[0]!;
  const first = word.toLocaleLowerCase('fr-FR');
  if (/^(la|le|les|l’|l')$/.test(first) || /^(l’|l')/.test(first)) return p;
  // « Place de la Concorde » → « la place de la Concorde » (le nom propre garde ses majuscules)
  const body = VOIE_WORDS.has(first) ? first + p.slice(word.length) : p;
  if (/^[aeiouyhéèêàâîôû]/.test(first)) return 'l’' + body;
  const masc = new Set(['boulevard', 'quai', 'pont', 'cours', 'passage', 'carrefour', 'faubourg', 'square', 'parvis', 'rond-point', 'jardin', 'port', 'pont-neuf']);
  if (masc.has(first)) return 'le ' + body;
  return 'la ' + body;
}

/** Ordres dont l'activité porte sur une rue (« barre la rue de Rivoli »). */
const STREET_DOING: Readonly<Record<string, string>> = { couper_circulation: 'barre', filtrer: 'filtre' };

/**
 * Ce que fait une unité, avec le lieu, pour les lignes de suivi et l'en-tête de sa fiche : « Barre la rue de Rivoli »,
 * « Va à pied · place de la Concorde ». Sans lieu : l'activité seule (« Barre la rue »). Ordre inconnu : ''.
 */
export function doingAt(type: OrderType, place: string, targetId = 0): string {
  const w = plainOf(type);
  if (!w) return '';
  const p = place.trim();
  let text: string;
  const street = STREET_DOING[String(type)];
  if (street && p !== '') text = `${street} ${withArticle(p)}${type === 'couper_circulation' && targetId === BARRAGE_LET_PASSERSBY ? ', passants admis' : ''}`;
  else text = p !== '' ? `${w.doing} · ${p}` : w.doing;
  return text.charAt(0).toLocaleUpperCase('fr-FR') + text.slice(1);
}

/**
 * Niveaux de force dits en mots (jamais en chiffres à l'écran) : 0 aucune force … 4 grenades et lanceurs de balles.
 * Le niveau 5 (arme à feu) n'est jamais autorisé par l'interface ; il est nommé pour être complet.
 */
export const FORCE_WORDS: readonly string[] = [
  'aucune force', 'mains nues', 'bâton et gazeuse', 'gaz lacrymogène et canon à eau', 'grenades et lanceurs de balles (LBD)', 'arme à feu',
];

/** Mots d'un niveau de force (« mains nues ») ; borné à 0..5, jamais un chiffre. */
export function forceWord(level: number): string {
  const l = Number.isFinite(level) ? Math.max(0, Math.min(FORCE_WORDS.length - 1, Math.round(level))) : 0;
  return FORCE_WORDS[l]!;
}

/** Autorisation qui manque, en clair, pour les étapes légales (« autoriser le gaz »). */
const AUTHORIZE_WORDS: readonly string[] = [
  'autoriser l’emploi de la force', 'autoriser les mains nues', 'autoriser le bâton et la gazeuse', 'autoriser le gaz',
  'autoriser les grenades et les lanceurs de balles (LBD)', 'autoriser l’arme à feu',
];

/** « autoriser le gaz » pour le niveau 3 (étapes légales des fiches). */
export function authorizeWord(level: number): string {
  const l = Number.isFinite(level) ? Math.max(0, Math.min(AUTHORIZE_WORDS.length - 1, Math.round(level))) : 0;
  return AUTHORIZE_WORDS[l]!;
}

// ───────────────────────────── géométrie ─────────────────────────────

export interface OrderGeom {
  x: number;
  z: number;
  heading: number;
  width: number;
}

/** Longueur minimale d'un tracé pour valoir une ligne (m) ; en deçà, c'est un point. */
export const MIN_LINE = 3;
/** Front par agent en ligne serrée (m) : sert à borner les largeurs. */
export const FRONT_PER_AGENT = 0.7;

/**
 * Segment tracé de A vers B → ligne de barrage. A est le flanc GAUCHE de la formation, B son flanc
 * droit : l'unité fait face perpendiculairement, du côté où A est à sa gauche. Avec la convention du
 * jeu (cap h : avant = (sin h, cos h), droite = (−cos h, sin h)), tracer d'ouest en est fait face au nord.
 */
export function lineToOrder(ax: number, az: number, bx: number, bz: number, out: OrderGeom): OrderGeom {
  const dx = bx - ax;
  const dz = bz - az;
  const len = Math.hypot(dx, dz);
  out.x = (ax + bx) * 0.5;
  out.z = (az + bz) * 0.5;
  out.width = len;
  // droite = (dx, dz)/len = (−cos h, sin h)  ⇒  h = atan2(dz, −dx)
  out.heading = len > 1e-6 ? Math.atan2(dz, -dx) : 0;
  return out;
}

/** Extrémités (flanc gauche puis flanc droit) d'une ligne : inverse de lineToOrder. */
export function lineEnds(g: OrderGeom, out: { ax: number; az: number; bx: number; bz: number }): void {
  const rx = -Math.cos(g.heading);
  const rz = Math.sin(g.heading);
  const h = g.width * 0.5;
  out.ax = g.x - rx * h;
  out.az = g.z - rz * h;
  out.bx = g.x + rx * h;
  out.bz = g.z + rz * h;
}

/**
 * Partage une ligne entre plusieurs unités, de gauche à droite, au prorata de `weights` (effectifs).
 * Écrit `weights.length` tronçons jointifs dans `out` (objets réutilisés ou créés).
 */
export function splitLine(g: OrderGeom, weights: readonly number[], out: OrderGeom[]): OrderGeom[] {
  const n = weights.length;
  let total = 0;
  for (let i = 0; i < n; i++) total += weights[i]! > 0 ? weights[i]! : 0;
  const rx = -Math.cos(g.heading);
  const rz = Math.sin(g.heading);
  let cursor = -g.width * 0.5;
  for (let i = 0; i < n; i++) {
    const share = total > 0 ? (weights[i]! > 0 ? weights[i]! : 0) / total : 1 / n;
    const w = g.width * share;
    const mid = cursor + w * 0.5;
    let o = out[i];
    if (!o) {
      o = { x: 0, z: 0, heading: 0, width: 0 };
      out[i] = o;
    }
    o.x = g.x + rx * mid;
    o.z = g.z + rz * mid;
    o.heading = g.heading;
    o.width = w;
    cursor += w;
  }
  out.length = n;
  return out;
}

/**
 * Ordre des unités le long d'une ligne : celles qui sont déjà à gauche prennent les tronçons de
 * gauche (aucun croisement). Retourne les indices des unités, triés de gauche à droite.
 */
export function slotsAlongLine(g: OrderGeom, positions: readonly { x: number; z: number }[]): number[] {
  const rx = -Math.cos(g.heading);
  const rz = Math.sin(g.heading);
  const idx: number[] = [];
  for (let i = 0; i < positions.length; i++) idx.push(i);
  idx.sort((a, b) => {
    const pa = (positions[a]!.x - g.x) * rx + (positions[a]!.z - g.z) * rz;
    const pb = (positions[b]!.x - g.x) * rx + (positions[b]!.z - g.z) * rz;
    return pa - pb || a - b;
  });
  return idx;
}

/** Répartit `n` unités en rang, perpendiculairement au cap, autour d'un point (espacement en mètres). */
export function spreadPoint(x: number, z: number, heading: number, n: number, spacing: number, out: OrderGeom[]): OrderGeom[] {
  const rx = -Math.cos(heading);
  const rz = Math.sin(heading);
  for (let i = 0; i < n; i++) {
    const k = (i - (n - 1) / 2) * spacing;
    let o = out[i];
    if (!o) {
      o = { x: 0, z: 0, heading: 0, width: 0 };
      out[i] = o;
    }
    o.x = x + rx * k;
    o.z = z + rz * k;
    o.heading = heading;
    o.width = 0;
  }
  out.length = n;
  return out;
}

/**
 * Cap d'un ordre désignant un point : par défaut de l'unité vers le point ; pour un repli, l'unité
 * garde la face tournée vers l'endroit qu'elle quitte.
 */
export function pointHeading(type: OrderType, fromX: number, fromZ: number, x: number, z: number): number {
  const dx = x - fromX;
  const dz = z - fromZ;
  if (Math.hypot(dx, dz) < 1e-6) return 0;
  return type === 'repli' ? Math.atan2(-dx, -dz) : Math.atan2(dx, dz);
}

/** Geste de nasse : centre posé, glissé vers l'issue. Largeur = diamètre, cap = direction de l'issue. */
export function areaToOrder(cx: number, cz: number, px: number, pz: number, out: OrderGeom, minRadius = 8): OrderGeom {
  const dx = px - cx;
  const dz = pz - cz;
  const r = Math.max(minRadius, Math.hypot(dx, dz));
  out.x = cx;
  out.z = cz;
  out.width = r * 2;
  out.heading = Math.hypot(dx, dz) > 1e-6 ? Math.atan2(dx, dz) : 0;
  return out;
}
