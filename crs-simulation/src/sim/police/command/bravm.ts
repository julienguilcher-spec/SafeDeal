/* =====================================================================================
 * COMMANDEMENT — BRAV-M : binômes à moto (docs/research/06-roles-jouables.md §6, bible §E.8).
 *
 *   en route        les motos roulent en colonne (pilote automatique, convoi) ; à moins de 30 m de
 *                   piétons l'allure tombe à 20 km/h ; la colonne ne s'engage jamais dans une foule :
 *                   elle s'arrête 40 à 80 m avant l'objectif, plus loin si la foule déborde ;
 *   pied à terre    tous les opérateurs descendent dans le même pas ; les pilotes restent aux machines ;
 *   interception    progression à pied en colonne, constat du fait, interpellation par le binôme
 *                   (chaîne du module de police : maîtriser, menotter, escorter, remettre), retour aux
 *                   motos, remontée en selle, compte rendu ;
 *   retenue         aucun geste de force en selle, aucune interpellation sans fait constaté.
 * Sans pilote automatique (module des véhicules absent), le groupe met pied à terre et agit à pied.
 * ===================================================================================== */

import type { OrderType, Person, Squad, SquadOrder, Vehicle } from '@/core/contracts';
import type { CommandCore } from './core';
import { isProtester, notPolice } from './core';
import type { Picture } from './picture';
import { recentOffender } from './picture';
import { SpecialUnit, locate } from './special';
import { received, refused, report, spell } from './texts';

/** Distance à laquelle les opérateurs s'arrêtent avant l'objectif pour constater (m). */
const WATCH_DISTANCE = 12;
/** Rayon de recherche de l'auteur d'un fait autour du point désigné (m). */
const SEARCH_RADIUS = 32;
/** Durée maximale du constat sur place avant de renoncer (s). */
const WATCH_TIME = 25;

/** L'unité est-elle un groupe de BRAV-M (au moins un binôme subordonné doté d'une moto, ou binôme isolé) ? */
export function isBravmGroup(core: CommandCore, s: Squad): boolean {
  const ctx = core.ctx;
  const isMoto = (id: number): boolean => {
    const v = id !== 0 ? ctx.vehicles.get(id) : undefined;
    return !!v && v.kind === 'moto_bravm';
  };
  if (s.kind === 'binome') {
    // un binôme isolé, sans groupe au-dessus de lui
    return s.parentId === 0 && isMoto(s.vehicleId);
  }
  const kids = ctx.squads.childrenOf(s.id);
  for (let i = 0; i < kids.length; i++) if (kids[i].kind === 'binome' && isMoto(kids[i].vehicleId)) return true;
  return false;
}

export class BravmUnit extends SpecialUnit {
  private readonly motos: Vehicle[] = [];
  private readonly people: Person[] = [];
  private tx = 0;
  private tz = 0;
  private standX = 0;
  private standZ = 0;
  private slow = false;
  private convoyAt = -100;
  private clearSince = 0;
  private watchAt = 0;
  private arrestOk = false;
  private arrestReason = '';
  private arrested = 0;
  /** Ordre à exécuter une fois le pied à terre fait (manœuvre à pied laissée au module de police). */
  private after: SquadOrder | null = null;
  private handoverSet = false;
  private policeReported = false;

  constructor(core: CommandCore, pic: Picture, squad: Squad) {
    super(core, pic, squad, 'bravm');
    this.refresh();
    const m = this.motos[0];
    if (m) this.rememberHome(m.x, m.z);
  }

  alive(): boolean {
    return this.core.members(this.squad.id, this.people) > 0;
  }

  /** Relit les motos du groupe (dans l'ordre des binômes) et l'état général. */
  private refresh(): void {
    const core = this.core;
    core.fleet(this.squad.id, this.motos);
    for (let i = this.motos.length - 1; i >= 0; i--) if (this.motos[i].kind !== 'moto_bravm' || !core.usable(this.motos[i])) this.motos.splice(i, 1);
    const lead = this.motos[0];
    const st = this.status;
    st.vehicleId = lead ? lead.id : 0;
    if (lead) {
      st.x = lead.x;
      st.z = lead.z;
    }
  }

  /** Opérateurs (passagers) en selle. */
  private mountedOperators(): number {
    let n = 0;
    for (let i = 0; i < this.motos.length; i++) if (this.seated(this.motos[i], 'passenger')) n++;
    return n;
  }

  private pilots(): number {
    let n = 0;
    for (let i = 0; i < this.motos.length; i++) if (this.seated(this.motos[i], 'driver')) n++;
    return n;
  }

  /** Opérateurs à pied valides (dans this.people). */
  private footOperators(): number {
    const n = this.core.members(this.squad.id, this.people);
    let m = 0;
    for (let i = 0; i < n; i++) {
      const p = this.people[i];
      if (p.vehicleId === 0 && p.poste !== 'pilote_moto' && p.posture !== 'down' && p.custody === 'free') this.people[m++] = p;
    }
    this.people.length = m;
    return m;
  }

  // ───────────────────────────── ordres ─────────────────────────────

  claim(o: SquadOrder): boolean {
    this.refresh();
    const type = o.type;
    const mounted = this.mountedOperators() > 0;
    const stage = this.status.stage;
    const busyOnFoot = stage === 'approche' || stage === 'constat' || stage === 'interpellation' || stage === 'retour' || stage === 'remontee';
    if (type === 'interpeller' || type === 'avancer' || type === 'colonne' || type === 'repli' || type === 'embarquer' || type === 'debarquer') {
      this.begin(o);
      return true;
    }
    if (type === 'cesser') {
      if (busyOnFoot || !mounted) {
        // l'action est abandonnée : retour aux machines
        this.begin(o);
        return true;
      }
      this.stopMotos();
      this.order = null;
      this.status.order = '';
      this.setStage('repos');
      return true;
    }
    if (mounted && this.motos.length > 0) {
      // toute manœuvre à pied commence par le pied à terre ; l'ordre est ensuite rendu au module de police
      this.after = this.copy(o);
      this.order = this.copy(o);
      this.status.order = type;
      this.dismount();
      return true;
    }
    // à pied : c'est une unité comme une autre
    this.order = null;
    this.status.order = '';
    this.setStage('a_pied');
    return false;
  }

  private begin(o: SquadOrder): void {
    const core = this.core;
    this.order = this.copy(o);
    this.after = null;
    this.status.order = o.type;
    this.status.targetId = o.type === 'interpeller' && o.targetId > 0 ? o.targetId : 0;
    this.arrestOk = false;
    this.arrestReason = '';
    this.tx = o.x;
    this.tz = o.z;
    if (o.type === 'interpeller' && locate(core, o.targetId)) {
      this.tx = core.v2.x;
      this.tz = core.v2.z;
    }
    const mounted = this.mountedOperators() > 0;
    switch (o.type) {
      case 'interpeller':
        this.say(received(this.squad.name, 'interception de l’objectif' + (core.sector(this.tx, this.tz) !== '' ? ', ' + core.sector(this.tx, this.tz) : '') + ', pied à terre à distance'));
        if (mounted) this.ride(this.tx, this.tz, core.tuning.bravmStandoff);
        else this.approach();
        break;
      case 'avancer':
      case 'colonne':
      case 'repli':
        this.say(received(this.squad.name, o.type === 'repli' ? 'je me replie en colonne' : 'en colonne vers le point'));
        if (mounted) this.ride(this.tx, this.tz, 0);
        else this.backToMotos();
        break;
      case 'embarquer':
        if (mounted) this.complete(true, '');
        else this.backToMotos();
        break;
      case 'debarquer':
        if (mounted) this.dismount();
        else this.complete(true, '');
        break;
      default: // cesser
        this.backToMotos();
        break;
    }
  }

  // ───────────────────────────── à moto ─────────────────────────────

  /** Départ en colonne vers (x, z), arrêt `standoff` mètres avant (jamais dans une foule). */
  private ride(x: number, z: number, standoff: number): void {
    const core = this.core;
    const lead = this.motos[0];
    const ap = core.autopilot;
    if (!lead || !ap || this.pilots() === 0) {
      // pas de machine ou pas de pilote automatique : à pied
      this.dismount();
      return;
    }
    // point d'arrêt le long de l'itinéraire
    let sx = x;
    let sz = z;
    const path = core.path;
    if (core.ctx.world.findPath(lead.x, lead.z, x, z, 'vehicle', path) && path.length >= 4) {
      let total = 0;
      for (let i = 2; i + 1 < path.length; i += 2) total += Math.hypot(path[i] - path[i - 2], path[i + 1] - path[i - 1]);
      let back = standoff;
      for (let attempt = 0; attempt < 6; attempt++) {
        const at = total - back;
        if (at <= 4) {
          sx = lead.x;
          sz = lead.z;
          break;
        }
        this.pointOnPath(path, at);
        sx = core.v2.x;
        sz = core.v2.z;
        // la colonne ne s'arrête pas au milieu de la foule
        if (core.ctx.people.countIn(sx, sz, 22, isProtester) < 8) break;
        back += 20;
      }
    } else if (standoff > 0) {
      const d = Math.hypot(x - lead.x, z - lead.z);
      if (d > standoff + 4) {
        sx = x - ((x - lead.x) / d) * standoff;
        sz = z - ((z - lead.z) / d) * standoff;
      } else {
        sx = lead.x;
        sz = lead.z;
      }
    }
    this.standX = sx;
    this.standZ = sz;
    this.slow = false;
    if (Math.hypot(sx - lead.x, sz - lead.z) < 8) {
      this.arrived();
      return;
    }
    if (!this.convoy(core.tuning.bravmSpeed)) {
      this.dismount();
      return;
    }
    this.setStage('route');
  }

  private pointOnPath(path: readonly number[], s: number): void {
    const v = this.core.v2;
    let acc = 0;
    for (let i = 2; i + 1 < path.length; i += 2) {
      const len = Math.hypot(path[i] - path[i - 2], path[i + 1] - path[i - 1]);
      if (s <= acc + len) {
        const t = len > 1e-6 ? (s - acc) / len : 0;
        v.x = path[i - 2] + (path[i] - path[i - 2]) * t;
        v.z = path[i - 1] + (path[i + 1] - path[i - 1]) * t;
        return;
      }
      acc += len;
    }
    v.x = path[path.length - 2];
    v.z = path[path.length - 1];
  }

  private convoy(speed: number): boolean {
    const ap = this.core.autopilot;
    if (!ap) return false;
    this.convoyAt = this.core.now;
    return ap.convoy(this.motos, this.standX, this.standZ, { gap: 3.5, speed });
  }

  private stopMotos(): void {
    const ap = this.core.autopilot;
    if (!ap) return;
    for (let i = 0; i < this.motos.length; i++) ap.stop(this.motos[i]);
  }

  private thinkRide(): void {
    const core = this.core;
    const ap = core.autopilot;
    const lead = this.motos[0];
    if (!ap || !lead) {
      this.dismount();
      return;
    }
    const now = core.now;
    // retenue : 20 km/h à moins de 30 m de piétons
    const ahead = 12;
    const px = lead.x + Math.sin(lead.heading) * ahead;
    const pz = lead.z + Math.cos(lead.heading) * ahead;
    const near = core.ctx.people.countIn(px, pz, 30, notPolice) > 0;
    if (near) {
      this.clearSince = now;
      if (!this.slow && now - this.convoyAt > 1) {
        this.slow = true;
        this.convoy(core.tuning.bravmSlow);
      }
    } else if (this.slow && now - this.clearSince > 3 && now - this.convoyAt > 2) {
      this.slow = false;
      this.convoy(core.tuning.bravmSpeed);
    }
    const st = ap.status(lead);
    const d = Math.hypot(this.standX - lead.x, this.standZ - lead.z);
    const stopped = Math.abs(lead.speed) < 0.4;
    if ((st.state === 'arrive' || st.mode === 'idle' || d < 6) && stopped) {
      this.arrived();
    } else if (st.state === 'echec' || (st.state === 'bloque' && st.blockedFor > 12) || this.sinceStage() > 240) {
      // route coupée ou foule en travers : on termine à pied, sans forcer le passage
      this.stopMotos();
      this.arrived();
    }
  }

  /** La colonne est arrivée : fin d'un déplacement, ou pied à terre pour l'interception. */
  private arrived(): void {
    const o = this.order;
    this.stopMotos();
    if (!o || o.type === 'avancer' || o.type === 'colonne' || o.type === 'repli') {
      this.say(report(this.superior(), this.squad.name, 'En position, ' + spell(this.motos.length) + (this.motos.length > 1 ? ' motos' : ' moto')));
      this.complete(true, '');
      return;
    }
    this.setStage('arret');
  }

  // ───────────────────────────── pied à terre ─────────────────────────────

  /** Tous les opérateurs descendent dans le même pas (les pilotes gardent les machines). */
  private dismount(): void {
    const core = this.core;
    const ctx = core.ctx;
    let n = 0;
    for (let i = 0; i < this.motos.length; i++) {
      const v = this.motos[i];
      const op = this.seated(v, 'passenger');
      if (op && !op.isPlayer && ctx.vehicles.exit(op)) n++;
    }
    const lead = this.motos[0];
    if (lead) {
      this.standX = lead.x;
      this.standZ = lead.z;
    }
    this.emitStage('pied_a_terre', true, String(n));
    this.setStage('pied_a_terre');
  }

  private afterDismount(): void {
    const o = this.order;
    if (this.after) {
      // manœuvre à pied : rendue au module de police
      const a = this.after;
      this.after = null;
      this.order = null;
      this.status.order = '';
      this.setStage('a_pied');
      this.internal({ type: a.type, x: a.x, z: a.z, heading: a.heading, width: a.width, targetId: a.targetId, maxForce: a.maxForce, issuedBy: a.issuedBy });
      return;
    }
    if (!o || o.type === 'debarquer') {
      this.say(report(this.superior(), this.squad.name, 'Pied à terre, ' + spell(this.footOperators()) + ' à pied'));
      this.complete(true, '');
      this.setStage('a_pied');
      return;
    }
    if (o.type === 'interpeller') {
      this.approach();
      return;
    }
    // déplacement demandé sans machines disponibles : colonne à pied
    this.internal({ type: 'colonne', x: this.tx, z: this.tz, issuedBy: o.issuedBy });
    this.order = null;
    this.status.order = '';
    this.setStage('a_pied');
  }

  // ───────────────────────────── interception à pied ─────────────────────────────

  private approach(): void {
    const o = this.order;
    if (this.footOperators() === 0) {
      this.complete(false, 'Aucun opérateur disponible.');
      return;
    }
    // point de regroupement pour la remise, aux machines, si rien n'existe à proximité
    this.ensureHandover();
    const fx = this.people[0].x;
    const fz = this.people[0].z;
    const d = Math.hypot(this.tx - fx, this.tz - fz);
    let ax = this.tx;
    let az = this.tz;
    if (d > WATCH_DISTANCE + 2) {
      ax = this.tx - ((this.tx - fx) / d) * WATCH_DISTANCE;
      az = this.tz - ((this.tz - fz) / d) * WATCH_DISTANCE;
    } else {
      ax = fx;
      az = fz;
    }
    this.internal({ type: 'colonne', x: ax, z: az, width: 0, issuedBy: o ? o.issuedBy : 0 });
    this.setStage('approche');
  }

  private ensureHandover(): void {
    if (this.handoverSet) return;
    const h = this.core.handover();
    if (!h || !Array.isArray(h.points)) return;
    for (let i = 0; i < h.points.length; i++) if (Math.hypot(h.points[i].x - this.standX, h.points[i].z - this.standZ) < 300) return;
    const fleet = this.core.vehicles;
    // un fourgon de l'échelon supérieur à portée fait l'affaire : sinon, point de regroupement aux machines
    const top = this.squad.parentId !== 0 ? this.squad.parentId : this.squad.id;
    this.core.fleet(top, fleet);
    for (let i = 0; i < fleet.length; i++) if (fleet[i].kind !== 'moto_bravm' && !fleet[i].def.flying && Math.hypot(fleet[i].x - this.standX, fleet[i].z - this.standZ) < 300) return;
    const lead = this.motos[0];
    // deux mètres à côté de la colonne, hors de la chaussée des machines
    const hx = lead ? Math.cos(lead.heading) : 1;
    const hz = lead ? -Math.sin(lead.heading) : 0;
    const v = this.core.v2;
    v.x = this.standX + hx * 3;
    v.z = this.standZ + hz * 3;
    this.core.ctx.world.resolveCircle(v, 0.6);
    h.points.push({ x: v.x, z: v.z, name: 'point de regroupement ' + this.squad.name });
    this.handoverSet = true;
  }

  /** Auteur d'un fait constaté près de l'objectif (la cible désignée d'abord). */
  private findOffender(): Person | null {
    const core = this.core;
    const ctx = core.ctx;
    const o = this.order;
    const named = o && o.targetId > 0 ? ctx.people.get(o.targetId) : undefined;
    if (named && named.faction !== 'police' && named.custody === 'free') {
      this.tx = named.x;
      this.tz = named.z;
      if (ctx.law.canArrest(named)) return named;
    }
    const n = ctx.people.queryRadius(this.tx, this.tz, SEARCH_RADIUS, core.people, notPolice);
    let best: Person | null = null;
    let bestD = Infinity;
    for (let i = 0; i < n; i++) {
      const p = core.people[i];
      if (p.custody !== 'free' || !recentOffender(p, core.now, 180) || !ctx.law.canArrest(p)) continue;
      const d = (p.x - this.tx) * (p.x - this.tx) + (p.z - this.tz) * (p.z - this.tz);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return best;
  }

  private thinkWatch(): void {
    const core = this.core;
    if (core.now < this.watchAt) return;
    this.watchAt = core.now + 1;
    const target = this.findOffender();
    if (target) {
      // pas au milieu d'un groupe compact : le binôme serait isolé
      const around = core.ctx.people.countIn(target.x, target.z, 6, isProtester);
      if (around <= 14) {
        this.status.targetId = target.id;
        this.internal({ type: 'interpeller', targetId: target.id, x: target.x, z: target.z, maxForce: 2, issuedBy: this.order ? this.order.issuedBy : 0 });
        this.setStage('interpellation');
        return;
      }
    }
    if (this.sinceStage() > WATCH_TIME) {
      this.arrestOk = false;
      this.arrestReason = target ? 'Objectif au milieu d’un groupe compact : interpellation non tentée.' : 'Aucun fait constaté : aucune interpellation.';
      this.say(refused(this.squad.name, this.arrestReason.replace(/\.$/, '') + ', je regagne les machines'));
      this.backToMotos();
    }
  }

  private backToMotos(): void {
    if (this.motos.length === 0 || this.footOperators() === 0) {
      this.remountDone();
      return;
    }
    this.internal({ type: 'colonne', x: this.standX, z: this.standZ, width: 0, issuedBy: this.order ? this.order.issuedBy : 0 });
    this.setStage('retour');
  }

  private remount(): void {
    this.internal({ type: 'embarquer', issuedBy: this.order ? this.order.issuedBy : 0 });
    this.setStage('remontee');
  }

  private remountDone(): void {
    const o = this.order;
    this.emitStage('en_selle', true, '');
    if (!o) {
      this.setStage('repos');
      return;
    }
    if (o.type === 'interpeller') {
      const body = this.arrestOk
        ? spell(1) + ' interpellé sur fait constaté, remis au point de regroupement. En selle, disponible'
        : 'Interception sans interpellation. En selle, disponible';
      this.say(report(this.superior(), this.squad.name, body));
      this.complete(this.arrestOk, this.arrestReason);
      return;
    }
    if ((o.type === 'avancer' || o.type === 'colonne' || o.type === 'repli') && this.mountedOperators() > 0) {
      this.ride(o.x, o.z, 0);
      return;
    }
    this.complete(true, '');
  }

  private complete(ok: boolean, reason: string): void {
    const o = this.order;
    if (o && o.type === 'interpeller' && this.policeReported) {
      // le module de police a déjà rendu compte de l'interpellation ('police:order_done') : seule la fin de
      // l'intervention de l'unité (retour en selle) reste à signaler
      this.order = null;
      this.status.order = '';
      this.emitStage('termine', ok, reason);
    } else {
      this.finish(ok, reason);
    }
    this.policeReported = false;
    this.setStage(this.mountedOperators() > 0 || this.motos.length === 0 ? 'repos' : 'a_pied');
  }

  override onPoliceDone(type: OrderType, ok: boolean, reason: string): void {
    const stage = this.status.stage;
    if (stage === 'approche' && type === 'colonne') {
      this.watchAt = 0;
      this.setStage('constat');
    } else if (stage === 'interpellation' && type === 'interpeller') {
      this.policeReported = true;
      this.arrestOk = ok;
      this.arrestReason = ok ? '' : reason;
      if (ok) this.arrested++;
      this.backToMotos();
    } else if (stage === 'retour' && type === 'colonne') {
      this.remount();
    } else if (stage === 'remontee' && type === 'embarquer') {
      this.remountDone();
    }
  }

  // ───────────────────────────── réflexion ─────────────────────────────

  think(): void {
    this.refresh();
    const stage = this.status.stage;
    switch (stage) {
      case 'route':
        this.thinkRide();
        break;
      case 'arret':
        // machines à l'arrêt : pied à terre simultané
        if (this.sinceStage() >= 0.5) this.dismount();
        break;
      case 'pied_a_terre':
        if (this.sinceStage() >= 1) this.afterDismount();
        break;
      case 'approche':
        if (this.sinceStage() > 120) {
          this.watchAt = 0;
          this.setStage('constat');
        }
        break;
      case 'constat':
        this.thinkWatch();
        break;
      case 'interpellation':
        if (this.sinceStage() > 200) {
          this.arrestOk = false;
          this.arrestReason = 'Interpellation non aboutie.';
          this.backToMotos();
        }
        break;
      case 'retour':
        if (this.sinceStage() > 150) this.remount();
        break;
      case 'remontee':
        if (this.sinceStage() > 100) this.remountDone();
        break;
      default:
        break;
    }
  }

  /** Nombre d'interpellations abouties depuis le début. */
  get arrests(): number {
    return this.arrested;
  }
}
