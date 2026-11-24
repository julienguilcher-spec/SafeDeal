/* =====================================================================================
 * MISSIONS — mesures de la session utiles aux objectifs et aux conditions d'échec.
 *
 * Le traqueur écoute les événements du jeu et tient des compteurs (interpellations, soins, feux éteints,
 * prises de vue, vitrines brisées, barricades dégagées, ordres du joueur…). Simulation pure.
 * ===================================================================================== */

import type { EntityId, GameContext, Unsubscribe } from '@/core/contracts';

const MEDIA_ITEMS = new Set(['appareil_photo', 'camera_tv', 'telephone']);
/** Intervalle minimal entre deux comptes rendus comptés (s) : répéter le même message ne signale rien de plus. */
const REPORT_GAP = 15;

export class MissionTracker {
  arrests = 0;
  lawfulArrests = 0;
  treated = 0;
  firesOut = 0;
  fires = 0;
  windows = 0;
  shots = 0;
  barricadesCleared = 0;
  playerOrders = 0;
  reliefs = 0;
  /** Pire gravité d'une faute d'emploi de la force par le joueur, et par l'ensemble des forces. */
  playerWorstFault = 0;
  anyWorstFault = 0;
  withoutWarning = 0;
  forceUses = 0;
  /** Emplois de la force par le joueur lui-même, et coups qu'il a portés (blessures dont il est la source). */
  playerForceUses = 0;
  playerBlows = 0;
  /** Phases de foule déjà vues (même brièvement). */
  readonly crowdPhases = new Set<string>();
  /** Membres du groupe du joueur interpellés ou blessés graves (rôle manifestant). */
  ownHarmed = 0;
  /** Personnes prises en charge (soins), pour les objectifs qui visent des victimes précises. */
  readonly treatedIds = new Set<EntityId>();
  /** Étape la plus avancée des sommations prononcées par le joueur (0 aucune, 1 annonce, 2 première, 3 dernière). */
  playerSommation = 0;
  /**
   * Comptes rendus radio du joueur (écran radio : « Compte rendu de situation ») passés quand il y avait quelque chose
   * à signaler (voir `reportable`), un au plus toutes les REPORT_GAP secondes.
   */
  playerReports = 0;
  private lastReport = -Infinity;
  /** L'équipe de liaison a été mise au contact des organisateurs (crowd.core.setLiaison). */
  liaison = false;
  /** Y a-t-il en ce moment quelque chose à signaler ? (fourni par le cadre de mission ; défaut : oui) */
  reportable: () => boolean = () => true;

  private subs: Unsubscribe[] = [];

  constructor(private readonly ctx: GameContext) {}

  start(): void {
    this.stop();
    const ev = this.ctx.events;
    const pid = (): EntityId => this.ctx.player.state.personId;
    this.subs.push(
      ev.on('person:arrested', (e) => {
        this.arrests++;
        if (e.lawful) this.lawfulArrests++;
        this.harmOwn(e.id);
      }),
      ev.on('person:treated', (e) => { this.treated++; this.treatedIds.add(e.id); }),
      ev.on('fire:out', () => { this.firesOut++; }),
      ev.on('fire:started', (e) => { if (e.targetKind !== 'person') this.fires++; }),
      ev.on('shop:window', (e) => { if (e.state === 'broken') this.windows++; }),
      ev.on('item:used', (e) => { if (e.personId === pid() && MEDIA_ITEMS.has(e.item)) this.shots++; }),
      ev.on('media:shot', (e) => { if (e.byId === pid()) this.shots++; }),
      ev.on('order:issued', (e) => {
        if (e.order.issuedBy !== 0 && e.order.issuedBy === pid()) this.playerOrders++;
        if (e.order.type === 'releve') this.reliefs++;
      }),
      ev.on('law:force', (e) => {
        const r = e.report;
        this.forceUses++;
        if (r.verdict.kind === 'sans_sommation') this.withoutWarning++;
        this.anyWorstFault = Math.max(this.anyWorstFault, r.verdict.severity);
        if (r.byId === pid()) {
          this.playerWorstFault = Math.max(this.playerWorstFault, r.verdict.severity);
          this.playerForceUses++;
        }
      }),
      ev.on('person:hurt', (e) => {
        const k = e.info.kind;
        if (e.info.sourceId === pid() && e.id !== pid() && (k === 'blunt' || k === 'impact')) this.playerBlows++;
      }),
      ev.on('crowd:phase', (e) => { this.crowdPhases.add(e.phase); }),
      ev.on('law:sommation', (e) => { if (e.byId === pid()) this.playerSommation = Math.max(this.playerSommation, e.stage); }),
      ev.on('person:down', (e) => {
        const p = this.ctx.people.get(e.id);
        if (p && (p.injury === 'serious' || p.injury === 'critical' || p.injury === 'dead')) this.harmOwn(e.id);
      }),
      ev.onAny('props:barricade_cleared', () => { this.barricadesCleared++; }),
      ev.on('radio:message', (e) => {
        const m = e.msg;
        if (m.personId === undefined || m.personId === 0 || m.personId !== pid()) return;
        if (m.channel !== 'commandement' && m.channel !== 'unite') return;
        const now = this.ctx.clock.now;
        if (now - this.lastReport < REPORT_GAP || !this.reportable()) return;
        this.lastReport = now;
        this.playerReports++;
      }),
      ev.onAny('crowd:liaison', (e) => { if ((e as { active?: boolean } | null)?.active) this.liaison = true; }),
    );
    const phase = this.ctx.director.phase;
    if (phase) this.crowdPhases.add(phase);
  }

  private harmOwn(id: EntityId): void {
    const me = this.ctx.player.person();
    if (!me || me.squadId === 0 || id === me.id) return;
    const p = this.ctx.people.get(id);
    if (p && p.squadId === me.squadId) this.ownHarmed++;
  }

  stop(): void {
    for (const u of this.subs) u();
    this.subs.length = 0;
  }

  reset(): void {
    this.stop();
    this.arrests = this.lawfulArrests = this.treated = this.firesOut = this.fires = this.windows = this.shots = 0;
    this.playerForceUses = this.playerBlows = 0;
    this.barricadesCleared = this.playerOrders = this.reliefs = 0;
    this.playerWorstFault = this.anyWorstFault = this.withoutWarning = this.forceUses = 0;
    this.ownHarmed = 0;
    this.playerSommation = 0;
    this.playerReports = 0;
    this.lastReport = -Infinity;
    this.liaison = false;
    this.crowdPhases.clear();
    this.treatedIds.clear();
  }
}
