// Salle de commandement : des automobilistes bloqués les uns après les autres dans le même secteur (place de la
// Concorde, la colonne de la compagnie et la foule en travers des voies) — CENTRAL ne répète pas « URGENT. Automobiliste
// bloqué… » toutes les dix secondes sur le réseau du commandement (le texte change avec la rue : l'anti-répétition de la
// radio ne le reconnaissait pas). Une seule annonce par nature d'incident et par secteur pendant deux minutes ; un agent
// à terre ou un blessé est toujours annoncé.
import { describe, expect, it } from 'vitest';
import { createSystems as world } from '@/world/query';
import { createSystems as people } from '@/sim/people';
import { createSystems as items } from '@/sim/items';
import { createSystems as hazards } from '@/sim/hazards';
import { createSystems as law } from '@/gameplay/law';
import { createSystems as props } from '@/sim/props';
import { createSystems as vehicles } from '@/sim/vehicles';
import { createSystems as roles } from '@/sim/roles';
import { createSystems as radio } from '@/gameplay/radio';
import { createSystems as incidentsModule } from '@/gameplay/incidents';
import { startIncidents } from '@/gameplay/incidents/testkit';

const MODULES = [world, people, items, hazards, law, props, vehicles, roles, radio, incidentsModule];
const CONFIG = { mode: 'test' as const, x: 0, z: -230, extra: { props: { ambientDensity: 0 } } };

describe('incidents — pas de rafale d’annonces de la salle', () => {
  it('six automobilistes bloqués en trois minutes dans un même secteur : une annonce, pas six', async () => {
    const rig = await startIncidents(MODULES, CONFIG);
    const { ctx } = rig;
    for (let i = 0; i < 6; i++) {
      const p = rig.roadPoint(0, -230, 60);
      const v = ctx.vehicles.spawn('voiture', p.x, p.z, 0);
      ctx.events.emitAny('traffic:motorist', { vehicleId: v.id, state: 'bloque', x: v.x, z: v.z });
      rig.step(30);
    }
    rig.step(30);
    const opened = rig.records.all.filter((r) => r.kind === 'automobiliste_bloque').length;
    const said = ctx.radio.log.filter((m) => m.from === 'CENTRAL' && /utomobiliste/.test(m.text) && /URGENT/.test(m.text));
    console.log(`incidents ${opened}, annonces urgentes ${said.length}\n${said.map((m) => `${m.t.toFixed(0)} ${m.text}`).join('\n')}`);
    expect(opened).toBeGreaterThanOrEqual(5);
    expect(said.length).toBeGreaterThan(0);
    expect(said.length).toBeLessThanOrEqual(2);
  }, 120000);
});
