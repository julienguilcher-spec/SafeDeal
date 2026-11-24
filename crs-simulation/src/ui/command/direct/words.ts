/* =====================================================================================
 * Ordres directs — LES MOTS (aucune logique de jeu) : la roue (F) avec ses numéros gardés, la couronne « Plus… »,
 * les formes courtes de la pastille du téléphone, les mots de chaque verbe dans les lignes d'état, les lignes fixes du
 * bloc d'ordres, la mise en forme des distances et des durées, et la table de largeur de police qui vérifie que les
 * formes courtes tiennent dans la pastille.
 *
 * Règle des numéros (un ancien réflexe « F puis N » ne tombe jamais sur un ordre coercitif) : 1 Avec moi (2 en est un
 * alias, non dessiné), 3 Envoyer, 4 Bloquer une rue, 5 Interpeller, 6 Disperser, 7 Secours ici, 8 Plus… ; dans
 * « Plus… », 1 à 8 inchangés, 9 Pousser un véhicule.
 *
 * Les mots du terrain sont ceux de la carte : Envoyer, Bloquer une rue, Disperser, Interpeller (intents.ts INTENTS),
 * les lignes de « Plus… » sont les libellés de la roue d'avant (orderWheel.ts MORE_RING).
 * ===================================================================================== */

import type { OrderType } from '@/core/contracts';
import type { IntentId } from '../cardTypes';
import type { DirectVerb } from './types';

// ───────────────────────────── distances, durées, lieux ─────────────────────────────

/** « 35 m », « 90 m », « 400 m », « 1,2 km » : au mètre près sous 20 m, à 5 m sous 100 m, à 10 m au-delà. */
export function distText(m: number): string {
  const d = Math.max(0, Number.isFinite(m) ? m : 0);
  if (d >= 1000) return `${(Math.round(d / 100) / 10).toFixed(1).replace('.', ',').replace(/,0$/, '')}\u00a0km`;
  const r = d < 20 ? Math.round(d) : d < 100 ? Math.round(d / 5) * 5 : Math.round(d / 10) * 10;
  return `${r}\u00a0m`;
}

/** « 5 s », « 40 s », « 1 min 10 », « 2 min » : à la seconde sous 1 min, aux 10 s au-delà. */
export function durationText(s: number): string {
  const t = Math.max(0, Math.ceil(Number.isFinite(s) ? s : 0));
  if (t < 60) return `${Math.max(1, t)}\u00a0s`;
  const tens = Math.round(t / 10) * 10;
  const min = Math.floor(tens / 60);
  const sec = tens - min * 60;
  return sec === 0 ? `${min}\u00a0min` : `${min}\u00a0min\u00a0${sec}`;
}

/** Mots de voie (premier mot d'un nom de rue) : en minuscule dans une phrase (« Bloquer la rue Saint-Gilles »). */
const VOIE_WORDS: ReadonlySet<string> = new Set([
  'rue', 'avenue', 'boulevard', 'place', 'quai', 'pont', 'cours', 'passage', 'square', 'allée', 'impasse', 'esplanade', 'jardin', 'port',
  'parvis', 'carrefour', 'faubourg', 'villa', 'cité', 'galerie', 'chaussée', 'route', 'voie', 'rond-point', 'porte', 'sentier', 'promenade',
  'terrasse', 'mail', 'parc', 'escalier', 'tunnel', 'souterrain', 'secteur', 'square',
]);
const MASCULINE: ReadonlySet<string> = new Set([
  'boulevard', 'quai', 'pont', 'cours', 'passage', 'carrefour', 'faubourg', 'square', 'parvis', 'rond-point', 'jardin', 'port', 'secteur',
  'mail', 'parc', 'escalier', 'tunnel', 'souterrain', 'sentier',
]);

/** Nom de lieu sans article, mot de voie en minuscule : « Rue Saint-Gilles » → « rue Saint-Gilles ». */
export function placeBare(place: string): string {
  let p = place.trim().replace(/^(la|le|les)\s+/i, '').replace(/^l[’']/i, '');
  const word = p.split(/\s+/)[0] ?? '';
  const first = word.toLocaleLowerCase('fr-FR');
  if (VOIE_WORDS.has(first)) p = first + p.slice(word.length);
  return p;
}

/** Article défini devant le lieu : « la rue Saint-Gilles », « le carrefour Voltaire », « l’avenue Foch ». */
export function placeWithArticle(place: string): string {
  const p = placeBare(place);
  if (p === '') return p;
  const first = (p.split(/\s+/)[0] ?? '').toLocaleLowerCase('fr-FR');
  if (!VOIE_WORDS.has(first)) return p;
  if (/^[aeiouyhéèêàâîôû]/.test(first)) return 'l’' + p;
  return (MASCULINE.has(first) ? 'le ' : 'la ') + p;
}

/** « au carrefour Voltaire », « à la rue de Rivoli », « à l’avenue Foch » ; un nom sans mot de voie : « à Bastille ». */
export function atPlace(place: string): string {
  const a = placeWithArticle(place);
  if (a === '') return 'au point';
  if (a.startsWith('le ')) return 'au ' + a.slice(3);
  return 'à ' + a;
}

// ───────────────────────────── auteurs ─────────────────────────────

/** Désignation d'un auteur d'après son infraction constatée (« Interpeller le lanceur de projectile »). */
export const OFFENDER_WORDS: Readonly<Record<string, string>> = {
  jet_projectile: 'le lanceur de projectile',
  violence_agent: 'l’auteur de violences sur un policier',
  degradation: 'le casseur',
  tag: 'l’auteur du tag',
  incendie: 'l’incendiaire',
  pillage: 'le pilleur',
  recel: 'le receleur',
  barricade: 'l’auteur de la barricade',
  port_arme: 'le porteur d’arme',
  rebellion: 'l’auteur de la rébellion',
  outrage: 'l’auteur de l’outrage',
  entrave_circulation: 'l’auteur de l’entrave',
  violence: 'l’auteur de violences',
  intrusion: 'l’intrus',
  attroupement_apres_sommations: 'le manifestant resté après les sommations',
  dissimulation_visage: 'le manifestant au visage dissimulé',
};

/** « le lanceur de projectile » ; infraction inconnue : « l’auteur des faits ». */
export function offenderWords(type: string): string {
  return OFFENDER_WORDS[type] ?? 'l’auteur des faits';
}

// ───────────────────────────── verbes ─────────────────────────────

/** Mots d'un verbe : libellé (lignes d'état, carte), forme courte (pastille), ce que fait l'unité, ce qui est fait. */
export interface VerbWords {
  /** « Bloquer », « Envoyer », « Interpeller » : mot de l'intention de la carte. */
  label: string;
  /** Ligne 1 de la pastille (≤ 14 caractères, liste fixe). */
  short: string;
  /** Ce que fait l'unité ensuite (« barre », « tient sa position »), devant le lieu s'il y en a un. */
  doing: string;
  /** Ce qui est fait (« barrée », « interpellé ») pour « ✓ ». */
  done: string;
}

export const VERB_WORDS: Readonly<Record<DirectVerb, VerbWords>> = {
  avec_moi: { label: 'Avec moi', short: 'Avec moi', doing: 'avec vous', done: 'avec vous' },
  envoyer: { label: 'Envoyer', short: 'Envoyer', doing: 'va', done: 'sur le point' },
  bloquer: { label: 'Bloquer', short: 'Bloquer la rue', doing: 'barre', done: 'barrée' },
  face_foule: { label: 'Face à la foule', short: 'Face à la foule', doing: 'en ligne face à la foule', done: 'en ligne face à la foule' },
  interpeller: { label: 'Interpeller', short: 'Interpeller', doing: 'interpelle', done: 'interpellé' },
  constater: { label: 'Aller constater', short: 'Aller constater', doing: 'surveille', done: 'sur place' },
  disperser: { label: 'Disperser', short: 'Disperser', doing: 'repousse la foule', done: 'foule repoussée' },
  secours: { label: 'Secours ici', short: 'Secours ici', doing: 'porte secours', done: 'secours sur place' },
  pousser: { label: 'Pousser un véhicule', short: 'Pousser', doing: 'pousse un véhicule', done: 'véhicule poussé' },
  tenir: { label: 'Tenir sa position', short: 'Tenir', doing: 'tient sa position', done: 'tient sa position' },
  cesser: { label: 'Arrêter l’action', short: 'Arrêter', doing: 'attend vos ordres', done: 'arrêtée' },
  repli: { label: 'Se replier', short: 'Se replier', doing: 'se replie', done: 'repliée' },
  bond: { label: 'Bond en avant', short: 'Bond en avant', doing: 'fait un bond en avant', done: 'bond effectué' },
  charge: { label: 'Charger', short: 'Charger', doing: 'charge', done: 'charge terminée' },
  gaz: { label: 'Disperser au gaz', short: 'Gaz', doing: 'disperse au gaz', done: 'gaz lancé' },
  libre: { label: 'Laisser agir seuls', short: 'Agir seuls', doing: 'agissent seuls', done: 'agissent seuls' },
  tortue: { label: 'Se protéger (tortue)', short: 'Tortue', doing: 'en tortue', done: 'tortue formée' },
  encercler: { label: 'Encercler (nasse)', short: 'Encercler', doing: 'encercle la foule', done: 'nasse fermée' },
  confier: { label: 'Confier', short: 'Confier', doing: 'prend l’interpellé', done: 'interpellé confié' },
  remettre: { label: 'Remettre', short: 'Remettre', doing: 'reçoit l’interpellé', done: 'interpellé remis' },
  emmener: { label: 'Emmener', short: 'Emmener', doing: 'emmène l’interpellé', done: 'interpellé remis' },
  faire_venir: { label: 'Faire venir', short: 'Faire venir', doing: 'vient vous chercher', done: 'arrivé' },
  partir: { label: 'Partir au commissariat', short: 'Partir', doing: 'part au commissariat', done: 'parti au commissariat' },
  venir: { label: 'Venir ici', short: 'Venir ici', doing: 'vient vers vous', done: 'arrivé' },
  rien: { label: '', short: '', doing: '', done: '' },
};

/** Verbes que l'ordre prêt ne donne jamais (coercitifs : choix délibéré, Maj+Entrée ou la roue). */
export const COERCIVE_VERBS: ReadonlySet<DirectVerb> = new Set<DirectVerb>(['disperser', 'charge', 'gaz', 'bond', 'encercler']);

/** Formes courtes permises sur la pastille (liste fixe du §1.6), dans cet ordre. */
export const PILL_SHORT_FORMS: readonly string[] = [
  'Bloquer la rue', 'Face à la foule', 'Envoyer', 'Interpeller', 'Avec moi', 'Secours ici', 'Confier', 'Remettre', 'Emmener',
  'Faire venir', 'Partir',
];

// ───────────────────────────── lignes fixes du bloc d'ordres ─────────────────────────────

/** Ligne grise quand rien n'est désigné (règle i) : aucun ordre ne part. */
export const NOTHING_LINE = 'Visez une rue, une personne ou la foule — A\u00a0: tout le monde avec vous';
/** Ligne des touches (5 premiers ordres, puis après 6 s sans ordre). */
export const KEY_LINE = 'A avec moi · U autre unité · F tous les ordres · Tab carte';
/** Remplace la ligne des touches pendant 5 s après un ordre. */
export const UNDO_HINT = '⌫ annuler';
/** Ligne « Secours ici » du bloc (toujours visible). */
export const RESCUE_LINE = 'Secours ici';
export const RESCUE_LINE_KEYS = 'F puis 7';
/** Bouton d'annulation au toucher (puce d'état, 5 s). */
export function undoButtonText(who: string, verb: string): string {
  return `↶ Annuler — ${who} · ${verb}`;
}
/** Préfixes de touche des deux lignes d'ordre (labels.ts les remplace par la touche réelle quand elle est remappée). */
export const KEY_GO = 'Entrée';
export const KEY_OTHER = 'Maj+Entrée';

/** « Entrée  Bloquer la rue Saint-Gilles · MISTRAL 1 · 90 m ». */
export function keyedLine(key: string, text: string): string {
  return `${key} ${text}`;
}

// ───────────────────────────── interpellés et fourgons cellulaires (§5) ─────────────────────────────

/** « fourgon cellulaire 1 » d'après l'indicatif radio « CELLULAIRE 1 » (l'écran ne dit jamais « CELLULAIRE » seul). */
export function vanWords(callsign: string): string {
  const rest = callsign.replace(/^\s*(fourgon\s+)?cellulaire\s*/i, '').trim();
  return rest === '' ? 'fourgon cellulaire' : `fourgon cellulaire ${rest}`;
}

/** Étiquette d'un fourgon dans le monde et sur les cartes : la première fois, ce qu'il est ; ensuite, sa charge. */
export function vanLabelText(callsign: string, detainees: number, seats: number, firstTime: boolean): string {
  if (detainees >= seats && seats > 0) return 'COMPLET — part au commissariat';
  if (firstTime) return `${capitalize(vanWords(callsign))} — pour les interpellés`;
  return `${callsign} · ${detainees}/${seats}`;
}

function capitalize(s: string): string {
  return s === '' ? s : s.charAt(0).toLocaleUpperCase('fr-FR') + s.slice(1);
}

/** Ligne au centre de l'écran juste après la palpation : ce qu'il peut faire de l'interpellé, en clair. */
export const DETAINEE_GUIDANCE = {
  confier: (pair: string, d: number): string => `Interpellé. E\u00a0: le confier à ${pair} (${distText(d)})`,
  emmener: (van: string, d: number): string => `Interpellé. E\u00a0: l’emmener au ${vanWords(van)} (${distText(d)}, flèche)`,
  faireVenir: (van: string, d: number): string => `Interpellé. E\u00a0: faire venir le ${vanWords(van)} (${distText(d)})`,
} as const;

/** Messages et lignes du parcours de l'interpellé (HUD, carte « Ma mission », radio). */
export const CUSTODY_TEXTS = {
  vanComing: (van: string, eta: number): string => `${capitalize(vanWords(van))} vient vous chercher — ${durationText(eta)}`,
  takeToVan: (van: string, d: number): string => `Emmenez l’interpellé au ${vanWords(van)} — ${distText(d)}`,
  confided: (pair: string): string => `Interpellé confié à ${pair}`,
  vanRequested: (eta: number, car: number): string => `Fourgon cellulaire demandé — ${durationText(eta)}\u00a0; ou ramenez-le à la voiture (${distText(car)})`,
  radioLed: (van: string): string => `Un interpellé conduit au ${van}`,
  radioAboard: (van: string): string => `UN interpellé à bord du ${van}, en attente de transfert`,
  departs: (van: string, station: string, n: number, next: string, eta: number): string =>
    `${van} part au ${station} avec ${n} interpellé${n > 1 ? 's' : ''}. ${next} prend la remise dans ${durationText(eta)}.`,
  waitsForNext: (van: string, nextNumber: string, eta: number): string => `${capitalize(vanWords(van))} complet — part dès que le ${nextNumber} arrive (${durationText(eta)})`,
  noVanFor: (eta: number): string => `Plus de fourgon sur place pendant ${durationText(eta)}`,
  waitingVan: 'Interpellé en attente du fourgon',
  /** Ligne du bloc d'état du commandant ou du chef de section, dès la première interpellation. */
  stateLine: (total: number, van: string, inVan: number, seats: number, atStation: number): string =>
    `Interpellés ${total} · ${van} ${inVan}/${seats} · ${atStation} au commissariat`,
} as const;

/** Le joueur est passager du véhicule de son unité, à qui il ordonne une action à pied. */
export function ownUnitAboardText(unit: string): string {
  return `${unit} descend — vous êtes à bord\u00a0: E pour descendre`;
}

// ───────────────────────────── la roue (F) ─────────────────────────────

export type DirectSectorAction = DirectVerb | 'plus' | 'pompiers' | 'samu';

export interface DirectSector {
  /** Numéro imprimé, et touche qui le choisit (1…9). */
  key: number;
  label: string;
  sub: string;
  action: DirectSectorAction;
  /** Intention de la carte dont le secteur prend la ligne de fiche (null : ordre direct ou couronne). */
  intent: IntentId | null;
  /** Ordres (SquadOrder.type) que ce secteur peut donner. */
  orders: readonly OrderType[];
  /** Ordre de force collective (grisé tant que la loi ne le permet pas). */
  coercive: boolean;
  ring?: readonly DirectSector[];
}

/** Couronne « Secours ici » (inchangée). */
export const DIRECT_RESCUE_RING: readonly DirectSector[] = [
  { key: 1, label: 'Pompiers ici', sub: 'à votre position', action: 'pompiers', intent: null, orders: [], coercive: false },
  { key: 2, label: 'SAMU ici', sub: 'à votre position', action: 'samu', intent: null, orders: [], coercive: false },
];

/** Couronne « Plus… » : les numéros 1 à 8 d'avant, et 9 « Pousser un véhicule » (le Centaure). */
export const DIRECT_MORE_RING: readonly DirectSector[] = [
  { key: 1, label: 'Se replier', sub: '30\u00a0m en arrière', action: 'repli', intent: null, orders: ['repli'], coercive: false },
  { key: 2, label: 'Bond en avant', sub: 'au point visé', action: 'bond', intent: null, orders: ['bond_offensif'], coercive: true },
  { key: 3, label: 'Charger', sub: 'au point visé', action: 'charge', intent: null, orders: ['charge'], coercive: true },
  { key: 4, label: 'Disperser au gaz', sub: 'au point visé', action: 'gaz', intent: null, orders: ['disperser_gaz'], coercive: true },
  { key: 5, label: 'Tenir sa position', sub: 'sur place', action: 'tenir', intent: null, orders: ['tenir'], coercive: false },
  { key: 6, label: 'Arrêter l’action', sub: 'on s’arrête', action: 'cesser', intent: null, orders: ['cesser'], coercive: false },
  { key: 7, label: 'Laisser agir seuls', sub: 'sans ordre', action: 'libre', intent: null, orders: ['libre'], coercive: false },
  { key: 8, label: 'Se protéger (tortue)', sub: 'boucliers', action: 'tortue', intent: null, orders: ['tortue'], coercive: false },
  { key: 9, label: 'Pousser un véhicule', sub: 'le blindé Centaure, au point visé', action: 'pousser', intent: null, orders: ['degager_obstacle'], coercive: false },
];

/** Roue de ceux qui commandent : sept secteurs (1, 3 à 8), le 2 est un alias du 1. */
export const DIRECT_WHEEL: readonly DirectSector[] = [
  { key: 1, label: 'Avec moi', sub: 'reviennent et vous suivent', action: 'avec_moi', intent: null, orders: ['suivre', 'suivre_pied', 'avec_moi'], coercive: false },
  { key: 3, label: 'Envoyer', sub: 'y aller, au point visé', action: 'envoyer', intent: 'envoyer', orders: ['colonne', 'avancer', 'faire_mouvement'], coercive: false },
  { key: 4, label: 'Bloquer une rue', sub: 'la rue visée, toute sa largeur', action: 'bloquer', intent: 'bloquer', orders: ['couper_circulation', 'ligne'], coercive: false },
  { key: 5, label: 'Interpeller', sub: 'la personne visée', action: 'interpeller', intent: 'interpeller', orders: ['interpeller'], coercive: false },
  { key: 6, label: 'Disperser', sub: 'repousser la foule visée', action: 'disperser', intent: 'disperser', orders: ['refoulement'], coercive: true },
  { key: 7, label: 'Secours ici', sub: 'pompiers, SAMU', action: 'secours', intent: 'secours', orders: [], coercive: false, ring: DIRECT_RESCUE_RING },
  { key: 8, label: 'Plus…', sub: 'tenir, repli, charge, gaz…', action: 'plus', intent: null, orders: [], coercive: false, ring: DIRECT_MORE_RING },
];

/** Roue en lecture seule (CRS, équipage d'engin…) : Avec moi (1, et 2 en alias) et Secours ici (7). */
export const DIRECT_FOLLOW_WHEEL: readonly DirectSector[] = DIRECT_WHEEL.filter((w) => w.key === 1 || w.key === 7);

/** Chiffres non dessinés qui choisissent un autre secteur (« F puis 2 » : l'ancien « Suivez-moi en véhicules »). */
export const DIGIT_ALIASES: Readonly<Record<number, number>> = { 2: 1 };

/** Secteur d'un chiffre tapé (alias compris), null si aucun. */
export function sectorForDigit(sectors: readonly DirectSector[], digit: number, aliases: Readonly<Record<number, number>> = DIGIT_ALIASES): DirectSector | null {
  const direct = sectors.find((s) => s.key === digit);
  if (direct) return direct;
  const alias = aliases[digit];
  return alias !== undefined ? sectors.find((s) => s.key === alias) ?? null : null;
}

// ───────────────────────────── largeur des textes (pastille du téléphone) ─────────────────────────────

/** Largeurs Helvetica / Arial (millièmes de cadratin) : gras et normal. Lettres accentuées : la lettre de base. */
const BOLD: Readonly<Record<string, number>> = {
  ' ': 278, a: 556, b: 611, c: 556, d: 611, e: 556, f: 333, g: 611, h: 611, i: 278, j: 278, k: 556, l: 278, m: 889, n: 611, o: 611,
  p: 611, q: 611, r: 389, s: 556, t: 333, u: 611, v: 556, w: 778, x: 556, y: 556, z: 500,
  A: 722, B: 722, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 556, K: 722, L: 611, M: 833, N: 722, O: 778, P: 667,
  Q: 778, R: 722, S: 667, T: 611, U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611,
  '.': 278, ',': 278, '·': 278, '-': 333, '’': 278, '\'': 238, ':': 333, '…': 1000, '(': 333, ')': 333, '/': 278, '\u00a0': 278,
};
const REGULAR: Readonly<Record<string, number>> = {
  ' ': 278, a: 556, b: 556, c: 500, d: 556, e: 556, f: 278, g: 556, h: 556, i: 222, j: 222, k: 500, l: 222, m: 833, n: 556, o: 556,
  p: 556, q: 556, r: 333, s: 500, t: 278, u: 556, v: 500, w: 722, x: 500, y: 500, z: 500,
  A: 667, B: 667, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 500, K: 667, L: 556, M: 833, N: 722, O: 778, P: 667,
  Q: 778, R: 722, S: 667, T: 611, U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611,
  '.': 278, ',': 278, '·': 278, '-': 333, '’': 222, '\'': 191, ':': 278, '…': 1000, '(': 333, ')': 333, '/': 278, '\u00a0': 278,
};

/** Largeur (px) d'un texte à `sizePx`, gras ou non ; un chiffre vaut 556 ; un signe inconnu, 611 (prudent). */
export function textWidthPx(text: string, sizePx: number, bold: boolean): number {
  const table = bold ? BOLD : REGULAR;
  let w = 0;
  for (const ch of text) {
    let v = table[ch];
    if (v === undefined) {
      if (ch >= '0' && ch <= '9') v = 556;
      else {
        const base = ch.normalize('NFD').charAt(0);
        v = table[base] ?? 611;
      }
    }
    w += v;
  }
  return (w * sizePx) / 1000;
}

/** Pastille « Ordre prêt » (§1.6) : 128 px de large à l'échelle 1, 8 px de marge de chaque côté. */
export const PILL_WIDTH = 128;
export const PILL_PAD = 8;
export const PILL_VERB_PX = 15;
export const PILL_WHO_PX = 11.5;

/** La forme courte tient-elle sur la ligne 1 de la pastille à cette échelle ? */
export function fitsPill(text: string, scale: number): boolean {
  return textWidthPx(text, PILL_VERB_PX * scale, true) <= (PILL_WIDTH - 2 * PILL_PAD) * scale;
}

/**
 * Ligne 2 de la pastille : « MISTRAL 1 · 90 m » ; quand elle déborde, l'indicatif est raccourci (« FAUCON… · 400 m »),
 * jamais la distance.
 */
export function pillWhoText(name: string, distance: number | null, scale = 1): string {
  const tail = distance === null ? '' : ` · ${distText(distance)}`;
  const max = (PILL_WIDTH - 2 * PILL_PAD) * scale;
  const px = PILL_WHO_PX * scale;
  if (textWidthPx(name + tail, px, false) <= max) return name + tail;
  let n = name;
  while (n.length > 1 && textWidthPx(n + '…' + tail, px, false) > max) n = n.slice(0, -1).trimEnd();
  return n + '…' + tail;
}
