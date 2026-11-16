/* =====================================================================================
 * Radio — indicatifs (tous fictifs, docs/research/00-bible-realisme.md E.5).
 *
 *   salle de commandement   CENTRAL
 *   compagnie et commandant MISTRAL             (nom de vent : MISTRAL, TRAMONTANE, SIROCCO, ZÉPHYR)
 *                                               Le commandant est le chef unique : commandement ET autorité
 *                                               habilitée. Il parle sous l'indicatif de sa compagnie, comme dans
 *                                               les messages de la bible (« MISTRAL DEUX ICI MISTRAL »).
 *   sections                MISTRAL 1 … n
 *   groupes                 MISTRAL 2 ALFA / BRAVO / CHARLIE
 *   escadron, pelotons      ÉPERVIER, ÉPERVIER 1 … 4
 *   BRAV-M                  FAUCON 1 … 3
 *   Centaure                CENTAURE 1
 *   canon à eau             NEPTUNE 1
 *   drone                   ICARE
 *   liaison                 LIAISON
 *   SAMU, secouristes       SANTÉ 1
 *   sapeurs-pompiers        SAPEUR 1            (ajout du jeu : la bible ne prévoit que « SANTÉ » pour les secours)
 *
 * Squad.name est, d'après le contrat, l'indicatif radio de l'unité : un nom déjà écrit dans ce plan d'indicatifs
 * (« Tramontane 2 », « ÉPERVIER 3 », « Mistral 1 Alfa ») est repris tel quel, en capitales. Les autres unités
 * reçoivent un indicatif d'après leur nature et leur rang de création.
 * ===================================================================================== */

import type { GameContext, Person, Squad } from '@/core/contracts';
import { hashString } from '@/core/rng';
import type { CallsignBook } from './api';
import { spokenCallsign } from './text';

export const CENTRAL = 'CENTRAL';
export const DEFAULT_COMPANY = 'MISTRAL';
/** Alphabet radio (ALFA, BRAVO, CHARLIE…) pour les groupes d'une section. */
const GROUP_LETTERS = ['ALFA', 'BRAVO', 'CHARLIE', 'DELTA', 'ECHO', 'FOXTROT'] as const;
/** Compagnies de CRS du plan d'indicatifs (noms de vents). */
export const COMPANY_NAMES = ['MISTRAL', 'TRAMONTANE', 'SIROCCO', 'ZÉPHYR'] as const;
/** Nombre de voix de synthèse distinctes proposées par le module audio. */
export const VOICE_COUNT = 6;

const SPECIAL_DEFAULTS = {
  canon: 'NEPTUNE 1',
  centaure: 'CENTAURE 1',
  drone: 'ICARE',
  bravm: 'FAUCON 1',
  samu: 'SANTÉ 1',
  pompiers: 'SAPEUR 1',
  liaison: 'LIAISON',
} as const;

const SPECIAL_PREFIX: Record<keyof typeof SPECIAL_DEFAULTS, string> = {
  canon: 'NEPTUNE',
  centaure: 'CENTAURE',
  drone: 'ICARE',
  bravm: 'FAUCON',
  samu: 'SANTÉ',
  pompiers: 'SAPEUR',
  liaison: 'LIAISON',
};

/** Majuscules sans accents, pour reconnaître un nom d'unité quelle que soit sa graphie. */
function fold(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
}

function isSquad(who: Squad | Person): who is Squad {
  return (who as Squad).members !== undefined;
}

export function createCallsigns(ctx: GameContext): CallsignBook {
  function company(): string {
    const extra = ctx.session.config?.extra;
    const name = extra && typeof extra['compagnie'] === 'string' ? (extra['compagnie'] as string).trim() : '';
    return name ? name.toUpperCase() : DEFAULT_COMPANY;
  }

  /** Rang (à partir de 1) d'une unité parmi celles de même nature et de même faction, dans l'ordre de création. */
  function ordinal(squad: Squad, same: (s: Squad) => boolean): number {
    let n = 0;
    const list = ctx.squads.list;
    for (let i = 0; i < list.length; i++) {
      const s = list[i]!;
      if (!same(s)) continue;
      n++;
      if (s.id === squad.id) return n;
    }
    return n === 0 ? 1 : n;
  }

  function byName(squad: Squad): string | null {
    const raw = squad.name.trim();
    if (!raw) return null;
    const f = fold(raw);
    const num = /(\d+)\s*$/.exec(f)?.[1] ?? '';
    const suffix = (n: string): string => (n ? ` ${n}` : ' 1');
    if (/CENTAURE/.test(f)) return `CENTAURE${suffix(num)}`;
    if (/NEPTUNE|CANON|LANCEUR D.EAU/.test(f)) return `NEPTUNE${suffix(num)}`;
    if (/ICARE|DRONE/.test(f)) return 'ICARE';
    if (/FAUCON|BRAV[ -]?M\b/.test(f)) return `FAUCON${suffix(num)}`;
    if (/SANTE|SAMU|MEDIC|SECOURISTE/.test(f)) return `SANTÉ${suffix(num)}`;
    if (/POMPIER|SAPEUR|BSPP/.test(f)) return `SAPEUR${suffix(num)}`;
    if (/LIAISON/.test(f)) return 'LIAISON';
    if (/EPERVIER|ESCADRON/.test(f)) return num ? `ÉPERVIER ${num}` : 'ÉPERVIER';
    return null;
  }

  /**
   * Nom d'unité déjà écrit dans le plan d'indicatifs : compagnie (celle de la session ou un autre nom de vent),
   * éventuellement suivie d'un numéro de section et d'une lettre de groupe ; escadron et ses pelotons.
   * Retourne l'indicatif en capitales avec ses accents, ou null.
   */
  function planned(squad: Squad): string | null {
    if (squad.faction !== 'police') return null;
    const raw = squad.name.trim().replace(/\s+/g, ' ');
    if (!raw) return null;
    const m = /^(\p{L}+)(?: (\d{1,2}))?(?: (\p{L}+))?$/u.exec(raw);
    if (!m) return null;
    const word = fold(m[1]!);
    const names: string[] = [company(), ...COMPANY_NAMES, 'ÉPERVIER'];
    const base = names.find((n) => fold(n) === word);
    if (!base) return null;
    let out = base;
    if (m[2]) out += ` ${Number(m[2])}`;
    if (m[3]) {
      const letter = GROUP_LETTERS.find((l) => l === fold(m[3]!) || (l === 'ALFA' && fold(m[3]!) === 'ALPHA'));
      if (!letter || !m[2]) return null;
      out += ` ${letter}`;
    }
    return out;
  }

  function ofSquad(squad: Squad): string {
    const co = company();
    const kept = planned(squad);
    if (kept) return kept;
    const named = byName(squad);
    if (named) return named;
    if (squad.faction === 'protest') return squad.name.trim() ? squad.name.trim().toUpperCase() : 'CORTÈGE';
    if (squad.faction === 'press') return 'PRESSE';
    if (squad.faction === 'medic') return `SANTÉ ${ordinal(squad, (s) => s.faction === 'medic')}`;
    if (squad.faction === 'rescue') return `SAPEUR ${ordinal(squad, (s) => s.faction === 'rescue')}`;
    if (squad.faction === 'civil') return squad.name.trim() ? squad.name.trim().toUpperCase() : 'CIVIL';
    switch (squad.kind) {
      case 'compagnie':
        return co;
      case 'section': {
        // section d'une compagnie : numérotée parmi ses sœurs, sous l'indicatif de SA compagnie
        const parent = squad.parentId > 0 ? ctx.squads.get(squad.parentId) : undefined;
        if (parent && parent.kind === 'compagnie') {
          return `${ofSquad(parent)} ${ordinal(squad, (s) => s.kind === 'section' && s.parentId === squad.parentId)}`;
        }
        return `${co} ${ordinal(squad, (s) => s.kind === 'section' && s.faction === 'police' && s.parentId === squad.parentId)}`;
      }
      case 'groupe': {
        const parent = squad.parentId > 0 ? ctx.squads.get(squad.parentId) : undefined;
        const base = parent ? ofSquad(parent) : co;
        const rank = ordinal(squad, (s) => s.kind === 'groupe' && s.parentId === squad.parentId);
        return `${base} ${GROUP_LETTERS[(rank - 1) % GROUP_LETTERS.length]!}`;
      }
      case 'peloton':
        return `ÉPERVIER ${ordinal(squad, (s) => s.kind === 'peloton' && s.faction === 'police')}`;
      case 'binome':
        return `FAUCON ${ordinal(squad, (s) => s.kind === 'binome' && s.faction === 'police')}`;
      case 'secours':
        return `SANTÉ ${ordinal(squad, (s) => s.kind === 'secours')}`;
      case 'equipage':
        return squad.name.trim() ? squad.name.trim().toUpperCase() : `ÉQUIPAGE ${ordinal(squad, (s) => s.kind === 'equipage')}`;
      default:
        return squad.name.trim() ? squad.name.trim().toUpperCase() : co;
    }
  }

  function ofPerson(person: Person): string {
    const co = company();
    // le chef unique (commandant d'unité, autorité habilitée, alias « commissaire ») : indicatif de sa compagnie
    if (person.poste === 'commandant_unite' || person.poste === 'autorite_civile' || person.kind === 'commissaire') {
      const own = person.squadId > 0 ? ctx.squads.get(person.squadId) : undefined;
      if (own && own.kind === 'compagnie') return ofSquad(own);
      return co;
    }
    if (person.squadId > 0) {
      const squad = ctx.squads.get(person.squadId);
      if (squad) return ofSquad(squad);
    }
    switch (person.kind) {
      case 'telepilote':
        return SPECIAL_DEFAULTS.drone;
      case 'bravm':
        return SPECIAL_DEFAULTS.bravm;
      case 'pompier':
        return SPECIAL_DEFAULTS.pompiers;
      case 'samu':
      case 'street_medic':
        return SPECIAL_DEFAULTS.samu;
      case 'gendarme':
        return 'ÉPERVIER';
      case 'journaliste':
        return 'PRESSE';
      case 'crs':
      case 'policier_civil':
        return co;
      default:
        return person.name.trim() ? person.name.trim().toUpperCase() : 'INCONNU';
    }
  }

  function find(prefix: string): string | null {
    const list = ctx.squads.list;
    for (let i = 0; i < list.length; i++) {
      const c = ofSquad(list[i]!);
      if (c.startsWith(prefix)) return c;
    }
    return null;
  }

  return {
    central: CENTRAL,
    get company(): string {
      return company();
    },
    get commandant(): string {
      return company();
    },
    callsign(who: Squad | Person | number): string {
      if (typeof who === 'number') {
        const squad = ctx.squads.get(who);
        if (squad) return ofSquad(squad);
        const person = ctx.people.get(who);
        return person ? ofPerson(person) : company();
      }
      return isSquad(who) ? ofSquad(who) : ofPerson(who);
    },
    spoken: spokenCallsign,
    voiceOf(callsign: string): number {
      return hashString(callsign.toUpperCase()) % VOICE_COUNT;
    },
    special(kind): string {
      return find(SPECIAL_PREFIX[kind]) ?? SPECIAL_DEFAULTS[kind];
    },
  };
}
