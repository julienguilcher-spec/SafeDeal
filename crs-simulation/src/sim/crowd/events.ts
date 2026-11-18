/* =====================================================================================
 * FOULE — ce que la foule voit et entend : abonnement aux événements du jeu et traduction en stimuli
 * (table F.4 de la bible), en faits mémorisés (violences, blessés, interpellations, charges, nasses) et
 * en variations de tension.
 *
 * Légitimité : un emploi de la force est « non justifié » s'il a reçu un verdict défavorable du module de
 * droit (sans sommation, disproportionné, cible illégitime, interdit) OU s'il vise une personne pacifique.
 * Sinon il est justifié — et moitié moins coûteux s'il a été précédé des sommations (annonce claire).
 * ===================================================================================== */

import type { ForceReport, Person } from '@/core/contracts';
import type { CrowdCore } from './core';
import type { StimulusKind } from './emotions';

const VIOLENT: readonly string[] = ['jet_projectile', 'violence_agent', 'incendie', 'degradation', 'pillage', 'barricade', 'violence', 'rebellion'];
const THROWN: readonly string[] = ['pave', 'bouteille', 'molotov', 'mortier', 'oeuf_peinture', 'debris'];
const CHARGE_ORDERS: readonly string[] = ['charge', 'bond_offensif', 'refoulement'];

function isThird(p: Person): boolean {
  return p.faction === 'press' || p.faction === 'medic' || p.faction === 'rescue' || p.kind === 'observateur';
}

/** La personne a-t-elle commis des violences récemment (elle n'est alors pas une « pacifique ») ? */
function isViolent(p: Person, now: number): boolean {
  const list = p.offenses;
  for (let i = 0; i < list.length; i++) {
    const o = list[i]!;
    if (o.severity >= 2 && now - o.t < 120 && o.type !== 'attroupement_apres_sommations' && o.type !== 'dissimulation_visage') return true;
  }
  return false;
}

function onForce(core: CrowdCore, report: ForceReport): void {
  const ctx = core.ctx;
  const now = core.now;
  const means = report.means;
  if (means === 'presence') return;
  const target = report.targetId !== 0 ? ctx.people.get(report.targetId) : undefined;
  const kind = report.verdict.kind;
  const badVerdict = kind === 'sans_sommation' || kind === 'disproportionne' || kind === 'cible_illegitime' || kind === 'interdit';
  const third = target !== undefined && isThird(target);
  const peaceful = target !== undefined && (third || ((target.faction === 'protest' || target.faction === 'civil') && !isViolent(target, now)));
  const unjust = badVerdict || peaceful;
  // annoncé par les sommations : moitié moins de tension (bible A.3, règle 10)
  const scale = !unjust && ctx.law.roe.sommation >= 3 ? 0.5 : 1;
  const x = report.x;
  const z = report.z;
  let stim: StimulusKind;
  switch (means) {
    case 'lacrymo':
      stim = 'gaz';
      core.sense.gas.add(x, z, now);
      break;
    case 'canon_eau': {
      stim = 'canon_eau';
      const by = ctx.people.get(report.byId);
      const v = by && by.vehicleId !== 0 ? ctx.vehicles.get(by.vehicleId) : undefined;
      core.sense.water.add(x, z, now, 0, v ? v.x : by ? by.x : x, v ? v.z : by ? by.z : z);
      break;
    }
    case 'gm2l':
    case 'desencerclement':
    case 'lbd':
    case 'arme_feu':
      stim = 'arme';
      break;
    case 'vehicule':
      stim = 'charge';
      break;
    default:
      stim = third ? 'tiers_frappe' : 'coup';
      break;
  }
  core.emotions.stimulus(stim, x, z, !unjust, means === 'arme_feu' ? 1.5 : scale);
}

export function bindEvents(core: CrowdCore): void {
  const ctx = core.ctx;
  const ev = ctx.events;
  let chargeSeq = 1;

  ev.on('session:started', (e) => {
    try {
      core.start(e.config);
    } catch (err) {
      core.active = false;
      core.veille = false;
      console.error('[crowd] mise en place de la manifestation impossible', err);
      throw err;
    }
  });
  ev.on('session:ended', () => {
    core.active = false;
    core.veille = false;
  });
  ev.on('person:spawned', (e) => core.onSpawned(e.id));
  ev.on('person:removed', (e) => {
    const p = ctx.people.get(e.id);
    if (p) core.detach(p);
  });
  const mapChanged = (): void => {
    core.corridor.invalidate();
    core.metro.markDirty();
  };
  ev.on('world:tile_loaded', mapChanged);
  ev.on('world:tile_unloaded', mapChanged);
  ev.onAny('world:source', mapChanged);

  // ── droit ──
  ev.on('law:sommation', (e) => {
    if (!core.active) return;
    core.emotions.stimulus('sommation', e.x, e.z, true);
    core.behavior.hearSommation(e.stage, e.x, e.z);
  });
  ev.on('law:force', (e) => {
    if (core.active) onForce(core, e.report);
  });
  ev.on('law:offense', (e) => {
    if (core.active && VIOLENT.indexOf(e.offense.type) >= 0) core.sense.markViolence(e.offense.x, e.offense.z);
  });
  ev.on('person:arrested', (e) => {
    if (!core.active) return;
    const p = ctx.people.get(e.id);
    if (!p || (p.faction !== 'protest' && p.faction !== 'civil' && !isThird(p))) return;
    core.sense.arrests.add(p.x, p.z, core.now, p.id, e.lawful ? 1 : 0);
    core.emotions.stimulus('interpellation', p.x, p.z, e.lawful);
    core.director.onArrested(p);
  });
  ev.onAny('law:enclosed', (payload) => {
    if (!core.active) return;
    const e = payload as { enclosed?: boolean; x?: number; z?: number };
    const items = core.sense.kettles.items;
    if (e.enclosed === true && typeof e.x === 'number' && typeof e.z === 'number') {
      core.sense.kettles.add(e.x, e.z, Infinity, -1, 45);
    } else {
      for (const k of items) if (k.id === -1) k.t = core.now;
    }
  });
  // nasse détectée par la police (toutes les issues tenues : barrages, rues fermées, encerclement) : la foule le sait
  ev.onAny('police:kettle', (payload) => {
    if (!core.active) return;
    const e = payload as { id?: number; closed?: boolean; x?: number; z?: number; radius?: number };
    if (typeof e.id !== 'number') return;
    const id = -1000 - e.id;
    const items = core.sense.kettles.items;
    if (e.closed === true && typeof e.x === 'number' && typeof e.z === 'number') {
      for (const k of items) {
        if (k.id !== id) continue;
        k.x = e.x;
        k.z = e.z;
        k.t = Infinity;
        if (typeof e.radius === 'number') k.a = e.radius;
        return;
      }
      core.sense.kettles.add(e.x, e.z, Infinity, id, typeof e.radius === 'number' ? e.radius : 40);
    } else {
      for (const k of items) if (k.id === id) k.t = core.now;
    }
  });
  ev.on('order:issued', (e) => {
    if (!core.active) return;
    const squad = ctx.squads.get(e.squadId);
    if (!squad || squad.faction !== 'police') return;
    const o = e.order;
    // une nouvelle consigne met fin à la nasse que tenait cette unité
    for (const k of core.sense.kettles.items) if (k.id === e.squadId && o.type !== 'encercler') k.t = core.now;
    if (CHARGE_ORDERS.indexOf(o.type) >= 0) {
      const leader = ctx.people.get(squad.leaderId);
      const fromX = leader ? leader.x : o.x;
      const fromZ = leader ? leader.z : o.z;
      // direction : vers l'objectif s'il est distinct de la position de l'unité, sinon le cap de la formation
      let dx = o.x - fromX;
      let dz = o.z - fromZ;
      const l = Math.hypot(dx, dz);
      if (l > 3) {
        dx /= l;
        dz /= l;
      } else {
        dx = Math.sin(o.heading);
        dz = Math.cos(o.heading);
      }
      core.sense.charges.add(fromX, fromZ, core.now + (o.type === 'refoulement' ? 20 : 8), chargeSeq++, dx, dz);
      const px = fromX + dx * 15;
      const pz = fromZ + dz * 15;
      if (core.sense.coverAt(px, pz, 30) > 0) core.emotions.stimulus('charge', px, pz, core.sense.recentViolence(px, pz, 40), ctx.law.roe.sommation >= 3 ? 0.5 : 1);
    } else if (o.type === 'encercler') {
      core.sense.kettles.add(o.x, o.z, Infinity, e.squadId, o.width > 10 ? o.width * 0.5 : 40);
    }
  });

  // ── violences, détonations, feux ──
  ev.on('projectile:spawned', (e) => {
    if (!core.active || THROWN.indexOf(e.kind) < 0) return;
    const owner = ctx.people.get(e.ownerId);
    if (!owner || owner.faction === 'police') return;
    core.sense.markViolence(owner.x, owner.z);
    core.emotions.stimulus('jet', owner.x, owner.z, true);
  });
  ev.on('explosion', (e) => {
    if (!core.active) return;
    if (e.kind === 'grenade_lacrymo_main' || e.kind === 'grenade_lacrymo_56' || e.kind === 'palet_lacrymo') {
      core.sense.gas.add(e.x, e.z, core.now);
      return;
    }
    if (e.kind === 'fusee_rouge' || e.kind === 'fumigene' || e.kind === 'molotov') return;
    core.emotions.stimulus('detonation', e.x, e.z, true, e.radius >= 8 ? 1.3 : 1);
  });
  ev.on('fire:started', (e) => {
    if (!core.active) return;
    core.emotions.stimulus(e.targetKind === 'vehicle' ? 'feu_vehicule' : 'feu', e.x, e.z, true);
    const src = ctx.people.get(e.sourceId);
    if (src && src.faction !== 'police' && src.faction !== 'rescue') core.sense.markViolence(e.x, e.z);
  });
  ev.on('fire:out', (e) => {
    if (!core.active) return;
    const by = ctx.people.get(e.byId);
    if (by && (by.faction === 'police' || by.faction === 'rescue')) core.emotions.stimulus('secours', e.x, e.z, true);
  });
  ev.on('shop:window', (e) => {
    if (!core.active || e.state !== 'broken') return;
    const shop = ctx.props.shop(e.id);
    if (!shop) return;
    core.emotions.stimulus('vitrine', shop.x, shop.z, true);
    core.sense.markViolence(shop.x, shop.z);
  });
  ev.on('shop:looted', (e) => {
    if (!core.active) return;
    const shop = ctx.props.shop(e.id);
    if (shop) core.emotions.stimulus('pillage', shop.x, shop.z, true);
  });
  ev.on('barricade:built', (e) => {
    if (!core.active) return;
    core.emotions.stimulus('barricade', e.x, e.z, true);
    core.sense.markViolence(e.x, e.z);
  });

  // ── blessés ──
  ev.on('person:hurt', (e) => {
    if (!core.active) return;
    const kind = e.info.kind;
    if (kind === 'gas' || kind === 'water' || kind === 'crush' || kind === 'fall' || kind === 'burn') return;
    const victim = ctx.people.get(e.id);
    const src = e.info.sourceId !== 0 ? ctx.people.get(e.info.sourceId) : undefined;
    if (!victim || !src) return;
    if (victim.faction === 'police') {
      if (src.faction !== 'police') core.sense.markViolence(victim.x, victim.z);
      return;
    }
    if (src.faction !== 'police') return;
    // coup porté par un agent : même lecture que la déclaration d'emploi de la force (fusionnée avec elle)
    if (isThird(victim)) core.emotions.stimulus('tiers_frappe', victim.x, victim.z, false);
    else core.emotions.stimulus('coup', victim.x, victim.z, isViolent(victim, core.now));
  });
  ev.on('person:down', (e) => {
    if (!core.active) return;
    const p = ctx.people.get(e.id);
    if (!p) return;
    const src = e.sourceId !== 0 ? ctx.people.get(e.sourceId) : undefined;
    if (p.faction === 'police') {
      if (src && src.faction !== 'police') core.sense.markViolence(p.x, p.z);
      return;
    }
    core.sense.casualties.add(p.x, p.z, core.now, p.id, 0, 0);
    if (e.injury === 'serious' || e.injury === 'critical' || e.injury === 'dead') {
      const byPolice = src !== undefined && src.faction === 'police';
      if (core.emotions.stimulus('blesse_grave', p.x, p.z, !byPolice)) core.director.addGlobal(0.05, 'blesse_grave');
    }
  });
  ev.on('person:treated', (e) => {
    if (!core.active) return;
    const by = ctx.people.get(e.byId);
    const p = ctx.people.get(e.id);
    if (by && p && p.faction !== 'police' && (by.faction === 'police' || by.faction === 'rescue')) core.emotions.stimulus('secours', p.x, p.z, true);
  });
}
