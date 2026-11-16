/* =====================================================================================
 * DÉCOR DYNAMIQUE — vitrines : casse, rideau de fer, pillage, incendie de boutique.
 *
 *   - vitrage : intacte → taguée → fissurée → brisée. Verre courant : trois coups de marteau ou un
 *     pavé bien lancé ; verre feuilleté des banques, bijouteries et enseignes de luxe : le double
 *     (« vitrine brisée en 2 à 6 coups », docs/research/00-bible-realisme.md) ; panneaux de bois posés
 *     avant une manifestation annoncée tendue : il faut d'abord les arracher (état 'boarded') ;
 *   - rideau de fer : le commerçant le baisse quand la tension locale (ctx.director.tensionAt)
 *     dépasse son sang-froid — en 25 s s'il a le temps, en 6 s si la rue s'embrase ; baissé, il
 *     protège la vitrine et encaisse les coups à sa place ; forcé à la longue (une quarantaine de
 *     coups de marteau, bien moins à plusieurs ou à la barre), il reste entrouvert et ne protège plus ;
 *   - pillage : loot() n'aboutit que vitrine brisée et rideau levé ou forcé ; chaque passage emporte
 *     une charge, le stock baisse jusqu'à zéro ; `occupants` est tenu par le geste « piller » ;
 *   - incendie : un engin incendiaire lancé dans une vitrine ouverte, ou un feu de rue contre la
 *     façade (la vitre chauffée finit par céder en 90 s), embrase la boutique : fumée lourde, flammes
 *     qui sortent par la devanture, marchandise détruite ; un extincteur ne vient à bout que d'un
 *     début de feu, au-delà il faut le canon à eau ou les pompiers.
 * Événements : shop:window, shop:shutter, shop:looted, fire:started / fire:out (targetKind 'shop'),
 * 'props:shutter_forced'. Infractions : 'degradation', 'tag', 'pillage', 'incendie'.
 * ===================================================================================== */

import { swapRemove } from '@/core/arrays';
import type { DamageKind, EntityId, Rng, ShopInit } from '@/core/contracts';
import { clamp, clamp01, distSqPointSegment } from '@/core/math';
import { SHUTTER_FORCED_EVENT } from './api';
import type { ShopView } from './api';
import { glassFactor } from './defs';
import type { Mod } from './mod';
import { TENSION } from './shared';
import type { PropObj, ShopObj } from './shared';
import { shopName, shopOpenAt } from './shop-defs';

/** Rideau assez bas pour protéger la vitrine. */
const SHUTTER_PROTECTS = 0.85;
/** Coup trop faible pour marquer le verre. */
const GLASS_MIN = 3;
/** Résistance des panneaux de bois. */
const BOARDS_HP = 90;
/** Durée de fermeture du rideau : sans hâte / dans l'urgence (s). */
const CLOSE_SLOW = 25;
const CLOSE_FAST = 6;
/** Exposition d'un intérieur ouvert avant embrasement (s) ; d'une vitre intacte avant qu'elle cède (s). */
const INSIDE_IGNITE = 15;
const GLASS_HEAT = 90;
/** Montée en puissance d'un feu de boutique (s) et destruction du stock à plein feu (s). */
const SHOP_RISE = 90;
const STOCK_BURN = 120;
const SHOP_SMOKE = 0x1c1c1c;
/** Intervalle minimal entre deux hausses de tension pour le pillage d'une même boutique (s). */
const LOOT_TENSION_GAP = 20;

export class Shops {
  private readonly propBuf: PropObj[] = [];
  private readonly shopBuf: ShopObj[] = [];

  constructor(private readonly m: Mod) {}

  // ───────────────────────────── création ─────────────────────────────

  add(init: ShopInit, rng: Rng = this.m.k.rng): ShopObj {
    const k = this.m.k;
    const ctx = k.ctx;
    const s = this.m.store.createShop(init);
    const def = s.def;
    s.name = init.name !== undefined && init.name !== '' ? init.name : shopName(init.category, rng);
    s.stock = init.stock !== undefined ? clamp01(init.stock) : clamp01(def.stock * rng.range(0.85, 1));
    s.appeal = init.appeal !== undefined ? clamp01(init.appeal) : clamp01(def.appeal + rng.range(-0.05, 0.05));
    s.hasShutter = rng.chance(def.shutterShare);
    s.nerve = clamp(def.nerve * rng.range(0.8, 1.25), 0.08, 0.95);
    s.loads = Math.max(2, Math.round(def.loads * clamp(s.width / 6, 0.5, 2)));
    s.maxOccupants = clamp(Math.floor(s.width / 1.5), 1, 8);
    s.glass = s.glassMax = def.glassHp * rng.range(0.9, 1.15);
    s.fuel = s.fuelMax = def.fuelPerMeter * s.width * rng.range(0.8, 1.2);
    const boardRoll = rng.next();
    // l'heure de la session en cours de chargement n'est pas encore appliquée à ctx.env : on lit la configuration
    const cfg = ctx.session.config;
    if (init.shutter !== undefined) {
      s.shutter = clamp01(init.shutter);
      if (s.shutter > 0) s.hasShutter = true;
    } else if (s.hasShutter && !shopOpenAt(def, cfg ? cfg.timeOfDay : ctx.env.state.timeOfDay)) {
      s.shutter = 1; // boutique fermée à cette heure
    } else {
      // manifestation annoncée tendue : les enseignes exposées ont posé des panneaux de bois
      if (cfg && boardRoll < def.boardShare * clamp01(cfg.tension * 1.5)) {
        s.window = 'boarded';
        s.boards = s.boardsMax = BOARDS_HP;
      }
    }
    s.target = s.shutter >= 0.5 ? 1 : 0;
    s.closedSent = s.shutter >= 0.999;
    return s;
  }

  // ───────────────────────────── casse ─────────────────────────────

  private isOpen(s: ShopObj): boolean {
    return s.window === 'broken' && (s.shutter < 0.5 || s.forced);
  }

  damageShop(s: ShopObj, amount: number, kind: DamageKind, byId: EntityId): void {
    if (s.slot < 0 || !(amount > 0) || !Number.isFinite(amount)) return;
    if (kind === 'gas' || kind === 'water') return;
    const k = this.m.k;
    amount *= k.tuning.damageScale;
    s.dormant = false;
    const y = s.y + 1.2;

    if (s.shutter >= SHUTTER_PROTECTS && !s.forced) {
      // rideau baissé : c'est lui qui encaisse ; seul le souffle atteint encore le verre, affaibli
      const f = kind === 'blunt' ? 1 : kind === 'impact' ? 0.3 : kind === 'vehicle' || kind === 'crush' ? 4 : kind === 'blast' ? 1 : kind === 'bullet' ? 0.05 : 0;
      if (f <= 0) return;
      s.shutterHp -= amount * f;
      s.dirty = true;
      if (s.shutterHp <= 0) this.force(s, byId);
      else k.sfx('rideau_fer', s.x, y, s.z, 0.5, 1.3);
      if (kind === 'blast' && s.window !== 'broken' && s.window !== 'boarded') this.hurtGlass(s, amount * 0.3 * glassFactor(kind), byId);
      return;
    }

    if (kind === 'burn') {
      if (this.isOpen(s)) {
        // engin incendiaire lancé à l'intérieur : 40 points suffisent
        s.heat += amount / 40;
        if (byId !== 0) s.igniterId = byId;
        if (s.heat >= 1) this.ignite(s, s.igniterId, false);
        return;
      }
      if (s.window === 'broken') return;
    }

    if (s.window === 'boarded') {
      const f = kind === 'blunt' ? 1 : kind === 'impact' ? 0.6 : kind === 'blast' ? 1.5 : kind === 'vehicle' || kind === 'crush' ? 3 : kind === 'burn' ? 0.5 : 0.1;
      s.boards -= amount * f;
      s.dirty = true;
      if (s.boards <= 0) this.unboard(s, byId);
      else k.sfx('impact_sol', s.x, y, s.z, 0.7, 0.8);
      return;
    }
    if (s.window === 'broken') return;
    this.hurtGlass(s, amount * glassFactor(kind), byId);
  }

  /** Les panneaux de bois sont arrachés : la vitre réapparaît dans l'état où elle était. */
  private unboard(s: ShopObj, byId: EntityId): void {
    const k = this.m.k;
    s.boards = 0;
    s.window = s.glass < s.glassMax * 0.7 ? 'cracked' : s.tags > 0 ? 'tagged' : 'intact';
    k.ctx.events.emit('shop:window', { id: s.id, state: s.window, byId });
    k.fx('debris', s.x, s.y + 1.2, s.z, 1);
    k.offense(byId, 'degradation', s.x, s.z, TENSION.degradation, 'protections arrachées');
  }

  /** Le verre reçoit `g` points. `slow` : chaleur continue (pas de seuil, pas de bruit de choc). */
  private hurtGlass(s: ShopObj, g: number, byId: EntityId, slow = false): void {
    const k = this.m.k;
    const y = s.y + 1.2;
    if (!slow && g < GLASS_MIN) {
      if (g > 0.5) k.sfx('impact_sol', s.x, y, s.z, 0.5, 1.4);
      return;
    }
    s.glass -= g;
    s.dirty = true;
    if (s.glass <= 0) {
      this.breakWindow(s, byId);
    } else if (s.window !== 'cracked' && (g >= 8 || s.glass < s.glassMax * 0.7)) {
      s.window = 'cracked';
      k.ctx.events.emit('shop:window', { id: s.id, state: 'cracked', byId });
      k.fx('impact', s.x, y, s.z, 0.4);
      k.offense(byId, 'degradation', s.x, s.z, TENSION.degradation, 'vitrine fissurée');
    } else if (!slow) {
      k.sfx('impact_sol', s.x, y, s.z, 0.6, 1.4);
    }
  }

  private breakWindow(s: ShopObj, byId: EntityId): void {
    const k = this.m.k;
    s.glass = 0;
    s.window = 'broken';
    s.dirty = true;
    k.stats.windowsBroken++;
    const y = s.y + 1.2;
    k.ctx.events.emit('shop:window', { id: s.id, state: 'broken', byId });
    k.fx('eclats_verre', s.x + Math.sin(s.heading) * 0.3, y, s.z + Math.cos(s.heading) * 0.3, Math.min(3, s.width * 0.5));
    k.sfx('verre_brise', s.x, y, s.z, 1, 1);
    k.offense(byId, 'degradation', s.x, s.z, TENSION.vitrine, 'vitrine brisée');
    // le commerçant : une fois sur deux il tente de baisser le rideau en urgence, sinon il est déjà parti
    if (s.hasShutter && !s.forced && s.target < 1 && !s.abandoned) {
      if (k.tuning.shopkeepers && k.rng.chance(0.5)) {
        s.decidedAt = k.ctx.clock.now + k.rng.range(3, 8);
        s.urgent = true; // sa décision est prise, quelle que soit la tension
      } else {
        s.abandoned = true;
      }
    }
  }

  private force(s: ShopObj, byId: EntityId): void {
    const k = this.m.k;
    s.shutterHp = 0;
    s.forced = true;
    s.shutter = 0.3; // tordu et relevé : on passe dessous
    s.target = 0.3;
    s.abandoned = true;
    s.dirty = true;
    if (s.rolling) {
      s.rolling = false;
      swapRemove(this.m.store.rolling, s);
    }
    s.closedSent = false;
    k.ctx.events.emit('shop:shutter', { id: s.id, closed: false });
    k.ctx.events.emitAny(SHUTTER_FORCED_EVENT, { id: s.id, byId });
    k.fx('debris', s.x, s.y + 0.6, s.z, 1.2);
    k.offense(byId, 'degradation', s.x, s.z, TENSION.casse, 'rideau de fer forcé');
  }

  tag(s: ShopObj, byId: EntityId): void {
    if (s.slot < 0) return;
    const k = this.m.k;
    s.tags++;
    s.dirty = true;
    if (s.window === 'intact' && s.shutter < SHUTTER_PROTECTS) {
      s.window = 'tagged';
      k.ctx.events.emit('shop:window', { id: s.id, state: 'tagged', byId });
    }
    k.offense(byId, 'tag', s.x, s.z, TENSION.tag, 'tag');
  }

  // ───────────────────────────── pillage ─────────────────────────────

  lootable(s: ShopObj): boolean {
    return s.slot >= 0 && this.isOpen(s) && s.stock > 0 && s.burning < 0.3 && !s.burnt;
  }

  /** Emporte une charge de marchandise ; retourne la part de stock prise (0 si le pillage est impossible). */
  loot(s: ShopObj, byId: EntityId): number {
    if (!this.lootable(s)) return 0;
    const k = this.m.k;
    const load = 1 / s.loads;
    const amount = s.stock < load ? s.stock : load;
    s.stock -= amount;
    if (s.stock < 1e-6) s.stock = 0;
    s.abandoned = true;
    s.dirty = true;
    s.dormant = false;
    k.stats.looted++;
    k.ctx.events.emit('shop:looted', { id: s.id, byId, amount });
    const now = k.ctx.clock.now;
    let tension = 0;
    if (now - s.lootTensionAt >= LOOT_TENSION_GAP) {
      tension = TENSION.pillage;
      s.lootTensionAt = now;
    }
    if (!k.offense(byId, 'pillage', s.x, s.z, tension, 'pillage') && tension > 0) {
      s.lootTensionAt = now;
      k.tension(tension, s.x, s.z, 'pillage');
    }
    return amount;
  }

  // ───────────────────────────── rideau ─────────────────────────────

  setShutter(s: ShopObj, closed: boolean, instant = false): boolean {
    if (s.slot < 0 || !s.hasShutter || s.forced) return false;
    s.target = closed ? 1 : 0;
    s.speed = 1 / 8;
    s.dormant = false;
    if (instant) {
      s.shutter = s.target;
      this.shutterEvents(s);
      return true;
    }
    this.roll(s);
    return true;
  }

  private roll(s: ShopObj): void {
    if (s.rolling || s.shutter === s.target) return;
    s.rolling = true;
    this.m.store.rolling.push(s);
    this.m.k.sfx('rideau_fer', s.x, s.y + 1.5, s.z, 0.5, 0.9);
  }

  private shutterEvents(s: ShopObj): void {
    const events = this.m.k.ctx.events;
    if (s.shutter >= 0.999 && !s.closedSent) {
      s.closedSent = true;
      s.dirty = true;
      events.emit('shop:shutter', { id: s.id, closed: true });
    } else if (s.closedSent && s.shutter < 0.95) {
      s.closedSent = false;
      s.dirty = true;
      events.emit('shop:shutter', { id: s.id, closed: false });
    }
  }

  // ───────────────────────────── feu ─────────────────────────────

  /** Chaleur reçue d'un feu contre la façade, en secondes d'exposition à pleine flamme. */
  heat(s: ShopObj, seconds: number, byId: EntityId): void {
    if (s.slot < 0 || s.inFire || s.burnt || !(seconds > 0)) return;
    if (this.isOpen(s)) {
      s.heat += seconds / INSIDE_IGNITE;
      if (byId !== 0) s.igniterId = byId;
      if (s.heat >= 1) this.ignite(s, s.igniterId, true);
      return;
    }
    if (s.shutter >= SHUTTER_PROTECTS && !s.forced) return; // rideau baissé : la boutique est à l'abri
    if (s.window === 'boarded') {
      s.boards -= seconds * 1.5;
      if (s.boards <= 0) this.unboard(s, 0);
      return;
    }
    if (s.window !== 'broken') this.hurtGlass(s, (seconds * s.glassMax) / GLASS_HEAT, byId, true);
  }

  ignite(s: ShopObj, byId: EntityId, spread = false): boolean {
    if (s.slot < 0 || s.inFire || s.burnt || !(s.fuel > 0)) return false;
    const k = this.m.k;
    const now = k.ctx.clock.now;
    if (s.window !== 'broken') {
      s.glass = 0;
      s.window = 'broken';
      k.ctx.events.emit('shop:window', { id: s.id, state: 'broken', byId });
    }
    s.inFire = true;
    s.burning = 0.08;
    s.peak = 0.08;
    s.heat = 1;
    s.igniterId = byId;
    s.suppress = 0;
    s.abandoned = true;
    s.dormant = false;
    s.dirty = true;
    s.fireTicks = 0;
    s.fireNext = now + k.rng.range(0.3, 1);
    this.m.store.burningShops.push(s);
    k.stats.firesStarted++;
    const fx = s.x + Math.sin(s.heading) * 0.5;
    const fz = s.z + Math.cos(s.heading) * 0.5;
    k.ctx.events.emit('fire:started', { x: s.x, z: s.z, targetKind: 'shop', targetId: s.id, sourceId: byId });
    k.fx('feu', fx, s.y + 0.5, fz, Math.min(3, s.width * 0.4));
    if (spread || !k.offense(byId, 'incendie', s.x, s.z, TENSION.feuBoutique, 'boutique incendiée')) {
      k.tension(TENSION.feuBoutique, s.x, s.z, 'boutique en feu');
    }
    return true;
  }

  /**
   * Agent extincteur nécessaire, d'après le développement atteint par le feu : 6 unités pour un départ
   * de feu, 60 pour une boutique embrasée (qui reprend en outre de 0,8 unité par seconde : l'extincteur
   * n'y suffit pas, le canon à eau en vient à bout en une demi-minute).
   */
  private needOf(s: ShopObj): number {
    return 6 + 54 * s.peak;
  }

  extinguish(s: ShopObj, byId: EntityId, doused = true): void {
    if (!s.inFire) return;
    const k = this.m.k;
    s.inFire = false;
    swapRemove(this.m.store.burningShops, s);
    s.burning = 0;
    s.suppress = 0;
    s.heat = 0;
    s.fuel *= 0.6;
    s.dirty = true;
    k.ctx.events.emit('fire:out', { x: s.x, z: s.z, targetKind: 'shop', targetId: s.id, byId });
    if (doused) k.tension(TENSION.feuEteint, s.x, s.z, 'feu éteint');
  }

  private burnOut(s: ShopObj): void {
    const k = this.m.k;
    s.inFire = false;
    swapRemove(this.m.store.burningShops, s);
    s.burning = 0;
    s.fuel = 0;
    s.stock = 0;
    s.burnt = true;
    s.dirty = true;
    k.ctx.events.emit('fire:out', { x: s.x, z: s.z, targetKind: 'shop', targetId: s.id, byId: 0 });
    k.fx('trace_brulure', s.x, s.y, s.z, s.width);
  }

  applyDouse(x: number, z: number, radius: number, amount: number, byId: EntityId): void {
    const list = this.m.store.burningShops;
    if (list.length === 0) return;
    const now = this.m.k.ctx.clock.now;
    const reach = radius + 1.5;
    for (let i = list.length - 1; i >= 0; i--) {
      const s = list[i]!;
      const tx = Math.cos(s.heading) * s.width * 0.5;
      const tz = -Math.sin(s.heading) * s.width * 0.5;
      if (distSqPointSegment(x, z, s.x - tx, s.z - tz, s.x + tx, s.z + tz) > reach * reach) continue;
      // un départ de feu tient en un point de la devanture ; un feu développé occupe toute la façade
      const cover = Math.min(1, (2 * radius) / Math.max(1, s.width * s.peak));
      s.suppress += amount * cover;
      s.dousedAt = now;
      if (s.suppress >= this.needOf(s)) {
        let credit = byId;
        if (credit === 0) {
          const p = this.m.k.ctx.people.nearest(x, z, 12, (q) => q.faction === 'police' || q.faction === 'rescue');
          if (p) credit = p.id;
        }
        this.extinguish(s, credit, true);
      }
    }
  }

  // ───────────────────────────── réflexion lente (≈ 1 fois par seconde et par vitrine) ─────────────────────────────

  think(s: ShopObj, elapsed: number): void {
    const k = this.m.k;
    const ctx = k.ctx;
    const now = ctx.clock.now;

    if (k.tuning.shopkeepers && s.hasShutter && !s.forced && !s.abandoned && !s.burnt && !s.inFire) {
      const t = ctx.director.tensionAt(s.x, s.z);
      const excess = s.urgent ? 1 : clamp01((t - s.nerve) / Math.max(0.05, 1 - s.nerve));
      if (s.target < 1) {
        if ((t >= s.nerve || s.urgent) && s.occupants === 0) {
          // il hésite d'autant moins que la tension est forte
          if (s.decidedAt < 0) s.decidedAt = now + 1.5 + 6.5 * (1 - excess) * k.rng.next();
          if (now >= s.decidedAt) {
            s.target = 1;
            s.speed = 1 / (CLOSE_SLOW + (CLOSE_FAST - CLOSE_SLOW) * excess);
            s.calmSince = -1;
            this.roll(s);
          }
        } else if (!s.urgent) {
          s.decidedAt = -1;
        }
      } else {
        if (s.rolling) {
          // la rue s'embrase pendant qu'il ferme : il se dépêche
          const hurry = 1 / (CLOSE_SLOW + (CLOSE_FAST - CLOSE_SLOW) * excess);
          if (hurry > s.speed) s.speed = hurry;
        } else if (s.shutter < 1 && s.occupants === 0) {
          this.roll(s);
        }
        // calme durable : il rouvre, si la vitrine tient encore et que c'est l'heure
        if (t < s.nerve * 0.4 && s.window !== 'broken' && s.shutter >= 0.999) {
          if (s.calmSince < 0) s.calmSince = now;
          else if (now - s.calmSince > 120 && shopOpenAt(s.def, ctx.env.state.timeOfDay)) {
            s.target = 0;
            s.speed = 1 / 20;
            s.decidedAt = -1;
            s.calmSince = -1;
            this.roll(s);
          }
        } else {
          s.calmSince = -1;
        }
      }
    }

    // feu de rue contre la devanture
    if (!s.inFire && !s.burnt) {
      const f = ctx.hazards.fireAt(s.x + Math.sin(s.heading) * 0.8, s.z + Math.cos(s.heading) * 0.8);
      if (f > 0.3) this.heat(s, f * elapsed, 0);
      else if (s.heat > 0) {
        s.heat -= elapsed * 0.02;
        if (s.heat < 0) s.heat = 0;
      }
    }
  }

  // ───────────────────────────── pas de simulation ─────────────────────────────

  update(dt: number): void {
    const store = this.m.store;
    const k = this.m.k;
    const now = k.ctx.clock.now;

    const rolling = store.rolling;
    for (let i = rolling.length - 1; i >= 0; i--) {
      const s = rolling[i]!;
      let stop = false;
      if (s.target > s.shutter) {
        // quelqu'un est entré : le commerçant renonce et s'enfuit
        if (s.occupants > 0 && s.window === 'broken') {
          s.target = s.shutter;
          s.abandoned = true;
          stop = true;
        } else {
          s.shutter += s.speed * dt;
          if (s.shutter >= s.target) {
            s.shutter = s.target;
            stop = true;
          }
        }
      } else {
        s.shutter -= s.speed * dt;
        if (s.shutter <= s.target) {
          s.shutter = s.target;
          stop = true;
        }
      }
      this.shutterEvents(s);
      if (stop) {
        s.rolling = false;
        rolling[i] = rolling[rolling.length - 1]!;
        rolling.pop();
      }
    }

    const fires = store.burningShops;
    for (let i = fires.length - 1; i >= 0; i--) {
      const s = fires[i]!;
      const frac = s.fuelMax > 0 ? s.fuel / s.fuelMax : 0;
      let target = frac < 0.15 ? 0.2 + (0.8 * frac) / 0.15 : 1;
      if (s.burning > s.peak) s.peak = s.burning;
      if (s.suppress > 0) {
        target *= 1 - 0.85 * Math.min(1, s.suppress / this.needOf(s));
        // un feu développé reprend sans cesse, même sous le jet ; un début de feu presque pas
        s.suppress -= 0.8 * s.peak * dt;
        if (s.suppress < 0) s.suppress = 0;
      }
      if (s.burning < target) {
        // sous le jet, les flammes sont rabattues : le feu ne gagne pas
        if (now - s.dousedAt > 1.5) {
          s.burning += dt / SHOP_RISE;
          if (s.burning > target) s.burning = target;
        }
      } else {
        s.burning -= dt * 0.4;
        if (s.burning < target) s.burning = target;
      }
      s.fuel -= dt * (0.4 + 0.6 * s.burning);
      if (s.stock > 0) {
        s.stock -= (dt * s.burning) / STOCK_BURN;
        if (s.stock < 0) s.stock = 0;
      }
      if (s.fuel <= 0) {
        this.burnOut(s);
        continue;
      }
      if (now >= s.fireNext) {
        s.fireNext = now + 1;
        s.fireTicks++;
        this.periodic(s);
      }
    }
  }

  private periodic(s: ShopObj): void {
    const m = this.m;
    const k = m.k;
    const hazards = k.ctx.hazards;
    const I = s.burning;
    const nx = Math.sin(s.heading);
    const nz = Math.cos(s.heading);
    const fx = s.x + nx;
    const fz = s.z + nz;
    hazards.emitSmoke(fx, fz, 1.5 * I, 3, SHOP_SMOKE);
    const hosed = k.ctx.clock.now - s.dousedAt < 2;
    if (s.fireTicks % 3 === 1 && !hosed) {
      // les flammes sortent par la devanture
      hazards.ignite(fx, fz, Math.min(3, 1.2 + s.width * 0.15 * I), I * 0.9, s.igniterId);
    }
    if (s.fireTicks % 4 === 0 && I > 0.6) {
      const scale = k.tuning.fireSpread;
      // mobilier devant la boutique
      const props = this.propBuf;
      const n = m.store.collectAround(fx, fz, s.width * 0.5 + 1.5, props);
      for (let i = 0; i < n; i++) {
        const q = props[i]!;
        const d2 = distSqPointSegment(q.x, q.z, s.x - nz * s.width * 0.5, s.z + nx * s.width * 0.5, s.x + nz * s.width * 0.5, s.z - nx * s.width * 0.5);
        if (d2 < 6.25) m.fire.addHeat(q, (I * 4 * scale) / (q.def.igniteSeconds * 3), s.igniterId, true);
      }
      // au bout de quelques minutes, le feu gagne les boutiques mitoyennes
      if (s.fireTicks > 240 && I > 0.7) {
        const shops = this.shopBuf;
        const ns = m.store.shopsNear(s.x, s.z, s.width * 0.5 + 1.5, shops);
        for (let i = 0; i < ns; i++) {
          const o = shops[i]!;
          if (o !== s) this.heat(o, 4 * I * scale, s.igniterId);
        }
      }
    }
  }

  view(s: ShopObj, out: ShopView): ShopView {
    out.hasShutter = s.hasShutter;
    out.forced = s.forced;
    out.shutterTarget = s.target;
    out.shutterHealth = s.def.shutterHp > 0 ? clamp01(s.shutterHp / s.def.shutterHp) : 0;
    out.glass = s.glassMax > 0 ? clamp01(s.glass / s.glassMax) : 0;
    out.reinforced = s.def.reinforced;
    out.boards = s.boardsMax > 0 ? clamp01(s.boards / s.boardsMax) : 0;
    out.tags = s.tags;
    out.burnt = s.burnt;
    out.maxOccupants = s.maxOccupants;
    out.lootLeft = Math.ceil(s.stock * s.loads - 1e-9);
    return out;
  }
}
