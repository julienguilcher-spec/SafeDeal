/* =====================================================================================
 * DÉCOR DYNAMIQUE — incendie des objets (docs/research/00-bible-realisme.md, table G.4).
 *
 *   - prise de feu : un objet combustible chauffe au contact d'une nappe de feu (ctx.hazards.fireAt,
 *     relevé par le balayage lent), d'un engin incendiaire (dégât 'burn'), des étincelles d'un mortier
 *     ou d'un voisin en flammes ; il s'embrase quand l'exposition atteint sa durée d'allumage
 *     (plastique 5 à 10 s, bois 10 à 20 s, deux-roues 15 à 30 s) ; ignite() l'allume d'office ;
 *   - combustion : montée en puissance, puis déclin sur la fin du combustible ; fumée par
 *     ctx.hazards.emitSmoke (noire et épaisse pour le plastique, grise pour le bois), chaleur par une
 *     nappe entretenue avec ctx.hazards.ignite (c'est elle qui brûle les personnes trop proches) ;
 *   - propagation : un objet à moins de 1,5 m prend en une minute environ (20 s s'il touche), une
 *     façade proche chauffe ; les batteries crépitent, projettent des étincelles et peuvent se rallumer ;
 *   - extinction : l'eau ou la poudre versée par ctx.hazards.douse nous parvient par l'événement
 *     libre 'hazards:douse' (8 s d'extincteur pour un bac ; une batterie ou un kiosque demandent le
 *     canon à eau ou les pompiers) ; si la nappe que nous entretenons a disparu deux contrôles de suite
 *     (fireAt retombé à zéro), l'objet est considéré comme éteint ; sinon le feu dure son combustible ;
 *   - fin : état « brûlé » (carcasse basse qui ne masque plus rien), ou « endommagé » si éteint à temps.
 * Événements : fire:started / fire:out (targetKind 'prop'), prop:damaged, fx 'feu' / 'etincelles' /
 * 'trace_brulure', sfx 'petard'. Infraction 'incendie' pour l'auteur, tension +0,04 (table F.4).
 * ===================================================================================== */

import type { EntityId, Person } from '@/core/contracts';
import { distSqPointObb } from '@/core/math';
import type { Mod } from './mod';
import { ACT_BURNING, ACT_SMOLDER, TENSION } from './shared';
import type { PropObj, ShopObj } from './shared';

/** Échéance périodique d'un feu (s). */
const FIRE_PERIOD = 1;
/** Entretien de la nappe de chaleur toutes les N échéances, propagation toutes les M. */
const FEED_EVERY = 3;
const SPREAD_EVERY = 2;
/** Distance bord à bord jusqu'où le feu gagne un voisin (m). */
const SPREAD_REACH = 1.5;
/** Durée pendant laquelle un objet arrosé ne reprend pas (s). */
const WET_SECONDS = 45;
/** Après un arrosage signalé, durée pendant laquelle la disparition de la nappe ne vaut pas extinction (s). */
const DOUSE_MEMORY = 8;
/** Délai sans apport de chaleur avant qu'un objet ne commence à refroidir (s). */
const HEAT_HOLD = 6;
/** Intensité au départ du feu. */
const START_INTENSITY = 0.15;
/** Batterie : agent nécessaire et reprise du feu (un extincteur à 1 unité/s ne suffit pas). */
const BATTERY_NEED = 24;
const BATTERY_RECOVERY = 1.2;
/** Événement libre émis par le module des dangers à chaque douse(). */
const DOUSE_EVENT = 'hazards:douse';

interface DouseEvent {
  x: number;
  z: number;
  radius: number;
  amount: number;
}

function isForce(p: Person): boolean {
  return p.faction === 'police' || p.faction === 'rescue';
}

export class Fire {
  /** Un événement 'hazards:douse' est arrivé pendant notre propre appel à douse(). */
  private douseSeen = false;
  /** Auteur de l'arrosage en cours (gestionnaire « éteindre »). */
  private douseBy: EntityId = 0;
  private readonly buf: PropObj[] = [];
  private readonly shopBuf: ShopObj[] = [];

  constructor(private readonly m: Mod) {}

  init(): void {
    this.m.k.ctx.events.onAny(DOUSE_EVENT, (payload) => {
      const e = payload as DouseEvent | null;
      if (!e || !(e.amount > 0) || !Number.isFinite(e.x) || !Number.isFinite(e.z)) return;
      this.douseSeen = true;
      this.applyDouse(e.x, e.z, e.radius > 0.5 ? e.radius : 0.5, e.amount);
    });
  }

  // ───────────────────────────── allumage ─────────────────────────────

  canBurn(p: PropObj): boolean {
    return p.slot >= 0 && p.fuel > 0 && p.state !== 'burnt' && (p.act & ACT_BURNING) === 0;
  }

  /** Allume l'objet. `spread` : le feu vient d'un voisin (pas d'infraction nouvelle). */
  ignite(p: PropObj, byId: EntityId, spread = false, force = false): boolean {
    if (!this.canBurn(p)) return false;
    const k = this.m.k;
    const now = k.ctx.clock.now;
    if (now < p.wetUntil && !force) return false;
    const store = this.m.store;
    p.preFire = p.state;
    p.state = 'burning';
    if (p.burning < START_INTENSITY) p.burning = START_INTENSITY;
    p.heat = 1;
    p.igniterId = byId;
    p.suppress = 0;
    p.coupled = false;
    p.missed = 0;
    p.fireTicks = 0;
    p.fireNext = now + k.rng.range(0.3, FIRE_PERIOD);
    p.reigniteAt = 0;
    p.dormant = false;
    p.dirty = true;
    store.deactivate(p, ACT_SMOLDER);
    store.activate(p, ACT_BURNING);
    k.stats.firesStarted++;
    const events = k.ctx.events;
    events.emit('fire:started', { x: p.x, z: p.z, targetKind: 'prop', targetId: p.id, sourceId: byId });
    events.emit('prop:damaged', { id: p.id, state: 'burning', byId });
    k.fx('feu', p.x, p.y + 0.3, p.z, p.def.flameRadius);
    const base = p.parts !== null ? TENSION.barricade : TENSION.feuObjet;
    if (spread || !k.offense(byId, 'incendie', p.x, p.z, base, p.parts !== null ? 'barricade en feu' : 'feu de mobilier')) {
      k.tension(spread ? TENSION.feuPropage : base, p.x, p.z, 'feu de mobilier');
    }
    return true;
  }

  /** Ajoute de la chaleur (1 = embrasement). */
  addHeat(p: PropObj, amount: number, byId: EntityId, spread = false): void {
    if (!(amount > 0) || !this.canBurn(p)) return;
    if (this.m.k.ctx.clock.now < p.wetUntil) return;
    p.heat += amount;
    p.heatAt = this.m.k.ctx.clock.now;
    if (byId !== 0) p.heatBy = byId;
    if (p.heat >= 1) this.ignite(p, p.heatBy, spread);
  }

  /** Dégât 'burn' reçu (nappe d'un engin incendiaire…) : il chauffe l'objet. */
  heatFromDamage(p: PropObj, amount: number, byId: EntityId): void {
    this.addHeat(p, amount / (10 + p.def.igniteSeconds * 3), byId);
  }

  /** Exposition aux nappes de feu, relevée par le balayage lent (`elapsed` s depuis le dernier passage). */
  exposure(p: PropObj, elapsed: number): void {
    if (p.fuel <= 0 || p.state === 'burnt' || p.act & ACT_BURNING || p.carriedBy !== 0) return;
    const hazards = this.m.k.ctx.hazards;
    let f = hazards.fireAt(p.x, p.z);
    if (p.parts !== null && p.halfX > 1.5) {
      // barricade : le feu peut la prendre par un bout
      const ax = Math.cos(p.heading) * p.halfX * 0.7;
      const az = -Math.sin(p.heading) * p.halfX * 0.7;
      const f1 = hazards.fireAt(p.x + ax, p.z + az);
      const f2 = hazards.fireAt(p.x - ax, p.z - az);
      if (f1 > f) f = f1;
      if (f2 > f) f = f2;
    }
    if (f > 0.15) this.addHeat(p, (f * elapsed) / p.def.igniteSeconds, 0);
    else if (p.heat > 0 && this.m.k.ctx.clock.now - p.heatAt > HEAT_HOLD) {
      // plus rien ne le chauffe depuis un moment : il refroidit
      p.heat -= elapsed * 0.03;
      if (p.heat < 0) p.heat = 0;
    }
  }

  // ───────────────────────────── extinction ─────────────────────────────

  private needOf(p: PropObj): number {
    if (p.parts !== null) return 6 + 2.5 * p.parts.length;
    const base = p.battery ? BATTERY_NEED : p.def.douseNeed;
    return base * (0.5 + 0.5 * p.burning);
  }

  /** Éteint l'objet avant la fin de son combustible. `doused` : par de l'eau ou de la poudre. */
  extinguish(p: PropObj, byId: EntityId, doused = true): void {
    if (!(p.act & ACT_BURNING)) return;
    const k = this.m.k;
    const now = k.ctx.clock.now;
    const store = this.m.store;
    store.deactivate(p, ACT_BURNING);
    p.burning = 0;
    p.suppress = 0;
    p.heat = 0;
    p.fuel *= 0.6; // le combustible fondu ou détrempé ne reprendra pas entièrement
    p.wetUntil = now + WET_SECONDS;
    p.dirty = true;
    p.state = p.preFire === 'broken' || p.hp <= p.maxHp * 0.12 ? 'broken' : 'damaged';
    if (p.state === 'broken' && !p.def.brokenBlocks && p.parts === null) {
      p.blocksMove = false;
      p.blocksSight = false;
    }
    const events = k.ctx.events;
    events.emit('fire:out', { x: p.x, z: p.z, targetKind: 'prop', targetId: p.id, byId });
    events.emit('prop:damaged', { id: p.id, state: p.state, byId });
    if (doused) k.tension(TENSION.feuEteint, p.x, p.z, 'feu éteint');
    // batterie : reprise de feu possible dans les deux minutes (30 % des cas)
    if (p.battery && p.fuel > 5 && k.rng.chance(0.3)) {
      p.reigniteAt = now + k.rng.range(20, 120);
      store.activate(p, ACT_SMOLDER);
    }
  }

  private burnOut(p: PropObj): void {
    const k = this.m.k;
    const def = p.def;
    this.m.store.deactivate(p, ACT_BURNING);
    p.burning = 0;
    p.fuel = 0;
    p.heat = 0;
    p.suppress = 0;
    p.state = 'burnt';
    p.dirty = true;
    p.height = Math.max(0.1, p.height * def.burntHeight);
    if (!def.burntBlocks) p.blocksMove = false;
    if (!(def.burntBlocks && def.blocksSight && def.burntHeight >= 0.8)) p.blocksSight = false;
    if (p.hp > p.maxHp * 0.15) p.hp = p.maxHp * 0.15;
    const events = k.ctx.events;
    events.emit('fire:out', { x: p.x, z: p.z, targetKind: 'prop', targetId: p.id, byId: 0 });
    events.emit('prop:damaged', { id: p.id, state: 'burnt', byId: p.igniterId });
    k.fx('trace_brulure', p.x, p.y, p.z, Math.max(p.halfX, p.halfZ) * 3);
  }

  /**
   * Arrose un disque pour le compte de `byId` : ctx.hazards.douse (nappes, gaz, fumée), puis nos propres
   * feux — par l'événement 'hazards:douse' si le module des dangers l'émet, directement sinon.
   */
  douse(x: number, z: number, radius: number, amount: number, byId: EntityId): void {
    this.douseBy = byId;
    this.douseSeen = false;
    this.m.k.ctx.hazards.douse(x, z, radius, amount);
    if (!this.douseSeen) this.applyDouse(x, z, radius, amount);
    this.douseBy = 0;
  }

  /** Personne à créditer de l'extinction : celle qui arrose, sinon l'agent ou le secouriste le plus proche. */
  private douser(x: number, z: number): EntityId {
    if (this.douseBy !== 0) return this.douseBy;
    const p = this.m.k.ctx.people.nearest(x, z, 12, isForce);
    return p ? p.id : 0;
  }

  private applyDouse(x: number, z: number, radius: number, amount: number): void {
    const m = this.m;
    const now = m.k.ctx.clock.now;
    const r2 = radius * radius;
    const burning = m.store.burning;
    for (let i = burning.length - 1; i >= 0; i--) {
      const p = burning[i]!;
      if (distSqPointObb(x, z, p.x, p.z, p.halfX, p.halfZ, p.heading) > r2) continue;
      // une barricade plus longue que le jet n'est arrosée qu'en partie
      const cover = p.parts !== null && p.halfX > radius ? radius / p.halfX : 1;
      const dose = amount * cover;
      const need = this.needOf(p);
      p.suppress += dose;
      p.dousedAt = now;
      p.burning *= Math.max(0.4, 1 - dose / need);
      if (p.suppress >= need) this.extinguish(p, this.douser(x, z), true);
    }
    // batteries qui couvent : assez d'eau empêche la reprise
    const smolder = m.store.smolder;
    for (let i = smolder.length - 1; i >= 0; i--) {
      const p = smolder[i]!;
      if (distSqPointObb(x, z, p.x, p.z, p.halfX, p.halfZ, p.heading) > r2) continue;
      p.suppress += amount;
      if (p.suppress >= 8) {
        p.reigniteAt = 0;
        p.suppress = 0;
        m.store.deactivate(p, ACT_SMOLDER);
      }
    }
    // mobilier mouillé alentour : il ne prendra pas tout de suite
    const buf = this.buf;
    const n = m.store.collectAround(x, z, radius, buf);
    const wet = now + Math.min(WET_SECONDS, 10 + amount * 30);
    for (let i = 0; i < n; i++) {
      const p = buf[i]!;
      if (p.fuel <= 0 || p.act & ACT_BURNING) continue;
      if (distSqPointObb(x, z, p.x, p.z, p.halfX, p.halfZ, p.heading) > r2) continue;
      if (wet > p.wetUntil) p.wetUntil = wet;
      p.heat = 0;
    }
    m.shops.applyDouse(x, z, radius, amount, this.douseBy);
  }

  // ───────────────────────────── pas de simulation ─────────────────────────────

  update(dt: number): void {
    const m = this.m;
    const k = m.k;
    const ctx = k.ctx;
    const now = ctx.clock.now;
    const burning = m.store.burning;
    if (burning.length > 0) {
      const rain = ctx.env.state.rain;
      for (let i = burning.length - 1; i >= 0; i--) {
        const p = burning[i]!;
        const def = p.def;
        const frac = p.fuelMax > 0 ? p.fuel / p.fuelMax : 0;
        let target = frac < 0.15 ? 0.25 + (0.75 * frac) / 0.15 : 1;
        if (p.suppress > 0) {
          const need = this.needOf(p);
          target *= 1 - 0.85 * Math.min(1, p.suppress / need);
          // le feu reprend sans cesse, même sous le jet : il faut verser plus vite qu'il ne reprend
          p.suppress -= (p.battery ? BATTERY_RECOVERY : def.recovery) * dt;
          if (p.suppress < 0) p.suppress = 0;
        }
        target *= 1 - 0.3 * rain;
        // montée en puissance : une batterie s'embrase en quelques secondes, un bac en une demi-minute
        const rise = p.battery ? 8 : def.igniteSeconds * 4;
        if (p.burning < target) {
          p.burning += dt / rise;
          if (p.burning > target) p.burning = target;
        } else {
          p.burning -= dt * 0.5;
          if (p.burning < target) p.burning = target;
        }
        p.fuel -= dt * (0.4 + 0.6 * p.burning);
        if (p.fuelMax > 0) {
          const floor = p.maxHp * 0.1;
          if (p.hp > floor) {
            p.hp -= (dt * p.maxHp * 0.9 * p.burning) / p.fuelMax;
            if (p.hp < floor) p.hp = floor;
          }
        }
        if (p.fuel <= 0) {
          this.burnOut(p);
          continue;
        }
        if (now >= p.fireNext) {
          p.fireNext = now + FIRE_PERIOD;
          p.fireTicks++;
          this.periodic(p);
        }
      }
    }

    // batteries qui couvent
    const smolder = m.store.smolder;
    for (let i = smolder.length - 1; i >= 0; i--) {
      const p = smolder[i]!;
      if (p.reigniteAt <= 0 || now < p.reigniteAt) continue;
      p.reigniteAt = 0;
      p.suppress = 0;
      m.store.deactivate(p, ACT_SMOLDER);
      if (this.ignite(p, 0, true, true)) {
        k.fx('etincelles', p.x, p.y + 0.3, p.z, 2);
        k.sfx('petard', p.x, p.y + 0.3, p.z, 0.8, 1.3);
      }
    }
  }

  /** Fumée, chaleur, propagation, sursauts de batterie : une fois par seconde et par feu. */
  private periodic(p: PropObj): void {
    const m = this.m;
    const k = m.k;
    const hazards = k.ctx.hazards;
    const def = p.def;
    const I = p.burning;
    const feed = p.fireTicks % FEED_EVERY === 1;

    const sinceDouse = k.ctx.clock.now - p.dousedAt;
    if (feed && p.fireTicks > FEED_EVERY) {
      // La nappe entretenue au dernier passage existe-t-elle encore ? Ce contrôle ne joue que si l'eau ne
      // nous est pas signalée par 'hazards:douse' : quand elle l'est, c'est la quantité versée qui décide
      // (un extincteur noie la nappe au sol sans venir à bout d'une batterie ou d'un kiosque).
      if (hazards.fireAt(p.x, p.z) > 0.02) {
        p.coupled = true;
        p.missed = 0;
      } else if (p.coupled && sinceDouse > DOUSE_MEMORY && ++p.missed >= 2) {
        this.extinguish(p, this.douser(p.x, p.z), true);
        return;
      }
    }
    const hosed = sinceDouse < 2; // sous le jet : on ne rallume pas la nappe

    if (p.parts !== null && p.halfX > 1.5) {
      // barricade : un foyer tous les 2,5 m environ, le long de l'axe
      const n = Math.max(1, Math.round((p.halfX * 2) / 2.5));
      const ax = Math.cos(p.heading);
      const az = -Math.sin(p.heading);
      for (let i = 0; i < n; i++) {
        const u = n === 1 ? 0 : -p.halfX + ((i + 0.5) * p.halfX * 2) / n;
        const x = p.x + ax * u;
        const z = p.z + az * u;
        hazards.emitSmoke(x, z, def.smokeRate * I * FIRE_PERIOD, def.smokeRadius, def.smokeColor);
        if (feed && !hosed) hazards.ignite(x, z, def.flameRadius * (0.6 + 0.4 * I), I * def.flameIntensity, p.igniterId);
      }
    } else {
      hazards.emitSmoke(p.x, p.z, def.smokeRate * I * FIRE_PERIOD, def.smokeRadius, def.smokeColor);
      if (feed && !hosed) hazards.ignite(p.x, p.z, def.flameRadius * (0.6 + 0.4 * I), I * def.flameIntensity, p.igniterId);
    }

    if (p.fireTicks % SPREAD_EVERY === 0 && I > 0.35) this.spread(p, I);

    if (p.battery && I > 0.3 && k.rng.chance(0.07)) this.flare(p);
    else if (def.material === 'bois' && k.rng.chance(0.1)) k.fx('etincelles', p.x, p.y + p.height, p.z, 0.5);
  }

  /** Le feu gagne les objets voisins et chauffe les façades proches. */
  private spread(p: PropObj, I: number): void {
    const m = this.m;
    const scale = m.k.tuning.fireSpread;
    if (!(scale > 0)) return;
    const reach = Math.max(p.halfX, p.halfZ) + SPREAD_REACH + 1.2;
    const buf = this.buf;
    const n = m.store.collectAround(p.x, p.z, reach, buf);
    const period = SPREAD_EVERY * FIRE_PERIOD;
    for (let i = 0; i < n; i++) {
      const q = buf[i]!;
      if (q === p || q.carriedBy !== 0 || !this.canBurn(q)) continue;
      let d = Math.sqrt(distSqPointObb(q.x, q.z, p.x, p.z, p.halfX, p.halfZ, p.heading)) - (q.halfX < q.halfZ ? q.halfX : q.halfZ);
      if (d < 0) d = 0;
      if (d > SPREAD_REACH) continue;
      // au contact : 2,5 fois la durée d'allumage ; à 1,5 m : 8 fois (≈ une minute pour un bac)
      const slow = 2.5 + (5.5 * d) / SPREAD_REACH;
      this.addHeat(q, (I * period * scale) / (q.def.igniteSeconds * slow), p.igniterId, true);
    }
    const shops = this.shopBuf;
    const ns = m.store.shopsNear(p.x, p.z, Math.max(p.halfX, p.halfZ) + 2, shops);
    for (let i = 0; i < ns; i++) m.shops.heat(shops[i]!, I * period * scale, p.igniterId);
  }

  /** Sursaut d'une batterie : gerbe d'étincelles à 3 m, détonation sèche, bouffée de fumée. */
  private flare(p: PropObj): void {
    const m = this.m;
    const k = m.k;
    p.burning = 1;
    k.fx('etincelles', p.x, p.y + 0.3, p.z, 3);
    k.sfx('petard', p.x, p.y + 0.3, p.z, 0.9, 1.3);
    k.ctx.hazards.emitSmoke(p.x, p.z, 1.2, 2, p.def.smokeColor);
    const buf = this.buf;
    const n = m.store.collectAround(p.x, p.z, 3, buf);
    for (let i = 0; i < n; i++) {
      const q = buf[i]!;
      if (q === p) continue;
      const dx = q.x - p.x;
      const dz = q.z - p.z;
      if (dx * dx + dz * dz < 9) this.addHeat(q, 0.12, p.igniterId, true);
    }
  }
}
