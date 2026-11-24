// Décor dynamique — peuplement depuis une tuile factice, mobilier d'ambiance, déchargement, mémoire, mise en sommeil.
import { describe, expect, it } from 'vitest';
import type { MapFurnitureInfo, MapShopInfo, Prop, ShopCategory } from '@/core/contracts';
import { mapFurnitureKind, propDef } from '@/sim/props';
import { mapFurniture, mapShop, startProps } from '@/sim/props/testkit';
import type { FakeWorld, PropsRig } from '@/sim/props/testkit';

const CATEGORIES: ShopCategory[] = [
  'banque', 'luxe', 'cafe_restaurant', 'bijouterie', 'supermarche', 'telephonie', 'cafe_restaurant', 'mode',
  'alimentation', 'pharmacie', 'tabac_presse', 'cafe_restaurant', 'restauration_rapide', 'agence', 'hotel', 'autre',
];

/**
 * Une rue d'essai dans la tuile (0, 0) : façades le long de z = 100 tournées vers +z, trottoir de 5 m
 * (z de 100 à 105), chaussée au-delà. Seize boutiques de 8 m, du mobilier de carte sur le trottoir.
 */
function street(): { furniture: MapFurnitureInfo[]; shops: MapShopInfo[] } {
  const shops: MapShopInfo[] = CATEGORIES.map((c, i) => mapShop(i, c, 40 + i * 10, 100, 0, 8));
  const kinds = [
    'poubelle', 'conteneur', 'abribus', 'kiosque', 'banc', 'candelabre', 'candelabre', 'potelet', 'potelet',
    'station_velo', 'arceau_velo', 'arceau_velo', 'arceau_velo', 'colonne_verre', 'horodateur', 'boite_aux_lettres',
    'autre', 'type_que_personne_ne_connait', 'panneau_pub', 'distributeur', 'colonne_morris', 'jardiniere',
    'barriere_vauban', 'barriere_chantier', 'echafaudage', 'fontaine_wallace', 'sanisette', 'camera',
  ];
  const furniture: MapFurnitureInfo[] = kinds.map((k, i) => mapFurniture(i, k, 42 + i * 6, 104.2, i % 2 ? 0 : Math.PI));
  // une table de terrasse fournie par la carte devant le premier café (boutique n° 2, x = 60)
  furniture.push(mapFurniture(kinds.length, 'table_terrasse', 60, 101.2, 0));
  return { furniture, shops };
}

function streetSurface(world: FakeWorld): void {
  world.surface = (_x, z) => (z >= 100 && z <= 105 ? 'sidewalk' : z < 100 ? 'building' : 'road');
  world.walls.push({ minX: -500, minZ: 60, maxX: 600, maxZ: 100 }); // les immeubles
}

async function loaded(seed = 1, tune?: (rig: PropsRig) => void): Promise<PropsRig> {
  const rig = await startProps({ seed });
  streetSurface(rig.world);
  const { furniture, shops } = street();
  rig.world.setTile(0, 0, furniture, shops);
  if (tune) tune(rig);
  rig.ctx.events.emit('world:tile_loaded', { tx: 0, tz: 0 });
  rig.ext.flushTiles();
  return rig;
}

function signature(rig: PropsRig): string[] {
  return rig.ctx.props.list.map((p) => `${p.kind}@${p.x.toFixed(2)},${p.z.toFixed(2)},${p.heading.toFixed(2)}`).sort();
}

describe('peuplement depuis la carte', () => {
  it('le mobilier de la tuile devient des objets au bon gabarit ; les types inconnus restent des objets', async () => {
    const rig = await loaded(1, (r) => (r.ext.tuning.ambientDensity = 0));
    const { ctx } = rig;
    const { furniture } = street();
    expect(ctx.props.list.length).toBe(furniture.length);
    expect(rig.events('prop:spawned').length).toBe(furniture.length);
    for (const f of furniture) {
      const kind = mapFurnitureKind(f.kind);
      const p = ctx.props.list.find((q) => q.x === f.x && q.z === f.z)!;
      expect(p, f.kind).toBeDefined();
      expect(p.kind).toBe(kind);
      expect(p.heading).toBe(f.heading);
      const def = propDef(kind);
      expect(p.halfX).toBe(def.halfX);
      expect(p.height).toBe(def.height);
      expect(p.hp).toBe(def.hp);
      expect(p.movable).toBe(def.movable);
      expect(p.state).toBe('intact');
    }
    expect(mapFurnitureKind('type_que_personne_ne_connait')).toBe('autre');
    expect(mapFurnitureKind('boite_aux_lettres')).toBe('boite_aux_lettres');
    expect(mapFurnitureKind('barricade')).toBe('autre'); // la carte ne pose pas de barricade
    // gabarits réalistes
    const bus = ctx.props.list.find((p) => p.kind === 'abribus')!;
    expect(bus.halfX * 2).toBeCloseTo(4.2);
    expect(bus.movable).toBe(false);
    const bac = ctx.props.list.find((p) => p.kind === 'conteneur')!;
    expect(bac.movable).toBe(true);
    expect(bac.fuel).toBeGreaterThan(400);
    expect(ctx.props.list.find((p) => p.kind === 'candelabre')!.height).toBe(9);
    expect(rig.ext.stats.tiles).toBe(1);
    expect(rig.ext.stats.pendingTiles).toBe(0);
  });

  it('les vitrines deviennent des boutiques : enseigne fictive, stock, attrait pour les pilleurs', async () => {
    const rig = await loaded(2);
    const { ctx } = rig;
    expect(ctx.props.shops.length).toBe(CATEGORIES.length);
    const names = new Set<string>();
    for (let i = 0; i < CATEGORIES.length; i++) {
      const s = ctx.props.shops.find((q) => q.x === 40 + i * 10)!;
      expect(s.category).toBe(CATEGORIES[i]);
      expect(s.width).toBe(8);
      expect(s.heading).toBe(0);
      expect(s.window).toBe('intact');
      expect(s.shutter).toBe(0); // 14 h : tout est ouvert
      expect(s.stock).toBeGreaterThan(0.15);
      expect(s.stock).toBeLessThanOrEqual(1);
      expect(s.name.length).toBeGreaterThan(5);
      names.add(s.name);
    }
    expect(names.size).toBeGreaterThanOrEqual(CATEGORIES.length - 1);
    const by = (c: string): number => ctx.props.shops.find((s) => s.category === c)!.appeal;
    // luxe, bijouterie, téléphonie, banque en tête
    const top = Math.min(by('luxe'), by('bijouterie'), by('telephonie'), by('banque'));
    for (const c of ['mode', 'supermarche', 'alimentation', 'pharmacie', 'tabac_presse', 'restauration_rapide', 'agence', 'hotel', 'autre']) {
      expect(by(c), c).toBeLessThan(top);
    }
    expect(by('luxe')).toBeGreaterThan(0.88);
    expect(ctx.props.shops.find((s) => s.category === 'banque')!.name).toMatch(/^(Banque|Crédit|Comptoir Financier|Caisse Lutétienne) /);
  });

  it('mobilier d\'ambiance : terrasses devant les cafés, vélos en station, chaises, corbeilles, deux-roues — sur le trottoir seulement', async () => {
    const rig = await loaded(3);
    const { ctx } = rig;
    const { furniture } = street();
    const count = (kind: string): number => ctx.props.list.filter((p) => p.kind === kind).length;
    const mapCount = (kind: string): number => furniture.filter((f) => f.kind === kind).length;
    console.log(
      `[peuplement] ${ctx.props.list.length} objets pour ${furniture.length} de la carte : ` +
        ['table_terrasse', 'chaise', 'velo', 'trottinette', 'poubelle', 'conteneur', 'palette', 'barriere_chantier', 'cone', 'pile_paves']
          .map((k) => `${k} ${count(k)}`).join(', '),
    );
    // vélos accrochés à la station (jusqu'à 8 bornes) et parfois aux arceaux
    expect(count('velo')).toBeGreaterThanOrEqual(3);
    // terrasses : trois cafés-restaurants de 8 m → 4 tables par rang, deux chaises par table ; celui qui a déjà une table de carte n'en reçoit pas d'autre
    expect(count('table_terrasse')).toBeGreaterThanOrEqual(1 + 4);
    expect(count('chaise')).toBeGreaterThanOrEqual(2 * count('table_terrasse') - 4);
    const cafeWithMapTable = ctx.props.list.filter((p) => p.kind === 'table_terrasse' && Math.abs(p.x - 60) < 4.5);
    expect(cafeWithMapTable.length).toBe(1);
    // les deux chaises de la table fournie par la carte
    expect(ctx.props.list.filter((p) => p.kind === 'chaise' && Math.hypot(p.x - 60, p.z - 101.2) < 0.7).length).toBe(2);
    // tables devant les autres cafés (x = 100 et x = 150), à 1 à 3 m de la façade
    for (const cx of [100, 150]) {
      const tables = ctx.props.list.filter((p) => p.kind === 'table_terrasse' && Math.abs(p.x - cx) < 4.5);
      expect(tables.length, `terrasse en x = ${cx}`).toBeGreaterThanOrEqual(2);
      for (const t of tables) {
        expect(t.z).toBeGreaterThan(100.9);
        expect(t.z).toBeLessThan(103.2);
      }
    }
    expect(count('poubelle')).toBeGreaterThanOrEqual(mapCount('poubelle'));
    // tout ce qui a été ajouté est sur le trottoir, hors des murs, et ne chevauche rien
    const extras = ctx.props.list.filter((p) => !furniture.some((f) => f.x === p.x && f.z === p.z));
    expect(extras.length).toBeGreaterThan(20);
    const docks = ctx.props.list.filter((p) => p.kind === 'station_velo' || p.kind === 'arceau_velo');
    let docked = 0;
    for (const p of extras) {
      // les vélos accrochés à une station ou à un arceau de la carte suivent ce mobilier, où que soit le trottoir
      if (p.kind === 'velo' && docks.some((d) => Math.hypot(d.x - p.x, d.z - p.z) < 3.6)) {
        docked++;
        continue;
      }
      expect(p.z, `${p.kind} en z = ${p.z}`).toBeGreaterThanOrEqual(100);
      expect(p.z, `${p.kind} en z = ${p.z}`).toBeLessThanOrEqual(105);
    }
    expect(docked).toBeGreaterThanOrEqual(3);
    for (const p of extras) {
      for (const q of ctx.props.list) {
        if (p === q) continue;
        expect(Math.hypot(p.x - q.x, p.z - q.z), `${p.kind} sur ${q.kind}`).toBeGreaterThan(0.2);
      }
    }
    // les objets d'ambiance n'ont pas été déplacés par quelqu'un : ils ne forment pas de barricade
    rig.step(3);
    expect(rig.events('barricade:built').length).toBe(0);
  });

  it('même graine, même rue ; autre graine, autres enseignes ; densité 0 : la carte seule ; densité 2 : davantage', async () => {
    const a = await loaded(7);
    const b = await loaded(7);
    const c = await loaded(8);
    expect(signature(a)).toEqual(signature(b));
    expect(a.ctx.props.shops.map((s) => s.name)).toEqual(b.ctx.props.shops.map((s) => s.name));
    expect(a.ctx.props.shops.map((s) => s.name)).not.toEqual(c.ctx.props.shops.map((s) => s.name));
    const none = await loaded(7, (r) => (r.ext.tuning.ambientDensity = 0));
    const dense = await loaded(7, (r) => (r.ext.tuning.ambientDensity = 2));
    expect(none.ctx.props.list.length).toBe(street().furniture.length);
    expect(dense.ctx.props.list.length).toBeGreaterThan(a.ctx.props.list.length);
  });

  it('petits chantiers de voirie là où le trottoir est large : grilles, palette, cônes, parfois un tas de pavés', async () => {
    let sites = 0;
    let piles = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const rig = await startProps({ seed });
      rig.world.surface = () => 'plaza'; // une grande place : la place ne manque pas
      rig.world.setTile(0, 0, [mapFurniture(0, 'banc', 10, 10)], []);
      rig.ctx.events.emit('world:tile_loaded', { tx: 0, tz: 0 });
      rig.ext.flushTiles();
      const grids = rig.ctx.props.list.filter((p) => p.kind === 'barriere_chantier');
      expect(grids.length % 2).toBe(0); // deux grilles par chantier
      expect(grids.length).toBeGreaterThanOrEqual(2);
      expect(grids.length).toBeLessThanOrEqual(6);
      sites += grids.length / 2;
      piles += rig.ctx.props.list.filter((p) => p.kind === 'pile_paves').length;
      expect(rig.ctx.props.list.filter((p) => p.kind === 'palette').length).toBe(grids.length / 2);
      expect(rig.ctx.props.list.filter((p) => p.kind === 'cone').length).toBe((grids.length / 2) * 3);
      // les deux grilles d'un chantier sont parallèles, à 2,2 m l'une de l'autre, dans la tuile
      const [a, b] = grids;
      expect(Math.hypot(a!.x - b!.x, a!.z - b!.z)).toBeCloseTo(2.2, 6);
      expect(a!.heading).toBe(b!.heading);
      for (const g of grids) {
        expect(g.x).toBeGreaterThan(0);
        expect(g.x).toBeLessThan(512);
      }
      // un tas de pavés de chantier est une réserve de projectiles : 60 pavés
      const pile = rig.ctx.props.list.find((p) => p.kind === 'pile_paves');
      if (pile) expect(rig.ext.propView(pile)!.yieldLeft).toBe(60);
    }
    expect(sites).toBeGreaterThanOrEqual(8);
    expect(piles).toBeGreaterThanOrEqual(2);
    expect(piles).toBeLessThan(sites);
  });

  it('une tuile vide (monde neutre des tests) ne reçoit rien', async () => {
    const rig = await startProps({ world: false });
    rig.ctx.events.emit('world:tile_loaded', { tx: 0, tz: 0 });
    rig.ctx.events.emit('world:tile_loaded', { tx: 3, tz: -2 });
    rig.step(1);
    expect(rig.ctx.props.list.length).toBe(0);
    expect(rig.ctx.props.shops.length).toBe(0);
  });

  it('tuiles déjà chargées au démarrage de la session : peuplées sans événement ; session suivante : repeuplées à neuf', async () => {
    const { furniture, shops } = street();
    const rig = await startProps({
      prepare: (world) => {
        streetSurface(world);
        world.setTile(0, 0, furniture, shops);
        world.setTile(-1, 1, [mapFurniture(0, 'banc', -100, 600)], []);
      },
    });
    const { ctx } = rig;
    expect(ctx.props.shops.length).toBe(shops.length);
    expect(ctx.props.list.length).toBeGreaterThan(furniture.length);
    expect(ctx.props.list.some((p) => p.kind === 'banc' && p.x === -100)).toBe(true);
    expect(rig.ext.stats.tiles).toBe(2);
    const first = signature(rig);
    const shop = ctx.props.shops[0]!;
    ctx.props.damageShop(shop, 1000, 'blunt', 0);
    // nouvelle session, même graine : tout est remis à neuf, à l'identique
    await rig.t.start({});
    expect(signature(rig)).toEqual(first);
    expect(ctx.props.shops.every((s) => s.window === 'intact')).toBe(true);
    expect(rig.ext.stats.windowsBroken).toBe(0);
  });

  it('réglages de mission par SessionConfig.extra.props : appliqués dès le chargement, remis à zéro à la session suivante', async () => {
    const { furniture, shops } = street();
    const rig = await startProps({
      session: { extra: { props: { ambientDensity: 0, shopkeepers: false, wakeRadius: 'beaucoup', inconnu: 3 } } },
      prepare: (world) => {
        streetSurface(world);
        world.setTile(0, 0, furniture, shops);
      },
    });
    expect(rig.ext.tuning.ambientDensity).toBe(0);
    expect(rig.ext.tuning.shopkeepers).toBe(false);
    expect(rig.ext.tuning.wakeRadius).toBe(260); // valeur du mauvais type ignorée
    expect(rig.ctx.props.list.length).toBe(furniture.length); // aucun mobilier d'ambiance : la carte seule
    rig.ext.tuning.dormancy = false;
    await rig.t.start({});
    expect(rig.ext.tuning.ambientDensity).toBe(1);
    expect(rig.ext.tuning.dormancy).toBe(true);
    expect(rig.ctx.props.list.length).toBeGreaterThan(furniture.length);
  });

  it('en cours de partie, le peuplement d\'une tuile est étalé sur plusieurs pas', async () => {
    const rig = await startProps();
    streetSurface(rig.world);
    const { furniture, shops } = street();
    rig.world.setTile(0, 0, furniture, shops);
    rig.ext.tuning.populateBudget = 10;
    rig.step(0.1); // la partie tourne
    rig.ctx.events.emit('world:tile_loaded', { tx: 0, tz: 0 });
    expect(rig.ctx.props.list.length).toBe(0);
    expect(rig.ext.stats.pendingTiles).toBe(1);
    rig.t.step(1 / 30);
    expect(rig.ctx.props.shops.length).toBe(10); // dix éléments de carte par pas
    rig.t.step(1 / 30);
    expect(rig.ctx.props.shops.length).toBe(shops.length);
    expect(rig.ctx.props.list.length).toBeLessThan(furniture.length);
    rig.step(1);
    expect(rig.ext.stats.pendingTiles).toBe(0);
    const reference = await loaded(1);
    expect(signature(rig)).toEqual(signature(reference)); // même résultat que d'un coup
  });
});

describe('déchargement et mémoire des tuiles', () => {
  it('au déchargement tout est retiré ; au rechargement on retrouve ce qui avait été cassé, déplacé, pillé, enlevé', async () => {
    const rig = await loaded(5);
    const { ctx } = rig;
    const total = ctx.props.list.length;
    const before = signature(rig);
    const shop = ctx.props.shops.find((s) => s.category === 'telephonie')!;
    const other = ctx.props.shops.find((s) => s.category === 'mode')!;
    const name = shop.name;
    ctx.props.damageShop(shop, 1000, 'blunt', 0);
    ctx.props.loot(shop, 0);
    ctx.props.loot(shop, 0);
    const stock = shop.stock;
    ctx.props.tag(other, 0);
    const bin = ctx.props.list.find((p) => p.kind === 'poubelle')!;
    const binX = bin.x;
    ctx.props.push(bin, 1, 0, 6, 0);
    const bus = ctx.props.list.find((p) => p.kind === 'abribus')!;
    for (let i = 0; i < 4; i++) ctx.props.damage(bus, 18, 'blunt', 0);
    const kiosk = ctx.props.list.find((p) => p.kind === 'kiosque')!;
    ctx.props.remove(kiosk.id); // retiré avant la manifestation (mesure préventive)
    const bac = ctx.props.list.find((p) => p.kind === 'conteneur')!;
    rig.ext.ignite(bac, 0);
    rig.step(4);
    const binAfter = { x: bin.x, toppled: bin.toppled };
    expect(binAfter.x).toBeGreaterThan(binX + 1);
    // un objet créé en cours de partie n'appartient à aucune tuile
    const dyn = ctx.props.spawn('barriere_vauban', 300, 104, 0);

    rig.clearLog();
    ctx.events.emit('world:tile_unloaded', { tx: 0, tz: 0 });
    expect(ctx.props.shops.length).toBe(0);
    expect(ctx.props.list).toEqual([dyn]);
    expect(rig.events('prop:removed').length).toBe(total - 1);
    expect(rig.events('fire:out').length).toBe(1); // le conteneur en feu part avec sa tuile
    expect(rig.ext.stats.tiles).toBe(0);
    const out: Prop[] = [];
    expect(ctx.props.queryRadius(binAfter.x, 104.2, 3, out)).toBe(0);

    ctx.events.emit('world:tile_loaded', { tx: 0, tz: 0 });
    rig.ext.flushTiles();
    expect(ctx.props.list.length).toBe(total); // kiosque en moins, barrière en plus
    const shop2 = ctx.props.shops.find((s) => s.category === 'telephonie')!;
    expect(shop2.name).toBe(name);
    expect(shop2.window).toBe('broken');
    expect(shop2.stock).toBeCloseTo(stock, 9);
    expect(ctx.props.shops.find((s) => s.category === 'mode')!.window).toBe('tagged');
    expect(ctx.props.shops.find((s) => s.category === 'luxe')!.window).toBe('intact');
    const bin2 = ctx.props.list.find((p) => p.kind === 'poubelle' && Math.abs(p.x - binAfter.x) < 1e-6)!;
    expect(bin2).toBeDefined();
    expect(bin2.toppled).toBe(binAfter.toppled);
    expect(bin2.height).toBeCloseTo(0.44, 6);
    expect(ctx.props.queryRadius(binAfter.x, bin2.z, 0.6, out)).toBeGreaterThanOrEqual(1);
    const bus2 = ctx.props.list.find((p) => p.kind === 'abribus')!;
    expect(bus2.state).toBe('damaged');
    expect(rig.ext.propView(bus2)!.panesLeft).toBe(2);
    expect(ctx.props.list.some((p) => p.kind === 'kiosque')).toBe(false);
    const bac2 = ctx.props.list.find((p) => p.kind === 'conteneur' && p.x === bac.x)!;
    expect(bac2.state).toBe('damaged'); // il brûlait : on le retrouve éteint, abîmé
    expect(bac2.burning).toBe(0);
    // tout le reste est identique à la première fois
    const after = signature(rig);
    const same = after.filter((s) => before.includes(s)).length;
    expect(same).toBeGreaterThanOrEqual(total - 3);
  });
});

describe('mise en sommeil', () => {
  it('loin de toute personne les objets dorment (ni collision ni requête) ; ils se réveillent quand on approche', async () => {
    const rig = await startProps();
    const { ctx } = rig;
    const near = ctx.props.spawn('poubelle', 5, 0, 0);
    const mid = ctx.props.spawn('poubelle', 100, 0, 0); // cellule voisine de celle d'une personne
    const far = ctx.props.spawn('poubelle', 900, 0, 0);
    const farShop = ctx.props.addShop({ category: 'mode', x: 900, z: 10, heading: 0, width: 6 });
    // personne nulle part : tout reste éveillé
    rig.step(2);
    expect([near.dormant, mid.dormant, far.dormant, farShop.dormant]).toEqual([false, false, false, false]);
    const someone = rig.person(0, 0);
    rig.step(2);
    expect([near.dormant, mid.dormant, far.dormant, farShop.dormant]).toEqual([false, false, true, true]);
    expect(rig.ext.stats.awake).toBe(2);
    const out: Prop[] = [];
    expect(ctx.props.queryRadius(900, 0, 2, out)).toBe(0);
    expect(ctx.props.resolveCircle({ x: 900.3, z: 0 }, 0.28)).toBe(false);
    expect(ctx.props.list).toContain(far); // toujours dans la liste, pour le rendu qui lit `dormant`
    // quelqu'un arrive
    const other = rig.person(880, 0);
    rig.step(2);
    expect(far.dormant).toBe(false);
    expect(farShop.dormant).toBe(false);
    expect(ctx.props.resolveCircle({ x: 900.3, z: 0 }, 0.28)).toBe(true);
    // il repart ; mais un objet en feu reste éveillé jusqu'au bout
    rig.ext.ignite(far, 0);
    other.x = 0;
    rig.step(3);
    expect(far.dormant).toBe(false);
    rig.ext.extinguish(far, 0);
    rig.step(2);
    expect(far.dormant).toBe(true);
    // une personne endormie (hors zone simulée) ne réveille rien ; le joueur réveille dans un large rayon
    other.x = 880;
    other.dormant = true;
    rig.step(2);
    expect(far.dormant).toBe(true);
    ctx.player.possess(someone.id);
    someone.x = 700;
    rig.step(2);
    expect(far.dormant).toBe(false); // à 200 m du joueur : dans le rayon d'éveil de 260 m
    expect(near.dormant).toBe(true);
    // réglage : sommeil désactivé
    rig.ext.tuning.dormancy = false;
    rig.step(2);
    expect(near.dormant).toBe(false);
    // un coup réveille aussitôt un objet endormi
    rig.ext.tuning.dormancy = true;
    rig.step(2);
    expect(near.dormant).toBe(true);
    ctx.props.damage(near, 1, 'blunt', 0);
    expect(near.dormant).toBe(false);
  });
});
