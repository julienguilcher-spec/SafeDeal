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
  for (const key of ['notre_dame', 'saint_eustache', 'grand_palais', 'saint_sulpice']) {
    const lm = lms.find((l) => l.key === key)!;
    const site = siteOfLandmark(lm);
    const obj = getMonument(key)!.build(site, 'haut');
    obj.updateMatrixWorld(true);
    const cells = new Map<string, { d: number; n: number; mesh: string }>();
    obj.traverse((c) => { const m = c as THREE.Mesh; if (!m.geometry) return; const p = m.geometry.getAttribute('position');
      for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y < 1.5 || y > 12) continue; const x = p.getX(i), z = p.getZ(i);
        if (pointInRing(x, z, site.footprint)) continue; const d = distToRing(x, z, site.footprint); if (d < 1.5) continue;
        const k = `${Math.round(x / 8) * 8},${Math.round(z / 8) * 8}`; const e = cells.get(k) ?? { d: 0, n: 0, mesh: c.name }; e.n++; if (d > e.d) { e.d = d; e.mesh = c.name; } cells.set(k, e); } });
    console.log(key, [...cells.entries()].sort((a, b) => b[1].d - a[1].d).slice(0, 10).map(([k, e]) => `[${k}] ${e.d.toFixed(1)} m ×${e.n} ${e.mesh.split(':')[1]}`).join(' | '));
  }
});
