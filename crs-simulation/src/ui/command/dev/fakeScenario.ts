/* =====================================================================================
 * BANC D'ESSAI — scène factice pour les cartes et le commandement : une compagnie (4 sections de
 * 3 groupes), ses véhicules et ses moyens spéciaux, 300 manifestants en cortège sur un parcours,
 * des incidents, des rues fermées, des stations de métro, du gaz et des feux. Une « IA » minimale
 * fait exécuter les ordres (déplacement en ligne droite, mise en formation, compte rendu radio)
 * pour que l'on voie l'ordre partir, s'afficher puis s'effacer. Rien de ceci n'est livré avec le jeu.
 * ===================================================================================== */

import type {
  CrowdPhase, CrowdStats, DirectorApi, GameContext, GameSystem, Person, PlayableRole, PolicePoste, PoliceRank, Squad,
  SquadOrder, Vehicle, VehicleKind,
} from '@/core/contracts';
import { SystemOrder } from '@/core/contracts';
import { EXT } from '@/core/extensions';
import type { IncidentKind, ObjectivesApi } from '@/core/extensions';
import { pointOnPolyline, polylineLength } from '@/core/math';
import { orderLabel, slotsAlongLine, splitLine, spreadPoint } from '../orders';
import type { OrderGeom } from '../orders';
import { FakeHazardField, FakeIncidents, FakeMetro, FakeRescue, FakeTraffic } from './fakeServices';

export interface FakeScenarioOptions {
  role: PlayableRole;
  crowd: number;
  /** Services étendus à simuler (false = service absent, pour vérifier la dégradation propre). */
  incidents: boolean;
  traffic: boolean;
  metro: boolean;
  rescue: boolean;
  hazards: boolean;
  /** Le joueur est à bord d'un véhicule (zoom de la mini-carte). */
  vehicle: boolean;
}

const ALPHA = ['ALFA', 'BRAVO', 'CHARLIE'];
const GROUP_SIZES = [6, 6, 3];

interface Marcher { p: Person; s: number; lat: number }
interface UnitBrain { issuedAt: number; targets: number[]; reported: boolean; ackAt: number; cascaded: boolean }

export class FakeScenario {
  readonly system: GameSystem;
  readonly incidents: FakeIncidents;
  readonly traffic: FakeTraffic;
  readonly metro: FakeMetro;
  readonly rescue: FakeRescue;
  readonly hazards: FakeHazardField;
  route: number[] = [];
  routeLength = 0;
  head = 0;
  tension = 0.42;
  phase: CrowdPhase = 'cortege';
  company: Squad | null = null;
  sections: Squad[] = [];
  groups: Squad[][] = [];
  specials: Record<string, Squad> = {};
  playerVehicle: Vehicle | null = null;
  /** Vitesse du cortège (m/s) ; 0 pour figer la scène (captures). */
  marchSpeed = 0.45;
  /** false : les unités ne bougent pas toutes seules (captures reproductibles). */
  aiEnabled = true;

  private ctx!: GameContext;
  private readonly marchers: Marcher[] = [];
  private readonly brains = new Map<number, UnitBrain>();
  private readonly stats: CrowdStats = { total: 0, present: 0, dispersed: 0, radicals: 0, injured: 0, arrested: 0 };
  private cascading = false;
  private nextIncidentAt = 50;
  private readonly pt = { x: 0, z: 0 };
  private readonly geoms: OrderGeom[] = [];

  constructor(readonly options: FakeScenarioOptions) {
    const self = this;
    // les services factices reçoivent le contexte dans provide()
    this.incidents = null as unknown as FakeIncidents;
    this.traffic = null as unknown as FakeTraffic;
    this.metro = null as unknown as FakeMetro;
    this.rescue = null as unknown as FakeRescue;
    this.hazards = null as unknown as FakeHazardField;
    this.system = {
      id: 'banc:scenario',
      order: SystemOrder.RULES,
      provide(ctx: GameContext): void {
        self.ctx = ctx;
        const w = self as { -readonly [K in keyof FakeScenario]: FakeScenario[K] };
        w.incidents = new FakeIncidents(ctx);
        w.traffic = new FakeTraffic(ctx);
        w.metro = new FakeMetro(ctx);
        w.rescue = new FakeRescue(ctx);
        w.hazards = new FakeHazardField(ctx);
        if (options.incidents) ctx.provide(EXT.incidents, self.incidents);
        if (options.traffic) ctx.provide(EXT.traffic, self.traffic);
        if (options.metro) ctx.provide(EXT.metro, self.metro);
        if (options.rescue) ctx.provide(EXT.rescue, self.rescue);
        if (options.hazards) ctx.provide('hazards.field', self.hazards);
        self.rescue.onArrive = (call) => {
          if (call.incidentId !== 0) self.incidents.startRescueWork(call.incidentId);
        };
        const director: DirectorApi = {
          get phase(): CrowdPhase {
            return self.phase;
          },
          get tension(): number {
            return self.tension;
          },
          tensionAt: (x, z) => self.tensionAt(x, z),
          addTension(amount): void {
            self.tension = Math.max(0, Math.min(1, self.tension + amount));
          },
          stats: self.stats,
          get route(): readonly number[] {
            return self.route;
          },
          get headProgress(): number {
            return self.head;
          },
        };
        ctx.director = director;
      },
      init(ctx: GameContext): void {
        ctx.events.on('session:started', ({ config }) => self.populate(config.x ?? 0, config.z ?? 0));
        ctx.events.on('order:issued', ({ squadId, order }) => self.onOrder(squadId, order));
      },
      update(dt: number): void {
        self.update(dt);
      },
    };
  }

  // ───────────────────────────── tension ─────────────────────────────

  tensionAt(x: number, z: number): number {
    if (this.route.length < 4) return this.tension;
    pointOnPolyline(this.route, this.head, this.pt);
    const d = Math.hypot(x - this.pt.x, z - this.pt.z);
    // la tête du cortège est le point chaud ; l'arrière reste calme
    return Math.max(0, Math.min(1, this.tension * 0.55 + 0.6 * Math.exp(-(d * d) / (2 * 45 * 45))));
  }

  // ───────────────────────────── peuplement ─────────────────────────────

  private snap(x: number, z: number, out: { x: number; z: number; heading: number }): void {
    const sample = { edgeId: -1, x: 0, z: 0, heading: 0, dist: 0, width: 0, name: '', roadClass: 'residential' as const, oneway: false };
    if (this.ctx.world.nearestRoad(x, z, sample, 80)) {
      out.x = sample.x;
      out.z = sample.z;
      out.heading = sample.heading;
    } else {
      out.x = x;
      out.z = z;
      out.heading = 0;
    }
  }

  private buildRoute(cx: number, cz: number): void {
    const world = this.ctx.world;
    // à Paris depuis la République : boulevard du Temple puis Filles-du-Calvaire ; ailleurs : 600 m vers le sud-est
    const paris = Math.hypot(cx - 3133, cz + 211) < 120;
    const way = paris ? [cx, cz, 3261, 92, 3330, 264, 3382, 470, 3420, 640] : [cx, cz, cx + 150, cz + 260, cx + 260, cz + 560];
    const route: number[] = [];
    const leg: number[] = [];
    for (let i = 0; i + 3 < way.length; i += 2) {
      const ok = world.findPath(way[i]!, way[i + 1]!, way[i + 2]!, way[i + 3]!, 'foot', leg);
      if (ok && leg.length >= 4) {
        for (let k = route.length > 0 ? 2 : 0; k < leg.length; k++) route.push(leg[k]!);
      } else {
        if (route.length === 0) route.push(way[i]!, way[i + 1]!);
        route.push(way[i + 2]!, way[i + 3]!);
      }
    }
    this.route = route;
    this.routeLength = polylineLength(route);
    this.head = Math.min(this.routeLength - 40, 300);
  }

  /** Point du parcours à l'abscisse s, décalé latéralement (droite du sens de marche = côté positif). */
  private along(s: number, lat: number, out: { x: number; z: number; heading: number }): void {
    const h = pointOnPolyline(this.route, Math.max(0, Math.min(this.routeLength, s)), this.pt);
    out.x = this.pt.x - Math.cos(h) * lat;
    out.z = this.pt.z + Math.sin(h) * lat;
    out.heading = h;
  }

  private agent(squad: Squad, x: number, z: number, heading: number, name: string, rank: PoliceRank, poste: PolicePoste, kind: Person['kind'] = 'crs'): Person {
    const p = this.ctx.people.spawn({ kind, faction: 'police', x, z, heading, name, rank, poste, squadId: squad.id, seed: squad.id * 31 + squad.members.length });
    if (poste === 'lanceur') p.inventory.push({ id: 'grenade_lacrymo', count: 6, state: 1, cooldown: 0 }, { id: 'lanceur_cougar', count: 8, state: 1, cooldown: 0 });
    if (poste === 'lbd') p.inventory.push({ id: 'lbd40', count: 5, state: 1, cooldown: 0 });
    return p;
  }

  private crew(name: string, kind: VehicleKind, x: number, z: number, heading: number, parent: Squad, personKind: Person['kind'], n: number, squadKind: Squad['kind'] = 'equipage'): Squad {
    const ctx = this.ctx;
    const squad = ctx.squads.create(squadKind, 'police', name, parent.id);
    const v = ctx.vehicles.spawn(kind, x, z, heading, { faction: 'police' });
    squad.vehicleId = v.id;
    for (let i = 0; i < n; i++) this.agent(squad, x + 2 + i * 0.8, z + 2, heading, `${name} ${i + 1}`, i === 0 ? 'brigadier_chef' : 'gardien', i === 0 ? 'conducteur' : 'operateur', personKind);
    this.specials[name] = squad;
    return squad;
  }

  populate(cx: number, cz: number): void {
    const ctx = this.ctx;
    const o = this.options;
    this.marchers.length = 0;
    this.brains.clear();
    this.sections = [];
    this.groups = [];
    this.specials = {};
    this.incidents.clear();
    this.traffic.clear();
    this.rescue.clear();
    this.hazards.clear();
    this.buildRoute(cx, cz);
    const P = { x: 0, z: 0, heading: 0 };
    const rng = ctx.rng.fork('banc');

    // ── cortège ──
    const n = o.crowd;
    for (let i = 0; i < n; i++) {
      const front = i < n * 0.12;
      const s = Math.max(2, this.head - (front ? rng.range(0, 18) : rng.range(8, 210)));
      const lat = rng.range(-7, 7) * (front ? 0.8 : 1);
      this.along(s, lat, P);
      const p = ctx.people.spawn({
        kind: 'manifestant', faction: 'protest', x: P.x, z: P.z, heading: P.heading, profile: front && i % 3 === 0 ? 'radical' : 'pacifique',
        name: `Manifestant ${i + 1}`, seed: 1000 + i,
      });
      this.marchers.push({ p, s, lat });
    }
    this.stats.total = this.stats.present = n;
    this.stats.radicals = Math.round(n * 0.04);

    // ── compagnie ──
    const company = (this.company = ctx.squads.create('compagnie', 'police', 'MISTRAL'));
    this.along(this.head + 235, -4, P);
    const commandant = this.agent(company, P.x, P.z, P.heading + Math.PI, 'Commandant Leroy', 'commandant', 'commandant_unite');
    this.agent(company, P.x + 1.2, P.z + 0.6, P.heading + Math.PI, 'Capitaine Morel', 'capitaine', 'chef_section');
    ctx.squads.setLeader(company.id, commandant.id);

    // emplacements des quatre sections : barrage devant la tête, deux flancs, une réserve
    const posts: { s: number; lat: number; line: boolean }[] = [
      { s: this.head + 85, lat: 0, line: true }, { s: this.head + 30, lat: -55, line: false },
      { s: this.head + 20, lat: 60, line: false }, { s: this.head + 205, lat: 3, line: false },
    ];
    for (let si = 0; si < 4; si++) {
      const section = ctx.squads.create('section', 'police', `MISTRAL ${si + 1}`, company.id);
      this.sections.push(section);
      const post = posts[si]!;
      this.along(post.s, post.lat, P);
      if (!post.line && Math.abs(post.lat) > 20) this.snap(P.x, P.z, P);
      const facing = P.heading + Math.PI; // face au cortège qui arrive
      const bx = P.x, bz = P.z;
      const chief = this.agent(section, bx - Math.sin(facing) * 6, bz - Math.cos(facing) * 6, facing, `Major ${['Dubois', 'Lambert', 'Garnier', 'Faure'][si]}`, 'major', 'chef_section');
      ctx.squads.setLeader(section.id, chief.id);
      const groups: Squad[] = [];
      for (let gi = 0; gi < 3; gi++) {
        const group = ctx.squads.create('groupe', 'police', `MISTRAL ${si + 1} ${ALPHA[gi]}`, section.id);
        groups.push(group);
        const size = GROUP_SIZES[gi]!;
        // les groupes A et B côte à côte sur la ligne, le groupe C trois mètres derrière
        const lateral = gi === 0 ? -4.2 : gi === 1 ? 4.2 : 0;
        const back = gi === 2 ? 5 : 0;
        const gx = bx + -Math.cos(facing) * lateral - Math.sin(facing) * back;
        const gz = bz + Math.sin(facing) * lateral - Math.cos(facing) * back;
        for (let k = 0; k < size; k++) {
          const off = (k - (size - 1) / 2) * 0.9;
          const poste: PolicePoste = k === 0 ? 'chef_groupe' : gi === 0 && k === size - 1 ? 'lanceur' : gi === 1 && k === size - 1 ? 'lbd' : 'bouclier';
          const p = this.agent(group, gx + -Math.cos(facing) * off, gz + Math.sin(facing) * off, facing, `${group.name} ${k + 1}`, k === 0 ? 'brigadier_chef' : 'gardien', poste);
          if (k === 0) ctx.squads.setLeader(group.id, p.id);
        }
        if (post.line && gi < 2) {
          this.cascading = true;
          ctx.squads.issue(group.id, { type: 'ligne', x: gx, z: gz, heading: facing, width: (size - 1) * 0.9 + 1 });
          this.cascading = false;
        }
      }
      this.groups.push(groups);
    }
    // quelques blessés pour l'état des unités
    const hurt = ctx.people.get(this.groups[2]![0]!.members[3]!);
    if (hurt) {
      hurt.injury = 'serious';
      hurt.health = 35;
    }
    this.groups[2]![0]!.morale = 0.55;

    // ── véhicules et moyens spéciaux ──
    for (let i = 0; i < 4; i++) {
      this.along(this.head + 222 + i * 8, 7.5, P);
      ctx.vehicles.spawn('fourgon_crs', P.x, P.z, P.heading, { faction: 'police' });
    }
    this.along(this.head + 118, -3, P);
    this.crew('NEPTUNE 1', 'canon_eau', P.x, P.z, P.heading + Math.PI, company, 'crs', 2);
    this.along(this.head + 150, 4, P);
    this.crew('CENTAURE 1', 'centaure', P.x, P.z, P.heading + Math.PI, company, 'gendarme', 3);
    this.along(this.head + 60, 78, P);
    this.snap(P.x, P.z, P);
    this.crew('FAUCON 1', 'moto_bravm', P.x, P.z, P.heading, company, 'bravm', 4, 'binome');
    this.along(this.head - 10, 0, P);
    const drone = this.crew('ICARE', 'drone', P.x, P.z, 0, company, 'telepilote', 1);
    const pilot = ctx.people.get(drone.members[0]!);
    if (pilot) {
      pilot.x = commandant.x + 3;
      pilot.z = commandant.z + 2;
    }
    // autorité civile
    const authority = ctx.squads.create('binome', 'police', 'AUTORITÉ 2');
    this.along(this.head + 100, 3, P);
    const commissaire = ctx.people.spawn({
      kind: 'commissaire', faction: 'police', x: P.x, z: P.z, heading: P.heading + Math.PI, name: 'Commissaire Renaud', rank: 'commissaire',
      poste: 'autorite_civile', squadId: authority.id, look: { sash: true },
    });
    this.agent(authority, P.x + 1, P.z + 1, P.heading + Math.PI, 'Brigadier Petit', 'brigadier_chef', 'interpellation');
    ctx.squads.setLeader(authority.id, commissaire.id);

    // ── circulation, métro, gaz, incidents, objectifs ──
    this.metro.populate(cx, cz, 750);
    this.along(this.head + 95, 0, P);
    this.traffic.closeRoad(P.x, P.z, 0, this.sections[0]!.id);
    this.along(this.head + 30, -70, P);
    this.traffic.closeRoad(P.x, P.z, 0);
    this.along(this.head + 14, 3, P);
    this.hazards.addCloud(P.x, P.z, 13, 0.75);
    this.along(this.head + 26, -6, P);
    this.hazards.addCloud(P.x, P.z, 9, 0.5);
    const openAt = (kind: IncidentKind, s: number, lat: number, urgency: 1 | 2 | 3, snap = false): void => {
      this.along(s, lat, P);
      if (snap) this.snap(P.x, P.z, P);
      if (kind.startsWith('feu')) this.hazards.addFire(P.x, P.z, kind === 'feu_vehicule' ? 4 : 2.2, 0.8);
      if (kind === 'feu_vehicule') this.hazards.addCloud(P.x + 3, P.z - 2, 8, 0.6, true);
      let targetId = 0;
      let targetKind: 'place' | 'person' | 'prop' = 'place';
      if (kind === 'suspect') {
        const m = this.marchers[2];
        if (m) {
          ctx.law.recordOffense(m.p, 'jet_projectile', m.p.x, m.p.z, 3);
          targetId = m.p.id;
          targetKind = 'person';
          P.x = m.p.x;
          P.z = m.p.z;
        }
      } else if (kind === 'barricade') {
        targetId = ctx.props.spawn('barricade', P.x, P.z, P.heading + Math.PI / 2).id;
        targetKind = 'prop';
      }
      this.incidents.open(kind, P.x, P.z, targetKind, targetId, urgency);
    };
    openAt('feu_poubelle', this.head + 22, 9, 1);
    openAt('blesse', this.head - 26, -5, 2);
    openAt('feu_vehicule', this.head + 44, -8, 3);
    openAt('pillage', this.head - 40, 62, 2, true);
    openAt('barricade', this.head + 58, 1, 1);
    openAt('suspect', this.head, 0, 2);
    const objectives = ctx.service<ObjectivesApi>(EXT.objectives);
    if (objectives) {
      this.along(this.head + 85, 0, P);
      objectives.set([
        { id: 'barrage', text: 'Tenir le barrage du boulevard', state: 'actif', secondary: false, x: P.x, z: P.z, progress: 0.4 },
        { id: 'secours', text: 'Garder un couloir pour les secours', state: 'actif', secondary: true },
      ]);
      objectives.tracked = 'barrage';
    }
    ctx.env.setWind(2.6, 1.4);
    this.nextIncidentAt = ctx.clock.now + 55;
    this.possess(commandant, commissaire);
  }

  /** Incarne la personne qui correspond au rôle demandé. */
  private possess(commandant: Person, commissaire: Person): void {
    const ctx = this.ctx;
    const role = this.options.role;
    let p: Person | undefined;
    const g2a = this.groups[1]![0]!;
    switch (role) {
      case 'commandant': p = commandant; break;
      case 'commissaire': p = commissaire; break;
      case 'chef_groupe': p = ctx.people.get(g2a.leaderId); break;
      case 'crs': p = ctx.people.get(g2a.members[2]!); break;
      case 'operateur_canon_eau': p = ctx.people.get(this.specials['NEPTUNE 1']!.members[1]!); break;
      case 'gendarme_centaure': p = ctx.people.get(this.specials['CENTAURE 1']!.members[0]!); break;
      case 'bravm': p = ctx.people.get(this.specials['FAUCON 1']!.members[0]!); break;
      case 'telepilote': p = ctx.people.get(this.specials['ICARE']!.members[0]!); break;
      case 'manifestant': p = this.marchers[Math.floor(this.marchers.length * 0.4)]?.p; break;
      case 'journaliste': {
        const m = this.marchers[5];
        p = ctx.people.spawn({ kind: 'journaliste', faction: 'press', x: (m ? m.p.x : 0) + 6, z: (m ? m.p.z : 0) + 4, name: 'Camille Verdier' });
        break;
      }
      case 'street_medic': {
        const m = this.marchers[40];
        p = ctx.people.spawn({ kind: 'street_medic', faction: 'medic', x: (m ? m.p.x : 0) + 3, z: (m ? m.p.z : 0) + 2, name: 'Secouriste de rue' });
        break;
      }
      case 'secouriste': {
        const squad = ctx.squads.create('secours', 'rescue', 'POMPIERS 2');
        const at = { x: 0, z: 0, heading: 0 };
        this.along(this.head + 190, -6, at);
        const v = ctx.vehicles.spawn('camion_pompiers', at.x, at.z, at.heading, { faction: 'rescue' });
        squad.vehicleId = v.id;
        p = ctx.people.spawn({ kind: 'pompier', faction: 'rescue', x: at.x + 3, z: at.z + 2, name: 'Sergent Blanc', squadId: squad.id });
        break;
      }
      default: p = commandant;
    }
    if (!p) return;
    ctx.player.possess(p.id, role);
    const st = ctx.player.state;
    st.camYaw = p.heading;
    st.aimX = p.x + Math.sin(p.heading) * 28;
    st.aimZ = p.z + Math.cos(p.heading) * 28;
    // un rôle d'exécution reçoit un incident à traiter lui-même
    if (role === 'operateur_canon_eau' || role === 'secouriste') {
      const inc = this.incidents.list.find((i) => i.kind === (role === 'secouriste' ? 'feu_vehicule' : 'feu_poubelle'));
      if (inc) this.incidents.assign(inc.id, 'joueur');
    }
    if (this.options.vehicle) {
      const v = ctx.vehicles.spawn('voiture_police', p.x + 2, p.z, p.heading, { faction: 'police' });
      // véhicule de service du joueur : rattaché à une petite unité pour ne pas figurer deux fois sur la carte
      if (ctx.vehicles.enter(p, v, 'driver')) this.playerVehicle = v;
    }
  }

  // ───────────────────────────── exécution des ordres ─────────────────────────────

  private onOrder(squadId: number, order: SquadOrder): void {
    const ctx = this.ctx;
    const squad = ctx.squads.get(squadId);
    if (!squad || squad.faction !== 'police') return;
    const cascaded = this.cascading;
    this.brains.set(squadId, { issuedAt: order.issuedAt, targets: [], reported: cascaded || order.targetId < 0, ackAt: cascaded || order.targetId < 0 ? -1 : ctx.clock.now + 1.2, cascaded });
    // une unité qui a des subordonnées répartit l'ordre entre elles (ce que fera le module des unités)
    const kids = ctx.squads.childrenOf(squadId).filter((k) => k.members.length > 0 && k.kind !== 'equipage' && k.vehicleId === 0);
    if (kids.length === 0 || this.cascading) return;
    this.cascading = true;
    try {
      const geom: OrderGeom = { x: order.x, z: order.z, heading: order.heading, width: order.width };
      const pos = kids.map((k) => {
        const l = ctx.people.get(k.leaderId);
        return { x: l ? l.x : order.x, z: l ? l.z : order.z };
      });
      const idx = slotsAlongLine(geom, pos);
      const ordered = idx.map((i) => kids[i]!);
      if ((order.type === 'ligne' || order.type === 'tenir') && order.width > 0) splitLine(geom, ordered.map((k) => k.members.length), this.geoms);
      else if (order.type === 'encercler' || order.type === 'disperser_gaz' || order.type === 'interpeller') {
        this.geoms.length = 0;
        for (let i = 0; i < ordered.length; i++) this.geoms.push({ x: geom.x, z: geom.z, heading: geom.heading, width: geom.width });
      } else spreadPoint(order.x, order.z, order.heading, ordered.length, 9, this.geoms);
      for (let i = 0; i < ordered.length; i++) {
        const g = this.geoms[i]!;
        ctx.squads.issue(ordered[i]!.id, { type: order.type, x: g.x, z: g.z, heading: g.heading, width: g.width, targetId: order.targetId, maxForce: order.maxForce, issuedBy: order.issuedBy });
      }
    } finally {
      this.cascading = false;
    }
  }

  /** Positions visées par les membres d'une unité pour son ordre courant [x0, z0, …] (vide = sur place). */
  private formation(squad: Squad, out: number[]): void {
    out.length = 0;
    const o = squad.order;
    const n = squad.members.length;
    if (n === 0) return;
    const fx = Math.sin(o.heading), fz = Math.cos(o.heading);
    const rx = -fz, rz = fx;
    const type = o.type;
    if (type === 'libre' || type === 'cesser' || type === 'tortue' || type === 'embarquer' || type === 'debarquer' || type === 'suivre') return;
    if (type === 'encercler') {
      const r = Math.max(6, o.width * 0.5);
      for (let i = 0; i < n; i++) {
        const a = o.heading + 0.5 + ((Math.PI * 2 - 1) * (i + 0.5)) / n;
        out.push(o.x + Math.sin(a) * r, o.z + Math.cos(a) * r);
      }
      return;
    }
    if (type === 'ligne' || type === 'tenir' || type === 'refoulement' || type === 'bond_offensif' || type === 'charge') {
      // un rang : le chef trois mètres derrière le centre, les autres jointifs sur la ligne
      const rank = n - 1;
      const spacing = o.width > 0 && rank > 1 ? Math.min(1.6, o.width / (rank - 1)) : 0.9;
      out.push(o.x - fx * 3, o.z - fz * 3);
      for (let i = 0; i < rank; i++) {
        const k = (i - (rank - 1) / 2) * spacing;
        out.push(o.x + rx * k, o.z + rz * k);
      }
      return;
    }
    // colonne par deux
    for (let i = 0; i < n; i++) {
      const row = Math.floor(i / 2), col = i % 2 === 0 ? -0.45 : 0.45;
      out.push(o.x + rx * col - fx * row * 1.2, o.z + rz * col - fz * row * 1.2);
    }
  }

  private runUnits(dt: number): void {
    const ctx = this.ctx;
    const squads = ctx.squads.list;
    for (let i = 0; i < squads.length; i++) {
      const squad = squads[i]!;
      if (squad.faction !== 'police' || squad.members.length === 0) continue;
      let brain = this.brains.get(squad.id);
      if (!brain || brain.issuedAt !== squad.order.issuedAt) {
        brain = { issuedAt: squad.order.issuedAt, targets: [], reported: true, ackAt: -1, cascaded: true };
        this.brains.set(squad.id, brain);
      }
      if (brain.ackAt > 0 && ctx.clock.now >= brain.ackAt) {
        brain.ackAt = -1;
        ctx.radio.say({ channel: 'unite', from: squad.name, priority: 0, text: `ICI ${squad.name}. REÇU, ${orderLabel(squad.order.type).toLowerCase()}. TERMINÉ.` });
      }
      const kids = ctx.squads.childrenOf(squad.id);
      if (kids.length > 0 && squad.kind !== 'groupe') {
        // section ou compagnie : pas de formation propre ; elle rend compte quand ses unités sont en place
        if (!brain.reported) {
          let ready = true;
          for (let k = 0; k < kids.length; k++) {
            const kid = kids[k]!;
            const l = ctx.people.get(kid.leaderId);
            if (kid.members.length === 0 || kid.kind === 'equipage' || kid.vehicleId !== 0 || !l) continue;
            if (kid.order.issuedAt !== squad.order.issuedAt || Math.hypot(l.x - kid.order.x, l.z - kid.order.z) > 6) ready = false;
          }
          if (ready) {
            brain.reported = true;
            ctx.radio.say({ channel: 'unite', from: squad.name, priority: 1, text: `MISTRAL ICI ${squad.name}. ${orderLabel(squad.order.type)} : en place. TERMINÉ.` });
          }
        }
        continue;
      }
      if (squad.vehicleId !== 0 && squad.kind === 'equipage') {
        this.runVehicle(squad, dt, brain);
        continue;
      }
      if (brain.targets.length === 0) this.formation(squad, brain.targets);
      const t = brain.targets;
      if (t.length === 0) continue;
      const speed = squad.order.type === 'charge' ? 4 : squad.order.type === 'bond_offensif' ? 2.6 : 2.1;
      let arrived = true;
      for (let k = 0; k < squad.members.length; k++) {
        const p = ctx.people.get(squad.members[k]!);
        if (!p || p.isPlayer || p.injury === 'serious') continue;
        const dx = t[k * 2]! - p.x, dz = t[k * 2 + 1]! - p.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.25) {
          const step = Math.min(d, speed * dt);
          p.x += (dx / d) * step;
          p.z += (dz / d) * step;
          p.heading = d > 1.5 ? Math.atan2(dx, dz) : squad.order.heading;
          if (d > 2.5) arrived = false;
        } else p.heading = squad.order.heading;
      }
      if (arrived && !brain.reported) {
        brain.reported = true;
        ctx.radio.say({ channel: 'unite', from: squad.name, priority: 1, text: `MISTRAL ICI ${squad.name}. ${orderLabel(squad.order.type)} : en place. TERMINÉ.` });
      }
    }
  }

  private runVehicle(squad: Squad, dt: number, brain: UnitBrain): void {
    const ctx = this.ctx;
    const v = ctx.vehicles.get(squad.vehicleId);
    const o = squad.order;
    if (!v || o.type === 'libre' || o.type === 'cesser' || o.type === 'tenir') return;
    const dx = o.x - v.x, dz = o.z - v.z;
    const d = Math.hypot(dx, dz);
    if (d > 4) {
      const step = Math.min(d, (v.kind === 'drone' ? 9 : 4) * dt);
      v.x += (dx / d) * step;
      v.z += (dz / d) * step;
      v.heading = Math.atan2(dx, dz);
      for (let k = 0; k < squad.members.length; k++) {
        const p = ctx.people.get(squad.members[k]!);
        if (p && v.kind !== 'drone' && !p.isPlayer) {
          p.x = v.x + 2 + k * 0.8;
          p.z = v.z + 2;
        }
      }
    } else if (!brain.reported) {
      brain.reported = true;
      ctx.radio.say({ channel: 'unite', from: squad.name, priority: 1, text: `MISTRAL ICI ${squad.name}. En position. TERMINÉ.` });
    }
  }

  // ───────────────────────────── boucle ─────────────────────────────

  private runPlayer(dt: number): void {
    const ctx = this.ctx;
    const st = ctx.player.state;
    const p = ctx.player.person();
    if (!p) return;
    const input = ctx.input;
    if (!ctx.ui.modal) {
      st.camYaw -= input.lookX;
      const fx = Math.sin(st.camYaw), fz = Math.cos(st.camYaw);
      const v = this.playerVehicle;
      if (v) {
        v.speed = input.moveY * 14;
        v.heading = st.camYaw;
        v.x += fx * v.speed * dt;
        v.z += fz * v.speed * dt;
        p.x = v.x;
        p.z = v.z;
      } else {
        const speed = input.down('sprint') ? 5.5 : 2.4;
        const mx = (fx * input.moveY + -fz * input.moveX) * speed;
        const mz = (fz * input.moveY + fx * input.moveX) * speed;
        p.x += mx * dt;
        p.z += mz * dt;
        p.vx = mx;
        p.vz = mz;
      }
      p.heading = st.camYaw;
      p.aimYaw = st.camYaw;
    }
    st.aimX = p.x + Math.sin(st.camYaw) * 28;
    st.aimZ = p.z + Math.cos(st.camYaw) * 28;
    const target = ctx.people.nearest(st.aimX, st.aimZ, 4, (q) => q.faction === 'protest');
    st.aimedPersonId = target ? target.id : 0;
  }

  update(dt: number): void {
    const ctx = this.ctx;
    if (this.route.length < 4) return;
    // le cortège avance
    if (this.marchSpeed > 0 && this.head < this.routeLength - 30) {
      const step = this.marchSpeed * dt;
      this.head += step;
      const P = { x: 0, z: 0, heading: 0 };
      for (let i = 0; i < this.marchers.length; i++) {
        const m = this.marchers[i]!;
        if (m.p.isPlayer || m.p.custody !== 'free') continue;
        m.s += step;
        this.along(m.s, m.lat, P);
        m.p.x = P.x;
        m.p.z = P.z;
        m.p.heading = P.heading;
      }
    }
    if (this.aiEnabled) this.runUnits(dt);
    this.runPlayer(dt);
    this.incidents.update(dt);
    this.metro.update(dt);
    this.rescue.update(dt);
    this.hazards.update(dt);
    // le drone suit la tête du cortège
    const drone = this.specials['ICARE'];
    const dv = drone ? ctx.vehicles.get(drone.vehicleId) : undefined;
    if (dv && drone!.order.type === 'libre') {
      pointOnPolyline(this.route, this.head, this.pt);
      dv.x = this.pt.x + 8;
      dv.z = this.pt.z - 6;
    }
    // un nouvel incident de temps en temps
    if (this.options.incidents && ctx.clock.now >= this.nextIncidentAt && this.incidents.list.length < 9) {
      this.nextIncidentAt = ctx.clock.now + 50;
      const kinds: IncidentKind[] = ['feu_poubelle', 'blesse', 'agent_isole', 'automobiliste_bloque', 'feu_barricade'];
      const rng = ctx.rng;
      const kind = kinds[rng.int(0, kinds.length)]!;
      const P = { x: 0, z: 0, heading: 0 };
      this.along(this.head + rng.range(-60, 50), rng.range(-30, 30), P);
      if (kind.startsWith('feu')) this.hazards.addFire(P.x, P.z, 2.2, 0.7);
      this.incidents.open(kind, P.x, P.z, 'place', 0, kind === 'agent_isole' ? 3 : kind === 'blesse' ? 2 : 1);
    }
  }
}
