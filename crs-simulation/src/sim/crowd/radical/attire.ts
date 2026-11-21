/* =====================================================================================
 * GROUPES RADICAUX — tenue : se couvrir le visage, se changer en noir, redevenir un manifestant
 * ordinaire, ouvrir un parapluie, déployer la banderole.
 *
 * Le changement de tenue passe par le module des archétypes : setBlocAttire() de son service étendu
 * (tenue seule, sans toucher à l'inventaire), à défaut ctx.archetypes.equip(). Le parapluie et la
 * banderole sont de vrais objets de l'inventaire, pris en main et ouverts par ctx.actions.
 * Capuche et foulard n'ont pas d'action au contrat : ils sont écrits sur Person.look (l'objet `extras`
 * est remplacé pour que le rendu voie le changement), comme le fait le module des archétypes.
 * Les infractions déjà relevées restent sur la personne, quelle que soit sa tenue.
 * ===================================================================================== */

import type { Person } from '@/core/contracts';
import type { RadKernel } from './kernel';
import type { RadMember } from './model';

/** Familles dont les radicaux gardent leur tenue et agissent à visage plus ou moins découvert. */
function keepsOutfit(k: RadKernel, p: Person): boolean {
  if (!k.attire) return false;
  const f = k.attire.familyOf(p);
  return f === 'gilets_jaunes' || f === 'agriculteurs' || f === 'retraites' || f === 'familles';
}

function touch(p: Person): void {
  p.look.extras = { ...(p.look.extras ?? {}) };
}

/**
 * Avant le passage à l'acte, un radical est un manifestant comme les autres : visage découvert, tenue de
 * ville (le noir est dans le sac). Appelé une fois, à la prise en charge, tant que le bloc ne s'est pas formé.
 */
export function plainClothes(k: RadKernel, m: RadMember): void {
  const p = m.p;
  const look = p.look;
  m.wasBlack = false;
  m.wasMasked = false;
  if (k.attire && k.attire.inBlocAttire(p)) k.attire.setBlocAttire(p, false);
  else if (!k.attire && look.outfit === 'black_bloc') {
    look.outfit = 'civil';
    touch(p);
  }
  if (look.faceCover || look.headgear === 'capuche' || look.headgear === 'cagoule') {
    look.faceCover = false;
    if (look.headgear === 'cagoule') look.headgear = 'none';
    look.extras = { ...(look.extras ?? {}), hoodDown: 1 };
    // sans foulard ni lunettes sur le nez, plus de protection contre le gaz : elle revient avec le masque
    if (p.gasProtection > 0 && !look.gasMask) p.gasProtection = 0;
  }
  m.black = false;
  m.masked = false;
}

/** Relève sa capuche, met foulard et lunettes : visage couvert. Infraction de dissimulation du visage. */
export function maskUp(k: RadKernel, m: RadMember): void {
  if (m.masked) return;
  const p = m.p;
  const look = p.look;
  look.faceCover = true;
  if (look.headgear === 'none' || look.headgear === 'casquette' || look.headgear === 'bonnet') look.headgear = 'capuche';
  const ex: Record<string, number> = { ...(look.extras ?? {}) };
  delete ex.hoodDown;
  if (ex.goggles === undefined) ex.goggles = (p.id & 1) === 0 ? 1 : 0;
  look.extras = ex;
  const prot = ex.goggles === 1 ? 0.5 : 0.3;
  if (p.gasProtection < prot) p.gasProtection = prot;
  m.masked = true;
  k.ctx.law.recordOffense(p, 'dissimulation_visage', p.x, p.z);
}

/** Enfile la tenue noire du bloc (fin du changement de tenue). */
export function goBlack(k: RadKernel, m: RadMember): void {
  if (m.black) return;
  const p = m.p;
  if (keepsOutfit(k, p)) {
    // « déterminé qui reste » : garde sa tenue, mais se couvre le visage
    maskUp(k, m);
    m.black = true;
    return;
  }
  const masked = m.masked;
  if (k.attire) k.attire.setBlocAttire(p, true);
  else {
    try {
      k.ctx.archetypes.equip(p, 'radical');
    } catch (err) {
      console.error('[crowd.radical] archetypes.equip a échoué', err);
    }
    const look = p.look;
    look.outfit = 'black_bloc';
    look.top = 0x111111;
    look.bottom = 0x111111;
    look.headgear = 'capuche';
    look.faceCover = true;
    look.backpack = true;
    touch(p);
    if (p.gasProtection < 0.3) p.gasProtection = 0.3;
  }
  m.black = true;
  m.masked = true;
  if (!masked) k.ctx.law.recordOffense(p, 'dissimulation_visage', p.x, p.z);
}

/** Se change de nouveau : tenue de ville, visage découvert, parapluie fermé, banderole rangée. */
export function goCivil(k: RadKernel, m: RadMember): void {
  const p = m.p;
  setUmbrella(k, m, false);
  setBanner(k, m, false);
  if (m.black || m.masked) {
    if (k.attire && k.attire.inBlocAttire(p)) k.attire.setBlocAttire(p, false);
    else if (!k.attire && p.look.outfit === 'black_bloc') p.look.outfit = 'civil';
    const look = p.look;
    look.faceCover = false;
    if (look.headgear === 'cagoule') look.headgear = 'none';
    look.extras = { ...(look.extras ?? {}), hoodDown: 1 };
    if (!look.gasMask) p.gasProtection = 0;
  }
  m.black = false;
  m.masked = false;
  // mains vides : rien ne le distingue plus d'un marcheur
  if (p.active >= 0) {
    const held = k.ctx.actions.activeItem(p);
    if (held && held.id !== 'telephone' && held.id !== 'pancarte' && held.id !== 'drapeau') k.ctx.actions.select(p, -1);
  }
}

/** Ouvre ou ferme son parapluie (objet de l'inventaire). */
export function setUmbrella(k: RadKernel, m: RadMember, open: boolean): boolean {
  const p = m.p;
  const actions = k.ctx.actions;
  if (open) {
    if (actions.has(p, 'parapluie') <= 0) return false;
    const held = actions.activeItem(p);
    if (!held || held.id !== 'parapluie') {
      if (!actions.selectById(p, 'parapluie')) return false;
    }
    actions.setAlt(p, true);
    m.umbrella = true;
    return true;
  }
  if (m.umbrella) {
    const held = actions.activeItem(p);
    if (held && held.id === 'parapluie') actions.setAlt(p, false);
    m.umbrella = false;
  }
  return true;
}

/** Déploie la banderole renforcée (tenue de front) ou la range. */
export function setBanner(k: RadKernel, m: RadMember, up: boolean): boolean {
  const p = m.p;
  const actions = k.ctx.actions;
  if (up) {
    if (actions.has(p, 'banderole') <= 0) return false;
    const held = actions.activeItem(p);
    if (!held || held.id !== 'banderole') {
      if (!actions.selectById(p, 'banderole')) return false;
    }
    actions.setAlt(p, true);
    m.banner = true;
    return true;
  }
  if (m.banner) {
    const held = actions.activeItem(p);
    if (held && held.id === 'banderole') actions.setAlt(p, false);
    m.banner = false;
  }
  return true;
}
