/* =====================================================================================
 * Droit — outils de test (utilisés par tests/unit/law.*.test.ts ; jamais importés par le jeu).
 *
 *   const law = await startLaw({ seed: 3 });
 *   const cdt = commandant(law.ctx, 0, 0);           // le chef unique : écharpe, mégaphone, fusées
 *   const com = commissaire(law.ctx, 0, 0);          // alias : écharpe + mégaphone
 *   law.ctx.law.sommation(com);
 *   law.t.step(30);
 *
 * Monde factice : walledWorld(murs) pose des murs opaques sur le plan infini du monde neutre.
 * ===================================================================================== */

import type {
  GameContext, GameSystem, NoticeKind, Person, PersonInit, PersonKind, ProtestProfile, RadioMessage, RayHit,
  SessionConfig, WorldQuery,
} from '@/core/contracts';
import { segmentSegment } from '@/core/math';
import type { SegmentHit } from '@/core/math';
import { createTestContext } from '@/core/testing';
import type { TestContext } from '@/core/testing';
import type { LawConfig, LawRecords } from './api';
import { LAW_CONFIG_SERVICE, LAW_RECORDS_SERVICE } from './api';
import { createSystems } from './index';

export interface Notice {
  text: string;
  kind: NoticeKind;
}

export interface LawTest {
  t: TestContext;
  ctx: GameContext;
  records: LawRecords;
  cfg: LawConfig;
  /** Messages adressés au joueur (ctx.ui.notify). */
  notices: Notice[];
  /** Journal radio de la session. */
  radio: readonly (RadioMessage & { t: number })[];
}

export interface LawTestOptions {
  seed?: number;
  config?: Partial<SessionConfig>;
  /** Murs opaques [ax, az, bx, bz] posés sur le monde neutre. */
  walls?: readonly (readonly [number, number, number, number])[];
  systems?: readonly GameSystem[];
}

/** Monde neutre auquel on ajoute des murs qui arrêtent la vue et les lancers de rayon. */
export function walledWorld(base: WorldQuery, walls: readonly (readonly [number, number, number, number])[]): WorldQuery {
  const hit: SegmentHit = { t: 0, u: 0, x: 0, z: 0 };
  function blocked(ax: number, az: number, bx: number, bz: number): boolean {
    for (let i = 0; i < walls.length; i++) {
      const w = walls[i]!;
      if (segmentSegment(ax, az, bx, bz, w[0], w[1], w[2], w[3])) return true;
    }
    return false;
  }
  return {
    ...base,
    lineOfSight(ax: number, az: number, bx: number, bz: number): boolean {
      return !blocked(ax, az, bx, bz);
    },
    raycast(ax: number, az: number, bx: number, bz: number, out: RayHit): boolean {
      let best = 2;
      for (let i = 0; i < walls.length; i++) {
        const w = walls[i]!;
        if (segmentSegment(ax, az, bx, bz, w[0], w[1], w[2], w[3], hit) && hit.t < best) best = hit.t;
      }
      out.hit = best <= 1;
      out.t = out.hit ? best : 1;
      out.x = ax + (bx - ax) * out.t;
      out.z = az + (bz - az) * out.t;
      out.nx = 0;
      out.nz = 0;
      out.kind = out.hit ? 'building' : 'none';
      out.id = 0;
      out.height = out.hit ? 15 : 0;
      return out.hit;
    },
  };
}

/** Démarre une session d'essai avec le module du droit (services neutres pour tout le reste). */
export async function startLaw(options: LawTestOptions = {}): Promise<LawTest> {
  const notices: Notice[] = [];
  const systems: GameSystem[] = [];
  if (options.walls) {
    const walls = options.walls;
    systems.push({
      id: 'test:walls',
      order: 0,
      provide(ctx: GameContext): void {
        ctx.world = walledWorld(ctx.world, walls);
      },
    });
  }
  if (options.systems) for (const s of options.systems) systems.push(s);
  const t = createTestContext({ seed: options.seed ?? 1, modules: [createSystems], systems });
  const ctx = t.ctx;
  await t.ready;
  const ui = ctx.ui;
  ctx.ui = {
    notify(text: string, kind: NoticeKind = 'info'): void {
      notices.push({ text, kind });
    },
    subtitle: (speaker, text, seconds) => ui.subtitle(speaker, text, seconds),
    banner: (title, subtitle, seconds) => ui.banner(title, subtitle, seconds),
    open: (screen, data) => ui.open(screen, data),
    close: (screen) => ui.close(screen),
    get modal(): boolean {
      return ui.modal;
    },
    get current() {
      return ui.current;
    },
  };
  await t.start(options.config);
  return {
    t,
    ctx,
    records: ctx.require<LawRecords>(LAW_RECORDS_SERVICE),
    cfg: ctx.require<LawConfig>(LAW_CONFIG_SERVICE),
    notices,
    radio: ctx.radio.log,
  };
}

/** Fait apparaître une personne (apparence déterministe). */
export function person(ctx: GameContext, kind: PersonKind, x: number, z: number, init: Partial<PersonInit> = {}): Person {
  return ctx.people.spawn({ kind, x, z, ...init });
}

/**
 * Le commandant unique du BRIEF : chef de la compagnie ET autorité habilitée (écharpe tricolore,
 * mégaphone et fusées de sommation en dotation).
 */
export function commandant(ctx: GameContext, x: number, z: number): Person {
  const p = person(ctx, 'crs', x, z, { name: 'Commandant Delmas', rank: 'commandant', poste: 'commandant_unite' });
  ctx.actions.give(p, 'megaphone', 1);
  ctx.actions.give(p, 'fusee_sommation', 4);
  return p;
}

/** Autorité habilitée sous sa forme « commissaire » (alias du même rôle) : écharpe, mégaphone en dotation. */
export function commissaire(ctx: GameContext, x: number, z: number, megaphone = true): Person {
  const p = person(ctx, 'commissaire', x, z, { name: 'Commissaire Arnaud' });
  if (megaphone) ctx.actions.give(p, 'megaphone', 1);
  return p;
}

/** Agent de CRS. */
export function crs(ctx: GameContext, x: number, z: number, init: Partial<PersonInit> = {}): Person {
  return person(ctx, 'crs', x, z, init);
}

/** Manifestant du profil donné. */
export function protester(ctx: GameContext, x: number, z: number, profile: ProtestProfile = 'pacifique', init: Partial<PersonInit> = {}): Person {
  return person(ctx, 'manifestant', x, z, { profile, ...init });
}

/** Petite foule de manifestants pacifiques disposés en grille autour d'un point. */
export function crowd(ctx: GameContext, x: number, z: number, count: number, spacing = 1.2): Person[] {
  const out: Person[] = [];
  const side = Math.ceil(Math.sqrt(count));
  for (let i = 0; i < count; i++) {
    const cx = x + ((i % side) - (side - 1) / 2) * spacing;
    const cz = z + (Math.floor(i / side) - (side - 1) / 2) * spacing;
    out.push(protester(ctx, cx, cz));
  }
  return out;
}

/** Déroule l'annonce et les deux sommations en respectant les délais, puis attend le délai avant la force. */
export function fullSommations(law: LawTest, authority: Person, waitForceDelay = true): void {
  const api = law.ctx.law;
  api.sommation(authority);
  law.t.step(law.cfg.delayAnnonce + 0.1);
  api.sommation(authority);
  law.t.step(law.cfg.delaySommation + 0.1);
  api.sommation(authority);
  if (waitForceDelay) law.t.step(law.cfg.delayForce + 0.1);
}

/** Un manifestant blesse un agent avec un pavé : violences contre les forces. */
export function attackOfficer(ctx: GameContext, attacker: Person, officer: Person, amount = 8): void {
  ctx.health.hurt(officer, { amount, kind: 'impact', sourceId: attacker.id, item: 'pave', x: officer.x, z: officer.z, zone: 0.5 });
}
