// exploration temporaire (sera supprimée)
import { describe, it } from 'vitest';
import { createSystems as world } from '@/world/query';
import { createSystems as people } from '@/sim/people';
import { createSystems as items } from '@/sim/items';
import { createSystems as hazards } from '@/sim/hazards';
import { createSystems as law } from '@/gameplay/law';
import { createSystems as props } from '@/sim/props';
import { createSystems as vehicles } from '@/sim/vehicles';
import { createSystems as roles } from '@/sim/roles';
import { createCrowdTest, demoConfig } from '@/sim/crowd/testkit';

describe('exploration', () => {
  it('décrit la carte', async () => {
    const t = createCrowdTest({ seed: 5, modules: [world, roles, people, items, hazards, law, props, vehicles] });
    const { ctx } = t;
    await t.start(demoConfig({ crowdSize: 0 }));
    t.run(1);
    console.log('places', ctx.world.places.map((p) => `${p.name}(${p.kind} ${p.x.toFixed(0)},${p.z.toFixed(0)} r${p.radius.toFixed(0)})`).join(' ; '));
    const names = new Map<string, string>();
    for (let e = 0; e < ctx.world.edgeCount; e++) {
      const ed = ctx.world.edge(e);
      const a = ctx.world.node(ed.a);
      const b = ctx.world.node(ed.b);
      const key = ed.name + '|' + ed.roadClass + '|w' + ed.width.toFixed(0) + '|sett' + (ed.sett ? 1 : 0) + '|ped' + (ed.pedestrianOnly ? 1 : 0);
      names.set(key, (names.get(key) ?? '') + ` [${a.x.toFixed(0)},${a.z.toFixed(0)}→${b.x.toFixed(0)},${b.z.toFixed(0)}]`);
    }
    for (const [k, v] of names) console.log(k, v.slice(0, 400));
    const want = ['pile_paves', 'barriere_chantier', 'conteneur', 'colonne_verre', 'abribus', 'panneau_pub', 'barriere_vauban', 'palette', 'echafaudage', 'kiosque'];
    for (const w of want) console.log(w, ctx.props.list.filter((p) => p.kind === w).map((p) => `${p.x.toFixed(0)},${p.z.toFixed(0)}`).join(' '));
    for (const c of ['banque', 'luxe', 'telephonie', 'bijouterie', 'agence', 'restauration_rapide']) console.log(c, ctx.props.shops.filter((s) => s.category === c).map((s) => `${s.x.toFixed(0)},${s.z.toFixed(0)}${s.shutter > 0.5 ? 'R' : ''}${s.window !== 'intact' ? s.window[0] : ''}`).join(' '));
    // carte grossière des surfaces et du mobilier (pas de 16 m)
    const rows: string[] = [];
    for (let z = -260; z <= 300; z += 12) {
      let row = '';
      for (let x = -400; x <= 400; x += 8) {
        const s = ctx.world.surfaceAt(x, z);
        row += s === 'building' ? '#' : s === 'road' ? '.' : s === 'sett' ? 's' : s === 'sidewalk' ? ',' : s === 'plaza' ? 'p' : s === 'park' ? '"' : s === 'water' ? '~' : s === 'bridge' ? '=' : s === 'quay' ? 'q' : '?';
      }
      rows.push((z + '').padStart(5) + ' ' + row);
    }
    console.log(rows.join('\n'));
    console.log('véhicules', ctx.vehicles.list.map((v) => v.kind + '@' + v.x.toFixed(0) + ',' + v.z.toFixed(0)).join(' '));
  }, 600_000);
});
