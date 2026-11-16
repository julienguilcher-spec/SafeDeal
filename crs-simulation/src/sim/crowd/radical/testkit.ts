/* =====================================================================================
 * GROUPES RADICAUX — aides de test (réservées à tests/unit/crowd-radical.*.test.ts).
 * Les modules réels (monde, archétypes, personnes, matériel, dangers, droit, décor, véhicules) sont
 * fournis par l'appelant : ce dossier n'importe l'implémentation d'aucun autre module.
 * ===================================================================================== */

import type { EntityId, GameContext, ModuleFactory, Person, SessionConfig } from '@/core/contracts';
import { createCrowdTest, demoConfig } from '../testkit';
import type { CrowdTest } from '../testkit';
import type { RadicalEvent, SignalEvent } from './api';
import { RADICAL_EVENT, SIGNAL_EVENT } from './api';

export interface RadicalWatch {
  /** Faits marquants, dans l'ordre : [instant, fait, groupe]. */
  facts: { t: number; fact: string; groupId: number; targetId: EntityId }[];
  /** Nombre d'occurrences par fait. */
  count: Record<string, number>;
  /** Signes avant-coureurs apparus : type → instant de la première apparition. */
  signs: Record<string, number>;
  /** Projectiles créés par des manifestants, par personne. */
  thrownBy: Map<EntityId, number>;
  thrown: number;
  /** Instant du premier projectile lancé par un manifestant (−1 : aucun). */
  firstThrowAt: number;
  /** Infractions relevées contre des manifestants, par type. */
  offenses: Record<string, number>;
  windowsBroken: number;
  looted: number;
  barricades: number;
  fires: number;
  policeHurt: number;
}

export interface RadicalTest extends CrowdTest {
  watch: RadicalWatch;
  radicals(): Person[];
}

export interface RadicalTestOptions {
  seed?: number;
  modules: readonly ModuleFactory[];
}

const THROWN = ['pave', 'bouteille', 'molotov', 'mortier', 'debris'];

/** Monte un jeu de test avec la foule et ses groupes radicaux, et un relevé des événements utiles. */
export function createRadicalTest(options: RadicalTestOptions): RadicalTest {
  const t = createCrowdTest({ seed: options.seed ?? 1, modules: options.modules });
  const ctx = t.ctx;
  const watch: RadicalWatch = {
    facts: [], count: {}, signs: {}, thrownBy: new Map(), thrown: 0, firstThrowAt: -1, offenses: {}, windowsBroken: 0, looted: 0,
    barricades: 0, fires: 0, policeHurt: 0,
  };
  ctx.events.onAny(RADICAL_EVENT, (payload) => {
    const e = payload as RadicalEvent;
    watch.facts.push({ t: ctx.clock.now, fact: e.fact, groupId: e.groupId, targetId: e.targetId });
    watch.count[e.fact] = (watch.count[e.fact] ?? 0) + 1;
  });
  ctx.events.onAny(SIGNAL_EVENT, (payload) => {
    const e = payload as SignalEvent;
    if (e.stage === 'debut' && watch.signs[e.signal.type] === undefined) watch.signs[e.signal.type] = e.signal.t;
  });
  ctx.events.on('projectile:spawned', (e) => {
    if (THROWN.indexOf(e.kind) < 0) return;
    const p = ctx.people.get(e.ownerId);
    if (!p || p.faction !== 'protest') return;
    watch.thrown++;
    watch.thrownBy.set(p.id, (watch.thrownBy.get(p.id) ?? 0) + 1);
    if (watch.firstThrowAt < 0) watch.firstThrowAt = ctx.clock.now;
  });
  ctx.events.on('law:offense', (e) => {
    const p = ctx.people.get(e.personId);
    if (!p || p.faction !== 'protest') return;
    watch.offenses[e.offense.type] = (watch.offenses[e.offense.type] ?? 0) + 1;
  });
  ctx.events.on('shop:window', (e) => {
    if (e.state === 'broken') watch.windowsBroken++;
  });
  ctx.events.on('shop:looted', () => {
    watch.looted++;
  });
  ctx.events.on('barricade:built', () => {
    watch.barricades++;
  });
  ctx.events.on('fire:started', () => {
    watch.fires++;
  });
  ctx.events.on('person:hurt', (e) => {
    const p = ctx.people.get(e.id);
    const src = ctx.people.get(e.info.sourceId);
    if (p && p.faction === 'police' && src && src.faction === 'protest') watch.policeHurt++;
  });
  return {
    ...t,
    watch,
    radicals(): Person[] {
      return t.protesters().filter((p) => p.profile === 'radical');
    },
  };
}

/** Session d'essai : cortège sur l'avenue du quartier d'essai, d'ouest en est, tout le monde déjà sur place. */
export function avenueConfig(partial: Partial<SessionConfig> = {}, extra: Record<string, unknown> = {}): Partial<SessionConfig> {
  return demoConfig({
    crowdSize: 220, tension: 0.5, volatility: 0.9, duration: 'courte',
    ...partial,
    extra: {
      'crowd.present': 1, 'crowd.noAleas': true, 'crowd.bystanders': 0, 'crowd.scenario': 'samedi_sans_organisateur',
      'crowd.route': [50, 7, 430, 7], ...extra,
    },
  });
}

/** Une ligne d'agents porte-bouclier en travers de la rue, boucliers levés (aucune IA : ils tiennent, c'est tout). */
export function policeLine(ctx: GameContext, x: number, z: number, heading: number, count: number, spacing = 1.2): Person[] {
  const line: Person[] = [];
  const rx = -Math.cos(heading);
  const rz = Math.sin(heading);
  for (let i = 0; i < count; i++) {
    const off = (i - (count - 1) * 0.5) * spacing;
    const p = ctx.archetypes.spawn('crs', x + rx * off, z + rz * off, { poste: 'bouclier', heading });
    ctx.actions.selectById(p, 'bouclier');
    p.cmd.aimYaw = heading;
    line.push(p);
  }
  return line;
}

/** Lève les boucliers d'une ligne (à appeler une seconde après policeLine : le temps de les prendre en main). */
export function raiseShields(ctx: GameContext, line: readonly Person[]): void {
  for (const p of line) ctx.actions.setAlt(p, true);
}

/** Un petit chantier sur le trottoir : tas de pavés, grilles, palettes. */
export function chantier(ctx: GameContext, x: number, z: number): void {
  ctx.props.spawn('pile_paves', x, z, 0);
  ctx.props.spawn('barriere_chantier', x - 3, z + Math.sign(z || 1) * 1.5, 0);
  ctx.props.spawn('barriere_chantier', x + 3, z + Math.sign(z || 1) * 1.5, 0);
  ctx.props.spawn('palette', x, z + Math.sign(z || 1) * 2.5, 0);
}

/** Projectiles à lancer (pavés et bouteilles) détenus par une personne. */
export function ammoOf(p: Person): number {
  let n = 0;
  for (const s of p.inventory) if ((s.id === 'pave' || s.id === 'bouteille') && s.count > 0) n += s.count;
  return n;
}
