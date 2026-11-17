/* =====================================================================================
 * CARTE « MA MISSION » — ce que doit faire le joueur qui reçoit des ordres ou une tâche.
 *
 * Demande du commanditaire : « quand je suis un simple CRS, un stagiaire avec peu de responsabilité, j'ai juste besoin
 * des ordres que je dois recevoir, de qui je dois suivre et de la compagnie que je suis ; là, tous les ordres arrivent
 * d'un coup, on ne comprend pas grand-chose » ; puis : « quand je ne suis pas policier, ne me donne pas la radio de la
 * police, donne-moi celle des pompiers… avec ma mission précise et le lieu où aller ».
 *
 * Ce système (simulation pure) publie le service 'session.mission' (MissionBrief) lu par la carte du HUD :
 *   - unité (« Groupe MISTRAL 1 ALFA — Section MISTRAL 1 — Cie MISTRAL ») et chef à suivre (grade, nom, distance) ;
 *   - UNE consigne en mots simples (executant.ts : tâche d'incident > déplacement de la journée > « rejoignez votre
 *     groupe » > consigne sur place > objectif de mission > ordre du groupe > tâche du rôle > « suivez votre chef ») ;
 *   - le GPS : objectif 'consigne' sur la place du joueur dans la formation, son chef ou son véhicule, quand la consigne
 *     n'a pas déjà son objectif (journée, mission) ou son repère (incident confié) ;
 *   - un ordre nouveau du groupe : surlignage « Nouvel ordre » et UNE ligne radio du chef à son groupe (au plus une
 *     toutes les 12 s ; les ordres rapprochés sont fondus dans la dernière) ;
 *   - la radio du joueur (RadioControl.listen) : exécutant de police → son groupe, sa section, sa compagnie et les
 *     diffusions de CENTRAL ; secours → le réseau des secours ; civils → pas de radio de police ;
 *   - à pied, à plus de 40 m de son chef : rappel « Rejoignez votre groupe », GPS sur le chef.
 * Commandant, commissaire et chef de groupe n'ont ni carte ni filtre : ils donnent les ordres et entendent tout.
 * ===================================================================================== */

import type { GameContext, GameSystem, Person, RadioMessage, RoadSample, Squad, Vehicle } from '@/core/contracts';
import { SystemOrder } from '@/core/contracts';
import { EXT } from '@/core/extensions';
import type { IncidentsApi, Objective, ObjectivesApi } from '@/core/extensions';
import { pointOnPolyline } from '@/core/math';
import { ExecutantRadioFilter, listenForRole } from '@/gameplay/radio/relevance';
import type { ChannelListen, RadioScope } from '@/gameplay/radio/relevance';
import { JOURNEE_OBJECTIVE_ID, JOURNEE_SERVICE } from './journee';
import type { JourneeApi } from './journee';
import { ORDER_OBJECTIVE_ID, ORDERS_SERVICE, STANDBY_TEXT } from './orders';
import type { PlayerOrdersApi } from './orders';
import { chainLabel, chiefLabel, isExecutantRole, plainOrder, resolveInstruction, strayed } from './executant';
import type { Instruction, InstructionInputs, PlainOrder } from './executant';
import { MISSION_OBJECTIVE_ID, MISSION_SERVICE } from './mission-api';
import type { MissionBrief, MissionChief, MissionFamily } from './mission-api';

/** Vue minimale de la radio (RadioControl). */
interface ListenControl {
  listen: ((msg: RadioMessage) => boolean) | null;
}
interface SlotLike {
  slotOf(personId: number): { x: number; z: number } | null;
}

const THINK_PERIOD = 0.5;
/** Ligne radio du chef : au plus une toutes les … (s). */
const RELAY_GAP = 12;
/** Un ordre de même nature n'est « nouveau » que si son point a bougé de … m, au plus toutes les … s. */
const ORDER_MOVE = 40;
const ORDER_MIN_GAP = 20;
/** Ordres qui ne changent rien pour l'exécutant (pas de « Nouvel ordre » ni de radio). */
const QUIET_ORDERS: ReadonlySet<string> = new Set(['libre', 'suivre', 'cesser', 'ravitailler']);
/** Rappel « rejoignez votre groupe » : au plus un toutes les … (s). */
const REGROUP_NOTICE_GAP = 30;
/** Déplacement minimal du point de l'objectif avant de le republier (m). */
const OBJECTIVE_MOVE = 2.5;

const EMPTY: Instruction = { source: 'attente', title: '', detail: '', target: 'none' };

const RESCUE_TITLES: Readonly<Record<string, string>> = { pompier: 'Sapeur-pompier', samu: 'SAMU' };

/** Trajet de l'engin du joueur secouriste, lu sur le service « rescue.ext » (src/sim/roles/rescue/api.ts, PlayerRideView). */
const RESCUE_EXT = 'rescue.ext';
interface RescueRideLike {
  readonly playerRide: {
    readonly stage: string; readonly callsign: string; readonly vehicleId: number; readonly aiDriving: boolean; readonly leftBehind: boolean;
    readonly waitLeft: number; readonly destName: string; readonly remaining: number;
  } | null;
}

export class MissionBriefSystem implements GameSystem {
  readonly id = 'session.mission';
  readonly order = SystemOrder.CONTROL + 48;

  private ctx: GameContext | null = null;
  private nextThink = 0;
  private readonly filter = new ExecutantRadioFilter();
  private scope: RadioScope = { group: '', section: '', company: '', people: new Set(), self: 0 };
  private channels: ChannelListen | null = null;
  private listenFn: ((msg: RadioMessage) => boolean) | null = null;
  private road: RoadSample = { edgeId: -1, x: 0, z: 0, heading: 0, dist: 0, width: 0, name: '' } as RoadSample;

  // état publié
  private active = false;
  private family: MissionFamily = 'police';
  private heading = '';
  private chain = '';
  private chief: MissionChief | null = null;
  private instruction: Instruction = EMPTY;
  private seq = 0;
  private since = 0;
  private isOrder = false;
  private regroup = false;
  private radioHidden = 0;
  private radioLabel = '';
  private covered: string[] = [];
  private version = 0;

  // suivi des ordres
  private orderKey = '';
  private orderX = 0;
  private orderZ = 0;
  private orderAt = -1e9;
  private lastRelay = -1e9;
  private pendingRelay: { squadId: number; text: string } | null = null;
  private lastTitle = '';
  private regroupNoticeAt = -1e9;
  private objKey = '';

  provide(ctx: GameContext): void {
    const self = this;
    ctx.provide(MISSION_SERVICE, {
      get active() { return self.active; },
      get family() { return self.family; },
      get heading() { return self.heading; },
      get chain() { return self.chain; },
      get chief() { return self.chief; },
      get instruction() { return self.instruction; },
      get seq() { return self.seq; },
      get since() { return self.since; },
      get isOrder() { return self.isOrder; },
      get regroup() { return self.regroup; },
      get radioHidden() { return self.radioHidden; },
      get radioLabel() { return self.radioLabel; },
      get covered() { return self.covered; },
      get version() { return self.version; },
    } satisfies MissionBrief);
  }

  init(ctx: GameContext): void {
    this.ctx = ctx;
  }

  reset(): void {
    this.nextThink = 0;
    this.filter.reset();
    this.active = false;
    this.chief = null;
    this.instruction = EMPTY;
    this.seq = 0;
    this.since = 0;
    this.isOrder = false;
    this.regroup = false;
    this.radioHidden = 0;
    this.covered = [];
    this.orderKey = '';
    this.orderAt = -1e9;
    this.lastRelay = -1e9;
    this.pendingRelay = null;
    this.lastTitle = '';
    this.regroupNoticeAt = -1e9;
    this.objKey = '';
    this.chain = '';
    this.heading = '';
    this.version++;
    this.setListen(false);
  }

  dispose(): void {
    this.setListen(false);
  }

  update(_dt: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.clock.now;
    if (now < this.nextThink) return;
    this.nextThink = now + THINK_PERIOD;
    const me = ctx.player.person();
    const role = ctx.session.config?.role ?? ctx.player.state.role;
    const police = isExecutantRole(role);
    const listen = police ? null : listenForRole(role);
    if (!me || me.custody !== 'free' || (!police && !listen)) {
      if (this.active) this.deactivate();
      this.setListen(false);
      return;
    }
    this.active = true;
    this.family = police ? 'police' : role === 'secouriste' ? 'secours' : 'civil';
    this.channels = listen;
    this.setListen(true);
    this.radioHidden = this.filter.hiddenRecent(now);
    if (police) this.thinkPolice(me, now);
    else this.thinkCivil(me, role, now);
    this.flushRelay(now);
    this.version++;
  }

  // ───────────────────────────── police exécutante ─────────────────────────────

  private thinkPolice(me: Person, now: number): void {
    const ctx = this.ctx!;
    const group = me.squadId !== 0 ? ctx.squads.get(me.squadId) : undefined;
    const section = group && group.parentId !== 0 ? ctx.squads.get(group.parentId) : undefined;
    const company = this.rootOf(group);
    const sectionName = section && section !== company ? section.name : '';
    const role = ctx.session.config?.role ?? 'crs';
    this.heading = `${role === 'crs' ? 'CRS' : this.roleTitle(role)}${me.rank ? ' — ' + chiefLabel(me.rank, '').trim() : ''}`;
    this.chain = chainLabel({ group: group?.name, section: sectionName, company: company && company !== group ? company.name : '', unitKind: this.unitWord(group) });
    this.radioLabel = 'Radio : votre groupe, votre section, votre compagnie et CENTRAL';
    // portée radio
    const people = this.scope.people as Set<number>;
    people.clear();
    if (group) for (const id of group.members) people.add(id);
    this.scope.group = group?.name ?? '';
    this.scope.section = sectionName;
    this.scope.company = company && company !== group ? company.name : '';
    this.scope.self = me.id;

    // chef à suivre : le chef du groupe, ou (si c'est le joueur) celui de l'échelon au-dessus
    const chief = this.chiefOf(me, group, section);
    if (chief) people.add(chief.id);
    this.chief = chief;

    const journee = ctx.service<JourneeApi>(JOURNEE_SERVICE);
    const inputs: InstructionInputs = {};
    inputs.incident = this.incidentInput(null);
    inputs.journee = this.journeeInput(me, group, journee);
    // rappel : à pied, hors déplacement commandé, trop loin du chef
    const onFoot = me.vehicleId === 0;
    const travelling = !!journee && journee.travelling;
    const away = !!chief && onFoot && !travelling && strayed(chief.distance, this.regroup);
    if (away && !this.regroup && now - this.regroupNoticeAt > REGROUP_NOTICE_GAP) {
      this.regroupNoticeAt = now;
      ctx.ui.notify(`Rejoignez votre groupe : votre chef est à ${Math.round(chief!.distance)} m`, 'info', 5);
    }
    this.regroup = away;
    inputs.regroup = away ? { chief: chief!.label, x: chief!.x, z: chief!.z, distance: chief!.distance } : null;
    inputs.mission = this.missionInput();
    // ordre : celui du groupe (CRS) ; pour un équipier d'engin, de la BRAV-M ou le télépilote, le poste donné par
    // la chaîne de commandement (session.orders)
    let order: (PlainOrder & { x?: number; z?: number }) | null = null;
    const given = ctx.service<PlayerOrdersApi>(ORDERS_SERVICE)?.current ?? null;
    if (role === 'crs' && group && group.leaderId !== me.id) {
      order = this.groupOrder(me, group);
      this.watchOrder(group, order, travelling, now);
    } else if (given) {
      // en place : stand-by explicite (la même phrase que la liste des objectifs) ; tir désigné : zone, gisement, distance
      order = { title: given.arrived && !given.fire ? STANDBY_TEXT : given.text,
        detail: given.detail || (given.arrived ? 'Tenez la position, surveillez la foule et rendez compte de ce que vous voyez.'
          : 'Rendez-vous au point indiqué, puis rendez compte « en place ».'), radio: '', target: 'place', x: given.x, z: given.z };
      this.watchGiven(given.text, now);
    }
    inputs.order = order;
    inputs.chief = chief ? { label: chief.label, x: chief.x, z: chief.z } : null;
    this.apply(resolveInstruction(inputs), now);
  }

  /** Mot de l'unité de base selon sa nature (« Groupe », « Équipage », « Binôme »). */
  private unitWord(s: Squad | undefined): string {
    if (!s) return 'Groupe';
    switch (s.kind) {
      case 'equipage': return 'Équipage';
      case 'binome': return 'Binôme';
      case 'section': return 'Section';
      case 'peloton': return 'Peloton';
      case 'compagnie': return 'Compagnie';
      default: return 'Groupe';
    }
  }

  private roleTitle(role: string): string {
    switch (role) {
      case 'bravm': return 'BRAV-M';
      case 'gendarme_centaure': return 'Équipage Centaure';
      case 'operateur_canon_eau': return 'Canon à eau';
      case 'telepilote': return 'Télépilote';
      case 'secouriste': return 'Secours';
      case 'street_medic': return 'Street medic';
      case 'journaliste': return 'Journaliste';
      case 'manifestant': return 'Manifestant';
      default: return 'CRS';
    }
  }

  private rootOf(s: Squad | undefined): Squad | undefined {
    const ctx = this.ctx!;
    let cur = s;
    for (let guard = 0; cur && cur.parentId !== 0 && guard < 8; guard++) {
      const up = ctx.squads.get(cur.parentId);
      if (!up) break;
      cur = up;
    }
    return cur;
  }

  private chiefOf(me: Person, group: Squad | undefined, section: Squad | undefined): MissionChief | null {
    const ctx = this.ctx!;
    // chef hors de combat (tué, grièvement blessé, interpellé, retiré) : on suit l'échelon au-dessus, pas son corps
    const able = (p: Person | undefined): p is Person => !!p && p.custody === 'free' && p.health > 0
      && p.injury !== 'dead' && p.injury !== 'critical' && p.injury !== 'serious';
    let lead: Person | undefined;
    let role = 'chef de groupe';
    const gl = group && group.leaderId !== 0 && group.leaderId !== me.id ? ctx.people.get(group.leaderId) : undefined;
    const sl = section && section.leaderId !== 0 && section.leaderId !== me.id ? ctx.people.get(section.leaderId) : undefined;
    if (able(gl)) {
      lead = gl;
      role = group!.kind === 'equipage' ? "chef d'équipage" : group!.kind === 'section' ? 'chef de section' : group!.kind === 'binome' ? 'chef de binôme' : 'chef de groupe';
    } else if (able(sl)) {
      lead = sl;
      role = section!.kind === 'compagnie' ? 'commandant' : 'chef de section';
    }
    if (!lead) return null;
    let x = lead.x, z = lead.z;
    if (lead.vehicleId !== 0) {
      const v = ctx.vehicles.get(lead.vehicleId);
      if (v) { x = v.x; z = v.z; }
    }
    return { id: lead.id, label: chiefLabel(lead.rank, lead.name), role, x, z, distance: Math.hypot(x - me.x, z - me.z) };
  }

  /** Ordre du groupe en mots simples, point visé : la place du joueur dans la formation, son chef ou son fourgon. */
  private groupOrder(me: Person, group: Squad): (PlainOrder & { x?: number; z?: number }) | null {
    const ctx = this.ctx!;
    const o = group.order;
    const slot = ctx.service<SlotLike>('police.slot')?.slotOf(me.id) ?? null;
    const v = group.vehicleId !== 0 ? ctx.vehicles.get(group.vehicleId) : undefined;
    let place = o.x === 0 && o.z === 0 ? '' : this.place(o.x, o.z);
    // barrage : la rue que l'unité barre réellement (service 'police.barrages'), à défaut la voie la plus proche
    if (o.type === 'couper_circulation' || o.type === 'filtrer') place = this.barrageStreet(group) || place;
    const plain = plainOrder(o.type, { place, poste: me.poste, hasPost: !!slot, vehicle: v ? this.vehicleLabel(v, group) : undefined });
    let x: number | undefined, z: number | undefined;
    if (plain.target === 'post' && slot) { x = slot.x; z = slot.z; }
    else if (plain.target === 'vehicle' && v) { x = v.x; z = v.z; }
    else if (this.chief) { x = this.chief.x; z = this.chief.z; plain.target = 'chef'; }
    else if (place) { x = o.x; z = o.z; plain.target = 'place'; }
    return { ...plain, x, z };
  }

  /** Nouvel ordre du groupe ? (nature différente, ou même nature déplacée loin) → surlignage et ligne radio du chef. */
  private watchOrder(group: Squad, order: PlainOrder | null, travelling: boolean, now: number): void {
    const o = group.order;
    const type = String(o.type);
    const moved = Math.hypot(o.x - this.orderX, o.z - this.orderZ) > ORDER_MOVE && now - this.orderAt > ORDER_MIN_GAP;
    if (type === this.orderKey && !moved) return;
    this.orderKey = type;
    this.orderX = o.x;
    this.orderZ = o.z;
    this.orderAt = now;
    if (QUIET_ORDERS.has(type) || travelling || !order) return;
    this.isOrder = true;
    this.markNew(now);
    // ligne radio du chef (le tout premier ordre aussi : c'est la première chose que le stagiaire doit entendre)
    if (order.radio !== '') this.pendingRelay = { squadId: group.id, text: `Groupe ! ${order.radio.charAt(0).toUpperCase()}${order.radio.slice(1)}.` };
  }

  /** Poste donné au joueur par la chaîne de commandement (équipiers d'engin…) : la radio l'a déjà dit. */
  private watchGiven(text: string, now: number): void {
    if (text === this.orderKey) return;
    this.orderKey = text;
    this.isOrder = true;
    this.markNew(now);
  }

  /** UNE ligne radio du chef à son groupe, au plus toutes les RELAY_GAP secondes (la plus récente l'emporte). */
  private flushRelay(now: number): void {
    const r = this.pendingRelay;
    if (!r || now - this.lastRelay < RELAY_GAP) return;
    const ctx = this.ctx!;
    this.pendingRelay = null;
    const s = ctx.squads.get(r.squadId);
    if (!s) return;
    this.lastRelay = now;
    ctx.radio.say({ channel: 'unite', from: s.name, text: r.text, priority: 1, personId: s.leaderId !== 0 ? s.leaderId : undefined });
  }

  /** Consigne de la journée : embarquement, route, retour (le joueur est passager, le chauffeur conduit). */
  private journeeInput(me: Person, group: Squad | undefined, journee: JourneeApi | undefined): InstructionInputs['journee'] {
    const ctx = this.ctx!;
    if (!journee || journee.stage === 'inactif' || journee.stage === 'fin') return null;
    const api = ctx.service<ObjectivesApi>(EXT.objectives);
    const found = api?.list.find((o) => o.id === JOURNEE_OBJECTIVE_ID && o.state === 'actif') ?? null;
    const dest = journee.destination;
    if (!found && !(journee.travelling && dest)) return null;
    const obj = found ?? { text: `En route vers ${dest!.name}`, x: dest!.x, z: dest!.z };
    const v = me.vehicleId !== 0 ? ctx.vehicles.get(me.vehicleId) : undefined;
    const mine = v ? this.vehicleLabel(v, group && group.vehicleId === v.id ? group : this.squadOfVehicle(v)) : '';
    const driver = !!v && v.seats[0] === me.id;
    let title = obj.text;
    let detail = '';
    switch (journee.stage) {
      case 'embarquement':
      case 'rembarquement':
        if (v) {
          title = dest && journee.stage === 'embarquement' ? `En route bientôt vers ${dest.name}` : 'À bord : la colonne va partir';
          detail = driver ? 'Vous conduisez : suivez la colonne au départ.' : `Vous êtes dans le ${mine}. Restez à bord, le chauffeur conduit.`;
        } else {
          title = obj.text.replace(/^(Embarquez|Rembarquez) : /, '$1 dans le ');
          detail = 'Montez à bord avec votre groupe : la colonne attend que tout le monde soit embarqué.';
        }
        break;
      case 'route':
      case 'intervention_route':
        title = dest ? `En route vers ${dest.name}` : obj.text;
        detail = v ? (driver ? 'Vous conduisez : suivez le véhicule de tête, deux tons.' : `Dans le ${mine}, en colonne, deux tons. Le chauffeur conduit : restez à bord.`)
          : 'Montez dans un véhicule de la compagnie : la colonne part.';
        break;
      case 'retour':
        title = obj.text.replace(/^Retour : /, 'Retour vers ');
        detail = v ? `Dans le ${mine}, retour en colonne. Restez à bord.` : 'Rejoignez un véhicule de la compagnie.';
        break;
      case 'intervention':
        detail = 'Restez avec votre groupe dans le cordon : personne n’approche des pompiers.';
        break;
      default:
        detail = 'Restez avec votre groupe.';
    }
    return { title, detail, travelling: journee.travelling, x: obj.x, z: obj.z, target: v || !journee.travelling ? 'place' : 'vehicle' };
  }

  private squadOfVehicle(v: Vehicle): Squad | undefined {
    for (const s of this.ctx!.squads.list) if (s.vehicleId === v.id) return s;
    return undefined;
  }

  /** « fourgon de CRS MISTRAL 1 ALFA ». */
  private vehicleLabel(v: Vehicle, s: Squad | undefined): string {
    const name = v.def.name.charAt(0).toLowerCase() + v.def.name.slice(1);
    return s ? `${name} ${s.name}` : name;
  }

  /** Objectif suivi d'une mission du catalogue (ni la carte, ni la journée, ni les ordres). */
  private missionInput(): InstructionInputs['mission'] {
    const api = this.ctx!.service<ObjectivesApi>(EXT.objectives);
    if (!api || api.tracked === '' || api.tracked === MISSION_OBJECTIVE_ID || api.tracked === ORDER_OBJECTIVE_ID || api.tracked === JOURNEE_OBJECTIVE_ID) return null;
    const o = api.list.find((q) => q.id === api.tracked && q.state === 'actif');
    return o ? { text: o.text, x: o.x, z: o.z } : null;
  }

  /**
   * Pompier ou soignant du SAMU : son engin, son indicatif, et UNE consigne qui suit le trajet de l'engin
   * (src/sim/roles/rescue/player-ride.ts) — embarquez (GPS sur l'engin), en route deux tons (restez à bord), sur les
   * lieux (lance, soins), évacuation, retour au centre de secours ; tout près, à pied avec l'équipe.
   */
  private rescueCard(me: Person, crew: Squad | undefined, inputs: InstructionInputs): void {
    const ctx = this.ctx!;
    const service = me.kind === 'pompier' ? 'pompier' : 'samu';
    this.heading = RESCUE_TITLES[service] ?? 'Secours';
    const ride = ctx.service<RescueRideLike>(RESCUE_EXT)?.playerRide ?? null;
    const engine = ride && ride.vehicleId !== 0 ? ctx.vehicles.get(ride.vehicleId) : crew && crew.vehicleId !== 0 ? ctx.vehicles.get(crew.vehicleId) : undefined;
    const corps = service === 'pompier' ? 'Sapeurs-pompiers' : 'SAMU de Paris';
    const unit = engine ? engine.def.name : crew ? crew.name : '';
    const sign = ride && ride.callsign ? `, indicatif ${ride.callsign}` : crew && !/pompier|samu|sapeur|sant/i.test(crew.name) ? ` (${crew.name})` : '';
    this.chain = unit ? `${corps} — ${unit}${sign}` : corps;
    this.chief = crew ? this.chiefOf(me, crew, undefined) : null;
    if (this.chief) this.chief.role = service === 'pompier' ? "chef d'agrès" : "chef d'équipe";
    const inVehicle = engine !== undefined && me.vehicleId === engine.id;
    const name = engine ? this.vehicleLabel(engine, undefined) : 'véhicule de secours';
    const stage = ride ? ride.stage : 'aucun';
    const meters = (d: number): string => `${Math.max(10, Math.round(d / 10) * 10)} m`;
    inputs.incident = this.incidentInput((label, d) => {
      const where = ride && ride.destName ? ride.destName : '';
      if (ride && ride.leftBehind && stage !== 'evacuation') {
        return d < 30 ? 'Vous avez rejoint votre équipe : au travail avec elle.'
          : `Votre engin est parti sans vous : rejoignez les lieux${where ? `, ${where}` : ''}, à ${meters(d)}.`;
      }
      if (d < 30 && !inVehicle) {
        return service === 'pompier' ? 'Sur les lieux : établissez la lance, éteignez, tenez le public à distance.'
          : 'Sur les lieux : bilan, premiers soins, puis chargez la victime dans l’ambulance.';
      }
      switch (stage) {
        case 'embarquement':
          return 'À bord : l’équipage embarque, départ deux tons dans un instant. Le conducteur conduit.';
        case 'route':
          return `Engin en route, deux tons${where ? `, vers ${where}` : ''}. Le conducteur conduit : restez à bord. Encore ${meters(ride!.remaining || d)}.`;
        case 'attente':
          return 'Zone non sûre : l’engin attend à distance que la police sécurise l’accès. Restez à bord, ou engagez-vous à vos risques.';
        case 'evacuation':
          return ride!.aiDriving ? 'Évacuation de la victime, deux tons : restez à bord avec elle.' : `Montez dans l’${name} : on évacue la victime.`;
        case 'a_pied':
          return `Tout près : à pied avec votre équipe${where ? `, ${where}` : ''}, à ${meters(d)}.`;
        case 'sur_place':
          return `L’engin est arrêté : rejoignez les lieux à pied, à ${meters(d)}.`;
        default:
          if (!inVehicle) return `Montez dans votre engin (${engine ? this.vehicleLabel(engine, crew) : 'véhicule de secours'}) : vous y allez en véhicule, deux tons.`;
          return `Engin en route, deux tons : ${label}. Encore ${meters(d)}.`;
      }
    });
    // embarquement : la consigne est l'engin (GPS sur lui), pas encore le lieu
    if (inputs.incident && engine && !inVehicle && (stage === 'embarquement' || (stage === 'evacuation' && ride && !ride.aiDriving))) {
      const left = ride && ride.waitLeft >= 0 ? ` Départ dans ${Math.ceil(ride.waitLeft)} s, avec ou sans vous.` : '';
      inputs.task = stage === 'evacuation'
        ? { title: `Montez dans l’${name} : évacuation`, detail: `La victime est à bord, on part deux tons.${left}`, x: engine.x, z: engine.z, target: 'vehicle' }
        : { title: `Embarquez : ${inputs.incident.label}`,
          detail: `Votre ${name} part deux tons${ride && ride.destName ? ` pour ${ride.destName}` : ''}. Montez comme passager, le conducteur conduit (ou prenez le volant).${left}`,
          x: engine.x, z: engine.z, target: 'vehicle' };
      inputs.incident = null;
      return;
    }
    if (inputs.incident) return;
    if (stage === 'retour' && engine) {
      inputs.task = ride!.aiDriving
        ? { title: `Retour ${ride!.destName}`, detail: 'Sans sirène : restez à bord, la salle peut vous engager en route.', target: 'none' }
        : { title: 'Rembarquez : retour au centre', detail: `Votre ${name} vous attend pour rentrer ${ride!.destName}.`, x: engine.x, z: engine.z, target: 'vehicle' };
    } else if (engine && !inVehicle) {
      inputs.task = { title: 'Disponible : restez près de votre engin', detail: 'La salle vous engagera par radio sur le prochain appel.', x: engine.x, z: engine.z, target: 'vehicle' };
    } else {
      inputs.task = { title: 'Disponible : attendez l’appel de la salle', detail: 'Restez à bord, la radio des secours vous donnera l’adresse.', target: 'none' };
    }
  }

  /** Tâche d'incident confiée au joueur (repère du HUD sur l'incident). */
  private incidentInput(detail: ((label: string, d: number) => string) | null): InstructionInputs['incident'] {
    const ctx = this.ctx!;
    const incidents = ctx.service<IncidentsApi>(EXT.incidents);
    const id = incidents ? incidents.playerIncidentId : 0;
    const inc = id !== 0 ? incidents!.get(id) : undefined;
    if (!inc) return null;
    const me = ctx.player.person();
    const d = me ? Math.hypot(inc.x - me.x, inc.z - me.z) : 0;
    return { label: inc.label, x: inc.x, z: inc.z, detail: detail ? detail(inc.label, d) : undefined };
  }

  // ───────────────────────────── secours et civils ─────────────────────────────

  private thinkCivil(me: Person, role: string, now: number): void {
    const ctx = this.ctx!;
    const crew = me.squadId !== 0 ? ctx.squads.get(me.squadId) : undefined;
    this.scope.self = me.id;
    this.radioLabel = this.channels?.label ?? '';
    this.regroup = false;
    const inputs: InstructionInputs = {};
    inputs.mission = this.missionInput();
    if (role === 'secouriste') {
      this.rescueCard(me, crew, inputs);
    } else if (role === 'street_medic') {
      this.heading = 'Street medic';
      this.chain = crew ? `Équipe ${crew.name}` : 'Équipe de street medics bénévoles';
      this.chief = null;
      const incidents = ctx.service<IncidentsApi>(EXT.incidents);
      const hurt = incidents ? incidents.nearest(me.x, me.z, 400, 'blesse') : null;
      if (hurt) {
        const where = this.place(hurt.x, hurt.z);
        inputs.task = { title: `Blessé signalé, ${where}`, detail: 'Rejoignez-le à pied, croix visible : rincez, pansez, appelez le SAMU si c’est grave.', x: hurt.x, z: hurt.z, target: 'place' };
      } else {
        const c = this.cortege(false);
        inputs.task = { title: 'Suivez le cortège à pied', detail: 'Restez visibles (croix), au plus près des blessés et des gazés.', x: c?.x, z: c?.z, target: c ? 'place' : 'none' };
      }
    } else if (role === 'journaliste') {
      this.heading = 'Journaliste';
      this.chain = 'Presse — brassard et carte de presse visibles';
      this.chief = null;
      const c = this.cortege(true);
      inputs.task = { title: c ? `Couvrez la tête de cortège, ${this.place(c.x, c.z)}` : 'Couvrez la manifestation',
        detail: 'Cadrez les moments forts, gardez vos distances avec les charges.', x: c?.x, z: c?.z, target: c ? 'place' : 'none' };
    } else {
      this.heading = 'Manifestant';
      this.chain = crew ? `Cortège — ${crew.name}` : 'Cortège';
      this.chief = null;
      const c = this.cortege(false);
      inputs.task = { title: c ? `Défilez avec le cortège, ${this.place(c.x, c.z)}` : 'Rejoignez le cortège',
        detail: 'Restez avec votre groupe, suivez le parcours déclaré.', x: c?.x, z: c?.z, target: c ? 'place' : 'none' };
    }
    this.apply(resolveInstruction(inputs), now);
  }

  /** Tête (ou centre) du cortège : position de tête sur le parcours déclaré, sinon centre des manifestants. */
  private cortege(head: boolean): { x: number; z: number } | null {
    const ctx = this.ctx!;
    const d = ctx.director;
    if (head && d && d.route.length >= 4 && d.headProgress > 0) {
      const p = { x: 0, z: 0 };
      pointOnPolyline(d.route, d.headProgress, p);
      return p;
    }
    let sx = 0, sz = 0, n = 0;
    const list = ctx.people.list;
    const step = list.length > 600 ? 3 : 1;
    for (let i = 0; i < list.length; i += step) {
      const p = list[i]!;
      if (p.faction !== 'protest' || p.custody !== 'free' || p.isPlayer) continue;
      sx += p.x; sz += p.z; n++;
    }
    return n >= 5 ? { x: sx / n, z: sz / n } : null;
  }

  // ───────────────────────────── publication ─────────────────────────────

  private apply(ins: Instruction, now: number): void {
    // nouvelle consigne (hors simple rappel « rejoignez votre groupe ») : surlignage
    if (ins.title !== this.lastTitle) {
      if (this.lastTitle !== '' && ins.source !== 'regroup' && this.instruction.source !== 'regroup' && ins.source !== 'ordre') {
        this.isOrder = false;
        this.markNew(now);
      }
      this.lastTitle = ins.title;
    }
    this.instruction = ins;
    const covered = [MISSION_OBJECTIVE_ID];
    if (ins.source === 'journee') covered.push(JOURNEE_OBJECTIVE_ID);
    if (this.family === 'police') covered.push(ORDER_OBJECTIVE_ID);
    if (covered.length !== this.covered.length || covered.some((c, i) => c !== this.covered[i])) this.covered = covered;
    this.publishObjective(ins);
  }

  private markNew(now: number): void {
    this.seq++;
    this.since = now;
  }

  /** GPS : objectif 'consigne' quand la consigne n'a pas déjà son objectif (journée, mission) ou son repère (incident). */
  private publishObjective(ins: Instruction): void {
    const api = this.ctx!.service<ObjectivesApi>(EXT.objectives);
    if (!api) return;
    const own = (ins.source === 'regroup' || ins.source === 'ordre' || ins.source === 'attente' || ins.source === 'tache')
      && ins.x !== undefined && ins.z !== undefined && ins.target !== 'none';
    if (!own) {
      if (this.objKey !== '') this.dropObjective(api);
      return;
    }
    const cur = api.list.find((o) => o.id === MISSION_OBJECTIVE_ID);
    const key = ins.title;
    const moved = !cur || cur.x === undefined || Math.hypot(cur.x - ins.x!, (cur.z ?? 0) - ins.z!) > OBJECTIVE_MOVE;
    if (!cur || key !== this.objKey || moved) {
      const o: Objective = { id: MISSION_OBJECTIVE_ID, text: ins.title, state: 'actif', secondary: false, x: ins.x, z: ins.z };
      api.upsert(o);
      this.objKey = key;
    }
    const tracked = api.tracked;
    const free = tracked === '' || tracked === MISSION_OBJECTIVE_ID || tracked === ORDER_OBJECTIVE_ID
      || !api.list.some((x) => x.id === tracked && x.state === 'actif');
    // sans voler le suivi d'un objectif de mission (il redeviendrait introuvable pour la carte)
    if (free && tracked !== MISSION_OBJECTIVE_ID) api.tracked = MISSION_OBJECTIVE_ID;
  }

  private dropObjective(api: ObjectivesApi): void {
    if (api.list.some((o) => o.id === MISSION_OBJECTIVE_ID)) api.remove(MISSION_OBJECTIVE_ID);
    if (api.tracked === MISSION_OBJECTIVE_ID) api.tracked = '';
    this.objKey = '';
  }

  private deactivate(): void {
    this.active = false;
    this.chief = null;
    this.regroup = false;
    this.instruction = EMPTY;
    this.covered = [];
    this.version++;
    const api = this.ctx!.service<ObjectivesApi>(EXT.objectives);
    if (api && this.objKey !== '') this.dropObjective(api);
  }

  // ───────────────────────────── radio ─────────────────────────────

  /** Installe (ou retire) le filtre d'écoute du joueur sur la radio. */
  private setListen(on: boolean): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const control = ctx.service<ListenControl>('radio.control');
    if (!control || !('listen' in control)) return;
    if (!on) {
      if (this.listenFn && control.listen === this.listenFn) control.listen = null;
      return;
    }
    if (!this.listenFn) {
      this.listenFn = (msg: RadioMessage): boolean => {
        const c = this.ctx!;
        const now = c.clock.now;
        if (this.channels) return this.filter.acceptChannel(msg, this.channels, this.scope.self || c.player.state.personId, now);
        return this.filter.accept(msg, this.scope, now);
      };
    }
    if (control.listen !== this.listenFn) control.listen = this.listenFn;
  }

  /** Rue barrée par le groupe du joueur ou par une unité supérieure (service 'police.barrages') ; '' si inconnue. */
  private barrageStreet(group: Squad): string {
    const ctx = this.ctx!;
    const api = ctx.service<{ list?: readonly { squadId: number; street: string; state: string }[] }>('police.barrages');
    const list = api && Array.isArray(api.list) ? api.list : null;
    if (!list) return '';
    let id = group.id;
    for (let guard = 0; id !== 0 && guard < 6; guard++) {
      const b = list.find((q) => q.squadId === id && q.state !== 'rompu');
      if (b && typeof b.street === 'string' && b.street.trim() !== '') return b.street.trim();
      id = ctx.squads.get(id)?.parentId ?? 0;
    }
    return '';
  }

  /** Nom parlé d'un lieu : voie nommée la plus proche, sinon le secteur. */
  private place(x: number, z: number): string {
    const world = this.ctx!.world;
    if (world.edgeCount > 0 && world.nearestRoad(x, z, this.road, 35) && this.road.name) return this.road.name;
    const s = world.sectorName(x, z);
    return s && s !== 'secteur inconnu' ? s : 'au point indiqué';
  }
}
