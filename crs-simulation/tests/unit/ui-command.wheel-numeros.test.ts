// La roue d'ordres (F) des ordres directs : les NUMÉROS GARDÉS et ce que chaque secteur donne vraiment.
//   - chaque ancien « F puis N » / « F puis 8 puis N » (ui-command.ancienne-roue.lib, la roue publiée avant) donne le
//     même ordre ou « Avec moi » (2 = alias de 1), jamais un ordre de force qu'il ne donnait pas — la seule exception
//     voulue (§1.2) est 6, l'ancien « Pousser un véhicule » passé en « Plus… » 9, devenu Disperser : avant les 3
//     sommations, son premier appui ne disperse pas, il explique (et le second fait faire les sommations) ;
//   - sur la vraie carte (Concorde, graine 21, commandant), chaque secteur donne un ordre de ses types annoncés, à la
//     même unité que l'ordre prêt (jamais la racine de la compagnie), et part par le moteur des ordres directs
//     (giveSector) : ticket, ordre du joueur, ⌫ qui l'annule ; Charger sans l'accord : l'autorité fait tout d'un second
//     appui, un chef de section doit demander l'accord à la radio.
import { beforeAll, describe, expect, it } from 'vitest';

import { createTestContext } from '@/core/testing';
import { createSystems as world } from '@/world/query';
import { createSystems as roles } from '@/sim/roles';
import { createSystems as people } from '@/sim/people';
import { createSystems as vehicles } from '@/sim/vehicles';
import { createSystems as traffic } from '@/sim/traffic';
import { createSystems as crowd } from '@/sim/crowd';
import { createSystems as police } from '@/sim/police';
import { createSystems as items } from '@/sim/items';
import { createSystems as props } from '@/sim/props';
import { createSystems as hazards } from '@/sim/hazards';
import { createSystems as law } from '@/gameplay/law';
import { createSystems as radio } from '@/gameplay/radio';
import { createSystems as session } from '@/gameplay/session';
import { createSystems as maps } from '@/ui/maps';
import { createSystems as command, DIRECT_SERVICE } from '@/ui/command';
import type { CommandCore, DirectApi, DirectRuntime } from '@/ui/command';
import type { GameContext } from '@/core/contracts';
import { FOLLOW_WHEEL, MORE_RING, WHEEL, wheelOrders } from '@/ui/command/orderWheel';
import type { WheelSector } from '@/ui/command/orderWheel';
import { wheelSectorIndex } from '@/ui/command/wheelKeys';
import { GUARD_TIME } from '@/ui/command/direct/runtime';
import { SECTOR_LOCKS, SECTOR_REFUS, sectorOrder } from '@/ui/command/direct/sector';
import type { SectorSituation } from '@/ui/command/direct/sector';
import {
  DIGIT_ALIASES, REFUS, designationAt, directEnvFromCore, refusForce, resolveWho, type Designation,
} from '@/ui/command/direct';
import { cardEnvFromCore } from '@/ui/command/reperes';
import * as OLD from './ui-command.ancienne-roue.lib';

const MODULES = [world, roles, people, vehicles, traffic, crowd, police, items, props, hazards, law, radio, session, maps, command];
const MEANS = { sections: 3, fourgons: 9, centaure: 1, canon_eau: 1, bravm: 1, drone: 0, pompiers: 0, samu: 0, secours_sur_appel: true };
const COERCIVE = new Set(['charge', 'disperser_gaz', 'refoulement', 'bond_offensif', 'encercler']);

/** Le secteur que donne un chiffre dans la roue de ce niveau (les alias ne valent que dans la roue, pas les couronnes). */
function digit(sectors: readonly WheelSector[], n: number, aliases = true): WheelSector | null {
  const i = wheelSectorIndex(`Digit${n}`, sectors.map((s) => s.key), aliases ? DIGIT_ALIASES : {});
  return i >= 0 ? sectors[i]! : null;
}

describe('numéros gardés : chaque ancien « F puis N » garde son sens', () => {
  it('roue de ceux qui commandent : même ordre, ou « Avec moi » ; jamais une force qu’il ne donnait pas (sauf 6, verrouillé)', () => {
    for (const level of ['unite', 'tout']) {
      const ring = wheelOrders(level);
      for (const old of OLD.WHEEL) {
        const now = digit(ring, old.key)!;
        expect(now, `F puis ${old.key}`).toBeTruthy();
        if (old.type === 'suivre_pied' || old.type === 'avec_moi') {
          // « Suivez-moi à pied / en véhicules » : « Avec moi », qui s'adapte à la façon dont il se déplace
          expect(now.action, `F puis ${old.key}`).toBe('avec_moi');
          continue;
        }
        if (old.type === 'secours' || old.type === 'plus') {
          expect(now.action).toBe(old.type);
          continue;
        }
        if (old.key === 6) {
          // l'ancien « Pousser un véhicule » est en « Plus… » 9 ; 6 est Disperser (son premier appui explique, voir plus bas)
          expect(now.action).toBe('disperser');
          expect(digit(MORE_RING, 9, false)!.orders).toContain(old.type);
          continue;
        }
        expect(now.orders, `F puis ${old.key} (${old.label} → ${now.label})`).toContain(
          old.type === 'ligne' ? 'ligne' : old.type === 'avancer' ? 'avancer' : old.type,
        );
        if (!COERCIVE.has(String(old.type))) expect(now.orders.some((o) => COERCIVE.has(String(o))), `F puis ${old.key}`).toBe(false);
      }
      // aucun chiffre libre de l'ancienne roue (9, 0) ne donne désormais quelque chose
      expect(digit(ring, 9)).toBeNull();
      expect(digit(ring, 0)).toBeNull();
    }
  });

  it('« Plus… » : F puis 8 puis N, de 1 à 8, exactement l’ordre d’avant ; 9 Pousser un véhicule ajouté', () => {
    const more = digit(WHEEL, 8)!.ring!;
    expect(more).toBe(MORE_RING);
    for (const old of OLD.MORE_RING) {
      const now = digit(more, old.key, false)!;
      expect(now.orders, `F puis 8 puis ${old.key}`).toEqual([old.type]);
      expect(now.label).toBe(old.label);
    }
    expect(digit(more, 9, false)!.orders).toEqual(['degager_obstacle']);
    // dans une couronne, 2 reste « Bond en avant » (pas l'alias de la roue)
    expect(digit(more, 2, false)!.orders).toEqual(['bond_offensif']);
  });

  it('roue du policier sans autorité : F puis 1, F puis 2 → « Avec moi » ; F puis 7 → « Secours ici » ; rien d’autre', () => {
    const ring = wheelOrders('lecture');
    expect(ring).toBe(FOLLOW_WHEEL);
    for (const old of OLD.FOLLOW_WHEEL) {
      const now = digit(ring, old.key)!;
      expect(now.action, `F puis ${old.key}`).toBe(old.type === 'secours' ? 'secours' : 'avec_moi');
    }
    for (const n of [3, 4, 5, 6, 8, 9]) expect(digit(ring, n), `F puis ${n}`).toBeNull();
    // « Secours ici » : la même couronne qu'avant (1 Pompiers, 2 SAMU)
    const rescue = digit(ring, 7)!.ring!;
    expect(rescue.map((s) => `${s.key} ${s.action}`)).toEqual(OLD.RESCUE_RING.map((s) => `${s.key} ${s.type}`));
  });
});

// ───────────────────────────── sur la vraie carte ─────────────────────────────

interface Game { ctx: GameContext; step(s: number): void; core: CommandCore; direct: DirectApi & DirectRuntime }
let game: Game;

beforeAll(async () => {
  const t = createTestContext({ seed: 21, strict: false, modules: MODULES });
  await t.start({
    mode: 'libre', role: 'commandant', rank: 'commandant', place: 'Place de la Concorde', x: -10, z: 15,
    crowdSize: 300, tension: 0.4, volatility: 0.3, duration: 'standard', extra: { moyens: MEANS, variante: 'terrain' },
  } as never);
  t.step(3);
  const core = t.ctx.service<CommandCore>('ui.command')!;
  game = { ctx: t.ctx, step: (s) => t.step(s), core, direct: t.ctx.service<DirectApi & DirectRuntime>(DIRECT_SERVICE)! };
}, 300000);

function situation(des: Designation, authority = true): SectorSituation {
  const roe = game.ctx.law.roe;
  return {
    env: directEnvFromCore(game.core, { playerOrder: (id) => game.core.playerOrder(id) }), des, whoKey: game.direct.whoKey(), yaw: game.ctx.player.state.camYaw,
    law: { authorizedForce: roe.authorizedForce, underAttack: roe.underAttack, authority },
  };
}

/** Une rue sans foule à 40–120 m du joueur. */
function street(): Designation {
  const me = game.core.player()!;
  const env = directEnvFromCore(game.core);
  for (const d of [40, 60, 80, 100, 120]) {
    for (let k = 0; k < 16; k++) {
      const a = (k * Math.PI) / 8;
      const des = designationAt(game.core, me.x + Math.sin(a) * d, me.z + Math.cos(a) * d);
      if (env.roadAt(des.x, des.z, 25) && env.demonstratorsAt(des.x, des.z, 30).count < 8 && !env.rescueAt(des.x, des.z, 10)) return des;
    }
  }
  throw new Error('aucune rue proche');
}

/** La foule (centre de la plus grande foule de la carte). */
function crowdPoint(): Designation {
  const card = cardEnvFromCore(game.core);
  const c = card.crowds.slice().sort((a, b) => b.people - a.people)[0]!;
  return designationAt(game.core, c.x, c.z);
}

function pause(): void {
  game.step(GUARD_TIME + 0.1);
}

describe('les secteurs sur la vraie carte (Concorde, graine 21, commandant)', () => {
  it('chaque secteur donne un ordre de ses types, à la même unité que l’ordre prêt — jamais la racine de la compagnie', () => {
    const root = game.core.scope().ownSquadId;
    const rows: string[] = [];
    for (const [label, des] of [['rue', street()], ['foule', crowdPoint()]] as const) {
      const s = situation(des);
      for (const sector of [...WHEEL, ...MORE_RING]) {
        const o = sectorOrder(sector, s);
        if (sector.ring || sector.action === 'avec_moi' || sector.action === 'pompiers' || sector.action === 'samu') {
          expect(o, sector.label).toBeNull();
          continue;
        }
        expect(o, sector.label).toBeTruthy();
        expect(sector.orders, sector.label).toContain(o!.orderType);
        rows.push(`${label} ${sector.key} ${sector.label} → ${o!.orderType} ${o!.who ? o!.who.label : '—'} ${o!.enabled ? '' : '🔒'}${o!.legalFirst ? '⚖' : ''} « ${o!.text} » / « ${o!.whoShort} »`);
        if (o!.who) {
          expect(o!.who.squadIds, sector.label).not.toContain(root);
          // la même unité que l'ordre prêt pour ce verbe à ce point (même choix « À qui »)
          const here = ['repli', 'tenir', 'cesser', 'libre', 'tortue'].includes(sector.action) ? des : o!;
          const same = resolveWho(s.env, s.whoKey, o!.verb, here.x, here.z);
          expect(o!.who.squadIds).toEqual(same!.squadIds);
        }
      }
    }
    console.log(rows.join('\n'));
  });

  it('F puis 6 (Disperser) avant les 3 sommations : le premier appui explique, le second fait faire les sommations', () => {
    expect(game.ctx.law.roe.sommation).toBeLessThan(3);
    const o = sectorOrder(WHEEL.find((w) => w.key === 6)!, situation(crowdPoint()))!;
    expect(o.legalFirst).toBe(true);
    expect(o.lock).toBe(REFUS.disperserSommations(o.who!.label));
    expect(o.whoShort).toBe(SECTOR_LOCKS.sommations);
    const before = game.ctx.squads.get(o.who!.squadIds[0]!)!.order.type;
    const first = game.direct.giveSector(o);
    expect(first.ok).toBe(false);
    expect(first.text).toBe(o.lock);
    // rien n'a bougé : pas de refoulement
    expect(game.ctx.squads.get(o.who!.squadIds[0]!)!.order.type).toBe(before);
    const second = game.direct.giveSector(o);
    expect(second.ok, second.text).toBe(true);
    expect(game.core.legalChain.active()).toBe(true);
    // en attendant les sommations, l'unité se met en ligne face à la foule (jamais un refoulement tout de suite)
    expect(game.ctx.squads.get(o.who!.squadIds[0]!)!.order.type).not.toBe('refoulement');
    game.core.legalChain.reset();
    pause();
  });

  it('Charger sans l’accord : l’autorité (commandant) fait tout d’un second appui ; sans autorité, demander l’accord', () => {
    const charge = MORE_RING.find((w) => w.key === 3)!;
    if (game.ctx.law.roe.authorizedForce >= 2) return;
    const cmd = sectorOrder(charge, situation(crowdPoint(), true))!;
    expect(cmd.enabled).toBe(true);
    expect(cmd.legalFirst).toBe(true);
    expect(cmd.lock).toBe(refusForce('charge', true));
    const chef = sectorOrder(charge, situation(crowdPoint(), false))!;
    expect(chef.enabled).toBe(false);
    expect(chef.lock).toBe(refusForce('charge', false));
    expect(chef.whoShort).toBe(SECTOR_LOCKS.accordChef);
    const r = game.direct.giveSector(chef);
    expect(r.ok).toBe(false);
    expect(r.text).toBe(refusForce('charge', false));
  });

  it('Interpeller sans personne désignée : verrouillé, la phrase dit quoi faire', () => {
    const o = sectorOrder(WHEEL.find((w) => w.key === 5)!, situation(street()))!;
    expect(o.enabled).toBe(false);
    expect(o.lock).toBe(SECTOR_REFUS.visezQuelquun);
    expect(o.whoShort).toBe(SECTOR_LOCKS.visezQuelquun);
    // le ciel (rien de désigné) : Envoyer est verrouillé, sans ordre
    const none: Designation = { kind: 'none', x: 0, z: 0, distance: 0, person: null, place: '', far: false };
    const e = sectorOrder(WHEEL.find((w) => w.key === 3)!, situation(none))!;
    expect(e.enabled).toBe(false);
    expect(e.lock).toBe(REFUS.rien);
  });

  it('F puis 4 sur une rue : l’ordre part par le moteur (ticket, ordre du joueur), ⌫ le défait', () => {
    pause();
    const o = sectorOrder(WHEEL.find((w) => w.key === 4)!, situation(street()))!;
    expect(o.enabled, o.lock ?? '').toBe(true);
    expect(o.orderType).toBe('couper_circulation');
    const id = o.who!.squadIds[0]!;
    const before = game.ctx.squads.get(id)!.order.type;
    const r = game.direct.giveSector(o);
    expect(r.ok, r.text).toBe(true);
    expect(r.squads).toContain(id);
    const s = game.ctx.squads.get(id)!;
    expect(s.order.type).toBe('couper_circulation');
    expect(s.order.byPlayer).toBe(true);
    expect(game.direct.ticketOf(id)!.verb).toBe('bloquer');
    expect(game.direct.undoable()!.who).toBe(o.who!.label);
    // ⌫ dans les 5 s : l'unité reprend son ordre d'avant (« avec vous »)
    game.step(1);
    const u = game.direct.undo();
    expect(u.ok, u.text).toBe(true);
    game.step(0.5);
    const after = String(game.ctx.squads.get(id)!.order.type);
    if (before === 'suivre') expect(['suivre', 'suivre_pied', 'debarquer'], after).toContain(after);
    expect(after).not.toBe('couper_circulation');
    pause();
  });

  it('F puis 8 puis 5 (Tenir sa position) : sur place, sans point à rejoindre ; F puis 1 (Avec moi) depuis la roue', () => {
    pause();
    const o = sectorOrder(MORE_RING.find((w) => w.key === 5)!, situation(street()))!;
    expect(o.enabled, o.lock ?? '').toBe(true);
    const id = o.who!.squadIds[0]!;
    const r = game.direct.giveSector(o);
    expect(r.ok, r.text).toBe(true);
    expect(game.ctx.squads.get(id)!.order.type).toBe('tenir');
    pause();
    // « Avec moi » de la roue : comme A, sans la garde d'écran (la roue est l'écran ouvert)
    const a = game.direct.avecMoi({ fromScreen: true });
    expect(a.ok, a.text).toBe(true);
    game.step(1);
    const me = game.core.player()!;
    const s = game.ctx.squads.get(id)!;
    expect(s.order.type === 'suivre' && s.order.targetId === me.id, s.order.type).toBe(true);
  });
});
