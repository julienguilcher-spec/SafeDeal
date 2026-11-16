/* =====================================================================================
 * GROUPES RADICAUX — gestes élémentaires, exécutés à chaque pas pour les seuls membres qui agissent.
 *
 * Tout passe par les mêmes voies que le joueur : la commande de déplacement et de visée (Person.cmd),
 * ctx.actions (prendre un objet en main, viser par solveAim, lancer, frapper) et ctx.interactions
 * (dépaver, ramasser, porter, poser, renverser, incendier, piller, renvoyer, repousser). Aucune
 * position n'est écrite, aucun projectile n'est créé ici : un pavé lancé sort de l'inventaire du lanceur.
 *
 *   aller      rejoindre un point (itinéraire par les rues si besoin), avec détection de blocage ;
 *   verbe      s'approcher, s'arrêter, se tourner, lancer l'interaction, attendre sa fin ;
 *   lancer     prendre l'objet, attendre l'instant de la salve, viser (solveAim), vérifier que rien ne
 *              barre le départ, lancer ; plusieurs coups pour un mortier ;
 *   frapper    s'approcher de la vitrine, du mobilier ou de la personne, se tourner, frapper N fois
 *              (à mains nues : repousser) ;
 *   coup de pied / raquette   éloigner ou renvoyer un palet fumant ;
 *   attendre   rester sur place (accroupi pour se changer).
 * ===================================================================================== */

import type { EntityId, InteractVerb, ItemId } from '@/core/contracts';
import { angleDiff } from '@/core/math';
import type { RadKernel } from './kernel';
import { dodge } from './march';
import { ACT, RES, isAble } from './model';
import type { RadMember } from './model';
import * as R from './tuning';

const AIM_TOL = 0.06;

export class Acts {
  constructor(private readonly k: RadKernel) {}

  // ───────────────────────────── lancement d'un geste ─────────────────────────────

  private begin(m: RadMember, act: number, timeout: number): void {
    const k = this.k;
    if (m.act !== ACT.NONE) this.cancel(m);
    m.act = act;
    m.actStage = 0;
    m.actSince = k.now;
    m.actUntil = k.now + timeout;
    m.actNotBefore = 0;
    m.actFX = NaN;
    m.actFZ = NaN;
    m.actId = 0;
    m.actItem = '';
    m.actVerb = '';
    m.actCount = 0;
    m.result = RES.RUNNING;
    m.stX = m.p.x;
    m.stZ = m.p.z;
    m.stT = k.now;
    m.stN = 0;
    if (m.actIndex < 0) {
      m.actIndex = k.acting.length;
      k.acting.push(m);
    }
  }

  private finish(m: RadMember, result: number): void {
    const k = this.k;
    m.act = ACT.NONE;
    m.result = result;
    const p = m.p;
    if (p.cmd.crouch) p.cmd.crouch = false;
    const i = m.actIndex;
    if (i >= 0) {
      const last = k.acting.length - 1;
      if (i !== last) {
        const moved = k.acting[last]!;
        k.acting[i] = moved;
        moved.actIndex = i;
      }
      k.acting.pop();
      m.actIndex = -1;
    }
    // la réflexion suivante choisit la suite sans attendre
    const soon = k.now + 0.06;
    if (m.b.nextThink > soon) m.b.nextThink = soon;
  }

  cancel(m: RadMember): void {
    if (m.act === ACT.NONE) return;
    const k = this.k;
    if (m.act === ACT.VERB && m.actStage === 2 && k.ctx.interactions.current(m.p) !== null) k.ctx.interactions.cancel(m.p);
    if (m.p.upper === 'kick') m.p.upper = 'none';
    this.finish(m, RES.FAILED);
  }

  goto(m: RadMember, x: number, z: number, reach: number, speed: number, run: boolean, timeout = 40): void {
    this.begin(m, ACT.GOTO, timeout);
    m.actX = x;
    m.actZ = z;
    m.actReach = reach;
    this.k.core.steering.goTo(m.p, m.b, x, z, speed, run);
  }

  /** S'approche de (x, z) à `reach`, puis lance l'interaction `verb` sur la cible. */
  verb(m: RadMember, verb: InteractVerb, targetId: EntityId, x: number, z: number, reach: number, faceX = NaN, faceZ = NaN, timeout = 45): void {
    this.begin(m, ACT.VERB, timeout);
    m.actVerb = verb;
    m.actId = targetId;
    m.actX = x;
    m.actZ = z;
    m.actReach = reach;
    m.actFX = faceX;
    m.actFZ = faceZ;
    this.k.core.steering.goTo(m.p, m.b, x, z, R.SPEED_ADVANCE, true);
  }

  /** Lance l'objet `item` vers un point (ou une personne), pas avant `notBefore` ; `count` coups pour un mortier. */
  throwAt(m: RadMember, item: ItemId, x: number, y: number, z: number, targetId: EntityId, notBefore: number, count = 1): void {
    this.begin(m, ACT.THROW, Math.max(8, notBefore - this.k.now + 7 + count * 2));
    m.actItem = item;
    m.actX = x;
    m.actY = y;
    m.actZ = z;
    m.actId = targetId;
    m.actNotBefore = notBefore;
    m.actCount = count;
  }

  /** Frappe `count` fois vers (x, z) avec `item` ('' : à mains nues, en repoussant la personne visée). */
  strike(m: RadMember, item: ItemId | '', x: number, z: number, targetId: EntityId, count: number, reach: number, timeout = 30): void {
    this.begin(m, ACT.STRIKE, timeout);
    m.actItem = item;
    m.actX = x;
    m.actZ = z;
    m.actId = targetId;
    m.actCount = count;
    m.actReach = reach;
    this.k.core.steering.goTo(m.p, m.b, x, z, R.SPEED_RUN, true);
  }

  /** Éloigne un palet d'un coup de pied vers (towardX, towardZ). */
  kick(m: RadMember, projectileId: EntityId, towardX: number, towardZ: number): void {
    this.begin(m, ACT.KICK, 9);
    m.actId = projectileId;
    m.actFX = towardX;
    m.actFZ = towardZ;
    m.actReach = 1.25;
  }

  /** Renvoie un palet d'un revers de raquette vers (towardX, towardZ). */
  racket(m: RadMember, projectileId: EntityId, towardX: number, towardZ: number): void {
    this.begin(m, ACT.RACKET, 9);
    m.actId = projectileId;
    m.actItem = 'raquette';
    m.actFX = towardX;
    m.actFZ = towardZ;
    m.actReach = 1.2;
  }

  wait(m: RadMember, seconds: number, crouch: boolean): void {
    this.begin(m, ACT.WAIT, seconds + 1);
    m.actNotBefore = this.k.now + seconds;
    m.actCount = crouch ? 1 : 0;
  }

  // ───────────────────────────── pas de simulation ─────────────────────────────

  update(): void {
    const acting = this.k.acting;
    for (let i = acting.length - 1; i >= 0; i--) {
      const m = acting[i]!;
      this.step(m);
    }
  }

  /** Arrête la personne sur place et la tourne vers un point. Retourne l'écart d'orientation restant (rad). */
  private halt(m: RadMember, fx: number, fz: number): number {
    const p = m.p;
    const b = m.b;
    b.tx = p.x;
    b.tz = p.z;
    b.path = null;
    b.run = false;
    const cmd = p.cmd;
    cmd.moveX = 0;
    cmd.moveZ = 0;
    cmd.gait = 0;
    cmd.faceMove = false;
    const dx = fx - p.x;
    const dz = fz - p.z;
    if (dx * dx + dz * dz < 0.01) return 0;
    const yaw = Math.atan2(dx, dz);
    cmd.aimYaw = yaw;
    b.lookX = fx;
    b.lookZ = fz;
    return Math.abs(angleDiff(p.aimYaw, yaw));
  }

  /** Approche : true une fois à portée. Relance un itinéraire si l'on piétine ; échec après plusieurs blocages. */
  private approach(m: RadMember, x: number, z: number, reach: number, speed: number): boolean {
    const k = this.k;
    const p = m.p;
    const dx = x - p.x;
    const dz = z - p.z;
    if (dx * dx + dz * dz <= reach * reach) return true;
    const b = m.b;
    if (k.now < m.dodgeUntil) return false;
    if ((b.tx - x) * (b.tx - x) + (b.tz - z) * (b.tz - z) > 0.6) k.core.steering.goTo(p, b, x, z, speed, speed > 1.6);
    if (k.now - m.stT > 2) {
      const moved = (p.x - m.stX) * (p.x - m.stX) + (p.z - m.stZ) * (p.z - m.stZ);
      m.stX = p.x;
      m.stZ = p.z;
      m.stT = k.now;
      if (moved < 0.5) {
        m.stN++;
        if (m.stN >= 4) {
          this.finish(m, RES.FAILED);
          return false;
        }
        // on bute : un pas de côté d'abord, puis un itinéraire par les rues
        if (m.stN <= 2) dodge(k, m, x, z);
        else {
          b.path = null;
          k.core.nav.request(b);
        }
      } else m.stN = 0;
    }
    return false;
  }

  private step(m: RadMember): void {
    const k = this.k;
    const p = m.p;
    const now = k.now;
    if (!m.held || !isAble(m) || p.stun > 1.5 || p.isPlayer) {
      this.cancel(m);
      return;
    }
    if (now > m.actUntil) {
      this.cancel(m);
      return;
    }
    const ctx = k.ctx;
    switch (m.act) {
      case ACT.GOTO:
        if (this.approach(m, m.actX, m.actZ, m.actReach, m.b.speed)) this.finish(m, RES.DONE);
        break;

      case ACT.VERB: {
        if (m.actStage === 0) {
          if (!this.approach(m, m.actX, m.actZ, m.actReach, R.SPEED_ADVANCE)) break;
          m.actStage = 1;
          m.actSince = now;
          m.actCount = 0;
        }
        if (m.act !== ACT.VERB) break;
        const fx = m.actFX === m.actFX ? m.actFX : m.actX;
        const fz = m.actFZ === m.actFZ ? m.actFZ : m.actZ;
        const off = this.halt(m, fx, fz);
        if (m.actStage === 1) {
          if (now - m.actSince < 0.15 || (off > 0.3 && now - m.actSince < 0.9)) break;
          if (p.vx * p.vx + p.vz * p.vz > 0.2 && now - m.actSince < 1.2) break;
          if (ctx.interactions.startVerb(p, m.actVerb as InteractVerb, m.actId)) {
            m.actStage = 2;
            m.actSince = now;
            // interaction immédiate : déjà terminée
            if (ctx.interactions.current(p) === null) this.finish(m, RES.DONE);
          } else {
            m.actCount++;
            m.actSince = now;
            if (m.actCount >= 4) this.finish(m, RES.FAILED);
          }
          break;
        }
        if (ctx.interactions.current(p) === null) this.finish(m, RES.DONE);
        break;
      }

      case ACT.THROW: {
        if (m.actStage === 0) {
          const held = ctx.actions.activeItem(p);
          if (!held || held.id !== m.actItem) {
            if (!ctx.actions.selectById(p, m.actItem as ItemId)) {
              this.finish(m, RES.FAILED);
              break;
            }
          }
          m.actStage = 1;
          m.actSince = now;
        }
        if (m.actStage === 2) {
          // geste de lancer en cours
          this.halt(m, m.actX, m.actZ);
          if (now >= m.actNotBefore) this.finish(m, RES.DONE);
          break;
        }
        // en attente de la salve : on tient sa place, on ne s'immobilise qu'une seconde avant
        if (now < m.actNotBefore - 1.1) break;
        let tx = m.actX;
        let ty = m.actY;
        let tz = m.actZ;
        if (m.actId !== 0) {
          const q = ctx.people.get(m.actId);
          if (q && !q.dormant) {
            tx = q.x + q.vx * 0.8;
            tz = q.z + q.vz * 0.8;
            ty = q.y + q.look.height * 0.55;
            m.actX = tx;
            m.actZ = tz;
            m.actY = ty;
          }
        }
        this.halt(m, tx, tz);
        const sol = k.aim;
        if (!ctx.actions.solveAim(p, tx, ty, tz, sol)) {
          // cible hors de portée : on renonce après deux secondes (la réflexion suivante choisira autre chose)
          if (now - m.actSince > 2.2 && now >= m.actNotBefore) this.finish(m, RES.FAILED);
          break;
        }
        const cmd = p.cmd;
        cmd.aimYaw = sol.yaw;
        cmd.aimPitch = sol.pitch;
        if (now < m.actNotBefore) break;
        if (Math.abs(angleDiff(p.aimYaw, sol.yaw)) > AIM_TOL || Math.abs(p.aimPitch - sol.pitch) > AIM_TOL) break;
        if (!ctx.actions.canUse(p)) break;
        // rien ne doit barrer le départ : un mur à deux pas, ou (tir tendu) la ligne de tir
        const ux = Math.sin(sol.yaw);
        const uz = Math.cos(sol.yaw);
        const direct = m.actItem === 'mortier';
        if (direct ? !ctx.world.lineOfSight(p.x, p.z, tx, tz) : ctx.world.raycast(p.x, p.z, p.x + ux * 3, p.z + uz * 3, k.hit)) {
          this.finish(m, RES.FAILED);
          break;
        }
        const res = ctx.actions.use(p, { power: sol.power, targetId: m.actId });
        if (res.ok) {
          m.thrown++;
          m.acts++;
          m.actCount--;
          if (m.actCount > 0) {
            m.actNotBefore = now + R.MORTAR_INTERVAL;
          } else {
            m.actStage = 2;
            m.actNotBefore = now + 0.5;
          }
        } else if (res.reason !== 'cooldown') this.finish(m, RES.FAILED);
        break;
      }

      case ACT.STRIKE: {
        if (m.actStage === 0) {
          if (m.actItem !== '') {
            const held = ctx.actions.activeItem(p);
            if ((!held || held.id !== m.actItem) && !ctx.actions.selectById(p, m.actItem)) {
              this.finish(m, RES.FAILED);
              break;
            }
          }
          m.actStage = 1;
        }
        // une personne visée bouge : on la suit
        if (m.actId !== 0) {
          const q = ctx.people.get(m.actId);
          if (q && !q.dormant) {
            m.actX = q.x;
            m.actZ = q.z;
          } else if (m.actItem === '') {
            this.finish(m, RES.FAILED);
            break;
          }
        }
        if (!this.approach(m, m.actX, m.actZ, m.actReach, R.SPEED_RUN)) break;
        const off = this.halt(m, m.actX, m.actZ);
        if (off > 0.35) break;
        if (m.actItem === '') {
          // à mains nues : on repousse (l'interaction a son propre délai entre deux poussées)
          if (ctx.interactions.startVerb(p, 'pousser', m.actId)) {
            m.acts++;
            m.actCount--;
          }
        } else {
          if (!ctx.actions.canUse(p)) break;
          const res = ctx.actions.use(p, m.actId !== 0 ? { targetId: m.actId } : undefined);
          if (res.ok) {
            m.acts++;
            m.actCount--;
          } else if (res.reason !== 'cooldown') {
            this.finish(m, RES.FAILED);
            break;
          }
        }
        if (m.actCount <= 0) this.finish(m, RES.DONE);
        break;
      }

      case ACT.KICK:
      case ACT.RACKET: {
        const pr = ctx.projectiles.get(m.actId);
        if (!pr || !pr.pickable) {
          this.finish(m, RES.FAILED);
          break;
        }
        if (m.actStage === 0) {
          if (m.act === ACT.RACKET) {
            const held = ctx.actions.activeItem(p);
            if ((!held || held.id !== 'raquette') && !ctx.actions.selectById(p, 'raquette')) {
              this.finish(m, RES.FAILED);
              break;
            }
          }
          m.actStage = 1;
        }
        if (m.actStage === 1) {
          if (!this.approach(m, pr.x, pr.z, m.actReach, R.SPEED_RUN)) break;
          m.actStage = 2;
          m.actSince = now;
          if (m.act === ACT.KICK) {
            p.upper = 'kick';
            p.upperT = 0;
          }
        }
        if (m.act !== ACT.KICK && m.act !== ACT.RACKET) break;
        const off = this.halt(m, m.actFX, m.actFZ);
        if (m.act === ACT.RACKET) {
          if (off > 0.3 || !ctx.actions.canUse(p)) break;
          const res = ctx.actions.use(p);
          if (res.ok) this.finish(m, RES.DONE);
          else if (res.reason !== 'cooldown') this.finish(m, RES.FAILED);
          break;
        }
        if (now - m.actSince < R.KICK_SECONDS || off > 0.4) break;
        p.upper = 'none';
        const ok = k.items ? k.items.returnProjectile(p, pr.id, R.KICK_POWER) : ctx.interactions.startVerb(p, 'renvoyer', pr.id);
        this.finish(m, ok ? RES.DONE : RES.FAILED);
        break;
      }

      case ACT.WAIT: {
        this.halt(m, m.b.lookX === m.b.lookX ? m.b.lookX : p.x, m.b.lookZ === m.b.lookZ ? m.b.lookZ : p.z);
        p.cmd.crouch = m.actCount === 1;
        if (now >= m.actNotBefore) this.finish(m, RES.DONE);
        break;
      }

      default:
        this.finish(m, RES.FAILED);
        break;
    }
  }
}
