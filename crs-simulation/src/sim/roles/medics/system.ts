/* =====================================================================================
 * MÉDECINS DE RUE — système (ordre CONTROL + 32) : pilote les 'street_medic' PNJ, tient le tableau
 * de tri et le score du joueur médecin, publie « medics.records » et « medics.tuning ».
 *
 * Réflexion étalée : chaque secouriste réfléchit trois fois par seconde près du joueur, une fois par
 * seconde au-delà de 120 m ; sa marche est mise à jour à chaque pas. Les requêtes de voisinage
 * réutilisent les mêmes tableaux.
 * ===================================================================================== */

import type { GameContext, GameSystem, Person } from '@/core/contracts';
import { SystemOrder } from '@/core/contracts';
import type { CareRecord } from '../rescue/api';
import { CARE_DONE_EVENT } from '../rescue/api';
import { obtainCare } from '../rescue/care';
import type { CareService } from '../rescue/care';
import { createCareHandlers } from '../rescue/care-handlers';
import { RescueKernel } from '../rescue/crew';
import { CrewTasks } from '../rescue/crew-tasks';
import { Spawner } from '../rescue/spawn';
import { MEDICS_RECORDS_SERVICE, MEDICS_SYSTEM_ID, MEDICS_TUNING_SERVICE } from './api';
import type { MedicsTuning } from './api';
import { Medic, MedicAI } from './brain';
import type { HelpCall } from './brain';
import { MedicScore } from './score';
import { DEFAULT_TUNING, HELP_MEMORY } from './tuning';

const THINK_NEAR = 1 / 3;
const THINK_FAR = 1;
const FAR = 120;
const CALLS_MAX = 24;
/** Chasuble blanche et brassard rouge : le secouriste doit rester identifiable (dossier 03 §6.4). */
const MEDIC_WHITE = 0xf5f5f5;
const MEDIC_RED = 0xd62828;

export class MedicsSystem implements GameSystem {
  readonly id = MEDICS_SYSTEM_ID;
  readonly order = SystemOrder.CONTROL + 32;

  private ctx!: GameContext;
  readonly tuning: MedicsTuning = { ...DEFAULT_TUNING };
  private readonly kernel = new RescueKernel();
  private readonly tasks = new CrewTasks(this.kernel, new Spawner(this.kernel));
  readonly records = new MedicScore();
  private readonly calls: HelpCall[] = [];
  private readonly ai = new MedicAI(this.kernel, this.tasks, this.tuning, this.calls, this.records.npc);
  private readonly medics: Medic[] = [];
  private care!: CareService;
  private scanned = false;

  provide(ctx: GameContext): void {
    this.ctx = ctx;
    this.kernel.ctx = ctx;
    this.kernel.rng = ctx.rng.fork('medics');
    ctx.provide(MEDICS_RECORDS_SERVICE, this.records);
    ctx.provide(MEDICS_TUNING_SERVICE, this.tuning);
  }

  init(ctx: GameContext): void {
    const { care, created } = obtainCare(ctx);
    this.care = care;
    this.kernel.care = care;
    if (created) {
      const handlers = createCareHandlers(ctx, care);
      for (let i = 0; i < handlers.length; i++) ctx.interactions.register(handlers[i]);
    }
    this.records.bind(ctx, care, this.calls);
    ctx.events.on('person:spawned', (e) => {
      const p = ctx.people.get(e.id);
      if (p && p.kind === 'street_medic') this.adopt(p);
    });
    ctx.events.on('person:removed', (e) => {
      const list = this.medics;
      for (let i = list.length - 1; i >= 0; i--) if (list[i].p.id === e.id) list.splice(i, 1);
    });
    ctx.events.onAny('crowd:help', (payload) => {
      const d = payload as { personId: number; x: number; z: number } | null;
      if (!d) return;
      const calls = this.calls;
      for (let i = 0; i < calls.length; i++) {
        if (calls[i].id === d.personId) {
          calls[i].t = ctx.clock.now;
          calls[i].x = d.x;
          calls[i].z = d.z;
          return;
        }
      }
      if (calls.length >= CALLS_MAX) calls.shift();
      calls.push({ id: d.personId, x: d.x, z: d.z, t: ctx.clock.now });
    });
    ctx.events.onAny(CARE_DONE_EVENT, (payload) => this.records.onCare(payload as CareRecord));
  }

  reset(): void {
    this.kernel.rng = this.ctx.rng.fork('medics');
    this.medics.length = 0;
    this.calls.length = 0;
    this.scanned = false;
    Object.assign(this.tuning, DEFAULT_TUNING);
    this.records.reset();
    this.ai.reset();
    if (this.care) this.care.reset();
  }

  /** Prend en charge un secouriste de rue (créé par n'importe quel module). */
  private adopt(p: Person): void {
    const list = this.medics;
    for (let i = 0; i < list.length; i++) if (list[i].p === p) return;
    const rng = this.kernel.rng;
    const m = new Medic(p, rng.next(), rng.next());
    // premières réflexions décalées d'un secouriste à l'autre
    m.thinkAt = this.ctx.clock.now + rng.next() * THINK_NEAR;
    list.push(m);
    // identifiable : chasuble blanche et brassard si la tenue n'en a pas
    if (p.look.vest === 0) p.look.vest = MEDIC_WHITE;
    if (p.look.armband === 0) p.look.armband = MEDIC_RED;
    // de quoi travailler, si la dotation n'a pas été faite par les archétypes
    const a = this.ctx.actions;
    if (a.has(p, 'serum_physiologique') <= 0 && a.has(p, 'trousse_secours') <= 0) {
      a.give(p, 'serum_physiologique', 20);
      a.give(p, 'trousse_secours', 10);
    }
  }

  update(_dt: number): void {
    const ctx = this.ctx;
    const now = ctx.clock.now;
    if (!this.scanned) {
      // personnes déjà présentes avant le premier pas (mise en place de la session)
      this.scanned = true;
      const list = ctx.people.list;
      for (let i = 0; i < list.length; i++) if (list[i].kind === 'street_medic') this.adopt(list[i]);
    }
    this.care.holdPatients();
    // appels périmés
    const calls = this.calls;
    for (let i = calls.length - 1; i >= 0; i--) if (now - calls[i].t > HELP_MEMORY) calls.splice(i, 1);
    const player = ctx.player.person();
    const medics = this.medics;
    let active = 0;
    for (let i = 0; i < medics.length; i++) {
      const m = medics[i];
      const p = m.p;
      if (p.isPlayer) continue;
      active++;
      if (now >= m.thinkAt) {
        const far = player ? Math.hypot(p.x - player.x, p.z - player.z) > FAR : false;
        m.thinkAt = now + (far ? THINK_FAR : THINK_NEAR);
        this.ai.think(m);
      }
      // la marche, à chaque pas
      const w = m.r.walker;
      if (!w.active || p.vehicleId !== 0) continue;
      if (ctx.interactions.current(p) !== null || ctx.health.isIncapacitated(p)) {
        p.cmd.moveX = 0;
        p.cmd.moveZ = 0;
        continue;
      }
      // au pas quand il porte quelqu'un ou suit le cortège ; au trot vers un blessé ou pour sortir du gaz
      const stroll = m.r.task === 0 && now >= m.retreatUntil && w.remaining(p) < 25;
      w.step(ctx, p, p.carrying !== 0 || stroll ? 0 : 1);
    }
    this.records.npc.medics = active;
    this.records.update();
  }
}
