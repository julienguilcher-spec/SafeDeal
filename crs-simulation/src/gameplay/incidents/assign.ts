/* =====================================================================================
 * INCIDENTS — délégation : traduire « qui s'en charge » en action réelle, puis suivre l'avancement.
 *
 *   unité / canon à eau / Centaure / BRAV-M   ordre donné par ctx.squads.issue, d'après la nature de l'incident :
 *        feu → 'eteindre' · blessé, agent à terre → 'secourir' · pillage, suspect → 'interpeller' ·
 *        barricade → 'degager_barricade' · agent isolé, automobiliste, secours bloqués → 'proteger' ;
 *   pompiers / SAMU                            appel des secours (service EXT.rescue), lié à l'incident ;
 *   joueur                                     l'incident devient SA tâche (playerIncidentId), notée à la fin.
 *
 * assign() refuse (false) une unité inapte ou un moyen absent : un groupe sans extincteur ne peut pas
 * éteindre, un extincteur ne suffit pas pour un véhicule embrasé, pas de canon à eau sans engin lanceur
 * d'eau… Le suivi s'appuie sur ce qui se passe réellement : agents sur place, feu arrosé, victime
 * portée, compte rendu de fin de tâche du module de police ('police:order_done'), état de l'appel de
 * secours. Un contre-ordre donné à l'unité, une tâche abandonnée ou un moyen qui n'arrive pas
 * remettent l'incident à « ouvert ».
 * ===================================================================================== */

import type { EntityId, OrderType, Person, Squad, SquadOrder, Vehicle } from '@/core/contracts';
import { EXT } from '@/core/extensions';
import type { IncidentMeans, RescueApi, RescueCall } from '@/core/extensions';
import { INCIDENT_UPDATED_EVENT } from './api';
import type { PlayerDesk } from './dispatch';
import type { Entry } from './entry';
import type { Kernel } from './kernel';
import type { Sense } from './sense';
import {
  FAM_BARRICADE, FAM_FIRE, FAM_OFFICER, FAM_RESCUE, FAM_VICTIM, FIRE_STARTING, MEANS_ALLOWED, ON_SITE_RANGE, PLAYER_ON_SITE,
  RESCUE_WAIT_BEFORE_INCIDENT,
} from './tuning';

/** Ce que ce module lit du service étendu des secours (src/sim/roles/rescue) quand il est branché. */
interface RescueExtLike {
  squadOf(callId: number): number;
}

/** L'unité a dit avoir fini mais la cause persiste depuis ce temps (s) : l'incident est rouvert. */
const DONE_GRACE = 8;
/** Incident abstrait confié au joueur : traité après ce temps passé sur place (s). */
const ABSTRACT_ON_SITE = 8;

function isTaskOrder(type: string): boolean {
  return type === 'interpeller' || type === 'eteindre' || type === 'secourir' || type === 'ravitailler' || type === 'degager_barricade'
    || type === 'disperser_gaz';
}

function isUnitMeans(m: IncidentMeans): boolean {
  return m === 'unite' || m === 'canon_eau' || m === 'centaure' || m === 'bravm';
}

export class Assigner {
  desk!: PlayerDesk;
  /** Vrai pendant que ce module donne lui-même un ordre (pour ne pas le prendre pour un contre-ordre). */
  private issuing = false;
  private pollAt = 0;
  /** Appels de secours à l'arrêt : numéro → instant du début de l'attente. */
  private readonly waiting = new Map<number, number>();
  private readonly crew: Person[] = [];
  private readonly family: Squad[] = [];

  constructor(private readonly k: Kernel, private readonly sense: Sense) {
    k.onRelease = (e, resolved) => this.onClose(e, resolved);
  }

  init(): void {
    const k = this.k;
    const ev = k.ctx.events;
    ev.on('order:issued', (o) => {
      if (this.issuing) return;
      const entries = k.entries;
      for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        if (!e.active || e.squadId !== o.squadId || !isUnitMeans(e.means)) continue;
        const t = o.order.type;
        // un autre ordre de tâche, « cesser », ou tout nouvel ordre quand la tâche était une protection : contre-ordre
        if (t === 'cesser' || isTaskOrder(t) || !isTaskOrder(e.orderType)) this.reopen(e);
      }
    });
    ev.onAny('police:order_done', (payload) => {
      const d = payload as { squadId: number; type: string; ok: boolean } | null;
      if (!d) return;
      const entries = k.entries;
      for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        if (!e.active || e.squadId !== d.squadId || e.orderType !== d.type || !isUnitMeans(e.means)) continue;
        if (!isTaskOrder(d.type)) continue; // « dispositif en place » n'est pas la fin d'une protection
        if (d.ok) e.doneAt = k.now;
        else this.reopen(e); // l'unité a déjà dit pourquoi à la radio
      }
    });
  }

  reset(): void {
    this.pollAt = 0;
    this.waiting.clear();
    this.issuing = false;
  }

  // ───────────────────────────── affectation ─────────────────────────────

  assign(id: number, means: IncidentMeans, squadId: number): boolean {
    const k = this.k;
    const e = k.byId.get(id);
    if (!e || !e.active || means === '') return false;
    const ctx = k.ctx;
    let squad = squadId !== 0 ? ctx.squads.get(squadId) : undefined;
    if (squadId !== 0 && !squad) return false;
    // une équipe de secours désignée comme « unité » : c'est un appel aux secours
    if (squad && squad.faction === 'rescue' && isUnitMeans(means)) {
      means = this.rescueKindOf(squad);
      squad = undefined;
    }
    const allowed = MEANS_ALLOWED[e.kind];
    if (!allowed || allowed.indexOf(means) < 0) return false;
    switch (means) {
      case 'joueur': return this.assignPlayer(e, false);
      case 'pompiers':
      case 'samu':
        return this.assignRescue(e, means);
      default:
        return this.assignUnit(e, means, squad);
    }
  }

  private rescueKindOf(squad: Squad): IncidentMeans {
    const ctx = this.k.ctx;
    for (let i = 0; i < squad.members.length; i++) {
      const p = ctx.people.get(squad.members[i]);
      if (p && p.kind === 'samu') return 'samu';
    }
    return 'pompiers';
  }

  /** Confie l'incident au joueur. `byRadio` : attribué d'office par la salle (annonce radio). */
  assignPlayer(e: Entry, byRadio: boolean): boolean {
    const k = this.k;
    const ctx = k.ctx;
    const p = ctx.player.person();
    if (!p || ctx.health.isIncapacitated(p)) return false;
    if (k.playerIncidentId === e.id && e.means === 'joueur') return true;
    // une seule tâche à la fois : la précédente redevient un incident à confier
    if (k.playerIncidentId !== 0) {
      const prev = k.byId.get(k.playerIncidentId);
      if (prev && prev.active && prev !== e) this.reopen(prev);
    }
    const keepCall = e.callId;
    this.release(e, true, true);
    e.callId = keepCall; // l'appel de secours éventuellement pris par l'équipage du joueur reste lié
    this.setAssigned(e, 'joueur', p.squadId);
    k.playerIncidentId = e.id;
    this.desk.begin(e, p, byRadio);
    return true;
  }

  private assignRescue(e: Entry, kind: 'pompiers' | 'samu'): boolean {
    const k = this.k;
    const ctx = k.ctx;
    const rescue = ctx.service<RescueApi>(EXT.rescue);
    if (!rescue) return false; // moyen absent
    let call: RescueCall | null = null;
    const calls = rescue.calls;
    for (let i = 0; i < calls.length; i++) {
      const c = calls[i];
      if (c.incidentId === e.id && c.kind === kind && c.state !== 'reparti' && c.state !== 'annule') call = c;
    }
    if (!call) call = rescue.request(kind, e.x, e.z, ctx.player.state.personId, e.id);
    if (!call || call.state === 'annule') return false;
    // l'équipage du joueur a pris l'appel : l'incident lui a été confié pendant request()
    if (e.means === 'joueur' && k.playerIncidentId === e.id) {
      e.callId = call.id;
      return true;
    }
    if (e.callId !== call.id) this.release(e, true, false);
    e.callId = call.id;
    this.setAssigned(e, kind, this.squadOfCall(call.id));
    return true;
  }

  private squadOfCall(callId: number): number {
    const ext = this.k.ctx.service<RescueExtLike>('rescue.ext');
    return ext ? ext.squadOf(callId) : 0;
  }

  private assignUnit(e: Entry, means: IncidentMeans, given: Squad | undefined): boolean {
    const k = this.k;
    const ctx = k.ctx;
    // un extincteur ne suffit pas pour un véhicule embrasé ou une boutique en feu : seulement pour un départ de feu
    if (means === 'unite' && (e.kind === 'feu_vehicule' || e.kind === 'feu_boutique') && e.measure >= FIRE_STARTING) return false;
    const squad = given ?? this.findSquad(e, means);
    if (!squad || squad.faction !== 'police' || !this.apt(e, means, squad)) return false;
    const order = this.orderFor(e, squad);
    if (e.squadId !== squad.id || e.means !== means) this.release(e, true, true);
    this.issuing = true;
    try {
      ctx.squads.issue(squad.id, order);
    } finally {
      this.issuing = false;
    }
    e.orderType = order.type;
    e.orderAt = squad.order.type === order.type ? squad.order.issuedAt : k.now;
    e.doneAt = -1;
    this.setAssigned(e, means, squad.id);
    return true;
  }

  private setAssigned(e: Entry, means: IncidentMeans, squadId: number): void {
    const k = this.k;
    const now = k.now;
    e.means = means;
    e.squadId = squadId;
    e.state = 'assigne';
    e.progress = 0;
    e.assignedAt = now;
    e.goneFor = 0;
    const r = e.record;
    if (r.assignedAt < 0) r.assignedAt = now;
    r.assignments++;
    r.means = means;
    r.squadId = squadId;
    if (means === 'joueur') r.byPlayer = true;
    k.emit(INCIDENT_UPDATED_EVENT, e, 'assigne');
  }

  /** Ordre correspondant à la nature de l'incident (conventions de champs du module de police). */
  private orderFor(e: Entry, squad: Squad): Partial<SquadOrder> & { type: OrderType } {
    const ctx = this.k.ctx;
    const lead = squad.leaderId !== 0 ? ctx.people.get(squad.leaderId) : undefined;
    const heading = lead ? Math.atan2(e.x - lead.x, e.z - lead.z) : 0;
    const issuedBy = this.commanderId();
    let type: OrderType;
    let targetId: EntityId = 0;
    switch (e.family) {
      case FAM_FIRE:
        type = 'eteindre';
        // une boutique ou une nappe au sol se combat au point ; un objet ou un véhicule se désigne
        targetId = e.targetKind === 'prop' || e.targetKind === 'vehicle' ? e.targetId : 0;
        break;
      case FAM_VICTIM:
      case FAM_OFFICER:
        type = 'secourir';
        targetId = e.targetKind === 'person' ? e.targetId : 0;
        break;
      case FAM_BARRICADE:
        type = 'degager_barricade';
        targetId = e.targetKind === 'prop' ? e.targetId : 0;
        break;
      case FAM_RESCUE:
        // on tient la zone d'intervention pour que les secours puissent avancer
        type = 'proteger';
        break;
      default:
        if (e.kind === 'pillage' || e.kind === 'suspect') {
          type = 'interpeller';
          const s = e.kind === 'suspect' ? e.targetId : e.suspectId;
          const p = s !== 0 ? ctx.people.get(s) : undefined;
          if (p && p.custody === 'free' && (e.kind === 'suspect' || Math.hypot(p.x - e.x, p.z - e.z) < 30)) targetId = p.id;
        } else {
          type = 'proteger';
          targetId = e.targetKind === 'person' || e.targetKind === 'vehicle' ? e.targetId : 0;
        }
        break;
    }
    let x = e.x;
    let z = e.z;
    if (e.family === FAM_RESCUE) {
      // la zone à tenir est la destination de l'appel, pas l'endroit où les secours attendent
      const c = this.callById(e.members.length > 0 ? e.members[0].aux : 0);
      if (c) {
        x = c.x;
        z = c.z;
      }
    }
    return { type, x, z, heading, targetId, issuedBy };
  }

  /** Personne qui donne l'ordre : le joueur s'il commande, sinon la salle (0). */
  private commanderId(): EntityId {
    const st = this.k.ctx.player.state;
    return st.role === 'commandant' || st.role === 'commissaire' || st.role === 'chef_groupe' ? st.personId : 0;
  }

  // ───────────────────────────── aptitude des unités ─────────────────────────────

  /** Membres de l'unité et de ses subordonnées (dans this.crew) ; retourne leur nombre. */
  private collect(squad: Squad): number {
    const ctx = this.k.ctx;
    const out = this.crew;
    const stack = this.family;
    stack.length = 0;
    stack.push(squad);
    let n = 0;
    let guard = 0;
    while (stack.length > 0 && guard++ < 64) {
      const s = stack.pop()!;
      for (let i = 0; i < s.members.length; i++) {
        const p = ctx.people.get(s.members[i]);
        if (!p) continue;
        if (n < out.length) out[n] = p;
        else out.push(p);
        n++;
      }
      const children = ctx.squads.childrenOf(s.id);
      for (let i = 0; i < children.length; i++) stack.push(children[i]);
    }
    out.length = n;
    return n;
  }

  private vehicleOf(squad: Squad, n: number): Vehicle | undefined {
    const ctx = this.k.ctx;
    if (squad.vehicleId !== 0) {
      const v = ctx.vehicles.get(squad.vehicleId);
      if (v) return v;
    }
    for (let i = 0; i < n; i++) {
      const p = this.crew[i];
      if (p.vehicleId !== 0) {
        const v = ctx.vehicles.get(p.vehicleId);
        if (v) return v;
      }
    }
    return undefined;
  }

  /** L'unité peut-elle traiter cet incident avec ce moyen ? */
  private apt(e: Entry, means: IncidentMeans, squad: Squad): boolean {
    const ctx = this.k.ctx;
    const n = this.collect(squad);
    let valid = 0;
    for (let i = 0; i < n; i++) if (!ctx.health.isIncapacitated(this.crew[i]) && this.crew[i].custody === 'free') valid++;
    if (valid === 0) return false;
    switch (means) {
      case 'canon_eau': {
        const v = this.vehicleOf(squad, n);
        if (!v || v.state === 'wrecked' || v.state === 'burnt') return false;
        const turrets = v.def.turrets;
        for (let i = 0; i < turrets.length; i++) {
          if (turrets[i].kind === 'canon_eau' && (v.turretAmmo.length <= i || v.turretAmmo[i] > 0)) return true;
        }
        return false;
      }
      case 'centaure': {
        const v = this.vehicleOf(squad, n);
        return !!v && v.state !== 'wrecked' && v.state !== 'burnt' && (v.kind === 'centaure' || v.def.canPush);
      }
      case 'bravm': {
        for (let i = 0; i < n; i++) if (this.crew[i].kind === 'bravm') return true;
        const v = this.vehicleOf(squad, n);
        return !!v && v.kind === 'moto_bravm';
      }
      default:
        if (e.family === FAM_FIRE && ctx.actions.def('extincteur')) {
          // il faut un extincteur encore chargé dans l'unité
          for (let i = 0; i < n; i++) {
            const p = this.crew[i];
            if (ctx.health.isIncapacitated(p)) continue;
            const inv = p.inventory;
            for (let j = 0; j < inv.length; j++) if (inv[j].id === 'extincteur' && inv[j].count > 0) return true;
          }
          return false;
        }
        return true;
    }
  }

  /** Unité apte la plus proche, quand aucune n'est désignée. */
  private findSquad(e: Entry, means: IncidentMeans): Squad | undefined {
    const ctx = this.k.ctx;
    const squads = ctx.squads.list;
    let best: Squad | undefined;
    let bestD = Infinity;
    for (let i = 0; i < squads.length; i++) {
      const s = squads[i];
      if (s.faction !== 'police' || s.leaderId === 0) continue;
      const lead = ctx.people.get(s.leaderId);
      if (!lead) continue;
      const dx = lead.x - e.x;
      const dz = lead.z - e.z;
      const d = dx * dx + dz * dz;
      if (d >= bestD || !this.apt(e, means, s)) continue;
      bestD = d;
      best = s;
    }
    return best;
  }

  // ───────────────────────────── retrait et réouverture ─────────────────────────────

  unassign(id: number): void {
    const e = this.k.byId.get(id);
    if (!e || !e.active || e.means === '') return;
    this.release(e, true, true);
    this.clear(e);
    this.k.emit(INCIDENT_UPDATED_EVENT, e, 'rouvert');
  }

  /** L'affectation tombe (contre-ordre, échec, moyen disparu) : l'incident est de nouveau à confier. */
  reopen(e: Entry): void {
    if (!e.active || e.means === '') return;
    this.release(e, false, false);
    this.clear(e);
    this.k.emit(INCIDENT_UPDATED_EVENT, e, 'rouvert');
  }

  private clear(e: Entry): void {
    e.state = 'ouvert';
    e.means = '';
    e.squadId = 0;
    e.progress = 0;
    e.orderType = '';
    e.orderAt = -1;
    e.callId = 0;
    e.doneAt = -1;
    e.goneFor = 0;
  }

  /**
   * Défait l'affectation en cours. `stopUnit` : l'unité reçoit « cesser » si elle exécute encore l'ordre
   * de cet incident ; `cancelCall` : l'appel de secours est annulé.
   */
  private release(e: Entry, stopUnit: boolean, cancelCall: boolean): void {
    const k = this.k;
    const ctx = k.ctx;
    if (isUnitMeans(e.means) && stopUnit) {
      const s = ctx.squads.get(e.squadId);
      if (s && s.order.type === e.orderType && s.order.issuedAt === e.orderAt) {
        this.issuing = true;
        try {
          ctx.squads.issue(s.id, { type: 'cesser' });
        } finally {
          this.issuing = false;
        }
      }
    }
    if (e.callId !== 0 && cancelCall) {
      const rescue = ctx.service<RescueApi>(EXT.rescue);
      if (rescue) rescue.cancel(e.callId);
    }
    if (e.means === 'joueur') {
      if (k.playerIncidentId === e.id) k.playerIncidentId = 0;
      this.desk.end(e, false, true);
    }
  }

  /** Clôture de l'incident : un appel de secours qui n'est pas encore sur place n'a plus d'objet. */
  private onClose(e: Entry, _resolved: boolean): void {
    const k = this.k;
    if (e.callId !== 0) {
      const c = this.callById(e.callId);
      if (c && (c.state === 'demande' || c.state === 'en_route' || c.state === 'en_attente')) {
        const rescue = k.ctx.service<RescueApi>(EXT.rescue);
        if (rescue) rescue.cancel(c.id);
      }
    }
    if (k.playerIncidentId === e.id) k.playerIncidentId = 0;
  }

  /** Personne à créditer du traitement (chef de l'unité, joueur), 0 si inconnue. */
  actorOf(e: Entry): EntityId {
    const ctx = this.k.ctx;
    if (e.means === 'joueur') return ctx.player.state.personId;
    if (e.squadId !== 0) {
      const s = ctx.squads.get(e.squadId);
      if (s) return s.leaderId;
    }
    return 0;
  }

  // ───────────────────────────── suivi ─────────────────────────────

  private callById(id: number): RescueCall | null {
    if (id === 0) return null;
    const rescue = this.k.ctx.service<RescueApi>(EXT.rescue);
    if (!rescue) return null;
    const calls = rescue.calls;
    for (let i = 0; i < calls.length; i++) if (calls[i].id === id) return calls[i];
    return null;
  }

  /** Suivi d'un incident affecté : arrivée sur place, avancement, fin de tâche, moyen perdu. */
  track(e: Entry, dt: number, _treating: boolean): void {
    if (e.state === 'ouvert' || !e.active) return;
    const k = this.k;
    const ctx = k.ctx;
    const now = k.now;
    let onSite = false;
    if (e.means === 'joueur') {
      const p = ctx.player.person();
      if (!p) {
        this.reopen(e);
        return;
      }
      const d = Math.hypot(p.x - e.x, p.z - e.z);
      onSite = d <= PLAYER_ON_SITE;
      this.desk.track(e, d);
      if (!e.tracked && onSite) {
        e.goneFor += dt;
        if (e.goneFor >= ABSTRACT_ON_SITE) {
          k.close(e, true, p.id, 'traite');
          return;
        }
      }
    } else if (e.means === 'pompiers' || e.means === 'samu') {
      const c = this.callById(e.callId);
      if (!c || c.state === 'annule') {
        this.reopen(e);
        return;
      }
      if (c.state === 'reparti') {
        // les secours sont repartis : traité si l'incident était abstrait, sinon la cause persiste
        if (!e.tracked && e.record.startedAt >= 0) k.close(e, true, 0, 'traite');
        else this.reopen(e);
        return;
      }
      onSite = c.state === 'sur_place';
      const sq = this.squadOfCall(c.id);
      if (sq !== 0 && sq !== e.squadId) {
        e.squadId = sq;
        e.record.squadId = sq;
      }
    } else {
      const s = ctx.squads.get(e.squadId);
      if (!s || s.members.length === 0) {
        this.reopen(e);
        return;
      }
      onSite = this.sense.police(e.x, e.z, ON_SITE_RANGE) > 0;
      if (e.doneAt >= 0) {
        if (!e.tracked) {
          k.close(e, true, s.leaderId, 'traite');
          return;
        }
        if (now - e.doneAt > DONE_GRACE) {
          this.reopen(e); // tâche dite terminée, cause toujours là
          return;
        }
      }
    }
    if (e.state === 'assigne') {
      if (onSite) {
        e.state = 'en_cours';
        e.startedAt = now;
        if (e.record.startedAt < 0) e.record.startedAt = now;
        k.emit(INCIDENT_UPDATED_EVENT, e, 'en_cours');
      } else if (isUnitMeans(e.means) && now - e.assignedAt > k.tuning.assignTimeout) {
        this.reopen(e); // le moyen désigné n'est jamais arrivé
        return;
      }
    }
    if (e.state === 'en_cours') {
      if (onSite) e.touchedAt = now;
      let p = 0;
      const members = e.members;
      switch (e.family) {
        case FAM_FIRE:
          p = e.peakMeasure > 0 ? 1 - e.measure / e.peakMeasure : 0;
          break;
        case FAM_VICTIM:
        case FAM_OFFICER: {
          let done = 0;
          for (let i = 0; i < members.length; i++) {
            const m = members[i];
            if (m.gone) done += 1;
            else if (m.treatedAt >= 0) done += 0.5;
            else {
              const v = ctx.people.get(m.id);
              if (v && v.heldBy !== 0) done += 0.5;
            }
          }
          p = members.length > 0 ? done / members.length : 0;
          break;
        }
        case FAM_BARRICADE: {
          const m = members.length > 0 ? members[0] : null;
          p = m && m.auxPeak > 0 ? 1 - m.aux / m.auxPeak : 0;
          break;
        }
        default: {
          const t = (now - e.startedAt) / 30;
          p = t > 0.9 ? 0.9 : t;
          break;
        }
      }
      if (p > 0.98) p = 0.98; // 1 = clos
      if (p > e.progress) e.progress = p;
    }
  }

  // ───────────────────────────── secours : liaison et blocage ─────────────────────────────

  /**
   * Une fois par seconde : rattache aux incidents les appels de secours passés par d'autres (unité qui
   * demande le SAMU après une extraction, secouriste de rue), et ouvre un incident « secours bloqués »
   * pour tout équipage arrêté à distance.
   */
  pollRescue(): void {
    const k = this.k;
    const now = k.now;
    if (now < this.pollAt) return;
    this.pollAt = now + 1;
    const rescue = k.ctx.service<RescueApi>(EXT.rescue);
    if (!rescue) return;
    const calls = rescue.calls;
    for (let i = 0; i < calls.length; i++) {
      const c = calls[i];
      const live = c.state !== 'reparti' && c.state !== 'annule';
      if (live && c.incidentId !== 0) {
        const e = k.byId.get(c.incidentId);
        if (e && e.active && e.callId !== c.id && e.means !== 'joueur' && e.family !== FAM_RESCUE) {
          // l'unité qui a extrait la victime garde le mérite ; la suite appartient aux secours
          e.callId = c.id;
          e.orderType = '';
          e.orderAt = -1;
          e.doneAt = -1;
          this.setAssigned(e, c.kind, this.squadOfCall(c.id));
        }
      }
      if (c.state !== 'en_attente') {
        this.waiting.delete(c.id);
        continue;
      }
      let since = this.waiting.get(c.id);
      if (since === undefined) {
        since = now;
        this.waiting.set(c.id, since);
      }
      if (now - since < RESCUE_WAIT_BEFORE_INCIDENT || !k.tuning.detection) continue;
      let known = false;
      const entries = k.entries;
      for (let j = 0; j < entries.length && !known; j++) {
        const e = entries[j];
        if (e.active && e.family === FAM_RESCUE && e.members.length > 0 && e.members[0].aux === c.id) known = true;
      }
      if (known) continue;
      const v = c.vehicleId !== 0 ? k.ctx.vehicles.get(c.vehicleId) : undefined;
      const x = v ? v.x : c.x;
      const z = v ? v.z : c.z;
      const e = k.open('secours_bloques', x, z, v ? 'vehicle' : 'place', v ? v.id : 0, 0, false);
      if (e.members.length === 0) {
        k.addMember(e, 'place', 0, x, z);
        e.tracked = true;
      }
      e.members[0].aux = c.id;
    }
  }
}
