/* =====================================================================================
 * Radio — ambiance : un message de faible priorité toutes les 20 à 40 s, pour que la radio ne soit jamais muette
 * ni répétitive. Chaque message dit quelque chose de VRAI à cet instant :
 *   - le thème dépend de la phase et de la tension du directeur (table AMBIENT_BY_PHASE, ambientTopics) ;
 *   - un thème n'est retenu que si le monde le confirme (topicAllowed) : on ne parle d'un feu que s'il y en a un,
 *     des secours que s'ils sont sur place, de la presse que si elle est là, des déviations que si une rue est coupée ;
 *   - le message porte l'indicatif d'une unité réelle, son secteur, son effectif apte, le volume de foule arrondi
 *     à l'estime, l'heure et la météo de la session.
 * L'anti-répétition de la file et le tirage « jamais deux fois la même variante de suite » font le reste.
 * ===================================================================================== */

import type { CrowdPhase, GameContext, RadioChannel, Rng, Squad, WeatherKind } from '@/core/contracts';
import type { TrafficControlApi } from '@/core/extensions';
import { EXT } from '@/core/extensions';
import { cardinalFr } from '@/core/math';
import { weightedIndex } from '@/core/rng';
import type { PhraseParams, RadioPhrases } from './api';

/** Intervalle entre deux messages d'ambiance (s). */
export const AMBIENT_MIN = 20;
export const AMBIENT_MAX = 40;
/** Délai avant le premier message d'une session (s). */
const FIRST_MIN = 8;
const FIRST_MAX = 16;
/** Nouvel essai quand le canal est occupé (s). */
const RETRY = 3;

export interface AmbientTopic {
  key: string;
  weight: number;
}

/**
 * Thèmes possibles par phase de la manifestation, avec leur poids. Rappel de la bible (F.2) : aucune violence pendant
 * le rassemblement ; l'après-manifestation n'est pas un retour au calme mais le temps des petits groupes mobiles.
 */
export const AMBIENT_BY_PHASE: Readonly<Record<CrowdPhase, readonly AmbientTopic[]>> = {
  aucune: [
    { key: 'ambiance_ras', weight: 5 }, { key: 'ambiance_heure', weight: 2 }, { key: 'ambiance_effectif', weight: 2 },
    { key: 'ambiance_circulation', weight: 1.5 }, { key: 'ambiance_meteo', weight: 1 },
  ],
  rassemblement: [
    { key: 'ambiance_rassemblement', weight: 5 }, { key: 'ambiance_slogans', weight: 2 }, { key: 'ambiance_effectif', weight: 2 },
    { key: 'ambiance_circulation', weight: 1.5 }, { key: 'ambiance_heure', weight: 1.5 }, { key: 'ambiance_presse', weight: 1 },
    { key: 'ambiance_meteo', weight: 1 }, { key: 'ambiance_ras', weight: 1 }, { key: 'ambiance_secours_veille', weight: 0.8 },
  ],
  depart: [
    { key: 'ambiance_rassemblement', weight: 3 }, { key: 'ambiance_cortege', weight: 3 }, { key: 'ambiance_slogans', weight: 2 },
    { key: 'ambiance_circulation', weight: 1.5 }, { key: 'ambiance_effectif', weight: 1 }, { key: 'ambiance_heure', weight: 1 },
  ],
  cortege: [
    { key: 'ambiance_cortege', weight: 5 }, { key: 'ambiance_slogans', weight: 2.5 }, { key: 'ambiance_vigilance', weight: 1.5 },
    { key: 'ambiance_effectif', weight: 1.5 }, { key: 'ambiance_heure', weight: 1.5 }, { key: 'ambiance_circulation', weight: 1.5 },
    { key: 'ambiance_logistique', weight: 1 }, { key: 'ambiance_presse', weight: 1 }, { key: 'ambiance_secours_veille', weight: 0.8 },
    { key: 'ambiance_meteo', weight: 0.8 },
  ],
  tension: [
    { key: 'ambiance_tension', weight: 4 }, { key: 'ambiance_vigilance', weight: 3 }, { key: 'ambiance_foyers', weight: 1.5 },
    { key: 'ambiance_logistique', weight: 1.5 }, { key: 'ambiance_effectif', weight: 1.5 }, { key: 'ambiance_presse', weight: 1 },
    { key: 'ambiance_secours_veille', weight: 1 }, { key: 'ambiance_heure', weight: 1 },
  ],
  affrontement: [
    { key: 'ambiance_affrontement', weight: 10 }, { key: 'ambiance_foyers', weight: 3 }, { key: 'ambiance_tension', weight: 2 },
    { key: 'ambiance_logistique', weight: 2 }, { key: 'ambiance_secours_veille', weight: 1.5 }, { key: 'ambiance_effectif', weight: 1.5 },
    { key: 'ambiance_heure', weight: 0.5 },
  ],
  dispersion: [
    { key: 'ambiance_dispersion', weight: 6 }, { key: 'ambiance_groupes_mobiles', weight: 1.5 }, { key: 'ambiance_foyers', weight: 1.5 },
    { key: 'ambiance_circulation', weight: 1.5 }, { key: 'ambiance_effectif', weight: 1.5 }, { key: 'ambiance_logistique', weight: 1 },
    { key: 'ambiance_heure', weight: 1 },
  ],
  apres_manif: [
    { key: 'ambiance_groupes_mobiles', weight: 5 }, { key: 'ambiance_foyers', weight: 2.5 }, { key: 'ambiance_vigilance', weight: 2 },
    { key: 'ambiance_apres', weight: 2 }, { key: 'ambiance_effectif', weight: 2 }, { key: 'ambiance_logistique', weight: 1.5 },
    { key: 'ambiance_heure', weight: 1.5 }, { key: 'ambiance_circulation', weight: 1.5 }, { key: 'ambiance_ras', weight: 1 },
    { key: 'ambiance_presse', weight: 0.5 },
  ],
  terminee: [
    { key: 'ambiance_apres', weight: 3 }, { key: 'ambiance_ras', weight: 3 }, { key: 'ambiance_heure', weight: 2 },
    { key: 'ambiance_circulation', weight: 1.5 }, { key: 'ambiance_effectif', weight: 1 }, { key: 'ambiance_logistique', weight: 1 },
  ],
};

/** Thèmes de nature « tension » : écartés quand la tension globale est faible. */
const HEATED = new Set(['ambiance_tension', 'ambiance_affrontement']);
/** Thèmes de calme : écartés quand la tension est forte. */
const CALM_ONLY = new Set(['ambiance_ras', 'ambiance_slogans', 'ambiance_apres']);
/** Thèmes toujours vrais, quel que soit l'état du monde : repli quand aucun autre n'est confirmé. */
const ALWAYS_TRUE: readonly AmbientTopic[] = [{ key: 'ambiance_heure', weight: 1 }, { key: 'ambiance_meteo', weight: 1 }];

/** Thèmes retenus pour une phase et une tension données (mêmes règles que le tirage, avant le contrôle du monde). */
export function ambientTopics(phase: CrowdPhase, tension: number): AmbientTopic[] {
  const base = AMBIENT_BY_PHASE[phase] ?? AMBIENT_BY_PHASE.aucune;
  const out: AmbientTopic[] = [];
  for (const t of base) {
    if (HEATED.has(t.key) && tension < 0.2 && phase !== 'affrontement') continue;
    if (CALM_ONLY.has(t.key) && tension > 0.6) continue;
    // « vigilance » et « groupes mobiles » décrivent une agitation : ils n'ont pas de sens quand tout est calme
    if ((t.key === 'ambiance_vigilance' || t.key === 'ambiance_groupes_mobiles') && tension < 0.1) continue;
    out.push(t);
  }
  return out.length > 0 ? out : [...base];
}

/** Ce que le monde permet de dire à cet instant. */
export interface WorldFacts {
  /** Unités de police qui peuvent parler (avec des membres). */
  squads: number;
  /** Manifestants présents. */
  crowd: number;
  /** Position d'un feu en cours, ou null. */
  fire: { x: number; z: number } | null;
  /** Position d'un moyen de secours sur place, ou null. */
  rescue: { x: number; z: number } | null;
  /** Des journalistes sont présents. */
  press: boolean;
  /** Position d'une rue coupée à la circulation, ou null. */
  closure: { x: number; z: number } | null;
}

/** Thèmes qui parlent de la foule : il faut qu'elle soit là. */
const NEEDS_CROWD = new Set([
  'ambiance_rassemblement', 'ambiance_cortege', 'ambiance_slogans', 'ambiance_vigilance', 'ambiance_tension',
  'ambiance_affrontement', 'ambiance_dispersion', 'ambiance_groupes_mobiles',
]);

/** Le monde confirme-t-il ce thème ? */
export function topicAllowed(key: string, facts: WorldFacts): boolean {
  if (NEEDS_CROWD.has(key)) return facts.crowd > 0;
  switch (key) {
    case 'ambiance_foyers':
      return facts.fire !== null;
    case 'ambiance_secours_veille':
      return facts.rescue !== null;
    case 'ambiance_presse':
      return facts.press;
    case 'ambiance_circulation':
      return facts.closure !== null;
    case 'ambiance_effectif':
    case 'ambiance_logistique':
      return facts.squads > 0;
    default:
      return true;
  }
}

const WEATHER_WORDS: Readonly<Record<WeatherKind, string>> = {
  clair: 'ciel dégagé',
  nuageux: 'ciel nuageux',
  couvert: 'ciel couvert',
  pluie: 'pluie',
  averse: 'averses',
  brouillard: 'brouillard',
  orage: 'orage',
};

/** Vent dit à la radio d'après son vecteur au sol (m/s) : « vent de nord », « vent d'ouest », « vent faible ». */
export function windWords(windX: number, windZ: number): string {
  const speed = Math.hypot(windX, windZ);
  if (!(speed >= 1)) return 'vent faible';
  // le vent porte le nom de la direction d'où il vient : l'opposé de son vecteur
  const from = cardinalFr(Math.atan2(-windX, -windZ));
  return /^[eo]/.test(from) ? `vent d'${from}` : `vent de ${from}`;
}

/** Arrondi « à l'estime » d'un effectif de foule pour la radio : on ne dit pas « 1 243 » au pas près. */
export function estimateCount(n: number): number {
  if (n < 20) return Math.max(0, Math.round(n));
  if (n < 100) return Math.round(n / 5) * 5;
  if (n < 1000) return Math.round(n / 50) * 50;
  return Math.round(n / 500) * 500;
}

/** Unités qui tiennent le terrain et rendent compte à la voix : pas les équipages ni les secours. */
const SPEAKING_KINDS = new Set(['compagnie', 'section', 'groupe', 'peloton', 'binome']);

export class RadioAmbient {
  /** Activé/désactivé à tout moment ; remis à vrai à chaque session sauf si la mission l'interdit. */
  enabled = true;
  private nextAt = 0;
  private lastTopic = '';
  private rng: Rng;
  private readonly speakers: Squad[] = [];

  constructor(
    private readonly ctx: GameContext,
    private readonly phrases: RadioPhrases,
    rng: Rng,
    private readonly busy: (channel: RadioChannel) => number,
  ) {
    this.rng = rng;
  }

  reset(rng: Rng): void {
    this.rng = rng;
    const extra = this.ctx.session.config?.extra;
    this.enabled = !(extra && extra['radioAmbiance'] === false);
    this.lastTopic = '';
    this.nextAt = this.ctx.clock.now + this.rng.range(FIRST_MIN, FIRST_MAX);
  }

  /** Prochain instant prévu (temps de session), pour les tests. */
  get next(): number {
    return this.nextAt;
  }

  update(): void {
    const now = this.ctx.clock.now;
    if (now < this.nextAt) return;
    if (!this.enabled) {
      this.nextAt = now + this.rng.range(AMBIENT_MIN, AMBIENT_MAX);
      return;
    }
    const facts = this.observe();
    const key = this.pickTopic(facts);
    // le canal est encombré : on réessaie bientôt plutôt que d'empiler de l'ambiance
    const channel = this.phrases.info(key)?.channel ?? 'unite';
    if (this.busy(channel) > 0 || this.busy('commandement') > 0) {
      this.nextAt = now + RETRY;
      return;
    }
    this.lastTopic = key;
    this.emit(key, facts);
    this.nextAt = now + this.rng.range(AMBIENT_MIN, AMBIENT_MAX);
  }

  /** Relève ce que le monde permet de dire (une fois par message : ce n'est pas une boucle chaude). */
  private observe(): WorldFacts {
    const ctx = this.ctx;
    this.speakers.length = 0;
    const squads = ctx.squads.list;
    for (let i = 0; i < squads.length; i++) {
      const s = squads[i]!;
      if (s.faction === 'police' && s.members.length > 0 && SPEAKING_KINDS.has(s.kind)) this.speakers.push(s);
    }

    let fire: WorldFacts['fire'] = null;
    const props = ctx.props.list;
    for (let i = 0; i < props.length && !fire; i++) {
      const p = props[i]!;
      if (!p.dormant && p.burning > 0) fire = { x: p.x, z: p.z };
    }
    const shops = ctx.props.shops;
    for (let i = 0; i < shops.length && !fire; i++) {
      const s = shops[i]!;
      if (!s.dormant && s.burning > 0) fire = { x: s.x, z: s.z };
    }
    let rescue: WorldFacts['rescue'] = null;
    const vehicles = ctx.vehicles.list;
    for (let i = 0; i < vehicles.length; i++) {
      const v = vehicles[i]!;
      if (v.dormant) continue;
      if (!fire && v.burning > 0) fire = { x: v.x, z: v.z };
      if (!rescue && (v.kind === 'camion_pompiers' || v.kind === 'ambulance') && v.state !== 'wrecked' && v.state !== 'burnt') {
        rescue = { x: v.x, z: v.z };
      }
    }

    let press = false;
    const people = ctx.people.list;
    for (let i = 0; i < people.length; i++) {
      const p = people[i]!;
      if (p.dormant) continue;
      if (p.faction === 'press') press = true;
      else if (!rescue && (p.kind === 'pompier' || p.kind === 'samu')) rescue = { x: p.x, z: p.z };
      if (press && rescue) break;
    }

    const traffic = ctx.service<TrafficControlApi>(EXT.traffic);
    const first = traffic && traffic.closures.length > 0 ? traffic.closures[this.rng.int(0, traffic.closures.length)]! : null;

    return {
      squads: this.speakers.length,
      crowd: ctx.director.stats.present,
      fire,
      rescue,
      press,
      closure: first ? { x: first.x, z: first.z } : null,
    };
  }

  private pickTopic(facts: WorldFacts): string {
    const director = this.ctx.director;
    let topics = ambientTopics(director.phase, director.tension).filter((t) => topicAllowed(t.key, facts));
    if (topics.length === 0) topics = [...ALWAYS_TRUE];
    // le thème qui vient de passer est rendu peu probable : la radio change de sujet
    const weights = topics.map((t) => (t.key === this.lastTopic ? t.weight * 0.2 : t.weight));
    const i = weightedIndex(this.rng, weights);
    return topics[i < 0 ? 0 : i]!.key;
  }

  /**
   * Unité qui parle. Pour un thème de tension, c'est l'unité la plus exposée (tension locale la plus forte) : une
   * section au repos à l'arrière n'annonce pas des affrontements. Sinon, une unité au hasard.
   */
  private pickSquad(key: string): Squad | null {
    const list = this.speakers;
    if (list.length === 0) return null;
    if (key !== 'ambiance_tension' && key !== 'ambiance_affrontement' && key !== 'ambiance_vigilance') {
      return list[this.rng.int(0, list.length)]!;
    }
    let best: Squad | null = null;
    let bestTension = -1;
    for (let i = 0; i < list.length; i++) {
      const s = list[i]!;
      const leader = this.ctx.people.get(s.leaderId);
      const t = leader ? this.ctx.director.tensionAt(leader.x, leader.z) : 0;
      if (t > bestTension) {
        bestTension = t;
        best = s;
      }
    }
    return best;
  }

  /** Agents de l'unité encore en état de tenir. */
  private aptMembers(squad: Squad): number {
    let n = 0;
    for (let i = 0; i < squad.members.length; i++) {
      const p = this.ctx.people.get(squad.members[i]!);
      if (p && !this.ctx.health.isIncapacitated(p)) n++;
    }
    return n;
  }

  private emit(key: string, facts: WorldFacts): void {
    const ctx = this.ctx;
    const squad = this.pickSquad(key);
    const params: Record<string, string | number> = {};
    const options: { squad?: Squad; at?: { x: number; z: number } } = {};
    if (squad) options.squad = squad;
    else {
      const me = ctx.player.person();
      options.at = me ? { x: me.x, z: me.z } : { x: ctx.session.config?.x ?? 0, z: ctx.session.config?.z ?? 0 };
    }
    switch (key) {
      case 'ambiance_effectif':
        if (squad) params['nombre'] = this.aptMembers(squad);
        break;
      case 'ambiance_rassemblement':
      case 'ambiance_cortege':
      case 'ambiance_dispersion':
        params['nombre'] = estimateCount(facts.crowd);
        break;
      case 'ambiance_meteo': {
        const env = ctx.env.state;
        params['meteo'] = `${WEATHER_WORDS[env.weather] ?? 'temps variable'}, ${windWords(env.windX, env.windZ)}`;
        break;
      }
      // le secteur annoncé est celui du fait rapporté, pas celui de l'unité qui parle
      case 'ambiance_foyers':
        if (facts.fire) options.at = facts.fire;
        break;
      case 'ambiance_secours_veille':
        if (facts.rescue) options.at = facts.rescue;
        break;
      case 'ambiance_circulation':
        if (facts.closure) options.at = facts.closure;
        break;
      default:
        break;
    }
    this.phrases.say(key, params as PhraseParams, options);
  }
}
