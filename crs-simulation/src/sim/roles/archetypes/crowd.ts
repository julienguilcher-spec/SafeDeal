/* =====================================================================================
 * ARCHÉTYPES — composition d'une foule : combien de personnes de chaque famille visuelle et de
 * chaque profil, pour une cause, un effectif et une composition donnés.
 *
 * Méthode :
 *   1. parts visées par famille (composition fournie, sinon celles de la cause) et par profil
 *      (composition, type de journée, sinon celles de la cause) ;
 *   2. ajustement proportionnel itératif de la table d'affinité famille × profil sur ces deux marges :
 *      on obtient la part de chaque couple, les combinaisons interdites restant à zéro ;
 *   3. arrondi au plus fort reste : d'abord les familles (respectées à une personne près), puis les
 *      profils dans chaque famille, enfin quelques échanges pour rapprocher les totaux par profil.
 * Quand les deux marges sont incompatibles (10 % de bloc mais 2 % de radicaux), les familles priment.
 * ===================================================================================== */

import type { ProtestProfile, Rng } from '@/core/contracts';
import { shuffle } from '@/core/rng';
import { FAMILY_IDS, PROFILE_IDS } from './api';
import type { CauseInfo, CrowdComposition, CrowdScenario, CrowdSlot, VisualFamily } from './api';
import { BYSTANDERS_PER_1000, SCENARIO_PROFILES } from './mix';
import { AFFINITY } from './protest';

const F = FAMILY_IDS.length;
const P = PROFILE_IDS.length;
const P_PACIFIQUE = PROFILE_IDS.indexOf('pacifique');
const P_FAMILLE = PROFILE_IDS.indexOf('famille');
const P_MILITANT = PROFILE_IDS.indexOf('militant');
const P_SO = PROFILE_IDS.indexOf('service_ordre');
const P_MENEUR = PROFILE_IDS.indexOf('meneur');
const P_OPPORTUNISTE = PROFILE_IDS.indexOf('opportuniste');
const P_RADICAL = PROFILE_IDS.indexOf('radical');
const F_SYNDICAL = FAMILY_IDS.indexOf('syndical');
const F_FAMILLES = FAMILY_IDS.indexOf('familles');
const F_BLOC = FAMILY_IDS.indexOf('black_bloc');

/** Ordre du cortège, de l'avant vers l'arrière (docs/research/03-dynamique-manifestation.md §1.2). */
export const CORTEGE_ORDER: readonly VisualFamily[] = [
  'gilets_jaunes', 'divers', 'black_bloc', 'etudiants', 'syndical', 'soignants', 'agriculteurs', 'climat', 'retraites',
  'familles',
];

/** Part d'enfants parmi les « famille » de la famille « familles » (estimé). */
export const DEFAULT_CHILD_SHARE = 0.25;

// tables de travail réutilisées d'un appel à l'autre
const famShare = new Float64Array(F);
const profShare = new Float64Array(P);
const cell = new Float64Array(F * P);
const famCount = new Int32Array(F);
const cellCount = new Int32Array(F * P);
const colWant = new Int32Array(P);
const colHave = new Int32Array(P);
const exactF = new Float64Array(F);
const exactP = new Float64Array(P);
const colExact = new Float64Array(P);
const scratch = new Float64Array(Math.max(F, P));
const scratchInt = new Int32Array(Math.max(F, P));
const front: CrowdSlot[] = [];
const block: CrowdSlot[] = [];

function isFamilyKey(k: string): boolean {
  return (FAMILY_IDS as readonly string[]).indexOf(k) >= 0;
}

/** Normalise `v` (somme = 1) ; false si la somme est nulle. */
function normalize(v: Float64Array, n: number): boolean {
  let sum = 0;
  for (let i = 0; i < n; i++) {
    if (!(v[i]! > 0) || !Number.isFinite(v[i]!)) v[i] = 0;
    sum += v[i]!;
  }
  if (!(sum > 0)) return false;
  for (let i = 0; i < n; i++) v[i] = v[i]! / sum;
  return true;
}

function loadFamilies(src: Readonly<Partial<Record<VisualFamily, number>>> | undefined): boolean {
  famShare.fill(0);
  if (!src) return false;
  for (let i = 0; i < F; i++) famShare[i] = Number(src[FAMILY_IDS[i]!] ?? 0);
  return normalize(famShare, F);
}

function loadProfiles(src: Readonly<Partial<Record<ProtestProfile, number>>> | undefined): boolean {
  profShare.fill(0);
  if (!src) return false;
  for (let i = 0; i < P; i++) profShare[i] = Number(src[PROFILE_IDS[i]!] ?? 0);
  return normalize(profShare, P);
}

/**
 * Arrondi au plus fort reste : répartit `total` unités selon `exact` (longueur n, somme ≈ total) dans
 * `out`. À reste égal, l'index le plus petit l'emporte : le résultat ne dépend d'aucun tirage.
 */
function largestRemainder(exact: Float64Array, n: number, total: number, out: Int32Array, offset: number): void {
  let given = 0;
  for (let i = 0; i < n; i++) {
    const fl = Math.floor(exact[i]! + 1e-9);
    out[offset + i] = fl;
    scratch[i] = exact[i]! - fl;
    given += fl;
  }
  let left = total - given;
  while (left > 0) {
    let best = -1;
    let bestR = -1;
    for (let i = 0; i < n; i++) {
      if (scratch[i]! > bestR + 1e-12) {
        bestR = scratch[i]!;
        best = i;
      }
    }
    if (best < 0) break;
    out[offset + best] = out[offset + best]! + 1;
    scratch[best] = -1;
    left--;
  }
}

/** Ajuste la table d'affinité sur les parts visées par famille et par profil (résultat dans `cell`, somme = 1). */
function fit(): void {
  for (let f = 0; f < F; f++) {
    const row = AFFINITY[FAMILY_IDS[f]!]!;
    for (let p = 0; p < P; p++) cell[f * P + p] = famShare[f]! > 0 ? row[p]! : 0;
  }
  for (let iter = 0; iter < 40; iter++) {
    // colonnes : parts des profils
    for (let p = 0; p < P; p++) {
      let sum = 0;
      for (let f = 0; f < F; f++) sum += cell[f * P + p]!;
      const k = sum > 0 ? profShare[p]! / sum : 0;
      for (let f = 0; f < F; f++) cell[f * P + p] = cell[f * P + p]! * k;
    }
    // lignes : parts des familles (dernière opération : elles sont donc exactes)
    for (let f = 0; f < F; f++) {
      let sum = 0;
      for (let p = 0; p < P; p++) sum += cell[f * P + p]!;
      if (sum > 0) {
        const k = famShare[f]! / sum;
        for (let p = 0; p < P; p++) cell[f * P + p] = cell[f * P + p]! * k;
      } else if (famShare[f]! > 0) {
        // aucun profil visé n'est permis dans cette famille : on reprend ses affinités brutes
        const row = AFFINITY[FAMILY_IDS[f]!]!;
        let rs = 0;
        for (let p = 0; p < P; p++) rs += row[p]!;
        for (let p = 0; p < P; p++) cell[f * P + p] = rs > 0 ? (row[p]! / rs) * famShare[f]! : 0;
      }
    }
  }
}

/** Rapproche les totaux par profil de ce que donne la table ajustée, par échanges à l'intérieur d'une famille. */
function balanceColumns(n: number): void {
  // les totaux voulus par profil : même arrondi que les familles
  for (let p = 0; p < P; p++) {
    let sum = 0;
    for (let f = 0; f < F; f++) sum += cell[f * P + p]!;
    colExact[p] = sum * n;
  }
  largestRemainder(colExact, P, n, colWant, 0);
  for (let guard = 0; guard < F * P * 4; guard++) {
    for (let p = 0; p < P; p++) {
      let have = 0;
      for (let f = 0; f < F; f++) have += cellCount[f * P + p]!;
      colHave[p] = have;
    }
    let moved = false;
    for (let over = 0; over < P && !moved; over++) {
      if (colHave[over]! <= colWant[over]!) continue;
      for (let under = 0; under < P && !moved; under++) {
        if (colHave[under]! >= colWant[under]!) continue;
        // famille où l'échange coûte le moins par rapport à la table ajustée
        let bestF = -1;
        let bestGain = -Infinity;
        for (let f = 0; f < F; f++) {
          if (cellCount[f * P + over]! <= 0 || !(AFFINITY[FAMILY_IDS[f]!]![under]! > 0)) continue;
          const nf = famCount[f]!;
          const gain = (cell[f * P + under]! / (famShare[f]! || 1)) * nf - cellCount[f * P + under]!
            - ((cell[f * P + over]! / (famShare[f]! || 1)) * nf - cellCount[f * P + over]!);
          if (gain > bestGain) {
            bestGain = gain;
            bestF = f;
          }
        }
        if (bestF >= 0) {
          cellCount[bestF * P + over] = cellCount[bestF * P + over]! - 1;
          cellCount[bestF * P + under] = cellCount[bestF * P + under]! + 1;
          moved = true;
        }
      }
    }
    if (!moved) break;
  }
}

function isStructured(c: object): c is CrowdComposition {
  return 'families' in c || 'profiles' in c || 'scenario' in c || 'volatility' in c || 'children' in c || 'banners' in c;
}

/**
 * Compose une foule de `count` manifestants. `composition` : parts par famille (forme de la page
 * d'accueil) ou composition détaillée ; null = composition type de la cause.
 */
export function buildCrowd(
  cause: CauseInfo, count: number,
  composition: CrowdComposition | Readonly<Partial<Record<VisualFamily, number>>> | null | undefined, rng: Rng,
): CrowdSlot[] {
  const n = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  const out: CrowdSlot[] = [];
  if (n === 0) return out;

  let comp: CrowdComposition = {};
  if (composition) {
    if (isStructured(composition)) comp = composition;
    else {
      let flat = false;
      for (const k of Object.keys(composition)) if (isFamilyKey(k)) flat = true;
      if (flat) comp = { families: composition as Readonly<Partial<Record<VisualFamily, number>>> };
    }
  }

  // ── parts visées ──
  const familiesGiven = loadFamilies(comp.families);
  if (!familiesGiven) loadFamilies(cause.mix.families);
  if (!normalize(famShare, F)) famShare[0] = 1;
  const profilesGiven = loadProfiles(comp.profiles);
  if (!profilesGiven) {
    const scenario: CrowdScenario | undefined = comp.scenario;
    if (!loadProfiles(scenario ? SCENARIO_PROFILES[scenario] : cause.mix.profiles)) profShare[P_PACIFIQUE] = 1;
  }
  // propension à dégénérer : des pacifiques deviennent suiveurs, des suiveurs deviennent radicaux (estimé)
  const vol = comp.volatility !== undefined && Number.isFinite(comp.volatility) ? Math.min(1, Math.max(0, comp.volatility)) : 0;
  if (vol > 0 && !profilesGiven) {
    const toFollow = profShare[P_PACIFIQUE]! * 0.08 * vol;
    const toRadical = profShare[P_OPPORTUNISTE]! * 0.3 * vol;
    profShare[P_PACIFIQUE] = profShare[P_PACIFIQUE]! - toFollow;
    profShare[P_OPPORTUNISTE] = profShare[P_OPPORTUNISTE]! + toFollow - toRadical;
    profShare[P_RADICAL] = profShare[P_RADICAL]! + toRadical;
  }
  if (!profilesGiven) {
    // cohérence avec les familles demandées : un bloc est fait de radicaux, les « familles » de familles,
    // un cortège syndical de militants. Ce qui est relevé est repris aux autres profils, à proportion.
    let raised = 0;
    let others = 0;
    const floorRadical = 0.72 * famShare[F_BLOC]!;
    const floorFamille = 0.6 * famShare[F_FAMILLES]!;
    const floorMilitant = 0.45 * famShare[F_SYNDICAL]!;
    for (let p = 0; p < P; p++) {
      const floor = p === P_RADICAL ? floorRadical : p === P_FAMILLE ? floorFamille : p === P_MILITANT ? floorMilitant : -1;
      if (floor >= 0 && profShare[p]! < floor) {
        profShare[p] = floor;
        scratchInt[p] = 1;
        raised += floor;
      } else {
        scratchInt[p] = 0;
        others += profShare[p]!;
      }
    }
    if (raised > 0 && others > 0) {
      const k = Math.max(0, 1 - raised) / others;
      for (let p = 0; p < P; p++) if (scratchInt[p] === 0) profShare[p] = profShare[p]! * k;
    }
    // sans cortège syndical, pas de service d'ordre : ses membres redeviennent de simples marcheurs
    if (famShare[F_SYNDICAL] === 0 && profShare[P_SO]! > 0 && familiesGiven) {
      profShare[P_PACIFIQUE] = profShare[P_PACIFIQUE]! + profShare[P_SO]!;
      profShare[P_SO] = 0;
    }
    normalize(profShare, P);
  }

  // ── table ajustée, puis arrondis ──
  fit();
  for (let f = 0; f < F; f++) exactF[f] = famShare[f]! * n;
  largestRemainder(exactF, F, n, famCount, 0);
  for (let f = 0; f < F; f++) {
    const nf = famCount[f]!;
    let rowSum = 0;
    for (let p = 0; p < P; p++) rowSum += cell[f * P + p]!;
    for (let p = 0; p < P; p++) exactP[p] = rowSum > 0 ? (cell[f * P + p]! / rowSum) * nf : 0;
    if (!(rowSum > 0)) exactP[P_PACIFIQUE] = nf;
    largestRemainder(exactP, P, nf, cellCount, f * P);
  }
  balanceColumns(n);

  // un cortège a toujours quelqu'un au mégaphone
  if (n >= 20 && profShare[P_MENEUR]! > 0) {
    let meneurs = 0;
    for (let f = 0; f < F; f++) meneurs += cellCount[f * P + P_MENEUR]!;
    if (meneurs === 0) {
      let bestF = -1;
      for (let f = 0; f < F; f++) {
        if (!(AFFINITY[FAMILY_IDS[f]!]![P_MENEUR]! > 0) || famCount[f]! === 0) continue;
        if (bestF < 0 || famCount[f]! > famCount[bestF]!) bestF = f;
      }
      if (bestF >= 0) {
        let from = -1;
        for (let p = 0; p < P; p++) {
          if (p === P_MENEUR) continue;
          if (from < 0 || cellCount[bestF * P + p]! > cellCount[bestF * P + from]!) from = p;
        }
        if (from >= 0 && cellCount[bestF * P + from]! > 0) {
          cellCount[bestF * P + from] = cellCount[bestF * P + from]! - 1;
          cellCount[bestF * P + P_MENEUR] = 1;
        }
      }
    }
  }

  // ── liste dans l'ordre du cortège ──
  // famille qui porte la banderole de tête : la plus nombreuse hors bloc
  let lead = -1;
  for (let f = 0; f < F; f++) {
    if (f === F_BLOC || famCount[f]! === 0) continue;
    if (lead < 0 || famCount[f]! > famCount[lead]!) lead = f;
  }
  const wantBanners = comp.banners !== false;
  const headBanner = wantBanners && n >= 12 ? Math.min(12, Math.max(3, Math.round(n * 0.02))) : 0;
  const childShare = comp.children !== undefined && Number.isFinite(comp.children)
    ? Math.min(0.6, Math.max(0, comp.children)) : DEFAULT_CHILD_SHARE;
  for (let o = 0; o < CORTEGE_ORDER.length; o++) {
    const family = CORTEGE_ORDER[o]!;
    const f = FAMILY_IDS.indexOf(family);
    if (famCount[f] === 0) continue;
    block.length = 0;
    front.length = 0;
    // porteurs de banderole : militants puis marcheurs de la famille de tête ; radicaux pour celle du bloc
    const militants = cellCount[f * P + P_MILITANT]!;
    const marcheurs = cellCount[f * P + P_PACIFIQUE]!;
    const radicaux = cellCount[f * P + P_RADICAL]!;
    let fromMilitant = 0;
    let fromPacifique = 0;
    let fromRadical = 0;
    if (f === lead) {
      const k = Math.min(headBanner, militants + marcheurs);
      fromMilitant = Math.min(k, militants);
      fromPacifique = k - fromMilitant;
    } else if (f === F_BLOC && wantBanners && radicaux >= 6) {
      fromRadical = Math.min(10, Math.max(3, Math.round(famCount[f]! * 0.12)), radicaux);
    }
    for (let p = 0; p < P; p++) {
      const profile = PROFILE_IDS[p]!;
      const c = cellCount[f * P + p]!;
      const kids = f === F_FAMILLES && p === P_FAMILLE ? Math.round(c * childShare) : 0;
      const carry = p === P_MILITANT ? fromMilitant : p === P_PACIFIQUE ? fromPacifique : p === P_RADICAL ? fromRadical : 0;
      for (let i = 0; i < c; i++) {
        const slot: CrowdSlot = { kind: 'manifestant', profile, family };
        if (i < kids) slot.child = true;
        if (i < carry) {
          slot.carry = 'banderole';
          front.push(slot);
        } else if (p === P_SO || p === P_MENEUR) {
          front.push(slot);
        } else {
          block.push(slot);
        }
      }
    }
    // en tête de la famille : banderole, service d'ordre, meneur ; derrière, les marcheurs mêlés
    shuffle(rng, block);
    for (let i = 0; i < front.length; i++) out.push(front[i]!);
    for (let i = 0; i < block.length; i++) out.push(block[i]!);
  }
  front.length = 0;
  block.length = 0;
  return out;
}

/** Tiers du cortège pour `count` manifestants : journalistes, observateurs, street medics. */
export function buildBystanders(count: number, scenario: CrowdScenario, rng: Rng): CrowdSlot[] {
  const out: CrowdSlot[] = [];
  const n = Number.isFinite(count) ? Math.max(0, count) : 0;
  const rates = BYSTANDERS_PER_1000[scenario] ?? BYSTANDERS_PER_1000.marche_calme;
  let press = Math.round((n * rates[0]) / 1000);
  let observers = Math.round((n * rates[1]) / 1000);
  let medics = Math.round((n * rates[2]) / 1000);
  // dès qu'un cortège compte une centaine de personnes, il y a au moins un photographe ; observateurs et
  // street medics ne travaillent jamais seuls
  if (press === 0 && rates[0] > 0 && n >= 80) press = 1;
  if (observers === 1) observers = 2;
  if (medics === 1) medics = 2;
  if (medics === 0 && rates[2] > 0 && n >= 150) medics = 2;
  for (let i = 0; i < press; i++) {
    const roll = rng.next();
    out.push({
      kind: 'journaliste', profile: null, family: 'divers',
      variant: roll < 0.5 ? 'photographe' : roll < 0.8 ? 'reporter_images' : 'direct',
    });
  }
  for (let i = 0; i < observers; i++) out.push({ kind: 'observateur', profile: null, family: 'divers' });
  for (let i = 0; i < medics; i++) out.push({ kind: 'street_medic', profile: null, family: 'divers' });
  return out;
}
