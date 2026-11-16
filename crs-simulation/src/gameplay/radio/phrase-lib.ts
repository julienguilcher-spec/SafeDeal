/* =====================================================================================
 * Radio — bibliothèque de phrases : registre des situations et composition des messages.
 *
 * Message = « APPELÉ ICI APPELANT. corps. PARLEZ. » (ou « TERMINÉ. »), réponse = « ICI APPELANT. corps. TERMINÉ. »,
 * d'après la procédure radiotéléphonique de docs/research/00-bible-realisme.md (E.6 et E.7).
 * Les nombres passés en paramètres sont dits chiffre par chiffre.
 * ===================================================================================== */

import type { GameContext, RadioChannel, RadioMessage, Rng, Squad } from '@/core/contracts';
import { cardinalFr } from '@/core/math';
import type { CallsignBook, PhraseInfo, PhraseParam, PhraseParams, PhraseRole, RadioPhrases, SayOptions } from './api';
import { PARAM_DEFAULTS, UNIT_PARAMS } from './phrases/defaults';
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

/** Appel collectif : ordre sans destinataire nommé, message de la salle à tous. */
export const ALL_UNITS = 'TOUTES UNITÉS';

/** Ordres dont le cap est celui de la formation : la direction de face de l'unité se lit dans l'ordre reçu. */
const FACING_ORDERS: ReadonlySet<string> = new Set([
  'tenir', 'ligne', 'tortue', 'avancer', 'bond_offensif', 'charge', 'refoulement', 'proteger', 'filtrer',
  'couper_circulation',
]);

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
    reply: def.reply,
    variants: def.variants.length,
    params: paramsOf(def),
  };
}

/** Environnement de composition : indicatifs, heure et unité courante. */
export interface ComposeEnv {
  readonly company: string;
  readonly commandant: string;
  readonly central: string;
  /** Heure de la journée (0..24) pour {heure} quand il n'est pas fourni. */
  readonly hour: number;
  /** Indicatif de l'unité : émetteur quand le rôle « unite » parle, destinataire quand on s'adresse à lui. */
  readonly unitCallsign: string;
  /** Indicatif imposé à l'émetteur (options.from), quel que soit son rôle. */
  readonly fromOverride?: string;
  /** Indicatif imposé au destinataire (options.to). */
  readonly toOverride?: string;
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
      return given('cible') || ALL_UNITS;
    case 'commandant':
      return env.commandant;
    case 'tous':
      return ALL_UNITS;
    case 'presse':
      return 'PRESSE';
    default:
      return given(role) || env.special(role);
  }
}

/** Les deux correspondants d'un message : indicatifs écrits (« MISTRAL 2 »), jamais identiques. */
export function correspondents(def: PhraseDef, params: PhraseParams, env: ComposeEnv): { from: string; to: string } {
  const from = (env.fromOverride || roleCallsign(def.from, params, env)).toUpperCase();
  let to = (env.toOverride || roleCallsign(def.to, params, env)).toUpperCase();
  if (to === from) {
    // on ne s'appelle pas soi-même : le chef qui parle rend compte à la salle ; son ordre sans destinataire, ou
    // adressé à sa propre unité, vaut pour toutes ses unités
    to = def.to === 'cible' || def.to === 'unite' || from === env.central.toUpperCase() ? ALL_UNITS : env.central.toUpperCase();
  }
  return { from, to };
}

function paramValue(name: string, params: PhraseParams, env: ComposeEnv): string {
  const raw: PhraseParam = params[name];
  if (name === 'heure') {
    if (typeof raw === 'number') return spokenTime(raw);
    const text = paramToText(raw);
    return text || spokenTime(env.hour);
  }
  if (name === 'unite') return spokenCallsign(env.unitCallsign);
  const text = paramToText(raw);
  if (text) return UNIT_PARAMS.has(name) ? spokenCallsign(text) : text;
  if (name === 'cible') return ALL_UNITS;
  return PARAM_DEFAULTS[name] ?? '';
}

/** Capitale au début de chaque phrase du corps (une valeur par défaut peut ouvrir une phrase). */
function capitalizeSentences(text: string): string {
  return capitalize(text).replace(/([.!?]\s+)(\p{Ll})/gu, (_all, sep: string, letter: string) => sep + letter.toUpperCase());
}

/** Compose le texte complet d'une variante (formule d'appel, corps, formule de fin), typographie française appliquée. */
export function compose(def: PhraseDef, variant: number, params: PhraseParams, env: ComposeEnv): string {
  const n = def.variants.length;
  const template = def.variants[((variant % n) + n) % n]!;
  const body = template.replace(/\{([a-z_]+)\}/g, (_all, name: string) => paramValue(name, params, env));
  const who = correspondents(def, params, env);
  const from = spokenCallsign(who.from);
  const head = def.reply ? `ICI ${from}. ` : `${spokenCallsign(who.to)} ICI ${from}. `;
  const end = def.end === 'parlez' ? ' PARLEZ.' : def.end === 'termine' ? ' TERMINÉ.' : '';
  let text = capitalizeSentences(body.trim());
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

  /** Position dont on parle, pour nommer le secteur : option, chef de l'unité, personne qui parle. */
  function positionOf(options: SayOptions | undefined, squad: Squad | undefined): { x: number; z: number } | null {
    if (options?.at) return options.at;
    if (squad) {
      const leader = ctx.people.get(squad.leaderId);
      if (leader) return leader;
      for (let i = 0; i < squad.members.length; i++) {
        const member = ctx.people.get(squad.members[i]!);
        if (member) return member;
      }
    }
    if (options?.personId) {
      const p = ctx.people.get(options.personId);
      if (p) return p;
    }
    return null;
  }

  /** Nom du secteur sans son préfixe (« place de la Concorde ») ; vide si le monde ne sait pas le nommer. */
  function sectorLabel(at: { x: number; z: number }): string {
    const name = ctx.world.sectorName(at.x, at.z).replace(/^secteur\s+/i, '').trim();
    return /^inconnu$/i.test(name) ? '' : name;
  }

  /** Direction de face de l'unité qui parle : cap de sa formation si elle en tient une, sinon cap de son chef. */
  function facingOf(squad: Squad): string {
    if (FACING_ORDERS.has(squad.order.type)) return cardinalFr(squad.order.heading);
    const leader = ctx.people.get(squad.leaderId);
    return leader ? cardinalFr(leader.heading) : '';
  }

  function absent(params: PhraseParams, name: string): boolean {
    return paramToText(params[name]) === '';
  }

  function targetCallsign(to: SayOptions['to']): string {
    if (to === undefined) return '';
    if (typeof to === 'string') return to.trim();
    return calls.callsign(to);
  }

  function envFor(def: PhraseDef, options: SayOptions | undefined, params: PhraseParams): { env: ComposeEnv; params: PhraseParams } {
    const squad = squadOf(options);
    const speaks = def.from === 'unite';
    // indicatif de l'unité : imposé, fourni en paramètre, celui de l'unité, celui de la personne qui parle, la compagnie
    let unit = speaks ? (options?.from ?? '').trim() : '';
    if (!unit) unit = paramToText(params['unite']) || (squad ? calls.callsign(squad) : '');
    if (!unit && speaks && options?.personId) {
      const person = ctx.people.get(options.personId);
      if (person) unit = calls.callsign(person);
    }
    if (!unit) unit = calls.company;

    const added: Record<string, PhraseParam> = {};
    const at = positionOf(options, squad);
    const sector = at ? sectorLabel(at) : '';
    if (sector && absent(params, 'lieu')) added['lieu'] = sector;
    if (absent(params, 'voie')) {
      const street = paramToText(params['lieu']) || sector;
      if (street) added['voie'] = street;
    }
    if (speaks && squad && absent(params, 'direction')) {
      const facing = facingOf(squad);
      if (facing) added['direction'] = facing;
    }

    const from = (options?.from ?? '').trim();
    const to = targetCallsign(options?.to);
    const env: ComposeEnv = {
      company: calls.company,
      commandant: calls.commandant,
      central: calls.central,
      hour: ctx.env.state.timeOfDay,
      unitCallsign: unit,
      ...(from ? { fromOverride: from } : {}),
      ...(to ? { toOverride: to } : {}),
      special: (k) => calls.special(k),
    };
    return { env, params: Object.keys(added).length > 0 ? { ...params, ...added } : params };
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
      const e = envFor(def, undefined, params);
      return compose(def, variant, e.params, e.env);
    },
    variants(key, params = {}) {
      const def = BY_KEY.get(key);
      if (!def) return [];
      const e = envFor(def, undefined, params);
      return def.variants.map((_v, i) => compose(def, i, e.params, e.env));
    },
    say(key, params = {}, options) {
      const def = BY_KEY.get(key);
      if (!def) return false;
      const e = envFor(def, options, params);
      const text = compose(def, pick(def, options?.variant), e.params, e.env);
      const who = correspondents(def, e.params, e.env);
      // un échange avec la salle passe par le canal de commandement, même quand la phrase est prévue pour la compagnie
      const central = calls.central.toUpperCase();
      const channel: RadioChannel = options?.channel
        ?? (def.channel === 'unite' && (who.from === central || who.to === central) ? 'commandement' : def.channel);
      const msg: RadioMessage = {
        channel,
        from: who.from,
        text,
        priority: options?.priority ?? def.priority,
        voice: calls.voiceOf(who.from),
      };
      if (options?.personId !== undefined) msg.personId = options.personId;
      else if (def.from === 'unite') {
        const squad = squadOf(options);
        if (squad && squad.leaderId > 0) msg.personId = squad.leaderId;
      }
      return deps.submit(msg);
    },
  };
}
