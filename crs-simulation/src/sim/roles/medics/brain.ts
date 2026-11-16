/* =====================================================================================
 * MÉDECINS DE RUE — IA d'un secouriste bénévole.
 *
 * Il marche avec le cortège (ou avec son groupe), regarde autour de lui et tend l'oreille (« Médic ! »).
 * Quand quelqu'un a besoin de lui, il choisit QUI d'abord : la priorité de tri (urgence absolue,
 * urgence relative, gêne due au gaz) moins l'éloignement. Puis, dans l'ordre :
 *   1. il rejoint la personne ; si elle est à terre dans un endroit exposé (gaz dense, feu), il la
 *      met à l'abri en la portant jusqu'à un point respirable, de préférence sur un trottoir ;
 *   2. il rince les yeux (sérum), panse (trousse) ;
 *   3. si le cas dépasse le premier secours (urgence absolue, ou blessé sérieux qui ne se relève pas),
 *      il le signale : incident + appel du SAMU + bilan à la radio, et reste auprès de la victime
 *      jusqu'à l'arrivée de l'équipe médicale.
 * Il soigne tout le monde, policiers compris, ne porte aucune arme et ne se défend pas : pris dans
 * le gaz il met son masque ou sort du nuage, et lève les mains quand une charge passe près de lui.
 * Tout passe par person.cmd et ctx.interactions, comme pour le joueur.
 * ===================================================================================== */

import type { EntityId, Person, Vec2 } from '@/core/contracts';
import { EXT } from '@/core/extensions';
import type { IncidentsApi, RescueApi } from '@/core/extensions';
import { pointOnPolyline } from '@/core/math';
import { injuryRank } from '../rescue/care';
import { Crew, Rescuer, T_CASUALTY, T_IDLE } from '../rescue/crew';
import type { RescueKernel } from '../rescue/crew';
import { R_BUSY, R_DONE, R_NEEDS_EVAC, S_CARRY, S_STAY } from '../rescue/crew-tasks';
import type { CrewTasks } from '../rescue/crew-tasks';
import { clearLine, holdFacing } from '../rescue/nav';
import { MEDIC_CALL_EVENT } from './api';
import type { MedicCallEvent, MedicsTuning } from './api';
import { HELP_MEMORY } from './tuning';

interface HealthExtLike {
  rinseEyes(p: Person, byId: EntityId): void;
}
interface GearLike {
  hasMask(p: Person): boolean;
  setGasMask(p: Person, on: boolean): boolean;
}

export interface HelpCall { id: EntityId; x: number; z: number; t: number }

export class Medic {
  readonly r: Rescuer;
  /** Équipage factice : le secouriste travaille seul, à pied (structure commune avec les secours officiels). */
  readonly crew: Crew;
  thinkAt = 0;
  anchorAt = 0;
  anchorX: number;
  anchorZ: number;
  /** Décalages propres à chacun le long et en travers du cortège. */
  readonly back: number;
  readonly side: number;
  retreatUntil = 0;
  handsUntil = 0;
  selfRinseAt = 0;
  /** Reste auprès de la victime jusqu'à cet instant. */
  stayUntil = 0;
  maskOn = false;

  constructor(readonly p: Person, seedA: number, seedB: number) {
    this.r = new Rescuer(p, 0);
    this.crew = new Crew(-2, 'samu');
    this.crew.onFoot = true;
    this.anchorX = p.x;
    this.anchorZ = p.z;
    this.back = 12 + seedA * 45;
    this.side = (seedB - 0.5) * 12;
  }
}

export interface NpcStats { medics: number; rinses: number; treated: number; sheltered: number; signalled: number }

const SHELTER_DIRS = 12;
const SHELTER_RINGS: readonly number[] = [10, 16, 24];

export class MedicAI {
  private readonly near: Person[] = [];
  private readonly out: Vec2 = { x: 0, z: 0 };
  private readonly callEvent: MedicCallEvent = { medicId: 0, victimId: 0, x: 0, z: 0, incidentId: 0 };
  /** Victimes déjà signalées au SAMU par un secouriste de rue. */
  readonly signalled = new Set<EntityId>();
  private readonly isRunningPolice = (q: Person): boolean => q.faction === 'police' && q.vx * q.vx + q.vz * q.vz > 6.25;
  private readonly isProtester = (q: Person): boolean => q.faction === 'protest' && q.posture !== 'down';

  constructor(
    private readonly k: RescueKernel, private readonly tasks: CrewTasks, private readonly tuning: MedicsTuning,
    private readonly calls: HelpCall[], private readonly stats: NpcStats,
  ) {}

  reset(): void {
    this.signalled.clear();
  }

  /** Un pas de réflexion d'un secouriste. */
  think(m: Medic): void {
    const k = this.k;
    const ctx = k.ctx;
    const now = k.now;
    const p = m.p;
    const r = m.r;
    if (p.dormant || p.custody !== 'free' || p.heldBy !== 0 || p.vehicleId !== 0 || ctx.health.isIncapacitated(p)) {
      // hors d'état : il lâche ce qu'il faisait
      if (r.task !== T_IDLE) this.tasks.release(r);
      r.walker.active = false;
      return;
    }
    if (this.selfCare(m)) return;
    this.handsUp(m);
    if (r.task === T_CASUALTY) {
      this.work(m);
      return;
    }
    const victim = this.pick(m);
    if (victim) {
      this.shelterFor(victim, m);
      this.tasks.takeCasualty(r, victim, this.out.x, this.out.z);
      k.care.claim(victim.id, p.id, 20);
      k.care.noteNeed(victim);
      this.work(m);
      return;
    }
    this.follow(m, now);
  }

  // ───────────────────────────── se protéger ─────────────────────────────

  /** Trop de gaz pour lui : masque, sinon sortie du nuage ; rinçage de ses propres yeux une fois à l'air. */
  private selfCare(m: Medic): boolean {
    const k = this.k;
    const ctx = k.ctx;
    const now = k.now;
    const p = m.p;
    const here = ctx.hazards.gasAt(p.x, p.z);
    if (here > 0.25 && !m.maskOn) {
      const gear = ctx.service<GearLike>('people.gear');
      if (gear && gear.hasMask(p) && gear.setGasMask(p, true)) m.maskOn = true;
    } else if (m.maskOn && here < 0.05 && p.gas < 0.1) {
      const gear = ctx.service<GearLike>('people.gear');
      if (gear) gear.setGasMask(p, false);
      m.maskOn = false;
    }
    if (p.gas > this.tuning.selfGasLimit && here > 0.2 && p.carrying === 0) {
      // il ne peut plus travailler : il sort du nuage par le côté le plus respirable
      if (now >= m.retreatUntil) {
        let bestX = p.x;
        let bestZ = p.z;
        let best = Infinity;
        for (let i = 0; i < 8; i++) {
          const a = (i * Math.PI) / 4;
          const x = p.x + Math.sin(a) * 14;
          const z = p.z + Math.cos(a) * 14;
          if (!ctx.world.isFree(x, z, 0.5) || !clearLine(ctx, p.x, p.z, x, z)) continue;
          const g = ctx.hazards.gasAt(x, z) + ctx.hazards.fireAt(x, z) * 2;
          if (g < best) {
            best = g;
            bestX = x;
            bestZ = z;
          }
        }
        m.retreatUntil = now + 4;
        ctx.interactions.cancel(p);
        if (m.r.task !== T_IDLE) this.tasks.release(m.r);
        m.r.walker.goTo(ctx, p, bestX, bestZ, 1.5);
      }
      return true;
    }
    if (now < m.retreatUntil && m.r.walker.active) return true;
    if (p.gas > 0.3 && here < 0.1 && now >= m.selfRinseAt && !this.tasks.busy(p) && m.r.task === T_IDLE) {
      // à l'air libre : une dose pour lui-même
      const needKit = ctx.actions.def('serum_physiologique') !== undefined;
      if (!needKit || ctx.actions.has(p, 'serum_physiologique') > 0) {
        m.selfRinseAt = now + 30;
        const ext = ctx.service<HealthExtLike>('people.health');
        if (ext) ext.rinseEyes(p, p.id);
        p.gas *= 0.6;
        if (needKit) ctx.actions.remove(p, 'serum_physiologique', 1);
      }
    }
    return false;
  }

  /** Une charge passe tout près : il s'arrête et lève les mains pour être reconnu. */
  private handsUp(m: Medic): void {
    const k = this.k;
    const p = m.p;
    const now = k.now;
    if (p.carrying !== 0 || this.tasks.busy(p)) return;
    if (now >= m.handsUntil && k.ctx.people.countIn(p.x, p.z, 6, this.isRunningPolice) > 0) m.handsUntil = now + 1.6;
    if (now < m.handsUntil) {
      if (p.upper === 'none') {
        p.upper = 'hands_up';
        p.upperT = 0;
      }
    } else if (p.upper === 'hands_up') {
      p.upper = 'none';
    }
  }

  // ───────────────────────────── choisir qui traiter ─────────────────────────────

  /** La personne a-t-elle besoin d'un secouriste de rue ? */
  private needs(q: Person): boolean {
    const care = this.k.care;
    if (q.dormant || q.vehicleId !== 0 || q.heldBy !== 0 || q.injury === 'dead') return false;
    if (q.faction === 'rescue' && q.posture !== 'down') return false;
    if (q.posture === 'down') return care.needsCare(q) || (injuryRank(q.injury) >= 2 && !this.signalled.has(q.id));
    if (care.needsRinse(q) && q.gas > this.tuning.gasThreshold) return true;
    // blessé debout : petits soins, s'il ne court pas
    return care.needsCare(q) && q.vx * q.vx + q.vz * q.vz < 2.25;
  }

  /** La victime la plus urgente à sa portée (vue, ou entendue par un appel), libre de tout autre soignant. */
  private pick(m: Medic): Person | null {
    const k = this.k;
    const ctx = k.ctx;
    const p = m.p;
    const t = this.tuning;
    const care = k.care;
    let best: Person | null = null;
    let bestU = 0;
    const n = ctx.people.queryRadius(p.x, p.z, t.sightRange, this.near);
    for (let i = 0; i < n; i++) {
      const q = this.near[i];
      if (q === p || !this.needs(q)) continue;
      const claimed = care.claimedBy(q.id);
      if (claimed !== 0 && claimed !== p.id) continue;
      const d = Math.hypot(q.x - p.x, q.z - p.z);
      if (d > 12 && !ctx.world.lineOfSight(p.x, p.z, q.x, q.z)) continue;
      const u = care.priority(q) - 0.8 * d;
      if (u > bestU) {
        bestU = u;
        best = q;
      }
    }
    // appels entendus au-delà de la vue
    const calls = this.calls;
    const now = k.now;
    for (let i = 0; i < calls.length; i++) {
      const c = calls[i];
      if (now - c.t > HELP_MEMORY) continue;
      const d = Math.hypot(c.x - p.x, c.z - p.z);
      if (d > t.hearRange) continue;
      const q = ctx.people.get(c.id);
      if (!q || q === p || !this.needs(q)) continue;
      const claimed = care.claimedBy(q.id);
      if (claimed !== 0 && claimed !== p.id) continue;
      const u = care.priority(q) + 20 - 0.8 * d;
      if (u > bestU) {
        bestU = u;
        best = q;
      }
    }
    return best;
  }

  /** Point abrité où porter la victime : respirable, hors du feu, accessible en ligne droite, plutôt sur un trottoir. Écrit this.out. */
  private shelterFor(victim: Person, m: Medic): void {
    const ctx = this.k.ctx;
    const out = this.out;
    out.x = victim.x;
    out.z = victim.z;
    let best = Infinity;
    const a0 = (m.p.id % 12) * 0.5;
    for (let ring = 0; ring < SHELTER_RINGS.length; ring++) {
      const dist = SHELTER_RINGS[ring];
      for (let i = 0; i < SHELTER_DIRS; i++) {
        const a = a0 + (i * Math.PI * 2) / SHELTER_DIRS;
        const x = victim.x + Math.sin(a) * dist;
        const z = victim.z + Math.cos(a) * dist;
        if (!ctx.world.isFree(x, z, 0.6) || !clearLine(ctx, victim.x, victim.z, x, z)) continue;
        const gas = ctx.hazards.gasAt(x, z);
        const fire = ctx.hazards.fireAt(x, z);
        if (fire > 0.02) continue;
        let cost = gas * 12 + ctx.director.tensionAt(x, z) * 3 + dist * 0.04;
        if (ctx.world.surfaceAt(x, z) === 'sidewalk') cost -= 0.5;
        if (cost < best) {
          best = cost;
          out.x = x;
          out.z = z;
        }
      }
      if (best < 1) break; // un abri correct à cette distance : inutile d'aller plus loin
    }
  }

  // ───────────────────────────── prise en charge ─────────────────────────────

  private work(m: Medic): void {
    const k = this.k;
    const ctx = k.ctx;
    const now = k.now;
    const r = m.r;
    const p = m.p;
    if (r.stage === S_STAY) {
      // auprès d'un cas grave signalé : jusqu'à l'arrivée du SAMU
      const victim = ctx.people.get(r.targetId);
      if (!victim || victim.posture !== 'down' || victim.heldBy !== 0 || victim.vehicleId !== 0 || now >= m.stayUntil || this.samuNear(victim)) {
        this.tasks.release(r);
        return;
      }
      this.tasks.stayWith(r, victim.id);
      k.care.claim(victim.id, p.id, 20);
      return;
    }
    const carrying = r.stage === S_CARRY;
    const res = this.tasks.casualty(m.crew, r, false);
    if (!carrying && r.stage === S_CARRY) this.stats.sheltered++;
    if (res === R_BUSY) return;
    const victim = ctx.people.get(r.targetId);
    if (res === R_NEEDS_EVAC && victim) {
      this.signal(m, victim);
      r.stage = S_STAY;
      m.stayUntil = now + this.tuning.waitForSamu;
      return;
    }
    if (res !== R_DONE && victim && victim.posture === 'down' && injuryRank(victim.injury) >= 2 && !this.signalled.has(victim.id)) {
      // il n'a rien pu faire (plus de matériel, victime intransportable) : il la signale quand même
      this.signal(m, victim);
    }
    this.tasks.release(r);
  }

  private samuNear(victim: Person): boolean {
    const rescue = this.k.ctx.service<RescueApi>(EXT.rescue);
    if (!rescue) return false;
    const calls = rescue.calls;
    for (let i = 0; i < calls.length; i++) {
      const c = calls[i];
      if (c.kind === 'samu' && c.state === 'sur_place' && Math.hypot(c.x - victim.x, c.z - victim.z) < 40) return true;
    }
    return false;
  }

  /** Cas grave : incident, appel du SAMU, bilan transmis. */
  private signal(m: Medic, victim: Person): void {
    if (this.signalled.has(victim.id)) return;
    this.signalled.add(victim.id);
    const k = this.k;
    const ctx = k.ctx;
    const rank = injuryRank(victim.injury);
    let incidentId = 0;
    const incidents = ctx.service<IncidentsApi>(EXT.incidents);
    if (incidents) {
      incidentId = incidents.open(victim.faction === 'police' ? 'agent_a_terre' : 'blesse', victim.x, victim.z, 'person', victim.id, rank >= 3 ? 3 : 2).id;
    }
    const rescue = ctx.service<RescueApi>(EXT.rescue);
    if (rescue) rescue.request('samu', victim.x, victim.z, m.p.id, incidentId !== 0 ? incidentId : undefined);
    const where = ctx.world.sectorName(victim.x, victim.z);
    ctx.radio.say({
      channel: 'secours', from: 'Secouriste de rue', priority: 2, personId: m.p.id,
      text: `Ici un secouriste bénévole${where !== '' ? `, ${where}` : ''}. Une personne à terre, blessure ${rank >= 3 ? 'critique' : 'sérieuse'}, `
        + 'premiers gestes faits. Je demande le SAMU et je reste avec elle.',
    });
    this.stats.signalled++;
    const ev = this.callEvent;
    ev.medicId = m.p.id;
    ev.victimId = victim.id;
    ev.x = victim.x;
    ev.z = victim.z;
    ev.incidentId = incidentId;
    ctx.events.emitAny(MEDIC_CALL_EVENT, ev);
  }

  // ───────────────────────────── suivre le cortège ─────────────────────────────

  private follow(m: Medic, now: number): void {
    const k = this.k;
    const ctx = k.ctx;
    const p = m.p;
    const r = m.r;
    if (this.tasks.busy(p)) return;
    if (now >= m.anchorAt) {
      m.anchorAt = now + 2;
      this.anchor(m);
    }
    const d = Math.hypot(m.anchorX - p.x, m.anchorZ - p.z);
    if (d > 5) {
      r.walker.goTo(ctx, p, m.anchorX, m.anchorZ, 3);
    } else if (!r.walker.active) {
      holdFacing(p, m.anchorX, m.anchorZ);
    }
  }

  /** Où se tenir : avec le joueur de son groupe, sinon dans le cortège derrière la tête, sinon au milieu de la foule proche. */
  private anchor(m: Medic): void {
    const ctx = this.k.ctx;
    const p = m.p;
    // son groupe compte le joueur : il reste près de lui
    if (p.squadId !== 0) {
      const player = ctx.player.person();
      if (player && player !== p && player.squadId === p.squadId) {
        const a = player.heading + Math.PI + m.side * 0.12;
        m.anchorX = player.x + Math.sin(a) * 3.5;
        m.anchorZ = player.z + Math.cos(a) * 3.5;
        return;
      }
    }
    const route = ctx.director.route;
    const phase = ctx.director.phase;
    if (route.length >= 4 && (phase === 'depart' || phase === 'cortege' || phase === 'tension' || phase === 'affrontement')) {
      const s = ctx.director.headProgress - m.back;
      const heading = pointOnPolyline(route, s > 0 ? s : 0, this.out);
      m.anchorX = this.out.x - Math.cos(heading) * m.side;
      m.anchorZ = this.out.z + Math.sin(heading) * m.side;
      return;
    }
    // pas de cortège en marche : au milieu des manifestants qui l'entourent
    const n = ctx.people.queryRadius(p.x, p.z, 45, this.near, this.isProtester);
    if (n >= 4) {
      let sx = 0;
      let sz = 0;
      for (let i = 0; i < n; i++) {
        sx += this.near[i].x;
        sz += this.near[i].z;
      }
      m.anchorX = sx / n + m.side * 0.5;
      m.anchorZ = sz / n + (m.back - 30) * 0.2;
    }
  }
}
