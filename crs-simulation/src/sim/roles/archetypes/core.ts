/* =====================================================================================
 * ARCHÉTYPES — état partagé du module : générateurs, brouillon de travail, identités des personnes
 * habillées, réglages de la session (cause du jour, composition, compagnie).
 *
 * Déterminisme : la graine d'une personne (opts.seed, sinon tirée du générateur du module, lui-même
 * dérivé de la graine de session au début de chaque session) alimente des flux indépendants — corps,
 * nom, rôle, tenue, accessoires, matricule. Même graine et mêmes options → même personne ; changer
 * de profil ne change ni le corps ni les vêtements de ville.
 * ===================================================================================== */

import type { EntityId, GameContext, Person, PersonInit, PersonLook, ProtestProfile, Rng } from '@/core/contracts';
import { createRng, hash2, weightedIndex } from '@/core/rng';
import type { SeededRng } from '@/core/rng';
import { FAMILY_IDS, PROFILE_IDS, ROLES_EQUIPPED_EVENT } from './api';
import type { ArchetypeSessionDefaults, RolesEquippedEvent } from './api';
import { BLOC_BANNERS, CAUSES } from './causes';
import { CIVIL_BODY, isCivilKind } from './civil';
import { StackPool } from './inventory';
import type { BodySpec, Draft, Identity } from './model';
import { createDraft, createIdentity } from './model';
import { RioRegistry } from './names';
import { isPoliceKind, policeBody } from './police';
import type { PoliceKind } from './police';
import { AFFINITY, familyAt, protestBody } from './protest';
import type { ProtestOptions } from './protest';
import { isTiersKind, TIERS_BODY } from './tiers';

// flux aléatoires indépendants dérivés de la graine d'une personne
export const STREAM_BODY = 0x0b0d1e5;
export const STREAM_NAME = 0x4e414d45;
export const STREAM_ROLE = 0x524f4c45;
export const STREAM_LOOK = 0x4c4f4f4b;
export const STREAM_KIT = 0x4b495421;
export const STREAM_RIO = 0x52494f21;

/** Numéros de compagnie FICTIFS (aucune compagnie réelle ne porte, à notre connaissance, un numéro de 70 à 79). */
export const COMPANY_MIN = 70;
export const COMPANY_COUNT = 10;

/** Options de création du contrat (PersonInit sans le type ni la position). */
export type SpawnOptions = Omit<PersonInit, 'kind' | 'x' | 'z'>;

/** Service du rendu des personnages, s'il est branché (forme minimale, sans dépendance). */
interface HeldTextSink {
  setHeldText?: (personId: EntityId, text: string | null) => void;
}

/** Valeur numérique d'une clé d'extras (`fallback` si absente ou invalide). */
export function exNum(ex: Record<string, number> | undefined, key: string, fallback: number): number {
  if (!ex) return fallback;
  const v = ex[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

export class ArchetypeCore {
  ctx!: GameContext;
  rng!: Rng;
  /** Générateurs de travail re-semés pour chaque personne (aucune allocation). */
  readonly work: SeededRng = createRng(1);
  readonly work2: SeededRng = createRng(2);
  readonly draft: Draft = createDraft();
  readonly spec: BodySpec = { women: 0.5, ageMin: 18, ageMax: 70, agePeak: 35, fitMin: 0.9, fitMax: 1.05, vivid: 0.1 };
  readonly protestOpts: ProtestOptions = { family: 'divers', profile: null, carry: 0, bloc: false, orgColor: 0 };
  readonly stacks = new StackPool();
  readonly identities = new Map<EntityId, Identity>();
  readonly rios = new RioRegistry();
  readonly famWeights = new Float64Array(FAMILY_IDS.length);
  readonly profWeights = new Float64Array(PROFILE_IDS.length);
  readonly drawWeights = new Float64Array(FAMILY_IDS.length);
  readonly lookScratch: PersonLook = {
    height: 1.72, build: 1, skin: 0, hair: 0, hairStyle: 1, top: 0, bottom: 0, shoes: 0, outfit: 'civil', headgear: 'none',
    visorDown: false, gasMask: false, faceCover: false, backText: '', sash: false, armband: 0, vest: 0, rankBars: 0,
    backpack: false, extras: undefined,
  };
  readonly personInit: PersonInit = { kind: 'passant', x: 0, z: 0 };
  readonly sessionDefaults: ArchetypeSessionDefaults = { cause: 0, company: COMPANY_MIN + 4 };
  /** La composition par familles vient de la configuration de session (elle prime sur celle de la cause). */
  compositionFromConfig = false;
  /** Sel de session : fixe la banderole de tête du jour. */
  salt = 0;

  attach(ctx: GameContext): void {
    this.ctx = ctx;
    this.startSession();
  }

  /** Oublie les personnes de la session précédente et relit les réglages de la nouvelle. */
  reset(): void {
    this.identities.clear();
    this.rios.clear();
    this.startSession();
  }

  /** Dérive les générateurs de la graine de session et lit la cause, la composition et la compagnie du jour. */
  startSession(): void {
    const ctx = this.ctx;
    this.rng = ctx.rng.fork('roles.archetypes');
    const pick = ctx.rng.fork('roles.archetypes.session');
    this.salt = Math.floor(pick.next() * 4294967296) >>> 0;
    const causeRoll = pick.int(0, CAUSES.list.length);
    const companyRoll = pick.int(0, COMPANY_COUNT);
    const cfg = ctx.session.config;
    const extra: Record<string, unknown> = cfg && cfg.extra ? cfg.extra : {};
    const wanted = typeof extra.cause === 'string' ? CAUSES.get(extra.cause) : undefined;
    this.sessionDefaults.cause = wanted ? wanted.index : causeRoll;
    const company = extra.compagnie;
    this.sessionDefaults.company = typeof company === 'number' && Number.isInteger(company) && company > 0 && company < 1000
      ? company : COMPANY_MIN + companyRoll;
    // composition par familles choisie sur la page d'accueil (parts, somme = 1)
    this.compositionFromConfig = false;
    const comp = extra.composition;
    if (comp && typeof comp === 'object') {
      let sum = 0;
      for (let f = 0; f < FAMILY_IDS.length; f++) {
        const v = (comp as Record<string, unknown>)[FAMILY_IDS[f]!];
        const w = typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0;
        this.famWeights[f] = w;
        sum += w;
      }
      this.compositionFromConfig = sum > 0;
    }
    this.loadCauseMix();
  }

  /** Poids de tirage des familles et des profils pour un manifestant créé sans précision. */
  loadCauseMix(): void {
    const cause = CAUSES.list[this.sessionDefaults.cause];
    if (!cause) return;
    if (!this.compositionFromConfig) {
      for (let f = 0; f < FAMILY_IDS.length; f++) this.famWeights[f] = cause.mix.families[FAMILY_IDS[f]!] ?? 0;
    }
    for (let p = 0; p < PROFILE_IDS.length; p++) this.profWeights[p] = cause.mix.profiles[PROFILE_IDS[p]!] ?? 0;
  }

  nextSeed(): number {
    return Math.floor(this.rng.next() * 4294967296) >>> 0;
  }

  drawFamily(profile: ProtestProfile | null, rng: Rng): number {
    const w = this.drawWeights;
    const pi = profile ? PROFILE_IDS.indexOf(profile) : -1;
    for (let f = 0; f < FAMILY_IDS.length; f++) {
      w[f] = this.famWeights[f]! * (pi >= 0 ? AFFINITY[FAMILY_IDS[f]!]![pi]! : 1);
    }
    let i = weightedIndex(rng, w);
    if (i < 0 && pi >= 0) {
      // aucune des familles du jour n'accueille ce profil : familles où on le trouve d'ordinaire
      for (let f = 0; f < FAMILY_IDS.length; f++) w[f] = AFFINITY[FAMILY_IDS[f]!]![pi]!;
      i = weightedIndex(rng, w);
    }
    return i < 0 ? 0 : i;
  }

  /** Banderole du jour pour une cause (la même pour tous ses porteurs : ils tiennent une seule banderole). */
  bannerOf(cause: number, bloc: boolean): number {
    if (bloc) return CAUSES.blocBannerBase + ((this.salt >>> 8) % BLOC_BANNERS.length);
    const c = CAUSES.list[cause];
    return c && c.bannerCount > 0 ? c.bannerBase + (this.salt % c.bannerCount) : -1;
  }

  /** Taille, carrure, teint et cheveux imposés par l'appelant : ils deviennent ceux de la personne. */
  bodyOverrides(id: Identity, look: Partial<PersonLook> | undefined): void {
    if (!look) return;
    if (typeof look.height === 'number' && Number.isFinite(look.height)) {
      id.height = look.height;
      id.child = look.height < 1.5;
    }
    if (typeof look.build === 'number' && Number.isFinite(look.build)) id.build = look.build;
    if (typeof look.skin === 'number') id.skin = look.skin;
    if (typeof look.hair === 'number') id.hair = look.hair;
    if (typeof look.hairStyle === 'number') id.hairStyle = look.hairStyle;
  }

  /** Numéro de compagnie et code de groupe d'un agent (CRS : compagnie du jour par défaut). */
  unitExtras(e: Record<string, number>, kind: PoliceKind, exIn: Record<string, number> | undefined): void {
    const company = exNum(exIn, 'company', kind === 'crs' ? this.sessionDefaults.company : 0) | 0;
    if (company > 0) e.company = company;
    const section = exNum(exIn, 'section', -1) | 0;
    if (section >= 0 && section <= 9) e.section = section;
    const group = exNum(exIn, 'group', 0) | 0;
    if (group >= 1 && group <= 3) e.group = group;
  }

  /** Identité d'une personne ; créée d'après son apparence si elle n'a pas été habillée par ce module. */
  identityOf(p: Person): Identity {
    const known = this.identities.get(p.id);
    if (known) return known;
    const seed = hash2(this.salt, p.id);
    const work = this.work;
    const ex = p.look.extras;
    let spec: BodySpec;
    if (isPoliceKind(p.kind)) spec = policeBody(p.kind, p.rank, this.spec);
    else if (p.kind === 'manifestant') spec = protestBody(familyAt(exNum(ex, 'family', 0)), p.profile, this.spec);
    else if (isTiersKind(p.kind)) spec = TIERS_BODY[p.kind];
    else spec = CIVIL_BODY[isCivilKind(p.kind) ? p.kind : 'passant'];
    work.reseed(hash2(seed, STREAM_BODY));
    const id = createIdentity(work, seed, spec, p.look.height < 1.5, p.faction === 'police' || p.faction === 'rescue', -1, -1);
    // le corps et les vitesses restent ceux que la personne a déjà ; ses vêtements de ville aussi
    const look = p.look;
    id.height = look.height;
    id.build = look.build;
    id.skin = look.skin;
    id.hair = look.hair;
    id.hairStyle = look.hairStyle;
    if (look.outfit === 'civil') {
      id.top = look.top;
      id.bottom = look.bottom;
      id.shoes = look.shoes;
      const h = look.headgear;
      id.hat = h === 'casquette' || h === 'bonnet' || h === 'capuche' ? h : 'none';
    }
    id.walk = p.speedWalk;
    id.run = p.speedRun;
    id.sprint = p.speedSprint;
    id.family = exNum(ex, 'family', 0) | 0;
    id.cause = exNum(ex, 'cause', p.kind === 'manifestant' ? this.sessionDefaults.cause : -1) | 0;
    id.org = exNum(ex, 'org', -1) | 0;
    id.baseArmorHead = look.visorDown ? Math.max(0, p.armorHead - 0.12) : p.armorHead;
    id.baseGas = look.gasMask ? 0 : p.gasProtection;
    this.identities.set(p.id, id);
    return id;
  }

  /** Signale qu'une personne est prête et transmet son texte de pancarte au rendu s'il est branché. */
  announce(p: Person, spawned: boolean): void {
    const ctx = this.ctx;
    if (p.kind === 'manifestant') {
      const sink = ctx.service<HeldTextSink>('peopleRender');
      if (sink && typeof sink.setHeldText === 'function') {
        try {
          sink.setHeldText(p.id, CAUSES.heldText(p));
        } catch (err) {
          console.error('[roles] texte de pancarte refusé par le rendu des personnages :', err);
        }
      }
    }
    const evt: RolesEquippedEvent = { id: p.id, spawned };
    ctx.events.emitAny(ROLES_EQUIPPED_EVENT, evt);
  }
}
