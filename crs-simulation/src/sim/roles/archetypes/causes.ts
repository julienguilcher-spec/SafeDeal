/* =====================================================================================
 * CAUSES — registre des causes, de leurs organisations fictives, pancartes, slogans et banderoles.
 * Publié sous ctx.service<CausesApi>('roles.causes').
 *
 * Les textes sont rangés dans des tables GLOBALES : l'index d'un texte de pancarte (toutes causes
 * confondues) est la valeur de Person.look.extras.signText ; celui d'un texte de banderole est
 * look.extras.bannerText ; celui d'une organisation est look.extras.org. Les banderoles du bloc,
 * sans signature et sans cause, suivent celles des causes dans la table des banderoles.
 * ===================================================================================== */

import type { Person, Rng } from '@/core/contracts';
import type { CauseDef, CauseInfo, CausesApi, ChantDef, OrgDef } from './api';
import { CAUSES_A } from './causes-data-a';
import { CAUSES_B } from './causes-data-b';
import { CAUSES_C } from './causes-data-c';
import { CAUSES_D } from './causes-data-d';

/** Longueur maximale d'un texte de pancarte et d'un texte de banderole (caractères). */
export const SIGN_MAX_CHARS = 34;
export const BANNER_MAX_CHARS = 52;

/** Toutes les causes, dans l'ordre de la page d'accueil. */
export const CAUSE_DEFS: readonly CauseDef[] = [...CAUSES_A, ...CAUSES_B, ...CAUSES_C, ...CAUSES_D];

/**
 * Banderoles de tête du bloc : sans signature ni revendication précise (docs/research/
 * 06-roles-jouables.md §12.1). Textes d'ambiance, sans appel à la violence et sans cible nommée.
 */
export const BLOC_BANNERS: readonly string[] = [
  'ON NE SE TAIRA PAS',
  'LA RUE NE DORT PAS',
  'NOTRE COLÈRE EST LÉGITIME',
  'PLUS RIEN À PERDRE',
  'SANS NOUS, RIEN NE TOURNE',
  'ICI COMMENCE DEMAIN',
];

/** Coupe un texte en lignes équilibrées de `maxChars` caractères au plus (mots jamais coupés). */
export function wrapSign(text: string, maxChars = 14, maxLines = 3): string[] {
  const words = text.split(' ').filter((w) => w.length > 0);
  if (words.length === 0) return [];
  // largeur visée : celle qui répartit le texte sur le moins de lignes possible, sans dépasser maxLines
  let width = maxChars;
  for (let attempt = 0; attempt < 24; attempt++) {
    const lines: string[] = [];
    let line = '';
    for (const w of words) {
      // la ponctuation double reste accrochée au mot qui la précède
      const glue = w === '?' || w === '!' || w === ':' || w === ';' || w === '=';
      if (line.length === 0) line = w;
      else if (glue || line.length + 1 + w.length <= width) line += ' ' + w;
      else {
        lines.push(line);
        line = w;
      }
    }
    lines.push(line);
    if (lines.length <= maxLines) return lines;
    width += 2;
  }
  return [text];
}

class CausesRegistry implements CausesApi {
  readonly list: CauseInfo[] = [];
  private readonly byId = new Map<string, CauseInfo>();
  private readonly signs: string[] = [];
  private readonly signCause: number[] = [];
  private readonly banners: string[] = [];
  private readonly orgs: OrgDef[] = [];
  private readonly lines = new Map<number, readonly string[]>();
  /** Premier index global des banderoles du bloc. */
  readonly blocBannerBase: number;

  constructor(defs: readonly CauseDef[]) {
    for (let i = 0; i < defs.length; i++) {
      const def = defs[i]!;
      if (this.byId.has(def.id)) {
        console.error(`[roles] cause en double ignorée : « ${def.id} »`);
        continue;
      }
      const info: CauseInfo = {
        ...def,
        index: this.list.length,
        signBase: this.signs.length, signCount: def.signs.length,
        bannerBase: this.banners.length, bannerCount: def.banners.length,
        orgBase: this.orgs.length, orgCount: def.orgs.length,
      };
      for (const s of def.signs) {
        this.signs.push(s);
        this.signCause.push(info.index);
      }
      for (const b of def.banners) this.banners.push(b);
      for (const o of def.orgs) this.orgs.push(o);
      this.list.push(Object.freeze(info));
      this.byId.set(def.id, info);
    }
    this.blocBannerBase = this.banners.length;
    for (const b of BLOC_BANNERS) this.banners.push(b);
  }

  get(id: string | number): CauseInfo | undefined {
    if (typeof id === 'number') return Number.isInteger(id) ? this.list[id] : undefined;
    return this.byId.get(id);
  }

  get signCount(): number {
    return this.signs.length;
  }

  signText(index: number): string {
    return Number.isInteger(index) ? this.signs[index] ?? '' : '';
  }

  signLines(index: number): readonly string[] {
    const known = this.lines.get(index);
    if (known) return known;
    const text = this.signText(index);
    const lines: readonly string[] = Object.freeze(text ? wrapSign(text) : []);
    this.lines.set(index, lines);
    return lines;
  }

  pick(cause: string | number, rng: Rng): number {
    const c = this.get(cause);
    if (!c || c.signCount === 0) return -1;
    return c.signBase + rng.int(0, c.signCount);
  }

  get bannerCount(): number {
    return this.banners.length;
  }

  bannerText(index: number): string {
    return Number.isInteger(index) ? this.banners[index] ?? '' : '';
  }

  pickBanner(cause: string | number, rng: Rng): number {
    const c = this.get(cause);
    if (!c || c.bannerCount === 0) return -1;
    return c.bannerBase + rng.int(0, c.bannerCount);
  }

  /** Banderole sans signature du bloc (index global). */
  pickBlocBanner(rng: Rng): number {
    return this.blocBannerBase + rng.int(0, BLOC_BANNERS.length);
  }

  pickChant(cause: string | number, rng: Rng): ChantDef | null {
    const c = this.get(cause);
    if (!c || c.chants.length === 0) return null;
    return c.chants[rng.int(0, c.chants.length)]!;
  }

  get orgCount(): number {
    return this.orgs.length;
  }

  org(index: number): OrgDef | undefined {
    return Number.isInteger(index) ? this.orgs[index] : undefined;
  }

  /** Tire une organisation de la cause, de préférence de la nature demandée ; index global (−1 si aucune). */
  pickOrg(cause: string | number, rng: Rng, unions: boolean): number {
    const c = this.get(cause);
    const roll = rng.next();
    if (!c || c.orgCount === 0) return -1;
    if (unions) {
      // chasubles : organisations syndicales d'abord
      let n = 0;
      for (let i = 0; i < c.orgCount; i++) {
        const k = c.orgs[i]!.kind;
        if (k === 'syndicat' || k === 'intersyndicale') n++;
      }
      if (n > 0) {
        let pick = Math.floor(roll * n);
        for (let i = 0; i < c.orgCount; i++) {
          const k = c.orgs[i]!.kind;
          if (k !== 'syndicat' && k !== 'intersyndicale') continue;
          if (pick-- === 0) return c.orgBase + i;
        }
      }
    }
    return c.orgBase + Math.floor(roll * c.orgCount);
  }

  causeOfSign(index: number): CauseInfo | undefined {
    const c = Number.isInteger(index) ? this.signCause[index] : undefined;
    return c === undefined ? undefined : this.list[c];
  }

  heldText(p: Person): string | null {
    const ex = p.look.extras;
    if (!ex) return null;
    let sign = false;
    const inv = p.inventory;
    for (let i = 0; i < inv.length; i++) {
      const id = inv[i]!.id;
      if (id === 'banderole') {
        const t = this.bannerText(ex.bannerText ?? -1);
        if (t) return t;
        sign = true;
      } else if (id === 'pancarte') {
        sign = true;
      }
    }
    if (!sign) return null;
    return this.signText(ex.signText ?? -1) || null;
  }
}

export type CausesService = CausesRegistry;

/** Registre des causes du jeu (données immuables : une seule instance suffit pour tous les contextes). */
export const CAUSES: CausesService = new CausesRegistry(CAUSE_DEFS);
