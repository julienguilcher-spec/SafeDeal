/* =====================================================================================
 * Santé — états entretenus à chaque pas : étourdissement, relevé des personnes à terre, puis,
 * par tranches (une personne sur quatre à chaque pas, avec le temps cumulé de quatre pas) :
 * exposition au gaz, feu, humidité, aggravation des blessures graves, retour au calme.
 *
 * Gaz (docs/research/03 §6.3) : person.gas est l'exposition EFFECTIVE (protection déjà déduite).
 * Elle monte dans le nuage (≈ 3 s sans protection, ≈ 8 s avec un foulard, quasi nulle avec un
 * masque), fait tousser et ralentit (locomotion), puis retombe à l'air libre : demi-vie 20 s, et
 * une longue traîne de gêne légère. Une exposition forte de plus de 40 s plie la personne en deux.
 * ===================================================================================== */

import type { Person } from '@/core/contracts';
import type { HealthSystem } from './health';
import { fearSusceptibility } from './health-util';
import type { PersonExtra } from './shared';
import * as T from './tuning';

const AMBIENT_RANGE2 = T.AMBIENT_SFX_RANGE * T.AMBIENT_SFX_RANGE;

/** Relit l'état après un dégât (le compilateur ne voit pas que damageDirect peut tuer). */
function isDead(p: Person): boolean {
  return p.injury === 'dead';
}

export class StatusPass {
  /** Le retour au calme (peur, colère) est géré ici. */
  psychDecay = true;
  private readonly hist = new Float64Array(4);
  // facteurs de décroissance du pas courant (calculés une fois par pas)
  private kGasFast = 1;
  private kGasSlow = 1;
  private kGasRinse = 1;
  private kFear = 1;
  private kFearRadical = 1;
  private kFearFamily = 1;
  private kAnger = 1;
  private rain = 0;

  constructor(private readonly sys: HealthSystem) {}

  reset(): void {
    this.hist.fill(0);
  }

  update(dt: number): void {
    const sys = this.sys;
    const ctx = sys.ctx;
    const list = ctx.people.list;
    const n = list.length;
    if (n === 0) return;
    const tick = ctx.clock.tick;
    const hist = this.hist;
    hist[tick & 3] = dt;
    const hs = hist[0]! + hist[1]! + hist[2]! + hist[3]!;
    this.kGasFast = Math.pow(0.5, hs / T.GAS_HALFLIFE_FAST);
    this.kGasSlow = Math.pow(0.5, hs / T.GAS_HALFLIFE_SLOW);
    this.kGasRinse = Math.pow(0.5, hs / T.GAS_RINSE_HALFLIFE);
    this.kFear = Math.pow(0.5, hs / T.FEAR_HALFLIFE);
    this.kFearRadical = Math.pow(0.5, hs / T.FEAR_HALFLIFE_RADICAL);
    this.kFearFamily = Math.pow(0.5, hs / T.FEAR_HALFLIFE_FAMILY);
    this.kAnger = Math.pow(0.5, hs / T.ANGER_HALFLIFE);
    const rain = ctx.env.state.rain;
    this.rain = rain > 0 ? (rain < 1 ? rain : 1) : 0;

    for (let i = 0; i < n; i++) {
      const p = list[i];
      if (!p || p.dormant) continue;
      if (p.stun > 0) {
        const s = p.stun - dt;
        p.stun = s > 0 ? s : 0;
      }
      if (p.posture === 'down') this.tickDown(p, dt);
      if (((tick + p.id) & 3) === 0) this.slow(p, hs);
    }
  }

  /** Personne à terre : se relève seule à l'échéance si son état le permet et que rien ne la retient. */
  private tickDown(p: Person, dt: number): void {
    const e = this.sys.shared.peek(p.id);
    if (!e || e.downTimer <= 0) return;
    e.downTimer -= dt;
    if (e.downTimer > 0) return;
    e.downTimer = 0;
    if (p.injury === 'dead' || p.health <= T.HEALTH_CRITICAL) return;
    // interpellée : c'est celui qui la tient qui décide de la relever
    if (p.custody !== 'free') return;
    if (p.heldBy !== 0 || p.stun > 0.5 || p.burning > 0.5) {
      e.downTimer = 1; // nouvel essai dans une seconde
      return;
    }
    this.sys.setDown(p, false, 0);
  }

  private slow(p: Person, hs: number): void {
    if (p.injury === 'dead') {
      if (p.burning > 0) p.burning = 0;
      return;
    }
    const sys = this.sys;
    const ctx = sys.ctx;
    const e = sys.shared.of(p);
    const inVehicle = p.vehicleId !== 0;

    // ── gaz lacrymogène ──
    let c = ctx.hazards.gasAt(p.x, p.z);
    if (c > 0 || p.gas > 0) {
      if (!(c > 0)) c = 0;
      else if (c > 1) c = 1;
      if (inVehicle) c *= T.VEHICLE_GAS;
      this.gas(p, e, c, hs);
    }

    // ── feu ──
    const f = inVehicle ? 0 : ctx.hazards.fireAt(p.x, p.z);
    if (f > T.FIRE_IGNITE_MIN || p.burning > 0 || e.wasBurning) this.fire(p, e, f, hs);

    // ── humidité : la pluie mouille, puis on sèche ──
    const rain = this.rain;
    if (rain > 0 && !inVehicle) {
      const cap = 0.3 + 0.7 * rain;
      if (p.wet < cap) {
        const w = p.wet + rain * T.WET_RAIN_RATE * hs;
        p.wet = w < cap ? w : cap;
      }
    } else if (p.wet > 0) {
      const w = p.wet - T.DRY_RATE * hs;
      p.wet = w > 0 ? w : 0;
    }

    // ── blessures graves : aggravation lente sans soins ──
    const inj = p.injury;
    if ((inj === 'serious' || inj === 'critical') && !e.treated) {
      const rate = inj === 'critical' ? T.BLEED_CRITICAL : T.BLEED_SERIOUS;
      sys.damageDirect(p, e, rate * hs, e.lastKind === '' ? 'impact' : e.lastKind, 0, false, e.lastGrave);
      if (isDead(p)) return;
    }

    // ── peur et colère : compression de foule, puis retour au calme ──
    if (e.pressure > T.PRESSURE_REF * 0.5) {
      const fear = p.fear + T.FEAR_PRESSURE * hs * fearSusceptibility(p);
      p.fear = fear < 1 ? fear : 1;
    }
    if (this.psychDecay) {
      if (p.fear > 0) {
        const k = p.profile === 'radical' ? this.kFearRadical : p.profile === 'famille' ? this.kFearFamily : this.kFear;
        const fear = p.fear * k;
        p.fear = fear > 0.002 ? fear : 0;
      }
      if (p.anger > 0) {
        const a = p.anger * this.kAnger;
        p.anger = a > 0.002 ? a : 0;
      }
    }
  }

  private gas(p: Person, e: PersonExtra, c: number, hs: number): void {
    const sys = this.sys;
    const ctx = sys.ctx;
    const prot = p.gasProtection > 0 ? (p.gasProtection < 1 ? p.gasProtection : 1) : 0;
    const eff = c * (1 - prot);
    const cap = eff * T.GAS_CAP < 1 ? eff * T.GAS_CAP : 1;
    let g = p.gas;
    if (!(g >= 0)) g = 0;
    if (g < cap) {
      // montée : d'autant plus lente que la protection est bonne (3 s sans rien, ≈ 8 s avec un foulard)
      g += T.GAS_RISE * eff * (0.3 + 0.7 * eff) * hs;
      if (g > cap) g = cap;
    } else if (g > cap) {
      // récupération à l'air libre (ou dans un nuage plus léger)
      const k = e.rinseT > 0 ? this.kGasRinse : g > T.GAS_TAIL ? this.kGasFast : this.kGasSlow;
      g = cap + (g - cap) * k;
      if (g < 0.004) g = 0;
    }
    p.gas = g;
    if (e.rinseT > 0) e.rinseT -= hs;

    if (g > T.GAS_COUGH) {
      // toux : demandée seulement à portée d'oreille du joueur
      e.coughT -= hs;
      if (e.coughT <= 0) {
        e.coughT = sys.rng.range(T.COUGH_MIN, T.COUGH_MAX);
        const shared = sys.shared;
        let audible = true;
        if (shared.focusOn) {
          const dx = p.x - shared.focusX;
          const dz = p.z - shared.focusZ;
          audible = dx * dx + dz * dz < AMBIENT_RANGE2;
        }
        if (audible) {
          ctx.events.emit('sfx', {
            id: 'toux', x: p.x, y: p.y + 1.5, z: p.z, volume: 0.4 + 0.5 * g, pitch: 0.85 + ((p.id * 53) % 100) / 300,
          });
        }
      }
      const fear = p.fear + T.FEAR_GAS * g * hs * fearSusceptibility(p);
      p.fear = fear < 1 ? fear : 1;
    }

    // exposition forte prolongée : la personne s'arrête, se plie, a besoin d'aide
    if (g > T.GAS_SEVERE) {
      e.gasTime += hs;
      if (e.gasTime > T.GAS_SEVERE_TIME) {
        if (p.stun < 0.8) p.stun = 0.8;
        if (!e.malaise && p.posture !== 'down' && (p.id * 2654435761 >>> 0) % T.ASTHMA_ONE_IN === 0) {
          // malaise d'une personne asthmatique : elle s'effondre et ne se relèvera qu'aidée ou une fois à l'air
          e.malaise = true;
          sys.damageDirect(p, e, 12, 'gas', 0, true, false);
          sys.knockDown(p, 25, 0);
        }
      }
    } else if (e.gasTime > 0) {
      e.gasTime -= hs * 2;
      if (e.gasTime <= 0) {
        e.gasTime = 0;
        e.malaise = false;
      }
    }
  }

  private fire(p: Person, e: PersonExtra, f: number, hs: number): void {
    const sys = this.sys;
    const ctx = sys.ctx;
    const inFire = f > T.FIRE_IGNITE_MIN;
    let b = p.burning;
    if (!(b >= 0)) b = 0;
    if (inFire) {
      // la personne s'enflamme : moins vite avec une tenue ignifugée ou des vêtements trempés
      const armor = p.armorBody > 0 ? (p.armorBody < 1 ? p.armorBody : 1) : 0;
      b += f * T.FIRE_IGNITE_RATE * (1 - armor * 0.6) * (1 - p.wet * 0.8) * hs;
      if (b > 1) b = 1;
    } else if (b > 0) {
      // extinction : le temps, l'eau, la pluie, se rouler au sol
      let rate = T.BURN_DECAY + p.wet * T.BURN_DECAY_WET + this.rain * T.BURN_DECAY_RAIN;
      if (p.posture === 'down' || p.posture === 'prone') rate += T.BURN_DECAY_ROLL;
      b -= rate * hs;
      if (b < 0) b = 0;
    }
    p.burning = b;

    if (b > 0) {
      if (!e.wasBurning && b >= T.BURN_VISIBLE) {
        e.wasBurning = true;
        ctx.events.emit('fire:started', { x: p.x, z: p.z, targetKind: 'person', targetId: p.id, sourceId: 0 });
      }
      const armor = p.armorBody > 0 ? (p.armorBody < 1 ? p.armorBody : 1) : 0;
      const dmg = b * T.BURN_DPS * (1 - armor * 0.4) * hs;
      // person:hurt au plus une fois par seconde environ (cumul d'au moins 4 points)
      e.burnAcc += dmg;
      const emit = e.burnAcc >= 4;
      if (emit) e.burnAcc = 0;
      sys.damageDirect(p, e, dmg, 'burn', 0, emit, true);
      if (isDead(p)) {
        p.burning = 0;
        e.wasBurning = false;
        ctx.events.emit('fire:out', { x: p.x, z: p.z, targetKind: 'person', targetId: p.id, byId: 0 });
        return;
      }
      e.lastKind = 'burn';
      e.lastGrave = true;
      if (dmg > 0.2) e.treated = false;
      const fear = p.fear + T.FEAR_BURNING * hs;
      p.fear = fear < 1 ? fear : 1;
      if (p.wet > 0) {
        const w = p.wet - 0.1 * hs;
        p.wet = w > 0 ? w : 0;
      }
      if (b >= T.BURN_VISIBLE) {
        ctx.events.emit('fx', { id: 'feu', x: p.x, y: p.y + 1, z: p.z, size: 0.4 + 0.5 * b, seconds: hs * 1.5 });
      }
    } else if (e.wasBurning) {
      e.wasBurning = false;
      e.burnAcc = 0;
      ctx.events.emit('fire:out', { x: p.x, z: p.z, targetKind: 'person', targetId: p.id, byId: 0 });
    }
  }
}
