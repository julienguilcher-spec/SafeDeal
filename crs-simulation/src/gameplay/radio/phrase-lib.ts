/* =====================================================================================
 * Radio — bibliothèque de phrases : registre des situations et composition des messages.
 *
 * Message = « APPELÉ ICI APPELANT. corps. PARLEZ. » (ou « TERMINÉ. »), d'après la procédure radiotéléphonique
 * de docs/research/00-bible-realisme.md (E.6). Les nombres passés en paramètres sont dits chiffre par chiffre.
 * ===================================================================================== */

import type { GameContext, RadioMessage, Rng, Squad } from '@/core/contracts';
import type { CallsignBook, PhraseInfo, PhraseParam, PhraseParams, PhraseRole, RadioPhrases, SayOptions } from './api';
import { DYNAMIC_PARAMS, PARAM_DEFAULTS, UNIT_PARAMS } from './phrases/defaults';
import type { PhraseDef } from './phrases/define';
import { PHRASES_MISE_EN_PLACE } from './phrases/a-mise-en-place';
import { PHRASES_VIOLENCES_FORCE } from './phrases/b-violences-force';
import { PHRASES_MANOEUVRES_INCIDENTS } from './phrases/c-manoeuvres-incidents';
import { PHRASES_MOYENS_FIN_AMBIANCE } from './phrases/d-moyens-fin-ambiance';
import { capitalize, paramToText, placeholdersOf, spokenCallsign, spokenTime, typo } from './text';

/** Toutes les situations de la bibliothèque, dans l'ordre de la documentation. */
export const ALL_PHRASES: readonly PhraseDef[] = [
  ...PHRASES_MISE_EN_PLACE,
  ...PHRASES_VIOLENCES_FORCE,
  ...PHRASES_MANOEUVRES_INCIDENTS,
  ...PHRASES_MOYENS_FIN_AMBIANCE,
];

const BY_KEY: ReadonlyMap<string, PhraseDef> = new Map(ALL_PHRASES.map((d) => [d.key, d] as const));

/** Paramètres reconnus dans les variantes d'une définition. */
export function paramsOf(def: PhraseDef): string[] {
  const out: string[] = [];
  for (const v of def.variants) for (const p of placeholdersOf(v)) if (!out.includes(p)) out.push(p);
  return out;
}

export function infoOf(def: PhraseDef): PhraseInfo {
  return {
    key: def.key,
    group: def.group,
    from: def.from,
    to: def.to,
    channel: def.channel,
    priority: def.priority,
    end: def.end,
    variants: def.variants.length,
    params: paramsOf(def),
  };
}

/** Environnement de composition : indicatifs, heure, lieu et unité courante. */
export interface ComposeEnv {
  readonly company: string;
  readonly commandant: string;
  readonly central: string;
  /** Heure de la journée (0..24) pour {heure} quand il n'est pas fourni. */
  readonly hour: number;
  /** Indicatif de l'émetteur quand le rôle est « unite ». */
  readonly unitCallsign: string;
  special(kind: 'canon' | 'centaure' | 'drone' | 'bravm' | 'samu' | 'pompiers' | 'liaison'): string;
}

function roleCallsign(role: PhraseRole, params: PhraseParams, env: ComposeEnv): string {
  const given = (name: string): string => paramToText(params[name]);
  switch (role) {
    case 'central':
      return env.central;
    case 'unite':
      return env.unitCallsign;
    case 'cible':
      return given('cible') || env.company;
    case 'commandant':
      return env.commandant;
    case 'tous':
      return 'TOUTES UNITÉS';
    case 'presse':
      return 'PRESSE';
    default:
      return given(role) || env.special(role);
  }
}

function paramValue(name: string, params: PhraseParams, env: ComposeEnv): string {
  const raw: PhraseParam = params[name];
  if (name === 'heure') {
    if (typeof raw === 'number') return spokenTime(raw);
    const text = paramToText(raw);
    return text || spokenTime(env.hour);
  }
  if (name === 'unite') return spokenCallsign(env.unitCallsign);
  if (name === 'cible') return spokenCallsign(paramToText(raw) || env.company);
  const text = paramToText(raw);
  if (text) return UNIT_PARAMS.has(name) ? spokenCallsign(text) : text;
  return PARAM_DEFAULTS[name] ?? '';
}

/** Compose le texte complet d'une variante (formule d'appel, corps, formule de fin), typographie française appliquée. */
export function compose(def: PhraseDef, variant: number, params: PhraseParams, env: ComposeEnv): string {
  const n = def.variants.length;
  const template = def.variants[((variant % n) + n) % n]!;
  const body = template.replace(/\{([a-z_]+)\}/g, (_all, name: string) => paramValue(name, params, env));
  const from = spokenCallsign(roleCallsign(def.from, params, env));
  const to = spokenCallsign(roleCallsign(def.to, params, env));
  const head = from === to ? '' : `${to} ICI ${from}. `;
  const end = def.end === 'parlez' ? ' PARLEZ.' : def.end === 'termine' ? ' TERMINÉ.' : '';
  let text = capitalize(body.trim());
  if (end && !/[.!?]$/.test(text)) text += '.';
  return typo(`${head}${text}${end}`.replace(/\{[^}]*\}|[{}]/g, ''));
}

export interface PhraseLibraryDeps {
  readonly ctx: GameContext;
  readonly calls: CallsignBook;
  /** Générateur du tirage des variantes (re-créé à chaque session par le module). */
  rng(): Rng;
  /** Diffuse un message composé (file d'attente de la radio). Retourne false s'il est écarté. */
  submit(msg: RadioMessage): boolean;
}

export function createPhraseLibrary(deps: PhraseLibraryDeps): RadioPhrases {
  const { ctx, calls } = deps;
  const lastVariants = new Map<string, number[]>();

  function squadOf(options: SayOptions | undefined): Squad | undefined {
    const s = options?.squad;
    if (s === undefined) return undefined;
    return typeof s === 'number' ? ctx.squads.get(s) : s;
  }

  /** Position d'où l'on parle, pour nommer le secteur : option, chef de l'unité, personne, joueur. */
  function positionOf(options: SayOptions | undefined, squad: Squad | undefined): { x: number; z: number } | null {
    if (options?.at) return options.at;
    if (squad) {
      const leader = ctx.people.get(squad.leaderId);
      if (leader) return leader;
    }
    if (options?.personId) {
      const p = ctx.people.get(options.personId);
      if (p) return p;
    }
    return null;
  }

  function sectorLabel(at: { x: number; z: number }): string {
    const name = ctx.world.sectorName(at.x, at.z);
    return name.replace(/^secteur\s+/i, '').trim();
  }

  function envFor(options: SayOptions | undefined, params: PhraseParams): { env: ComposeEnv; params: PhraseParams } {
    const squad = squadOf(options);
    const given = paramToText(params['unite']);
    let unit = options?.from ?? '';
    if (!unit) unit = given || (squad ? calls.callsign(squad) : '') || (options?.personId ? calls.callsign(ctx.people.get(options.personId) ?? 0) : '');
    if (!unit) unit = calls.company;
    let merged = params;
    if (params['lieu'] === undefined || params['lieu'] === null || paramToText(params['lieu']) === '') {
      const at = positionOf(options, squad);
      if (at) merged = { ...params, lieu: sectorLabel(at) };
    }
    const env: ComposeEnv = {
      company: calls.company,
      commandant: calls.commandant,
      central: calls.central,
      hour: ctx.env.state.timeOfDay,
      unitCallsign: unit,
      special: (k) => calls.special(k),
    };
    return { env, params: merged };
  }

  function pick(def: PhraseDef, forced: number | undefined): number {
    const n = def.variants.length;
    if (forced !== undefined) return ((forced % n) + n) % n;
    if (n === 1) return 0;
    // on évite les deux dernières variantes employées quand il en reste assez (jamais deux fois de suite la même)
    const history = lastVariants.get(def.key) ?? [];
    const avoid = n >= 4 ? history : history.slice(-1);
    const free: number[] = [];
    for (let i = 0; i < n; i++) if (!avoid.includes(i)) free.push(i);
    const v = free[deps.rng().int(0, free.length)]!;
    lastVariants.set(def.key, [...history.slice(-1), v]);
    return v;
  }

  const keys: string[] = ALL_PHRASES.map((d) => d.key);

  return {
    keys,
    has: (key) => BY_KEY.has(key),
    info(key) {
      const def = BY_KEY.get(key);
      return def ? infoOf(def) : undefined;
    },
    text(key, params = {}, variant = 0) {
      const def = BY_KEY.get(key);
      if (!def) return '';
      const e = envFor(undefined, params);
      return compose(def, variant, e.params, e.env);
    },
    variants(key, params = {}) {
      const def = BY_KEY.get(key);
      if (!def) return [];
      const e = envFor(undefined, params);
      return def.variants.map((_v, i) => compose(def, i, e.params, e.env));
    },
    say(key, params = {}, options) {
      const def = BY_KEY.get(key);
      if (!def) return false;
      const e = envFor(options, params);
      const text = compose(def, pick(def, options?.variant), e.params, e.env);
      const from = def.from === 'unite' ? e.env.unitCallsign : roleCallsign(def.from, e.params, e.env);
      const msg: RadioMessage = {
        channel: options?.channel ?? def.channel,
        from: from.toUpperCase(),
        text,
        priority: options?.priority ?? def.priority,
        voice: calls.voiceOf(from),
      };
      if (options?.personId !== undefined) msg.personId = options.personId;
      else {
        const squad = squadOf(options);
        if (squad && squad.leaderId > 0) msg.personId = squad.leaderId;
      }
      return deps.submit(msg);
    },
  };
}
