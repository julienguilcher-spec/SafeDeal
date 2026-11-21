// Décor dynamique — déterminisme (même graine, même émeute), remise à zéro, robustesse aux appels inattendus.
import { describe, expect, it } from 'vitest';
import type { Prop, RayHit, Shop } from '@/core/contracts';
import { makeRayHit } from '@/core/null-services';
import { mapFurniture, mapShop, startProps } from '@/sim/props/testkit';
import type { PropsRig } from '@/sim/props/testkit';

/** Une petite émeute scénarisée dans une rue d'essai ; retourne une empreinte de tout ce qui s'est passé. */
async function riot(seed: number): Promise<{ rig: PropsRig; print: string[] }> {
  const rig = await startProps({
    seed,
    session: { tension: 0.5 },
    prepare: (world) => {
      world.surface = (_x, z) => (z >= 0 && z <= 6 ? 'sidewalk' : 'road');
      const shops = ['banque', 'cafe_restaurant', 'telephonie', 'luxe', 'mode', 'supermarche'].map((c, i) => mapShop(i, c, 20 + i * 12, 0, 0, 9));
      const furniture = ['poubelle', 'conteneur', 'conteneur', 'abribus', 'kiosque', 'station_velo', 'panneau_pub', 'poubelle', 'banc']
        .map((k, i) => mapFurniture(i, k, 18 + i * 8, 4.5, 0));
      world.setTile(0, 0, furniture, shops);
    },
  });
  const { ctx } = rig;
  const a = rig.person(30, 8, { profile: 'radical' });
  const b = rig.person(60, 8, { profile: 'pilleur' });
  const movable = (): Prop[] => ctx.props.list.filter((p) => p.movable).sort((p, q) => p.x - q.x || p.z - q.z);
  rig.director.local = (x) => (x > 50 ? 0.7 : 0.2);
  rig.step(2);
  for (const p of movable().slice(0, 6)) ctx.props.push(p, 0.3, 1, 3.5, a.id);
  rig.step(3);
  const bin = ctx.props.list.filter((p) => p.kind === 'poubelle').sort((p, q) => p.x - q.x)[0];
  if (bin) rig.ext.ignite(bin, a.id);
  const shops = [...ctx.props.shops].sort((s, t) => s.x - t.x);
  for (const s of shops) ctx.props.damageShop(s, 90, 'impact', a.id);
  rig.step(5);
  for (const s of shops) {
    ctx.props.loot(s, b.id);
    ctx.props.damageShop(s, 40, 'burn', a.id);
  }
  ctx.events.emit('explosion', { kind: 'mortier', x: 40, y: 0.4, z: 3, radius: 6, sourceId: a.id });
  rig.step(60, 0.05);
  const print: string[] = [];
  for (const e of rig.log) {
    if (e.name === 'fx' || e.name === 'sfx') continue;
    const any = e as unknown as Record<string, unknown>;
    print.push(`${e.name}:${String(any.id ?? any.targetId ?? '')}:${String(any.state ?? any.closed ?? any.amount ?? '')}`);
  }
  for (const p of [...ctx.props.list].sort((p, q) => p.id - q.id)) {
    print.push(`${p.id}:${p.kind}:${p.state}:${p.x.toFixed(3)}:${p.z.toFixed(3)}:${p.hp.toFixed(2)}:${p.fuel.toFixed(2)}:${p.burning.toFixed(3)}`);
  }
  for (const s of [...ctx.props.shops].sort((s, t) => s.id - t.id)) {
    print.push(`${s.id}:${s.name}:${s.window}:${s.shutter.toFixed(3)}:${s.stock.toFixed(4)}:${s.burning.toFixed(3)}`);
  }
  return { rig, print };
}

describe('déterminisme', () => {
  it('même graine : mêmes enseignes, mêmes événements dans le même ordre, même état final ; autre graine : autre histoire', async () => {
    const first = await riot(41);
    const second = await riot(41);
    const other = await riot(42);
    expect(first.print.length).toBeGreaterThan(60);
    expect(second.print).toEqual(first.print);
    expect(other.print).not.toEqual(first.print);
    // il s'est bien passé quelque chose
    const names = new Set(first.rig.log.map((e) => e.name));
    for (const n of ['prop:spawned', 'prop:moved', 'prop:damaged', 'shop:window', 'shop:looted', 'fire:started', 'law:offense']) {
      expect(names.has(n as never), n).toBe(true);
    }
    // rejouer dans le même contexte (nouvelle session, même graine) redonne la même histoire
    await first.rig.t.start({ tension: 0.5 });
    const shopsA = first.rig.ctx.props.shops.map((s) => s.name).sort();
    const shopsB = second.rig.ctx.props.shops.map((s) => s.name).sort();
    expect(shopsA).toEqual(shopsB);
    expect(first.rig.ctx.props.shops.every((s) => s.burning === 0 && s.window !== 'broken')).toBe(true);
    expect(first.rig.ext.stats.burning).toBe(0);
    expect(first.rig.ext.stats.firesStarted).toBe(0);
  });
});

describe('remise à zéro et robustesse', () => {
  it('clear() vide tout sans casser la suite ; retraits répétés, objets étrangers et valeurs absurdes sont sans effet', async () => {
    const { rig } = await riot(43);
    const { ctx } = rig;
    expect(ctx.props.list.length).toBeGreaterThan(5);
    const old = ctx.props.list[0]!;
    const oldShop = ctx.props.shops[0]!;
    ctx.props.clear();
    expect(ctx.props.list.length).toBe(0);
    expect(ctx.props.shops.length).toBe(0);
    expect(ctx.props.get(old.id)).toBeUndefined();
    const s = rig.ext.stats;
    expect([s.props, s.shops, s.moving, s.burning, s.burningShops, s.barricades, s.tiles]).toEqual([0, 0, 0, 0, 0, 0, 0]);
    rig.step(2);
    // références périmées : aucun effet, aucune exception
    ctx.props.damage(old, 50, 'blunt', 0);
    ctx.props.push(old, 1, 0, 5, 0);
    ctx.props.tag(old, 0);
    ctx.props.damageShop(oldShop, 50, 'blunt', 0);
    expect(ctx.props.loot(oldShop, 0)).toBe(0);
    ctx.props.remove(old.id);
    ctx.props.remove(123456);
    ctx.props.removeShop(123456);
    expect(rig.ext.ignite(old, 0)).toBe(false);
    expect(rig.ext.topple(old, 1, 0, 0)).toBe(false);
    expect(rig.ext.setShutter(oldShop, true)).toBe(false);
    expect(rig.ext.propView(old)).not.toBeNull();
    expect(rig.ext.barricadeParts(old.id)).toEqual([]);
    // objets qui ne viennent pas de ce module (magasin d'un autre fournisseur) : ignorés
    const foreign = { ...old } as Prop;
    ctx.props.damage(foreign, 50, 'blunt', 0);
    ctx.props.push(foreign, 1, 0, 5, 0);
    expect(rig.ext.propView(foreign)).toBeNull();
    expect(rig.ext.shopView({ ...oldShop } as Shop)).toBeNull();
    // requêtes aux arguments absurdes
    const out: Prop[] = [];
    const hit: RayHit = makeRayHit();
    const fresh = ctx.props.spawn('poubelle', 1, 1, 0);
    expect(ctx.props.queryRadius(NaN, 0, 5, out)).toBe(0);
    expect(ctx.props.queryRadius(1, 1, -1, out)).toBe(0);
    expect(ctx.props.queryRadius(1, 1, NaN, out)).toBe(0);
    expect(ctx.props.raycast(NaN, 0, 5, 5, hit)).toBe(false);
    expect(ctx.props.raycast(0, 0, Infinity, 0, hit)).toBe(false);
    expect(ctx.props.raycast(1, 1, 1, 1, hit)).toBe(true); // segment nul dans une boîte
    expect(hit.t).toBe(0);
    expect(ctx.props.resolveCircle({ x: NaN, z: NaN }, 0.3)).toBe(false);
    ctx.props.push(fresh, 0, 0, 5, 0);
    ctx.props.push(fresh, NaN, 1, 5, 0);
    ctx.props.push(fresh, 1, 0, NaN, 0);
    expect(fresh.vx).toBe(0);
    const weird = ctx.props.spawn('poubelle', NaN, Infinity, NaN);
    expect([weird.x, weird.z, weird.heading]).toEqual([0, 0, 0]);
    const tiny = ctx.props.addShop({ category: 'autre', x: 5, z: 5, heading: 0, width: -3 });
    expect(tiny.width).toBeGreaterThan(0);
    // la tuile se repeuple à la demande
    rig.ctx.events.emit('world:tile_loaded', { tx: 0, tz: 0 });
    rig.ext.flushTiles();
    expect(ctx.props.shops.length).toBe(6 + 1);
    rig.step(2);
    // déchargement d'une tuile inconnue : sans effet
    rig.ctx.events.emit('world:tile_unloaded', { tx: 9, tz: 9 });
    expect(ctx.props.shops.length).toBe(7);
  });
});
