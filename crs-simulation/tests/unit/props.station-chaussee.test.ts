// Mobilier de la carte posé au bord de la chaussée : une station de vélos (6 m de long) dont le CENTRE est juste hors de
// la chaussée mais dont l'emprise, tournée en travers, mord sur la voie. Avant, seul le centre était comparé à la
// chaussée : la station restait en travers de la rue (rue Saint-Paul, vers la Bastille) et les colonnes de police y
// perdaient cinq à huit minutes en détours, « bloquées/obstacle ». Toute l'emprise doit être hors de la chaussée.
import { describe, expect, it } from 'vitest';
import { mapFurniture, startProps } from '@/sim/props/testkit';

describe('mobilier de la carte : emprise hors de la chaussée', () => {
  it('une station de vélos en travers, centre au bord de la chaussée : replacée sur le trottoir (ou pas posée)', async () => {
    const rig = await startProps({ seed: 3 });
    // rue nord-sud sur x = 0, chaussée de 9 m (x de −4,5 à 4,5) ; le sol « chaussée » de la carte déborde jusqu'à 6 m
    rig.world.road = { x: 0, z: 0, heading: 0, width: 9 };
    rig.world.surface = (x) => (Math.abs(x) < 6 ? 'road' : 'sidewalk');
    // centre à 4,8 m de l'axe (hors de la chaussée de 0,3 m), grand côté en travers de la rue (cap 0 : le long de x)
    rig.world.setTile(0, 0, [mapFurniture(0, 'station_velo', 4.8, 40, 0)], []);
    rig.ctx.events.emit('world:tile_loaded', { tx: 0, tz: 0 });
    rig.ext.flushTiles();
    const st = rig.ctx.props.list.filter((p) => p.kind === 'station_velo');
    for (const p of st) {
      const c = Math.cos(p.heading), s = Math.sin(p.heading);
      for (const [lx, lz] of [[-p.halfX, -p.halfZ], [p.halfX, -p.halfZ], [p.halfX, p.halfZ], [-p.halfX, p.halfZ]] as const) {
        const x = p.x + lx * c + lz * s;
        expect(Math.abs(x), `coin de la station à x = ${x.toFixed(2)} (centre ${p.x.toFixed(2)}, ${p.z.toFixed(2)})`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});
