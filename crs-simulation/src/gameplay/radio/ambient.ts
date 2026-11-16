/* =====================================================================================
 * Radio — ambiance : un message de faible priorité toutes les 20 à 40 s qui reflète l'état réel du monde
 * (phase et tension du directeur, secteur et effectif d'une unité, heure, météo), pour que la radio ne soit
 * jamais muette ni répétitive. Le choix du thème dépend de la phase ; l'anti-répétition de la file et le
 * tirage « jamais deux fois la même variante de suite » font le reste.
 * ===================================================================================== */

import type { CrowdPhase, GameContext, Rng, Squad, WeatherKind } from '@/core/contracts';
import type { CallsignBook, PhraseParams, RadioPhrases } from './api';
import { weightedIndex } from '@/core/rng';

/** Intervalle entre deux messages d'ambiance (s). */
export const AMBIENT_MIN = 20;
export const AMBIENT_MAX = 40;
/** Délai avant le premier message d'une session (s). */
const FIRST_MIN = 8;
const FIRST_MAX = 16;

export interface AmbientTopic {
  key: string;
  weight: number;
}

/** Thèmes possibles par phase de la manifestation, avec leur poids. Tout thème listé est cohérent avec la phase. */
export const AMBIENT_BY_PHASE: Readonly<Record<CrowdPhase, readonly AmbientTopic[]>> = {
  aucune: [
    { key: 'ambiance_circulation', weight: 1.5 },
    { key: 'ambiance_ras', weight: 5 }, { key: 'ambiance_heure', weight: 2 },
    { key: 'ambiance_effectif', weight: 2 }, { key: 'ambiance_meteo', weight: 1 },
  ],
  rassemblement: [
    { key: 'ambiance_slogans', weight: 2 }, { key: 'ambiance_circulation', weight: 1.5 }, { key: 'ambiance_presse', weight: 1 },
    { key: 'ambiance_rassemblement', weight: 5 }, { key: 'ambiance_effectif', weight: 2 },
    { key: 'ambiance_heure', weight: 1.5 }, { key: 'ambiance_meteo', weight: 1 }, { key: 'ambiance_ras', weight: 1 },
  ],
  depart: [
    { key: 'ambiance_slogans', weight: 2 }, { key: 'ambiance_circulation', weight: 1.5 },
    { key: 'ambiance_rassemblement', weight: 3 }, { key: 'ambiance_cortege', weight: 3 },
    { key: 'ambiance_effectif', weight: 1 }, { key: 'ambiance_heure', weight: 1 },
  ],
  cortege: [
    { key: 'ambiance_slogans', weight: 2.5 }, { key: 'ambiance_circulation', weight: 1.5 }, { key: 'ambiance_logistique', weight: 1 },
    { key: 'ambiance_presse', weight: 1 }, { key: 'ambiance_secours_veille', weight: 0.8 },
    { key: 'ambiance_cortege', weight: 5 }, { key: 'ambiance_effectif', weight: 1.5 },
    { key: 'ambiance_vigilance', weight: 1.5 }, { key: 'ambiance_heure', weight: 1.5 }, { key: 'ambiance_meteo', weight: 0.8 },
  ],
  tension: [
    { key: 'ambiance_logistique', weight: 1.5 }, { key: 'ambiance_foyers', weight: 1.5 }, { key: 'ambiance_presse', weight: 1 },
    { key: 'ambiance_secours_veille', weight: 1 },
    { key: 'ambiance_tension', weight: 4 }, { key: 'ambiance_vigilance', weight: 3 },
    { key: 'ambiance_effectif', weight: 1.5 }, { key: 'ambiance_heure', weight: 1 },
  ],
  affrontement: [
    { key: 'ambiance_foyers', weight: 3 }, { key: 'ambiance_logistique', weight: 2 }, { key: 'ambiance_secours_veille', weight: 1.5 },
    { key: 'ambiance_affrontement', weight: 10 }, { key: 'ambiance_tension', weight: 2 },
    { key: 'ambiance_effectif', weight: 1.5 }, { key: 'ambiance_heure', weight: 0.5 },
  ],
  dispersion: [
    { key: 'ambiance_foyers', weight: 1.5 }, { key: 'ambiance_circulation', weight: 1.5 }, { key: 'ambiance_logistique', weight: 1 },
    { key: 'ambiance_dispersion', weight: 6 }, { key: 'ambiance_apres', weight: 1 },
    { key: 'ambiance_effectif', weight: 1.5 }, { key: 'ambiance_heure', weight: 1 },
  ],
  apres_manif: [
    { key: 'ambiance_circulation', weight: 2 }, { key: 'ambiance_logistique', weight: 1.5 }, { key: 'ambiance_presse', weight: 0.5 },
    { key: 'ambiance_apres', weight: 5 }, { key: 'ambiance_ras', weight: 2 },
    { key: 'ambiance_effectif', weight: 2 }, { key: 'ambiance_heure', weight: 1.5 },
  ],
  terminee: [
    { key: 'ambiance_circulation', weight: 1.5 }, { key: 'ambiance_logistique', weight: 1 },
    { key: 'ambiance_apres', weight: 3 }, { key: 'ambiance_ras', weight: 3 },
    { key: 'ambiance_heure', weight: 2 }, { key: 'ambiance_effectif', weight: 1 },
  ],
};

/** Thèmes de nature « tension » : écartés quand la tension globale est faible, et réciproquement. */
const HEATED = new Set(['ambiance_tension', 'ambiance_affrontement', 'ambiance_foyers']);
const CALM_ONLY = new Set(['ambiance_ras', 'ambiance_slogans']);

/** Thèmes retenus pour une phase et une tension données (mêmes règles que le tirage). */
export function ambientTopics(phase: CrowdPhase, tension: number): AmbientTopic[] {
  const base = AMBIENT_BY_PHASE[phase] ?? AMBIENT_BY_PHASE.aucune;
  const out: AmbientTopic[] = [];
  for (const t of base) {
    if (HEATED.has(t.key) && tension < 0.2 && phase !== 'affrontement') continue;
    if (CALM_ONLY.has(t.key) && tension > 0.6) continue;
    out.push(t);
  }
  // le thème « vigilance » décrit une tension moyenne : il n'a pas de sens quand tout est calme
  const kept = tension < 0.1 ? out.filter((t) => t.key !== 'ambiance_vigilance') : out;
  return kept.length > 0 ? kept : [...base];
}

const WEATHER_WORDS: Readonly<Record<WeatherKind, string>> = {
  clair: 'clair',
  nuageux: 'nuageux',
  couvert: 'couvert',
  pluie: 'pluvieux',
  averse: 'avec averses',
  brouillard: 'brumeux',
  orage: 'orageux',
};

/** Arrondi « à l'estime » d'un effectif de foule pour la radio : on ne dit pas « 1 243 » au pas près. */
export function estimateCount(n: number): number {
  if (n < 20) return Math.max(0, Math.round(n));
  if (n < 100) return Math.round(n / 5) * 5;
  if (n < 1000) return Math.round(n / 50) * 50;
  return Math.round(n / 500) * 500;
}

export class RadioAmbient {
  /** Activé/désactivé à tout moment ; remis à vrai à chaque session sauf si la mission l'interdit. */
  enabled = true;
  private nextAt = 0;
  private lastTopic = '';
  private rng: Rng;

  constructor(
    private readonly ctx: GameContext,
    private readonly phrases: RadioPhrases,
    private readonly calls: CallsignBook,
    rng: Rng,
    private readonly busy: (channel: 'unite' | 'commandement') => number,
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
    // le canal est encombré : on réessaie bientôt plutôt que d'empiler de l'ambiance
    const topicChannel = this.pickTopic();
    const channel = topicChannel === 'ambiance_heure' ? 'commandement' : 'unite';
    if (this.busy(channel) > 0) {
      this.nextAt = now + 3;
      return;
    }
    this.emit(topicChannel);
    this.nextAt = now + this.rng.range(AMBIENT_MIN, AMBIENT_MAX);
  }

  private pickTopic(): string {
    const phase = this.ctx.director.phase;
    const topics = ambientTopics(phase, this.ctx.director.tension);
    // le thème qui vient de passer est rendu peu probable : la radio change de sujet
    const weights = topics.map((t) => (t.key === this.lastTopic ? t.weight * 0.2 : t.weight));
    const i = weightedIndex(this.rng, weights);
    const key = topics[i < 0 ? 0 : i]!.key;
    this.lastTopic = key;
    return key;
  }

  /** Unité qui parle : une unité de police avec des membres, au hasard ; sinon la compagnie. */
  private pickSquad(): Squad | null {
    const list = this.ctx.squads.list;
    const candidates: Squad[] = [];
    for (let i = 0; i < list.length; i++) {
      const s = list[i]!;
      if (s.faction === 'police' && s.members.length > 0 && s.kind !== 'secours') candidates.push(s);
    }
    return candidates.length > 0 ? candidates[this.rng.int(0, candidates.length)]! : null;
  }

  private emit(key: string): void {
    const ctx = this.ctx;
    const squad = this.pickSquad();
    const stats = ctx.director.stats;
    const params: Record<string, string | number> = {};
    const options: { squad?: Squad; at?: { x: number; z: number } } = {};
    if (squad) {
      options.squad = squad;
    } else {
      const me = ctx.player.person();
      options.at = me ? { x: me.x, z: me.z } : { x: ctx.session.config?.x ?? 0, z: ctx.session.config?.z ?? 0 };
    }
    switch (key) {
      case 'ambiance_effectif':
      case 'ambiance_affrontement':
        if (squad) params['nombre'] = squad.members.length;
        break;
      case 'ambiance_rassemblement':
      case 'ambiance_cortege':
      case 'ambiance_dispersion':
        if (stats.present > 0) params['nombre'] = estimateCount(stats.present);
        break;
      case 'ambiance_meteo':
        params['meteo'] = WEATHER_WORDS[ctx.env.state.weather] ?? 'stable';
        break;
      default:
        break;
    }
    this.phrases.say(key, params as PhraseParams, options);
  }
}
