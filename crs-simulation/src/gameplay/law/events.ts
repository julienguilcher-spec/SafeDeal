/* =====================================================================================
 * Droit — écoute des événements du jeu.
 *
 * Le module ne dépend d'aucun autre : il déduit des événements du contrat ce qui relève du droit.
 *   - violences contre les forces (riposte directe) : agent blessé par un tiers, projectile hostile
 *     tombant près des agents ou sur un véhicule de police, incendie d'un véhicule ou d'un agent,
 *     explosion près des forces, véhicule lancé sur un agent ;
 *   - infractions manifestes, même si aucun module ne les déclare : jet de projectile, violences,
 *     incendie, bris de vitrine, tag, pillage, dégradation de mobilier (les doubles déclarations
 *     sont fusionnées par Offenses.record) ;
 *   - emploi de la force non déclaré ou à préciser : blessure infligée par un agent (rapport
 *     automatique pour les moyens dirigés contre une personne, impact à la tête), tir tendu d'un
 *     lanceur de grenades (vitesse initiale du projectile), véhicule de police heurtant un piéton ;
 *   - prises de vue (media:shot), disparition de personnes, début de session.
 * ===================================================================================== */

import type { ForceMeans, GameContext, Person, Unsubscribe, Vehicle } from '@/core/contracts';
import { applySessionConfig, FLAT_SHOT_ANGLE, VEHICLE_HIT_SPEED } from './config';
import type { Kernel } from './kernel';
import { HOSTILE_PROJECTILES, LAUNCHER_PROJECTILES } from './texts';

/** Objets dont la blessure, même sans auteur connu, signale une attaque contre les forces. */
const HOSTILE_ITEMS: Readonly<Record<string, boolean>> = {
  pave: true, bouteille: true, molotov: true, mortier: true, marteau: true, barre: true,
};

function driverOf(ctx: GameContext, v: Vehicle): Person | null {
  for (let i = 0; i < v.seats.length; i++) {
    const seat = v.def.seats[i];
    if (seat && seat.role === 'driver' && v.seats[i] !== 0) return ctx.people.get(v.seats[i]!) ?? null;
  }
  return null;
}

/** Abonne le module aux événements ; retourne de quoi tout désabonner (dispose). */
export function wireEvents(k: Kernel): Unsubscribe[] {
  const ctx = k.ctx;
  const ev = ctx.events;
  const subs: Unsubscribe[] = [];

  subs.push(ev.on('person:hurt', (e) => {
    const victim = ctx.people.get(e.id);
    if (!victim) return;
    const info = e.info;
    const src = info.sourceId !== 0 ? ctx.people.get(info.sourceId) : undefined;
    const direct = info.kind !== 'gas' && info.kind !== 'water' && info.kind !== 'fall';
    if (src && src !== victim) {
      if (src.faction === 'police') {
        // emploi de la force par un agent : rattacher la blessure à sa déclaration
        let means: ForceMeans | null = info.means ?? null;
        if (!means && info.item) {
          const def = ctx.actions.def(info.item);
          if (def) means = def.forceMeans;
        }
        if (means) k.force.onHurt(src, means, victim, info, e.healthAfter);
      } else if (direct && info.amount > 0) {
        if (victim.faction === 'police') {
          k.attack.note(victim.x, victim.z);
          k.offenses.record(src, 'violence_agent', src.x, src.z);
        } else {
          k.offenses.record(src, 'violence', src.x, src.z);
        }
      }
    } else if (!src && victim.faction === 'police' && direct && info.item !== undefined && HOSTILE_ITEMS[info.item] === true) {
      // auteur inconnu, mais l'objet ne laisse pas de doute
      k.attack.note(victim.x, victim.z);
    }
  }));

  subs.push(ev.on('projectile:spawned', (e) => {
    const owner = e.ownerId !== 0 ? ctx.people.get(e.ownerId) : undefined;
    if (!owner) return;
    if (owner.faction !== 'police') {
      if (HOSTILE_PROJECTILES[e.kind] === true) {
        k.offenses.record(owner, 'jet_projectile', owner.x, owner.z, e.kind === 'molotov' || e.kind === 'mortier' ? 4 : undefined);
      }
    } else if (LAUNCHER_PROJECTILES[e.kind] === true) {
      // tir tendu : la grenade part presque à l'horizontale
      const proj = ctx.projectiles.get(e.id);
      if (!proj) return;
      const h = Math.sqrt(proj.vx * proj.vx + proj.vz * proj.vz);
      if (h > 5 && Math.atan2(proj.vy, h) < FLAT_SHOT_ANGLE) k.force.noteFlatShot(owner, e.kind === 'gm2l' ? 'gm2l' : 'lacrymo');
    }
  }));

  subs.push(ev.on('projectile:impact', (e) => {
    const owner = e.ownerId !== 0 ? ctx.people.get(e.ownerId) : undefined;
    if (HOSTILE_PROJECTILES[e.kind] === true && (!owner || owner.faction !== 'police')) {
      if (e.hitKind === 'person') {
        const hit = ctx.people.get(e.hitId);
        if (hit && hit.faction === 'police') k.attack.note(e.x, e.z);
      } else if (e.hitKind === 'vehicle') {
        const v = ctx.vehicles.get(e.hitId);
        if (v && v.faction === 'police') k.attack.note(e.x, e.z);
      } else if (k.eyes.officerNear(e.x, e.z, k.cfg.projectileNearRadius) !== null) {
        k.attack.note(e.x, e.z);
      }
      return;
    }
    if (e.kind === 'lbd' && owner && owner.faction === 'police' && e.hitKind === 'person') {
      // hauteur de l'impact rapportée à la taille : au-dessus des épaules, le tir est fautif
      const hit = ctx.people.get(e.hitId);
      if (!hit || hit === owner) return;
      const standing = hit.posture === 'stand' ? 1 : hit.posture === 'crouch' || hit.posture === 'kneel' ? 0.65 : hit.posture === 'sit' || hit.posture === 'seated' ? 0.55 : 0.25;
      const zone = (e.y - hit.y) / (hit.look.height * standing);
      k.force.noteImpactZone(owner, 'lbd', hit, zone);
    }
  }));

  subs.push(ev.on('projectile:returned', (e) => {
    // grenade ramassée et renvoyée vers les forces
    const by = ctx.people.get(e.byId);
    if (by && by.faction !== 'police') k.offenses.record(by, 'jet_projectile', by.x, by.z);
  }));

  subs.push(ev.on('explosion', (e) => {
    const src = e.sourceId !== 0 ? ctx.people.get(e.sourceId) : undefined;
    if (src && src.faction === 'police') return;
    if (e.kind !== 'molotov' && e.kind !== 'mortier' && e.kind !== 'vehicule' && HOSTILE_PROJECTILES[e.kind] !== true) return;
    if (k.eyes.officerNear(e.x, e.z, e.radius + 8) !== null) k.attack.note(e.x, e.z);
  }));

  subs.push(ev.on('fire:started', (e) => {
    const src = e.sourceId !== 0 ? ctx.people.get(e.sourceId) : undefined;
    if (src && src.faction === 'police') return;
    if (src) k.offenses.record(src, 'incendie', src.x, src.z);
    if (e.targetKind === 'vehicle') {
      const v = ctx.vehicles.get(e.targetId);
      if (v && v.faction === 'police') k.attack.note(e.x, e.z);
    } else if (e.targetKind === 'person') {
      const p = ctx.people.get(e.targetId);
      if (p && p.faction === 'police') k.attack.note(e.x, e.z);
    } else if (src && k.eyes.officerNear(e.x, e.z, 8) !== null) {
      k.attack.note(e.x, e.z);
    }
  }));

  subs.push(ev.on('vehicle:state', (e) => {
    if (e.state !== 'burning') return;
    const v = ctx.vehicles.get(e.id);
    if (v && v.faction === 'police') k.attack.note(v.x, v.z);
  }));

  subs.push(ev.on('vehicle:collision', (e) => {
    if (e.otherKind !== 'person' || Math.abs(e.speed) < VEHICLE_HIT_SPEED) return;
    const v = ctx.vehicles.get(e.vehicleId);
    const victim = ctx.people.get(e.otherId);
    if (!v || !victim) return;
    const driver = driverOf(ctx, v);
    if (!driver || driver === victim) return;
    if (driver.faction === 'police') {
      // personne renversée par un véhicule de police : relevé dans tous les cas — un collègue renversé est
      // une faute de conduite, pas un emploi de la force, mais elle figure au journal et au compte rendu
      k.force.report(driver, 'vehicule', victim, e.x, e.z, true);
    } else if (victim.faction === 'police') {
      k.attack.note(e.x, e.z);
      k.offenses.record(driver, 'violence_agent', e.x, e.z);
    }
  }));

  subs.push(ev.on('shop:window', (e) => {
    const by = e.byId !== 0 ? ctx.people.get(e.byId) : undefined;
    if (!by || by.faction === 'police') return;
    if (e.state === 'tagged') k.offenses.record(by, 'tag', by.x, by.z);
    else if (e.state === 'cracked' || e.state === 'broken') k.offenses.record(by, 'degradation', by.x, by.z);
  }));

  subs.push(ev.on('shop:looted', (e) => {
    const by = e.byId !== 0 ? ctx.people.get(e.byId) : undefined;
    if (by && by.faction !== 'police' && e.amount > 0) k.offenses.record(by, 'pillage', by.x, by.z);
  }));

  subs.push(ev.on('prop:damaged', (e) => {
    const by = e.byId !== 0 ? ctx.people.get(e.byId) : undefined;
    if (!by || by.faction === 'police') return;
    if (e.state === 'damaged' || e.state === 'broken' || e.state === 'burning') k.offenses.record(by, 'degradation', by.x, by.z);
  }));

  subs.push(ev.on('media:shot', (e) => {
    k.eyes.noteShot(e.x, e.z, ctx.clock.now);
  }));

  subs.push(ev.on('person:removed', (e) => {
    k.custody.onRemoved(e.id);
    k.subdue.onRemoved(e.id);
    k.controls.onRemoved(e.id);
    k.sommations.onRemoved(e.id);
  }));

  subs.push(ev.on('session:started', (e) => {
    applySessionConfig(k.cfg, e.config);
  }));

  return subs;
}
