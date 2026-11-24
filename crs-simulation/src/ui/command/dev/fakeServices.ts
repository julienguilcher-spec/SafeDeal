/* =====================================================================================
 * BANC D'ESSAI — petites implémentations locales des services étendus (incidents, circulation,
 * métro, secours) et du champ de gaz, conformes à src/core/extensions.ts. Elles ne font que ce
 * qu'il faut pour exercer l'interface : elles ne sont pas livrées avec le jeu.
 * ===================================================================================== */

import type { EntityId, EntityKind, GameContext, RoadSample } from '@/core/contracts';
import type {
  Incident, IncidentKind, IncidentMeans, IncidentsApi, MetroApi, MetroStation, RescueApi, RescueCall, RescueKind,
  RoadClosure, TrafficControlApi,
} from '@/core/extensions';
import { MEANS_FOR } from '../incidents';

// ───────────────────────────── incidents ─────────────────────────────

const INCIDENT_LABELS: Record<IncidentKind, string> = {
  feu_poubelle: 'Feu de poubelles', feu_barricade: 'Barricade en feu', feu_vehicule: 'Véhicule en feu', feu_boutique: 'Commerce en feu',
  blesse: 'Manifestant blessé', agent_a_terre: 'Agent à terre', agent_isole: 'Agent isolé', pillage: 'Pillage en cours',
  barricade: 'Barricade en travers', automobiliste_bloque: 'Automobiliste bloqué', secours_bloques: 'Secours bloqués', suspect: 'Auteur de jets identifié',
};

export class FakeIncidents implements IncidentsApi {
  readonly list: Incident[] = [];
  playerIncidentId = 0;
  private nextId = 1;

  constructor(private readonly ctx: GameContext) {}

  get(id: number): Incident | undefined {
    for (let i = 0; i < this.list.length; i++) if (this.list[i]!.id === id) return this.list[i];
    return undefined;
  }

  open(kind: IncidentKind, x: number, z: number, targetKind: EntityKind, targetId: EntityId, urgency: 1 | 2 | 3 = 1): Incident {
    const sector = this.ctx.world.sectorName(x, z);
    const inc: Incident = {
      id: this.nextId++, kind, label: `${INCIDENT_LABELS[kind]}${sector ? ', ' + sector : ''}`, x, z, targetKind, targetId, urgency,
      severity: 0.15 + 0.2 * urgency, state: 'ouvert', createdAt: this.ctx.clock.now, means: '', squadId: 0, progress: 0,
    };
    this.list.push(inc);
    this.ctx.radio.say({ channel: 'commandement', from: 'CENTRAL', priority: urgency >= 3 ? 2 : 1, text: `À TOUS ICI CENTRAL. ${inc.label}. ${urgency >= 3 ? 'URGENT.' : ''} TERMINÉ.` });
    return inc;
  }

  assign(id: number, means: IncidentMeans, squadId = 0): boolean {
    const inc = this.get(id);
    if (!inc || inc.state === 'resolu' || inc.state === 'echoue') return false;
    if (means === '' || (means !== 'joueur' && (MEANS_FOR[inc.kind] ?? []).indexOf(means) < 0)) return false;
    // une unité désignée doit exister et avoir des agents valides
    if (squadId !== 0) {
      const s = this.ctx.squads.get(squadId);
      if (!s || s.members.length === 0) return false;
    } else if (means === 'unite' || means === 'canon_eau' || means === 'centaure' || means === 'bravm') return false;
    inc.means = means;
    inc.squadId = squadId;
    inc.state = 'assigne';
    inc.progress = 0;
    if (means === 'joueur') this.playerIncidentId = id;
    return true;
  }

  unassign(id: number): void {
    const inc = this.get(id);
    if (!inc || inc.state === 'resolu' || inc.state === 'echoue') return;
    inc.means = '';
    inc.squadId = 0;
    inc.state = 'ouvert';
    inc.progress = 0;
    if (this.playerIncidentId === id) this.playerIncidentId = 0;
  }

  close(id: number, resolved: boolean, _byId: EntityId): void {
    const inc = this.get(id);
    if (!inc) return;
    inc.state = resolved ? 'resolu' : 'echoue';
    if (this.playerIncidentId === id) this.playerIncidentId = 0;
  }

  nearest(x: number, z: number, radius: number, kind?: IncidentKind): Incident | null {
    let best: Incident | null = null;
    let bestD = radius;
    for (let i = 0; i < this.list.length; i++) {
      const inc = this.list[i]!;
      if (inc.state !== 'ouvert' || (kind && inc.kind !== kind)) continue;
      const d = Math.hypot(inc.x - x, inc.z - z);
      if (d <= bestD) {
        bestD = d;
        best = inc;
      }
    }
    return best;
  }

  /** Aggravation des incidents non traités, traitement par l'unité arrivée sur place. */
  update(dt: number): void {
    const ctx = this.ctx;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const inc = this.list[i]!;
      if (inc.state === 'resolu' || inc.state === 'echoue') {
        if (ctx.clock.now - inc.createdAt > 5) this.list.splice(i, 1);
        continue;
      }
      if (inc.state === 'ouvert') {
        inc.severity = Math.min(1, inc.severity + dt * 0.006);
        continue;
      }
      const squad = inc.squadId !== 0 ? ctx.squads.get(inc.squadId) : undefined;
      const leader = squad && squad.leaderId !== 0 ? ctx.people.get(squad.leaderId) : undefined;
      const onSite = leader ? Math.hypot(leader.x - inc.x, leader.z - inc.z) < 12 : inc.means === 'pompiers' || inc.means === 'samu' ? inc.progress > 0 : false;
      if (squad && leader && !onSite && squad.order.targetId !== -inc.id) {
        // l'unité se rend sur place (l'ordre porte l'incident en « cible » négative : propre à ce banc)
        ctx.squads.issue(squad.id, { type: 'avancer', x: inc.x, z: inc.z, heading: Math.atan2(inc.x - leader.x, inc.z - leader.z), targetId: -inc.id });
      }
      if (onSite) {
        inc.state = 'en_cours';
        inc.progress = Math.min(1, inc.progress + dt / 9);
        inc.severity = Math.max(0, inc.severity - dt * 0.05);
        if (inc.progress >= 1) {
          inc.state = 'resolu';
          inc.createdAt = ctx.clock.now;
          if (this.playerIncidentId === inc.id) this.playerIncidentId = 0;
          const from = squad ? squad.name : inc.means === 'pompiers' ? 'POMPIERS 1' : 'SANTÉ 1';
          ctx.radio.say({ channel: 'unite', from, priority: 1, text: `CENTRAL ICI ${from.toUpperCase()}. ${inc.label} : traité. TERMINÉ.` });
        }
      }
    }
  }

  /** Les secours arrivés sur place commencent à traiter l'incident lié. */
  startRescueWork(incidentId: number): void {
    const inc = this.get(incidentId);
    if (inc && inc.state !== 'resolu' && inc.progress === 0) inc.progress = 0.01;
  }

  clear(): void {
    this.list.length = 0;
    this.playerIncidentId = 0;
    this.nextId = 1;
  }
}

// ───────────────────────────── circulation ─────────────────────────────

export class FakeTraffic implements TrafficControlApi {
  readonly closures: RoadClosure[] = [];
  private nextId = 1;
  private readonly sample: RoadSample = {
    edgeId: -1, x: 0, z: 0, heading: 0, dist: 0, width: 0, name: '', roadClass: 'residential', oneway: false,
  };

  constructor(private readonly ctx: GameContext) {}

  isClosed(edgeId: number): boolean {
    for (let i = 0; i < this.closures.length; i++) if (this.closures[i]!.edgeId === edgeId) return true;
    return false;
  }

  closeRoad(x: number, z: number, _byId: EntityId, squadId = 0): RoadClosure | null {
    if (!this.ctx.world.nearestRoad(x, z, this.sample, 60)) return null;
    const s = this.sample;
    for (let i = 0; i < this.closures.length; i++) {
      const c = this.closures[i]!;
      if (c.edgeId === s.edgeId) {
        if (squadId !== 0) c.squadId = squadId;
        return c;
      }
    }
    const c: RoadClosure = { id: this.nextId++, edgeId: s.edgeId, x: s.x, z: s.z, heading: s.heading, squadId, createdAt: this.ctx.clock.now };
    this.closures.push(c);
    return c;
  }

  closeArea(x: number, z: number, radius: number, byId: EntityId): RoadClosure[] {
    const out: RoadClosure[] = [];
    const seen = new Set<number>();
    // on parcourt le bord du périmètre : chaque rue qui le traverse est coupée à cet endroit
    const steps = Math.max(24, Math.round((Math.PI * 2 * radius) / 14));
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      const px = x + Math.cos(a) * radius, pz = z + Math.sin(a) * radius;
      if (!this.ctx.world.nearestRoad(px, pz, this.sample, 9)) continue;
      if (this.sample.roadClass === 'footway' || seen.has(this.sample.edgeId)) continue;
      // la rue doit traverser le bord, pas le longer
      const radial = Math.abs(Math.sin(this.sample.heading) * Math.cos(a) + Math.cos(this.sample.heading) * Math.sin(a));
      if (radial < 0.45) continue;
      seen.add(this.sample.edgeId);
      const before = this.closures.length;
      const c = this.closeRoad(this.sample.x, this.sample.z, byId);
      if (c && this.closures.length > before) out.push(c);
    }
    return out;
  }

  open(closureId: number): void {
    for (let i = 0; i < this.closures.length; i++) {
      if (this.closures[i]!.id === closureId) {
        this.closures.splice(i, 1);
        return;
      }
    }
  }

  openAll(): void {
    this.closures.length = 0;
  }

  countNear(x: number, z: number, radius: number): { moving: number; stopped: number } {
    // trafic factice : dépend du lieu et du nombre de rues coupées alentour
    let closed = 0;
    for (let i = 0; i < this.closures.length; i++) if (Math.hypot(this.closures[i]!.x - x, this.closures[i]!.z - z) < radius) closed++;
    const base = 14 + (Math.abs(Math.round(x / 50) * 7 + Math.round(z / 50) * 3) % 9);
    return { moving: Math.max(0, base - closed * 4), stopped: closed * 5 };
  }

  clear(): void {
    this.closures.length = 0;
    this.nextId = 1;
  }
}

// ───────────────────────────── métro ─────────────────────────────

export class FakeMetro implements MetroApi {
  readonly stations: MetroStation[] = [];

  constructor(private readonly ctx: GameContext) {}

  /** Peuple les stations à partir des lieux de type « station » autour d'un point. */
  populate(x: number, z: number, radius: number): void {
    this.stations.length = 0;
    const places = this.ctx.world.places;
    let id = 1;
    for (let i = 0; i < places.length; i++) {
      const p = places[i]!;
      if (p.kind !== 'station' || Math.hypot(p.x - x, p.z - z) > radius) continue;
      this.stations.push({
        id: id++, name: p.name, x: p.x, z: p.z, entrances: [p.x, p.z, p.x + 14, p.z + 6], open: true, filtered: false,
        inflow: 8 + ((i * 13) % 30), arrived: 40 + ((i * 37) % 260),
      });
    }
    if (this.stations.length === 0) {
      // monde sans lieux : deux stations factices pour exercer l'interface
      this.stations.push(
        { id: 1, name: 'Station Nord', x: x - 120, z: z - 90, entrances: [x - 120, z - 90], open: true, filtered: false, inflow: 22, arrived: 140 },
        { id: 2, name: 'Station Sud', x: x + 150, z: z + 110, entrances: [x + 150, z + 110], open: true, filtered: false, inflow: 12, arrived: 80 },
      );
    }
  }

  get(id: number): MetroStation | undefined {
    for (let i = 0; i < this.stations.length; i++) if (this.stations[i]!.id === id) return this.stations[i];
    return undefined;
  }

  nearest(x: number, z: number, radius: number): MetroStation | null {
    let best: MetroStation | null = null;
    let bestD = radius;
    for (let i = 0; i < this.stations.length; i++) {
      const d = Math.hypot(this.stations[i]!.x - x, this.stations[i]!.z - z);
      if (d <= bestD) {
        bestD = d;
        best = this.stations[i]!;
      }
    }
    return best;
  }

  setOpen(id: number, open: boolean, _byId: EntityId): void {
    const s = this.get(id);
    if (!s || s.open === open) return;
    s.open = open;
    if (!open) {
      // le flux se reporte sur la station ouverte la plus proche
      let near: MetroStation | null = null;
      let bestD = Infinity;
      for (let i = 0; i < this.stations.length; i++) {
        const o = this.stations[i]!;
        const d = Math.hypot(o.x - s.x, o.z - s.z);
        if (o !== s && o.open && d < bestD) {
          bestD = d;
          near = o;
        }
      }
      if (near) near.inflow += s.inflow * 0.7;
      s.inflow = 0;
      s.filtered = false;
    } else s.inflow = 14;
  }

  setFiltered(id: number, filtered: boolean, _squadId: number): void {
    const s = this.get(id);
    if (!s || !s.open || s.filtered === filtered) return;
    s.filtered = filtered;
    s.inflow = filtered ? s.inflow * 0.5 : s.inflow * 2;
  }

  update(dt: number): void {
    for (let i = 0; i < this.stations.length; i++) {
      const s = this.stations[i]!;
      if (s.open) s.arrived += (s.inflow * dt) / 60;
    }
    for (let i = 0; i < this.stations.length; i++) this.stations[i]!.arrived = Math.round(this.stations[i]!.arrived * 100) / 100;
  }
}

// ───────────────────────────── secours ─────────────────────────────

export class FakeRescue implements RescueApi {
  readonly calls: RescueCall[] = [];
  /** Appelé quand des secours arrivent sur place (incident lié ou 0). */
  onArrive: ((call: RescueCall) => void) | null = null;
  private nextId = 1;
  private readonly ages = new Map<number, number>();

  constructor(private readonly ctx: GameContext) {}

  request(kind: RescueKind, x: number, z: number, _byId: EntityId, incidentId = 0): RescueCall {
    const call: RescueCall = { id: this.nextId++, kind, x, z, incidentId, state: 'demande', eta: kind === 'pompiers' ? 75 : 95, vehicleId: 0, waitingReason: '' };
    this.calls.push(call);
    this.ages.set(call.id, 0);
    return call;
  }

  cancel(callId: number): void {
    for (let i = 0; i < this.calls.length; i++) if (this.calls[i]!.id === callId) this.calls[i]!.state = 'annule';
  }

  update(dt: number): void {
    const ctx = this.ctx;
    for (let i = this.calls.length - 1; i >= 0; i--) {
      const c = this.calls[i]!;
      const age = (this.ages.get(c.id) ?? 0) + dt;
      this.ages.set(c.id, age);
      if (c.state === 'annule' || c.state === 'reparti') {
        if (age > 400) this.calls.splice(i, 1);
        continue;
      }
      if (c.state === 'demande' && age > 4) {
        c.state = 'en_route';
        const from = c.kind === 'pompiers' ? 'POMPIERS 1' : 'SANTÉ 1';
        ctx.radio.say({ channel: 'secours', from, priority: 1, text: `CENTRAL ICI ${from}. En route, arrivée dans ${Math.round(c.eta / 60)} minutes. TERMINÉ.` });
      }
      if (c.state === 'en_route') {
        c.eta = Math.max(0, c.eta - dt);
        if (c.eta <= 18 && ctx.director.tensionAt(c.x, c.z) > 0.7) {
          c.state = 'en_attente';
          c.waitingReason = 'zone non sécurisée';
        } else if (c.eta <= 0) this.arrive(c);
      } else if (c.state === 'en_attente') {
        if (ctx.director.tensionAt(c.x, c.z) <= 0.7) {
          c.state = 'en_route';
          c.waitingReason = '';
        }
      } else if (c.state === 'sur_place' && age > 9999) c.state = 'reparti';
    }
  }

  private arrive(c: RescueCall): void {
    const ctx = this.ctx;
    c.state = 'sur_place';
    c.eta = 0;
    const v = ctx.vehicles.spawn(c.kind === 'pompiers' ? 'camion_pompiers' : 'ambulance', c.x + 9, c.z + 5, 0.6, { faction: 'rescue' });
    c.vehicleId = v.id;
    const squad = ctx.squads.create('secours', 'rescue', c.kind === 'pompiers' ? 'POMPIERS 1' : 'SANTÉ 1');
    squad.vehicleId = v.id;
    for (let k = 0; k < 3; k++) {
      const p = ctx.people.spawn({ kind: c.kind === 'pompiers' ? 'pompier' : 'samu', faction: 'rescue', x: c.x + 6 + k, z: c.z + 3, name: `${squad.name} ${k + 1}` });
      ctx.squads.addMember(squad.id, p.id);
    }
    this.onArrive?.(c);
  }

  clear(): void {
    this.calls.length = 0;
    this.ages.clear();
    this.nextId = 1;
  }
}

// ───────────────────────────── gaz et feux ─────────────────────────────

interface Cloud { x: number; z: number; radius: number; strength: number; smoke: boolean }

/** Champ de gaz factice (forme du service 'hazards.field') : quelques nuages ronds qui dérivent avec le vent. */
export class FakeHazardField {
  readonly cellSize = 2;
  readonly blockSize = 32;
  revision = 0;
  readonly fires: { id: number; x: number; z: number; radius: number; intensity: number; age: number; sourceId: number }[] = [];
  readonly clouds: Cloud[] = [];
  private acc = 0;

  constructor(private readonly ctx: GameContext) {}

  addCloud(x: number, z: number, radius: number, strength: number, smoke = false): void {
    this.clouds.push({ x, z, radius, strength, smoke });
    this.revision++;
  }

  addFire(x: number, z: number, radius: number, intensity: number): void {
    this.fires.push({ id: this.fires.length + 1, x, z, radius, intensity, age: 0, sourceId: 0 });
    this.revision++;
  }

  forEachActiveCell(cb: (x: number, z: number, gas: number, smoke: number, color: number) => void, minDensity = 0.01, cx = 0, cz = 0, radius = 0): number {
    let n = 0;
    const cell = this.cellSize;
    for (let i = 0; i < this.clouds.length; i++) {
      const c = this.clouds[i]!;
      if (radius > 0 && Math.hypot(c.x - cx, c.z - cz) > radius + c.radius) continue;
      const x0 = Math.floor((c.x - c.radius) / cell) * cell, x1 = c.x + c.radius;
      const z0 = Math.floor((c.z - c.radius) / cell) * cell, z1 = c.z + c.radius;
      for (let z = z0; z <= z1; z += cell) {
        for (let x = x0; x <= x1; x += cell) {
          const d = Math.hypot(x + cell / 2 - c.x, z + cell / 2 - c.z) / c.radius;
          if (d >= 1) continue;
          const v = c.strength * (1 - d * d);
          if (v < minDensity) continue;
          cb(x + cell / 2, z + cell / 2, c.smoke ? 0 : v, c.smoke ? v : 0, c.smoke ? 0x2a2a2e : 0);
          n++;
        }
      }
    }
    return n;
  }

  get driftX(): number {
    return this.ctx.env.state.windX * 0.8;
  }

  get driftZ(): number {
    return this.ctx.env.state.windZ * 0.8;
  }

  update(dt: number): void {
    const env = this.ctx.env.state;
    for (let i = this.clouds.length - 1; i >= 0; i--) {
      const c = this.clouds[i]!;
      c.x += env.windX * 0.25 * dt;
      c.z += env.windZ * 0.25 * dt;
      c.radius += dt * 0.12;
      c.strength -= dt * (c.smoke ? 0.002 : 0.006);
      if (c.strength <= 0.05) this.clouds.splice(i, 1);
    }
    for (let i = 0; i < this.fires.length; i++) this.fires[i]!.age += dt;
    this.acc += dt;
    if (this.acc > 0.5) {
      this.acc = 0;
      this.revision++;
    }
  }

  clear(): void {
    this.clouds.length = 0;
    this.fires.length = 0;
    this.revision++;
  }
}
