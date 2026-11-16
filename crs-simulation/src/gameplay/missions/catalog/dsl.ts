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

/** Phase : titre, texte, condition de passage, messages radio [émetteur, texte], aléas imposés. */
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
