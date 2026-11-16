/* =====================================================================================
 * GROUPES RADICAUX — le BLOC : coordination des groupes d'affinité.
 *
 * Calendrier (bible F.2 et F.4) : le signal tombe entre 20 % et 70 % de la phase « cortège » selon la
 * volatilité ; il est précédé de signes avant-coureurs qui durent assez pour être vus — regroupement en
 * tête de cortège (150 s avant le passage à l'acte en durée standard), visages couverts (115 s), signal
 * de ralliement (75 s), changement de tenue (60 s), parapluies et banderole (35 s), dépavage et mobilier
 * tiré (30 s). Aucune violence avant le terme. Si la chaleur retombe, les signes cessent et rien ne se passe.
 *
 * Phases : dormant → signes → formation → action (30 à 90 s, davantage quand tout s'embrase) → repli
 * (recul groupé, dispersion en petits groupes par les rues adjacentes puis regroupement plus loin, ou
 * nouveau changement de tenue et fusion dans la foule) → manifestation sauvage, ou nouveau cycle.
 * Pendant l'action, chaque groupe décide pour lui (tactics.ts) ; le bloc donne le point et le rang de
 * chacun, l'horloge commune des salves, les points de dispersion, et l'ordre de repli général.
 * ===================================================================================== */

import { BLOC_EVENT } from './api';
import type { BlocEvent, BlocPhase } from './api';
import { plainClothes } from './attire';
import { thinkGroup } from './groupthink';
import { isPoliceUp } from './kernel';
import type { RadKernel } from './kernel';
import { recenter, stepGroup } from './march';
import { BLOC, PLAN, isAble } from './model';
import type { BlocState } from './model';
import { placeInterest } from './targets';
import * as R from './tuning';

export const BLOC_NAMES: readonly BlocPhase[] = ['dormant', 'signes', 'formation', 'action', 'repli', 'sauvage', 'fondu'];

export class Bloc implements BlocState {
  phase: number = BLOC.DORMANT;
  phaseSince = 0;
  x = 0;
  z = 0;
  hx = 0;
  hz = 1;
  actAt = Infinity;
  lead = 1;
  signalAt = -1;
  volleyAt = -1;
  readonly exits: number[] = [];
  rallyX = 0;
  rallyZ = 0;
  /** Fin de la fenêtre d'action, fin du repos. */
  actionUntil = 0;
  /** Durée de la fenêtre d'action, comptée à partir du premier acte violent du cycle. */
  private window = 0;
  private struck = false;
  restUntil = 0;
  cycles = 0;
  /** Ordre de repli général (mission, essais). */
  ordered = false;
  private coolSince = -1;
  private idleSince = -1;
  private nextTick = 0;
  private readonly event: BlocEvent = { phase: 'dormant', previous: 'dormant', x: 0, z: 0, strength: 0 };
  private readonly rand = (): number => this.k.rng.next();

  constructor(private readonly k: RadKernel) {}

  reset(): void {
    this.phase = BLOC.DORMANT;
    this.phaseSince = 0;
    this.actAt = Infinity;
    this.lead = 1;
    this.signalAt = -1;
    this.volleyAt = -1;
    this.exits.length = 0;
    this.actionUntil = 0;
    this.restUntil = 0;
    this.cycles = 0;
    this.ordered = false;
    this.coolSince = -1;
    this.idleSince = -1;
    this.nextTick = 0;
  }

  /** Début de session : heure prévue du passage à l'acte. */
  start(): void {
    const k = this.k;
    const core = k.core;
    this.x = core.rallyX;
    this.z = core.rallyZ;
    this.rallyX = this.x;
    this.rallyZ = this.z;
    const sch = core.schedule;
    const extra = core.extra;
    const leadWish = Number(extra['radical.lead']);
    this.lead = Number.isFinite(leadWish) && leadWish > 0 ? Math.min(3, Math.max(0.3, leadWish)) : 1;
    const wish = Number(extra['radical.actAt']);
    if (Number.isFinite(wish) && extra['radical.actAt'] !== undefined) {
      this.actAt = k.t0 + Math.max(0, wish);
      return;
    }
    // le signal tombe entre 20 % et 70 % de la phase « cortège » ; le passage à l'acte le suit
    const share = R.SIGNAL_SHARE_CALM - R.SIGNAL_SHARE_SPAN * Math.min(1, core.volatility);
    const signal = k.t0 + sch.gather + sch.depart + share * sch.march;
    const act = signal + R.LEAD_SIGNAL * k.timeK * this.lead;
    this.actAt = Math.max(act, k.t0 + R.LEAD_GATHER * k.timeK * this.lead + 5);
  }

  /** Avance ou retarde le passage à l'acte ; les signes avant-coureurs le précèdent toujours. */
  schedule(at: number): void {
    const k = this.k;
    const min = this.phase === BLOC.DORMANT ? k.now + R.LEAD_GATHER * k.timeK * this.lead * 0.4 : k.now + 5;
    this.actAt = Math.max(at, min);
    if (this.phase === BLOC.MELTED) {
      this.setPhase(BLOC.DORMANT);
      this.restUntil = 0;
    }
  }

  private setPhase(phase: number): void {
    if (this.phase === phase) return;
    const k = this.k;
    const e = this.event;
    e.previous = BLOC_NAMES[this.phase]!;
    e.phase = BLOC_NAMES[phase]!;
    e.x = this.x;
    e.z = this.z;
    e.strength = k.strength();
    this.phase = phase;
    this.phaseSince = k.now;
    this.coolSince = -1;
    k.ctx.events.emitAny(BLOC_EVENT, e);
  }

  private all(plan: number, seconds = Infinity): void {
    const groups = this.k.groups;
    for (let i = 0; i < groups.length; i++) this.k.setPlan(groups[i]!, plan, seconds);
  }

  // ───────────────────────────── pas de simulation ─────────────────────────────

  update(dt: number): void {
    const k = this.k;
    const before = k.groups.length;
    k.organise();
    const groups = k.groups;
    // un groupe fondé en cours de route prend le train en marche
    for (let i = before; i < groups.length; i++) {
      const g = groups[i]!;
      if (this.phase === BLOC.SIGNS || this.phase === BLOC.ACTION || this.phase === BLOC.WILD) {
        recenter(g);
        k.setPlan(g, PLAN.RALLY);
        if (this.phase !== BLOC.SIGNS) for (const m of g.members) m.maskAt = k.now + 2 + 6 * k.rng.next();
      } else if (this.phase === BLOC.FORMING) {
        recenter(g);
        for (const m of g.members) m.maskAt = k.now + 2 + 6 * k.rng.next();
        k.setPlan(g, PLAN.PREPARE);
      }
    }
    if (k.now >= this.nextTick) {
      this.nextTick = k.now + 0.5;
      this.tick();
    }
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i]!;
      if (g.plan === PLAN.FOLLOW) continue;
      if (k.now >= g.nextThink) {
        g.nextThink = k.now + R.GROUP_THINK * (0.9 + 0.2 * k.rng.next());
        thinkGroup(this.k, this, g);
      }
      stepGroup(k, g, dt);
    }
  }

  /** Point du bloc : devant la tête du cortège tant qu'il marche, sinon là où sont les groupes. */
  private locate(): void {
    const k = this.k;
    const core = k.core;
    const base = core.director.base;
    if (this.phase === BLOC.WILD || (this.phase === BLOC.RETREAT && this.exits.length > 0)) {
      this.x = this.rallyX;
      this.z = this.rallyZ;
    } else if (this.phase === BLOC.ACTION) {
      // le bloc s'est arrêté pour agir : son point ne bouge plus (et le cortège reste derrière lui)
    } else if (base === 'rassemblement' || base === 'depart' || base === 'cortege') {
      const f = core.formation;
      const rp = core.rp;
      core.corridor.at(f.headS + R.BLOC_AHEAD, rp);
      // jamais dans un mur : à défaut, la tête elle-même
      let x = rp.x - rp.tz * rp.center;
      let z = rp.z + rp.tx * rp.center;
      if (!k.ctx.world.isFree(x, z, 0.5)) {
        core.corridor.at(f.headS, rp);
        x = rp.x - rp.tz * rp.center;
        z = rp.z + rp.tx * rp.center;
      }
      // le bloc ne va pas se coller aux forces : il s'arrête à distance de lancer
      const near = core.sense.policeNear(x, z, 4);
      if (near < R.SAFE_DIST && Math.hypot(this.x - core.sense.nearX, this.z - core.sense.nearZ) >= near) {
        // on garde le point précédent tant qu'il est plus loin des forces
      } else {
        this.x = x;
        this.z = z;
      }
      this.hx = rp.tx;
      this.hz = rp.tz;
    } else if (k.groups.length > 0 && this.phase !== BLOC.DORMANT && this.phase !== BLOC.MELTED) {
      // après la dispersion : le bloc est là où sont ses groupes
      let sx = 0;
      let sz = 0;
      let n = 0;
      for (const g of k.groups) {
        if (g.plan === PLAN.FOLLOW) continue;
        sx += g.ax;
        sz += g.az;
        n++;
      }
      if (n > 0 && this.phase !== BLOC.ACTION) {
        this.x = sx / n;
        this.z = sz / n;
      }
    } else {
      const d = core.director;
      this.x = d.centerX;
      this.z = d.centerZ;
    }
    k.focusX = this.x;
    k.focusZ = this.z;
  }

  /**
   * Le bloc formé tient la tête : le cortège ne le dépasse pas (c'est lui qui arrête la marche, dossier 03
   * §3.1). Tant que le bloc est devant, la tête du cortège s'arrête à une douzaine de mètres derrière lui.
   */
  private holdCortege(): void {
    if (this.phase < BLOC.FORMING || this.phase > BLOC.ACTION) return;
    const core = this.k.core;
    const f = core.formation;
    if (!f.marching) return;
    const s = core.corridor.project(this.x, this.z, f.headS, 160);
    core.corridor.at(s, core.rp);
    // le bloc a quitté le parcours (rue adjacente) : il ne retient plus personne
    if (Math.hypot(core.rp.x - this.x, core.rp.z - this.z) > 25) return;
    if (f.headS > s - 12) f.halt(1.2, 'bloc');
  }

  private tick(): void {
    const k = this.k;
    const core = k.core;
    const now = k.now;
    const groups = k.groups;
    const base = core.director.base;
    const heat = k.heat;
    this.locate();
    const strength = k.strength();
    if (groups.length === 0) return;
    this.holdCortege();
    // rangs : le groupe de tête est celui qui porte la banderole, puis par identifiant
    for (let i = 0; i < groups.length; i++) groups[i]!.rank = i;
    const K = k.timeK * this.lead;

    if (base === 'terminee' || strength < R.GROUP_FLOOR) {
      // plus assez de monde, ou la manifestation est finie : chacun redevient un manifestant ordinaire
      if (this.phase !== BLOC.DORMANT && this.phase !== BLOC.MELTED) {
        this.all(PLAN.MELT);
        this.setPhase(BLOC.RETREAT);
        this.exits.length = 0;
      }
      if (this.phase === BLOC.RETREAT && this.settled()) this.setPhase(BLOC.MELTED);
      return;
    }

    // la chaleur est retombée : les signes cessent, rien ne se passe
    const cold = heat < R.TIER_SIGNS * 0.7;
    if (cold) {
      if (this.coolSince < 0) this.coolSince = now;
    } else this.coolSince = -1;

    switch (this.phase) {
      case BLOC.DORMANT: {
        const started = base === 'depart' || base === 'cortege' || base === 'dispersion' || base === 'apres_manif'
          || (core.isStatic && now - k.t0 > core.schedule.gather * 0.5);
        if (!started || heat < R.TIER_SIGNS) {
          // tant que rien ne commence, le terme recule : l'avance des signes est toujours respectée
          if (this.actAt - now < R.LEAD_GATHER * K && started) this.actAt = now + R.LEAD_GATHER * K;
          break;
        }
        // tension très forte avant l'heure : on avance le passage à l'acte, sans supprimer les signes
        if (heat >= R.TIER_RIOT && this.actAt - now > R.LEAD_RUSHED * K) this.actAt = now + R.LEAD_RUSHED * K;
        if (now >= this.actAt - R.LEAD_GATHER * K) this.beginSigns();
        break;
      }

      case BLOC.SIGNS: {
        if (cold && now - this.coolSince > 40) {
          this.standDown();
          break;
        }
        if (heat < R.TIER_BLOC) {
          // agitation seulement : on reste au stade des capuches et des tags ; le terme glisse
          if (this.actAt - now < R.LEAD_SIGNAL * K) this.actAt = now + R.LEAD_SIGNAL * K;
          break;
        }
        if (now >= this.actAt - R.LEAD_SIGNAL * K) {
          // le signal : tout le bloc se prépare (le temps de se changer est toujours laissé)
          this.actAt = Math.max(this.actAt, now + R.LEAD_CHANGE * K * 0.75);
          this.signalAt = -1;
          this.all(PLAN.PREPARE);
          this.setPhase(BLOC.FORMING);
          core.director.addTension(R.SIGNAL_TENSION, this.x, this.z, 'signal_bloc');
          core.emotions.addCohesion(this.x, this.z, R.SIGNAL_COHESION);
        }
        break;
      }

      case BLOC.FORMING: {
        if (cold && now - this.coolSince > 40) {
          this.beginRetreat('calme');
          break;
        }
        if (now >= this.actAt && heat >= R.TIER_BLOC) this.beginAction(BLOC.ACTION);
        break;
      }

      case BLOC.ACTION:
      case BLOC.WILD: {
        let broken = 0;
        for (const g of groups) if (g.broken) broken++;
        if (!this.struck && k.lastViolenceAt >= this.phaseSince) {
          this.struck = true;
          this.actionUntil = k.lastViolenceAt + this.window;
        }
        if (this.ordered || now >= this.actionUntil || broken * 2 >= groups.length || heat < R.TIER_SIGNS) {
          this.beginRetreat(this.ordered ? 'ordre' : broken * 2 >= groups.length ? 'pertes' : 'fin');
        } else if (this.phase === BLOC.WILD) this.roam();
        break;
      }

      case BLOC.RETREAT: {
        if (!this.settled()) break;
        // regroupés plus loin : manifestation sauvage si la rue est encore chaude, sinon on se fond
        let regrouped = false;
        for (const g of groups) if (g.plan === PLAN.REGROUP) regrouped = true;
        if (regrouped) {
          if (heat >= R.TIER_CLASH && strength >= R.GROUP_MIN && !this.ordered) {
            for (const g of groups) g.broken = false;
            this.beginAction(BLOC.WILD);
          } else {
            this.all(PLAN.MELT);
          }
          break;
        }
        this.setPhase(BLOC.MELTED);
        this.cycles++;
        this.restUntil = now + k.rng.range(R.REST_MIN, R.REST_MAX) * k.timeK * (1.4 - heat);
        this.ordered = false;
        break;
      }

      case BLOC.MELTED: {
        // nouveau cycle si la chaleur est toujours là : il faudra de nouveau se regrouper et se changer
        if (now >= this.restUntil && heat >= R.TIER_BLOC && (base === 'cortege' || base === 'dispersion' || base === 'apres_manif' || core.isStatic)) {
          this.lead = Math.max(0.5, this.lead * 0.7);
          this.actAt = now + R.LEAD_GATHER * k.timeK * this.lead;
          for (const g of groups) {
            g.broken = false;
            g.morale = Math.max(g.morale, R.MORALE_START - 0.1);
            g.lost = 0;
            g.size0 = g.members.length;
            g.done.length = 0;
          }
          this.setPhase(BLOC.DORMANT);
        }
        break;
      }

      default:
        break;
    }
  }

  /**
   * Manifestation sauvage : quand plus aucun groupe n'a rien à faire là où il est, le bloc se déplace
   * d'une centaine de mètres vers l'endroit le plus prometteur (boutiques, mobilier), loin des forces.
   */
  private roam(): void {
    const k = this.k;
    const now = k.now;
    let idle = true;
    for (const g of k.groups) if (g.plan !== PLAN.RALLY && g.plan !== PLAN.FOLLOW) idle = false;
    if (!idle) {
      this.idleSince = -1;
      return;
    }
    if (this.idleSince < 0) this.idleSince = now;
    if (now - this.idleSince < R.ROAM_AFTER * k.timeK) return;
    this.idleSince = now;
    const world = k.ctx.world;
    let best = placeInterest(k, this.rallyX, this.rallyZ) + 0.5;
    let bx = this.rallyX;
    let bz = this.rallyZ;
    const a0 = k.rng.next() * 6.283;
    for (let c = 0; c < 8; c++) {
      const ang = a0 + (c / 8) * 6.283;
      const tx = this.rallyX + Math.sin(ang) * R.ROAM_DIST;
      const tz = this.rallyZ + Math.cos(ang) * R.ROAM_DIST;
      if (!world.randomFreePoint(tx, tz, 25, 'road', this.rand, k.v2)) continue;
      const x = k.v2.x;
      const z = k.v2.z;
      if (k.ctx.people.countIn(x, z, 50, isPoliceUp) > 0) continue;
      if (!world.findPath(this.rallyX, this.rallyZ, x, z, 'foot', k.path)) continue;
      const score = placeInterest(k, x, z);
      if (score > best) {
        best = score;
        bx = x;
        bz = z;
      }
    }
    if (bx !== this.rallyX || bz !== this.rallyZ) {
      this.rallyX = bx;
      this.rallyZ = bz;
      for (const g of k.groups) if (g.plan === PLAN.RALLY) g.reviewAt = now + 6;
    }
  }

  /** Tous les groupes ont-ils fini leur mouvement de repli ? (fait aussi passer chacun de la dispersion au regroupement) */
  private settled(): boolean {
    const k = this.k;
    const groups = k.groups;
    let done = true;
    for (const g of groups) {
      switch (g.plan) {
        case PLAN.FOLLOW:
          break;
        case PLAN.SCATTER: {
          // arrivés à leur rue adjacente (ou délai passé) : on se regroupe plus loin
          let arrived = 0;
          let able = 0;
          const n = Math.max(1, this.exits.length >> 1);
          for (const m of g.members) {
            if (!isAble(m)) continue;
            able++;
            const e = (m.team % n) * 2;
            if (Math.hypot(m.p.x - this.exits[e]!, m.p.z - this.exits[e + 1]!) < 10) arrived++;
          }
          if (arrived >= able * 0.6 || k.now - g.planSince > R.SCATTER_SECONDS) k.setPlan(g, PLAN.REGROUP);
          done = false;
          break;
        }
        case PLAN.RALLY:
          k.setPlan(g, PLAN.MELT);
          done = false;
          break;
        case PLAN.REGROUP:
          if ((g.cohesion < 0.6 || !g.arrived) && k.now - g.planSince < R.REGROUP_SECONDS) done = false;
          break;
        default:
          done = false;
          break;
      }
    }
    return done;
  }

  private beginSigns(): void {
    const k = this.k;
    const K = k.timeK * this.lead;
    this.setPhase(BLOC.SIGNS);
    // chacun relève sa capuche à son heure, sur une demi-minute
    const from = this.actAt - R.LEAD_MASKS * K;
    for (const g of k.groups) {
      for (const m of g.members) m.maskAt = Math.max(k.now + 3, from) + k.rng.next() * 28 * K;
      recenter(g);
      k.setPlan(g, PLAN.RALLY);
    }
    // quoi qu'il arrive, les signes durent : jamais de passage à l'acte dans la foulée
    this.actAt = Math.max(this.actAt, k.now + R.LEAD_RUSHED * K);
  }

  /** La chaleur est retombée avant le signal : chacun reprend sa place dans le cortège. */
  private standDown(): void {
    const k = this.k;
    for (const g of k.groups) {
      for (const m of g.members) if (m.masked && !m.black) plainClothes(k, m);
      k.setPlan(g, PLAN.FOLLOW);
    }
    this.actAt = k.now + R.LEAD_GATHER * k.timeK * this.lead + 60 * k.timeK;
    this.setPhase(BLOC.DORMANT);
  }

  private beginAction(phase: number): void {
    const k = this.k;
    const heat = k.heat;
    const t = Math.min(1, Math.max(0, (heat - R.TIER_BLOC) / (R.TIER_EMEUTE - R.TIER_BLOC)));
    let window = (R.ACTION_MIN + (R.ACTION_MAX - R.ACTION_MIN) * t) * (0.85 + 0.3 * k.rng.next());
    // quand tout s'embrase, on reste
    if (heat >= R.TIER_EMEUTE) window *= 2.2;
    else if (heat >= R.TIER_RIOT) window *= 1.5;
    // le noyau agit 30 à 90 s : le compte part du premier acte ; s'il ne vient pas (rien à lancer, rien à
    // casser), on ne s'éternise pas
    this.window = window;
    this.struck = false;
    this.actionUntil = k.now + window + 80 * k.timeK;
    this.ordered = false;
    this.setPhase(phase);
    for (const g of k.groups) {
      if (g.plan === PLAN.FOLLOW) continue;
      k.setPlan(g, PLAN.RALLY);
      g.reviewAt = k.now;
      g.nextThink = k.now + 0.1 * g.rank;
    }
  }

  /**
   * Repli général. Dispersion en petits groupes par les rues adjacentes quand il y en a et que la rue
   * reste chaude (on se regroupera plus loin) ; sinon on se change et on se fond dans le cortège.
   */
  private beginRetreat(why: string): void {
    const k = this.k;
    const core = k.core;
    const base = core.director.base;
    this.exits.length = 0;
    const wild = (k.heat >= R.TIER_RIOT || base === 'dispersion' || base === 'apres_manif') && why !== 'calme' && k.strength() >= R.GROUP_MIN;
    const cover = core.sense.coverAt(this.x, this.z, 40);
    if ((wild || cover < R.MELT_COVER) && this.findExits()) {
      k.stats.scatters++;
      this.all(PLAN.SCATTER, R.SCATTER_SECONDS);
    } else {
      this.all(PLAN.MELT);
    }
    for (const g of k.groups) g.why = why;
    this.setPhase(BLOC.RETREAT);
  }

  /**
   * Points de dispersion : des rues adjacentes, hors du parcours déclaré, à l'opposé des forces, que l'on
   * peut gagner à pied. Le plus sûr devient le point de regroupement. false si aucune ne convient.
   */
  private findExits(): boolean {
    const k = this.k;
    const ctx = k.ctx;
    const core = k.core;
    const world = ctx.world;
    const exits = this.exits;
    exits.length = 0;
    const sense = core.sense;
    const pd = sense.policeNear(this.x, this.z, 6);
    const px = sense.nearX;
    const pz = sense.nearZ;
    const routed = core.route.points.length >= 4;
    let best = -Infinity;
    // premier passage : des rues adjacentes, hors du parcours (c'est l'axe que les forces vont remonter) ;
    // second passage, si le quartier n'en offre pas : n'importe quel point loin des forces
    for (let pass = 0; pass < 2 && exits.length < 4; pass++) {
      exits.length = 0;
      best = -Infinity;
      const a0 = k.rng.next() * 6.283;
      for (let c = 0; c < 12 && exits.length < 8; c++) {
        const ang = a0 + (c / 12) * 6.283;
        const r = R.RALLY_MIN + (R.RALLY_MAX - R.RALLY_MIN) * k.rng.next();
        const tx = this.x + Math.sin(ang) * r;
        const tz = this.z + Math.cos(ang) * r;
        if (!world.randomFreePoint(tx, tz, 28, 'road', this.rand, k.v2)) continue;
        const x = k.v2.x;
        const z = k.v2.z;
        const d = Math.hypot(x - this.x, z - this.z);
        if (d < R.RALLY_MIN * 0.6) continue;
        // à l'opposé des forces, et loin d'elles
        if (pd < Infinity) {
          const dot = ((x - this.x) * (px - this.x) + (z - this.z) * (pz - this.z)) / (d * Math.max(1, pd));
          if (dot > 0.35) continue;
        }
        if (ctx.people.countIn(x, z, 45, isPoliceUp) > 0) continue;
        if (pass === 0 && routed) {
          const s = core.corridor.project(x, z, core.formation.headS, 400);
          core.corridor.at(s, core.rp);
          if (Math.hypot(core.rp.x - x, core.rp.z - z) < R.OFF_ROUTE) continue;
        }
        if (!world.findPath(this.x, this.z, x, z, 'foot', k.path)) continue;
        let len = 0;
        const path = k.path;
        for (let i = 2; i < path.length; i += 2) len += Math.hypot(path[i]! - path[i - 2]!, path[i + 1]! - path[i - 1]!);
        if (len > d * 2.4 + 50) continue;
        exits.push(x, z);
        // regroupement : le point le plus éloigné des forces
        const score = pd < Infinity ? Math.hypot(x - px, z - pz) : d;
        if (score > best) {
          best = score;
          this.rallyX = x;
          this.rallyZ = z;
        }
      }
    }
    return exits.length >= 2;
  }
}
