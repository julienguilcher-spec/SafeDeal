/* =====================================================================================
 * ARCHÉTYPES — ré-équipement d'une personne existante (ArchetypeApi.equip) : changement de poste
 * d'un agent, changement de profil ou de tenue d'un manifestant.
 *
 * Le corps ne change jamais ; la tenue et la dotation sont refaites à partir de l'identité de la
 * personne. Les objets ramassés dans la rue ne sont gardés que par un profil violent ; la visière
 * baissée et le masque à gaz porté sont conservés quand la nouvelle tenue les permet.
 * ===================================================================================== */

import type { Person, PolicePoste, ProtestProfile } from '@/core/contracts';
import { hash2 } from '@/core/rng';
import { CARRY } from './api';
import type { VisualFamily } from './api';
import { CAUSES } from './causes';
import type { ArchetypeCore } from './core';
import { exNum, STREAM_KIT, STREAM_LOOK, STREAM_NAME, STREAM_ROLE } from './core';
import { syncInventory } from './inventory';
import type { Draft, Identity } from './model';
import { kitHas, resetDraft } from './model';
import { defaultRank, dressPolice, isPoliceKind, isPolicePoste } from './police';
import type { PoliceKind } from './police';
import { dressProtester, familyAt, familyIndex, isProtestProfile } from './protest';

/** Clés d'extras posées par d'autres modules et conservées par un ré-équipement. */
const KEPT_EXTRAS: readonly string[] = ['lampe', 'brassard_tricolore', 'company', 'section', 'group'];

function hasVisor(headgear: string): boolean {
  return headgear === 'casque_crs' || headgear === 'casque_gendarme' || headgear === 'casque_moto' || headgear === 'casque_pompier';
}

export function equipPerson(core: ArchetypeCore, p: Person, role: PolicePoste | ProtestProfile | null): void {
  const policeRole = role !== null && isPolicePoste(role);
  const protestRole = role !== null && isProtestProfile(role);
  if (isPoliceKind(p.kind) && (role === null || policeRole)) {
    equipPolice(core, p, p.kind, role as PolicePoste | null);
  } else if (p.kind === 'manifestant' && (role === null || protestRole)) {
    const family = familyAt(exNum(p.look.extras, 'family', core.identityOf(p).family));
    const was = exNum(p.look.extras, 'bloc', -1);
    // dans la famille du bloc, se radicaliser c'est passer au noir ; ailleurs on garde la tenue du moment
    const bloc = role !== null && (family === 'black_bloc' ? was !== 0 || role === 'radical' : was === 1);
    redress(core, p, role as ProtestProfile | null, family, bloc, true);
  } else {
    // rôle sans rapport avec la personne : on l'enregistre seulement, comme le service neutre
    if (role === null) {
      if (p.faction === 'police') p.poste = null;
      else p.profile = null;
    } else if (protestRole) p.profile = role as ProtestProfile;
    else if (policeRole) p.poste = role as PolicePoste;
    return;
  }
}

function equipPolice(core: ArchetypeCore, p: Person, kind: PoliceKind, poste: PolicePoste | null): void {
  const id = core.identityOf(p);
  const d = core.draft;
  const work = core.work;
  const old = p.look.extras;
  p.poste = poste;
  if (p.rank === null && poste !== null) {
    work.reseed(hash2(id.seed, STREAM_ROLE));
    p.rank = defaultRank(kind, poste, work);
  }
  // la spécialité (radio, secouriste…) ne suit la personne que si elle reste « operateur » ; la tenue de l'autorité reste
  const keepVariant = poste === 'operateur' || kind === 'commissaire';
  const variant = keepVariant ? exNum(old, 'variant', 0) | 0 : 0;
  resetDraft(d, id);
  work.reseed(hash2(id.seed, STREAM_LOOK));
  dressPolice(d, id, kind, poste, p.rank, variant, work);
  core.unitExtras(d.extras, kind, old);
  applyDraft(core, p, id, d, false);
}

/**
 * Rhabille un manifestant selon son profil, sa famille et sa tenue (noir du bloc ou non).
 * `resupply` : refaire aussi sa dotation (changement de profil) ; false pour un simple changement de
 * tenue, qui ne rend ni ne reprend aucun objet.
 */
export function redress(
  core: ArchetypeCore, p: Person, profile: ProtestProfile | null, family: VisualFamily, bloc: boolean, resupply: boolean,
): void {
  const id = core.identityOf(p);
  const d = core.draft;
  const po = core.protestOpts;
  const old = p.look.extras;
  const cause = CAUSES.list[exNum(old, 'cause', id.cause) | 0] ? exNum(old, 'cause', id.cause) | 0 : core.sessionDefaults.cause;
  const from = p.profile;
  p.profile = profile;
  id.family = familyIndex(family);

  // ce qu'elle tenait : une pancarte, un drapeau ou une banderole se gardent tant que le profil s'y prête
  let carry: number = CARRY.auto;
  const quiet = profile === null || profile === 'radical' || profile === 'pilleur' || profile === 'service_ordre';
  if (quiet) carry = CARRY.rien;
  else if (profile !== 'meneur') {
    if (core.ctx.actions.has(p, 'banderole') > 0) carry = CARRY.banderole;
    else if (core.ctx.actions.has(p, 'pancarte') > 0) carry = CARRY.pancarte;
    else if (core.ctx.actions.has(p, 'drapeau') > 0) carry = CARRY.drapeau;
    else if (from === profile || from === null) carry = CARRY.auto;
    else carry = CARRY.rien;
  }
  let org = exNum(old, 'org', id.org) | 0;
  if (!CAUSES.org(org)) {
    core.work.reseed(hash2(id.seed, STREAM_ROLE));
    org = family === 'syndical' ? CAUSES.pickOrg(cause, core.work, true) : -1;
  }
  id.org = org;

  resetDraft(d, id);
  if (profile === null) {
    // quitte le cortège : tenue de ville, plus aucun signe ; le téléphone reste
    if (core.ctx.actions.has(p, 'telephone') > 0) {
      d.kitIds[0] = 'telephone';
      d.kitCounts[0] = 1;
      d.kitN = 1;
    }
    d.backpack = p.look.backpack;
    d.extras.bloc = 0;
  } else {
    po.family = family;
    po.profile = profile;
    po.carry = carry;
    po.bloc = bloc && !id.child;
    po.orgColor = family === 'syndical' && org >= 0 ? CAUSES.org(org)!.color : 0;
    core.work.reseed(hash2(id.seed, STREAM_LOOK));
    core.work2.reseed(hash2(id.seed, STREAM_KIT));
    dressProtester(d, id, po, core.work, core.work2);
  }
  const e = d.extras;
  e.cause = cause;
  e.family = id.family;
  const sign = exNum(old, 'signText', -1) | 0;
  core.work.reseed(hash2(id.seed, STREAM_NAME));
  e.signText = CAUSES.signText(sign) ? sign : CAUSES.pick(cause, core.work);
  if (org >= 0) e.org = org;
  if (kitHas(d, 'banderole')) {
    const banner = exNum(old, 'bannerText', -1) | 0;
    const blocBanner = banner >= CAUSES.blocBannerBase;
    e.bannerText = CAUSES.bannerText(banner) && blocBanner === (e.bloc === 1) ? banner : core.bannerOf(cause, e.bloc === 1);
  }
  const violent = profile === 'opportuniste' || profile === 'radical' || profile === 'pilleur';
  applyDraft(core, p, id, d, violent, resupply);
}

/** Écrit le brouillon sur une personne existante : apparence, protections, inventaire. */
function applyDraft(
  core: ArchetypeCore, p: Person, id: Identity, d: Draft, keepLoose: boolean, resupply = true,
): void {
  const look = p.look;
  const old = look.extras;
  const e = d.extras;
  if (old) {
    for (let i = 0; i < KEPT_EXTRAS.length; i++) {
      const k = KEPT_EXTRAS[i]!;
      if (e[k] === undefined && old[k] !== undefined) e[k] = old[k]!;
    }
  }
  look.top = d.top;
  look.bottom = d.bottom;
  look.shoes = d.shoes;
  look.outfit = d.outfit;
  look.headgear = d.headgear;
  look.faceCover = d.faceCover;
  look.backText = d.backText;
  look.sash = d.sash;
  look.armband = d.armband;
  look.vest = d.vest;
  look.rankBars = d.rankBars;
  look.backpack = d.backpack;
  // objet neuf : le rendu détecte le changement d'extras par référence
  look.extras = e;
  d.extras = {};

  // visière et masque : conservés si la nouvelle tenue les permet, avec le supplément de protection en cours
  const visor = look.visorDown && hasVisor(d.headgear);
  const bonus = visor ? Math.max(0, p.armorHead - id.baseArmorHead) : 0;
  look.visorDown = visor;
  p.armorHead = Math.min(0.97, d.armorHead + bonus);
  p.armorBody = d.armorBody;
  const hasMask = resupply ? kitHas(d, 'masque_gaz') : core.ctx.actions.has(p, 'masque_gaz') > 0;
  if (look.gasMask && !hasMask) look.gasMask = false;
  if (!look.gasMask) p.gasProtection = d.gasProtection;
  id.baseArmorHead = d.armorHead;
  id.baseGas = d.gasProtection;

  if (resupply) syncInventory(core.ctx, p, d, keepLoose);
  core.announce(p, false);
}
