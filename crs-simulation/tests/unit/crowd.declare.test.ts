// Déclarations à la volée (base du mode Patrouille et du curseur « Imprévu » du Mode libre) : un foyer
// (rassemblement, casseurs, blocage) ou une manifestation — déclarée ou SAUVAGE — naît en cours de partie, là où on le
// demande (anneau autour d'un point), avec de vraies personnes de la foule, en veille comme dans une session normale.
// Les tirages ont leurs propres flux : même graine, mêmes lieux ; et sans déclaration ni imprévu, rien ne change.
import { describe, expect, it } from 'vitest';

import type { Person, SessionConfig } from '@/core/contracts';
import { createTestContext } from '@/core/testing';
import { createSystems as world } from '@/world/query';
import { createSystems as roles } from '@/sim/roles';
import { createSystems as people } from '@/sim/people';
import { createSystems as vehicles } from '@/sim/vehicles';
import {
  createSystems as crowd, CROWD_CORE, CROWD_FOYERS, CROWD_MANIFS, CROWD_VEILLE_KEY, FOYER_EVENT, MANIF_EVENT, PARIS_PLACES, readImprevus,
} from '@/sim/crowd';
import type { CrowdCoreApi, FoyerEvent, FoyersApi, ManifEvent, ManifsApi, ManifView } from '@/sim/crowd';
import { createSystems as police } from '@/sim/police';
import { createSystems as law } from '@/gameplay/law';
import { createSystems as radio } from '@/gameplay/radio';

// place de la Concorde (comme les autres essais de foule)
const SITE = { x: -10, z: 15 };
const MODS = [world, roles, people, vehicles, crowd, police, law, radio];

function veille(extra: Record<string, unknown> = {}): Partial<SessionConfig> {
  return {
    mode: 'monde_ouvert', missionId: '', place: 'Place de la Concorde', x: SITE.x, z: SITE.z, crowdSize: 0,
    tension: 0.3, volatility: 0.5, duration: 'standard', extra: { [CROWD_VEILLE_KEY]: true, ...extra },
  } as Partial<SessionConfig>;
}

function normal(crowdSize: number, extra: Record<string, unknown>): Partial<SessionConfig> {
  return {
    mode: 'libre', missionId: '', place: 'Place de la Concorde', x: SITE.x, z: SITE.z, crowdSize,
    tension: 0.4, volatility: 0.6, duration: 'standard', extra,
  } as Partial<SessionConfig>;
}

async function start(seed: number, config: Partial<SessionConfig>, modules = MODS) {
  const t = createTestContext({ seed, strict: false, modules });
  const foyerEvents: FoyerEvent[] = [];
  const manifEvents: ManifEvent[] = [];
  t.ctx.events.onAny(FOYER_EVENT, (e) => foyerEvents.push({ ...(e as FoyerEvent) }));
  t.ctx.events.onAny(MANIF_EVENT, (e) => manifEvents.push({ ...(e as ManifEvent) }));
  await t.start(config);
  return {
    t, ctx: t.ctx, foyerEvents, manifEvents,
    foyers: t.ctx.require<FoyersApi>(CROWD_FOYERS), manifs: t.ctx.require<ManifsApi>(CROWD_MANIFS), core: t.ctx.require<CrowdCoreApi>(CROWD_CORE),
  };
}

function distToRoute(route: readonly number[], x: number, z: number): number {
  let best = Infinity;
  for (let i = 2; i + 1 < route.length; i += 2) {
    const ax = route[i - 2]!, az = route[i - 1]!, dx = route[i]! - ax, dz = route[i + 1]! - az;
    const l2 = dx * dx + dz * dz;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)) : 0;
    best = Math.min(best, Math.hypot(ax + dx * t - x, az + dz * t - z));
  }
  return best;
}

const protesters = (list: readonly Person[]): Person[] => list.filter((p) => p.faction === 'protest');

describe('foule : déclarations à la volée', () => {
  it('en veille, un rassemblement déclaré dans un anneau : annonce, manifestants sur place, puis fin à la durée de vie', async () => {
    const s = await start(21, veille());
    expect(s.core.veille).toBe(true);
    s.t.step(2, 1 / 15);
    const near = { x: SITE.x, z: SITE.z, min: 500, max: 1200 };
    const v = s.foyers.declare({ kind: 'rassemblement', near, size: 60, life: 150 });
    expect(v).not.toBeNull();
    const view = v!;
    const d = Math.hypot(view.x - near.x, view.z - near.z);
    // le lieu est dans l'anneau (un blocage seul peut glisser au carrefour voisin ; un rassemblement reste sur place)
    expect(d).toBeGreaterThanOrEqual(near.min - 30);
    expect(d).toBeLessThanOrEqual(near.max + 30);
    expect(view.label).toMatch(/^Rassemblement non déclaré — /);
    expect(s.foyerEvents.filter((e) => e.state === 'debut').map((e) => e.id)).toEqual([view.id]);
    expect(s.foyers.list).toContain(view);
    expect(s.ctx.radio.log.some((m) => m.from === 'CENTRAL' && /rassemblement non déclaré/.test(m.text))).toBe(true);
    // les premiers sont déjà là, les autres arrivent par les rues voisines
    s.t.step(80, 1 / 15);
    const around = protesters(s.ctx.people.list).filter((p) => Math.hypot(p.x - view.x, p.z - view.z) < 150);
    expect(around.length).toBeGreaterThanOrEqual(30);
    for (const p of around) expect(s.foyers.foyerOf(p.id)).toBe(view);
    // la phase reste « aucune » : la veille n'est pas une manifestation
    expect(s.ctx.director.phase).toBe('aucune');
    // fin à la durée de vie (bilan toutes les 2 s)
    s.t.step(75, 1 / 15);
    const fin = s.foyerEvents.find((e) => e.id === view.id && e.state === 'fin');
    expect(fin).toBeDefined();
    expect(s.foyers.list).not.toContain(view);
    expect(s.foyers.started).toBe(1);
    expect(s.foyers.planned).toBe(1);
    // nature inconnue : rien
    expect(s.foyers.declare({ kind: 'emeute' as never })).toBeNull();
  }, 240_000);

  it('en veille, une manifestation sauvage se forme puis part en cortège en moins de 200 s, sans service d’ordre', async () => {
    const s = await start(22, veille());
    s.t.step(2, 1 / 15);
    const near = { x: SITE.x, z: SITE.z, min: 600, max: 1600 };
    const v = s.manifs.declare({ sauvage: true, crowdSize: 300, near });
    expect(v).not.toBeNull();
    const view = v!;
    expect(view.sauvage).toBe(true);
    expect(view.phase).toBe('rassemblement');
    expect(view.label).toMatch(/^Manifestation sauvage — /);
    const d0 = Math.hypot(view.x - near.x, view.z - near.z);
    expect(d0).toBeGreaterThanOrEqual(near.min);
    expect(d0).toBeLessThanOrEqual(near.max);
    // destination à 0,8 – 1,8 km (le tracé, lui, suit les rues)
    const r = view.route;
    const dest = Math.hypot(r[r.length - 2]! - r[0]!, r[r.length - 1]! - r[1]!);
    expect(dest).toBeGreaterThan(500);
    expect(dest).toBeLessThan(2100);
    expect(s.manifEvents.filter((e) => e.state === 'annonce').map((e) => e.id)).toEqual([view.id]);
    expect(s.ctx.radio.log.some((m) => m.from === 'CENTRAL' && /cortège non déclaré/.test(m.text))).toBe(true);
    let cortegeAt = -1;
    for (let k = 0; k < 40 && cortegeAt < 0; k++) {
      s.t.step(5, 1 / 15);
      if (view.phase === 'cortege') cortegeAt = s.ctx.clock.now;
    }
    expect(cortegeAt).toBeGreaterThan(0);
    expect(cortegeAt).toBeLessThan(200);
    const members = protesters(s.ctx.people.list).filter((p) => s.manifs.manifOf(p.id) === view);
    expect(members.length).toBeGreaterThan(100);
    expect(members.some((p) => p.profile === 'service_ordre')).toBe(false);
    expect(members.filter((p) => p.profile === 'radical').length).toBeGreaterThanOrEqual(3);
    // la tête avance le long de son parcours
    s.t.step(40, 1 / 15);
    expect(view.headS).toBeGreaterThan(10);
    expect(s.ctx.director.phase).toBe('aucune');
    // une manifestation déclarée (non sauvage) reste possible, ailleurs
    const other = s.manifs.declare({ crowdSize: 200, near: { x: SITE.x, z: SITE.z, min: 1500, max: 3000 } });
    if (other) {
      expect(other.sauvage).toBe(false);
      expect(other.label).toMatch(/^Manifestation .+ → /);
    }
  }, 240_000);

  it('même graine, mêmes lieux et mêmes positions', async () => {
    const run = async (): Promise<number[]> => {
      const s = await start(23, veille(), [world, roles, people, vehicles, crowd, radio]);
      s.t.step(1, 1 / 15);
      const f = s.foyers.declare({ kind: 'casseurs', near: { x: SITE.x, z: SITE.z, min: 400, max: 1000 } });
      const m = s.manifs.declare({ sauvage: true, crowdSize: 200, near: { x: SITE.x, z: SITE.z, min: 900, max: 1800 } });
      expect(f).not.toBeNull();
      expect(m).not.toBeNull();
      s.t.step(30, 1 / 15);
      const out = [f!.x, f!.z, f!.people, m!.x, m!.z, m!.planned];
      for (const p of protesters(s.ctx.people.list).slice(0, 40)) out.push(Math.round(p.x * 100) / 100, Math.round(p.z * 100) / 100);
      return out;
    };
    const a = await run();
    const b = await run();
    expect(a.length).toBeGreaterThan(40);
    expect(b).toEqual(a);
  }, 240_000);

  it('imprévus du Mode libre : une manifestation sauvage avant 90 s quand la première est fixée à 60 s', async () => {
    expect(readImprevus({ extra: {} } as unknown as SessionConfig)).toBeNull();
    expect(readImprevus({ extra: { imprevus: { sauvages: 0 } } } as unknown as SessionConfig)).toBeNull();
    expect(readImprevus({ extra: { imprevus: { sauvages: 9, premier: 300, ecart: 120 } } } as unknown as SessionConfig)).toEqual({ sauvages: 3, premier: 300, ecart: 120 });
    const s = await start(24, normal(800, { foyers: 0, imprevus: { sauvages: 1, premier: 60 } }), [world, roles, people, vehicles, crowd, radio]);
    let wild: ManifView | undefined;
    while (!wild && s.ctx.clock.now < 90) {
      s.t.step(5, 1 / 15);
      wild = s.manifs.list.find((m) => m.sauvage);
    }
    expect(wild).toBeDefined();
    expect(wild!.startedAt).toBeGreaterThanOrEqual(59);
    expect(wild!.startedAt).toBeLessThan(90);
    // près du cortège principal (600 – 1 800 m de sa tête, qui n'est pas encore partie)
    const d = Math.hypot(wild!.x - SITE.x, wild!.z - SITE.z);
    expect(d).toBeGreaterThan(450);
    expect(d).toBeLessThan(2000);
    // une seule était demandée
    s.t.step(60, 1 / 15);
    expect(s.manifs.list.filter((m) => m.sauvage).length).toBe(1);
    expect(s.ctx.director.phase).not.toBe('aucune');
  }, 240_000);

  it('sans imprévu ni déclaration, la session ne change pas ; une déclaration ne décale pas le calendrier des foyers', async () => {
    // (relevé contrôlé une fois sur le code d'avant les déclarations à la volée : même empreinte pour ce scénario)
    const base = { foyers: 2, 'foyers.delai': 20, 'foyers.ecart': 40, manifestations: 2 };
    const run = async (extra: Record<string, unknown>, declareAt = -1) => {
      const s = await start(25, normal(800, { ...base, ...extra }), [world, roles, people, vehicles, crowd, radio]);
      if (declareAt >= 0) {
        s.t.step(declareAt, 1 / 15);
        // loin du parcours du cortège (une session normale garde ses foyers à l'écart du parcours déclaré)
        const far = PARIS_PLACES.map((pl) => ({ ...pl, d: distToRoute(s.ctx.director.route, pl.x, pl.z) })).sort((a, b) => b.d - a.d)[0]!;
        expect(far.d).toBeGreaterThan(800);
        // (terminé avant le premier foyer programmé, pour ne pas lui prendre sa place : seuls les tirages comptent ici)
        expect(s.foyers.declare({ kind: 'blocage', near: { x: far.x, z: far.z, min: 0, max: 300 }, size: 20, life: 6 })).not.toBeNull();
      }
      s.t.step(150 - Math.max(0, declareAt), 1 / 15);
      const prot = protesters(s.ctx.people.list);
      let sx = 0;
      let sz = 0;
      for (const p of prot) {
        sx += p.x;
        sz += p.z;
      }
      const planned = s.foyerEvents.filter((e) => e.state === 'debut' && e.people !== 20).map((e) => [e.kind, Math.round(e.x), Math.round(e.z), e.people]);
      return { print: [prot.length, s.manifs.list.length, s.foyers.started, Math.round(sx), Math.round(sz)], planned, wild: s.manifs.list.some((m) => m.sauvage) };
    };
    const plain = await run({});
    expect(plain.print[1]).toBe(1);
    expect(plain.print[2]).toBe(2);
    expect(plain.wild).toBe(false);
    const zero = await run({ imprevus: { sauvages: 0 } });
    expect(zero).toEqual(plain);
    const declared = await run({}, 1);
    expect(declared.planned).toEqual(plain.planned);
    expect(declared.print[2]).toBe(3);
  }, 240_000);
});
