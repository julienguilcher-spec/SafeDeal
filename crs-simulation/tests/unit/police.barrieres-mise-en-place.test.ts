// Une section créée à l'instant reçoit aussitôt l'ordre de filtrer une rue, de l'autre côté d'une rue fermée par des
// barrières Vauban (rue fermée à la circulation sur ordre du commandant) : ses agents enjambent les barrières et
// prennent leur poste ; elle ne rend compte « en place » que lorsque le gros de l'unité y est. Face à un obstacle
// infranchissable, elle rend compte de son retard au lieu d'annoncer une mise en place qu'elle n'a pas faite.
import { describe, expect, it } from 'vitest';

import type { GameContext, Person } from '@/core/contracts';
import { EXT } from '@/core/extensions';
import type { TrafficControlApi } from '@/core/extensions';
import { createTestContext } from '@/core/testing';
import { createSystems as world } from '@/world/query';
import { createSystems as roles } from '@/sim/roles';
import { createSystems as people } from '@/sim/people';
import { createSystems as vehicles } from '@/sim/vehicles';
import { createSystems as props } from '@/sim/props';
import { createSystems as traffic } from '@/sim/traffic';
import { createSystems as police } from '@/sim/police';
import { createSystems as law } from '@/gameplay/law';
import { createSystems as radio } from '@/gameplay/radio';
import { POLICE_SLOT_SERVICE, POLICE_STATUS_SERVICE, POLICE_UNITS_SERVICE } from '@/sim/police/api';
import type { PoliceSlotApi, PoliceStatusApi, PoliceUnitsApi } from '@/sim/police/api';

/** Rue qui sort de l'esplanade de l'Hôtel-de-Ville (carte de Paris) : poste à tenir et point de départ 40 m plus loin. */
const DOOR = { x: 2174.6, z: 975.8 };
const FROM = { x: 2137.7, z: 960.3 };

async function setup() {
  const t = createTestContext({ seed: 7, strict: false, modules: [world, roles, people, vehicles, props, traffic, police, law, radio] });
  await t.start({
    mode: 'libre', role: 'commandant', rank: 'commandant', place: 'Hôtel de Ville', x: 2219, z: 994, crowdSize: 0,
    extra: { 'traffic.vehicles': 0, 'traffic.pedestrians': 0 },
  } as never);
  t.step(2);
  return t;
}

function members(ctx: GameContext, rootId: number): Person[] {
  const out: Person[] = [];
  for (const s of ctx.squads.list) {
    let q: typeof s | undefined = s;
    for (let g = 0; q && g < 6; g++) {
      if (q.id === rootId) { for (const id of s.members) out.push(ctx.people.get(id)!); break; }
      q = q.parentId !== 0 ? ctx.squads.get(q.parentId) : undefined;
    }
  }
  return out.filter((p) => p && p.vehicleId === 0);
}

describe('mise en place derrière une rue fermée', () => {
  it('section fraîche, « filtrer » de l’autre côté de barrières Vauban : elle les enjambe et tient le poste', async () => {
    const t = await setup();
    const { ctx } = t;
    // rue fermée entre le point de départ et le poste (barrières posées)
    const tr = ctx.require<TrafficControlApi>(EXT.traffic);
    const mid = { x: (DOOR.x + FROM.x) / 2, z: (DOOR.z + FROM.z) / 2 };
    expect(tr.closeRoad(mid.x, mid.z, 0)).not.toBeNull();
    t.step(20);
    const barriers = ctx.props.list.filter((p) => p.kind === 'barriere_vauban' && Math.hypot(p.x - mid.x, p.z - mid.z) < 25);
    expect(barriers.length).toBeGreaterThanOrEqual(2);
    const units = ctx.require<PoliceUnitsApi>(POLICE_UNITS_SERVICE);
    const status = ctx.require<PoliceStatusApi>(POLICE_STATUS_SERVICE);
    const sec = units.createSection({ x: FROM.x, z: FROM.z, heading: Math.atan2(DOOR.x - FROM.x, DOOR.z - FROM.z), callsign: 'FILTRE' }).squad;
    ctx.squads.issue(sec.id, { type: 'filtrer', x: DOOR.x, z: DOOR.z, heading: Math.atan2(DOOR.x - FROM.x, DOOR.z - FROM.z), width: 0 });
    const ppl = members(ctx, sec.id);
    expect(ppl.length).toBeGreaterThanOrEqual(15);
    const slots = ctx.require<PoliceSlotApi>(POLICE_SLOT_SERVICE);
    // à son emplacement de la ligne (la ligne barre la rue de façade à façade) et du bon côté des barrières
    const near = (): number => ppl.filter((p) => { const d = slots.distanceToSlot(p.id); return d >= 0 && d < 3; }).length;
    let placedNear = -1;
    for (let i = 0; i < 90 && placedNear < 0; i++) {
      t.step(1);
      if (status.of(sec.id)!.phase === 'en_place') placedNear = near();
    }
    t.step(8);
    const far = ppl.map((p) => Math.round(Math.hypot(p.x - DOOR.x, p.z - DOOR.z)));
    console.log('filtrer derrière des barrières — distances au poste :', far.join(','), '| en place avec', placedNear, 'agents à moins de 3 m de leur emplacement');
    expect(placedNear).toBeGreaterThanOrEqual(Math.ceil(ppl.length * 0.75));
    expect(ctx.radio.log.some((m) => m.from === 'FILTRE' && /Barrage filtrant en place/.test(m.text))).toBe(true);
  }, 300000);

  it('obstacle infranchissable : la section rend compte de son retard, jamais « en place » loin de son poste', async () => {
    const t = await setup();
    const { ctx } = t;
    // mur de conteneurs (trop hauts pour être enjambés) en travers de toute la rue, de façade à façade
    const hx = DOOR.x - FROM.x, hz = DOOR.z - FROM.z, hl = Math.hypot(hx, hz);
    const ux = hx / hl, uz = hz / hl;
    const mid = { x: (DOOR.x + FROM.x) / 2, z: (DOOR.z + FROM.z) / 2 };
    for (const side of [1, -1]) {
      for (let s = 0; s < 80; s++) {
        const x = mid.x - uz * side * (0.6 + s * 1.2);
        const z = mid.z + ux * side * (0.6 + s * 1.2);
        if (!ctx.world.isFree(x, z, 0.3)) break;
        for (const back of [0, 0.8]) {
          const p = ctx.props.spawn('conteneur', x + ux * back, z + uz * back, Math.atan2(-uz, ux));
          p.movable = false;
        }
      }
    }
    const units = ctx.require<PoliceUnitsApi>(POLICE_UNITS_SERVICE);
    const status = ctx.require<PoliceStatusApi>(POLICE_STATUS_SERVICE);
    const sec = units.createSection({ x: FROM.x, z: FROM.z, heading: Math.atan2(hx, hz), callsign: 'FILTRE' }).squad;
    ctx.squads.issue(sec.id, { type: 'filtrer', x: DOOR.x, z: DOOR.z, heading: Math.atan2(hx, hz), width: 0 });
    const ppl = members(ctx, sec.id);
    const slots = ctx.require<PoliceSlotApi>(POLICE_SLOT_SERVICE);
    const placed = (): number => ppl.filter((p) => { const d = slots.distanceToSlot(p.id); return d >= 0 && d < 3; }).length;
    let lie = false;
    for (let i = 0; i < 90; i++) {
      t.step(1);
      const st = status.of(sec.id)!;
      if (st.phase === 'en_place' && placed() < ppl.length / 2) lie = true;
    }
    const msgs = ctx.radio.log.filter((m) => m.from === 'FILTRE').map((m) => m.text);
    console.log('obstacle infranchissable — radio :', msgs.join(' | '));
    expect(lie).toBe(false);
    if (placed() < ppl.length / 2) {
      expect(msgs.some((m) => /retardée/.test(m))).toBe(true);
    }
  }, 300000);
});
