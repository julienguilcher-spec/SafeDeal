/* =====================================================================================
 * DÉCOR DYNAMIQUE — dégâts aux objets : intact → endommagé → cassé, vitrages qui éclatent,
 * tags, souffle des explosions.
 *
 *   - le matériau module chaque type de coup (un marteau n'entame guère l'acier, il fait éclater le
 *     verre) ; le gaz et l'eau n'abîment rien ; le feu chauffe l'objet avant de l'enflammer ;
 *   - mobilier vitré (abribus, panneau publicitaire, kiosque, distributeur de billets, horodateur,
 *     caméra) : le verre encaisse d'abord, panneau après panneau — fx 'eclats_verre', sfx
 *     'verre_brise', événement libre 'props:glass' ; un abribus se saccage en 15 à 30 s de coups ;
 *   - cassé : l'objet léger est à terre et ne gêne plus, le gros mobilier reste en travers ; des
 *     débris tombent (nouveaux projectiles) ;
 *   - une barricade ne cède qu'à la lame, au choc d'un véhicule ou au souffle : elle éclate alors en
 *     épaves poussées de côté ;
 *   - toute dégradation par une personne qui n'est ni des forces ni des secours est déclarée
 *     (ctx.law.recordOffense : 'degradation' ou 'tag') et pèse sur la tension.
 * ===================================================================================== */

import type { DamageKind, EntityId, GameEvents } from '@/core/contracts';
import { distSqPointSegment } from '@/core/math';
import { GLASS_EVENT } from './api';
import type { GlassEvent } from './api';
import { glassFactor, materialFactor } from './defs';
import type { Mod } from './mod';
import { ACT_MOVING, TENSION } from './shared';
import type { PropObj, ShopObj } from './shared';

/** Coup trop faible pour marquer un vitrage. */
const GLASS_MIN = 3;
/** Nombre maximal d'objets 'debris' vivants créés par la casse. */
const MAX_DEBRIS = 160;

/** Souffle par type d'explosion : rayon (m) et dégâts au centre. */
const BLASTS: Record<string, { r: number; base: number; propsToo: boolean; sparks: boolean }> = {
  mortier: { r: 3, base: 12, propsToo: true, sparks: true },
  gm2l: { r: 2.5, base: 10, propsToo: true, sparks: false },
  desencerclement: { r: 2, base: 4, propsToo: true, sparks: false },
  // le module des véhicules souffle déjà le mobilier autour d'une épave : ici, seulement les vitrines
  vehicule: { r: 8, base: 25, propsToo: false, sparks: false },
};

export class Damage {
  private debrisCount = 0;
  private readonly glassEvent: GlassEvent = { id: 0, panesLeft: 0, byId: 0 };
  private readonly buf: PropObj[] = [];
  private readonly shopBuf: ShopObj[] = [];

  constructor(private readonly m: Mod) {}

  reset(): void {
    this.debrisCount = 0;
  }

  noteRemoved(p: PropObj): void {
    if (p.kind === 'debris' && this.debrisCount > 0) this.debrisCount--;
  }

  damage(p: PropObj, amount: number, kind: DamageKind, byId: EntityId): void {
    if (p.slot < 0 || !(amount > 0) || !Number.isFinite(amount)) return;
    const m = this.m;
    const k = m.k;
    // un autre module a pu déplacer ou renverser l'objet en écrivant ses champs : on se remet à jour
    if (m.store.stale(p)) m.store.reindex(p);
    if (p.toppled && !p.toppledDone) m.motion.applyTopple(p, Math.sin(p.heading), Math.cos(p.heading));
    if (kind === 'gas' || kind === 'water') return;
    p.dormant = false;
    amount *= k.tuning.damageScale;
    if (kind === 'burn') m.fire.heatFromDamage(p, amount, byId);

    const def = p.def;
    if (p.parts !== null) {
      // barricade : seuls la lame, un véhicule ou le souffle la disloquent
      const f = kind === 'crush' || kind === 'vehicle' ? 1 : kind === 'blast' ? 0.5 : kind === 'blunt' || kind === 'impact' ? 0.08 : 0;
      if (f <= 0) return;
      p.hp -= amount * f;
      p.dirty = true;
      if (p.hp <= 0) {
        p.hp = 0;
        m.barricades.burst(p, byId);
      } else if (p.state === 'intact' && p.hp < p.maxHp * 0.5) {
        p.state = 'damaged';
        k.ctx.events.emit('prop:damaged', { id: p.id, state: 'damaged', byId });
      }
      return;
    }

    if (p.state === 'burnt' && kind !== 'crush' && kind !== 'vehicle' && kind !== 'blast') return;

    // vitrage : il encaisse d'abord
    if (p.glass > 0 && !(def.glassHigh && kind === 'blunt')) {
      const g = amount * glassFactor(kind);
      if (g >= GLASS_MIN) this.hitGlass(p, g, byId);
      else if (g > 0) k.sfx('impact_sol', p.x, p.y + p.height * 0.5, p.z, 0.4, 1.5);
    }

    const eff = amount * materialFactor(def.material, kind);
    if (!(eff > 0)) return;
    p.hp -= eff;
    p.dirty = true;
    if (p.hp <= 0) {
      p.hp = 0;
      this.breakProp(p, byId);
    } else if (p.state === 'intact' && p.hp < p.maxHp * 0.5) {
      p.state = 'damaged';
      k.ctx.events.emit('prop:damaged', { id: p.id, state: 'damaged', byId });
      k.offense(byId, 'degradation', p.x, p.z, TENSION.degradation, 'mobilier dégradé');
    }
  }

  /** Le verre d'un mobilier vitré reçoit `g` points : les panneaux éclatent un à un. */
  private hitGlass(p: PropObj, g: number, byId: EntityId): void {
    const k = this.m.k;
    const def = p.def;
    const paneHp = def.panes > 0 ? def.glassHp / def.panes : def.glassHp;
    const before = p.panes;
    p.glass -= g;
    if (p.glass < 0.5) p.glass = 0;
    p.panes = p.glass <= 0 ? 0 : Math.ceil(p.glass / paneHp - 1e-9);
    p.dirty = true;
    const y = p.y + (def.glassHigh ? p.height * 0.95 : p.height * 0.55);
    if (p.panes >= before) {
      k.sfx('impact_sol', p.x, y, p.z, 0.5, 1.5);
      return;
    }
    const broken = before - p.panes;
    k.fx('eclats_verre', p.x, y, p.z, Math.min(2.5, 0.8 + 0.5 * broken));
    k.sfx('verre_brise', p.x, y, p.z, 1, 1);
    const e = this.glassEvent;
    e.id = p.id;
    e.panesLeft = p.panes;
    e.byId = byId;
    k.ctx.events.emitAny(GLASS_EVENT, e);
    if (p.state === 'intact') {
      p.state = 'damaged';
      k.ctx.events.emit('prop:damaged', { id: p.id, state: 'damaged', byId });
    }
    k.offense(byId, 'degradation', p.x, p.z, TENSION.casse, 'vitrage brisé');
  }

  private breakProp(p: PropObj, byId: EntityId): void {
    const m = this.m;
    const k = m.k;
    const def = p.def;
    if (p.glass > 0) this.hitGlass(p, p.glass + 1, byId);
    if (p.state === 'burning') p.preFire = 'broken';
    else if (p.state !== 'burnt') p.state = 'broken';
    // à terre, dans la direction opposée à celui qui frappe
    let dx = Math.sin(p.heading);
    let dz = Math.cos(p.heading);
    const by = k.person(byId);
    if (by) {
      const ex = p.x - by.x;
      const ez = p.z - by.z;
      const l = Math.sqrt(ex * ex + ez * ez);
      if (l > 1e-3) {
        dx = ex / l;
        dz = ez / l;
      }
    }
    if (def.topple !== 'none') m.motion.applyTopple(p, dx, dz);
    else p.toppled = true;
    if (!def.brokenBlocks) {
      p.blocksMove = false;
      p.blocksSight = false;
    }
    p.toppledDone = true;
    const y = p.y + Math.min(1, p.height * 0.5);
    // le bruit de la casse est déduit de prop:damaged par le module audio
    k.fx('debris', p.x, y, p.z, Math.min(2, 0.5 + p.def.mass / 400));
    for (let i = 0; i < def.debris && this.debrisCount < MAX_DEBRIS; i++) {
      const a = k.rng.next() * 6.283185307179586;
      const d = Math.max(p.halfX, p.halfZ) + 0.3 + k.rng.next() * 0.6;
      m.store.create('debris', p.x + Math.cos(a) * d, p.z + Math.sin(a) * d, a);
      this.debrisCount++;
    }
    k.ctx.events.emit('prop:damaged', { id: p.id, state: p.state, byId });
    k.offense(byId, 'degradation', p.x, p.z, TENSION.casse, 'mobilier détruit');
    if (p.movable && (p.act & ACT_MOVING) === 0) m.barricades.schedule(p);
  }

  /** Inscription à la bombe sur un objet. */
  tagProp(p: PropObj, byId: EntityId): void {
    if (p.slot < 0) return;
    p.tags++;
    p.dirty = true;
    this.m.k.offense(byId, 'tag', p.x, p.z, TENSION.tag, 'tag');
  }

  /** Souffle d'une détonation : vitrines étoilées ou soufflées, mobilier léger projeté. */
  onExplosion(e: GameEvents['explosion']): void {
    const b = BLASTS[e.kind];
    if (b === undefined) return;
    const m = this.m;
    const ctx = m.k.ctx;
    const ground = ctx.world.heightAt(e.x, e.z);
    if (e.y - (Number.isFinite(ground) ? ground : 0) > 4) return; // bouquet en hauteur : rien au sol
    const shops = this.shopBuf;
    const ns = m.store.shopsNear(e.x, e.z, b.r, shops);
    for (let i = 0; i < ns; i++) {
      const s = shops[i]!;
      const tx = Math.cos(s.heading) * s.width * 0.5;
      const tz = -Math.sin(s.heading) * s.width * 0.5;
      const d = Math.sqrt(distSqPointSegment(e.x, e.z, s.x - tx, s.z - tz, s.x + tx, s.z + tz));
      const f = 1 - d / b.r;
      if (f > 0) m.shops.damageShop(s, b.base * f, 'blast', e.sourceId);
    }
    if (!b.propsToo) return;
    const buf = this.buf;
    const n = m.store.queryRadius(e.x, e.z, b.r, buf);
    for (let i = 0; i < n; i++) {
      const p = buf[i]!;
      if (p.slot < 0) continue;
      const dx = p.x - e.x;
      const dz = p.z - e.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      const f = 1 - Math.min(1, d / (b.r + Math.max(p.halfX, p.halfZ)));
      if (f <= 0) continue;
      this.damage(p, b.base * f, 'blast', e.sourceId);
      if (p.slot < 0) continue;
      if (b.sparks) m.fire.addHeat(p, 0.3 * f, e.sourceId);
      if (p.movable && d > 1e-3) m.motion.push(p, dx / d, dz / d, 5 * f, e.sourceId);
    }
  }
}
