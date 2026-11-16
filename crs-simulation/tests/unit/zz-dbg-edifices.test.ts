import { it } from 'vitest';
import * as THREE from 'three';
import rawLandmarks from '../../public/data/paris/landmarks.json';
import { decodeLandmarks, type RawLandmarks } from '@/world/mapdata';
import { getMonument } from '@/world/monuments/registry';
import { siteOfLandmark } from '@/world/monuments/colliders';
import { pointInRing } from '@/world/monuments/shape2d';
function distToRing(x: number, z: number, r: ArrayLike<number>): number {
  let best = Infinity; const n = r.length >> 1;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const ax = r[2 * j], az = r[2 * j + 1], bx = r[2 * i], bz = r[2 * i + 1];
    const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
    best = Math.min(best, Math.hypot(x - ax - t * dx, z - az - t * dz));
  }
  return best;
}
it('dbg fit', () => {
  const lms = decodeLandmarks(rawLandmarks as unknown as RawLandmarks);
  for (const key of ['notre_dame','sainte_chapelle','madeleine','opera_garnier','saint_eustache','saint_sulpice','tour_saint_jacques','bourse_commerce','centre_pompidou','opera_bastille','grand_palais','petit_palais']) {
    const lm = lms.find((l) => l.key === key)!;
    const site = siteOfLandmark(lm);
    const obj = getMonument(key)!.build(site, 'haut');
    obj.updateMatrixWorld(true);
    let n = 0, out1 = 0, out3 = 0, max = 0; let where = '';
    obj.traverse((c) => { const m = c as THREE.Mesh; if (!m.geometry) return; const p = m.geometry.getAttribute('position');
      for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y < 1.5 || y > 12) continue; n++; const x = p.getX(i), z = p.getZ(i);
        if (pointInRing(x, z, site.footprint)) continue; const d = distToRing(x, z, site.footprint); if (d > 1) out1++; if (d > 3) out3++; if (d > max) { max = d; where = `${c.name} (${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)})`; } } });
    console.log(key.padEnd(20), 'sommets 1,5–12 m :', n, '| hors emprise > 1 m :', (100 * out1 / n).toFixed(1) + ' %', '| > 3 m :', (100 * out3 / n).toFixed(1) + ' %', '| max', max.toFixed(1), 'm', where);
  }
});
