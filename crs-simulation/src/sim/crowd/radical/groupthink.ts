/* =====================================================================================
 * GROUPES RADICAUX — la réflexion d'un groupe d'affinité (une fois par seconde, en décalé).
 *
 * Dans l'ordre : tenue de l'effectif (pertes, retours, meneur, cohésion, moral), appréciation de la
 * situation, dissolution d'un groupe trop réduit, réflexes de rupture (charge, gaz, engin lanceur d'eau),
 * choix tactique quand le plan en cours peut être remplacé, exécution du plan, signes observables.
 * ===================================================================================== */

import { assess } from './assess';
import type { RadKernel } from './kernel';
import { BLOC, PLAN, TASK, isAble } from './model';
import type { BlocState, RadGroup } from './model';
import { runPlan } from './plans';
import { SIGN } from './signals';
import { choosePlan, mustWithdraw } from './tactics';
import * as R from './tuning';

export function thinkGroup(k: RadKernel, bloc: BlocState, g: RadGroup): void {
  const now = k.now;
  upkeep(k, g);
  const a = assess(k, g);
  if (a.able < R.GROUP_FLOOR && k.groups.length > 1) {
    // plus assez de monde pour agir seuls : les derniers rejoignent un autre groupe
    k.dissolve(g);
    return;
  }
  if (a.able === 0) {
    if (g.plan !== PLAN.FOLLOW) k.setPlan(g, PLAN.FOLLOW);
    return;
  }
  const acting = bloc.phase === BLOC.ACTION || bloc.phase === BLOC.WILD;
  if (bloc.phase === BLOC.FORMING && g.plan === PLAN.RALLY) {
    // revenu d'un recul pendant la préparation : on la reprend où elle en était
    k.setPlan(g, PLAN.PREPARE);
    if (bloc.signalAt >= 0) k.setStage(g, 1);
  }
  const retreating = g.plan === PLAN.FALLBACK || g.plan === PLAN.SCATTER || g.plan === PLAN.REGROUP || g.plan === PLAN.MELT;
  if (!retreating && bloc.phase >= BLOC.FORMING && bloc.phase <= BLOC.WILD) {
    // réflexes : rompre devant une charge, le gaz, l'engin lanceur d'eau, ou quand le groupe n'en peut plus
    const why = mustWithdraw(g);
    if (why !== '') {
      g.why = why;
      if (why === 'pertes' || why === 'moral' || why === 'effectif') g.broken = true;
      if (why === 'gaz') g.morale = Math.max(0, g.morale - 0.04);
      k.setPlan(g, PLAN.FALLBACK);
    }
  }
  if (acting && !g.broken && (g.plan === PLAN.RALLY || (now >= g.reviewAt && interruptible(g)))) {
    const before = g.plan;
    const kind = g.tKind;
    const id = g.tId;
    const tx = g.tx;
    const tz = g.tz;
    const plan = choosePlan(k, g);
    if (plan !== PLAN.FOLLOW && plan !== before) {
      // la cible retenue par la décision survit au changement de plan
      const nk = g.tKind;
      const nid = g.tId;
      const nx = g.tx;
      const nz = g.tz;
      k.setPlan(g, plan, plan === PLAN.RESUPPLY ? R.SUPPLY_SECONDS : Infinity);
      g.tKind = nk;
      g.tId = nid;
      g.tx = nx;
      g.tz = nz;
      if (nid !== 0) k.claim(g, nid);
    } else {
      // même plan (ou rien de mieux) : on garde la cible en cours, on ne papillonne pas
      if (g.tId !== id && g.tId !== 0 && k.claims.get(g.tId) === g.id) k.claims.delete(g.tId);
      g.tKind = kind;
      g.tId = id;
      g.tx = tx;
      g.tz = tz;
      if (id !== 0) k.claim(g, id);
      g.reviewAt = now + 2.5;
    }
  } else if (acting && g.broken && g.plan === PLAN.RALLY) {
    // un groupe qui a rompu ne reprend pas : il se fond dès maintenant
    k.setPlan(g, PLAN.MELT);
  }
  runPlan(k, bloc, g);
  marks(k, bloc, g);
}

/** Un plan en cours peut-il être remplacé par mieux ? (jamais au milieu d'une salve ou d'un portage) */
function interruptible(g: RadGroup): boolean {
  switch (g.plan) {
    case PLAN.VOLLEY:
      return g.stage === 3;
    case PLAN.BARRICADE:
    case PLAN.RESUPPLY:
    case PLAN.RESCUE:
    case PLAN.FALLBACK:
    case PLAN.SCATTER:
    case PLAN.REGROUP:
    case PLAN.MELT:
    case PLAN.PREPARE:
      return false;
    default:
      return true;
  }
}

/** Effectif, pertes, meneur, cohésion, moral. */
function upkeep(k: RadKernel, g: RadGroup): void {
  const now = k.now;
  const ms = g.members;
  let able = 0;
  let close = 0;
  const r2 = R.COHESION_RADIUS * R.COHESION_RADIUS;
  for (let i = ms.length - 1; i >= 0; i--) {
    const m = ms[i]!;
    if (m.b.index < 0 || m.p.profile !== 'radical' || (m.b.flags & 64) !== 0) {
      // parti, ou n'est plus des nôtres
      ms.splice(i, 1);
      if (g.leader === m) g.leader = null;
      m.group = null;
      continue;
    }
    if (!isAble(m)) {
      if (m.lostAt < 0) {
        m.lostAt = now;
        g.lost++;
        g.lastLossAt = now;
        g.morale = Math.max(0, g.morale - (g.leader === m ? 0.2 : 0.11));
      }
      continue;
    }
    if (m.lostAt >= 0) {
      // relevé, ou libéré : de retour
      m.lostAt = -1;
      if (g.lost > 0) g.lost--;
    }
    able++;
    // celui qui est parti faire quelque chose pour le groupe (munitions, mobilier, vitrine) n'est pas un traînard
    if (m.held && m.task !== TASK.SLOT && m.task !== TASK.NONE && m.task !== TASK.RUN) {
      close++;
      continue;
    }
    const dx = m.p.x - g.ax;
    const dz = m.p.z - g.az;
    if (dx * dx + dz * dz <= r2) close++;
  }
  g.cohesion = able > 0 ? close / able : 0;
  if (g.leader === null || !isAble(g.leader)) k.electLeader(g);
  // le moral remonte lentement au calme
  if (now - g.lastLossAt > 20 && g.morale < R.MORALE_START) g.morale = Math.min(R.MORALE_START, g.morale + R.MORALE_RECOVER * R.GROUP_THINK * 5);
  const fs = g.followers;
  for (let i = fs.length - 1; i >= 0; i--) {
    const m = fs[i]!;
    if (m.b.index < 0 || !isAble(m) || m.p.profile !== 'opportuniste') {
      fs.splice(i, 1);
      m.group = null;
    }
  }
  const squad = k.ctx.squads.get(g.squadId);
  if (squad) squad.morale = g.morale;
}

/** Signes observables produits par le groupe en ce moment. */
function marks(k: RadKernel, bloc: BlocState, g: RadGroup): void {
if (bloc.phase < BLOC.SIGNS || bloc.phase > BLOC.ACTION) return;
  const now = k.now;
  let masked = 0;
  let umbrellas = 0;
  let fresh = false;
  for (let i = 0; i < g.members.length; i++) {
    const m = g.members[i]!;
    if (!isAble(m)) continue;
    if (m.masked) {
      masked++;
      if (now - m.maskAt < 30) fresh = true;
    }
    if (m.umbrella || m.banner) umbrellas++;
  }
  // des visages qui se couvrent : visible tant que cela se fait, et jusqu'au passage à l'acte
  if (masked > 0 && (fresh || bloc.phase <= BLOC.FORMING)) k.signals.mark(g, SIGN.MASKS, g.ax, g.az, masked, now);
  if (umbrellas > 0 && bloc.phase <= BLOC.ACTION) k.signals.mark(g, SIGN.UMBRELLAS, g.ax + g.hx * 2, g.az + g.hz * 2, umbrellas, now);
}
