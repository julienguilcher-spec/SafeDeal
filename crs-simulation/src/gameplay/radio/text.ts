/* =====================================================================================
 * Radio — mise en forme du texte : chiffres dits un par un, typographie française,
 * remplacement des paramètres sans jamais laisser d'accolade.
 * ===================================================================================== */

import type { PhraseParam } from './api';

const NBSP = ' ';

const DIGIT_WORDS = ['ZÉRO', 'UN', 'DEUX', 'TROIS', 'QUATRE', 'CINQ', 'SIX', 'SEPT', 'HUIT', 'NEUF'] as const;

/** Chiffres épelés, séparés par des traits d'union : « 45 » → « QUATRE-CINQ ». */
export function spokenDigits(digits: string): string {
  const out: string[] = [];
  for (let i = 0; i < digits.length; i++) {
    const c = digits.charCodeAt(i) - 48;
    out.push(c >= 0 && c <= 9 ? DIGIT_WORDS[c]! : digits[i]!);
  }
  return out.join('-');
}

/** Nombre dit à la radio : multiples exacts de mille en toutes lettres, cent, sinon chiffre par chiffre. */
export function spokenNumber(value: number): string {
  if (!Number.isFinite(value)) return DIGIT_WORDS[0];
  const n = Math.min(Math.abs(Math.round(value)), 999_999_999);
  if (n === 100) return 'CENT';
  if (n === 1000) return 'MILLE';
  if (n >= 2000 && n % 1000 === 0) return `${spokenNumber(n / 1000)} MILLE`;
  return spokenDigits(String(n));
}

/** Indicatif tel qu'on le prononce : chaque suite de chiffres est épelée, le reste en capitales. */
export function spokenCallsign(callsign: string): string {
  return callsign.toUpperCase().replace(/\d+/g, (run) => spokenDigits(run));
}

/**
 * Heure de la journée (0..24 décimal) dite à la radio : « UNE-SEPT heures ZÉRO-QUATRE ».
 * Devant « heures », le chiffre 1 s'accorde au féminin : « DEUX-UNE heures » (vingt et une heures).
 */
export function spokenTime(hours: number): string {
  const safe = Number.isFinite(hours) ? hours : 0;
  const total = Math.floor((((safe % 24) + 24) % 24) * 60 + 1e-6);
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  const hh = String(h).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  const hourWords = spokenDigits(hh).replace(/\bUN\b/g, 'UNE');
  return `${hourWords} heures ${spokenDigits(mm)}`;
}

/** Retire toute accolade d'une valeur fournie par l'appelant (aucune ne doit survivre dans un texte). */
export function stripBraces(value: string): string {
  return value.replace(/[{}]/g, '');
}

/** Valeur d'un paramètre en texte : nombres dits à la radio, accolades retirées, vide si absent. */
export function paramToText(value: PhraseParam): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return spokenNumber(value);
  return stripBraces(String(value)).trim();
}

/** Noms de paramètres attendus dans un gabarit : « {unite} » → « unite ». */
export function placeholdersOf(template: string): string[] {
  const out: string[] = [];
  const re = /\{([a-z_]+)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(template)) !== null) if (!out.includes(m[1]!)) out.push(m[1]!);
  return out;
}

/**
 * Noms que l'on accorde derrière « UN » ou « UNE » : singulier et genre (« UN mètres » → « UN mètre »,
 * « UN minutes » → « UNE minute »). Clé = pluriel écrit dans les gabarits, valeur = [singulier, féminin].
 */
const NOUNS_AFTER_ONE: ReadonlyMap<string, readonly [string, boolean]> = new Map<string, readonly [string, boolean]>([
  ['mètres', ['mètre', false]], ['agents', ['agent', false]], ['manifestants', ['manifestant', false]],
  ['individus', ['individu', false]], ['blessés', ['blessé', false]], ['interpellés', ['interpellé', false]],
  ['fourgons', ['fourgon', false]], ['groupes', ['groupe', false]], ['véhicules', ['véhicule', false]],
  ['litres', ['litre', false]], ['tirs', ['tir', false]], ['journalistes', ['journaliste', false]],
  ['binômes', ['binôme', false]], ['projectiles', ['projectile', false]], ['points', ['point', false]],
  ['foyers', ['foyer', false]], ['feux', ['feu', false]],
  ['personnes', ['personne', true]], ['sections', ['section', true]], ['minutes', ['minute', true]],
  ['grenades', ['grenade', true]], ['salves', ['salve', true]], ['motos', ['moto', true]],
  ['barricades', ['barricade', true]], ['stations', ['station', true]], ['issues', ['issue', true]],
  ['équipes', ['équipe', true]], ['victimes', ['victime', true]],
]);

function fixOne(text: string): string {
  return text.replace(/(^|[^\p{L}-])(UNE?) ([\p{L}]+)(?![\p{L}-])/gu, (all, pre: string, _one: string, noun: string) => {
    const entry = NOUNS_AFTER_ONE.get(noun);
    return entry ? `${pre}${entry[1] ? 'UNE' : 'UN'} ${entry[0]}` : all;
  });
}

/**
 * Typographie française : espaces insécables avant « ; : ! ? » et à l'intérieur des guillemets, apostrophe
 * typographique, espaces et ponctuations doublées nettoyées.
 */
export function typo(text: string): string {
  let t = text.replace(/[ \t\n\r]+/g, ' ');
  t = t.replace(/ +([,.])/g, '$1');
  t = t.replace(/([,;:])\s*([,;:.])(?=\s|$)/g, '$2');
  t = t.replace(/\.{2,}(?!\.)/g, '.').replace(/\.\s*\./g, '.');
  t = t.replace(/\s*([;:!?»])/g, `${NBSP}$1`);
  t = t.replace(/«\s*/g, `«${NBSP}`);
  t = t.replace(/(\p{L})'(\p{L})/gu, '$1’$2');
  t = t.replace(/ +/g, ' ').trim();
  // une ponctuation forte placée en tête de phrase n'a pas d'espace avant
  t = t.replace(/^ +/, '');
  return fixOne(t);
}

/** Première lettre en capitale. */
export function capitalize(text: string): string {
  return text.length === 0 ? text : text[0]!.toUpperCase() + text.slice(1);
}

/** Durée estimée de la diffusion d'un message (s) : appui + attente d'une seconde, puis débit radio. */
export function estimateDuration(text: string): number {
  const d = 1.0 + text.length / 13;
  return d < 2 ? 2 : d > 16 ? 16 : d;
}

/** Clé de comparaison pour l'anti-répétition : sans casse, sans accents, sans ponctuation. */
export function normalizeKey(from: string, text: string): string {
  const base = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  return `${from.toLowerCase()}|${base}`;
}
