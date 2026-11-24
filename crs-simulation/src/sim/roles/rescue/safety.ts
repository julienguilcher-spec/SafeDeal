/* =====================================================================================
 * SECOURS — évaluation de la sécurité d'une zone d'intervention.
 *
 * Règle d'or (dossier 06 §10.2, bible §G.3) : les secours n'entrent en zone dangereuse que sous la
 * protection des forces de l'ordre. L'équipage regarde donc, avant d'avancer :
 *   - les projectiles tombés autour de la zone dans les douze dernières secondes ;
 *   - une barricade en travers de son chemin ;
 *   - pour le SAMU, un incendie à l'endroit même où il doit travailler ;
 *   - un nuage de lacrymogène sur la zone ;
 *   - une foule hostile à proximité (profils violents, ou personnes en colère) ;
 *   - la tension locale (affrontement à partir de 0,6 — bible §F.4).
 * Une PROTECTION lève les deux derniers motifs (et les projectiles s'ils ne tombent pas tout près) :
 * unité de police dont l'ordre courant est « proteger » ou « escorter » avec des agents à portée, ou
 * zone tenue de fait (six agents autour, aucun hostile au contact). Elle ne lève ni la barricade, ni
 * le gaz, ni le feu.
 * ===================================================================================== */

import type { EntityId, GameContext, Person, Prop, RayHit } from '@/core/contracts';
import type { RescueKind } from '@/core/extensions';
import type { RescueTuning, SafetyReport } from './api';
import { HELD_POLICE, HELD_RANGE, PROTECT_RANGE, THREAT_MEMORY, THREAT_RADIUS } from './tuning';

interface Threat { x: number; z: number; t: number }

const THREATS = 48;

export class SafetyDesk {
  private ctx!: GameContext;
  private readonly threats: Threat[] = [];
  private cursor = 0;
  private readonly report: SafetyReport = { safe: true, protected: false, reason: '', danger: 0 };
  private readonly hit: RayHit = { hit: false, t: 1, x: 0, z: 0, nx: 0, nz: 0, kind: 'none', id: 0, height: 0 };
  private readonly nearProps: Prop[] = [];
  private readonly isHostile = (q: Person): boolean => q.faction === 'protest' && q.posture !== 'down' && q.custody === 'free'
    && (q.anger > 0.5 || q.profile === 'radical' || q.profile === 'opportuniste' || q.profile === 'pilleur');
  private readonly isPolice = (q: Person): boolean => q.faction === 'police' && q.posture !== 'down' && q.health > 0 && q.custody === 'free';
  private readonly isBarricade = (p: Prop): boolean => p.kind === 'barricade' && p.blocksMove;

  constructor(private readonly tuning: RescueTuning) {
    for (let i = 0; i < THREATS; i++) this.threats.push({ x: 0, z: 0, t: -1e9 });
  }

  bind(ctx: GameContext): void {
    this.ctx = ctx;
    ctx.events.on('projectile:impact', (e) => {
      // projectiles de la foule seulement : les grenades des forces de l'ordre sont jugées par le gaz qu'elles laissent
      switch (e.kind) {
        case 'pave':
        case 'bouteille':
        case 'molotov':
        case 'mortier':
        case 'debris':
          this.note(e.x, e.z);
          break;
        default:
          break;
      }
    });
    ctx.events.on('explosion', (e) => {
      if (e.kind === 'molotov' || e.kind === 'mortier' || e.kind === 'vehicule') this.note(e.x, e.z);
    });
  }

  reset(): void {
    for (let i = 0; i < THREATS; i++) this.threats[i].t = -1e9;
    this.cursor = 0;
  }

  /** Enregistre un fait hostile (projectile, explosion, secouriste frappé) en ce point. */
  note(x: number, z: number): void {
    const th = this.threats[this.cursor];
    this.cursor = (this.cursor + 1) % THREATS;
    th.x = x;
    th.z = z;
    th.t = this.ctx.clock.now;
  }

  /** Nombre de faits hostiles récents autour d'un point. */
  threatsNear(x: number, z: number, radius: number, seconds: number): number {
    const now = this.ctx.clock.now;
    const r2 = radius * radius;
    let n = 0;
    for (let i = 0; i < THREATS; i++) {
      const th = this.threats[i];
      if (now - th.t > seconds) continue;
      const dx = th.x - x;
      const dz = th.z - z;
      if (dx * dx + dz * dz <= r2) n++;
    }
    return n;
  }

  hostilesNear(x: number, z: number, radius: number): number {
    return this.ctx.people.countIn(x, z, radius, this.isHostile);
  }

  /** La zone (ou l'équipage en (fromX, fromZ), véhicule `vehicleId`) est-elle protégée par les forces de l'ordre ? */
  protectedAt(x: number, z: number, fromX: number, fromZ: number, vehicleId: EntityId): boolean {
    const ctx = this.ctx;
    const squads = ctx.squads.list;
    const r2 = PROTECT_RANGE * PROTECT_RANGE;
    for (let i = 0; i < squads.length; i++) {
      const s = squads[i];
      if (s.faction !== 'police') continue;
      const o = s.order;
      if (o.type !== 'proteger' && o.type !== 'escorter') continue;
      let covers = vehicleId !== 0 && o.targetId === vehicleId;
      if (!covers) {
        const dx = o.x - x;
        const dz = o.z - z;
        const ex = o.x - fromX;
        const ez = o.z - fromZ;
        covers = dx * dx + dz * dz <= r2 || ex * ex + ez * ez <= r2;
      }
      if (!covers) continue;
      // l'ordre ne suffit pas : il faut des agents réellement sur place
      if (ctx.people.countIn(x, z, 30, this.isPolice) >= 2 || ctx.people.countIn(fromX, fromZ, 30, this.isPolice) >= 2) return true;
    }
    // zone tenue de fait : des agents en nombre, aucun hostile au contact
    return ctx.people.countIn(x, z, HELD_RANGE, this.isPolice) >= HELD_POLICE && ctx.people.countIn(x, z, 12, this.isHostile) === 0;
  }

  /** Une barricade barre-t-elle le segment ? `ignoreId` : la barricade qui fait l'objet de l'intervention. */
  barred(ax: number, az: number, bx: number, bz: number, ignoreId: EntityId): boolean {
    const ctx = this.ctx;
    const hit = this.hit;
    if (ctx.props.raycast(ax, az, bx, bz, hit, 'move') && hit.kind === 'prop' && hit.id !== ignoreId && hit.t < 0.92) {
      const p = ctx.props.get(hit.id);
      if (p && p.kind === 'barricade') return true;
    }
    // barricade un peu de côté : le rayon passe, pas un engin de 2,30 m
    const mx = (ax + bx) * 0.5;
    const mz = (az + bz) * 0.5;
    const half = Math.hypot(bx - ax, bz - az) * 0.5;
    const n = ctx.props.queryRadius(mx, mz, half, this.nearProps, this.isBarricade);
    const dx = bx - ax;
    const dz = bz - az;
    const len2 = dx * dx + dz * dz;
    if (len2 < 1) return false;
    for (let i = 0; i < n; i++) {
      const p = this.nearProps[i];
      if (p.id === ignoreId) continue;
      const t = ((p.x - ax) * dx + (p.z - az) * dz) / len2;
      if (t < 0.05 || t > 0.9) continue;
      const px = ax + dx * t;
      const pz = az + dz * t;
      const reach = (p.halfX > p.halfZ ? p.halfX : p.halfZ) + 1.4;
      if ((p.x - px) * (p.x - px) + (p.z - pz) * (p.z - pz) <= reach * reach) return true;
    }
    return false;
  }

  /**
   * Évalue la zone (x, z) pour un service, vue depuis (fromX, fromZ). `vehicleId` : engin de l'équipage (0 à pied) ;
   * `ignoreProp` : objet visé par l'intervention (une barricade en feu ne « barre » pas le chemin de ceux qui viennent l'éteindre).
   * L'objet retourné est réutilisé d'un appel à l'autre.
   */
  assess(kind: RescueKind, x: number, z: number, fromX: number, fromZ: number, vehicleId: EntityId = 0, ignoreProp: EntityId = 0): SafetyReport {
    const ctx = this.ctx;
    const t = this.tuning;
    const r = this.report;
    r.safe = true;
    r.reason = '';
    r.danger = 0;
    const prot = this.protectedAt(x, z, fromX, fromZ, vehicleId);
    r.protected = prot;

    // 1. motifs que la protection ne lève pas
    if (Math.hypot(x - fromX, z - fromZ) > 6 && this.barred(fromX, fromZ, x, z, ignoreProp)) {
      r.safe = false;
      r.reason = 'rue barrée par une barricade';
      r.danger = 0.5;
      return r;
    }
    if (kind === 'samu' && ctx.hazards.fireAt(x, z) > 0.2) {
      r.safe = false;
      r.reason = 'incendie en cours sur la zone';
      r.danger = 0.8;
      return r;
    }
    const gas = ctx.hazards.gasAt(x, z);
    if (gas > (kind === 'pompiers' ? t.unsafeGas + 0.25 : t.unsafeGas)) {
      r.safe = false;
      r.reason = 'nuage de gaz lacrymogène sur la zone';
      r.danger = 0.6;
      return r;
    }
    // 2. projectiles : tout près, même une protection ne suffit pas
    const close = this.threatsNear(x, z, 12, 6);
    const around = this.threatsNear(x, z, THREAT_RADIUS, THREAT_MEMORY);
    if (close >= 1 || (around >= 2 && !prot)) {
      r.safe = false;
      r.reason = 'zone non sécurisée : jets de projectiles';
      r.danger = 0.9;
      return r;
    }
    // 3. foule hostile et tension : levées par une protection
    const hostiles = this.hostilesNear(x, z, 22);
    const tension = ctx.director.tensionAt(x, z);
    let danger = tension;
    if (hostiles >= t.unsafeHostiles) danger = Math.max(danger, 0.6 + 0.04 * (hostiles > 10 ? 10 : hostiles));
    r.danger = danger > 1 ? 1 : danger;
    if (prot) return r;
    if (hostiles >= t.unsafeHostiles) {
      r.safe = false;
      r.reason = 'zone non sécurisée : foule hostile à proximité';
    } else if (tension >= t.unsafeTension) {
      r.safe = false;
      r.reason = 'zone non sécurisée : affrontements en cours';
    }
    return r;
  }
}
