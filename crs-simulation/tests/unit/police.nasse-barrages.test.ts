// Nasse par barrages : quatre unités barrent les quatre rues d'un carrefour où se tient une foule. Toutes les issues
// tenues : la nasse est détectée d'elle-même (service 'police.barrages', événement 'police:kettle', compte rendu
// « Nasse fermée … environ N personnes ») ; une unité passe en barrage filtrant : l'issue devient « filtrante », et
// ceux qui veulent partir ne sortent que par elle.
// Quartier d'essai : carrefour de la rue du Pont (x = 0, 14 m) et de la rue de la Fontaine (z = −160, 12 m).
import { describe, expect, it } from 'vitest';
import type { Person } from '@/core/contracts';
import { createSystems as world } from '@/world/query';
import { createSystems as people } from '@/sim/people';
import { createSystems as items } from '@/sim/items';
import { createSystems as hazards } from '@/sim/hazards';
import { createSystems as law } from '@/gameplay/law';
import { createSystems as traffic } from '@/sim/traffic';
import { KETTLE_EVENT, POLICE_BARRAGES_SERVICE } from '@/sim/police/api';
import type { BarragesApi } from '@/sim/police/api';
import { startPolice } from '@/sim/police/testkit';

const MODULES = [world, people, items, hazards, law, traffic];
const C = { x: 0, z: -160 };

describe('police — nasse par barrages', () => {
  it('quatre rues barrées autour d’une foule : nasse fermée, puis sortie par le seul barrage filtrant', async () => {
    const pt = await startPolice(MODULES, { mode: 'test', x: 0, z: 0, extra: { 'traffic.vehicles': 0, 'traffic.pedestrians': 0 } });
    const { ctx } = pt;
    const crowd: Person[] = [];
    for (let i = 0; i < 40; i++) crowd.push(ctx.people.spawn({ kind: 'manifestant', x: C.x - 5 + (i % 8) * 1.4, z: C.z - 4 + Math.floor(i / 8) * 1.8 }));
    const kettles: { id: number; closed: boolean; inside: number }[] = [];
    ctx.events.onAny(KETTLE_EVENT, (e) => kettles.push({ ...(e as { id: number; closed: boolean; inside: number }) }));
    // quatre sections, une par rue, à 40 m du carrefour, tournées vers la foule
    const posts = [
      { x: 0, z: C.z - 40, h: 0, name: 'NORD' }, { x: 0, z: C.z + 40, h: Math.PI, name: 'SUD' },
      { x: 40, z: C.z, h: -Math.PI / 2, name: 'EST' }, { x: -40, z: C.z, h: Math.PI / 2, name: 'OUEST' },
    ];
    const ids: number[] = [];
    for (const p of posts) {
      const fx = Math.sin(p.h);
      const fz = Math.cos(p.h);
      const s = pt.units.createSection({ x: p.x - fx * 15, z: p.z - fz * 15, heading: p.h, vehicles: false, callsign: p.name });
      ctx.squads.issue(s.squad.id, { type: 'tenir', x: p.x, z: p.z, heading: p.h, width: 0 });
      ids.push(s.squad.id);
    }
    const api = ctx.require<BarragesApi>(POLICE_BARRAGES_SERVICE);
    pt.run(120, 1, () => api.kettles.some((k) => k.closed));
    pt.step(4);
    console.log('barrages :', api.list.map((b) => `${b.squadId} ${b.state} ${b.covered.toFixed(2)} ${b.street}`).join(' | '));
    const k = api.kettles.find((q) => q.closed);
    console.log('nasse :', k ? `${k.place} (${k.x.toFixed(0)}, ${k.z.toFixed(0)}) r ${k.radius.toFixed(0)}, ${k.inside} personnes, issues : ${k.exits.map((e) => `${e.street} ${e.mode} ${e.squadId}`).join(', ')}` : 'aucune');
    expect(api.list.filter((b) => ids.includes(b.squadId) && b.state === 'en_place').length).toBe(4);
    expect(k).toBeDefined();
    expect(k!.inside).toBeGreaterThanOrEqual(36);
    expect(k!.inside).toBeLessThanOrEqual(40);
    expect(k!.exits.length).toBeGreaterThanOrEqual(4);
    expect(k!.exits.every((e) => e.held && e.mode === 'ferme' && ids.includes(e.squadId))).toBe(true);
    expect(kettles.some((e) => e.closed && e.id === k!.id)).toBe(true);
    expect(ctx.radio.log.some((m) => m.channel === 'commandement' && /^Nasse fermée.*environ .* personnes/.test(m.text))).toBe(true);
    // ni la foule ni les unités : personne n'est sorti
    for (const p of crowd) expect(Math.hypot(p.x - C.x, p.z - C.z)).toBeLessThan(40);

    // l'unité de l'est filtre : son issue devient filtrante, la nasse reste tenue
    const east = ids[2]!;
    ctx.squads.issue(east, { type: 'filtrer', x: posts[2]!.x, z: posts[2]!.z, heading: posts[2]!.h, width: 0 });
    pt.run(90, 1, () => api.list.find((b) => b.squadId === east)?.state === 'en_place');
    pt.step(6);
    const k2 = api.kettles.find((q) => Math.hypot(q.x - C.x, q.z - C.z) < 30);
    console.log('après filtrage :', k2 ? `${k2.closed ? 'fermée' : 'ouverte'}, issues : ${k2.exits.map((e) => `${e.street} ${e.mode} ${e.squadId}`).join(', ')}` : 'aucune', '|', JSON.stringify(api.list.find((b) => b.squadId === east)));
    expect(api.list.find((b) => b.squadId === east)?.mode).toBe('filtrant');
    expect(k2).toBeDefined();
    expect(k2!.exits.some((e) => e.squadId === east && e.mode === 'filtrant')).toBe(true);
    // chacun tente de partir par la rue la plus proche de lui : seuls ceux de l'est sortent
    const dirs = crowd.map((_, i) => posts[i % 4]!);
    pt.run(150, 0.5, () => {
      crowd.forEach((p, i) => {
        const d = dirs[i]!;
        const tx = C.x + (d.x - C.x) * 2.5;
        const tz = C.z + (d.z - C.z) * 2.5;
        const l = Math.hypot(tx - p.x, tz - p.z) || 1;
        p.cmd.moveX = (tx - p.x) / l;
        p.cmd.moveZ = (tz - p.z) / l;
        p.cmd.gait = 0;
        p.cmd.faceMove = true;
      });
    });
    const out = crowd.filter((p) => Math.hypot(p.x - C.x, p.z - C.z) > 46);
    const outEast = out.filter((p) => p.x > 40);
    console.log(`sortis : ${out.length} (dont par l'est ${outEast.length})`);
    expect(outEast.length).toBeGreaterThan(0);
    expect(out.length).toBe(outEast.length);
    expect(crowd.every((p) => p.injury === 'none')).toBe(true);
  }, 300000);
});
