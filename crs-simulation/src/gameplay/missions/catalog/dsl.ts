/* =====================================================================================
 * CRS SIMULATION FRANCE — Catalogue de missions : petit langage de description
 * -------------------------------------------------------------------------------------
 * Les fichiers de rôle écrivent leurs missions avec ces assistants, qui produisent des
 * objets MissionDef strictement conformes à missions-schema.ts. Aucune logique de jeu ici :
 * uniquement de la mise en forme (typographie française, valeurs par défaut, raccourcis).
 * ===================================================================================== */

import type { DurationPreset, PlayableRole, PolicePoste, PoliceRank, ProtestProfile, WeatherKind } from '../../../core/contracts';
import type {
  FailureKind, MissionCrowd, MissionDef, MissionFailure, MissionForces, MissionIntel, MissionObjective,
  MissionPhase, MissionRadioLine, MissionType, ObjectiveKind, PhaseTrigger,
} from '../../../core/missions-schema';

/** Causes admises pour la foule (identifiants du BRIEF) ; la chaîne vide désigne l'absence de revendication. */
export const CAUSES = [
  '', 'pouvoir_achat', 'retraites', 'climat', 'logement', 'hopital', 'education', 'agricole', 'carburants',
  'libertes', 'culture',
] as const;

/** Familles visuelles admises pour la foule. */
export const FAMILIES = [
  'gilets_jaunes', 'syndical', 'etudiants', 'lyceens', 'climat', 'soignants', 'agriculteurs', 'retraites', 'familles',
  'supporters', 'fetards', 'black_bloc', 'riverains', 'militants', 'curieux',
] as const;

/* ------------------------------------------------------------------ typographie française */

const NBSP = ' ';

/** Typographie française : espaces insécables avant « ; : ! ? » et dans les guillemets, apostrophe courbe. */
export function typo(s: string): string {
  return s
    .replace(/[  ]+([;:!?»])/g, `${NBSP}$1`)
    .replace(/«[  ]+/g, `«${NBSP}`)
    .replace(/(\d) (h|min|km|m|s|mm|%)(?![\p{L}])/gu, `$1${NBSP}$2`)
    .replace(/'/g, '’');
}

/* ------------------------------------------------------------------ voix et radio */

/**
 * Indicatifs radio des forces de l'ordre et des secours (bible de réalisme, E.5 ; tous fictifs).
 * Une ligne dont l'émetteur est un indicatif est un message RADIO et suit la procédure
 * « APPELÉ ICI APPELANT. Corps du message. PARLEZ / TERMINÉ ». Tout autre émetteur (AMI, RÉDACTION,
 * HAUT-PARLEUR, MONITEUR, VOUS…) est une VOIX entendue sur place ou au téléphone : français courant,
 * sans procédure radio. Un manifestant, un journaliste ou un médecin bénévole n'ont pas de poste radio.
 */
const INDICATIF = /^(CENTRAL|LIAISON|ICARE|(MISTRAL|TRAMONTANE|SIROCCO|ZÉPHYR)( [1-4]( (ALFA|BRAVO|CHARLIE))?)?|ÉPERVIER( [1-4])?|FAUCON [1-3]|NEPTUNE 1|CENTAURE 1|SANTÉ [1-9]|SAPEUR [1-9])$/;

const CHIFFRES = ['ZÉRO', 'UN', 'DEUX', 'TROIS', 'QUATRE', 'CINQ', 'SIX', 'SEPT', 'HUIT', 'NEUF'] as const;

/** Vrai si l'émetteur est un indicatif radio (police, gendarmerie, secours), faux si c'est une voix. */
export function isRadioCallsign(from: string): boolean {
  return INDICATIF.test(from);
}

/** Forme parlée d'un indicatif : « MISTRAL 2 BRAVO » se dit « MISTRAL DEUX BRAVO ». */
export function spokenCallsign(from: string): string {
  return from.replace(/\d/g, (d) => CHIFFRES[Number(d)] ?? d);
}

/**
 * Texte réglementaire de l'annonce et des sommations (article R. 211-11 du code de la sécurité intérieure,
 * version du 5 mai 2021 ; bible A.1). À reproduire mot pour mot : ne jamais les paraphraser dans une mission.
 */
export const SOMMATIONS = {
  annonce: 'Attention ! Attention ! Vous participez à un attroupement. Obéissance à la loi. Vous devez vous disperser et quitter les lieux.',
  premiere: 'Première sommation : nous allons faire usage de la force. Quittez immédiatement les lieux.',
  derniere: 'Dernière sommation : nous allons faire usage de la force. Quittez immédiatement les lieux.',
} as const;

/** Fin d'un message radio : P = PARLEZ (réponse attendue), T = TERMINÉ, A = FAITES L'APERÇU, C = COLLATIONNEZ. */
export type RadioEnd = 'P' | 'T' | 'A' | 'C';

const FINS_RADIO: Record<RadioEnd, string> = { P: 'PARLEZ.', T: 'TERMINÉ.', A: 'FAITES L\'APERÇU.', C: 'COLLATIONNEZ.' };

/**
 * Message RADIO en procédure (bible E.6) : « APPELÉ ICI APPELANT. Corps du message. PARLEZ. »
 * `from` est l'indicatif de l'émetteur, `to` celui du ou des appelés (« MISTRAL 1 À 4 », « À TOUS ») ; les chiffres
 * des indicatifs sont dits un par un. Dans le corps, les nombres s'écrivent déjà épelés (« TROIS-ZÉRO mètres »).
 * Un message placé au début d'une phase est un message REÇU par le personnage incarné : ordre, renseignement ou
 * demande. Il n'annonce jamais le résultat d'une action qui dépend de lui, sauf si la phase s'ouvre précisément
 * parce qu'un objectif vient d'être atteint (déclencheur OBJ de la phase précédente).
 */
export function rad(from: string, to: string, body: string, end: RadioEnd = 'P'): [string, string] {
  return [from, `${spokenCallsign(to)} ICI ${spokenCallsign(from)}. ${body.trim()} ${FINS_RADIO[end]}`];
}

/**
 * VOIX entendue sur place ou au téléphone (chef de groupe à la voix, mégaphone du cortège, ami, rédaction, blessé…) :
 * français courant, sans procédure radio. `who` s'écrit en capitales (« CHEF DE GROUPE », « MÉGAPHONE »).
 */
export function voix(who: string, text: string): [string, string] {
  return [who, text.trim()];
}

/* ------------------------------------------------------------------ déclencheurs de phase */

/** Passage à la phase suivante après un délai (secondes de jeu). */
export const T = (seconds: number): PhaseTrigger => ({ kind: 'temps', seconds });
/** Passage quand la tension de la foule dépasse un seuil. */
export const TENS = (above: number): PhaseTrigger => ({ kind: 'tension', above });
/** Passage quand la foule entre dans la phase indiquée (CrowdPhase). */
export const FOULE = (phase: string): PhaseTrigger => ({ kind: 'phase_foule', phase });
/** Passage quand l'objectif indiqué est atteint. */
export const OBJ = (id: string): PhaseTrigger => ({ kind: 'objectif', id });
/** Dernière phase : dure jusqu'à la fin de la mission. */
export const FIN: PhaseTrigger = { kind: 'fin' };

/* ------------------------------------------------------------------ éléments */

/**
 * Phase : titre, texte, condition de passage, messages [émetteur, texte], aléas imposés.
 * L'émetteur est soit un indicatif radio (message en procédure radio), soit une voix (voir isRadioCallsign).
 */
export function ph(
  id: string, title: string, text: string, until: PhaseTrigger, radio: Array<[string, string]>, events: string[] = [],
): MissionPhase {
  const lines: MissionRadioLine[] = radio.map(([from, t]) => ({ from, text: typo(t) }));
  return { id, title: typo(title), text: typo(text), until, radio: lines, events: events.map(typo) };
}

type ObjExtra = Partial<Pick<MissionObjective, 'place' | 'target' | 'count' | 'seconds' | 'max'>>;

/** Objectif principal. */
export function ob(id: string, text: string, kind: ObjectiveKind, extra: ObjExtra = {}): MissionObjective {
  return { id, text: typo(text), kind, secondary: false, ...extra };
}
/** Objectif secondaire. */
export function os(id: string, text: string, kind: ObjectiveKind, extra: ObjExtra = {}): MissionObjective {
  return { id, text: typo(text), kind, secondary: true, ...extra };
}

/** Condition d'échec. */
export function fail(kind: FailureKind, text: string, value?: number): MissionFailure {
  return value === undefined ? { kind, text: typo(text) } : { kind, text: typo(text), value };
}

/** Moyens engagés (tout ce qui n'est pas cité vaut zéro). */
export function forces(p: Partial<MissionForces> = {}): MissionForces {
  return {
    sections: 0, fourgons: 0, pelotons: 0, centaure: 0, canonEau: 0, bravm: 0, drone: false, pompiers: 0, samu: 0,
    ...p,
  };
}

/** Foule : effectif, cause, tension, propension à dégénérer, part de radicaux, familles, parcours, part du métro. */
export function crowd(
  size: number, cause: string, tension: number, volatility: number, radicalShare: number,
  families: Record<string, number>, route: string[], metroShare: number,
): MissionCrowd {
  return { size, cause, tension, volatility, radicalShare, families, route, metroShare };
}

/** Note de renseignement. */
export function intel(expected: string, radicals: string, hotspots: string[], advice: string[]): MissionIntel {
  return { expected: typo(expected), radicals: typo(radicals), hotspots, advice: advice.map(typo) };
}

/* ------------------------------------------------------------------ mission */

/** Description d'une mission : un MissionDef dont le briefing est donné en quatre paragraphes. */
export interface MissionSpec {
  id: string;
  title: string;
  pitch: string;
  /** Situation, mission, exécution, consignes particulières. */
  briefing: [string, string, string, string];
  role: PlayableRole;
  altRoles?: PlayableRole[];
  rank?: PoliceRank | null;
  poste?: PolicePoste | null;
  profile?: ProtestProfile | null;
  type: MissionType;
  place: string;
  timeOfDay: number;
  weather: WeatherKind;
  windFrom: number;
  windSpeed: number;
  duration?: DurationPreset;
  crowd: MissionCrowd;
  forces: MissionForces;
  intel: MissionIntel;
  phases: MissionPhase[];
  objectives: MissionObjective[];
  failures: MissionFailure[];
  randomEvents: string[];
  unique: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
  chapter?: number;
  mirrorOf?: string;
  tags?: string[];
}

/** Intitulés des quatre paragraphes du briefing (ordre d'opération). */
export const BRIEFING_LABELS = ['Situation', 'Mission', 'Exécution', 'Consignes particulières'] as const;

/** Construit une mission complète : typographie, briefing en quatre paragraphes, valeurs par défaut. */
export function mission(s: MissionSpec): MissionDef {
  const briefing = s.briefing.map((p, i) => typo(`${BRIEFING_LABELS[i]}. ${p}`)).join('\n\n');
  return {
    id: s.id,
    title: typo(s.title),
    pitch: typo(s.pitch),
    briefing,
    role: s.role,
    altRoles: s.altRoles ?? [],
    rank: s.rank ?? null,
    poste: s.poste ?? null,
    profile: s.profile ?? null,
    type: s.type,
    place: s.place,
    timeOfDay: s.timeOfDay,
    weather: s.weather,
    windFrom: s.windFrom,
    windSpeed: s.windSpeed,
    duration: s.duration ?? 'standard',
    crowd: s.crowd,
    forces: s.forces,
    intel: s.intel,
    phases: s.phases,
    objectives: s.objectives,
    failures: s.failures,
    randomEvents: s.randomEvents.map(typo),
    unique: typo(s.unique),
    difficulty: s.difficulty,
    chapter: s.chapter ?? -1,
    mirrorOf: s.mirrorOf ?? '',
    tags: s.tags ?? [],
  };
}

/** Éléments de scène partagés par une mission miroir : même lieu, même heure, même foule, mêmes moyens. */
export function scene(base: MissionDef): Pick<
  MissionSpec, 'type' | 'place' | 'timeOfDay' | 'weather' | 'windFrom' | 'windSpeed' | 'duration' | 'crowd' | 'forces'
> {
  return {
    type: base.type, place: base.place, timeOfDay: base.timeOfDay, weather: base.weather, windFrom: base.windFrom,
    windSpeed: base.windSpeed, duration: base.duration, crowd: base.crowd, forces: base.forces,
  };
}
