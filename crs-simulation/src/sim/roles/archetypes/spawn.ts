/* =====================================================================================
 * ARCHÉTYPES — création d'une personne (ArchetypeApi.spawn).
 *
 * Tout est calculé AVANT ctx.people.spawn(), qui reçoit l'apparence et la dotation complètes (les
 * abonnés de person:spawned voient une personne habillée) ; vitesses, protections, matricule et
 * objet en main sont posés juste après, puis l'événement libre « roles:equipped » signale que la
 * personne est prête.
 * ===================================================================================== */

import type { Person, PersonKind, PersonLook, PolicePoste, PoliceRank, ProtestProfile } from '@/core/contracts';
import { hash2, normalizeSeed, weightedIndex } from '@/core/rng';
import { CARRY, FAMILY_IDS, PROFILE_IDS } from './api';
import { CAUSES } from './causes';
import { CIVIL_BODY, dressCivil, isCivilKind } from './civil';
import type { ArchetypeCore, SpawnOptions } from './core';
import { exNum, STREAM_BODY, STREAM_KIT, STREAM_LOOK, STREAM_NAME, STREAM_RIO, STREAM_ROLE } from './core';
import type { Identity } from './model';
import { createIdentity, kitHas, resetDraft } from './model';
import { makeName } from './names';
import { defaultPoste, defaultRank, dressPolice, isPoliceKind, isPolicePoste, policeBody } from './police';
import { dressProtester, familyIndex, isProtestProfile, protestBody } from './protest';
import { dressTiers, isTiersKind, TIERS_BODY } from './tiers';

/** Champs de PersonLook qu'un appelant peut imposer par opts.look (extras est traité à part). */
const LOOK_FIELDS: readonly (keyof PersonLook)[] = [
  'height', 'build', 'skin', 'hair', 'hairStyle', 'top', 'bottom', 'shoes', 'outfit', 'headgear', 'visorDown',
  'gasMask', 'faceCover', 'backText', 'sash', 'armband', 'vest', 'rankBars', 'backpack',
];
const NO_OPTS: SpawnOptions = Object.freeze({});

export function spawnPerson(core: ArchetypeCore, kind: PersonKind, x: number, z: number, opts?: SpawnOptions): Person {
  const ctx = core.ctx;
  const o = opts ?? NO_OPTS;
  const exIn = o.look ? o.look.extras : undefined;
  const seed = o.seed !== undefined ? normalizeSeed(o.seed) : core.nextSeed();
  const work = core.work;
  const d = core.draft;
  const sexIn = exNum(exIn, 'sex', -1);
  const ageIn = exNum(exIn, 'age', -1);
  const variant = exNum(exIn, 'variant', 0) | 0;
  let poste: PolicePoste | null | undefined = o.poste;
  let rank: PoliceRank | null | undefined = o.rank;
  let profile: ProtestProfile | null | undefined = o.profile;
  let id: Identity;

  if (isPoliceKind(kind)) {
    if (poste === undefined || (poste !== null && !isPolicePoste(poste))) poste = defaultPoste(kind);
    work.reseed(hash2(seed, STREAM_ROLE));
    const drawn = defaultRank(kind, poste, work);
    if (rank === undefined) rank = drawn;
    policeBody(kind, rank, core.spec);
    work.reseed(hash2(seed, STREAM_BODY));
    id = createIdentity(work, seed, core.spec, false, true, sexIn, ageIn);
    core.bodyOverrides(id, o.look);
    resetDraft(d, id);
    work.reseed(hash2(seed, STREAM_LOOK));
    dressPolice(d, id, kind, poste, rank, variant, work);
    core.unitExtras(d.extras, kind, exIn);
  } else if (kind === 'manifestant') {
    id = draftProtester(core, seed, o, exIn, sexIn, ageIn);
    profile = core.protestOpts.profile;
  } else if (isTiersKind(kind)) {
    work.reseed(hash2(seed, STREAM_BODY));
    id = createIdentity(work, seed, TIERS_BODY[kind], false, kind === 'pompier' || kind === 'samu', sexIn, ageIn);
    core.bodyOverrides(id, o.look);
    resetDraft(d, id);
    work.reseed(hash2(seed, STREAM_LOOK));
    const unmarked = exIn && exIn.unmarked !== undefined ? (exIn.unmarked > 0 ? 1 : 0) : -1;
    dressTiers(d, id, kind, variant, unmarked, work);
    // tiers du cortège : rattachés à la manifestation du jour
    if (kind !== 'pompier' && kind !== 'samu') d.extras.cause = core.sessionDefaults.cause;
  } else {
    const civil = isCivilKind(kind) ? kind : 'passant';
    work.reseed(hash2(seed, STREAM_BODY));
    id = createIdentity(work, seed, CIVIL_BODY[civil], false, false, sexIn, ageIn);
    core.bodyOverrides(id, o.look);
    resetDraft(d, id);
    work.reseed(hash2(seed, STREAM_LOOK));
    dressCivil(d, id, civil, variant, work);
  }

  // clés d'extras de l'appelant que ce module n'interprète pas : conservées telles quelles
  const e = d.extras;
  if (exIn) {
    for (const k in exIn) {
      if (k === 'carry' || e[k] !== undefined) continue;
      const v = exIn[k];
      if (typeof v === 'number') e[k] = v;
    }
  }

  // ── apparence complète, surcharges de l'appelant comprises ──
  const look = core.lookScratch;
  look.height = id.height;
  look.build = id.build;
  look.skin = id.skin;
  look.hair = id.hair;
  look.hairStyle = id.hairStyle;
  look.top = d.top;
  look.bottom = d.bottom;
  look.shoes = d.shoes;
  look.outfit = d.outfit;
  look.headgear = d.headgear;
  look.visorDown = false;
  look.gasMask = false;
  look.faceCover = d.faceCover;
  look.backText = d.backText;
  look.sash = d.sash;
  look.armband = d.armband;
  look.vest = d.vest;
  look.rankBars = d.rankBars;
  look.backpack = d.backpack;
  look.extras = e;
  if (o.look) {
    const custom = o.look as Record<string, unknown>;
    const target = look as unknown as Record<string, unknown>;
    for (let i = 0; i < LOOK_FIELDS.length; i++) {
      const key = LOOK_FIELDS[i]!;
      if (custom[key] !== undefined) target[key] = custom[key];
    }
  }

  let name = o.name;
  if (name === undefined) {
    work.reseed(hash2(seed, STREAM_NAME));
    name = makeName(work, id.sex, id.age);
  }

  const init = core.personInit;
  init.kind = kind;
  init.x = x;
  init.z = z;
  init.heading = o.heading;
  init.faction = o.faction;
  init.name = name;
  init.profile = profile;
  init.rank = rank;
  init.poste = poste;
  init.look = look;
  init.inventory = o.inventory ? o.inventory : core.stacks.fill(ctx, d);
  init.squadId = o.squadId;
  init.seed = seed;
  const p = ctx.people.spawn(init);
  // le magasin recopie l'apparence et la dotation ; s'il gardait nos objets de travail, on les lui laisse en propre
  if (p.look === look) p.look = { ...look };
  if (p.inventory === init.inventory) p.inventory = init.inventory.map((s) => ({ id: s.id, count: s.count, state: s.state, cooldown: s.cooldown }));

  // ── caractéristiques : vitesses de base (la charge est appliquée par la locomotion), protections ──
  p.speedWalk = id.walk;
  p.speedRun = id.run;
  p.speedSprint = id.sprint;
  p.armorHead = d.armorHead;
  p.armorBody = d.armorBody;
  p.gasProtection = d.gasProtection;
  if (isPoliceKind(kind)) {
    work.reseed(hash2(seed, STREAM_RIO));
    p.rio = core.rios.next(work);
  }
  if (d.hand) ctx.actions.selectById(p, d.hand);
  id.baseArmorHead = d.armorHead;
  id.baseGas = d.gasProtection;
  core.identities.set(p.id, id);
  core.announce(p, true);
  return p;
}

/** Prépare le brouillon d'un manifestant : profil, famille, cause, organisation, tenue, dotation. */
function draftProtester(
  core: ArchetypeCore, seed: number, o: SpawnOptions, exIn: Record<string, number> | undefined, sexIn: number,
  ageIn: number,
): Identity {
  const work = core.work;
  const d = core.draft;
  const po = core.protestOpts;
  const child = exNum(exIn, 'child', 0) > 0;
  // tirages du rôle, toujours dans le même ordre
  work.reseed(hash2(seed, STREAM_ROLE));
  const profileDraw = weightedIndex(work, core.profWeights);
  let profile: ProtestProfile | null = o.profile !== undefined ? o.profile : PROFILE_IDS[profileDraw < 0 ? 0 : profileDraw]!;
  if (profile !== null && !isProtestProfile(profile)) profile = 'pacifique';
  if (child) profile = 'famille';
  let famIdx = exNum(exIn, 'family', -1) | 0;
  const famDraw = core.drawFamily(profile, work);
  if (famIdx < 0 || famIdx >= FAMILY_IDS.length) famIdx = child ? familyIndex('familles') : famDraw;
  const family = FAMILY_IDS[famIdx]!;
  let cause = exNum(exIn, 'cause', core.sessionDefaults.cause) | 0;
  if (!CAUSES.list[cause]) cause = core.sessionDefaults.cause;
  const unionOrg = family === 'syndical';
  const orgDraw = CAUSES.pickOrg(cause, work, unionOrg);
  const signDraw = CAUSES.pick(cause, work);
  let org = exNum(exIn, 'org', -1) | 0;
  if (!CAUSES.org(org)) org = unionOrg || profile === 'militant' || profile === 'service_ordre' || profile === 'meneur' ? orgDraw : -1;

  protestBody(family, profile, core.spec);
  work.reseed(hash2(seed, STREAM_BODY));
  const id = createIdentity(work, seed, core.spec, child, false, sexIn, ageIn);
  core.bodyOverrides(id, o.look);
  id.family = famIdx;
  id.cause = cause;
  id.org = org;

  resetDraft(d, id);
  po.family = family;
  po.profile = profile;
  po.carry = exNum(exIn, 'carry', CARRY.auto) | 0;
  po.bloc = !id.child && (exIn && exIn.bloc !== undefined ? exIn.bloc > 0 : family === 'black_bloc');
  po.orgColor = unionOrg && org >= 0 ? CAUSES.org(org)!.color : 0;
  work.reseed(hash2(seed, STREAM_LOOK));
  core.work2.reseed(hash2(seed, STREAM_KIT));
  dressProtester(d, id, po, work, core.work2);

  const e = d.extras;
  e.cause = cause;
  e.family = famIdx;
  const sign = exNum(exIn, 'signText', signDraw) | 0;
  e.signText = CAUSES.signText(sign) ? sign : signDraw;
  if (org >= 0) e.org = org;
  if (kitHas(d, 'banderole')) {
    const banner = exNum(exIn, 'bannerText', -1) | 0;
    e.bannerText = CAUSES.bannerText(banner) ? banner : core.bannerOf(cause, e.bloc === 1);
  }
  return id;
}
