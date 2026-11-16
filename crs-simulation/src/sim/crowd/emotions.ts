/* =====================================================================================
 * FOULE — émotions et identité sociale (modèle ESIM, docs/research/03-dynamique-manifestation.md §5 ;
 * valeurs de la bible F.3 et F.4).
 *
 *   - peur et colère par personne (Person.fear, Person.anger) ; retour au calme laissé au module des
 *     personnes quand il s'en charge, assuré ici sinon ;
 *   - LÉGITIMITÉ perçue de l'action des forces et COHÉSION (« destin commun ») par tronçon de 50 m ;
 *   - stimuli : chaque événement applique dans un rayon les variations de la table F.4, avec deux tarifs
 *     selon que l'acte est « justifié » (une violence était visible à moins de 40 m dans les 60 s) ou non ;
 *   - contagion toutes les 2 s : chacun rapproche sa peur et sa colère de la moyenne de ses voisins (5 m),
 *     d'une fraction 0,10 + 0,30 × cohésion ;
 *   - radicalisation progressive et réversible : pacifique → militant → opportuniste → radical.
 * ===================================================================================== */

import type { Person, ProtestProfile } from '@/core/contracts';
import { brainOf } from './brain';
import type { CrowdBrain } from './brain';
import type { CrowdCore } from './core';
import { SparseGrid } from './grid';
import { Spots } from './sense';
import * as T from './tuning';

export type StimulusKind =
  | 'detonation' | 'gaz' | 'charge' | 'arme' | 'canon_eau' | 'coup' | 'tiers_frappe' | 'interpellation'
  | 'blesse_grave' | 'sommation' | 'annonce' | 'retrait' | 'secours' | 'feu' | 'feu_vehicule' | 'vitrine'
  | 'pillage' | 'barricade' | 'jet';

interface Row { r: number; fear: number; anger: number; legit: number; cohesion: number; tension: number; reason: string }

function row(r: number, fear: number, anger: number, legit: number, cohesion: number, tension: number, reason: string): Row {
  return { r, fear, anger, legit, cohesion, tension, reason };
}

/** Table F.4 : [acte justifié, acte non justifié] (identiques quand la distinction n'a pas de sens). */
const TABLE: Readonly<Record<StimulusKind, readonly [Row, Row]>> = {
  detonation: [row(15, 0.35, 0.05, 0, 0.05, 0.05, 'detonation'), row(15, 0.35, 0.05, 0, 0.05, 0.05, 'detonation')],
  gaz: [row(30, 0.2, 0.05, -0.03, 0.05, 0.04, 'gaz_justifie'), row(30, 0.2, 0.25, -0.15, 0.15, 0.2, 'gaz_non_justifie')],
  charge: [row(40, 0.4, 0.05, -0.02, 0.05, 0.05, 'charge_justifiee'), row(40, 0.4, 0.3, -0.2, 0.2, 0.25, 'charge_non_justifiee')],
  arme: [row(30, 0.3, 0.08, -0.04, 0.05, 0.06, 'arme_justifiee'), row(30, 0.3, 0.35, -0.25, 0.2, 0.3, 'arme_non_justifiee')],
  canon_eau: [row(30, 0.15, 0.03, -0.02, 0.03, 0.03, 'canon_eau_justifie'), row(30, 0.15, 0.2, -0.15, 0.1, 0.15, 'canon_eau_non_justifie')],
  coup: [row(25, 0.1, 0.05, -0.02, 0.03, 0.03, 'coup_justifie'), row(25, 0.2, 0.3, -0.25, 0.2, 0.15, 'pacifique_frappe')],
  tiers_frappe: [row(25, 0.1, 0.2, -0.2, 0.1, 0.1, 'tiers_frappe'), row(25, 0.1, 0.2, -0.2, 0.1, 0.1, 'tiers_frappe')],
  interpellation: [row(25, 0.05, 0, 0.05, 0, 0.02, 'interpellation_fondee'), row(25, 0.1, 0.25, -0.2, 0.15, 0.2, 'interpellation_arbitraire')],
  blesse_grave: [row(60, 0.1, 0.1, -0.05, 0.1, 0.08, 'blesse_grave'), row(60, 0.1, 0.3, -0.2, 0.2, 0.15, 'blesse_grave')],
  sommation: [row(60, 0.1, 0, 0.05, 0, -0.03, 'sommation_audible'), row(60, 0.1, 0, 0.05, 0, -0.03, 'sommation_audible')],
  annonce: [row(60, -0.05, -0.05, 0.05, 0, -0.03, 'annonce_claire'), row(60, -0.05, -0.05, 0.05, 0, -0.03, 'annonce_claire')],
  retrait: [row(80, -0.2, -0.1, 0.03, -0.05, -0.1, 'retrait_forces'), row(80, -0.2, -0.1, 0.03, -0.05, -0.1, 'retrait_forces')],
  secours: [row(30, -0.05, -0.05, 0.05, 0, -0.04, 'secours'), row(30, -0.05, -0.05, 0.05, 0, -0.04, 'secours')],
  feu: [row(30, 0.05, 0, 0, 0, 0.04, 'feu_poubelle'), row(30, 0.05, 0, 0, 0, 0.04, 'feu_poubelle')],
  feu_vehicule: [row(50, 0.1, 0, 0, 0, 0.1, 'feu_vehicule'), row(50, 0.1, 0, 0, 0, 0.1, 'feu_vehicule')],
  vitrine: [row(30, 0.03, 0, 0, 0, 0.03, 'vitrine_brisee'), row(30, 0.03, 0, 0, 0, 0.03, 'vitrine_brisee')],
  pillage: [row(30, 0.03, 0, 0, 0, 0.06, 'pillage'), row(30, 0.03, 0, 0, 0, 0.06, 'pillage')],
  barricade: [row(40, 0.02, 0, 0, 0.02, 0.06, 'barricade'), row(40, 0.02, 0, 0, 0.02, 0.06, 'barricade')],
  jet: [row(30, 0.012, 0, 0, 0, 0.006, 'jet_projectile'), row(30, 0.012, 0, 0, 0, 0.006, 'jet_projectile')],
};

const KINDS = Object.keys(TABLE) as StimulusKind[];
const CHAIN: readonly ProtestProfile[] = ['pacifique', 'militant', 'opportuniste', 'radical'];

function isSo(p: Person): boolean {
  return p.profile === 'service_ordre' && p.posture !== 'down';
}

export class Emotions {
  /** Canaux : écart de légitimité, écart de cohésion, instant du dernier emploi de la force. */
  private readonly legit = new SparseGrid(T.LEGIT_CELL, 3, 128);
  /** Canaux : effectif, somme de peur, somme de colère. */
  private readonly near = new SparseGrid(T.CONTAGION_CELL, 3, 1024);
  private legit0 = T.LEGIT_START;
  private readonly recent = new Spots(32);
  private readonly buf: Person[] = [];
  private nextSlow = 0;
  private nextContagion = 0;
  /** Le module des personnes ne gère pas le retour au calme : on s'en charge. */
  ownDecay = true;
  /** Radicalisations depuis le début de la session (dans le sens de l'escalade). */
  radicalized = 0;

  constructor(private readonly core: CrowdCore) {}

  reset(): void {
    this.legit.clear();
    this.near.clear();
    this.recent.clear();
    this.nextSlow = 0;
    this.nextContagion = 0;
    this.radicalized = 0;
    this.legit0 = T.LEGIT_START;
  }

  begin(): void {
    this.legit0 = this.core.volatility > 0.6 ? T.LEGIT_START_VOLATILE : T.LEGIT_START;
    const health = this.core.ctx.service<{ psychDecay?: boolean }>('people.health');
    this.ownDecay = !(health && health.psychDecay === true);
  }

  legitAt(x: number, z: number): number {
    const v = this.legit0 + this.legit.get(x, z, 0, 0);
    return v < 0 ? 0 : v > 1 ? 1 : v;
  }

  cohesionAt(x: number, z: number): number {
    const v = T.COHESION_START + this.legit.get(x, z, 1, 0);
    return v < 0 ? 0 : v > 1 ? 1 : v;
  }

  addLegit(x: number, z: number, d: number): void {
    const s = this.legit.ensureAt(x, z) * 3;
    const data = this.legit.data;
    data[s] = Math.max(-this.legit0, Math.min(1 - this.legit0, data[s]! + d));
    if (d < 0) data[s + 2] = this.core.now;
  }

  addCohesion(x: number, z: number, d: number): void {
    const s = this.legit.ensureAt(x, z) * 3 + 1;
    const data = this.legit.data;
    data[s] = Math.max(-T.COHESION_START, Math.min(1 - T.COHESION_START, data[s]! + d));
  }

  /**
   * Ajoute peur et colère aux personnes de la foule dans un rayon (atténuation linéaire avec la distance,
   * sensibilité selon le profil). Retourne le nombre de personnes touchées.
   */
  stir(x: number, z: number, radius: number, fear: number, anger: number): number {
    const core = this.core;
    const n = core.ctx.people.queryRadius(x, z, radius, this.buf);
    let count = 0;
    const now = core.now;
    for (let i = 0; i < n; i++) {
      const p = this.buf[i]!;
      const b = brainOf(p);
      if (!b || b.index < 0) continue;
      const d = Math.hypot(p.x - x, p.z - z);
      const k = 1 - 0.6 * (d / radius);
      const tune = (b.flags & 1) !== 0 ? T.PROFILE.badaud : T.PROFILE[p.profile ?? 'pacifique'];
      if (fear !== 0) {
        const f = p.fear + fear * k * (fear > 0 ? tune.fearK * (1.15 - 0.3 * b.courage) : 1);
        p.fear = f < 0 ? 0 : f > 1 ? 1 : f;
      }
      if (anger !== 0) {
        const a = p.anger + anger * k * (anger > 0 ? tune.angerK : 1);
        p.anger = a < 0 ? 0 : a > 1 ? 1 : a;
      }
      // un stimulus fort fait réagir sans attendre le prochain tour de réflexion
      if (fear > 0.08 || anger > 0.15) {
        const soon = now + 0.05 + 0.5 * ((b.phase * 0.159) % 1);
        if (b.nextThink > soon) b.nextThink = soon;
      }
      count++;
    }
    return count;
  }

  /**
   * Applique un stimulus de la table F.4. `justified` : l'acte répond à une violence visible ; `scale` :
   * multiplicateur (avertissement préalable : × 0,5). Les rafales du même type au même endroit sont
   * fusionnées (une application toutes les 2 s par zone de 15 m). Retourne false si fusionné.
   */
  stimulus(kind: StimulusKind, x: number, z: number, justified: boolean, scale = 1): boolean {
    const core = this.core;
    if (!core.active) return false;
    const code = KINDS.indexOf(kind) * 2 + (justified ? 0 : 1);
    const window = kind === 'jet' ? 0.2 : 2;
    const items = this.recent.items;
    for (let i = 0; i < items.length; i++) {
      const s = items[i]!;
      if (s.id === code && core.now - s.t < window && Math.hypot(s.x - x, s.z - z) < 15) return false;
    }
    this.recent.add(x, z, core.now, code);
    const r = TABLE[kind][justified ? 0 : 1];
    this.stir(x, z, r.r, r.fear * scale, r.anger * scale);
    if (r.legit !== 0) this.addLegit(x, z, r.legit * scale);
    if (r.cohesion !== 0) this.addCohesion(x, z, r.cohesion * scale);
    if (r.tension !== 0) core.director.addTension(r.tension * scale, x, z, r.reason);
    return true;
  }

  update(): void {
    const core = this.core;
    const now = core.now;
    if (now >= this.nextSlow) {
      this.nextSlow = now + 1;
      // +0,01 de légitimité par 10 s sans emploi de la force ; −0,01 de cohésion par 10 s
      const g = this.legit;
      const data = g.data;
      const k = (core.director.liaison ? 2 : 1) / core.timeScale;
      for (let i = 0; i < g.count; i++) {
        const o = g.slot(i) * 3;
        if (data[o]! < 0 && now - data[o + 2]! > 10) data[o] = Math.min(0, data[o]! + T.LEGIT_RECOVERY * k);
        if (data[o + 1]! > 0) data[o + 1] = Math.max(0, data[o + 1]! - T.COHESION_DECAY * k);
      }
    }
    if (now >= this.nextContagion) {
      this.nextContagion = now + T.CONTAGION_EVERY;
      this.contagion();
    }
  }

  /** Moyenne spatiale à basse fréquence : cellules de 5 m, la sienne comptant double de ses quatre voisines. */
  private contagion(): void {
    const core = this.core;
    const brains = core.brains;
    const members = core.members;
    const g = this.near;
    g.clear();
    const n = members.length;
    for (let i = 0; i < n; i++) {
      const p = members[i]!;
      if (p.posture === 'down') continue;
      const o = g.ensureAt(p.x, p.z) * 3;
      const d = g.data;
      d[o] = d[o]! + 1;
      d[o + 1] = d[o + 1]! + p.fear;
      d[o + 2] = d[o + 2]! + p.anger;
    }
    const d = g.data;
    for (let i = 0; i < n; i++) {
      const p = members[i]!;
      if (p.posture === 'down' || p.isPlayer) continue;
      const cx = g.cx(p.x);
      const cz = g.cx(p.z);
      let cnt = 0;
      let fear = 0;
      let anger = 0;
      for (let k = 0; k < 5; k++) {
        const s = g.find(cx + (k === 1 ? 1 : k === 2 ? -1 : 0), cz + (k === 3 ? 1 : k === 4 ? -1 : 0));
        if (s < 0) continue;
        const w = k === 0 ? 2 : 1;
        cnt += d[s * 3]! * w;
        fear += d[s * 3 + 1]! * w;
        anger += d[s * 3 + 2]! * w;
      }
      // sans voisin (soi seul dans sa cellule) : rien à partager
      if (cnt <= 2) continue;
      const share = T.CONTAGION_BASE + T.CONTAGION_COHESION * this.cohesionAt(p.x, p.z);
      const tune = (brains[i]!.flags & 1) !== 0 ? T.PROFILE.badaud : T.PROFILE[p.profile ?? 'pacifique'];
      const mf = (fear - p.fear * 2) / (cnt - 2);
      const ma = (anger - p.anger * 2) / (cnt - 2);
      // on s'aligne plus volontiers sur plus inquiet ou plus en colère que soi, selon son caractère
      p.fear += (mf - p.fear) * share * (mf > p.fear ? Math.min(1.2, tune.fearK) : 1);
      p.anger += (ma - p.anger) * share * (ma > p.anger ? Math.min(1.2, tune.angerK) : 1);
    }
  }

  // ───────────────────────────── par personne (réflexion) ─────────────────────────────

  /** Retour au calme (si personne d'autre ne s'en charge), fatigue, apaisement par le service d'ordre. */
  upkeep(p: Person, b: CrowdBrain, dt: number, moving: boolean): void {
    const core = this.core;
    if (this.ownDecay) {
      if (p.fear > 0) {
        const half = p.profile === 'radical' ? T.FEAR_HALF_RADICAL : p.profile === 'famille' ? T.FEAR_HALF_FAMILY : T.FEAR_HALF;
        p.fear *= Math.pow(0.5, dt / half);
        if (p.fear < 0.002) p.fear = 0;
      }
      if (p.anger > 0) {
        p.anger *= Math.pow(0.5, dt / T.ANGER_HALF);
        if (p.anger < 0.002) p.anger = 0;
      }
    }
    if (p.anger >= 0.3) b.calmSince = core.now;
    const tune = T.PROFILE[p.profile ?? 'pacifique'];
    if (moving) b.fatigue = Math.min(1, b.fatigue + (T.FATIGUE_RATE * tune.tire * dt) / core.timeScale);
    else if (p.posture === 'sit') b.fatigue = Math.max(0, b.fatigue - 0.004 * dt);
    // le service d'ordre calme ceux qui l'entourent
    if (p.profile === 'service_ordre' && core.director.present > 0) {
      const n = core.ctx.people.queryRadius(p.x, p.z, T.SO_CALM_RADIUS, this.buf);
      for (let i = 0; i < n; i++) {
        const q = this.buf[i]!;
        if (q === p || q.faction !== 'protest') continue;
        if (q.anger > T.SO_CALM_FLOOR) q.anger = Math.max(T.SO_CALM_FLOOR, q.anger - T.SO_CALM_RATE * dt);
        if (q.fear > 0.1) q.fear = Math.max(0.1, q.fear - T.SO_CALM_RATE * 0.4 * dt);
      }
    }
  }

  /** Tirage de radicalisation (toutes les 10 s par personne) ; retourne true si le profil a changé. */
  radicalize(p: Person, b: CrowdBrain): boolean {
    const core = this.core;
    const now = core.now;
    b.nextRad = now + T.RADICAL_EVERY * (0.8 + 0.4 * core.rngEmo.next());
    const profile = p.profile;
    if (profile === null || (b.flags & 1) !== 0) return false;
    const level = CHAIN.indexOf(profile);
    if (level < 0) return false;
    const origin = b.origin !== null ? CHAIN.indexOf(b.origin) : level;
    // désescalade : la colère est retombée depuis une minute, ou la peur a pris le dessus
    if (origin >= 0 && level > origin && now - b.radAt > 30 * core.timeScale && (now - b.calmSince > 60 * core.timeScale || p.fear > 0.7)) {
      this.setProfile(p, CHAIN[level - 1]!);
      return true;
    }
    if (level >= CHAIN.length - 1) return false;
    const legit = this.legitAt(p.x, p.z);
    let chance = 0;
    if (profile === 'pacifique') {
      if (p.anger > 0.55 && legit < 0.45) chance = T.RAD_PACIFIQUE;
    } else if (profile === 'militant') {
      if (p.anger > 0.72 && legit < 0.32 && (this.cohesionAt(p.x, p.z) > 0.5 || core.sense.recentViolence(p.x, p.z, 20))) chance = T.RAD_MILITANT;
    } else if (profile === 'opportuniste') {
      const impunity = p.offenses.length >= 2 || now - b.radAt > 30 * core.timeScale;
      if (p.anger > 0.85 && legit < 0.25 && impunity) chance = T.RAD_OPPORTUNISTE;
    }
    if (chance <= 0) return false;
    chance *= 0.5 + core.volatility;
    // le service d'ordre retient ses militants
    if (core.ctx.people.countIn(p.x, p.z, 8, isSo) > 0) chance *= 0.3;
    if (core.rngEmo.next() >= chance) return false;
    this.setProfile(p, CHAIN[level + 1]!);
    return true;
  }

  /** Change le profil d'une personne : événement person:radicalized, nouvel équipement. */
  setProfile(p: Person, to: ProtestProfile): void {
    const from = p.profile;
    if (from === to || from === null) return;
    const core = this.core;
    p.profile = to;
    const b = brainOf(p);
    if (b) {
      b.radAt = core.now;
      if (b.controller && b.controller.release) b.controller.release(p, b);
      b.controller = null;
    }
    if (CHAIN.indexOf(to) > CHAIN.indexOf(from)) this.radicalized++;
    core.ctx.events.emit('person:radicalized', { id: p.id, from, to });
    try {
      core.ctx.archetypes.equip(p, to);
    } catch (err) {
      console.error('[crowd] archetypes.equip a échoué', err);
    }
  }
}
