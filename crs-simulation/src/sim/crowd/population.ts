/* =====================================================================================
 * FOULE — qui vient manifester : cause du jour, composition (familles visuelles et profils), groupes
 * d'affinité, création des personnes.
 *
 * Quand le module des archétypes est branché, la composition vient de ses services 'roles.spawn'
 * (crowd, spawnSlot) et 'roles.causes' (slogans, organisations fictives). Sinon une composition par
 * défaut équivalente est construite ici, d'après la même table (bible F.1), et les personnes sont
 * créées par ctx.archetypes.spawn avec une apparence et une dotation minimales.
 * ===================================================================================== */

import type { GameContext, ItemId, Person, PersonLook, ProtestProfile, Rng } from '@/core/contracts';
import { FAMILIES } from './api';
import type { ChantText, CrowdCause, CrowdFamily, CrowdScenario, GroupKind } from './api';

// ───────────────────────────── services facultatifs (formes consommées) ─────────────────────────────

interface RolesChant { call: string; response: string }
interface RolesOrg { name: string; sigle?: string; color?: number }
interface RolesCause {
  id: string; label: string; summary?: string; index: number;
  chants?: readonly RolesChant[]; orgs?: readonly RolesOrg[]; colors?: readonly number[];
}
interface RolesCausesLike {
  list?: readonly RolesCause[];
  get(id: string | number): RolesCause | undefined;
}
interface RolesSlot { kind: string; profile: ProtestProfile | null; family: string; carry?: string; child?: boolean }
interface RolesSpawnLike {
  crowd(cause: string | number, count: number, composition?: unknown, rng?: Rng): RolesSlot[];
  spawnSlot(slot: RolesSlot, x: number, z: number, opts?: Record<string, unknown>): Person;
}

// ───────────────────────────── causes par défaut ─────────────────────────────

interface DefaultCause {
  id: string; label: string; summary: string; color: number;
  chants: readonly ChantText[]; orgs: readonly string[];
  mix: Readonly<Partial<Record<CrowdFamily, number>>>;
}

const COMMON_CHANTS: readonly ChantText[] = [
  { call: 'Tous ensemble, tous ensemble !', response: 'Ouais ! Ouais !' },
  { call: 'Et la rue, elle est à qui ?', response: 'Elle est à nous !' },
  { call: 'On ne lâche rien !', response: 'On ne lâche rien !' },
];

function c(call: string, response: string): ChantText {
  return { call, response };
}

/** Causes de secours (BRIEF §1) : thèmes réalistes, slogans génériques, organisations FICTIVES. */
const DEFAULT_CAUSES: readonly DefaultCause[] = [
  {
    id: 'retraites', label: 'Retraites', color: 0xc8102e,
    summary: 'Les manifestants demandent le retrait du projet sur les retraites.',
    chants: [c('Retrait ! Retrait !', 'Retrait du projet !'), c('La retraite, on s’est battus pour la gagner,', 'on se battra pour la garder !'), c('Une vie de travail,', 'une pension pour vivre !')],
    orgs: ['Union des Salariés Solidaires', 'Fédération du Travail Uni', 'Coordination des Retraités'],
    mix: { syndical: 0.45, retraites: 0.15, divers: 0.15, etudiants: 0.1, familles: 0.05, soignants: 0.05, gilets_jaunes: 0.05 },
  },
  {
    id: 'pouvoir_achat', label: 'Pouvoir d’achat', color: 0xdfff00,
    summary: 'Les manifestants demandent des hausses de salaires et la baisse des prix.',
    chants: [c('On veut vivre,', 'pas survivre !'), c('Des salaires,', 'pas des miettes !'), c('Fin du mois, fin du monde,', 'même combat !')],
    orgs: ['Collectif Fins de Mois', 'Union des Salariés Solidaires'],
    mix: { gilets_jaunes: 0.4, divers: 0.25, syndical: 0.2, retraites: 0.1, familles: 0.05 },
  },
  {
    id: 'climat', label: 'Climat', color: 0x2e9e44,
    summary: 'Les manifestants demandent des mesures contre le dérèglement climatique.',
    chants: [c('Et un, et deux, et trois degrés,', 'c’est un crime contre l’humanité !'), c('Il n’y a pas', 'de planète B !'), c('On est plus chauds, plus chauds,', 'plus chauds que le climat !')],
    orgs: ['Collectif Demain Vivant', 'Jeunesse pour la Planète'],
    mix: { climat: 0.5, etudiants: 0.2, familles: 0.15, divers: 0.15 },
  },
  {
    id: 'logement', label: 'Logement', color: 0xe07a1f,
    summary: 'Les manifestants demandent des logements abordables et l’arrêt des expulsions.',
    chants: [c('Un toit,', 'c’est un droit !'), c('Des logements,', 'pas des profits !'), c('Loyers trop chers,', 'on reste dans la rue !')],
    orgs: ['Association Un Toit Pour Tous', 'Collectif des Locataires Unis'],
    mix: { divers: 0.4, familles: 0.2, etudiants: 0.2, syndical: 0.2 },
  },
  {
    id: 'hopital', label: 'Hôpital', color: 0xf5f5f5,
    summary: 'Les personnels soignants demandent des lits, des postes et du temps pour soigner.',
    chants: [c('Des lits, des bras,', 'du temps pour soigner !'), c('L’hôpital', 'n’est pas une entreprise !'), c('Soignants épuisés,', 'patients en danger !')],
    orgs: ['Coordination des Soignants', 'Union des Salariés Solidaires'],
    mix: { soignants: 0.55, syndical: 0.2, divers: 0.15, retraites: 0.1 },
  },
  {
    id: 'education', label: 'Éducation', color: 0x2f6fd0,
    summary: 'Enseignants, étudiants et parents demandent des moyens pour l’école et l’université.',
    chants: [c('Notre avenir', 'n’est pas à vendre !'), c('Des profs, des classes,', 'pas des économies !'), c('Étudiants, lycéens,', 'même combat !')],
    orgs: ['Fédération des Enseignants Unis', 'Union Étudiante Solidaire'],
    mix: { etudiants: 0.5, syndical: 0.25, familles: 0.15, divers: 0.1 },
  },
  {
    id: 'agricole', label: 'Monde agricole', color: 0x4c7a2a,
    summary: 'Les agriculteurs demandent des prix qui paient leur travail.',
    chants: [c('Sans paysans,', 'pas de pain !'), c('On nourrit le pays,', 'on veut en vivre !'), c('Des prix,', 'pas des primes !')],
    orgs: ['Coordination des Campagnes', 'Union des Fermes Familiales'],
    mix: { agriculteurs: 0.7, divers: 0.15, familles: 0.1, syndical: 0.05 },
  },
  {
    id: 'carburants', label: 'Prix des carburants', color: 0xdfff00,
    summary: 'Les manifestants demandent la baisse des taxes sur les carburants.',
    chants: [c('Le plein trop cher,', 'on reste pas chez nous !'), c('On roule pour bosser,', 'pas pour payer !'), c('Baissez les taxes,', 'pas nos salaires !')],
    orgs: ['Collectif des Ronds-Points', 'Collectif Fins de Mois'],
    mix: { gilets_jaunes: 0.6, divers: 0.25, agriculteurs: 0.1, retraites: 0.05 },
  },
  {
    id: 'libertes', label: 'Libertés publiques', color: 0x6a4fb3,
    summary: 'Les manifestants défendent le droit de manifester et les libertés publiques.',
    chants: [c('Liberté,', 'liberté de manifester !'), c('Nos droits,', 'on ne les lâche pas !'), c('Filmer, informer,', 'c’est un droit !')],
    orgs: ['Collectif Libertés pour Tous', 'Ligue des Droits Citoyens'],
    mix: { divers: 0.4, etudiants: 0.3, syndical: 0.15, climat: 0.1, familles: 0.05 },
  },
];

/** Cause du jour : celle de la configuration, sinon tirée d'après la graine. */
export function resolveCause(ctx: GameContext, extra: Record<string, unknown>, rng: Rng): CrowdCause {
  const wanted = typeof extra['cause'] === 'string' ? (extra['cause'] as string) : '';
  const roles = ctx.service<RolesCausesLike>('roles.causes');
  if (roles && typeof roles.get === 'function') {
    let rc = wanted !== '' ? roles.get(wanted) : undefined;
    if (!rc && roles.list && roles.list.length > 0) rc = roles.list[rng.int(0, roles.list.length)];
    if (rc) {
      const chants: ChantText[] = [];
      if (rc.chants) for (const ch of rc.chants) chants.push({ call: ch.call, response: ch.response });
      for (const ch of COMMON_CHANTS) chants.push(ch);
      const orgs: string[] = [];
      if (rc.orgs) for (const o of rc.orgs) orgs.push(o.name);
      return {
        id: rc.id, label: rc.label, summary: rc.summary ?? '', index: rc.index, chants, orgs,
        color: rc.colors && rc.colors.length > 0 ? rc.colors[0]! : 0xc8102e,
      };
    }
  }
  let def = DEFAULT_CAUSES.find((d) => d.id === wanted);
  if (!def) def = DEFAULT_CAUSES[rng.int(0, DEFAULT_CAUSES.length)]!;
  return {
    id: def.id, label: def.label, summary: def.summary, index: DEFAULT_CAUSES.indexOf(def),
    chants: [...def.chants, ...COMMON_CHANTS], orgs: def.orgs, color: def.color,
  };
}

function defaultMix(causeId: string): Readonly<Partial<Record<CrowdFamily, number>>> {
  const def = DEFAULT_CAUSES.find((d) => d.id === causeId);
  return def ? def.mix : { divers: 0.5, syndical: 0.3, familles: 0.1, etudiants: 0.1 };
}

// ───────────────────────────── composition ─────────────────────────────

export const PROFILES: readonly ProtestProfile[] = [
  'pacifique', 'famille', 'militant', 'service_ordre', 'meneur', 'opportuniste', 'radical', 'pilleur',
];

/** Parts des profils en % de l'effectif selon le type de journée (bible F.1), dans l'ordre de PROFILES. */
const SCENARIO_SHARES: Readonly<Record<CrowdScenario, readonly number[]>> = {
  marche_calme: [62, 10, 20, 5, 0.5, 2, 0.3, 0.2],
  journee_tendue: [59, 5, 20, 4, 0.5, 8, 2, 1.5],
  samedi_sans_organisateur: [60, 3, 5, 0, 0.5, 20, 10, 1.5],
  soir_spontane: [55, 0, 8, 0, 0.5, 25, 8, 3.5],
  soir_de_match: [78, 6, 0, 0, 0, 10, 2, 4],
};

/** Familles où l'on trouve d'abord chaque profil (composition par défaut). */
const HOME: Readonly<Record<ProtestProfile, readonly CrowdFamily[]>> = {
  radical: ['black_bloc', 'gilets_jaunes', 'divers', 'etudiants'],
  pilleur: ['divers', 'black_bloc', 'gilets_jaunes'],
  opportuniste: ['gilets_jaunes', 'divers', 'etudiants', 'black_bloc'],
  service_ordre: ['syndical', 'soignants', 'agriculteurs', 'climat', 'etudiants'],
  meneur: ['syndical', 'etudiants', 'climat', 'gilets_jaunes', 'soignants', 'agriculteurs', 'divers'],
  militant: ['syndical', 'soignants', 'agriculteurs', 'climat', 'etudiants', 'retraites'],
  famille: ['familles', 'retraites', 'climat', 'divers'],
  pacifique: [],
};
const ASSIGN_ORDER: readonly ProtestProfile[] = ['radical', 'pilleur', 'opportuniste', 'service_ordre', 'meneur', 'militant', 'famille'];

export function pickScenario(extra: Record<string, unknown>, tension: number, volatility: number, families: Readonly<Partial<Record<CrowdFamily, number>>>): CrowdScenario {
  const s = extra['crowd.scenario'];
  if (typeof s === 'string' && s in SCENARIO_SHARES) return s as CrowdScenario;
  const organised = (families.syndical ?? 0) + (families.soignants ?? 0) + (families.agriculteurs ?? 0) + (families.etudiants ?? 0) + (families.climat ?? 0);
  if (volatility >= 0.7 && organised < 0.3) return 'samedi_sans_organisateur';
  if (volatility < 0.3 && tension < 0.3) return 'marche_calme';
  return 'journee_tendue';
}

/** Répartit `total` selon des poids (plus fort reste, départage par index : aucun tirage). */
function apportion(weights: readonly number[], total: number): number[] {
  let sum = 0;
  for (const w of weights) sum += w > 0 ? w : 0;
  const out: number[] = [];
  const rest: number[] = [];
  let given = 0;
  for (let i = 0; i < weights.length; i++) {
    const exact = sum > 0 ? ((weights[i]! > 0 ? weights[i]! : 0) / sum) * total : 0;
    const fl = Math.floor(exact + 1e-9);
    out.push(fl);
    rest.push(exact - fl);
    given += fl;
  }
  for (let left = total - given; left > 0; left--) {
    let best = 0;
    for (let i = 1; i < rest.length; i++) if (rest[i]! > rest[best]! + 1e-12) best = i;
    out[best] = out[best]! + 1;
    rest[best] = -1;
  }
  return out;
}

/** Une personne prévue. */
export interface PlanEntry {
  profile: ProtestProfile;
  family: CrowdFamily;
  banner: boolean;
  child: boolean;
  /** Case du service 'roles.spawn' (null en composition par défaut). */
  ref: RolesSlot | null;
  /** Groupe d'affinité (index dans Plan.groups, −1 : seul). */
  group: number;
}

export interface PlanGroup {
  kind: GroupKind;
  members: number[];
  profile: ProtestProfile;
  family: CrowdFamily;
}

export interface Plan {
  entries: PlanEntry[];
  groups: PlanGroup[];
  scenario: CrowdScenario;
}

function readFamilies(extra: Record<string, unknown>): Partial<Record<CrowdFamily, number>> | null {
  const comp = extra['composition'];
  if (typeof comp !== 'object' || comp === null) return null;
  const out: Partial<Record<CrowdFamily, number>> = {};
  let sum = 0;
  for (const f of FAMILIES) {
    const v = Number((comp as Record<string, unknown>)[f]);
    if (Number.isFinite(v) && v > 0) {
      out[f] = v;
      sum += v;
    }
  }
  return sum > 0 ? out : null;
}

/** Compose la foule : `count` personnes dans l'ordre du cortège, avec leurs groupes d'affinité. */
export function buildPlan(
  ctx: GameContext, cause: CrowdCause, count: number, extra: Record<string, unknown>, tension: number, volatility: number, rng: Rng,
): Plan {
  const given = readFamilies(extra);
  const families = given ?? defaultMix(cause.id);
  const scenario = pickScenario(extra, tension, volatility, families);
  const hot = extra['derapage'] === 'foule' || extra['derapage'] === 'les_deux';
  const entries: PlanEntry[] = [];
  const helper = ctx.service<RolesSpawnLike>('roles.spawn');
  let slots: RolesSlot[] | null = null;
  if (helper && typeof helper.crowd === 'function' && typeof helper.spawnSlot === 'function') {
    try {
      const composition: Record<string, unknown> = { scenario, volatility: Math.min(1, volatility * (hot ? 1.5 : 1)) };
      if (given) composition['families'] = given;
      slots = helper.crowd(cause.index >= 0 ? cause.index : cause.id, count, composition, rng.fork('composition'));
    } catch (err) {
      console.error('[crowd] composition par roles.spawn impossible, composition par défaut', err);
      slots = null;
    }
  }
  if (slots && slots.length > 0) {
    for (const s of slots) {
      if (s.kind !== 'manifestant') continue;
      const family = (FAMILIES as readonly string[]).indexOf(s.family) >= 0 ? (s.family as CrowdFamily) : 'divers';
      entries.push({ profile: s.profile ?? 'pacifique', family, banner: s.carry === 'banderole', child: s.child === true, ref: s, group: -1 });
    }
  } else {
    // ── composition par défaut ──
    const famCount = apportion(FAMILIES.map((f) => families[f] ?? 0), count);
    const shares = SCENARIO_SHARES[scenario].slice();
    // propension à dégénérer : des pacifiques deviennent suiveurs, des suiveurs radicaux (bible F.1)
    const toFollow = shares[0]! * 0.08 * volatility;
    const toRadical = shares[5]! * 0.3 * volatility;
    shares[0] = shares[0]! - toFollow;
    shares[5] = shares[5]! + toFollow - toRadical;
    shares[6] = shares[6]! + toRadical;
    if (hot) {
      shares[5] = shares[5]! * 1.5;
      shares[6] = shares[6]! * 1.5;
    }
    // un bloc demandé est fait de radicaux, les « familles » de familles
    const total = shares.reduce((a, b) => a + b, 0);
    const blocShare = count > 0 ? famCount[FAMILIES.indexOf('black_bloc')]! / count : 0;
    const famShare = count > 0 ? famCount[FAMILIES.indexOf('familles')]! / count : 0;
    if (shares[6]! / total < 0.72 * blocShare) shares[6] = 0.72 * blocShare * total;
    if (shares[1]! / total < 0.6 * famShare) shares[1] = 0.6 * famShare * total;
    if (famCount[FAMILIES.indexOf('syndical')] === 0 && given) {
      shares[0] = shares[0]! + shares[3]!;
      shares[3] = 0;
    }
    const profCount = apportion(shares, count);
    if (count >= 20 && profCount[4] === 0 && shares[4]! > 0) {
      profCount[4] = 1;
      profCount[0] = Math.max(0, profCount[0]! - 1);
    }
    // places restantes par famille, puis attribution des profils par ordre de préférence
    const left = famCount.slice();
    const table: number[][] = FAMILIES.map(() => PROFILES.map(() => 0));
    for (const profile of ASSIGN_ORDER) {
      let need = profCount[PROFILES.indexOf(profile)]!;
      const homes = HOME[profile];
      for (let pass = 0; pass < 2 && need > 0; pass++) {
        for (let h = 0; h < (pass === 0 ? homes.length : FAMILIES.length) && need > 0; h++) {
          const f = pass === 0 ? FAMILIES.indexOf(homes[h]!) : h;
          // au second passage : n'importe quelle famille, sauf combinaisons absurdes
          if (pass === 1 && ((profile === 'radical' && FAMILIES[f] === 'familles') || (profile === 'service_ordre' && FAMILIES[f] === 'black_bloc'))) continue;
          const cap = pass === 0 && homes.length > 1 && h === 0 ? left[f]! : Math.ceil(left[f]! * (pass === 0 ? 0.6 : 1));
          const take = Math.min(need, cap);
          if (take <= 0) continue;
          table[f]![PROFILES.indexOf(profile)] = table[f]![PROFILES.indexOf(profile)]! + take;
          left[f] = left[f]! - take;
          need -= take;
        }
      }
    }
    for (let f = 0; f < FAMILIES.length; f++) table[f]![0] = table[f]![0]! + left[f]!;
    // famille de tête : la plus nombreuse hors bloc ; elle porte la banderole
    let lead = -1;
    for (let f = 0; f < FAMILIES.length; f++) {
      if (FAMILIES[f] === 'black_bloc' || famCount[f] === 0) continue;
      if (lead < 0 || famCount[f]! > famCount[lead]!) lead = f;
    }
    let banners = count >= 12 ? Math.min(12, Math.max(3, Math.round(count * 0.02))) : 0;
    const order: readonly CrowdFamily[] = ['gilets_jaunes', 'divers', 'black_bloc', 'etudiants', 'syndical', 'soignants', 'agriculteurs', 'climat', 'retraites', 'familles'];
    for (const family of order) {
      const f = FAMILIES.indexOf(family);
      for (let p = 0; p < PROFILES.length; p++) {
        const profile = PROFILES[p]!;
        const n = table[f]![p]!;
        const kids = family === 'familles' && profile === 'famille' ? Math.round(n * 0.25) : 0;
        for (let i = 0; i < n; i++) {
          const child = i < kids;
          const banner = f === lead && banners > 0 && !child && (profile === 'militant' || profile === 'pacifique');
          if (banner) banners--;
          entries.push({ profile, family, banner, child, ref: null, group: -1 });
        }
      }
    }
  }
  return { entries, groups: makeGroups(entries, rng.fork('groupes')), scenario };
}

/** Regroupe les personnes prévues en groupes d'affinité : familles, amis, sections, noyaux. */
function makeGroups(entries: PlanEntry[], rng: Rng): PlanGroup[] {
  const groups: PlanGroup[] = [];
  // par famille visuelle et profil : les membres d'un groupe se ressemblent
  const buckets = new Map<string, number[]>();
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]!;
    if (e.profile === 'service_ordre' || e.profile === 'meneur' || e.banner) continue;
    const key = e.family + '|' + e.profile;
    let list = buckets.get(key);
    if (!list) {
      list = [];
      buckets.set(key, list);
    }
    list.push(i);
  }
  for (const list of buckets.values()) {
    const first = entries[list[0]!]!;
    const profile = first.profile;
    // les enfants en tête de liste sont répartis un ou deux par groupe de famille
    const kids: number[] = [];
    const adults: number[] = [];
    for (const i of list) (entries[i]!.child ? kids : adults).push(i);
    let a = 0;
    while (a < adults.length) {
      let size: number;
      let kind: GroupKind;
      if (profile === 'famille') {
        size = 1 + rng.int(1, 3);
        kind = 'famille';
      } else if (profile === 'militant') {
        size = rng.int(5, 11);
        kind = 'section';
      } else if (profile === 'radical') {
        size = rng.int(4, 9);
        kind = 'noyau';
      } else if (profile === 'opportuniste' || profile === 'pilleur') {
        size = rng.int(2, 6);
        kind = 'amis';
      } else {
        // pacifiques : quatre sur dix viennent seuls
        size = rng.chance(0.4) ? 1 : rng.int(2, 5);
        kind = 'amis';
      }
      const members: number[] = [];
      for (let k = 0; k < size && a < adults.length; k++) members.push(adults[a++]!);
      if (profile === 'famille') for (let k = rng.int(1, 3); k > 0 && kids.length > 0; k--) members.push(kids.pop()!);
      if (members.length < 2) continue;
      const g = groups.length;
      for (const m of members) entries[m]!.group = g;
      groups.push({ kind, members, profile, family: first.family });
    }
    // enfants restants : avec le dernier groupe de leur famille
    if (kids.length > 0) {
      for (let g = groups.length - 1; g >= 0; g--) {
        if (groups[g]!.kind === 'famille' && groups[g]!.family === first.family) {
          for (const k of kids) {
            entries[k]!.group = g;
            groups[g]!.members.push(k);
          }
          break;
        }
      }
    }
  }
  return groups;
}

// ───────────────────────────── création des personnes ─────────────────────────────

const SKIN: readonly number[] = [0xf1c9a5, 0xe0ac86, 0xc68e63, 0x9a6a45, 0x6b4630];
const TOPS: readonly number[] = [0x3b4a5a, 0x6b6f76, 0x7a4b3a, 0x2f4f3a, 0x8a8f99, 0x4a3f5c, 0xa39a86, 0x27405e];

/** Apparence minimale par famille (quand le module des archétypes n'habille pas la personne). */
function defaultLook(e: PlanEntry, cause: CrowdCause, seed: number): Partial<PersonLook> {
  const r = (k: number): number => ((Math.imul(seed ^ (k * 0x9e3779b1), 0x85ebca6b) >>> 8) & 0xffff) / 0x10000;
  const look: Partial<PersonLook> = {
    outfit: 'civil', skin: SKIN[Math.floor(r(1) * SKIN.length)]!, top: TOPS[Math.floor(r(2) * TOPS.length)]!,
    backpack: r(3) < 0.3,
    extras: { family: FAMILIES.indexOf(e.family), cause: Math.max(0, cause.index), child: e.child ? 1 : 0 },
  };
  if (e.child) look.height = 1.15 + r(4) * 0.3;
  switch (e.family) {
    case 'gilets_jaunes': look.outfit = 'gilet_fluo'; look.vest = 0xdfff00; break;
    case 'syndical': look.outfit = 'syndical'; look.vest = cause.color; break;
    case 'soignants': look.top = 0xf5f5f5; break;
    case 'agriculteurs': look.top = 0x4c7a2a; look.headgear = 'casquette'; break;
    case 'black_bloc':
      look.outfit = 'black_bloc'; look.top = 0x111111; look.bottom = 0x111111; look.headgear = 'capuche';
      look.faceCover = true; look.backpack = true;
      break;
    default: break;
  }
  if (e.profile === 'service_ordre') look.armband = 0xff7a00;
  return look;
}

function defaultKit(ctx: GameContext, p: Person, e: PlanEntry, seed: number): void {
  if (p.inventory.length > 0) return; // déjà doté par le module des archétypes
  const r = ((Math.imul(seed, 0xc2b2ae35) >>> 8) & 0xffff) / 0x10000;
  const give = (id: ItemId): void => {
    if (ctx.actions.def(id) !== undefined || ctx.actions.defs.length === 0) ctx.actions.give(p, id);
  };
  if (e.banner) give('banderole');
  else if (e.profile === 'meneur') give('megaphone');
  else if (!e.child && e.family !== 'black_bloc') {
    if (r < 0.25) give('pancarte');
    else if (r < (e.family === 'syndical' ? 0.5 : 0.3)) give('drapeau');
  }
  if (!e.child) give('telephone');
}

/** Crée la personne d'une entrée du plan. */
export function spawnEntry(ctx: GameContext, cause: CrowdCause, e: PlanEntry, x: number, z: number, heading: number, seed: number): Person {
  const helper = e.ref ? ctx.service<RolesSpawnLike>('roles.spawn') : undefined;
  let p: Person | null = null;
  if (helper && e.ref) {
    try {
      p = helper.spawnSlot(e.ref, x, z, { heading, seed, cause: cause.index >= 0 ? cause.index : cause.id });
    } catch (err) {
      console.error('[crowd] roles.spawn.spawnSlot a échoué', err);
    }
  }
  if (!p) {
    p = ctx.archetypes.spawn('manifestant', x, z, {
      faction: 'protest', profile: e.profile, heading, seed, look: defaultLook(e, cause, seed),
    });
    defaultKit(ctx, p, e, seed);
  }
  if (p.profile === null) p.profile = e.profile;
  return p;
}

/** Nom affichable d'un tronçon de cortège. */
export function sectionLabel(kind: string, family: CrowdFamily, cause: CrowdCause, index: number): string {
  switch (kind) {
    case 'precortege': return 'Cortège de tête';
    case 'carre': return 'Carré de tête';
    case 'queue': return 'Queue de cortège';
    default: break;
  }
  const org = cause.orgs.length > 0 ? cause.orgs[index % cause.orgs.length]! : '';
  switch (family) {
    case 'syndical': return org !== '' ? 'Cortège syndical — ' + org : 'Cortège syndical';
    case 'etudiants': return 'Cortège de la jeunesse';
    case 'soignants': return 'Cortège des soignants';
    case 'agriculteurs': return 'Cortège des agriculteurs';
    case 'climat': return 'Cortège climat';
    case 'retraites': return 'Cortège des retraités';
    case 'familles': return 'Cortège des familles';
    case 'gilets_jaunes': return 'Gilets jaunes';
    default: return org !== '' ? 'Cortège — ' + org : 'Cortège';
  }
}
