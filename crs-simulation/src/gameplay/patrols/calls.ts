/* =====================================================================================
 * PATROUILLE — planificateur des appels de CENTRAL pendant une vacation (logique pure : aucun service, aucun DOM).
 *
 * Le répartiteur (mode.ts, PatrolModeSystem) lui demande QUAND le prochain appel tombe (nextCallAt), DE QUELLE
 * NATURE il est (pickKind), OÙ (pickSpot) et COMBIEN de personnes (callSize) ; il lui emprunte aussi les phrases de
 * la radio (callText). Tous les tirages passent par le générateur qu'on lui donne (ctx.rng.fork('patrouille:appels')) :
 * même graine, même suite d'appels.
 *
 * Rythmes (décision D10 du plan « modes ») :
 *   calme   premier appel à 120–180 s, puis toutes les 300–480 s, 1 événement à la fois, ni casseurs ni
 *           manifestation sauvage (et jamais avant 900 s) ;
 *   normal  premier à 60–120 s, puis 180–360 s, 2 à la fois ;
 *   agité   premier à 30–60 s, puis 90–200 s, 3 à la fois.
 * Une seule manifestation sauvage à la fois. Lieux à 500–2 000 m du joueur et à plus de 300 m d'un appel en cours.
 * ===================================================================================== */

import type { Rng } from '@/core/contracts';
import { MANIF_PLACES, PARIS_PLACES } from '@/sim/crowd';
import type { CallKind, DispatchCall, PatrolCallTypes, PatrolRythme } from './model';
import { approx, distanceWords, people } from './sites';

// ───────────────────────────── rythmes ─────────────────────────────

export interface RythmeDef {
  /** Délai du premier appel (s), bornes du tirage. */
  first: readonly [number, number];
  /** Écart entre deux appels (s), bornes du tirage. */
  gap: readonly [number, number];
  /** Événements simultanés au plus (appels non terminés). */
  max: number;
  /** Poids de tirage des natures. */
  weights: Readonly<Record<CallKind, number>>;
  /** Avant cet instant de la vacation (s), ni casseurs ni manifestation sauvage. */
  heavyAfter: number;
}

export const CALL_KINDS: readonly CallKind[] = ['feu', 'rassemblement', 'blocage', 'casseurs', 'manif_sauvage'];

export const RYTHMES: Readonly<Record<PatrolRythme, RythmeDef>> = {
  calme: {
    first: [120, 180], gap: [300, 480], max: 1, heavyAfter: 900,
    weights: { feu: 50, rassemblement: 35, blocage: 15, casseurs: 0, manif_sauvage: 0 },
  },
  normal: {
    first: [60, 120], gap: [180, 360], max: 2, heavyAfter: 0,
    weights: { feu: 30, rassemblement: 30, blocage: 15, casseurs: 10, manif_sauvage: 15 },
  },
  agite: {
    first: [30, 60], gap: [90, 200], max: 3, heavyAfter: 0,
    weights: { feu: 20, rassemblement: 20, blocage: 10, casseurs: 25, manif_sauvage: 25 },
  },
};

/** Anneau des lieux d'appel autour du joueur (m) et écart minimal à un appel en cours (m). */
export const SPOT_MIN = 500;
export const SPOT_MAX = 2000;
export const SPOT_SPACING = 300;

/**
 * Instant (s de session) du prochain appel. `first` : premier appel de la vacation. `premier` / `ecart` : valeurs
 * imposées (essais : &premier=, ou VacationConfig.ecart) ; sinon tirage selon le rythme.
 */
export function nextCallAt(
  rythme: PatrolRythme, now: number, rng: Rng, first: boolean, imposed: { premier?: number; ecart?: number } = {},
): number {
  const def = RYTHMES[rythme] ?? RYTHMES.normal;
  // (le tirage est fait même quand la valeur est imposée : la suite des appels ne dépend pas du paramètre d'essai)
  const span = first ? def.first : def.gap;
  const drawn = rng.range(span[0], span[1]);
  if (first && typeof imposed.premier === 'number' && Number.isFinite(imposed.premier) && imposed.premier >= 0) return now + imposed.premier;
  if (!first && typeof imposed.ecart === 'number' && Number.isFinite(imposed.ecart) && imposed.ecart > 0) return now + imposed.ecart;
  return now + drawn;
}

/** Nature permise par les cases de la vacation. */
export function kindAllowed(kind: CallKind, types: PatrolCallTypes): boolean {
  switch (kind) {
    case 'feu': return types.feux;
    case 'rassemblement': return types.rassemblements;
    case 'blocage': return types.blocages;
    case 'casseurs': return types.casseurs;
    case 'manif_sauvage': return types.manifs;
    default: return false;
  }
}

export interface PickKindOptions {
  /** Temps écoulé depuis la prise de service (s). */
  elapsed: number;
  /** Une manifestation sauvage est déjà en cours. */
  sauvageActive: boolean;
  /** Natures à écarter pour ce tirage (échecs précédents). */
  exclude?: readonly CallKind[];
}

/** Nature du prochain appel, tirée selon les poids du rythme ; null si aucune n'est possible. */
export function pickKind(rythme: PatrolRythme, types: PatrolCallTypes, rng: Rng, o: PickKindOptions): CallKind | null {
  const def = RYTHMES[rythme] ?? RYTHMES.normal;
  let total = 0;
  const w: number[] = [];
  for (const k of CALL_KINDS) {
    let weight = def.weights[k];
    if (!kindAllowed(k, types)) weight = 0;
    if ((k === 'casseurs' || k === 'manif_sauvage') && o.elapsed < def.heavyAfter) weight = 0;
    if (k === 'manif_sauvage' && o.sauvageActive) weight = 0;
    if (o.exclude && o.exclude.indexOf(k) >= 0) weight = 0;
    w.push(weight);
    total += weight;
  }
  // (un tirage est consommé dans tous les cas : la suite ne dépend pas des natures possibles)
  let r = rng.next() * total;
  if (total <= 0) return null;
  for (let i = 0; i < CALL_KINDS.length; i++) {
    if (w[i]! <= 0) continue;
    r -= w[i]!;
    if (r <= 0) return CALL_KINDS[i]!;
  }
  for (let i = CALL_KINDS.length - 1; i >= 0; i--) if (w[i]! > 0) return CALL_KINDS[i]!;
  return null;
}

// ───────────────────────────── lieux ─────────────────────────────

export interface SpotCandidate {
  x: number;
  z: number;
  /** Nom dit à la radio (« place de l'Opéra », « rue de Rivoli ») ; '' : le répartiteur le déduit de la carte. */
  name: string;
  /** Place réelle connue (rassemblements et manifestations sauvages s'y tiennent d'ordinaire). */
  named: boolean;
}

export interface Spot {
  x: number;
  z: number;
  name: string;
  named: boolean;
}

/** Places réelles de Paris (lecture seule : listes du module de foule), sans doublon de nom. */
export const CALL_PLACES: readonly SpotCandidate[] = (() => {
  const out: SpotCandidate[] = [];
  for (const p of [...PARIS_PLACES, ...MANIF_PLACES]) {
    if (out.some((o) => o.name === p.name)) continue;
    out.push({ x: p.x, z: p.z, name: p.name, named: true });
  }
  return out;
})();

/** Préférence pour une place connue, selon la nature (le reste : points de rue). */
const NAMED_SHARE: Readonly<Record<CallKind, number>> = {
  rassemblement: 0.75, manif_sauvage: 0.85, blocage: 0.3, casseurs: 0.15, feu: 0,
};

/**
 * Lieu de l'appel : dans l'anneau SPOT_MIN–SPOT_MAX autour de `from`, à plus de SPOT_SPACING m de chaque appel en
 * cours (`busy`), parmi les places réelles (`places`) et les points de rue fournis par l'appelant (`streets`). Un feu
 * se déclare toujours dans une rue (poubelle, conteneur ou voiture garée le long du trottoir). null si rien ne convient.
 */
export function pickSpot(
  kind: CallKind, from: { x: number; z: number }, busy: readonly { x: number; z: number }[],
  places: readonly SpotCandidate[], streets: readonly SpotCandidate[], rng: Rng,
): Spot | null {
  const ok = (c: SpotCandidate): boolean => {
    const d = Math.hypot(c.x - from.x, c.z - from.z);
    if (!(d >= SPOT_MIN && d <= SPOT_MAX)) return false;
    for (const b of busy) if (Math.hypot(c.x - b.x, c.z - b.z) < SPOT_SPACING) return false;
    return true;
  };
  const known = kind === 'feu' ? [] : places.filter(ok);
  const street = streets.filter(ok);
  const wantNamed = rng.next() < NAMED_SHARE[kind];
  const pool = (wantNamed && known.length > 0) || street.length === 0 ? known : street;
  if (pool.length === 0) return null;
  const c = pool[Math.min(pool.length - 1, Math.floor(rng.next() * pool.length))]!;
  return { x: c.x, z: c.z, name: c.name, named: c.named };
}

/**
 * Effectif annoncé (avant l'échelle de foule des réglages) : rassemblement 40–160, casseurs 15–40, blocage 20–60,
 * manifestation sauvage 150–450, feu 0.
 */
export function callSize(kind: CallKind, rng: Rng): number {
  switch (kind) {
    case 'rassemblement': return Math.round(rng.range(40, 160));
    case 'casseurs': return Math.round(rng.range(15, 40));
    case 'blocage': return Math.round(rng.range(20, 60));
    case 'manif_sauvage': return Math.round(rng.range(150, 450));
    default: return 0;
  }
}

/** Priorité de l'appel : 3 vital (casseurs, cortège sauvage), 2 urgent, 1 à traiter. */
export function callPriority(kind: CallKind, fire: FireTarget | ''): 1 | 2 | 3 {
  if (kind === 'casseurs' || kind === 'manif_sauvage') return 3;
  if (kind === 'blocage') return 1;
  if (kind === 'feu') return fire === 'vehicule' ? 3 : 2;
  return 2;
}

// ───────────────────────────── phrases ─────────────────────────────

/** Ce qui brûle (appel 'feu'). */
export type FireTarget = 'poubelle' | 'conteneur' | 'vehicule';

/** Titre de l'appel (carte d'appel, compte rendu). */
export function callLabel(kind: CallKind, fire: FireTarget | '' = ''): string {
  switch (kind) {
    case 'rassemblement': return 'Rassemblement non déclaré';
    case 'casseurs': return 'Groupe de casseurs';
    case 'blocage': return 'Blocage de carrefour';
    case 'manif_sauvage': return 'Manifestation sauvage';
    case 'feu': return fire === 'vehicule' ? 'Feu de véhicule' : fire === 'poubelle' ? 'Feu de poubelles' : 'Feu de conteneur';
    default: return 'Appel';
  }
}

/** Lieu dans une phrase : « place de l'Opéra », « rue de Rivoli » (première lettre en minuscule). */
export function placeWords(place: string): string {
  const p = (place || '').trim();
  if (p === '') return 'le point indiqué';
  return p.charAt(0).toLowerCase() + p.slice(1);
}

/** « de quelques… », « d’une vingtaine… », « d’environ… ». */
function of(s: string): string {
  return /^[aeéèêiïoôuh]/i.test(s) ? 'd’' + s : 'de ' + s;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Corps de l'annonce : nature, lieu, effectif. */
function what(call: Pick<DispatchCall, 'kind' | 'label' | 'place' | 'people'>): string {
  const where = placeWords(call.place);
  switch (call.kind) {
    case 'rassemblement': return `rassemblement non déclaré, ${where}, ${approx(call.people)} personnes, la tension monte`;
    case 'casseurs': return `groupe ${of(people(call.people, 'individus'))} cagoulés, ${where}, dégradations en cours`;
    case 'blocage': return `blocage de carrefour, ${where}, ${approx(call.people)} personnes assises sur la chaussée`;
    case 'manif_sauvage': return `cortège non déclaré en formation, ${where}, ${approx(call.people)} personnes, sans service d’ordre`;
    case 'feu': return `${call.label.toLowerCase()}, ${where}, pompiers prévenus`;
    default: return `${call.label.toLowerCase()}, ${where}`;
  }
}

/** Phrases radio du répartiteur. `cs` : indicatif de l'équipage du joueur (« BAC 75N »). */
export const callText = {
  /** CENTRAL appelle l'équipage. */
  annonce(cs: string, call: Pick<DispatchCall, 'kind' | 'label' | 'place' | 'people'>, distance: number): string {
    return `${cs} de CENTRAL : ${what(call)}. Vous êtes à ${distanceWords(Math.max(0, distance))}. Pouvez-vous prendre ?`;
  },
  /** L'équipage prend l'appel. */
  acceptee(cs: string, call: Pick<DispatchCall, 'place'>): string {
    return `CENTRAL de ${cs} : reçu, nous prenons, ${placeWords(call.place)}. Deux tons.`;
  },
  /** CENTRAL confie l'appel à une patrouille de l'IA (décliné, ou sans réponse). */
  confiee(other: string): string {
    return `Reçu, ${other} prend.`;
  },
  /** Personne pour le reprendre. */
  declinee(call: Pick<DispatchCall, 'place'>): string {
    return `Reçu. Aucun équipage disponible pour ${placeWords(call.place)}, l’appel reste en attente.`;
  },
  /** CENTRAL donne l'appel directement à une patrouille de l'IA (le joueur est déjà sur un appel). */
  direct(other: string, call: Pick<DispatchCall, 'kind' | 'label' | 'place' | 'people'>): string {
    return `${other} de CENTRAL : ${what(call)}. Prenez l’appel.`;
  },
  /** L'équipage est arrivé. */
  surPlace(cs: string, call: Pick<DispatchCall, 'place'>): string {
    return `CENTRAL de ${cs} : sur place, ${placeWords(call.place)}. Nous évaluons.`;
  },
  /** Fin d'intervention prononcée par l'équipage. */
  finIntervention(cs: string, call: Pick<DispatchCall, 'place'>): string {
    return `CENTRAL de ${cs} : fin d’intervention, ${placeWords(call.place)}. Nous reprenons la patrouille.`;
  },
  /** L'événement a pris fin de lui-même (dispersion, cortège terminé, feu éteint). */
  terminee(cs: string, call: Pick<DispatchCall, 'kind' | 'place'>): string {
    const where = placeWords(call.place);
    const end = call.kind === 'rassemblement' ? `le rassemblement, ${where}, s’est dispersé`
      : call.kind === 'casseurs' ? `le groupe de casseurs, ${where}, s’est dispersé`
        : call.kind === 'blocage' ? `fin du blocage, ${where}, circulation rétablie`
          : call.kind === 'manif_sauvage' ? `le cortège sauvage parti de ${where} s’est dispersé`
            : `feu éteint, ${where}`;
    return `${cs} de CENTRAL : ${end}. Fin d’intervention, reprenez la patrouille.`;
  },
  /** Feu toujours actif au bout d'un quart d'heure : les sapeurs-pompiers prennent le relais. */
  relais(cs: string, call: Pick<DispatchCall, 'place'>): string {
    return `${cs} de CENTRAL : les sapeurs-pompiers prennent le relais, ${placeWords(call.place)}. Reprenez la patrouille.`;
  },
  /** Demande de renfort par l'équipage. */
  renfort(cs: string, call: Pick<DispatchCall, 'place'>, kind: 'patrouille' | 'compagnie' | 'pompiers' | 'samu'): string {
    const w = kind === 'patrouille' ? 'une patrouille en renfort' : kind === 'compagnie' ? 'une compagnie de CRS'
      : kind === 'pompiers' ? 'les sapeurs-pompiers' : 'le SAMU';
    return `CENTRAL de ${cs} : demandons ${w}, ${placeWords(call.place)}.`;
  },
  /** Réponse de CENTRAL à une demande de renfort. */
  renfortReponse(kind: 'patrouille' | 'compagnie' | 'pompiers' | 'samu', other = ''): string {
    if (kind === 'patrouille') return other !== '' ? `Reçu, ${other} fait mouvement.` : 'Reçu. Aucun équipage disponible pour l’instant.';
    if (kind === 'compagnie') return 'Reçu, une compagnie de CRS est engagée. Délai : quelques minutes.';
    return kind === 'pompiers' ? 'Reçu, les sapeurs-pompiers sont engagés.' : 'Reçu, le SAMU est engagé.';
  },
  /** Fin de vacation. */
  finVacation(cs: string): string {
    return `${cs}, fin de vacation, regagnez le service.`;
  },
  /** Ligne courte de notification (carte, téléphone). */
  notification(call: Pick<DispatchCall, 'label' | 'place' | 'people'>, distance: number): string {
    const who = call.people > 0 ? ` · ~${call.people} pers.` : '';
    const d = distance < 1000 ? `${Math.round(distance / 10) * 10} m` : `${(Math.round(distance / 100) / 10).toString().replace('.', ',')} km`;
    return `${cap(call.label)} — ${cap(placeWords(call.place))}${who} · ${d}`;
  },
};
