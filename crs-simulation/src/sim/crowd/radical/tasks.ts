/* =====================================================================================
 * GROUPES RADICAUX — la tâche de chaque membre dans le plan de son groupe.
 *
 * Appelé à la réflexion du membre (quelques fois par seconde) quand aucun geste n'est en cours : selon
 * le plan et l'étape du groupe, ses outils et ses munitions, le membre tient sa place, se change, va
 * chercher des projectiles, lance à l'instant de la salve, frappe une vitrine, porte un objet jusqu'à
 * la barricade, y met le feu, pousse une voiture, court vers une rue adjacente, se fond dans la foule.
 * Les gestes eux-mêmes sont exécutés par acts.ts.
 * ===================================================================================== */

import type { Person } from '@/core/contracts';
import type { Acts } from './acts';
import { goBlack, goCivil, maskUp, setBanner, setUmbrella } from './attire';
import { attackProp, attackShop, bannerCount, carry, engage, freeHands, mortarBurst, setTask, shieldBearer, slot, supply, volleyShot } from './gestures';
import { isPoliceUp } from './kernel';
import type { RadKernel } from './kernel';
import { ACT, BLOC, KIND, PLAN, RES, TARGET, TASK, TOOL } from './model';
import type { BlocState, RadGroup, RadMember } from './model';
import * as R from './tuning';

/**
 * Donne sa tâche au membre. Retourne true si le contrôleur garde la main, false pour rendre la personne
 * au comportement par défaut de la foule.
 */
export function memberTask(k: RadKernel, acts: Acts, bloc: BlocState, g: RadGroup, m: RadMember): boolean {
  if (m.act !== ACT.NONE) return true;
  const ctx = k.ctx;
  const p = m.p;
  const now = k.now;
  switch (g.plan) {
    case PLAN.FOLLOW:
      return false;

    case PLAN.RALLY: {
      if (bloc.phase >= BLOC.SIGNS && !m.masked && now >= m.maskAt) maskUp(k, m);
      if ((bloc.phase === BLOC.ACTION || bloc.phase === BLOC.WILD) && mortarBurst(k, acts, g, m)) return true;
      // palier d'agitation : un tag en passant
      if ((m.tools & TOOL.PAINT) !== 0 && k.heat >= R.TIER_SIGNS && now >= m.nextScan && freeHands(m)) {
        m.nextScan = now + 6 + 8 * k.rngAct.next();
        const n = ctx.props.shopsNear(p.x, p.z, 14, k.shops);
        for (let i = 0; i < n; i++) {
          const s = k.shops[i]!;
          if (s.window !== 'intact' || s.shutter > 0.5 || (R.SHOP_WEIGHT[s.category] ?? 1) < 4 || g.done.includes(s.id)) continue;
          if (k.rngAct.next() > 0.5) continue;
          g.done.push(s.id);
          setTask(k, m, TASK.TAG);
          m.step = 1;
          acts.strike(m, 'bombe_peinture', s.x + Math.sin(s.heading) * 0.05, s.z + Math.cos(s.heading) * 0.05, 0, 1, 1.05, 18);
          k.emit('tag', g, s.x, s.z, 1, s.id);
          return true;
        }
      }
      if (m.task === TASK.TAG && m.step === 1) {
        m.step = 2;
        acts.wait(m, 4.2, false);
        return true;
      }
      return slot(k, m);
    }

    case PLAN.PREPARE: {
      if (!m.masked && now >= m.maskAt) maskUp(k, m);
      if (g.stage === 0) {
        // le signal : fumigène noir de celui qui en porte un, à défaut un parapluie levé
        if (g.rank === 0 && bloc.signalAt < 0 && freeHands(m)) {
          if ((m.tools & TOOL.SMOKE) !== 0) {
            bloc.signalAt = now;
            setTask(k, m, TASK.SIGNAL);
            acts.throwAt(m, 'fumigene', g.ax + g.hx * 7, p.y + 0.1, g.az + g.hz * 7, 0, now + 0.4);
            return true;
          }
          if ((m.tools & TOOL.UMBRELLA) !== 0 && shieldBearer(m) && setUmbrella(k, m, true)) bloc.signalAt = now;
        }
        return slot(k, m);
      }
      if ((m.tools & TOOL.UMBRELLA) !== 0 && !m.umbrella && shieldBearer(m)) setUmbrella(k, m, true);
      if (!m.black) {
        if (m.task === TASK.CHANGE && m.result === RES.DONE) {
          goBlack(k, m);
          return slot(k, m);
        }
        if (now >= m.changeAt) {
          setTask(k, m, TASK.CHANGE);
          acts.wait(m, R.CHANGE_SECONDS * (0.8 + 0.4 * ((m.b.phase * 0.159) % 1)), true);
          return true;
        }
        return slot(k, m);
      }
      if (g.stage >= 2) {
        if ((m.tools & TOOL.BANNER) !== 0 && !m.banner && g.rank === 0 && bannerCount(g) < 4) setBanner(k, m, true);
        if (freeHands(m)) {
          if ((m.task === TASK.SUPPLY || (m.ammo < 2 && now >= m.nextScan)) && supply(k, acts, g, m)) return true;
          if (m.ammo < 2 && now >= m.nextScan) m.nextScan = now + 5;
          // deux membres tirent du mobilier sur la chaussée
          if (g.site.active && m.ammo >= 2 && (m.task === TASK.CARRY || g.assigned < 3) && (m.p.id + g.id) % 3 === 0) {
            if (carry(k, acts, g, m, true)) return true;
          }
        }
      }
      return slot(k, m);
    }

    case PLAN.VOLLEY: {
      if (mortarBurst(k, acts, g, m)) return true;
      if (g.stage === 1 && now <= g.volleyAt + R.VOLLEY_SPREAD && volleyShot(k, acts, g, m)) return true;
      if (g.stage === 3 && freeHands(m) && now < g.nextVolley - 2 && (m.task === TASK.SUPPLY || (m.ammo === 0 && now >= m.nextScan))) {
        if (supply(k, acts, g, m)) return true;
        m.nextScan = now + 4;
      }
      if (m.task !== TASK.SLOT) k.refreshTools(m);
      return slot(k, m);
    }

    case PLAN.RESUPPLY: {
      if (g.stage >= 1 && freeHands(m) && (m.task === TASK.SUPPLY || (m.ammo < 3 && now >= m.nextScan))) {
        if (supply(k, acts, g, m)) return true;
        m.nextScan = now + 3;
      }
      return slot(k, m);
    }

    case PLAN.ASSAULT: {
      const q = ctx.people.get(g.tId);
      if (!q || q.dormant || q.vehicleId !== 0) return slot(k, m);
      return engage(k, acts, m, q);
    }

    case PLAN.RESCUE: {
      const h = ctx.people.get(g.tId);
      if (!h || h.custody === 'free') return slot(k, m);
      // la moitié s'en prend à celui qui tient le camarade, les autres à l'agent le plus proche d'eux
      let q: Person | undefined;
      if ((m.p.id & 1) === 0 && h.heldBy !== 0) q = ctx.people.get(h.heldBy);
      if (!q || q.posture === 'down') q = ctx.people.nearest(p.x, p.z, 14, isPoliceUp) ?? undefined;
      if (!q) {
        setTask(k, m, TASK.RUN);
        acts.goto(m, h.x, h.z, 2, R.SPEED_RUN, true, 8);
        return true;
      }
      return engage(k, acts, m, q);
    }

    case PLAN.BARRICADE: {
      const s = g.site;
      if (g.stage === 0) {
        if (carry(k, acts, g, m, false)) return true;
        return slot(k, m);
      }
      if (m.task === TASK.IGNITE && m.step > 0 && m.step < 9 && (s.lit || ctx.hazards.fireAt(p.x, p.z) > 0.01)) {
        // le feu prend : on s'en écarte aussitôt
        m.step = 9;
        const side = (p.x - s.x) * s.rx + (p.z - s.z) * s.rz >= 0 ? 1 : -1;
        acts.goto(m, p.x + s.rx * side * 8, p.z + s.rz * side * 8, 1.5, R.SPEED_RUN, true, 6);
        return true;
      }
      if (g.stage === 1 && s.barricadeId !== 0 && !s.lit) {
        // un seul allume : le meneur, ou celui qui porte un engin incendiaire
        const lighter = g.leader === m || (g.leader !== null && g.leader.act !== ACT.NONE && (m.tools & TOOL.MOLOTOV) !== 0);
        if (lighter && m.step < 3) {
          setTask(k, m, TASK.IGNITE);
          m.step++;
          const pr = ctx.props.get(s.barricadeId);
          if (pr) {
            acts.verb(m, 'incendier', pr.id, pr.x, pr.z, Math.min(pr.halfX, pr.halfZ) + 1.2, NaN, NaN, 30);
            return true;
          }
        }
      }
      return slot(k, m);
    }

    case PLAN.BREAK: {
      if (m.task === TASK.TAG && m.step === 1) {
        m.step = 2;
        acts.wait(m, 4.2, false);
        return true;
      }
      if (g.stage >= 1) {
        if (g.tKind === TARGET.SHOP) {
          const s = ctx.props.shop(g.tId);
          if (s && s.window !== 'broken' && attackShop(k, acts, m, s)) return true;
        } else if (g.tKind === TARGET.PROP) {
          const pr = ctx.props.get(g.tId);
          if (pr && pr.state !== 'broken' && pr.state !== 'burnt' && attackProp(k, acts, m, pr)) return true;
        }
      }
      return slot(k, m);
    }

    case PLAN.ARSON: {
      if (m.task === TASK.IGNITE && m.step > 0 && m.step < 9 && ctx.hazards.fireAt(p.x, p.z) > 0.01) {
        // le feu prend : on recule de quelques mètres
        m.step = 9;
        const d = Math.hypot(p.x - g.tx, p.z - g.tz) || 1;
        acts.goto(m, p.x + ((p.x - g.tx) / d) * 7, p.z + ((p.z - g.tz) / d) * 7, 1.5, R.SPEED_RUN, true, 6);
        return true;
      }
      if (g.stage >= 1 && m.step < 4) {
        if (g.tKind === TARGET.PROP) {
          const pr = ctx.props.get(g.tId);
          // deux personnes s'en chargent : renverser le bac sur la chaussée, puis y mettre le feu
          if (pr && pr.burning <= 0 && (g.leader === m || (m.p.id + g.id) % 4 === 0)) {
            setTask(k, m, TASK.IGNITE);
            m.step++;
            const reach = Math.max(pr.halfX, pr.halfZ) + 0.9;
            acts.verb(m, !pr.toppled && m.step === 1 ? 'renverser' : 'incendier', pr.id, pr.x, pr.z, reach, NaN, NaN, 25);
            return true;
          }
        } else if (g.tKind === TARGET.VEHICLE) {
          const v = ctx.vehicles.get(g.tId);
          if (v && v.burning < 0.05 && v.state !== 'burning') {
            const d = Math.hypot(v.x - p.x, v.z - p.z);
            if ((m.tools & TOOL.MOLOTOV) !== 0 && freeHands(m) && d >= 7 && d <= R.MOLOTOV_RANGE) {
              setTask(k, m, TASK.MOLOTOV);
              m.step = 4;
              acts.throwAt(m, 'molotov', v.x, v.y + 0.9, v.z, 0, now + 0.5);
              return true;
            }
            if (g.leader === m || (m.p.id + g.id) % 5 === 0) {
              setTask(k, m, TASK.IGNITE);
              m.step++;
              acts.verb(m, 'incendier', v.id, v.x, v.z, v.def.width * 0.5 + 1.3, NaN, NaN, 30);
              return true;
            }
          }
        }
      }
      return slot(k, m);
    }

    case PLAN.FLIP: {
      const v = ctx.vehicles.get(g.tId);
      if (g.stage >= 1 && v && m.step < 3 && freeHands(m)) {
        // tous du même côté, répartis sur la longueur
        const fx = Math.sin(v.heading);
        const fz = Math.cos(v.heading);
        const rx = -fz;
        const rz = fx;
        const side = (g.ax - v.x) * rx + (g.az - v.z) * rz >= 0 ? 1 : -1;
        const along = (((m.p.id * 13) % 7) / 6 - 0.5) * (v.def.length - 1);
        setTask(k, m, TASK.FLIP);
        m.step++;
        acts.verb(m, 'renverser', v.id, v.x + rx * side * (v.def.width * 0.5 + 0.55) + fx * along, v.z + rz * side * (v.def.width * 0.5 + 0.55) + fz * along, 0.55, v.x, v.z, 40);
        return true;
      }
      return slot(k, m);
    }

    case PLAN.FALLBACK:
      // on couvre le recul : les tubes tirent encore
      if (g.arrived && mortarBurst(k, acts, g, m)) return true;
      return slot(k, m);

    case PLAN.SCATTER: {
      setUmbrella(k, m, false);
      setBanner(k, m, false);
      const exits = bloc.exits;
      if (exits.length < 2) return slot(k, m);
      if (m.task === TASK.RUN && m.step >= 1) {
        // arrivé à la rue adjacente : on souffle, face au carrefour
        acts.wait(m, 2.5, false);
        return true;
      }
      const e = (m.team % (exits.length >> 1)) * 2;
      setTask(k, m, TASK.RUN);
      m.step = 1;
      acts.goto(m, exits[e]! + Math.sin(m.b.phase) * 2.5, exits[e + 1]! + Math.cos(m.b.phase) * 2.5, 4, R.SPEED_RUN, true, 70);
      return true;
    }

    case PLAN.REGROUP: {
      const d = Math.hypot(g.ax - p.x, g.az - p.z);
      if (d > 14) {
        setTask(k, m, TASK.RUN);
        acts.goto(m, g.ax + Math.sin(m.b.phase) * 3, g.az + Math.cos(m.b.phase) * 3, 5, R.SPEED_ADVANCE, true, 60);
        return true;
      }
      return slot(k, m);
    }

    case PLAN.MELT: {
      // 2 : déjà fondu
      if (m.step >= 2 && m.task === TASK.CHANGE) return false;
      if (m.task === TASK.CHANGE && m.step === 1) {
        goCivil(k, m);
        m.step = 2;
        k.stats.melts++;
        return false;
      }
      const cover = k.core.sense.coverAt(p.x, p.z, 20);
      const watched = k.core.sense.policeNear(p.x, p.z, 2) < 22;
      if ((cover >= R.MELT_COVER && !watched) || now - g.planSince > R.MELT_SECONDS) {
        setTask(k, m, TASK.CHANGE);
        m.step = 1;
        acts.wait(m, 5 + 3 * ((m.b.phase * 0.159) % 1), true);
        return true;
      }
      // vers la foule : sa place dans le cortège s'il en a une, sinon le gros des manifestants
      const d = k.core.director;
      let tx = d.centerX;
      let tz = d.centerZ;
      if (k.core.formation.slotPosition(p, k.v2)) {
        tx = k.v2.x;
        tz = k.v2.z;
      }
      setTask(k, m, TASK.RUN);
      acts.goto(m, tx, tz, 6, R.SPEED_ADVANCE, true, 12);
      return true;
    }

    default:
      return slot(k, m);
  }
}

/** Nature d'un membre, pour les essais et le débogage. */
export function kindName(m: RadMember): string {
  return m.kind === KIND.RADICAL ? 'radical' : m.kind === KIND.FOLLOWER ? 'suiveur' : 'pilleur';
}
