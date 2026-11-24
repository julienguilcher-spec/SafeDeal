/* =====================================================================================
 * GROUPES RADICAUX — déroulement des plans d'un groupe (une étape à la fois, à chaque réflexion du groupe).
 *
 *   rallier       gagner sa place dans le bloc, en tête de cortège, et la tenir en avançant avec lui ;
 *   préparer      signal de ralliement → changement de tenue à l'abri des parapluies → banderole déployée,
 *                 projectiles collectés, mobilier tiré sur la chaussée ;
 *   salve         avance jusqu'à distance de lancer → salve à l'instant commun → recul hors de portée →
 *                 pause (6 à 10 s par lanceur) → de nouveau ; plus hardi si la ligne recule ou fatigue ;
 *   ravitailler   tout le groupe va à la source de projectiles la plus proche (jusqu'à 200 m) ;
 *   assaut        submerger un agent isolé ou à terre, tant que ses collègues n'arrivent pas ;
 *   libérer       l'essaim autour de l'escorte d'un camarade interpellé ;
 *   barricade     porter le mobilier mobile en travers de la rue, puis y mettre le feu ;
 *   casse, incendie, renverser   une cible à la fois, réservée, quittée dès qu'elle est traitée ;
 *   recul         repli groupé hors de portée ; dispersion par les rues adjacentes ; regroupement ;
 *   fusion        se changer de nouveau et reprendre place dans la foule.
 * Un plan qui aboutit ou échoue rend la main (plan « rallier ») : la décision tactique en choisit un autre.
 * ===================================================================================== */

import { pickStandoff } from './assess';
import { goCivil } from './attire';
import { isPoliceUp } from './kernel';
import type { RadKernel } from './kernel';
import { depthOf, faceGroup, layout, moveGroup, recenter } from './march';
import { BLOC, PLAN, TARGET, TASK, TOOL, isAble } from './model';
import type { BlocState, RadGroup } from './model';
import { SIGN } from './signals';
import { SOURCE, findSource, sourceAlive } from './supply';
import { findBarricadeSite, groupTools, materialAround } from './targets';
import * as R from './tuning';

/** Le plan en cours est terminé : le groupe se remet en formation et attend la prochaine décision. */
function finish(k: RadKernel, g: RadGroup, ok: boolean): void {
  if (g.tId !== 0) {
    if (k.claims.get(g.tId) === g.id) k.claims.delete(g.tId);
    if (!g.done.includes(g.tId)) g.done.push(g.tId);
    if (g.done.length > 24) g.done.shift();
  }
  k.setPlan(g, PLAN.RALLY);
  g.planOk = ok;
  g.reviewAt = k.now;
}

function countTask(g: RadGroup, task: number): number {
  let n = 0;
  for (let i = 0; i < g.members.length; i++) if (g.members[i]!.task === task && g.members[i]!.held) n++;
  return n;
}

/** Part des lanceurs (mains libres) qui n'ont plus rien à lancer. */
function emptyShare(g: RadGroup): number {
  let hands = 0;
  let empty = 0;
  for (let i = 0; i < g.members.length; i++) {
    const m = g.members[i]!;
    if (!isAble(m) || m.umbrella || m.banner) continue;
    hands++;
    if (m.ammo <= 0) empty++;
  }
  return hands > 0 ? empty / hands : 1;
}

/** Part des membres armés (un projectile, un mortier, un engin incendiaire) qui sont à leur place dans la formation. */
function armedInPlace(g: RadGroup): number {
  let armed = 0;
  let ready = 0;
  for (let i = 0; i < g.members.length; i++) {
    const m = g.members[i]!;
    if (!isAble(m) || m.umbrella || m.banner) continue;
    if (m.ammo <= 0 && (m.tools & (TOOL.MORTAR | TOOL.MOLOTOV)) === 0) continue;
    armed++;
    const wx = g.ax - g.hz * m.lx - g.hx * m.lz;
    const wz = g.az + g.hx * m.lx - g.hz * m.lz;
    if ((wx - m.p.x) * (wx - m.p.x) + (wz - m.p.z) * (wz - m.p.z) < 9) ready++;
  }
  return armed > 0 ? ready / armed : 1;
}

/** Place du groupe dans le bloc : les groupes se suivent, celui de tête porte la banderole. */
function blocPlace(k: RadKernel, bloc: BlocState, g: RadGroup, out: { x: number; z: number }): void {
  let back = 0;
  for (let i = 0; i < k.groups.length; i++) {
    const o = k.groups[i]!;
    if (o.rank < g.rank) back += depthOf(o) + 1.6;
  }
  out.x = bloc.x - bloc.hx * back;
  out.z = bloc.z - bloc.hz * back;
}

/** Point de repli : à `dist` mètres des forces, à l'opposé, sinon en arrière vers le bloc. */
function retreatPoint(k: RadKernel, bloc: BlocState, g: RadGroup, dist: number): void {
  const a = g.a;
  const world = k.ctx.world;
  let ux = g.ax - a.nx;
  let uz = g.az - a.nz;
  const d = Math.hypot(ux, uz);
  if (a.police > 0 && d > 0.5) {
    ux /= d;
    uz /= d;
    for (let c = 0; c < 5; c++) {
      const ang = c === 0 ? 0 : (c & 1 ? 1 : -1) * (c <= 2 ? 0.5 : 1);
      const cs = Math.cos(ang);
      const sn = Math.sin(ang);
      const x = a.nx + (ux * cs - uz * sn) * dist;
      const z = a.nz + (ux * sn + uz * cs) * dist;
      if (world.isFree(x, z, 0.6) && world.lineOfSight(g.ax, g.az, x, z)) {
        k.v2.x = x;
        k.v2.z = z;
        return;
      }
    }
  }
  // pas d'espace derrière soi : vers l'arrière du bloc (le cortège)
  k.v2.x = bloc.x - bloc.hx * 25;
  k.v2.z = bloc.z - bloc.hz * 25;
}

/** Fait avancer le plan du groupe. */
export function runPlan(k: RadKernel, bloc: BlocState, g: RadGroup): void {
  const a = g.a;
  const now = k.now;
  const ctx = k.ctx;
  const entering = g.entered !== g.stage;
  g.entered = g.stage;
  // jamais dans les flammes : le point du groupe s'écarte d'un feu qui gagne
  if (g.plan !== PLAN.FOLLOW && g.arrived && ctx.hazards.fireAt(g.ax, g.az) > 0.02) {
    const world = ctx.world;
    for (let c = 0; c < 8; c++) {
      const ang = (c / 8) * 6.283 + g.id;
      const x = g.ax + Math.sin(ang) * 9;
      const z = g.az + Math.cos(ang) * 9;
      if (ctx.hazards.fireAt(x, z) > 0.01 || !world.isFree(x, z, 0.6) || !world.lineOfSight(g.ax, g.az, x, z)) continue;
      moveGroup(k, g, x, z, R.SPEED_RETREAT);
      break;
    }
  }
  switch (g.plan) {
    case PLAN.FOLLOW:
      break;

    case PLAN.RALLY: {
      if (entering) layout(k, g, bloc.phase >= BLOC.FORMING && bloc.phase <= BLOC.ACTION);
      if (bloc.phase === BLOC.WILD || bloc.phase === BLOC.RETREAT) {
        // hors cortège : on tient autour du point de regroupement (qui se déplace : manifestation sauvage)
        moveGroup(k, g, bloc.rallyX + (g.rank % 2 === 0 ? 1 : -1) * Math.ceil(g.rank / 2) * 5, bloc.rallyZ, R.SPEED_ADVANCE);
        break;
      }
      blocPlace(k, bloc, g, k.v2);
      moveGroup(k, g, k.v2.x, k.v2.z, R.SPEED_WALK * 1.25);
      if (g.arrived) {
        g.hx = bloc.hx;
        g.hz = bloc.hz;
      }
      if (bloc.phase === BLOC.SIGNS) k.signals.mark(g, SIGN.GATHER, g.ax, g.az, a.able, now);
      break;
    }

    case PLAN.PREPARE: {
      blocPlace(k, bloc, g, k.v2);
      moveGroup(k, g, k.v2.x, k.v2.z, R.SPEED_WALK * 1.25);
      if (g.arrived) {
        g.hx = bloc.hx;
        g.hz = bloc.hz;
      }
      if (g.stage === 0) {
        if (entering) layout(k, g, true);
        // le signal vient du groupe de tête ; les autres l'attendent, six secondes au plus
        if (bloc.signalAt >= 0 || now - g.stageSince > 6) {
          if (bloc.signalAt < 0) bloc.signalAt = now;
          if (now - bloc.signalAt >= 4 || g.rank > 0) k.setStage(g, 1);
        }
        k.signals.mark(g, SIGN.RALLY, g.ax + g.hx * 6, g.az + g.hz * 6, a.able, now);
        break;
      }
      if (g.stage === 1) {
        if (entering) {
          // on se change à tour de rôle, à l'abri des parapluies
          const span = R.CHANGE_STAGGER * k.timeK * bloc.lead;
          let i = 0;
          for (const m of g.members) {
            if (m.black) continue;
            m.changeAt = now + 1 + (i / Math.max(1, g.members.length)) * span + k.rng.next() * 2;
            i++;
          }
        }
        if (now - bloc.signalAt < 25) k.signals.mark(g, SIGN.RALLY, g.ax + g.hx * 6, g.az + g.hz * 6, a.able, now);
        const changing = countTask(g, TASK.CHANGE);
        if (changing > 0) k.signals.mark(g, SIGN.CHANGE, g.ax, g.az, changing, now);
        let black = 0;
        for (const m of g.members) if (m.black || !isAble(m)) black++;
        if (black >= g.members.length || now - g.stageSince > R.CHANGE_STAGGER * k.timeK * bloc.lead + R.CHANGE_SECONDS * 1.3 + 8) {
          g.black = true;
          k.setStage(g, 2);
        }
        break;
      }
      if (entering) {
        layout(k, g, true);
        // de quoi lancer, à portée de marche ; et de quoi commencer une barricade
        if (!findSource(k, g, g.ax, g.az, 80)) g.supplyKind = SOURCE.NONE;
        if (k.heat >= R.TIER_BLOC && materialAround(k, g.ax, g.az, 30) >= 4) findBarricadeSite(k, g);
      } else if (g.supplyKind !== SOURCE.NONE && !sourceAlive(k, g)) {
        if (!findSource(k, g, g.ax, g.az, 80)) g.supplyKind = SOURCE.NONE;
      }
      break;
    }

    case PLAN.VOLLEY: {
      if (a.police < 2 || a.dist > 108) {
        finish(k, g, true);
        break;
      }
      const fire = k.heat >= R.TIER_RIOT && (groupTools(g) & (TOOL.MORTAR | TOOL.MOLOTOV)) !== 0;
      if (g.stage === 0) {
        if (entering || now - g.stageSince > 3.5 && !g.arrived && Math.hypot(g.destX - a.nx, g.destZ - a.nz) > R.THROW_DIST + 8) {
          if (!pickStandoff(k, g, g.bold ? R.THROW_DIST_BOLD : R.THROW_DIST)) {
            finish(k, g, false);
            break;
          }
          if (!g.tight) layout(k, g, true);
          moveGroup(k, g, k.v2.x, k.v2.z, R.SPEED_ADVANCE);
        }
        if (g.arrived) faceGroup(g, a.nx, a.nz);
        // prêts : en place, ceux qui ont de quoi lancer à leur rang ; au bout du délai on lance quand même, si
        // l'on est à portée
        const far = a.dist > R.THROW_DIST + 4;
        if ((g.arrived && armedInPlace(g) >= 0.6) || (now - g.stageSince > R.VOLLEY_READY_TIMEOUT && !far) || now - g.stageSince > 25) {
          if (far && !g.arrived) {
            // on n'y arrive pas (passage barré, groupe étiré) : on renonce à cet axe
            finish(k, g, false);
            break;
          }
          if (g.ammo <= 0 && !fire) {
            g.resume = PLAN.VOLLEY;
            k.setPlan(g, PLAN.RESUPPLY, R.SUPPLY_SECONDS);
            break;
          }
          faceGroup(g, a.nx, a.nz);
          // salve commune : on se cale sur l'horloge du bloc si une salve part dans les trois secondes
          g.volleyAt = bloc.volleyAt > now + 0.4 && bloc.volleyAt < now + 3 ? bloc.volleyAt : now + 1;
          bloc.volleyAt = g.volleyAt;
          // une à trois vagues avant de reculer, selon ce qui est permis et ce qu'on a en main
          g.rounds = k.heat >= R.TIER_RIOT ? 2 : k.heat >= R.TIER_CLASH ? 1 : 0;
          k.setStage(g, 1);
        }
        break;
      }
      if (g.stage === 1) {
        if (now > g.volleyAt + R.VOLLEY_SPREAD + 1.6) {
          g.volleys++;
          k.stats.volleys++;
          k.emit('salve', g, g.ax, g.az, g.throwers, 0);
          if (g.rounds > 0 && (g.ammo > 0 || fire) && a.dist > 9) {
            // encore de quoi lancer : une vague de plus, sur place
            g.rounds--;
            g.volleyAt = now + 1.8;
            bloc.volleyAt = g.volleyAt;
            faceGroup(g, a.nx, a.nz);
          } else k.setStage(g, 2);
        }
        break;
      }
      if (g.stage === 2) {
        if (entering) {
          retreatPoint(k, bloc, g, R.SAFE_DIST);
          moveGroup(k, g, k.v2.x, k.v2.z, R.SPEED_RETREAT);
        }
        if (g.arrived || now - g.stageSince > 9) k.setStage(g, 3);
        break;
      }
      if (entering) {
        const calm = k.heat < R.TIER_CLASH;
        g.bold = a.closing < -0.4 || a.stamina < 0.35;
        g.nextVolley = now + k.rng.range(R.VOLLEY_PAUSE_MIN, R.VOLLEY_PAUSE_MAX) * (calm ? 2 : 1) * (g.bold ? 0.6 : 1);
        if (!findSource(k, g, g.ax, g.az, R.SUPPLY_NEAR)) g.supplyKind = SOURCE.NONE;
        faceGroup(g, a.nx, a.nz);
      }
      if (now >= g.nextVolley) {
        if (emptyShare(g) > R.SUPPLY_TRIGGER && !fire) {
          g.resume = PLAN.VOLLEY;
          k.setPlan(g, PLAN.RESUPPLY, R.SUPPLY_SECONDS);
        } else k.setStage(g, 0);
      }
      break;
    }

    case PLAN.RESUPPLY: {
      if (g.stage === 0) {
        if (entering) {
          g.travelled = false;
          g.lastSupplyAt = now;
          // au plus près d'abord (chacun de son côté) ; on ne déplace le groupe que s'il n'y a rien alentour
          if (!findSource(k, g, g.ax, g.az, R.SUPPLY_NEAR)) {
            if (!findSource(k, g, g.ax, g.az, R.SUPPLY_FAR)) {
              // plus rien à lancer nulle part : on fera autre chose
              g.noAmmoUntil = now + 60 * k.timeK;
              finish(k, g, false);
              break;
            }
            g.travelled = true;
            const d = Math.hypot(g.supplyX - g.ax, g.supplyZ - g.az);
            moveGroup(k, g, g.ax + (g.supplyX - g.ax) * ((d - 6) / d), g.az + (g.supplyZ - g.az) * ((d - 6) / d), R.SPEED_ADVANCE);
            g.planUntil = now + R.SUPPLY_SECONDS + d / R.SPEED_ADVANCE;
          }
          k.emit('ravitaillement', g, g.supplyX, g.supplyZ, a.able, g.supplyId);
          layout(k, g, false);
        }
        if (g.arrived || Math.hypot(g.supplyX - g.ax, g.supplyZ - g.az) < 12) {
          g.lastSupplyAt = now;
          k.setStage(g, 1);
        }
        break;
      }
      const gathering = countTask(g, TASK.SUPPLY);
      if (gathering > 0) {
        k.signals.mark(g, g.supplyKind === SOURCE.PILE || g.supplyKind === SOURCE.SETT ? SIGN.UNPAVE : SIGN.COLLECT, g.supplyX, g.supplyZ, gathering, now);
      }
      const filled = emptyShare(g) <= 0.3;
      // plus personne ne trouve rien ici (aucune prise depuis huit secondes)
      const dry = now - g.lastSupplyAt > 8 && now - g.stageSince > 8;
      if (!filled && dry && !g.travelled && findSource(k, g, g.ax, g.az, R.SUPPLY_FAR) && Math.hypot(g.supplyX - g.ax, g.supplyZ - g.az) > R.SUPPLY_NEAR) {
        // on va chercher ailleurs : tout le groupe se déplace vers la source suivante
        g.travelled = true;
        const d = Math.hypot(g.supplyX - g.ax, g.supplyZ - g.az);
        moveGroup(k, g, g.ax + (g.supplyX - g.ax) * ((d - 6) / d), g.az + (g.supplyZ - g.az) * ((d - 6) / d), R.SPEED_ADVANCE);
        g.planUntil = now + R.SUPPLY_SECONDS + d / R.SPEED_ADVANCE;
        k.setStage(g, 0);
        g.entered = 0;
        k.emit('ravitaillement', g, g.supplyX, g.supplyZ, a.able, g.supplyId);
        break;
      }
      if (filled || dry || now > g.planUntil) {
        const resume = g.resume;
        const got = g.ammo >= Math.max(2, g.throwers * 0.4);
        if (!got) g.noAmmoUntil = now + 60 * k.timeK;
        k.setPlan(g, g.ammo > 0 && resume === PLAN.VOLLEY && a.police >= 3 && a.dist < 105 ? PLAN.VOLLEY : PLAN.RALLY);
        g.planOk = got;
        g.reviewAt = now;
        if ((g.plan as number) === PLAN.VOLLEY) {
          g.tKind = TARGET.POLICE;
          g.tx = a.px;
          g.tz = a.pz;
        }
      }
      break;
    }

    case PLAN.ASSAULT: {
      const q = ctx.people.get(g.tId);
      if (!q || q.dormant || q.vehicleId !== 0) {
        finish(k, g, true);
        break;
      }
      if (entering) {
        layout(k, g, false);
        k.emit('assaut', g, q.x, q.z, a.able, q.id);
        ctx.director.addTension(0.05, q.x, q.z, 'agent_pris_a_partie');
      }
      moveGroup(k, g, q.x, q.z, R.SPEED_RUN);
      faceGroup(g, q.x, q.z);
      // ses collègues arrivent : on décroche
      const mates = ctx.people.countIn(q.x, q.z, 12, isPoliceUp) - (q.posture === 'down' ? 0 : 1);
      if (mates >= 4 || now - g.planSince > 28) {
        g.why = 'renforts';
        finish(k, g, mates < 4);
        if (mates >= 4) k.setPlan(g, PLAN.FALLBACK);
      }
      break;
    }

    case PLAN.RESCUE: {
      const h = ctx.people.get(g.tId);
      if (entering) {
        k.stats.rescuesTried++;
        layout(k, g, false);
        if (h) {
          k.emit('liberation_tentee', g, h.x, h.z, a.able, h.id);
          ctx.director.addTension(0.06, h.x, h.z, 'tentative_de_liberation');
        }
      }
      if (!h || h.custody === 'free') {
        // libéré : on file avec lui
        g.morale = Math.min(1, g.morale + 0.15);
        finish(k, g, true);
        g.why = 'liberation';
        k.setPlan(g, PLAN.FALLBACK);
        break;
      }
      if (h.custody === 'in_vehicle' || h.custody === 'handed_over' || h.vehicleId !== 0 || now - g.planSince > R.RESCUE_SECONDS
        || ctx.people.countIn(h.x, h.z, 12, isPoliceUp) > R.RESCUE_ESCORT_MAX + 2) {
        g.morale = Math.max(0, g.morale - 0.08);
        g.why = 'liberation_manquee';
        finish(k, g, false);
        k.setPlan(g, PLAN.FALLBACK);
        break;
      }
      moveGroup(k, g, h.x, h.z, R.SPEED_RUN);
      faceGroup(g, h.x, h.z);
      break;
    }

    case PLAN.BARRICADE: {
      const s = g.site;
      if (!s.active) {
        finish(k, g, false);
        break;
      }
      if (g.stage === 0) {
        if (entering && s.barricadeId !== 0 && ctx.props.get(s.barricadeId) !== undefined && !s.lit) {
          // on revient à une barricade déjà montée pour l'incendier
          layout(k, g, false);
          const side = (g.ax - s.x) * s.rx + (g.az - s.z) * s.rz >= 0 ? 1 : -1;
          moveGroup(k, g, s.x + s.rx * side * 5, s.z + s.rz * side * 5, R.SPEED_ADVANCE);
          k.setStage(g, 1);
          break;
        }
        if (entering) {
          layout(k, g, false);
          g.assigned = 0;
          const side = (g.ax - s.x) * s.rx + (g.az - s.z) * s.rz >= 0 ? 1 : -1;
          moveGroup(k, g, s.x + s.rx * side * 5, s.z + s.rz * side * 5, R.SPEED_ADVANCE);
          g.hx = -s.rx * side;
          g.hz = -s.rz * side;
        }
        if (s.lit) {
          // elle brûle déjà (un bac en feu dans le tas) : on s'en écarte
          k.setStage(g, 2);
          break;
        }
        const carrying = countTask(g, TASK.CARRY);
        const left = materialAround(k, s.x, s.z, R.BARRICADE_COLLECT);
        const enough = s.barricadeId !== 0 && (s.bulk >= R.BARRICADE_BULK || left < 1);
        if (enough || (carrying === 0 && left < 1 && now - g.stageSince > 6) || now - g.planSince > R.BARRICADE_SECONDS) {
          if (s.barricadeId === 0) {
            // pas assez de matière : on laisse les objets en travers, c'est tout
            finish(k, g, false);
            break;
          }
          // on y met le feu quand l'affrontement se généralise, ou quand la ligne avance sur elle
          if (k.heat >= R.TIER_RIOT || (a.police > 0 && a.closing > 0.2 && a.dist < 60)) k.setStage(g, 1);
          else finish(k, g, true);
        }
        break;
      }
      if (g.stage === 1) {
        if (s.lit) {
          k.setStage(g, 2);
          break;
        }
        if (now - g.stageSince > 40) finish(k, g, true);
        break;
      }
      if (entering) {
        // derrière la barricade en feu
        const side = (g.ax - s.x) * s.rx + (g.az - s.z) * s.rz >= 0 ? 1 : -1;
        moveGroup(k, g, s.x + s.rx * side * 9, s.z + s.rz * side * 9, R.SPEED_ADVANCE);
      }
      if (now - g.stageSince > 6) finish(k, g, true);
      break;
    }

    case PLAN.BREAK: {
      let gone = false;
      let fx = g.tx;
      let fz = g.tz;
      if (g.tKind === TARGET.SHOP) {
        const s = ctx.props.shop(g.tId);
        if (!s || s.window === 'broken' || s.burning > 0) gone = true;
        else {
          fx = s.x + Math.sin(s.heading) * 6;
          fz = s.z + Math.cos(s.heading) * 6;
        }
      } else {
        const pr = ctx.props.get(g.tId);
        if (!pr || pr.state === 'broken' || pr.state === 'burnt') gone = true;
        else {
          const d = Math.hypot(g.ax - pr.x, g.az - pr.z) || 1;
          fx = pr.x + ((g.ax - pr.x) / d) * 4;
          fz = pr.z + ((g.az - pr.z) / d) * 4;
        }
      }
      if (gone) {
        finish(k, g, true);
        break;
      }
      if (g.stage === 0) {
        if (entering) {
          layout(k, g, false);
          if (!ctx.world.isFree(fx, fz, 0.5)) {
            fx = g.tx;
            fz = g.tz;
          }
          moveGroup(k, g, fx, fz, R.SPEED_ADVANCE);
        }
        if (g.arrived || Math.hypot(g.ax - g.tx, g.az - g.tz) < 9 || now - g.stageSince > 25) {
          faceGroup(g, g.tx, g.tz);
          k.stats.windowsAttacked++;
          k.emit('vitrine_attaquee', g, g.tx, g.tz, a.able, g.tId);
          k.setStage(g, 1);
        }
        break;
      }
      // une ligne arrive sur nous, ou cela dure trop : on laisse
      if (now - g.stageSince > R.BREAK_SECONDS || (a.near >= 3 && a.dist < 18)) finish(k, g, false);
      break;
    }

    case PLAN.ARSON:
    case PLAN.FLIP: {
      let gone = false;
      if (g.tKind === TARGET.VEHICLE) {
        const v = ctx.vehicles.get(g.tId);
        if (!v || v.burning > 0.05 || v.state === 'burning' || v.state === 'burnt' || v.state === 'wrecked') gone = true;
        else if (g.plan === PLAN.FLIP && k.vehExt !== undefined && k.vehExt.isFlipped(v)) gone = true;
      } else {
        const pr = ctx.props.get(g.tId);
        if (!pr || pr.burning > 0 || pr.state === 'burnt' || pr.carriedBy !== 0) gone = true;
        else {
          g.tx = pr.x;
          g.tz = pr.z;
        }
      }
      if (gone) {
        // cela brûle (ou c'est retourné) : le groupe prend du champ avant de passer à autre chose
        const d = Math.hypot(g.ax - g.tx, g.az - g.tz) || 1;
        if (d < 9) moveGroup(k, g, g.tx + ((g.ax - g.tx) / d) * 11, g.tz + ((g.az - g.tz) / d) * 11, R.SPEED_ADVANCE);
        finish(k, g, true);
        break;
      }
      if (g.stage === 0) {
        if (entering) {
          layout(k, g, false);
          const d = Math.hypot(g.ax - g.tx, g.az - g.tz) || 1;
          const keep = g.tKind === TARGET.VEHICLE && g.plan === PLAN.ARSON ? 9 : 3.5;
          moveGroup(k, g, g.tx + ((g.ax - g.tx) / d) * keep, g.tz + ((g.az - g.tz) / d) * keep, R.SPEED_ADVANCE);
        }
        if (g.arrived || now - g.stageSince > 25) {
          faceGroup(g, g.tx, g.tz);
          k.setStage(g, 1);
        }
        break;
      }
      if (now - g.stageSince > (g.plan === PLAN.FLIP ? 40 : 45) || (a.near >= 3 && a.dist < 18)) finish(k, g, false);
      break;
    }

    case PLAN.FALLBACK: {
      if (entering) {
        k.stats.retreats++;
        k.emit('repli', g, g.ax, g.az, a.able, 0);
        retreatPoint(k, bloc, g, R.SAFE_DIST + 14);
        moveGroup(k, g, k.v2.x, k.v2.z, R.SPEED_RETREAT);
      }
      if ((g.arrived && now - g.planSince > 4) || now - g.planSince > 16) {
        // à l'abri : le moral remonte un peu si personne ne poursuit
        if (a.closing < 0.5) g.morale = Math.min(1, g.morale + 0.05);
        finish(k, g, true);
      }
      break;
    }

    case PLAN.SCATTER: {
      if (entering) {
        // petits groupes de trois à cinq, chacun vers une rue adjacente
        let i = 0;
        for (const m of g.members) {
          if (!isAble(m)) continue;
          m.team = g.rank + Math.floor(i / R.SCATTER_TEAM);
          i++;
        }
        k.emit('dispersion', g, g.ax, g.az, a.able, 0);
      }
      recenter(g);
      break;
    }

    case PLAN.REGROUP: {
      if (entering) {
        layout(k, g, false);
        recenter(g);
        moveGroup(k, g, bloc.rallyX + (g.rank % 2 === 0 ? 1 : -1) * Math.ceil(g.rank / 2) * 5, bloc.rallyZ, R.SPEED_ADVANCE);
        k.emit('regroupement', g, bloc.rallyX, bloc.rallyZ, a.able, 0);
      }
      break;
    }

    case PLAN.MELT: {
      if (entering) {
        k.emit('fusion', g, g.ax, g.az, a.able, 0);
        g.site.active = false;
      }
      recenter(g);
      let left = 0;
      for (const m of g.members) if (isAble(m) && !(m.task === TASK.CHANGE && m.step >= 2)) left++;
      if (left === 0 || now - g.planSince > R.MELT_SECONDS + 25) {
        // tout le monde a repris l'allure d'un manifestant ordinaire (les retardataires se changent où ils sont)
        for (const m of g.members) if (m.black || m.masked || m.umbrella || m.banner) goCivil(k, m);
        g.black = false;
        k.setPlan(g, PLAN.FOLLOW);
        for (const m of g.followers.slice()) k.detach(m);
      }
      break;
    }

    default:
      break;
  }
}
