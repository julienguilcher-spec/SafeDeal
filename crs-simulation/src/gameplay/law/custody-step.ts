/* =====================================================================================
 * Droit — suivi des personnes retenues, à chaque pas de simulation.
 *
 *   custodyPreMove()  avant la locomotion (système « law.custody ») : commandes de déplacement des
 *                     personnes retenues, écrites après les contrôleurs — immobiles, ou vers leur
 *                     place devant l'agent qui les escorte ;
 *   custodyUpdate()   après la locomotion (système « law ») : la personne maintenue au sol y reste,
 *                     l'escorté trop éloigné est ramené au contact (c'est ce qui le fait suivre quand
 *                     aucun module de locomotion n'est branché), postures et animations sont
 *                     réaffirmées, les évasions et les liens rompus sont traités.
 *
 * Quelques personnes au plus : boucles indexées sur des tableaux, aucune allocation.
 * ===================================================================================== */

import type { Person } from '@/core/contracts';
import type { Kernel } from './kernel';
import { PLAYER_CUSTODY_END_DELAY } from './custody';
import { GRIP_LENGTH, tether } from './subdue';

/** Distance au-delà de laquelle l'escorté est ramené au contact, et au-delà de laquelle il est replacé d'un coup (m). */
const ESCORT_SLACK = 1.5;
const ESCORT_SNAP = 4;
/** Place de l'escorté : juste devant l'agent qui le tient par le bras, légèrement à droite (m). */
const FOLLOW_AHEAD = 0.55;
const FOLLOW_SIDE = 0.12;
/** Rayon dans lequel l'agent doit rester près d'une personne maîtrisée non menottée (m), et délai avant sa fuite (s). */
const GUARD_RADIUS = 3.5;
const UNGUARDED_DELAY = 2;
/** Probabilité par seconde, à résistance maximale, qu'un escorté non menotté se dégage. */
const ESCAPE_RATE = 0.06;

function still(list: readonly Person[]): void {
  for (let i = 0; i < list.length; i++) {
    const cmd = list[i]!.cmd;
    cmd.moveX = 0;
    cmd.moveZ = 0;
    cmd.gait = 0;
  }
}

/** Avant la locomotion : commandes des personnes retenues, saisies ou contrôlées. */
export function custodyPreMove(k: Kernel): void {
  const people = k.ctx.people;
  const holds = k.custody.holds;
  for (let i = 0; i < holds.length; i++) {
    const h = holds[i]!;
    const p = h.target;
    const cmd = p.cmd;
    cmd.jump = false;
    cmd.crouch = false;
    cmd.moveX = 0;
    cmd.moveZ = 0;
    cmd.gait = 0;
    if (p.custody !== 'escorted') continue;
    const e = people.get(h.escortId);
    if (!e) continue;
    const sin = Math.sin(e.heading);
    const cos = Math.cos(e.heading);
    const dx = e.x + sin * FOLLOW_AHEAD - cos * FOLLOW_SIDE - p.x;
    const dz = e.z + cos * FOLLOW_AHEAD + sin * FOLLOW_SIDE - p.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d > 0.15) {
      const s = d < 0.6 ? d / 0.6 : 1;
      cmd.moveX = (dx / d) * s;
      cmd.moveZ = (dz / d) * s;
      cmd.gait = d > 1.2 ? 1 : 0;
    }
    cmd.faceMove = true;
    cmd.aimYaw = e.heading;
  }
  still(k.subdue.targets);
  still(k.controls.ongoing);
  still(k.custody.parked);
}

/** Après la locomotion : contraintes de saisie, postures, animations, évasions. */
export function custodyUpdate(k: Kernel): void {
  const ctx = k.ctx;
  const people = ctx.people;
  const custody = k.custody;
  const now = ctx.clock.now;

  k.subdue.update();

  const holds = custody.holds;
  for (let i = holds.length - 1; i >= 0; i--) {
    const h = holds[i]!;
    const p = h.target;
    const rec = h.rec;
    const state = p.custody;
    if (state === 'held') {
      // maintenue au sol là où elle a été amenée, même si l'agent bouge
      if (p.x !== h.pinX || p.z !== h.pinZ) {
        p.x = h.pinX;
        p.z = h.pinZ;
        p.y = ctx.world.heightAt(p.x, p.z);
      }
      p.vx = 0;
      p.vz = 0;
      if (p.posture !== 'down') p.posture = 'prone';
      const holder = people.get(h.holderId);
      let guarded = false;
      if (custody.able(holder) && holder.vehicleId === 0) {
        const dx = holder.x - p.x;
        const dz = holder.z - p.z;
        guarded = dx * dx + dz * dz <= GUARD_RADIUS * GUARD_RADIUS;
        if (guarded && holder.upper === 'none' && holder.carrying === p.id) holder.upper = 'restrain';
      }
      if (guarded || ctx.health.isIncapacitated(p)) {
        h.looseSince = -1;
      } else if (h.looseSince < 0) {
        h.looseSince = now;
      } else if (now - h.looseSince > UNGUARDED_DELAY) {
        custody.escape(h, 'maîtrisé mais non menotté, laissé sans surveillance');
      }
    } else if (state === 'cuffed') {
      p.vx = 0;
      p.vz = 0;
      p.upper = 'cuffed';
      if (p.posture === 'stand' || p.posture === 'crouch') p.posture = 'sit';
    } else if (state === 'escorted') {
      const e = people.get(h.escortId);
      if (!custody.able(e) || e.carrying !== p.id || e.vehicleId !== 0) {
        if (rec.cuffed) {
          // l'escorte est hors de combat ou a lâché prise : la personne reste entravée sur place
          custody.unlink(p);
          p.custody = 'cuffed';
          if (p.posture !== 'down') p.posture = 'sit';
          h.escortId = 0;
          h.holderId = 0;
        } else {
          custody.escape(h, "non menotté, son escorte l'a lâché");
        }
        continue;
      }
      p.upper = rec.cuffed ? 'cuffed' : 'none';
      if (p.posture !== 'down') p.posture = 'stand';
      const dx = p.x - e.x;
      const dz = p.z - e.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > ESCORT_SNAP * ESCORT_SNAP) {
        // l'escorte a changé de place d'un coup : la personne est replacée devant elle
        tether(k, p, e.x + Math.sin(e.heading) * FOLLOW_AHEAD, e.z + Math.cos(e.heading) * FOLLOW_AHEAD, 0, 0);
        p.heading = e.heading;
      } else if (d2 > ESCORT_SLACK * ESCORT_SLACK) {
        tether(k, p, e.x, e.z, ESCORT_SLACK, GRIP_LENGTH);
        p.vx = e.vx;
        p.vz = e.vz;
      }
      if (!rec.cuffed && now >= h.nextEscapeCheck) {
        h.nextEscapeCheck = now + 1;
        if (k.rng.next() < ESCAPE_RATE * k.subdue.resistance(p)) custody.escape(h, "non menotté, s'est dégagé pendant l'escorte");
      }
    } else {
      // libérée ou prise en charge par un autre module : le dossier est clos en l'état
      custody.unlink(p);
      custody.close(h, state === 'free' ? 'interrompu' : 'remis', '');
    }
  }

  // personnes remises à un point de regroupement : assises, entravées
  const parked = custody.parked;
  for (let i = parked.length - 1; i >= 0; i--) {
    const p = parked[i]!;
    if (p.custody !== 'handed_over' || people.get(p.id) !== p) {
      parked[i] = parked[parked.length - 1]!;
      parked.pop();
      continue;
    }
    p.vx = 0;
    p.vz = 0;
  }

  // joueur civil remis à l'OPJ : la garde à vue clôt sa partie (compte rendu), le temps de lire l'avis
  if (custody.playerHandedAt >= 0 && now - custody.playerHandedAt >= PLAYER_CUSTODY_END_DELAY) {
    const me = people.get(custody.playerHandedId);
    if (!me || !me.isPlayer || (me.custody !== 'in_vehicle' && me.custody !== 'handed_over')) {
      custody.playerHandedAt = -1;
    } else if (ctx.session.phase === 'playing') {
      custody.playerHandedAt = -1;
      ctx.session.end(true);
    }
  }
}
